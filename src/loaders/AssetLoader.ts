import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

export class AssetLoader {
  private fbxLoader = new FBXLoader();

  loadFBX(path: string) {
    return this.fbxLoader.loadAsync(path);
  }
}
