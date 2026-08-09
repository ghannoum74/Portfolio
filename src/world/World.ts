import * as THREE from "three";

import { Ground } from "./Ground";
import { Keyboard } from "../input/Keyboard";
import { Player } from "./player/Player";
import { Grass } from "./Grass";

export class World {
  ground: Ground;
  player!: Player;
  grass!: Grass;
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
    this.ground = new Ground(this.scene, this.loadingManager);

    this.addLights();
  }

  async init(): Promise<void> {
    this.player = new Player(this.scene, this.keyboard, this.loadingManager);

    this.grass = new Grass(this.scene, this.loadingManager);

    await Promise.all([
      this.ground.load(),
      this.player.load(),
      this.grass.load(),
    ]);
  }

  update(delta: number): void {
    this.player?.update(delta);
    this.grass.update(delta);
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
