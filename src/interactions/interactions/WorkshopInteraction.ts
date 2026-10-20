import * as THREE from "three";
import type { Interactable } from "../Interactable";

/** Registers the existing Blender weapon stand as the workshop's E-key anchor. */
export class WorkshopInteraction implements Interactable {
  readonly interactionDistance = 2.9;
  readonly position = new THREE.Vector3();
  readonly highlightTarget: THREE.Object3D;

  constructor(stand: THREE.Object3D, private readonly onInteract: () => void) {
    this.highlightTarget = stand;
    stand.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(stand, true);
    if (bounds.isEmpty()) {
      stand.getWorldPosition(this.position);
    } else {
      bounds.getCenter(this.position);
      // Interaction distance should be measured at player height, not rack top.
      this.position.y = bounds.min.y + Math.min(0.9, bounds.max.y - bounds.min.y);
    }
  }

  getHint(): string {
    return "Inspect Workshop";
  }

  interact(): void {
    this.onInteract();
  }
}
