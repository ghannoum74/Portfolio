import * as THREE from "three";

/** Find the downward-facing outlet above the basin in the existing sink mesh. */
function faucetOutlet(sink: THREE.Object3D): { position: THREE.Vector3; radius: number } | undefined {
  sink.updateWorldMatrix(true, true);
  const inverse = sink.matrixWorld.clone().invert();
  const meshes: THREE.Mesh[] = [];
  const bounds = new THREE.Box3();
  const relative = new THREE.Matrix4();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const edge = new THREE.Vector3(), normal = new THREE.Vector3();
  sink.traverse(object => {
    if (!(object instanceof THREE.Mesh) || object.name.startsWith("COL_") ||
        !object.geometry.getAttribute("position")) return;
    meshes.push(object);
    relative.multiplyMatrices(inverse, object.matrixWorld);
    const positions = object.geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) bounds.expandByPoint(a.fromBufferAttribute(positions, i).applyMatrix4(relative));
  });
  if (bounds.isEmpty()) return;
  const tolerance = Math.max(1e-7, (bounds.max.y - bounds.min.y) * 1e-5);
  const center = new THREE.Vector3(), faceBounds = new THREE.Box3();
  let highest = -Infinity, area = 0;
  for (const mesh of meshes) {
    relative.multiplyMatrices(inverse, mesh.matrixWorld);
    const orientation = Math.sign(relative.determinant());
    const positions = mesh.geometry.getAttribute("position"), indices = mesh.geometry.index;
    const count = indices?.count ?? positions.count;
    for (let i = 0; i < count; i += 3) {
      a.fromBufferAttribute(positions, indices ? indices.getX(i) : i).applyMatrix4(relative);
      b.fromBufferAttribute(positions, indices ? indices.getX(i + 1) : i + 1).applyMatrix4(relative);
      c.fromBufferAttribute(positions, indices ? indices.getX(i + 2) : i + 2).applyMatrix4(relative);
      normal.subVectors(b, a).cross(edge.subVectors(c, a)).multiplyScalar(orientation);
      const weight = normal.length();
      // The outlet's rim/inner cap faces down; the arch and basin walls do not.
      if (!weight || normal.y / weight > -0.999 ||
          Math.max(a.y, b.y, c.y) - Math.min(a.y, b.y, c.y) > tolerance) continue;
      const y = (a.y + b.y + c.y) / 3;
      if (y > highest + tolerance) { highest = y; area = 0; center.set(0, 0, 0); faceBounds.makeEmpty(); }
      if (Math.abs(y - highest) > tolerance) continue;
      center.addScaledVector(a, weight / 3).addScaledVector(b, weight / 3).addScaledVector(c, weight / 3);
      faceBounds.expandByPoint(a).expandByPoint(b).expandByPoint(c);
      area += weight;
    }
  }
  // A plain cabinet/box is not a faucet. Do not invent a stream at its center.
  if (!area || highest < bounds.min.y + (bounds.max.y - bounds.min.y) * 0.7) return;
  center.divideScalar(area).applyMatrix4(sink.matrixWorld);
  const size = faceBounds.getSize(new THREE.Vector3());
  const scale = new THREE.Vector3().setFromMatrixScale(sink.matrixWorld);
  return { position: center, radius: Math.min(size.x * scale.x, size.z * scale.z) * 0.4 };
}

/** Prepared once. The stream's origin stays at the nozzle throughout animation. */
export function createSinkWater(
  sink: THREE.Object3D, anchor: THREE.Object3D, color: number,
): THREE.Mesh | undefined {
  const outlet = faucetOutlet(sink);
  if (!outlet || outlet.radius <= 0) return;
  const bounds = new THREE.Box3().setFromObject(sink, true);
  const down = new THREE.Vector3(0, -1, 0);
  const gap = Math.max(1e-5, (bounds.max.y - bounds.min.y) * 1e-4);
  const ray = new THREE.Raycaster(outlet.position.clone().addScaledVector(down, gap), down,
    0, bounds.max.y - bounds.min.y);
  const hit = ray.intersectObject(sink, true)[0];
  if (!hit) return;
  const length = outlet.position.y - hit.point.y;
  if (length <= gap) return;
  const geometry = new THREE.CylinderGeometry(outlet.radius, outlet.radius, length, 6, 1, true);
  geometry.translate(0, -length / 2, 0);
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0,
    depthWrite: false, side: THREE.DoubleSide });
  const stream = new THREE.Mesh(geometry, material);
  stream.name = "SINK_WATER_STREAM";
  stream.visible = false;
  // Cancel the parent transform when preparing the world-vertical stream. This
  // also handles transformed or mirrored house/sink parents without moving them.
  anchor.updateWorldMatrix(true, false);
  stream.matrixAutoUpdate = false;
  stream.matrix.copy(anchor.matrixWorld).invert().multiply(new THREE.Matrix4().makeTranslation(
    outlet.position.x, outlet.position.y, outlet.position.z));
  anchor.add(stream);
  return stream;
}
