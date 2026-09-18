import * as THREE from "three";

import { Keyboard } from "../input/Keyboard";
import { Player } from "./player/Player";
import { AssetLoader } from "../loaders/AssetLoader";

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

  constructor(
    private readonly scene: THREE.Scene,
    private readonly keyboard: Keyboard,
    private readonly loadingManager: THREE.LoadingManager,
  ) {
    this.addLights();
  }

  async init(): Promise<void> {
    const asset = await new AssetLoader(this.loadingManager).loadGLB(
      "/assets/models/environment/world.glb",
    );
    this.model = asset.scene;
    // Match the export's roughly 12-unit storeys to the 1.85-unit player.
    this.model.scale.setScalar(0.25);
    this.model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = true;
      child.receiveShadow = true;
      child.geometry.computeBoundingBox();
      this.meshes.push(child);
    });
    this.scene.add(this.model);
    this.model.updateMatrixWorld(true);
    this.bounds.setFromObject(this.model);
    this.player = new Player(this.scene, this.keyboard, this.loadingManager);
    await this.player.load();
  }

  update(delta: number): void {
    this.player?.update(delta);
    this.sunHelper?.update();
  }

  moveSun(x: number, y: number, z: number): void {
    this.sunPivot.position.x += x;
    this.sunPivot.position.y += y;
    this.sunPivot.position.z += z;
    this.sunHelper.update();
  }

  setSunDebugVisible(visible: boolean): void {
    this.sunVisual.visible = visible;
    this.sunHelper.visible = visible;
  }

  private addLights(): void {
    this.ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    this.scene.add(this.ambientLight);

    this.sunPivot = new THREE.Group();
    this.sunPivot.position.set(10, 20, 10);
    this.scene.add(this.sunPivot);

    this.sun = new THREE.DirectionalLight(0xfff1bf, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
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
}
