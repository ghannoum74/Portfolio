import * as THREE from "three";
import { Vector3 } from "three";
import { Interactable } from "../Interactable";

export class DoorInteraction implements Interactable {
  readonly interactionDistance: number = 2;

  readonly position: Vector3 = new THREE.Vector3();

  private opened = false;

  constructor(private readonly door: THREE.Object3D) {
    door.getWorldPosition(this.position);
  }

  getHint(): string {
    return this.opened ? "Close door" : "Open door";
  }

  interact(): void {
    this.opened = !this.opened;
  }
}
