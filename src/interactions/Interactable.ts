import * as THREE from "three";

export interface Interactable {
  position: THREE.Vector3;

  interactionDistance: number;

  highlightTarget: THREE.Object3D;

  getHint(): string;

  interact(): void;
}
