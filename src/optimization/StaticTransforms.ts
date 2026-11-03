import * as THREE from "three";

const DYNAMIC_NAMES =
  /^(SEC_|INTERACT_|COL_|ZONE_|BOOK_|ANIMATED_|NPC_|INTERACTION_BORDER)/;

function exclusions(
  root: THREE.Object3D,
  animations: readonly THREE.AnimationClip[],
): Set<THREE.Object3D> {
  const excluded = new Set<THREE.Object3D>();

  const shelfMarker = root.getObjectByName("INTERACT_LIBRARY_SHELF");
  const shelfName =
    typeof shelfMarker?.userData.targetObject === "string"
      ? shelfMarker.userData.targetObject
      : "Bookcase_2";
  for (const clip of animations)
    for (const track of clip.tracks) {
      const name = THREE.PropertyBinding.parseTrackName(track.name).nodeName;
      const found = THREE.PropertyBinding.findNode(root, name);
      const node = found instanceof THREE.Object3D ? found : root;

      node.traverse((child) => excluded.add(child));
    }
  root.traverse((child) => {
    if (
      (child.userData.name ?? child.name) === shelfName ||
      DYNAMIC_NAMES.test(child.name) ||
      child.userData.staticOptimization === false ||
      child instanceof THREE.SkinnedMesh ||
      child instanceof THREE.Bone ||
      child instanceof THREE.InstancedMesh ||
      child instanceof THREE.BatchedMesh ||
      (child instanceof THREE.Mesh &&
        Object.keys(child.geometry.morphAttributes).length > 0) ||
      child.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender ||
      child.onAfterRender !== THREE.Object3D.prototype.onAfterRender ||
      child.onBeforeShadow !== THREE.Object3D.prototype.onBeforeShadow ||
      child.onAfterShadow !== THREE.Object3D.prototype.onAfterShadow
    )
      child.traverse((node) => excluded.add(node));
  });
  return excluded;
}

export function freezeStaticTransforms(
  root: THREE.Object3D,
  animations: readonly THREE.AnimationClip[] = [],
  candidates?: ReadonlySet<THREE.Object3D>,
): void {
  const excluded = exclusions(root, animations);
  root.updateWorldMatrix(true, true);
  root.traverse((child) => {
    if (
      child === root ||
      (candidates && !candidates.has(child)) ||
      excluded.has(child) ||
      !child.matrixAutoUpdate ||
      child instanceof THREE.Light ||
      child instanceof THREE.Camera ||
      child instanceof THREE.Sprite ||
      child.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender
    )
      return;
    child.updateMatrix();
    child.matrixAutoUpdate = false;
  });
}
