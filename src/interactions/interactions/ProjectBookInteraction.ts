import * as THREE from "three";
import type { Interactable } from "../Interactable";

export class ProjectBookInteraction implements Interactable {
  readonly interactionDistance = 2.6;
  readonly position = new THREE.Vector3();
  readonly highlightTarget: THREE.Object3D;

  constructor(
    anchor: THREE.Object3D,
    highlightTarget: THREE.Object3D,
    private readonly onInteract: () => void,
    private readonly hint: () => string = () => "Read Projects",
  ) {
    this.highlightTarget = highlightTarget;

    // Use world coordinates because the house is offset.
    anchor.updateWorldMatrix(true, false);
    anchor.getWorldPosition(this.position);
  }

  getHint(): string {
    return this.hint();
  }

  interact(): void {
    this.onInteract();
  }
}
