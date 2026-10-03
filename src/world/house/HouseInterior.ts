import * as THREE from "three";
import { AssetLoader } from "../../loaders/AssetLoader";
import { ASSETS } from "../../loaders/AssetManifest";

export class HouseInterior {
  public model = new THREE.Group();

  private readonly loader: AssetLoader;

  private loaded = false;

  constructor(
    private readonly scene: THREE.Scene,
    loadingManager: THREE.LoadingManager,
  ) {
    this.loader = new AssetLoader(loadingManager);
  }

  async load(): Promise<void> {
    if (this.loaded) {
      return;
    }

    const house = await this.loader.loadGLB(ASSETS.house);

    this.model = house.scene;

    this.model.name = "HOUSE_INTERIOR";

    this.model.visible = false;

    this.model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) {
        return;
      }

      child.castShadow = true;
      child.receiveShadow = true;
    });

    this.scene.add(this.model);

    this.loaded = true;

    console.log("🏠 House interior loaded", this.model);
  }

  show(): void {
    this.model.visible = true;
  }

  hide(): void {
    this.model.visible = false;
  }

  getSpawn(): THREE.Object3D | undefined {
    return this.model.getObjectByName("SPAWN_HOUSE");
  }

  get isLoaded(): boolean {
    return this.loaded;
  }
}
