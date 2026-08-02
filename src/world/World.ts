import * as THREE from "three";

import { Ground } from "./Ground";
import { Keyboard } from "../input/Keyboard";
import { Player } from "./player/Player";
import { Grass } from "./Grass";

export class World {
  ground: Ground;
  player!: Player;
  grass!: Grass;

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
  }

  private addLights(): void {
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);

    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 3);

    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;

    directionalLight.shadow.mapSize.set(2048, 2048);

    this.scene.add(directionalLight);
  }
}
