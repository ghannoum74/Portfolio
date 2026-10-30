import * as THREE from "three";
import { createCouchSupport } from "../../player/CouchSeat";

export type FurnitureSeat = {
  position: THREE.Object3D;
  look: THREE.Object3D;
  camera: THREE.Object3D;
  support: THREE.Group;
};

const helper = /^(COL_|ZONE_|INTERACT_|SEAT_|LOOK_|CAM_|ANCHOR_|STATIC_|HOUSE_BEAM_BATCH_|ANIMATED_)/;

export function authoredObject(house: THREE.Object3D, name: unknown): THREE.Object3D | undefined {
  if (typeof name !== "string" || !name) return undefined;
  let found: THREE.Object3D | undefined;
  house.traverse(object => {
    if (object.userData.portfolioAuthoringName === name || object.userData.name === name) found ??= object;
  });
  return found ?? house.getObjectByName(name);
}

/** Reuse an authored fireside chair/pouf; no new furniture or scene colliders. */
export function findFiresideSeat(
  house: THREE.Object3D, marker: THREE.Object3D, fire: THREE.Vector3,
): { model: THREE.Object3D; seat: FurnitureSeat } | undefined {
  house.updateWorldMatrix(true, true);
  let model = authoredObject(house, marker.userData.seatTargetObject);
  if (!model && marker.userData.seatTargetObject) return undefined;
  if (!model) {
    const candidates: { model: THREE.Object3D; distance: number }[] = [];
    house.traverse(object => {
      const name = object.userData.portfolioAuthoringName ?? object.userData.name ?? object.name;
      if (helper.test(object.name) || object.userData.portfolioHelper || !/chair|pouf|armchair|stool/i.test(name)) return;
      for (let parent = object.parent; parent && parent !== house; parent = parent.parent) {
        if (/chair|pouf|armchair|stool/i.test(parent.userData.portfolioAuthoringName ?? parent.name)) return;
      }
      const bounds = new THREE.Box3().setFromObject(object, true), size = bounds.getSize(new THREE.Vector3());
      if (bounds.isEmpty() || size.y < 0.25 || size.y > 2.5 || Math.max(size.x, size.z) > 2.5) return;
      const center = bounds.getCenter(new THREE.Vector3());
      const distance = Math.hypot(center.x - fire.x, center.z - fire.z);
      if (distance <= 3.5) candidates.push({ model: object, distance });
    });
    candidates.sort((a, b) => a.distance - b.distance);
    model = candidates[0]?.model;
  }
  if (!model || helper.test(model.name)) return undefined;
  const bounds = new THREE.Box3().setFromObject(model, true);
  if (bounds.isEmpty()) return undefined;
  const size = bounds.getSize(new THREE.Vector3()), position = bounds.getCenter(new THREE.Vector3());
  position.y = bounds.min.y + size.y * 0.42;
  const forward = fire.clone().sub(position).setY(0);
  if (forward.lengthSq() < 0.01) return undefined;
  forward.normalize();
  const lateral = new THREE.Vector3(forward.z, 0, -forward.x);
  const worldMarker = (value: THREE.Vector3) => {
    const object = new THREE.Object3D();
    object.position.copy(value); object.updateMatrixWorld(true);
    return object;
  };
  const authored = (field: string, fallback: string) => authoredObject(house, marker.userData[field] ?? fallback);
  return { model, seat: {
    position: authored("seatObject", "SEAT_FIREPLACE") ?? worldMarker(position),
    look: authored("lookObject", "LOOK_FIREPLACE") ?? worldMarker(fire),
    camera: authored("cameraObject", "CAM_FIREPLACE") ?? worldMarker(
      position.clone().addScaledVector(forward, -1.2).addScaledVector(lateral, 1.8).add(new THREE.Vector3(0, 1.2, 0))),
    support: createCouchSupport(house, model),
  } };
}
