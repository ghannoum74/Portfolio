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
  ) {
    this.highlightTarget = highlightTarget;

    // House model has a world offset; use world coordinates.
    anchor.getWorldPosition(this.position);
  }

  getHint(): string {
    return "Read projects";
  }

  interact(): void {
    this.onInteract();
  }
}
