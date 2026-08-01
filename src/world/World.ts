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
    private scene: THREE.Scene,
    private keyboard: Keyboard,
    private loadingManager: THREE.LoadingManager,
  ) {
    this.ground = new Ground(this.scene);

    this.addLights();
  }

  async init() {
    this.player = new Player(this.scene, this.keyboard, this.loadingManager);

    this.grass = new Grass(this.scene, this.loadingManager);

    await Promise.all([this.player.load(), this.grass.load()]);
  }

  update(delta: number) {
    this.player?.update(delta);
  }

  private addLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);

    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 3);

    directionalLight.position.set(10, 20, 10);

    directionalLight.castShadow = true;

    this.scene.add(directionalLight);
  }
}
