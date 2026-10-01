import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";
export class AssetLoader {
  private gltfLoader = new GLTFLoader();

  constructor(
    loadingManager: THREE.LoadingManager,
    private readonly onAssetReady?: (url: string) => void,
  ) {
    this.gltfLoader = new GLTFLoader(loadingManager);
  }

  async loadGLB(url: string) {
    const asset = await this.gltfLoader.loadAsync(url);

    // Only count the asset after loading and parsing succeed.
    this.onAssetReady?.(url);

    return asset;
  }
}
