import * as THREE from "three";

import { AssetLoader } from "../../loaders/AssetLoader";
import { ASSETS } from "../../loaders/AssetManifest";
import { WorldColliders } from "../../physics/WorldColliders";
import { PhysicsWorld } from "../../physics/PhysicsWorld";
import { AnimatedBook3D } from "./AnimatedBook3D";

import { batchHouseBeams } from "./batchHouseBeams";

import { ClosedSurfaceCulling } from "./ClosedSurfaceCulling";
import { freezeStaticTransforms } from "../../optimization/StaticTransforms";
import { createHouseLighting } from "./HouseLighting";

export class HouseInterior {
  public model = new THREE.Group();
  private readonly loader: AssetLoader;
  private loaded = false;
  private loadPromise?: Promise<void>;

  private readonly staticObjects = new Set<THREE.Object3D>();

  private readonly worldOffset = new THREE.Vector3(0, -30, 0);

  private readonly lightGroup = new THREE.Group();
  private previousBackground: THREE.Color | THREE.Texture | null = null;
  private previousFog: THREE.Fog | THREE.FogExp2 | null = null;
  private environmentStored = false;
  private readonly interiorBackground = new THREE.Color("#d8d0c1");
  private animatedBook?: AnimatedBook3D;

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

  load(): Promise<void> {
    if (this.loaded) {
      return Promise.resolve();
    }

    this.loadPromise ??= this.loadAssets().catch((error) => {
      this.loadPromise = undefined;
      throw error;
    });

    return this.loadPromise;
  }

  private async loadAssets(): Promise<void> {
    const [house, bookAsset] = await Promise.all([
      this.loader.loadGLB(ASSETS.house),
      this.loader.loadGLB(ASSETS.bookAnimated),
    ]);

    this.model = house.scene;

    this.model.name = "HOUSE_INTERIOR";

    this.model.position.copy(this.worldOffset);

    const oldBook = this.model.getObjectByName("SEC_PROJECTS_ProjectBook");

    if (oldBook) {
      oldBook.visible = false;
    }

    this.animatedBook = new AnimatedBook3D(bookAsset);

    await this.animatedBook.initializePages();

    this.model.add(this.animatedBook.model);

    this.animatedBook.model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    this.model.visible = false;

    this.model.traverse((child) => {
      this.staticObjects.add(child);
      if (child.name.startsWith("ZONE_")) {
        child.visible = false;
        return;
      }

      if (!(child instanceof THREE.Mesh)) {
        return;
      }

      if (child.name.startsWith("COL_")) {
        return;
      }

      child.castShadow = true;
      child.receiveShadow = true;
    });

    this.model.updateMatrixWorld(true);

    await this.physics.init();
    const colliders = new WorldColliders(this.physics);

    colliders.createFromEnvironment(this.model);

    this.createInteriorLighting();

    batchHouseBeams(this.model, house.animations);

    try {
      await ClosedSurfaceCulling.create(this.model, house.animations);
    } catch (error) {
      console.warn(
        "House surface culling unavailable; keeping authored materials:",
        error,
      );
    }

    freezeStaticTransforms(this.model, house.animations, this.staticObjects);

    this.loaded = true;
  }

  private createInteriorLighting(): void {
    this.lightGroup.add(createHouseLighting(this.model, true));
  }

  private activateEnvironment(): void {
    if (!this.environmentStored) {
      this.previousBackground = this.scene.background;

      this.previousFog = this.scene.fog;

      this.environmentStored = true;
    }

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
    this.scene.add(this.model);
    this.activateEnvironment();
    this.model.visible = true;
    this.lightGroup.visible = true;
  }

  hide(): void {
    this.model.visible = false;

    this.scene.remove(this.model);
    this.lightGroup.visible = false;
    this.restoreEnvironment();
  }

  getSpawn(): THREE.Object3D | undefined {
    return this.model.getObjectByName("SPAWN_HOUSE");
  }

  getExitZone(): THREE.Object3D | undefined {
    return this.model.getObjectByName("ZONE_EXIT_DOOR");
  }

  getExitDoor(): THREE.Object3D | undefined {
    return this.model.getObjectByName("INTERACT_EXIT_DOOR_01");
  }

  get isLoaded(): boolean {
    return this.loaded;
  }

  get projectBook(): AnimatedBook3D | undefined {
    return this.animatedBook;
  }

  update(delta: number): void {
    if (this.model.visible) {
      this.animatedBook?.update(delta);
    }
  }
}
