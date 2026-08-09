import * as THREE from "three";
import { AssetLoader } from "../loaders/AssetLoader";

export class Ground {
  public model = new THREE.Group();
  private loader: AssetLoader;

  constructor(
    private scene: THREE.Scene,
    loadingManager: THREE.LoadingManager,
  ) {
    this.loader = new AssetLoader(loadingManager);
  }

  async load(): Promise<void> {
    const ground = await this.loader.loadGLB(
      "/assets/models/environment/ground.glb",
    );

    this.model = ground.scene;

    this.model.position.set(0, 0, 0);
    // this.model.scale.set(1, 1, 1);

    this.model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) {
        return;
      }

      child.receiveShadow = true;
      child.castShadow = false;

      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];

      materials.forEach((material) => {
        if (!(material instanceof THREE.MeshStandardMaterial)) {
          return;
        }

        if (material.map) {
          material.map.wrapS = THREE.RepeatWrapping;
          material.map.wrapT = THREE.RepeatWrapping;
          material.map.repeat.set(30, 30);
          material.map.needsUpdate = true;
        }

        if (material.normalMap) {
          material.normalMap.wrapS = THREE.RepeatWrapping;
          material.normalMap.wrapT = THREE.RepeatWrapping;
          material.normalMap.repeat.set(30, 30);
          material.normalMap.needsUpdate = true;
        }

        if (material.roughnessMap) {
          material.roughnessMap.wrapS = THREE.RepeatWrapping;
          material.roughnessMap.wrapT = THREE.RepeatWrapping;
          material.roughnessMap.repeat.set(30, 30);
          material.roughnessMap.needsUpdate = true;
        }

        material.needsUpdate = true;
      });
    });

    this.scene.add(this.model);
  }
}
