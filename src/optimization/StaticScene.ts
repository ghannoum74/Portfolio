import * as THREE from "three";
import { deinterleaveGeometry, mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const DYNAMIC_NAMES = /^(SEC_|INTERACT_|COL_|ZONE_|BOOK_|ANIMATED_|NPC_|INTERACTION_BORDER)/;
const BATCH_NAMES = /^(HOUSE_BEAM_BATCH_|STATIC_BATCH_)/;

/** Animation and gameplay nodes retain their original hierarchy and transforms. */
function exclusions(root: THREE.Object3D, animations: readonly THREE.AnimationClip[]): Set<THREE.Object3D> {
  const excluded = new Set<THREE.Object3D>();
  for (const clip of animations) for (const track of clip.tracks) {
    const name = THREE.PropertyBinding.parseTrackName(track.name).nodeName;
    const found = THREE.PropertyBinding.findNode(root, name);
    const node = found instanceof THREE.Object3D ? found : root;
    // Unknown animation bindings are unsafe to optimize around.
    node.traverse(child => excluded.add(child));
  }
  root.traverse(child => {
    if (DYNAMIC_NAMES.test(child.name) || child.userData.staticOptimization === false || child instanceof THREE.SkinnedMesh ||
        child instanceof THREE.Bone || child instanceof THREE.InstancedMesh ||
        child instanceof THREE.BatchedMesh ||
        (child instanceof THREE.Mesh && Object.keys(child.geometry.morphAttributes).length > 0) ||
        child.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender ||
        child.onAfterRender !== THREE.Object3D.prototype.onAfterRender ||
        child.onBeforeShadow !== THREE.Object3D.prototype.onBeforeShadow ||
        child.onAfterShadow !== THREE.Object3D.prototype.onAfterShadow) child.traverse(node => excluded.add(node));
  });
  return excluded;
}

export interface StaticBatchStats {
  sourceMeshes: number;
  batches: number;
  triangles: number;
}

/** Small opaque batches retain local visibility bounds, authored materials and source names. */
export class StaticMeshBatches {
  readonly stats: StaticBatchStats = { sourceMeshes: 0, batches: 0, triangles: 0 };
  private readonly owned: { batch: THREE.Mesh; sources: THREE.Mesh[] }[] = [];
  private enabled = true;

  constructor(private readonly root: THREE.Object3D, animations: readonly THREE.AnimationClip[] = [],
    candidates?: ReadonlySet<THREE.Object3D>) {
    const excluded = exclusions(root, animations);
    root.updateWorldMatrix(true, true);
    if (root.matrixWorld.determinant() <= 0) return;
    const inverseRoot = root.matrixWorld.clone().invert();
    const buckets = new Map<string, THREE.Mesh<THREE.BufferGeometry, THREE.Material>[]>();
    const bounds = new Map<THREE.Mesh, THREE.Box3>();
    const worldBounds = new THREE.Box3(), center = new THREE.Vector3(), size = new THREE.Vector3();

    root.traverse(child => {
      if (!(child instanceof THREE.Mesh) || (candidates && !candidates.has(child)) ||
          excluded.has(child) || BATCH_NAMES.test(child.name) || child.children.length) return;
      const geometry = child.geometry, material = child.material;
      const position = geometry.getAttribute("position");
      // Baking transforms into quantized integer attributes would introduce new error.
      if (["position", "normal", "tangent"].some(name => {
        const attribute = geometry.getAttribute(name);
        return attribute && !(attribute.array instanceof Float32Array) && !(attribute.array instanceof Float64Array);
      })) return;
      if (!position || position.itemSize !== 3 || Array.isArray(material) || !material.visible || material.transparent || material.opacity !== 1 ||
          material.alphaTest > 0 || material.alphaHash || (material as THREE.MeshStandardMaterial).alphaMap ||
          (material as THREE.MeshStandardMaterial).displacementMap || (material as THREE.MeshStandardMaterial).wireframe ||
          (material as THREE.MeshPhysicalMaterial).transmission > 0 || !material.depthTest || !material.depthWrite ||
          !material.colorWrite || material.depthFunc !== THREE.LessEqualDepth || material.stencilWrite || material.polygonOffset || material.blending !== THREE.NormalBlending ||
          material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile ||
          child.onBeforeRender !== THREE.Mesh.prototype.onBeforeRender || child.onAfterRender !== THREE.Mesh.prototype.onAfterRender ||
          child.customDepthMaterial || child.customDistanceMaterial || child.renderOrder !== 0 || !child.frustumCulled ||
          child.matrixWorld.determinant() <= 0 || Object.keys(geometry.morphAttributes).length || geometry.groups.length ||
          geometry.drawRange.start !== 0 || geometry.drawRange.count < (geometry.index?.count ?? position.count)) return;
      let ancestor: THREE.Object3D | null = child;
      while (ancestor && ancestor !== root) {
        if (!ancestor.visible || ancestor.renderOrder !== 0 || excluded.has(ancestor) ||
            (candidates && !candidates.has(ancestor))) return;
        ancestor = ancestor.parent;
      }
      const count = (geometry.index?.count ?? position.count) / 3;
      if (!Number.isInteger(count) || count <= 0 || count > 4000) return;
      geometry.computeBoundingBox();
      worldBounds.copy(geometry.boundingBox!).applyMatrix4(child.matrixWorld);
      worldBounds.getSize(size);
      if (!Number.isFinite(size.lengthSq()) || Math.max(size.x, size.y, size.z) > 3) return;
      bounds.set(child, worldBounds.clone());
      worldBounds.getCenter(center);
      const signature = Object.keys(geometry.attributes).sort().map(name => {
        const attribute = geometry.getAttribute(name);
        return `${name}:${attribute.itemSize}:${attribute.normalized}:${attribute.array.constructor.name}`;
      }).join("|");
      const cell = [center.x, center.y, center.z].map(value => Math.floor(value / 3)).join(":");
      const key = [cell, material.uuid, child.castShadow, child.receiveShadow, child.layers.mask,
        geometry.index !== null, signature].join(";");
      const bucket = buckets.get(key) ?? [];
      bucket.push(child as THREE.Mesh<THREE.BufferGeometry, THREE.Material>);
      buckets.set(key, bucket);
    });

    for (const bucket of buckets.values()) {
      let group: typeof bucket = [], triangles = 0;
      const flush = () => {
        if (group.length > 1) this.merge(root, inverseRoot, group);
        group = []; triangles = 0;
      };
      for (const mesh of bucket) {
        const count = (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3;
        // Intersecting surfaces may depend on the renderer's original tie ordering.
        if (group.length >= 24 || triangles + count > 12000 ||
            group.some(other => bounds.get(other)!.intersectsBox(bounds.get(mesh)!))) flush();
        group.push(mesh); triangles += count;
      }
      flush();
    }
  }

  private merge(root: THREE.Object3D, inverseRoot: THREE.Matrix4,
    sources: THREE.Mesh<THREE.BufferGeometry, THREE.Material>[]): void {
    const temporary: THREE.BufferGeometry[] = [];
    try {
      for (const source of sources) {
        const geometry = source.geometry.clone();
        temporary.push(geometry);
        deinterleaveGeometry(geometry);
        geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverseRoot, source.matrixWorld));
      }
      const geometry = mergeGeometries(temporary, false);
      if (!geometry) return;
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      const first = sources[0], batch = new THREE.Mesh(geometry, first.material);
      batch.name = `STATIC_BATCH_${this.stats.batches + 1}`;
      batch.castShadow = first.castShadow; batch.receiveShadow = first.receiveShadow;
      batch.layers.mask = first.layers.mask;
      batch.matrixAutoUpdate = false;
      batch.raycast = () => {}; // Original named meshes remain the picking targets.
      root.add(batch);
      sources.forEach(source => { source.visible = false; });
      this.owned.push({ batch, sources });
      this.stats.batches++; this.stats.sourceMeshes += sources.length;
      this.stats.triangles += (geometry.index?.count ?? geometry.getAttribute("position").count) / 3;
    } finally {
      temporary.forEach(geometry => geometry.dispose());
    }
  }

  get isEnabled(): boolean { return this.enabled; }

  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    for (const { batch, sources } of this.owned) {
      if (enabled) this.root.add(batch);
      else batch.removeFromParent();
      sources.forEach(source => { source.visible = !enabled; });
    }
  }

  dispose(): void {
    this.setEnabled(false);
    for (const { batch, sources } of this.owned) {
      batch.removeFromParent(); batch.geometry.dispose();
      sources.forEach(source => { source.visible = true; });
    }
    this.owned.length = 0;
  }
}

