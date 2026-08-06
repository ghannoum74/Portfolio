import * as THREE from "three";

import { Renderer } from "./Renderer";
import { World } from "../world/World";
import { Keyboard } from "../input/Keyboard";
import { GameLoadingManager } from "../loaders/GameLoadingManager";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ThirdPersonCamera } from "../camera/ThirdPersonCamera";

export class Game {
  private scene: THREE.Scene;
  private renderer: Renderer;
  private camera: THREE.PerspectiveCamera;
  private world: World;
  private keyboard: Keyboard;
  private controls!: OrbitControls;
  private thirdPersonCamera?: ThirdPersonCamera;

  private timer = new THREE.Timer();
  private loadingMnager = new GameLoadingManager();

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();

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

    // camera controls
    this.controls = new OrbitControls(
      this.camera,
      this.renderer.instance.domElement,
    );
    // this.controls.enableDamping = true; // Enable damping for smoother camera movement
    // this.controls.dampingFactor = 0.08;

    // this.controls.enableRotate = false;
    // this.controls.enableZoom = false;
    // this.controls.enablePan = false;
    // // max and min zoom
    // // this.controls.minDistance = 8;
    // // this.controls.maxDistance = 12;
    // // Lock vertical rotation
    // this.controls.minPolarAngle = Math.PI / 3;
    // this.controls.maxPolarAngle = Math.PI / 3;

    // this.controls.screenSpacePanning = true;

    // // Look toward the center of the world
    // this.controls.target.set(0, 1, 0);
    // this.controls.update();

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

      this.thirdPersonCamera = new ThirdPersonCamera(
        this.camera,
        this.world.player.model,
      );
    } catch (error) {
      console.error("Failed to initialize game:", error);
    }
  }
  private update = () => {
    this.timer.update();

    const delta = this.timer.getDelta();

    // move and rotate the player
    this.world.update(delta);

    // move the camera using the player's new transform
    this.thirdPersonCamera?.update(delta);

    this.renderer.render(this.scene, this.camera);
  };
  private onResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;

    this.camera.updateProjectionMatrix();

    this.renderer.resize();
  };
}
