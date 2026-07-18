import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";
export class AssetLoader {
  private gltfLoader = new GLTFLoader();

  constructor(loadingManager: THREE.LoadingManager) {
    this.gltfLoader = new GLTFLoader(loadingManager);
  }

  loadGLB(path: string) {
    return this.gltfLoader.loadAsync(path);
  }
}
