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

    const safeDelta = Math.min(delta, 1 / 30);

    if (exteriorActive) {
      this.dayNightCycle.update(safeDelta);

      this.water.update(safeDelta);

      this.npcManager.update(safeDelta, this.player.model.position);
    }

    this.physics.beginFrame(safeDelta);

    this.player?.update(safeDelta);

    this.physics.step();

    this.player?.syncFromPhysics();

    this.physicsDebugRenderer.update();

    if (exteriorActive) {
      this.sunHelper?.update();
    }
  }

  setSunDebugVisible(visible: boolean): void {
    this.sunVisual.visible = visible;
    this.sunHelper.visible = visible;
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
        this.loadingManager,
        this.physics,
      );
    }

    await this.houseInterior.load();

    return this.houseInterior;
  }

  setExteriorVisible(visible: boolean): void {
    this.model.visible = visible;

    this.npcManager.setVisible(visible);
  }

  setExteriorLightingEnabled(enabled: boolean): void {
    this.sunPivot.visible = enabled;

    this.ambientLight.visible = enabled;
  }
}
