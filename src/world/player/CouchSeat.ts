import * as THREE from "three";

const helper = (object: THREE.Object3D) =>
  /^(COL_|ZONE_|INTERACT_|SEAT_|LOOK_|CAM_|ANCHOR_|NPC_|ANIMATED_|STATIC_BATCH_|STATIC_INSTANCE_|HOUSE_BEAM_BATCH_)/.test(object.name) ||
  object.userData.portfolioHelper;
const visualMesh = (object: THREE.Object3D): object is THREE.Mesh =>
  object instanceof THREE.Mesh && !(object instanceof THREE.SkinnedMesh) &&
  !(object instanceof THREE.InstancedMesh) && !(object instanceof THREE.BatchedMesh);

type CouchSurface = {
  points: THREE.Vector3[];
  bounds: THREE.Box3;
  heightAt: (point: THREE.Vector3) => number | undefined;
};
const surfaces = new WeakMap<THREE.Object3D, CouchSurface>();

/** A small X/Z index avoids repeated full-mesh raycasts through soft cushions. */
function compileSurface(couch: THREE.Object3D): CouchSurface | undefined {
  const points: THREE.Vector3[] = [], bounds = new THREE.Box3();
  const parts: { mesh: THREE.Mesh; vertices: THREE.Vector3[] }[] = [];
  const visit = (object: THREE.Object3D): void => {
    if (!object.visible || helper(object)) return;
    if (visualMesh(object)) {
      const positions = object.geometry.getAttribute("position"), vertices: THREE.Vector3[] = [];
      if (positions) for (let i = 0; i < positions.count; i++) {
        const point = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld);
        vertices.push(point); points.push(point); bounds.expandByPoint(point);
      }
      parts.push({ mesh: object, vertices });
    }
    for (const child of object.children) visit(child);
  };
  visit(couch);
  if (bounds.isEmpty() || ![...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)) return undefined;
  const size = bounds.getSize(new THREE.Vector3());
  if (size.x < 1e-6 || size.z < 1e-6) return undefined;
  type Triangle = { a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3; denominator: number };
  const grid: Triangle[][] = Array.from({ length: 32 * 32 }, () => []);
  const column = (x: number) => Math.min(31, Math.max(0, Math.floor((x - bounds.min.x) / size.x * 32)));
  const row = (z: number) => Math.min(31, Math.max(0, Math.floor((z - bounds.min.z) / size.z * 32)));
  for (const { mesh, vertices } of parts) {
    const index = mesh.geometry.getIndex(), count = index?.count ?? vertices.length;
    for (let i = 0; i + 2 < count; i += 3) {
      const a = vertices[index?.getX(i) ?? i], b = vertices[index?.getX(i + 1) ?? i + 1], c = vertices[index?.getX(i + 2) ?? i + 2];
      const normal = b.clone().sub(a).cross(c.clone().sub(a));
      if (Math.abs(normal.y) < normal.length() * 0.5) continue;
      const denominator = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
      if (Math.abs(denominator) < 1e-12) continue;
      const triangle = { a, b, c, denominator };
      for (let z = row(Math.min(a.z, b.z, c.z)); z <= row(Math.max(a.z, b.z, c.z)); z++) {
        for (let x = column(Math.min(a.x, b.x, c.x)); x <= column(Math.max(a.x, b.x, c.x)); x++) grid[z * 32 + x].push(triangle);
      }
    }
  }
  return { points, bounds, heightAt: point => {
    if (point.x < bounds.min.x || point.x > bounds.max.x || point.z < bounds.min.z || point.z > bounds.max.z) return undefined;
    let top = -Infinity;
    for (const { a, b, c, denominator } of grid[row(point.z) * 32 + column(point.x)]) {
      const u = ((b.z - c.z) * (point.x - c.x) + (c.x - b.x) * (point.z - c.z)) / denominator;
      const v = ((c.z - a.z) * (point.x - c.x) + (a.x - c.x) * (point.z - c.z)) / denominator;
      const w = 1 - u - v;
      if (u >= -1e-7 && v >= -1e-7 && w >= -1e-7) top = Math.max(top, u * a.y + v * b.y + w * c.y);
    }
    return Number.isFinite(top) ? top : undefined;
  } };
}

/** Blender couches can be separate sibling meshes, with only the frame tagged.
 * Build a CPU-only view of touching furniture parts; never reparent source meshes
 * or add these wrappers to the rendered scene. Original batch-hidden meshes are
 * deliberately included: their matrices/geometry still describe the visible prop.
 */