type InstanceCandidate = { mesh: THREE.Mesh; matrix: THREE.Matrix4; bounds: THREE.Box3 };

/** Exact duplicate geometry can share one GPU buffer and a small local instance batch. */
export class StaticMeshInstances {
  readonly stats: StaticBatchStats = { sourceMeshes: 0, batches: 0, triangles: 0 };
  private readonly owned: { batch: THREE.InstancedMesh; sources: THREE.Mesh[] }[] = [];
  private enabled = true;

  constructor(private readonly root: THREE.Object3D, animations: readonly THREE.AnimationClip[] = [],
    candidates?: ReadonlySet<THREE.Object3D>) {
    const excluded = exclusions(root, animations);
    root.updateWorldMatrix(true, true);
    if (root.matrixWorld.determinant() <= 0) return;
    const inverseRoot = root.matrixWorld.clone().invert();
    const buckets = new Map<string, InstanceCandidate[][]>();
    const size = new THREE.Vector3(), center = new THREE.Vector3();
    const x = new THREE.Vector3(), y = new THREE.Vector3(), z = new THREE.Vector3();
    root.traverse(child => {
      if (!(child instanceof THREE.Mesh) || child instanceof THREE.InstancedMesh ||
          child instanceof THREE.BatchedMesh || (candidates && !candidates.has(child)) ||
          excluded.has(child) || BATCH_NAMES.test(child.name) || child.children.length) return;
      const geometry = child.geometry, material = child.material;
      const position = geometry.getAttribute("position");
      if (!position || position.itemSize !== 3 || Array.isArray(material) ||
          material instanceof THREE.ShaderMaterial || !material.visible || material.transparent || material.opacity !== 1 ||
          material.alphaTest > 0 || material.alphaHash || (material as THREE.MeshStandardMaterial).alphaMap ||
          (material as THREE.MeshStandardMaterial).displacementMap || (material as THREE.MeshStandardMaterial).wireframe ||
          (material as THREE.MeshPhysicalMaterial).transmission > 0 || !material.depthTest || !material.depthWrite ||
          !material.colorWrite || material.depthFunc !== THREE.LessEqualDepth || material.stencilWrite || material.polygonOffset ||
          material.blending !== THREE.NormalBlending || material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile ||
          child.customDepthMaterial || child.customDistanceMaterial || child.renderOrder !== 0 || !child.frustumCulled ||
          child.matrixWorld.determinant() <= 0 || Object.keys(geometry.morphAttributes).length || geometry.groups.length ||
          geometry instanceof THREE.InstancedBufferGeometry || geometry.drawRange.start !== 0 ||
          geometry.drawRange.count < (geometry.index?.count ?? position.count)) return;
      if (["position", "normal", "tangent"].some(name => {
        const attribute = geometry.getAttribute(name);
        return attribute && !(attribute.array instanceof Float32Array) && !(attribute.array instanceof Float64Array);
      })) return;
      let ancestor: THREE.Object3D | null = child;
      while (ancestor && ancestor !== root) {
        if (!ancestor.visible || ancestor.renderOrder !== 0 || excluded.has(ancestor) ||
            (candidates && !candidates.has(ancestor))) return;
        ancestor = ancestor.parent;
      }
      const triangles = (geometry.index?.count ?? position.count) / 3;
      if (!Number.isInteger(triangles) || triangles <= 0 || triangles > 12000) return;
      const matrix = new THREE.Matrix4().multiplyMatrices(inverseRoot, child.matrixWorld);
      // Three's instance normal transform supports TRS, not a sheared instance matrix.
      x.setFromMatrixColumn(matrix, 0).normalize(); y.setFromMatrixColumn(matrix, 1).normalize(); z.setFromMatrixColumn(matrix, 2).normalize();
      if (Math.max(Math.abs(x.dot(y)), Math.abs(x.dot(z)), Math.abs(y.dot(z))) > 1e-6) return;
      geometry.computeBoundingBox();
      const bounds = geometry.boundingBox!.clone().applyMatrix4(child.matrixWorld);
      bounds.getSize(size); bounds.getCenter(center);
      if (!Number.isFinite(size.lengthSq()) || Math.max(size.x, size.y, size.z) > 10) return;
      const signature = Object.keys(geometry.attributes).sort().map(name => {
        const a = geometry.getAttribute(name);
        return [name, a.itemSize, a.count, a.normalized, a.array.constructor.name,
          a instanceof THREE.InterleavedBufferAttribute ? `${a.offset}:${a.data.stride}` : "plain"].join(":");
      }).join("|");
      const cell = [center.x, center.y, center.z].map(value => Math.floor(value / 8)).join(":");
      const key = [cell, material.uuid, child.castShadow, child.receiveShadow, child.layers.mask,
        geometry.index?.array.constructor.name, geometry.index?.count, signature].join(";");
      const groups = buckets.get(key) ?? [];
      let group = groups.find(group => group.length < 24 && group.length * triangles + triangles <= 120000 &&
        sameGeometry(group[0].mesh.geometry, geometry) && !group.some(other => other.bounds.intersectsBox(bounds)));
      if (!group) { group = []; groups.push(group); }
      group.push({ mesh: child, matrix, bounds }); buckets.set(key, groups);
    });
    for (const groups of buckets.values()) for (const group of groups) {
      if (group.length < 2) continue;
      const first = group[0].mesh;
      const batch = new THREE.InstancedMesh(first.geometry, first.material, group.length);
      batch.name = `STATIC_INSTANCE_${this.stats.batches + 1}`;
      batch.castShadow = first.castShadow; batch.receiveShadow = first.receiveShadow;
      batch.layers.mask = first.layers.mask; batch.matrixAutoUpdate = false;
      group.forEach((source, index) => batch.setMatrixAt(index, source.matrix));
      batch.instanceMatrix.needsUpdate = true;
      batch.computeBoundingBox(); batch.computeBoundingSphere();
      batch.raycast = () => {}; // Named originals remain available to existing picking code.
      root.add(batch);
      const sources = group.map(source => source.mesh);
      sources.forEach(source => { source.visible = false; });
      this.owned.push({ batch, sources });
      this.stats.batches++; this.stats.sourceMeshes += sources.length;
      this.stats.triangles += (first.geometry.index?.count ?? first.geometry.getAttribute("position").count) / 3 * group.length;
    }
  }

