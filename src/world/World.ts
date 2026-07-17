import * as THREE from "three";

import { Ground } from "./Ground";
import { Keyboard } from "../input/Keyboard";
import { Player } from "./player/Player";

export class World {
  ground: Ground;
  player!: Player;

  constructor(
    private scene: THREE.Scene,
    private keyboard: Keyboard,
  ) {
    this.ground = new Ground(this.scene);

    this.addLights();
  }

  async init() {
    this.player = new Player(this.scene, this.keyboard);

    await this.player.load();
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
