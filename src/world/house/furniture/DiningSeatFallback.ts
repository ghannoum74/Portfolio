import * as THREE from "three";
import { createCouchSupport } from "../../player/CouchSeat";
import { authoredObject, type FurnitureSeat } from "./FiresideSeat";

type DiningSeat = { model: THREE.Object3D; anchor: THREE.Object3D; seat: FurnitureSeat };
type Obstacle = { mesh: THREE.Mesh; bounds: THREE.Box3 };
type Collider = { bounds: THREE.Box3; inverse: THREE.Matrix4; padding: number };

const helper = /^(COL_|ZONE_|INTERACT_|SEAT_|LOOK_|CAM_|ANCHOR_|FURNITURE_|ANIMATED_)/;
const chairName = /^SEC_PROJECTS_Chair_1(?:\.\d+)?$/i;

function worldMarker(position: THREE.Vector3): THREE.Object3D {
  const marker = new THREE.Object3D();
  marker.position.copy(position);
  marker.updateMatrixWorld(true);
  return marker;
}

/** The source mesh can be hidden by a static batch; the support is CPU-only. */
function seatSurface(support: THREE.Object3D, bounds: THREE.Box3, forward: THREE.Vector3): THREE.Vector3 | undefined {
  const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
  const right = new THREE.Vector3(forward.z, 0, -forward.x);
  const depth = Math.abs(forward.x) * size.x + Math.abs(forward.z) * size.z;
  const width = Math.abs(right.x) * size.x + Math.abs(right.z) * size.z;
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const normal = new THREE.Vector3(), normalMatrix = new THREE.Matrix3();
  for (const front of [0, -0.16, 0.16, -0.3, 0.3]) {
    for (const side of [0, -0.14, 0.14]) {
      const start = center.clone().addScaledVector(forward, front * depth).addScaledVector(right, side * width);
      start.y = bounds.max.y + 0.25;
      ray.set(start, down);
      for (const hit of ray.intersectObject(support, true)) {
        if (!hit.face || hit.point.y < bounds.min.y + size.y * 0.18 || hit.point.y > bounds.min.y + size.y * 0.78) continue;
        normalMatrix.getNormalMatrix(hit.object.matrixWorld);
        if (normal.copy(hit.face.normal).applyNormalMatrix(normalMatrix).y > 0.45) return hit.point.clone();
      }
    }
  }
  return undefined;
}

function obstaclesAround(house: THREE.Object3D, tableBounds: THREE.Box3): { visual: Obstacle[]; colliders: Collider[] } {
  const visual: Obstacle[] = [], colliders: Collider[] = [];
  const area = tableBounds.clone().expandByScalar(5);
  house.traverse(object => {
    if (!(object instanceof THREE.Mesh) || object instanceof THREE.SkinnedMesh || object.userData.portfolioHelper) return;
    const collider = object.name.startsWith("COL_BOX_");
    if (!collider && (helper.test(object.name) || !object.visible)) return;
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    const bounds = object.geometry.boundingBox?.clone().applyMatrix4(object.matrixWorld);
    if (!bounds || bounds.isEmpty() || !bounds.intersectsBox(area)) return;
    if (collider) {
      if (Math.abs(object.matrixWorld.determinant()) < 1e-10) return;
      const scale = new THREE.Vector3();
      object.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
      const minScale = Math.min(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z));
      if (minScale < 1e-6) return;
      colliders.push({ bounds: object.geometry.boundingBox!.clone(), inverse: object.matrixWorld.clone().invert(), padding: 0.18 / minScale });
    } else visual.push({ mesh: object, bounds });
  });
  return { visual, colliders };
}

/** Choose an unobstructed side view once, during house setup. */
function cameraPosition(
  seat: THREE.Vector3, forward: THREE.Vector3, obstacles: { visual: Obstacle[]; colliders: Collider[] },
): THREE.Vector3 | undefined {
  const right = new THREE.Vector3(forward.z, 0, -forward.x);
  const target = seat.clone().add(new THREE.Vector3(0, 0.43, 0));
  const ray = new THREE.Raycaster(), direction = new THREE.Vector3(), local = new THREE.Vector3();
  for (const sideways of [1.9, -1.9, 2.2, -2.2, 1.5, -1.5, 1.1, -1.1]) {
    for (const behind of [0.6, 0, 0.95, 1.3]) {
      for (const height of [1.25, 1.55, 1.85]) {
        const candidate = seat.clone().addScaledVector(forward, -behind).addScaledVector(right, sideways);
        candidate.y += height;
        if (obstacles.colliders.some(({ bounds: box, inverse, padding }) => {
          local.copy(candidate).applyMatrix4(inverse);
          return local.x >= box.min.x - padding && local.x <= box.max.x + padding &&
            local.y >= box.min.y - padding && local.y <= box.max.y + padding &&
            local.z >= box.min.z - padding && local.z <= box.max.z + padding;
        })) continue;
        direction.copy(target).sub(candidate);
        const distance = direction.length();
        if (distance < 0.1) continue;
        ray.set(candidate, direction.divideScalar(distance));
        ray.far = distance - 0.03;
        let blocked = false;
        for (const obstacle of obstacles.visual) {
          if (ray.ray.intersectsBox(obstacle.bounds) && ray.intersectObject(obstacle.mesh, false).length) {
            blocked = true;
            break;
          }
        }
        if (!blocked) return candidate;
      }
    }
  }
  return undefined;
}

/** Recover only the known dining set when Blender markers were not exported. */
export function inferDiningSeats(house: THREE.Object3D): DiningSeat[] {
  house.updateWorldMatrix(true, true);
  const table = authoredObject(house, "Table_RoundSmall2");
  if (!table) return [];
  const tableBounds = new THREE.Box3().setFromObject(table, true);
  if (tableBounds.isEmpty()) return [];
  const tableCenter = tableBounds.getCenter(new THREE.Vector3());
  const tableSize = tableBounds.getSize(new THREE.Vector3());
  const maxDistance = Math.max(tableSize.x, tableSize.z) * 0.5 + 1.6;
  const chairs: THREE.Object3D[] = [];
  house.traverse(object => {
    const name = object.userData.portfolioAuthoringName ?? object.userData.name ?? object.name;
    if (typeof name === "string" && chairName.test(name) && !object.userData.portfolioHelper) chairs.push(object);
  });
  if (!chairs.length || chairs.length > 8) return [];
  const obstacles = obstaclesAround(house, tableBounds), result: DiningSeat[] = [];
  for (const model of chairs) {
    const bounds = new THREE.Box3().setFromObject(model, true);
    if (bounds.isEmpty()) continue;
    const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const forward = tableCenter.clone().sub(center).setY(0);
    if (size.y < 0.3 || size.y > 2.5 || Math.max(size.x, size.z) > 2 ||
      forward.length() < 0.05 || forward.length() > maxDistance) continue;
    forward.normalize();
    const support = createCouchSupport(house, model, false);
    const position = seatSurface(support, bounds, forward);
    if (!position) continue;
    const camera = cameraPosition(position, forward, obstacles);
    if (!camera) continue;
    const depth = Math.abs(forward.x) * size.x + Math.abs(forward.z) * size.z;
    const anchor = center.clone().addScaledVector(forward, -(depth * 0.5 + 0.2));
    anchor.y = bounds.min.y + 0.25;
    result.push({ model, anchor: worldMarker(anchor), seat: {
      position: worldMarker(position), look: worldMarker(position.clone().add(forward)),
      camera: worldMarker(camera), support,
    } });
  }
  return result;
}
