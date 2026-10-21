import * as THREE from "three";
import { deinterleaveGeometry, mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const BEAM_PREFIXES = [
  "BEAM_CORNER_", "INCLINE_BEAMS_", "Flat_Beams_", "MIDDLE_BEAM_",
  "SUB_BEAM_CORNER_", "WINDOW_BAR_",
];
const RESERVED = /^(SEC_|INTERACT_|COL_|ZONE_|BOOK_|ANIMATED_)/;

export interface BeamBatchResult {
  sourceMeshes: number;
  batches: number;
  triangles: number;
}

// Only the small, static building beams are eligible. Large walls and furniture
// keep their own culling bounds; gameplay object names remain in the hierarchy.
export function batchHouseBeams(
  root: THREE.Object3D,
  animations: readonly THREE.AnimationClip[] = [],
): BeamBatchResult {
  const result = { sourceMeshes: 0, batches: 0, triangles: 0 };
  const animated = new Set(animations.flatMap(clip => clip.tracks.map(track =>
    THREE.PropertyBinding.parseTrackName(track.name).nodeName,
  )));
  root.updateWorldMatrix(true, true);
  const inverseRoot = root.matrixWorld.clone().invert();
  const groups = new Map<string, THREE.Mesh<THREE.BufferGeometry, THREE.Material>[]>();

  root.traverse(child => {
    if (!(child instanceof THREE.Mesh) || child instanceof THREE.SkinnedMesh ||
        child instanceof THREE.InstancedMesh || child instanceof THREE.BatchedMesh ||
        !BEAM_PREFIXES.some(prefix => child.name.startsWith(prefix))) return;
    const geometry = child.geometry;
    const material = child.material;
    if (Array.isArray(material) || material.transparent || !material.visible ||
        (material instanceof THREE.MeshPhysicalMaterial && material.transmission > 0) ||
        !geometry.getAttribute("position") || Object.keys(geometry.morphAttributes).length ||
        geometry.groups.length || geometry.drawRange.start !== 0 ||
        geometry.drawRange.count < (geometry.index?.count ?? geometry.getAttribute("position").count) ||
        child.matrixWorld.determinant() <= 0 || child.renderOrder !== 0 || !child.frustumCulled ||
        child.onBeforeRender !== THREE.Mesh.prototype.onBeforeRender ||
        material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) return;
    let ancestor: THREE.Object3D | null = child;
    while (ancestor) {
      if (animated.has(ancestor.name) || animated.has(ancestor.uuid)) return;
      if (ancestor !== root && (!ancestor.visible || RESERVED.test(ancestor.name) || ancestor.renderOrder !== 0)) return;
      if (ancestor === root) break;
      ancestor = ancestor.parent;
    }
    const signature = Object.keys(geometry.attributes).sort().map(name => {
      const a = geometry.getAttribute(name);
      return [name, a.itemSize, a.normalized, a.array.constructor.name].join(":");
    }).join("|");
    const key = [material.uuid, child.castShadow, child.receiveShadow, child.layers.mask,
      geometry.index !== null, signature].join(";");
    const group = groups.get(key) ?? [];
    group.push(child as THREE.Mesh<THREE.BufferGeometry, THREE.Material>);
    groups.set(key, group);
  });

  // Do not modify the hierarchy during traversal, or hide a source until its
  // complete replacement has been constructed successfully.
  for (const meshes of groups.values()) {
    if (meshes.length < 2) continue;
    const temporary: THREE.BufferGeometry[] = [];
    try {
      for (const mesh of meshes) {
        const geometry = mesh.geometry.clone();
        temporary.push(geometry);
        deinterleaveGeometry(geometry);
        geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverseRoot, mesh.matrixWorld));
      }
      const geometry = mergeGeometries(temporary);
      if (!geometry) continue;
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const first = meshes[0];
      const batch = new THREE.Mesh(geometry, first.material);
      batch.name = `HOUSE_BEAM_BATCH_${result.batches + 1}`;
      batch.castShadow = first.castShadow;
      batch.receiveShadow = first.receiveShadow;
      batch.layers.mask = first.layers.mask;
      // These meshes never move relative to the house. Its root can still move.
      batch.matrixAutoUpdate = false;
      root.add(batch);
      for (const mesh of meshes) mesh.visible = false;
      result.sourceMeshes += meshes.length;
      result.batches++;
      result.triangles += (geometry.index?.count ?? geometry.getAttribute("position").count) / 3;
    } finally {
      for (const geometry of temporary) geometry.dispose();
    }
  }
  return result;
}
