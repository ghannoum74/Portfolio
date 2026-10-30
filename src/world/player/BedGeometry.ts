import * as THREE from "three";

export type BedGeometry = {
  bounds: THREE.Box3;
  world: THREE.Matrix4;
  inverse: THREE.Matrix4;
  headAxis: "x" | "z";
  headSign: number;
};

/** Inspect the existing bed once, including original meshes hidden by batching. */
export function inspectBed(bed: THREE.Object3D): BedGeometry | undefined {
  bed.updateWorldMatrix(true, true);
  const world = bed.matrixWorld.clone();
  if (Math.abs(world.determinant()) < 1e-10) return;
  const inverse = world.clone().invert(), bounds = new THREE.Box3();
  const relative = new THREE.Matrix4(), point = new THREE.Vector3();
  const points: THREE.Vector3[] = [];
  const visit = (object: THREE.Object3D): void => {
    if (/^(COL_|ZONE_|INTERACT_|SEAT_|LOOK_|CAM_|ANCHOR_|STATIC_)/.test(object.name) || object.userData.portfolioHelper) return;
    if (object instanceof THREE.Mesh && !(object instanceof THREE.SkinnedMesh) && !(object instanceof THREE.InstancedMesh)) {
      const positions = object.geometry.getAttribute("position");
      if (positions) {
        relative.multiplyMatrices(inverse, object.matrixWorld);
        for (let i = 0; i < positions.count; i++) {
          point.fromBufferAttribute(positions, i).applyMatrix4(relative);
          bounds.expandByPoint(point); points.push(point.clone());
        }
      }
    }
    for (const child of object.children) visit(child);
  };
  visit(bed);
  if (bounds.isEmpty() || ![...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)) return;
  const size = bounds.getSize(new THREE.Vector3());
  if (size.x < 0.1 || size.z < 0.1 || size.y < 0.1) return;
  const headAxis = size.x > size.z ? "x" : "z";
  const center = bounds.getCenter(new THREE.Vector3());
  // The high headboard and pillows distinguish the head end from the foot.
  let negative = 0, positive = 0;
  for (const p of points) {
    if (p.y < bounds.min.y + size.y * 0.74) continue;
    if (p[headAxis] < center[headAxis] - size[headAxis] * 0.25) negative++;
    if (p[headAxis] > center[headAxis] + size[headAxis] * 0.25) positive++;
  }
  return { bounds, world, inverse, headAxis, headSign: positive > negative ? 1 : -1 };
}

/** Select the near pillow and the long axis toward the headboard. */
export function bedHead(frame: BedGeometry, approach: THREE.Vector3): { head: THREE.Vector3; direction: THREE.Vector3 } | undefined {
  const { bounds, world, inverse, headAxis, headSign } = frame;
  const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
  const sideAxis = headAxis === "x" ? "z" : "x";
  const localApproach = approach.clone().applyMatrix4(inverse);
  const side = localApproach[sideAxis] < center[sideAxis] ? -1 : 1;
  const local = center.clone();
  local[headAxis] += headSign * size[headAxis] * 0.38;
  local[sideAxis] += side * size[sideAxis] * 0.23;
  const direction = new THREE.Vector3(); direction[headAxis] = headSign;
  direction.transformDirection(world);
  if (Math.abs(direction.y) > 0.1) return;
  direction.y = 0; direction.normalize();
  return { head: local.applyMatrix4(world), direction };
}
