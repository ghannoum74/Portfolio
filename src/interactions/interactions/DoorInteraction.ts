import * as THREE from "three";
import type { Interactable } from "../Interactable";

export class DoorInteraction implements Interactable {
  readonly interactionDistance = 2;

  readonly position = new THREE.Vector3();

  readonly highlightTarget: THREE.Object3D;

  constructor(
    door: THREE.Object3D,
    private readonly onInteract: () => void,
  ) {
    this.highlightTarget = door;

    door.getWorldPosition(this.position);
  }

  getHint(): string {
    return "Enter";
  }

  interact(): void {
    this.onInteract();
  }
}
