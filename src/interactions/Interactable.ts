import * as THREE from "three";

export interface Interactable {
  position: THREE.Vector3;

  interactionDistance: number;

  getHint(): string;

  interact(): void;
}
