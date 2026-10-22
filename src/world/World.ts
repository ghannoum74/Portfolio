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
import { Water } from "./environment/Water";
import { HouseInterior } from "./house/HouseInterior";

export class World {
  model!: THREE.Group;
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
  private readonly perfDiag = new URLSearchParams(window.location.search).has("perfdiag");
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

    this.npcManager = new NpcManager(this.scene, this.loadingManager);
  }
  async init(): Promise<void> {
    await this.physics.init();

    // Start optional interior assets alongside the exterior without delaying
    void this.loadHouseInterior().catch((error) => {
      console.warn(
        "House preload failed; entering the house will retry:",
        error,
      );
    });

    // Rapier exists now, so debug renderer can safely use it.
    this.physicsDebugRenderer = new PhysicsDebugRenderer(
      this.scene,
      this.physics,
    );

    /*
     *load the world and create colliders for it.
     */
    const asset = await new AssetLoader(
      this.loadingManager,
      this.onAssetReady,
    ).loadGLB(ASSETS.world);
    this.model = asset.scene;

    this.model.scale.setScalar(0.25);

    this.model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) {
        return;
      }

      child.receiveShadow = true;

      child.geometry.computeBoundingBox();

      this.meshes.push(child);
    });
    this.water = new Water(this.model);
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
    await this.player.load();

    this.initialized = true;
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
    if (steps > 0) this.player.syncFromPhysics();

    if (this.perfDiag) {
      this.physicsTimingMs += performance.now() - physicsStarted;
      this.physicsTimingFrames++;
      this.physicsStepCount += steps;
      const now = performance.now();
      if (now - this.physicsTimingStarted >= 3000) {
        console.info("[House physics]", {
          physicsCpuMsPerFrame: +(this.physicsTimingMs / this.physicsTimingFrames).toFixed(2),
          physicsStepsPerFrame: +(this.physicsStepCount / this.physicsTimingFrames).toFixed(2),
          houseStoneLod: exteriorActive ? undefined : this.houseInterior?.stoneLodStats,
        });
        this.physicsTimingStarted = now;
        this.physicsTimingMs = 0;
        this.physicsTimingFrames = 0;
        this.physicsStepCount = 0;
      }
    }

    // Evaluate the skeleton once per displayed frame, preserving the total
    // elapsed simulation time instead of repeating it in every physics step.
    if (steps > 0) this.player.updateAnimation(steps * this.fixedPhysicsStep);

    this.physicsDebugRenderer.update();
    if (exteriorActive) this.sunHelper?.update();
  }

  setSunDebugVisible(visible: boolean): void {
    this.sunVisual.visible = visible;
    this.sunHelper.visible = visible;
  }

  updateLod(camera: THREE.Camera, viewportHeight: number): void {
    this.houseInterior?.updateLod(camera, viewportHeight);
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

    await this.houseInterior.load();

    return this.houseInterior;
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
