import { AssetLoader } from "../loaders/AssetLoader";
import * as THREE from "three";

export class Trees {
  public model = new THREE.Group();
  private readonly loader: AssetLoader;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly loadingManager: THREE.LoadingManager,
  ) {
    this.loader = new AssetLoader(loadingManager);
  }

  async load(): Promise<void> {
    const tree = await this.loader.loadGLB(
      "/assets/models/environment/trees/tree.glb",
    );

    this.model = tree.scene;

    this.model.position.set(-6.6, 0, 6.3);

    this.model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) {
        return;
      }

      child.receiveShadow = true;
      child.castShadow = true;
    });

    console.log(this.model);
    this.scene.add(this.model);
  }
}
