import * as THREE from "three";

export class GameLoadingManager {
  public readonly instance: THREE.LoadingManager;

  constructor() {
    this.instance = new THREE.LoadingManager();
  }
}
