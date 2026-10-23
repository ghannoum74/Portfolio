import * as THREE from "three";

const MATERIAL_TAG = "houseClosedSurfaceCulling";

/** Exact position welding handles the duplicated UV/normal vertices in a GLB. */
export async function isClosedOutwardSurface(geometry: THREE.BufferGeometry): Promise<boolean> {
  const position = geometry.getAttribute("position");
  const count = geometry.index?.count ?? position?.count ?? 0;
  if (!position || position.itemSize !== 3 || !count || count % 3 ||
      position.count > 1_000_000 || count > 3_000_000) return false;
  let sliceStarted = performance.now();
  const yieldIfNeeded = async () => {
    if (performance.now() - sliceStarted < 6) return;
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    sliceStarted = performance.now();
  };
  const welded = new Map<string, number>();
  const ids = new Uint32Array(position.count);
  const points: number[][] = [];
  for (let i = 0; i < position.count; i++) {
    const point = [position.getX(i), position.getY(i), position.getZ(i)];
    if (!point.every(Number.isFinite)) return false;
    const key = point.join(",");
    let id = welded.get(key);
    if (id === undefined) { id = points.length; welded.set(key, id); points.push(point); }
    ids[i] = id;
    if (i % 1024 === 0) await yieldIfNeeded();
  }
  const parent = Uint32Array.from({ length: points.length }, (_, i) => i);
  const find = (id: number) => {
    while (parent[id] !== id) { parent[id] = parent[parent[id]]; id = parent[id]; }
    return id;
  };
  const edges = new Map<number, { count: number; direction: number }>();
  const volumes = new Float64Array(points.length);
  const origin = points[0];
  for (let i = 0; i < count; i += 3) {
    const source = [0, 1, 2].map(j => geometry.index?.getX(i + j) ?? i + j);
    if (source.some(id => !Number.isInteger(id) || id < 0 || id >= position.count)) return false;
    const [a, b, c] = source.map(id => ids[id]);
    if (a === b || b === c || c === a) return false;
    const A = points[a].map((n, j) => n - origin[j]);
    const B = points[b].map((n, j) => n - origin[j]);
    const C = points[c].map((n, j) => n - origin[j]);
    volumes[a] += A[0] * (B[1] * C[2] - B[2] * C[1]) +
      A[1] * (B[2] * C[0] - B[0] * C[2]) + A[2] * (B[0] * C[1] - B[1] * C[0]);
    parent[find(b)] = find(a); parent[find(c)] = find(a);
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const key = Math.min(u, v) * points.length + Math.max(u, v);
      const edge = edges.get(key) ?? { count: 0, direction: 0 };
      edge.count++; edge.direction += u < v ? 1 : -1;
      if (edge.count > 2) return false;
      edges.set(key, edge);
    }
    if (i % 3072 === 0) await yieldIfNeeded();
  }
  for (const edge of edges.values()) if (edge.count !== 2 || edge.direction !== 0) return false;
  // Each disconnected shell must face outward. Inward cavities and flat/open
  // sheets conservatively keep their original two-sided material.
  const components = new Map<number, number>();
  for (let i = 0; i < points.length; i++) {
    const root = find(i);
    components.set(root, (components.get(root) ?? 0) + volumes[i]);
    if (i % 1024 === 0) await yieldIfNeeded();
  }
  return [...components.values()].every(volume => volume > 1e-12);
}

type Entry = { mesh: THREE.Mesh; original: THREE.Material | THREE.Material[]; prepared: THREE.Material | THREE.Material[] };

/** One-time preparation; geometry, names, transforms, textures and lights stay authored. */
export class ClosedSurfaceCulling {
  private readonly entries: Entry[] = [];
  private readonly materials = new Set<THREE.Material>();
  private enabled = false;
  private triangles = 0;

