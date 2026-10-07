import * as THREE from "three";

import { AssetLoader } from "../../loaders/AssetLoader";
import { ASSETS } from "../../loaders/AssetManifest";
import { WorldColliders } from "../../physics/WorldColliders";
import { PhysicsWorld } from "../../physics/PhysicsWorld";

export class HouseInterior {
  public model = new THREE.Group();
  private readonly loader: AssetLoader;
  private loaded = false;

  // Keep the house physically separated from the exterior Rapier world.
  private readonly worldOffset = new THREE.Vector3(0, -30, 0);

  // interior lights
  private readonly lightGroup = new THREE.Group();
  private previousBackground: THREE.Color | THREE.Texture | null = null;
  private previousFog: THREE.Fog | THREE.FogExp2 | null = null;
  private environmentStored = false;
  private readonly interiorBackground = new THREE.Color("#d8d0c1");

  constructor(
    private readonly scene: THREE.Scene,
    loadingManager: THREE.LoadingManager,
    private readonly physics: PhysicsWorld,
  ) {
    this.loader = new AssetLoader(loadingManager);

    this.lightGroup.name = "HOUSE_INTERIOR_LIGHTS";

    this.lightGroup.visible = false;

    this.scene.add(this.lightGroup);
  }

  async load(): Promise<void> {
    if (this.loaded) {
      return;
    }

    const house = await this.loader.loadGLB(ASSETS.house);

    this.model = house.scene;

    this.model.name = "HOUSE_INTERIOR";

    this.model.position.copy(this.worldOffset);

    // hidden until the entrance is triggered
    this.model.visible = false;

    this.model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) {
        return;
      }

      if (child.name.startsWith("COL_")) {
        return;
      }

      child.castShadow = true;
      child.receiveShadow = true;
    });

    this.scene.add(this.model);

    this.model.updateMatrixWorld(true);

    const colliders = new WorldColliders(this.physics);

    colliders.createFromEnvironment(this.model);

    this.createInteriorLighting();

    this.loaded = true;

    console.log("🏠 House interior loaded");
  }

  private createInteriorLighting(): void {
    const bounds = this.getVisualBounds();
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const maxHorizontalSize = Math.max(size.x, size.z);
    const fill = new THREE.HemisphereLight(0xffead6, 0x5a4030, 0.9);
    fill.name = "HOUSE_LIGHT_FILL";

    const mainLight = new THREE.DirectionalLight(0xffd3a0, 1.5);
    mainLight.name = "HOUSE_LIGHT_MAIN";
    mainLight.position.set(
      center.x - size.x * 0.2,
      bounds.max.y + 2,
      center.z + size.z * 0.15,
    );
    mainLight.castShadow = false;
    mainLight.shadow.mapSize.set(1024, 1024);
    mainLight.shadow.bias = -0.0005;

    const mainTarget = new THREE.Object3D();
    mainTarget.name = "HOUSE_LIGHT_MAIN_TARGET";
    mainTarget.position.copy(center);
    mainLight.target = mainTarget;

    const warmLight = new THREE.PointLight(
      0xffb86c,
      30,
      maxHorizontalSize * 1.25,
      2,
    );
    warmLight.name = "HOUSE_LIGHT_WARM";
    warmLight.position.set(center.x, bounds.max.y - size.y * 0.25, center.z);
    warmLight.castShadow = false;
    this.lightGroup.add(fill, mainLight, mainTarget, warmLight);
  }

  private getVisualBounds(): THREE.Box3 {
    const bounds = new THREE.Box3();

    this.model.updateMatrixWorld(true);

    this.model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) {
        return;
      }

      /*
       * Don't allow gameplay collider
       * helpers to affect light placement.
       */
      if (child.name.startsWith("COL_")) {
        return;
      }

      child.geometry.computeBoundingBox();

      if (!child.geometry.boundingBox) {
        return;
      }

      const meshBounds = child.geometry.boundingBox.clone();

      meshBounds.applyMatrix4(child.matrixWorld);

      bounds.union(meshBounds);
    });

    if (bounds.isEmpty()) {
      throw new Error("House interior has no visible mesh bounds.");
    }

    return bounds;
  }

  private activateEnvironment(): void {
    /*
     * Save exactly what the exterior had
     * before entering.
     */
    if (!this.environmentStored) {
      this.previousBackground = this.scene.background;

      this.previousFog = this.scene.fog;

      this.environmentStored = true;
    }

    /*
     * Interior atmosphere is independent
     * from DayNightCycle.
     */
    this.scene.background = this.interiorBackground;

    this.scene.fog = null;
  }

  private restoreEnvironment(): void {
    if (!this.environmentStored) {
      return;
    }

    this.scene.background = this.previousBackground;

    this.scene.fog = this.previousFog;

    this.environmentStored = false;
  }

  show(): void {
    this.activateEnvironment();
    this.model.visible = true;
    this.lightGroup.visible = true;
  }

  hide(): void {
    this.model.visible = false;
    this.lightGroup.visible = false;
    this.restoreEnvironment();
  }

  getSpawn(): THREE.Object3D | undefined {
    return this.model.getObjectByName("SPAWN_HOUSE");
  }

  getExitDoor(): THREE.Object3D | undefined {
    return this.model.getObjectByName("INTERACT_EXIT_DOOR_01");
  }

  get isLoaded(): boolean {
    return this.loaded;
  }
}
