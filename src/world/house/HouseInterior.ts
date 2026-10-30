import * as THREE from "three";

import { AssetLoader } from "../../loaders/AssetLoader";
import { ASSETS } from "../../loaders/AssetManifest";
import { WorldColliders } from "../../physics/WorldColliders";
import { PhysicsWorld } from "../../physics/PhysicsWorld";
import { AnimatedBook3D } from "./AnimatedBook3D";
import { performanceOptions } from "../../core/PerformanceOptions";
import { batchHouseBeams } from "./batchHouseBeams";
import { HouseStoneLod, type StoneLodData } from "./HouseStoneLod";
import { ClosedSurfaceCulling } from "./ClosedSurfaceCulling";
import { StaticMeshBatches, StaticTransforms } from "../../optimization/StaticScene";
import { createHouseLighting } from "./HouseLighting";

export class HouseInterior {
  public model = new THREE.Group();
  private readonly loader: AssetLoader;
  private loaded = false;
  private loadPromise?: Promise<void>;
  private stoneLod?: HouseStoneLod;
  private stoneLodPromise?: Promise<void>;
  private stoneLodEnabled = performanceOptions.stoneLod;
  private surfaceCulling?: ClosedSurfaceCulling;
  private surfaceCullingEnabled = performanceOptions.surfaceCulling;
  private staticBatches?: StaticMeshBatches;
  private staticTransforms?: StaticTransforms;
  private staticBatchingEnabled = performanceOptions.staticBatching;
  private staticTransformsEnabled = performanceOptions.staticTransforms;
  private animations: THREE.AnimationClip[] = [];
  private readonly staticObjects = new Set<THREE.Object3D>();

  // Keep the house physically separated from the exterior Rapier world.
  private readonly worldOffset = new THREE.Vector3(0, -30, 0);

  // interior lights
  private readonly lightGroup = new THREE.Group();
  private previousBackground: THREE.Color | THREE.Texture | null = null;
  private previousFog: THREE.Fog | THREE.FogExp2 | null = null;
  private environmentStored = false;
  private readonly interiorBackground = new THREE.Color("#d8d0c1");
  private animatedBook?: AnimatedBook3D;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly loadingManager: THREE.LoadingManager,
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

    // Preloading and entering share the same in-flight work. A failed preload
    // can be retried through the normal entrance flow.
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
    this.animations = house.animations;

    this.model = house.scene;

    this.model.name = "HOUSE_INTERIOR";

    this.model.position.copy(this.worldOffset);

    // Hide the old, non-animated Projects Book.
    const oldBook = this.model.getObjectByName("SEC_PROJECTS_ProjectBook");

    if (oldBook) {
      oldBook.visible = false;
    }

    // Load the real animated book.
    this.animatedBook = new AnimatedBook3D(bookAsset);

    await this.animatedBook.initializePages();

    this.model.add(this.animatedBook.model);

    this.animatedBook.model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    // hidden until the entrance is triggered
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

    const colliders = new WorldColliders(this.physics);

    colliders.createFromEnvironment(this.model);

    this.createInteriorLighting();

    if (performanceOptions.beamBatching) {
      const batches = batchHouseBeams(this.model, house.animations);
      if (performanceOptions.perfDiag) console.info("[House beams]", batches);
    }

    // Validate while preloading/behind the entry cover, before shader warm-up.
    // The current export is inspected directly; no Blender-side manifest can go stale.
    try {
      this.surfaceCulling = await ClosedSurfaceCulling.create(this.model, this.surfaceCullingEnabled, house.animations);
      this.surfaceCulling.setEnabled(this.surfaceCullingEnabled);
      if (performanceOptions.perfDiag) {
        const sample = this.surfaceCulling.stats;
        console.info("[House surface culling]", sample, JSON.stringify(sample));
      }
    } catch (error) {
      console.warn("House surface culling unavailable; keeping authored materials:", error);
    }

    // Batch after surface preparation so front-/double-sided assignments stay distinct.
    if (this.staticBatchingEnabled) this.staticBatches = new StaticMeshBatches(this.model, house.animations, this.staticObjects);
    if (this.staticTransformsEnabled) this.staticTransforms = new StaticTransforms(this.model, house.animations, this.staticObjects);
    if (performanceOptions.perfDiag) console.info("[House static scene]", {
      batching: this.staticBatches?.stats, frozenLocalTransforms: this.staticTransforms?.count ?? 0,
    });

    this.loaded = true;

    // Optional data never delays house readiness. A missing/stale sidecar keeps
    // the complete authored meshes, including after future Blender re-exports.
    if (this.stoneLodEnabled) this.loadStoneLods();

    console.log("🏠 House interior loaded");
  }

  private loadStoneLods(): void {
    if (this.stoneLod || this.stoneLodPromise) return;
    this.stoneLodPromise = new THREE.FileLoader(this.loadingManager).setResponseType("json")
      .loadAsync(ASSETS.houseStoneLods)
      .then(data => HouseStoneLod.create(this.model, data as unknown as StoneLodData))
      .then(lod => {
        this.stoneLod = lod;
        lod.setEnabled(this.stoneLodEnabled);
        if (performanceOptions.perfDiag) {
          const sample = lod.stats;
          console.info("[House stone LOD]", sample, JSON.stringify(sample));
        }
      })
      .catch(error => console.warn("House stone LOD unavailable; using authored geometry:", error))
      .finally(() => { this.stoneLodPromise = undefined; });
  }

  private createInteriorLighting(): void {
    this.lightGroup.add(createHouseLighting(this.model, performanceOptions.shadows));
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
    // Attach only on entry so startup shader compilation also stays independent
    // of the preloaded interior's materials.
    this.scene.add(this.model);
    this.activateEnvironment();
    this.model.visible = true;
    this.lightGroup.visible = true;
  }

  hide(): void {
    this.model.visible = false;
    // Invisible objects still receive matrix updates while attached to a scene.
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

  setStaticBatchingEnabled(enabled: boolean): void {
    this.staticBatchingEnabled = enabled;
    if (enabled && this.loaded && !this.staticBatches) this.staticBatches = new StaticMeshBatches(this.model, this.animations, this.staticObjects);
    this.staticBatches?.setEnabled(enabled);
  }

  setStaticTransformsEnabled(enabled: boolean): void {
    this.staticTransformsEnabled = enabled;
    if (enabled && this.loaded && !this.staticTransforms) this.staticTransforms = new StaticTransforms(this.model, this.animations, this.staticObjects);
    this.staticTransforms?.setEnabled(enabled);
  }

  get projectBook(): AnimatedBook3D | undefined {
    return this.animatedBook;
  }

  updateLod(camera: THREE.Camera, viewportHeight: number): void {
    if (this.model.visible) this.stoneLod?.update(camera, viewportHeight);
  }

  get stoneLodStats() {
    return this.stoneLod?.stats;
  }

  setStoneLodEnabled(enabled: boolean): void {
    this.stoneLodEnabled = enabled;
    this.stoneLod?.setEnabled(enabled);
    if (enabled && this.loaded) this.loadStoneLods();
  }

  setSurfaceCullingEnabled(enabled: boolean): void {
    this.surfaceCullingEnabled = enabled;
    this.surfaceCulling?.setEnabled(enabled);
  }

  get surfaceCullingStats() {
    return this.surfaceCulling?.stats;
  }

  update(delta: number): void {
    if (this.model.visible) {
      this.animatedBook?.update(delta);
    }
  }
}