export function createCouchSupport(house: THREE.Object3D, target: THREE.Object3D): THREE.Group {
  house.updateWorldMatrix(true, true);
  const selected = new Set<THREE.Mesh>(), seed = new THREE.Box3();
  const collect = (object: THREE.Object3D, output: THREE.Mesh[]): void => {
    if (helper(object)) return;
    if (visualMesh(object)) output.push(object);
    else if (object instanceof THREE.Mesh) return;
    for (const child of object.children) collect(child, output);
  };
  const initial: THREE.Mesh[] = [];
  collect(target, initial);
  const box = (mesh: THREE.Mesh): THREE.Box3 => {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    return mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld);
  };
  for (const mesh of initial) { selected.add(mesh); seed.union(box(mesh)); }
  if (!seed.isEmpty()) {
    const size = seed.getSize(new THREE.Vector3()), span = Math.max(size.x, size.z);
    const tolerance = Math.max(0.015, span * 0.015), ceiling = seed.min.y + Math.max(1.3, span * 0.9);
    const all: THREE.Mesh[] = [];
    collect(house, all);
    const candidates = all.filter(mesh => !selected.has(mesh)).map(mesh => ({ mesh, bounds: box(mesh) }))
      .filter(({ bounds }) => {
        const extent = bounds.getSize(new THREE.Vector3());
        return bounds.max.y <= ceiling && bounds.min.y >= seed.min.y - span * 0.4 &&
          Math.max(extent.x, extent.z) <= span * 2.2 && extent.y <= Math.max(1.3, span);
      });
    const connected = initial.map(box), assembly = seed.clone();
    for (let index = 0; index < connected.length && connected.length < 64; index++) {
      const near = connected[index].clone().expandByScalar(tolerance);
      for (const candidate of candidates) {
        if (selected.has(candidate.mesh) || !near.intersectsBox(candidate.bounds)) continue;
        const combined = assembly.clone().union(candidate.bounds).getSize(new THREE.Vector3());
        if (Math.max(combined.x, combined.z) > span * 2.2) continue;
        selected.add(candidate.mesh); connected.push(candidate.bounds); assembly.union(candidate.bounds);
      }
    }
  }
  const support = new THREE.Group();
  support.name = "COUCH_SEAT_SUPPORT";
  for (const source of selected) {
    const mesh = new THREE.Mesh(source.geometry, source.material);
    mesh.name = source.name;
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(source.matrixWorld);
    support.add(mesh);
  }
  support.updateMatrixWorld(true);
  const compiled = compileSurface(support);
  if (compiled) surfaces.set(support, compiled); // Prepared behind the house entry cover.
  return support;
}

/** One-time seating fit. No rays or vertex scans run while the player is seated. */
export function fitCouchSeat(
  couch: THREE.Object3D, authoredSeat: THREE.Vector3, authoredForward: THREE.Vector3, thighLength: number,
): { seat: THREE.Vector3; forward: THREE.Vector3 } | undefined {
  couch.updateWorldMatrix(true, true);
  const compiled = surfaces.get(couch) ?? compileSurface(couch);
  if (!compiled || !Number.isFinite(thighLength) || thighLength < 0.01) return undefined;
  const { points, bounds, heightAt: surface } = compiled;

  const seat = authoredSeat.clone(), forward = authoredForward.clone();
  const heightTolerance = Math.max(0.04, thighLength * 0.3);
  let height = surface(seat);
  // A marker made from an isolated frame can be below the cushions or on an
  // arm. Recover the central cushion surface from the complete assembly.
  if (height === undefined || Math.abs(height - seat.y) > Math.max(0.18, thighLength * 0.55)) {
    const center = bounds.getCenter(new THREE.Vector3()), centralHeight = surface(center);
    if (centralHeight === undefined || centralHeight > bounds.max.y - thighLength * 0.45) return undefined;
    seat.x = center.x; seat.z = center.z; height = centralHeight;
  }
  seat.y = height;

  // A generated LOOK marker can point toward the fireplace through a sofa arm.
  // A broad, raised back identifies the open side. Ambiguous shapes keep LOOK.
  const upper = points.filter(point => point.y > seat.y + thighLength * 0.45);
  if (upper.length >= 8) {
    const center = upper.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(upper.length);
    let xx = 0, xz = 0, zz = 0;
    for (const point of upper) {
      const x = point.x - center.x, z = point.z - center.z;
      xx += x * x; xz += x * z; zz += z * z;
    }
    const spread = Math.hypot(xx - zz, 2 * xz);
    if (xx + zz + spread > 2.5 * Math.max(1e-8, xx + zz - spread)) {
      const angle = Math.atan2(2 * xz, xx - zz) / 2;
      const open = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
      const back = center.clone().sub(seat).dot(open);
      if (Math.abs(back) > thighLength * 0.15) {
        if (back > 0) open.negate();
        if (forward.dot(open) < Math.SQRT1_2) forward.copy(open);
      }
    }
  }

  const lateral = new THREE.Vector3(forward.z, 0, -forward.x);
  const step = Math.max(0.015, thighLength / 8), limit = bounds.getSize(new THREE.Vector3()).length() + step;
  let edge = 0;
  // Both calves must clear the cushion, not just its centerline.
  for (const offset of [-0.26, 0, 0.26]) {
    const origin = seat.clone().addScaledVector(lateral, offset * thighLength);
    const initial = surface(origin);
    if (initial === undefined || Math.abs(initial - height) > heightTolerance) return undefined;
    let inside = 0, outside: number | undefined;
    for (let distance = step, samples = 0; distance <= limit && samples < 256; distance += step, samples++) {
      const y = surface(origin.clone().addScaledVector(forward, distance));
      if (y !== undefined && y > height + heightTolerance) return undefined; // An arm/back blocks this direction.
      if (y === undefined || y < height - heightTolerance) { outside = distance; break; }
      inside = distance;
    }
    if (outside === undefined) return undefined;
    let farEdge: number = outside;
    for (let i = 0; i < 7; i++) {
      const middle = (inside + farEdge) / 2;
      const y = surface(origin.clone().addScaledVector(forward, middle));
      if (y !== undefined && Math.abs(y - height) <= heightTolerance) inside = middle;
      else farEdge = middle;
    }
    edge = Math.max(edge, farEdge);
  }
  // Leave space for the calf mesh beyond the knee joint, while the pelvis and
  // upper thighs remain supported on the cushion.
  const advance = Math.max(0, edge + thighLength * 0.3 - thighLength * 0.98);
  seat.addScaledVector(forward, advance);
  const fittedHeight = surface(seat);
  if (fittedHeight === undefined || Math.abs(fittedHeight - height) > heightTolerance) return undefined;
  seat.y = fittedHeight;
  return { seat, forward };
}
