import * as THREE from "three";
import type { Interactable } from "../Interactable";

/** One accessible E-key trigger per existing physical award display object. */
export class AwardsInteraction implements Interactable {
  readonly interactionDistance = 3.2;
  readonly position = new THREE.Vector3();
  readonly highlightTarget: THREE.Object3D;

  constructor(target: THREE.Object3D, private readonly onInteract: () => void) {
    this.highlightTarget = target;
    target.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(target, true);
    if (box.isEmpty()) {
      target.getWorldPosition(this.position);
    } else {
      box.getCenter(this.position);
      // Keep the proximity anchor at a sensible player height rather than
      // at the center of a high wall-mounted picture frame.
      this.position.y = box.min.y + Math.min(0.55, box.max.y - box.min.y);
    }
  }

  getHint(): string {
    return "Explore Milestones";
  }

  interact(): void {
    this.onInteract();
  }
}
