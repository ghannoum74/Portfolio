import * as THREE from "three";

export interface Interactable {
  position: THREE.Vector3;

  interactionDistance: number;

  /** Optional distance to an extended object instead of a single point. */
  distanceTo?(position: THREE.Vector3): number;

  highlightTarget: THREE.Object3D;

  getHint(): string;

  interact(): void;
}
