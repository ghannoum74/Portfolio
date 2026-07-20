import * as THREE from "three";

import { Ground } from "./Ground";
import { Keyboard } from "../input/Keyboard";
import { Player } from "./player/Player";
import { PhysicsWorld } from "../physics/PhysicsWorld";

export class World {
  ground: Ground;
  player!: Player;

  constructor(
    private scene: THREE.Scene,
    private physics: PhysicsWorld,
    private keyboard: Keyboard,
    private loadingManager: THREE.LoadingManager,
  ) {
    this.ground = new Ground(this.scene);
    this.physics.add(this.ground.physics);

    this.addLights();
  }

  async init() {
    const player = new Player(this.scene, this.keyboard, this.loadingManager);

    await player.load();

    this.player = player;
    this.physics.add(this.player.physics);
  }

  updateInput(delta: number) {
    this.player?.updateInput(delta);
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
