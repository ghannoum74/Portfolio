import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import * as THREE from "three";
import type { WorldTextureState } from "./Ktx2WorldTextures";
export class AssetLoader {
  private gltfLoader = new GLTFLoader();

  constructor(
    loadingManager: THREE.LoadingManager,
    private readonly onAssetReady?: (url: string) => void,
  ) {
    this.gltfLoader = new GLTFLoader(loadingManager);

    this.gltfLoader.setMeshoptDecoder(MeshoptDecoder);
  }

  async loadGLB(url: string, comparison?: {
    renderer: THREE.WebGLRenderer;
    manifest: string;
    onState: (state: WorldTextureState) => void;
  }) {
    let asset;
    if (comparison) {
      const [source, extension] = await Promise.all([
        new THREE.FileLoader(this.gltfLoader.manager).setResponseType("arraybuffer").loadAsync(url),
        import("./Ktx2WorldTextures").catch(error => ({ error })),
      ]);
      const path = THREE.LoaderUtils.extractUrlBase(url);
      if ("loadKtx2World" in extension) {
        const result = await extension.loadKtx2World(source as ArrayBuffer, this.gltfLoader,
          path, comparison.renderer, comparison.manifest);
        asset = result.asset;
        comparison.onState(result.state);
      } else {
        asset = await this.gltfLoader.parseAsync(source as ArrayBuffer, path);
        comparison.onState({ requested: true, mode: "original", reason: "KTX2 code unavailable", images: 0 });
        console.warn("[World texture compression] Using original textures:", extension.error);
      }
    } else {
      asset = await this.gltfLoader.loadAsync(url);
    }

    // Only count the asset after loading and parsing succeed.
    this.onAssetReady?.(url);

    return asset;
  }
}
