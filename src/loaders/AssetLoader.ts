import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export class AssetLoader {
  private gltfLoader = new GLTFLoader();

  loadGLB(path: string) {
    return this.gltfLoader.loadAsync(path);
  }
}
