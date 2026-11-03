import * as THREE from "three";

import { Keyboard } from "../input/Keyboard";
import { Player } from "./player/Player";
import { AssetLoader } from "../loaders/AssetLoader";
import { WorldColliders } from "../physics/WorldColliders";
import { PhysicsWorld } from "../physics/PhysicsWorld";

import { StairDetector } from "./StairDetector";
import { ASSETS } from "../loaders/AssetManifest";
import { DayNightCycle } from "./environment/DayNightCycle";
import { NpcManager } from "./npc/NpcManager";
import type { Npc } from "./npc/Npc";
import { Water } from "./environment/Water";
import { HouseInterior } from "./house/HouseInterior";

import {
  StaticMeshBatches,
  StaticMeshInstances,
  StaticTransforms,
} from "../optimization/StaticScene";

import {
  HouseStoneLod,
  EXTERIOR_LOD_NAMES,
  type StoneLodData,
} from "./house/HouseStoneLod";
import { ClosedSurfaceCulling } from "./house/ClosedSurfaceCulling";

export class World {
  model!: THREE.Group;

  private exteriorLod?: HouseStoneLod;
  private exteriorLodPromise?: Promise<void>;
  private exteriorSurfaceCulling?: ClosedSurfaceCulling;
  player!: Player;
  sun!: THREE.DirectionalLight;
  sunPivot!: THREE.Group;

  ambientLight!: THREE.AmbientLight;
  physics = new PhysicsWorld();
  private worldColliders!: WorldColliders;
  private initialized = false;

  private physicsAccumulator = 0;
  private readonly fixedPhysicsStep = 1 / 60;
  private readonly maxPhysicsSteps = 5;

  private stairDetector!: StairDetector;
  private dayNightCycle: DayNightCycle;
  private readonly npcManager: NpcManager;
  private water!: Water;
  private houseInterior?: HouseInterior;
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

    this.npcManager = new NpcManager(
      this.scene,
      this.loadingManager,
      this.physics,
      this.onAssetReady,
    );
  }
  async init(): Promise<void> {
    this.preloadHouseInterior();
    await Promise.all([this.loadExterior(), this.npcManager.loadStartup()]);
  }

  private async loadExterior(): Promise<void> {
    const [, asset] = await Promise.all([
      this.physics.init(),
      new AssetLoader(this.loadingManager, this.onAssetReady).loadGLB(
        ASSETS.world,
      ),
    ]);

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
    });
    this.water = new Water(this.model);
    this.scene.add(this.model);
    this.model.updateMatrixWorld(true);

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

    await Promise.all([
      this.player.load(),
      this.prepareExteriorSurfaceCulling(),
    ]);

    new StaticMeshBatches(this.model, asset.animations, this.staticObjects);
    new StaticMeshInstances(this.model, asset.animations, this.staticObjects);
    new StaticTransforms(this.model, asset.animations, this.staticObjects);

    this.initialized = true;
    this.loadExteriorLods();
  }

  private async prepareExteriorSurfaceCulling(): Promise<void> {
    try {
      this.exteriorSurfaceCulling = await ClosedSurfaceCulling.create(
        this.model,
        true,
        this.environmentAnimations,
        { maxTriangles: 10_000 },
      );
      this.exteriorSurfaceCulling.setEnabled(true);
    } catch (error) {
      console.warn(
        "Exterior surface culling unavailable; keeping authored materials:",
        error,
      );
    }
  }

  private loadExteriorLods(): void {
    if (!this.initialized || this.exteriorLod || this.exteriorLodPromise)
      return;
    this.exteriorLodPromise = new THREE.FileLoader()
      .setResponseType("json")
      .loadAsync(ASSETS.exteriorLods)
      .then((data) =>
        HouseStoneLod.create(
          this.model,
          data as unknown as StoneLodData,
          EXTERIOR_LOD_NAMES,
          3,
        ),
      )
      .then((lod) => {
        this.exteriorLod = lod;

        lod.setEnabled(true);
      })
      .catch((error) =>
        console.warn(
          "Exterior LOD unavailable; using authored geometry:",
          error,
        ),
      )
      .finally(() => {
        this.exteriorLodPromise = undefined;
      });
  }

  get npcs(): readonly Npc[] {
    return this.npcManager.npcs;
  }

  update(delta: number, exteriorActive: boolean): void {
    if (!this.initialized) {
      return;
    }

    const visualDelta = Math.min(Math.max(delta, 0), 0.1);

    if (!exteriorActive) {
      this.houseInterior?.update(visualDelta);
    } else {
      this.dayNightCycle.update(visualDelta);
      this.water.update(visualDelta);
      this.npcManager.update(visualDelta, this.player.model.position);
    }

    const previousAccumulator = this.physicsAccumulator;
    this.physicsAccumulator += visualDelta;
    let steps = 0;
    while (
      this.physicsAccumulator >= this.fixedPhysicsStep &&
      steps < this.maxPhysicsSteps
    ) {
      this.physics.beginFrame(this.fixedPhysicsStep);
      this.player.updatePhysics(this.fixedPhysicsStep);
      this.physics.step();
      this.physicsAccumulator -= this.fixedPhysicsStep;
      steps++;
    }

    if (
      steps === this.maxPhysicsSteps &&
      this.physicsAccumulator >= this.fixedPhysicsStep
    ) {
      this.physicsAccumulator = 0;
    }

    this.player.syncFromPhysics(
      this.physicsAccumulator / this.fixedPhysicsStep,
    );

    const animationDelta = Math.max(
      0,
      Math.min(
        visualDelta,
        steps * this.fixedPhysicsStep +
          this.physicsAccumulator -
          previousAccumulator,
      ),
    );
    if (animationDelta > 0) this.player.updateAnimation(animationDelta);
  }

  updateLod(camera: THREE.Camera, viewportHeight: number): void {
    if (this.model?.visible && this.model.parent)
      this.exteriorLod?.update(camera, viewportHeight);
    this.houseInterior?.updateLod(camera, viewportHeight);
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

  preloadHouseInterior(): void {
    void this.loadHouseInterior().catch((error) => {
      console.warn(
        "House preload failed; entering the house will retry:",
        error,
      );
    });
  }

  setExteriorVisible(visible: boolean): void {
    this.model.visible = visible;

    if (visible) this.scene.add(this.model);
    else this.scene.remove(this.model);

    this.npcManager.setVisible(visible);
  }

  setExteriorLightingEnabled(enabled: boolean): void {
    this.sunPivot.visible = enabled;

    this.ambientLight.visible = enabled;
  }
}
