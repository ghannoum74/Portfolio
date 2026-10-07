import * as THREE from "three";
import type { Interactable } from "../Interactable";

export class DoorInteraction implements Interactable {
  readonly interactionDistance = 2;
  readonly position = new THREE.Vector3();
  readonly highlightTarget: THREE.Object3D;

  constructor(
    interactionTarget: THREE.Object3D,
    private readonly onInteract: () => void,
    private readonly hint = "Enter",
    highlightTarget: THREE.Object3D = interactionTarget,
  ) {
    this.highlightTarget = highlightTarget;

    interactionTarget.getWorldPosition(this.position);
  }

  getHint(): string {
    return this.hint;
  }

  interact(): void {
    this.onInteract();
  }
}