  get isEnabled(): boolean { return this.enabled; }

  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    for (const { batch, sources } of this.owned) {
      if (enabled) this.root.add(batch); else batch.removeFromParent();
      sources.forEach(source => { source.visible = !enabled; });
    }
  }

  dispose(): void {
    this.setEnabled(false);
    for (const { batch } of this.owned) { batch.removeFromParent(); batch.dispose(); }
    this.owned.length = 0;
  }
}

function sameGeometry(a: THREE.BufferGeometry, b: THREE.BufferGeometry): boolean {
  if (a === b) return true;
  const arraysEqual = (a: THREE.TypedArray, b: THREE.TypedArray) => {
    if (a.constructor !== b.constructor || a.byteLength !== b.byteLength) return false;
    if (a.buffer === b.buffer && a.byteOffset === b.byteOffset) return true;
    const x = new Uint8Array(a.buffer, a.byteOffset, a.byteLength), y = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
    for (let index = 0; index < x.length; index++) if (x[index] !== y[index]) return false;
    return true;
  };
  if (!!a.index !== !!b.index || (a.index && !arraysEqual(a.index.array, b.index!.array))) return false;
  return Object.keys(a.attributes).every(name => arraysEqual(a.getAttribute(name).array, b.getAttribute(name).array));
}

/** Freeze only local TRS composition; world matrices still follow the movable root. */
export class StaticTransforms {
  private readonly frozen: THREE.Object3D[] = [];
  private enabled = true;

  constructor(root: THREE.Object3D, animations: readonly THREE.AnimationClip[] = [],
    candidates?: ReadonlySet<THREE.Object3D>) {
    const excluded = exclusions(root, animations);
    root.updateWorldMatrix(true, true);
    root.traverse(child => {
      if (child === root || (candidates && !candidates.has(child)) || excluded.has(child) || !child.matrixAutoUpdate ||
          child instanceof THREE.Light || child instanceof THREE.Camera || child instanceof THREE.Sprite ||
          child.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) return;
      child.updateMatrix();
      child.matrixAutoUpdate = false;
      this.frozen.push(child);
    });
  }

  get count(): number { return this.frozen.length; }
  get isEnabled(): boolean { return this.enabled; }

  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    for (const child of this.frozen) {
      child.updateMatrix();
      child.matrixAutoUpdate = !enabled;
    }
  }

  dispose(): void {
    this.setEnabled(false);
    this.frozen.length = 0;
  }
}
