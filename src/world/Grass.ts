import * as THREE from "three";
import { AssetLoader } from "../loaders/AssetLoader";

export class Grass {
  private group = new THREE.Group();
  private loader: AssetLoader;

  constructor(
    private scene: THREE.Scene,
    loadingManager: THREE.LoadingManager,
  ) {
    this.loader = new AssetLoader(loadingManager);
    this.group.name = "grass";
  }

  async load() {
    const grassAsset = await this.loader.loadGLB(
      "/assets/models/environment/grass.glb",
    );

    const grassTemplate = grassAsset.scene;

    grassTemplate.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    const grassCount = 300;

    for (let i = 0; i < grassCount; i++) {
      const grass = grassTemplate.clone(true);

      let x = THREE.MathUtils.randFloat(-49, 49);
      let z = THREE.MathUtils.randFloat(-49, 49);

      // Keep the player's starting area empty
      while (Math.sqrt(x * x + z * z) < 4) {
        x = THREE.MathUtils.randFloat(-49, 49);
        z = THREE.MathUtils.randFloat(-49, 49);
      }

      grass.position.set(x, 0, z);

      // Random direction
      grass.rotation.y = THREE.MathUtils.randFloat(0, Math.PI * 2);

      // Small size variation
      const scale = THREE.MathUtils.randFloat(0.8, 1.25);
      grass.scale.setScalar(scale);

      this.group.add(grass);
    }

    this.scene.add(this.group);
  }
}