  static async create(root: THREE.Object3D, enabled: boolean, animations: readonly THREE.AnimationClip[] = []) {
    const result = new ClosedSurfaceCulling();
    const animated = new Set(animations.flatMap(clip => clip.tracks.map(track =>
      THREE.PropertyBinding.parseTrackName(track.name).nodeName)));
    const candidates: THREE.Mesh[] = [];
    root.traverse(child => {
      if (!(child instanceof THREE.Mesh) || child instanceof THREE.SkinnedMesh ||
          child instanceof THREE.InstancedMesh || child instanceof THREE.BatchedMesh ||
          child.onBeforeRender !== THREE.Mesh.prototype.onBeforeRender ||
          Object.keys(child.geometry.morphAttributes).length ||
          child.geometry.drawRange.start !== 0 ||
          child.geometry.drawRange.count < (child.geometry.index?.count ?? child.geometry.getAttribute("position")?.count ?? 0)) return;
      let ancestor: THREE.Object3D | null = child;
      while (ancestor) {
        if ((ancestor !== root && (!ancestor.visible || /^(COL_|ZONE_|BOOK_|ANIMATED_)/.test(ancestor.name))) ||
            animated.has(ancestor.name) || animated.has(ancestor.uuid)) return;
        if (ancestor === root) break;
        ancestor = ancestor.parent;
      }
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      if (Array.isArray(child.material)) {
        let covered = 0;
        for (const group of [...child.geometry.groups].sort((a, b) => a.start - b.start)) {
          if (group.start !== covered || group.count <= 0 || group.count % 3 ||
              !Number.isInteger(group.materialIndex) || group.materialIndex! < 0 || group.materialIndex! >= materials.length) return;
          covered += group.count;
        }
        if (covered !== (child.geometry.index?.count ?? child.geometry.getAttribute("position")?.count ?? 0)) return;
      }
      if (materials.some(material => !(material instanceof THREE.MeshStandardMaterial) ||
          material.transparent || material.opacity < 1 || material.alphaTest > 0 || material.alphaHash ||
          !material.depthTest || !material.depthWrite || !material.colorWrite || material.stencilWrite ||
          material.blending !== THREE.NormalBlending || material.polygonOffset ||
          (material.depthFunc !== THREE.LessEqualDepth && material.depthFunc !== THREE.LessDepth) ||
          material.alphaMap || material.displacementMap || material.wireframe ||
          material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile ||
          (material instanceof THREE.MeshPhysicalMaterial && material.transmission > 0)) ||
          !materials.some(material => material.side === THREE.DoubleSide)) return;
      candidates.push(child);
    });
    const geometryResults = new Map<THREE.BufferGeometry, boolean>();
    const clones = new Map<THREE.Material, THREE.Material>();
    try {
      for (const mesh of candidates) {
        if (!geometryResults.has(mesh.geometry)) geometryResults.set(mesh.geometry, await isClosedOutwardSurface(mesh.geometry));
        if (!geometryResults.get(mesh.geometry)) continue;
        const clone = (original: THREE.Material) => {
          if (original.side !== THREE.DoubleSide) return original;
          let material = clones.get(original);
          if (!material) {
            material = original.clone(); material.userData[MATERIAL_TAG] = true;
            clones.set(original, material); result.materials.add(material);
          }
          return material;
        };
        const original = mesh.material;
        const prepared = Array.isArray(original) ? original.map(clone) : clone(original);
        result.entries.push({ mesh, original, prepared });
        result.triangles += (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3;
        mesh.material = prepared;
      }
      result.setEnabled(enabled);
      return result;
    } catch (error) {
      result.dispose();
      throw error;
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    const materials = new Set(this.materials);
    for (const { mesh } of this.entries) {
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (material.userData[MATERIAL_TAG]) materials.add(material);
      }
    }
    for (const material of materials) {
      const side = enabled ? THREE.FrontSide : THREE.DoubleSide;
      if (material.side !== side) { material.side = side; material.needsUpdate = true; }
    }
  }

  get stats() {
    return { enabled: this.enabled, meshes: this.entries.length, triangles: this.triangles, materials: this.materials.size };
  }

  dispose(): void {
    for (const { mesh, original, prepared } of this.entries) if (mesh.material === prepared) mesh.material = original;
    for (const material of this.materials) material.dispose();
    this.entries.length = 0; this.materials.clear();
  }
}
