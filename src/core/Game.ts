import * as THREE from "three";

import { Renderer } from "./Renderer";
import { World } from "../world/World";
import { Keyboard } from "../input/Keyboard";
import { GameLoadingManager } from "../loaders/GameLoadingManager";

export class Game {
  private scene: THREE.Scene;
  private renderer: Renderer;
  private camera: THREE.PerspectiveCamera;
  private world: World;
  private keyboard: Keyboard;

  private timer = new THREE.Timer();
  private loadingMnager = new GameLoadingManager();

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();

    // Use a visible color while debugging
    this.scene.background = new THREE.Color(0x87ceeb);

    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );

    // Very important initial camera position
    this.camera.position.set(0, 12, 18);
    this.camera.lookAt(0, 0, 0);

    this.keyboard = new Keyboard();

    this.renderer = new Renderer(canvas);

    this.world = new World(
      this.scene,
      this.keyboard,
      this.loadingMnager.instance,
    );

    // Start rendering immediately
    this.renderer.instance.setAnimationLoop(this.update);

    // Load async things separately
    this.init();

    window.addEventListener("resize", this.onResize);
  }

  private async init() {
    try {
      await this.world.init();
    } catch (error) {
      console.error("Failed to initialize game:", error);
    }
  }

  private update = () => {
    this.timer.update();

    const delta = this.timer.getDelta();

    this.world.update(delta);

    this.renderer.instance.render(this.scene, this.camera);
  };

  private onResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;

    this.camera.updateProjectionMatrix();

    this.renderer.resize();
  };
}
