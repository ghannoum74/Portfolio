import * as THREE from "three";
import type { Interactable } from "../Interactable";

/** A physical E-key interaction on the existing cartographer's map table. */
export class JourneyMapInteraction implements Interactable {
  readonly interactionDistance = 3.2;
  readonly position = new THREE.Vector3();
  readonly highlightTarget: THREE.Object3D;

  constructor(table: THREE.Object3D, private readonly onInteract: () => void) {
    this.highlightTarget = table;
    table.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(table, true);
    if (bounds.isEmpty()) {
      table.getWorldPosition(this.position);
    } else {
      bounds.getCenter(this.position);
      // Player proximity, not table-top height.
      this.position.y = bounds.min.y + Math.min(0.85, bounds.max.y - bounds.min.y);
    }
  }

  getHint(): string { return "Explore My Journey"; }
  interact(): void { this.onInteract(); }
}
