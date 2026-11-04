import * as THREE from "three";

import { Keyboard } from "../input/Keyboard";
import { Player } from "./player/Player";
import { AssetLoader } from "../loaders/AssetLoader";
import { WorldColliders } from "../physics/WorldColliders";
import { PhysicsWorld } from "../physics/PhysicsWorld";
import { PhysicsDebugRenderer } from "../physics/PhysicsDebugRenderer";
import { StairDetector } from "./StairDetector";
import { ASSETS } from "../loaders/AssetManifest";
import { DayNightCycle } from "./environment/DayNightCycle";
import { NpcManager } from "./npc/NpcManager";
import type { Npc } from "./npc/Npc";
import { Water, type WaterShaderMode } from "./environment/Water";
import { HouseInterior } from "./house/HouseInterior";
import { performanceOptions } from "../core/PerformanceOptions";
import type { PerformanceSampleListener } from "../core/PerformanceReport";
import { StaticMeshBatches, StaticMeshInstances, StaticTransforms } from "../optimization/StaticScene";

import { HouseStoneLod, EXTERIOR_LOD_NAMES, type StoneLodData } from "./house/HouseStoneLod";
import { ClosedSurfaceCulling } from "./house/ClosedSurfaceCulling";

export class World {
  model!: THREE.Group;
  onPerformanceSample?: PerformanceSampleListener;
  private exteriorLod?: HouseStoneLod;
  private exteriorLodPromise?: Promise<void>;
  private exteriorLodEnabled = performanceOptions.exteriorLod;
  private exteriorSurfaceCulling?: ClosedSurfaceCulling;
  private surfaceCullingEnabled = performanceOptions.surfaceCulling;
  private meshes: THREE.Mesh[] = [];
  private bounds = new THREE.Box3();
  player!: Player;
  sun!: THREE.DirectionalLight;
  sunPivot!: THREE.Group;
  sunVisual!: THREE.Mesh;
  sunHelper!: THREE.DirectionalLightHelper;
  ambientLight!: THREE.AmbientLight;
  physics = new PhysicsWorld();
  private worldColliders!: WorldColliders;
  private initialized = false;

  // HOUSE_PERFORMANCE_V1: accumulate real time rather than slowing physics at low FPS.
  private physicsAccumulator = 0;
  private readonly fixedPhysicsStep = 1 / 60;
  private readonly maxPhysicsSteps = 5;
  private readonly perfDiag = performanceOptions.perfDiag;
  private physicsTimingStarted = performance.now();
  private physicsTimingMs = 0;
  private physicsTimingFrames = 0;
  private physicsStepCount = 0;
  private physicsDebugRenderer!: PhysicsDebugRenderer;
  private stairDetector!: StairDetector;
  private dayNightCycle: DayNightCycle;
  private readonly npcManager: NpcManager;
  private water!: Water;
  private houseInterior?: HouseInterior;
  private staticBatches?: StaticMeshBatches;
  private staticInstances?: StaticMeshInstances;
  private staticTransforms?: StaticTransforms;
  private staticBatchingEnabled = performanceOptions.staticBatching;
  private staticTransformsEnabled = performanceOptions.staticTransforms;
  private environmentAnimations: THREE.AnimationClip[] = [];
  private readonly staticObjects = new Set<THREE.Object3D>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly keyboard: Keyboard,
    private readonly loadingManager: THREE.LoadingManager,
    private readonly onAssetReady?: (url: string) => void,
  ) {
    this.addLights();

    this.dayNightCycle = new DayNightCycle(
      this.scene,
      this.sunPivot,
      this.sun,
      this.ambientLight,
    );

    this.npcManager = new NpcManager(this.scene, this.loadingManager, this.physics, this.onAssetReady);
  }
  async init(): Promise<void> {
    // Start the interior immediately, but keep its promise/errors outside startup.
    this.preloadHouseInterior();
    await Promise.all([this.loadExterior(), this.npcManager.loadStartup()]);
  }

  private async loadExterior(): Promise<void> {
    // Independent network/decoder work starts together behind the loading screen.
    const [, asset] = await Promise.all([
      this.physics.init(),
      new AssetLoader(this.loadingManager, this.onAssetReady).loadGLB(ASSETS.world),
    ]);

    // Rapier exists now, so debug renderer can safely use it.
    this.physicsDebugRenderer = new PhysicsDebugRenderer(
      this.scene,
      this.physics,
    );

    /*
     *load the world and create colliders for it.
     */
    this.model = asset.scene;
    this.environmentAnimations = asset.animations;

    this.model.scale.setScalar(0.25);

    this.model.traverse((child) => {
      this.staticObjects.add(child);
      if (!(child instanceof THREE.Mesh)) {
        return;
      }

      child.receiveShadow = true;

      child.geometry.computeBoundingBox();

      this.meshes.push(child);
    });
    this.water = new Water(this.model, performanceOptions.waterShader);
    this.scene.add(this.model);
    this.model.updateMatrixWorld(true);
    this.bounds.setFromObject(this.model);

    this.worldColliders = new WorldColliders(this.physics);
    this.worldColliders.createFromEnvironment(this.model);

    this.stairDetector = new StairDetector(this.model);

    this.player = new Player(
      this.scene,
      this.keyboard,
      this.loadingManager,
      this.physics,
      this.stairDetector,
      this.onAssetReady,
    );
    // Start player downloads before the cooperatively sliced surface audit.
    await Promise.all([this.player.load(), this.prepareExteriorSurfaceCulling()]);

    // Keep front-/double-sided materials distinct, including shared batch materials.
    if (this.staticBatchingEnabled) this.staticBatches = new StaticMeshBatches(this.model, asset.animations, this.staticObjects);
    if (this.staticBatchingEnabled) this.staticInstances = new StaticMeshInstances(this.model, asset.animations, this.staticObjects);
    if (this.staticTransformsEnabled) this.staticTransforms = new StaticTransforms(this.model, asset.animations, this.staticObjects);
    if (performanceOptions.perfDiag) console.info("[World static scene]", {
      batching: this.staticBatches?.stats, instancing: this.staticInstances?.stats,
      frozenLocalTransforms: this.staticTransforms?.count ?? 0,
    });

    this.initialized = true;
    if (this.exteriorLodEnabled) this.loadExteriorLods();
  }

  private async prepareExteriorSurfaceCulling(): Promise<void> {
    try {
      // Dense rocks retain their authored material without a costly topology scan.
      this.exteriorSurfaceCulling = await ClosedSurfaceCulling.create(
        this.model, this.surfaceCullingEnabled, this.environmentAnimations, { maxTriangles: 10_000 });
      this.exteriorSurfaceCulling.setEnabled(this.surfaceCullingEnabled);
      if (this.perfDiag) {
        const sample = this.exteriorSurfaceCulling.stats;
        console.info("[Exterior surface culling]", sample, JSON.stringify(sample));
      }
    } catch (error) {
      console.warn("Exterior surface culling unavailable; keeping authored materials:", error);
    }
  }

  private loadExteriorLods(): void {
    if (!this.initialized || this.exteriorLod || this.exteriorLodPromise) return;
    this.exteriorLodPromise = new THREE.FileLoader().setResponseType("json").loadAsync(ASSETS.exteriorLods)
      .then(data => HouseStoneLod.create(this.model, data as unknown as StoneLodData, EXTERIOR_LOD_NAMES, 3))
      .then(lod => {
        this.exteriorLod = lod;
        // The diagnostic switch may change while download/hash checks run.
        lod.setEnabled(this.exteriorLodEnabled);
        if (this.perfDiag) console.info("[Exterior LOD]", JSON.stringify(lod.stats));
      })
      .catch(error => console.warn("Exterior LOD unavailable; using authored geometry:", error))
      .finally(() => { this.exteriorLodPromise = undefined; });
  }

  get npcs(): readonly Npc[] {
    return this.npcManager.npcs;
  }

  update(delta: number, exteriorActive: boolean): void {
    if (!this.initialized) {
      return;
    }

    // Visuals use elapsed wall time (capped only after a tab was suspended).
    const visualDelta = Math.min(Math.max(delta, 0), 0.1);

    if (!exteriorActive) {
      this.houseInterior?.update(visualDelta);
    } else {
      this.dayNightCycle.update(visualDelta);
      this.water.update(visualDelta);
      this.npcManager.update(visualDelta, this.player.model.position);
    }

    // Stable physics substeps. At 15 FPS we now simulate ~4 x 1/60 s,
    // rather than advancing only 1/30 s and making the player half-speed.
    const physicsStarted = this.perfDiag ? performance.now() : 0;
    const previousAccumulator = this.physicsAccumulator;
    this.physicsAccumulator += visualDelta;
    let steps = 0;
    while (this.physicsAccumulator >= this.fixedPhysicsStep && steps < this.maxPhysicsSteps) {
      this.physics.beginFrame(this.fixedPhysicsStep);
      this.player.updatePhysics(this.fixedPhysicsStep);
      this.physics.step();
      this.physicsAccumulator -= this.fixedPhysicsStep;
      steps++;
    }

    // Drop impossible backlog after a severe stall (e.g. a tab was suspended).
    // This prevents an escalating CPU spiral; low FPS still needs separate tuning.
    if (steps === this.maxPhysicsSteps && this.physicsAccumulator >= this.fixedPhysicsStep) {
      this.physicsAccumulator = 0;
    }
    // Render between the last two simulation samples, including frames with no
    // physics step. The follow camera reads this same continuous visual pose.
    this.player.syncFromPhysics(this.physicsAccumulator / this.fixedPhysicsStep);

    if (this.perfDiag) {
      this.physicsTimingMs += performance.now() - physicsStarted;
      this.physicsTimingFrames++;
      this.physicsStepCount += steps;
      const now = performance.now();
      if (now - this.physicsTimingStarted >= 3000) {
        const sample = {
          physicsCpuMsPerFrame: +(this.physicsTimingMs / this.physicsTimingFrames).toFixed(2),
          physicsStepsPerFrame: +(this.physicsStepCount / this.physicsTimingFrames).toFixed(2),
          exteriorLod: exteriorActive ? this.exteriorLod?.stats : undefined,
          exteriorSurfaceCulling: exteriorActive ? this.exteriorSurfaceCulling?.stats : undefined,
          waterShader: exteriorActive ? this.water?.stats : undefined,
          houseStoneLod: exteriorActive ? undefined : this.houseInterior?.stoneLodStats,
          houseSurfaceCulling: exteriorActive ? undefined : this.houseInterior?.surfaceCullingStats,
        };
        console.info("[House physics]", sample, JSON.stringify(sample));
        this.onPerformanceSample?.(sample);
        this.physicsTimingStarted = now;
        this.physicsTimingMs = 0;
        this.physicsTimingFrames = 0;
        this.physicsStepCount = 0;
      }
    }

    // Advance the skeleton once per displayed frame, including fractional
    // physics frames. Drop the same severe-stall backlog as the simulation.
    const animationDelta = Math.max(0, Math.min(visualDelta,
      steps * this.fixedPhysicsStep + this.physicsAccumulator - previousAccumulator));
    if (animationDelta > 0) this.player.updateAnimation(animationDelta);

    this.physicsDebugRenderer.update();
    if (exteriorActive) this.sunHelper?.update();
  }

  setSunDebugVisible(visible: boolean): void {
    this.sunVisual.visible = visible;
    this.sunHelper.visible = visible;
  }

  updateLod(camera: THREE.Camera, viewportHeight: number): void {
    if (this.model?.visible && this.model.parent) this.exteriorLod?.update(camera, viewportHeight);
    this.houseInterior?.updateLod(camera, viewportHeight);
  }

  setExteriorLodEnabled(enabled: boolean): void {
    this.exteriorLodEnabled = enabled;
    this.exteriorLod?.setEnabled(enabled);
    if (enabled) this.loadExteriorLods();
  }

  setWaterShaderMode(mode: WaterShaderMode): void {
    this.water?.setShaderMode(mode);
  }

  setHouseStoneLodEnabled(enabled: boolean): void {
    this.houseInterior?.setStoneLodEnabled(enabled);
  }

  setSurfaceCullingEnabled(enabled: boolean): void {
    this.surfaceCullingEnabled = enabled;
    this.exteriorSurfaceCulling?.setEnabled(enabled);
    this.houseInterior?.setSurfaceCullingEnabled(enabled);
  }

  setStaticBatchingEnabled(enabled: boolean): void {
    this.staticBatchingEnabled = enabled;
    if (enabled && this.model && !this.staticBatches) this.staticBatches = new StaticMeshBatches(this.model, this.environmentAnimations, this.staticObjects);
    if (enabled && this.model && !this.staticInstances) this.staticInstances = new StaticMeshInstances(this.model, this.environmentAnimations, this.staticObjects);
    this.staticBatches?.setEnabled(enabled);
    this.staticInstances?.setEnabled(enabled);
    this.houseInterior?.setStaticBatchingEnabled(enabled);
  }

  setStaticTransformsEnabled(enabled: boolean): void {
    this.staticTransformsEnabled = enabled;
    if (enabled && this.model && !this.staticTransforms) this.staticTransforms = new StaticTransforms(this.model, this.environmentAnimations, this.staticObjects);
    this.staticTransforms?.setEnabled(enabled);
    this.houseInterior?.setStaticTransformsEnabled(enabled);
  }

  resetPerformanceSamples(): void {
    this.physicsTimingStarted = performance.now();
    this.physicsTimingMs = 0;
    this.physicsTimingFrames = 0;
    this.physicsStepCount = 0;
  }

  setPhysicsDebugVisible(visible: boolean): void {
    this.physicsDebugRenderer?.setVisible(visible);
  }

  private addLights(): void {
    this.ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    this.scene.add(this.ambientLight);

    this.sunPivot = new THREE.Group();
    this.sunPivot.position.set(10, 20, 10);
    this.scene.add(this.sunPivot);

    this.sun = new THREE.DirectionalLight(0xfff1bf, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.position.set(0, 0, 0);
    this.sun.target.position.set(0, 0, 0);

    this.sunPivot.add(this.sun);
    this.scene.add(this.sun.target);

    const sunGeometry = new THREE.SphereGeometry(0.8, 24, 24);
    const sunMaterial = new THREE.MeshBasicMaterial({
      color: 0xffcc55,
    });

    this.sunVisual = new THREE.Mesh(sunGeometry, sunMaterial);
    this.sunPivot.add(this.sunVisual);

    this.sunHelper = new THREE.DirectionalLightHelper(this.sun, 2, 0xffcc55);
    this.scene.add(this.sunHelper);
  }

  setTimeOfDay(hour: number | null): void {
    this.dayNightCycle.setTimeOverride(hour);
  }

  getTimeOfDay(): number {
    return this.dayNightCycle.getTimeOfDay();
  }

  isUsingRealTime(): boolean {
    return this.dayNightCycle.isUsingRealTime();
  }

  async loadNpcs(): Promise<void> {
    await this.npcManager.load();
  }

  async loadHouseInterior(): Promise<HouseInterior> {
    if (!this.houseInterior) {
      this.houseInterior = new HouseInterior(
        this.scene,
        new THREE.LoadingManager(),
        this.physics,
      );
    }

    this.houseInterior.setSurfaceCullingEnabled(this.surfaceCullingEnabled);
    await this.houseInterior.load();

    return this.houseInterior;
  }

  preloadHouseInterior(): void {
    // Optional downloads begin during startup and share work with early entry.
    void this.loadHouseInterior().catch(error => {
      console.warn("House preload failed; entering the house will retry:", error);
    });
  }

  setExteriorVisible(visible: boolean): void {
    this.model.visible = visible;
    // Scene matrix updates also visit invisible descendants. Detach the
    // exterior while indoors, keeping its colliders and world transforms.
    if (visible) this.scene.add(this.model);
    else this.scene.remove(this.model);

    this.npcManager.setVisible(visible);
  }

  setExteriorLightingEnabled(enabled: boolean): void {
    this.sunPivot.visible = enabled;

    this.ambientLight.visible = enabled;
  }
}
