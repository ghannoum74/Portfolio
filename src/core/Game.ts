import * as THREE from "three";
import { Renderer } from "./Renderer";
import { World } from "../world/World";
import { Keyboard } from "../input/Keyboard";
import { GameLoadingManager } from "../loaders/GameLoadingManager";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ThirdPersonCamera } from "../camera/ThirdPersonCamera";
import GUI from "three/examples/jsm/libs/lil-gui.module.min.js";

export class Game {
  private scene: THREE.Scene;
  private renderer: Renderer;
  private playerCamera: THREE.PerspectiveCamera;
  private debugCamera: THREE.PerspectiveCamera;
  private world: World;
  private keyboard: Keyboard;
  private controls: OrbitControls;
  private thirdPersonCamera?: ThirdPersonCamera;
  private debugMode = false;
  private cameraDebugMesh: THREE.Group;
  private cameraHelper: THREE.CameraHelper;
  private overlay: HTMLDivElement;
  private pressedDebugKeys = new Set<string>();
  private gui: GUI;
  private sunDebugState: {
    debugView: boolean;
    x: number;
    y: number;
    z: number;
    intensity: number;
  };

  private timer = new THREE.Timer();
  private loadingMnager = new GameLoadingManager();
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();

    this.playerCamera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );

    // Very important initial camera position
    this.playerCamera.position.set(0, 12, 18);
    this.playerCamera.lookAt(0, 0, 0);

    this.debugCamera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    this.debugCamera.position.set(22, 18, 22);
    this.debugCamera.lookAt(0, 2, 0);

    this.keyboard = new Keyboard();

    this.renderer = new Renderer(canvas);

    this.controls = new OrbitControls(
      this.debugCamera,
      this.renderer.instance.domElement,
    );
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 2, 0);
    this.controls.enabled = false;
    this.controls.update();

    this.world = new World(
      this.scene,
      this.keyboard,
      this.loadingMnager.instance,
    );
    this.cameraDebugMesh = this.createCameraDebugMesh();
    this.scene.add(this.cameraDebugMesh);

    this.cameraHelper = new THREE.CameraHelper(this.playerCamera);
    this.scene.add(this.cameraHelper);

    this.overlay = this.createOverlay();
    this.sunDebugState = {
      debugView: this.debugMode,
      x: this.world.sunPivot.position.x,
      y: this.world.sunPivot.position.y,
      z: this.world.sunPivot.position.z,
      intensity: this.world.sun.intensity,
    };
    this.gui = this.createGui();
    this.updateOverlay();

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);

    this.renderer.instance.domElement.addEventListener("click", (event) => {
      const rect = this.renderer.instance.domElement.getBoundingClientRect();

      this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.getActiveCamera());

      const intersects = this.raycaster.intersectObjects(
        this.scene.children,
        true,
      );

      if (intersects.length > 0) {
        const point = intersects[0].point;
        console.log("Clicked point in world coordinates:", point);
      }
    });

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
        this.playerCamera,
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
    this.updateSunControls(delta);
    this.syncCameraDebugMesh();
    this.controls.enabled = this.debugMode;
    if (this.debugMode) {
      this.controls.update();
    }
    this.cameraHelper.visible = this.debugMode;
    this.world.setSunDebugVisible(this.debugMode);
    this.world.setPhysicsDebugVisible(this.debugMode);
    this.cameraHelper.update();

    this.renderer.render(this.scene, this.getActiveCamera());
  };
  private onResize = () => {
    const aspect = window.innerWidth / window.innerHeight;
    this.playerCamera.aspect = aspect;
    this.debugCamera.aspect = aspect;

    this.playerCamera.updateProjectionMatrix();
    this.debugCamera.updateProjectionMatrix();

    this.renderer.resize();
  };

  private getActiveCamera(): THREE.PerspectiveCamera {
    return this.debugMode ? this.debugCamera : this.playerCamera;
  }

  private createCameraDebugMesh(): THREE.Group {
    const group = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.9, 1),
      new THREE.MeshBasicMaterial({
        color: 0x4ecdc4,
        wireframe: true,
      }),
    );

    const lens = new THREE.Mesh(
      new THREE.ConeGeometry(0.35, 0.9, 12),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        wireframe: true,
      }),
    );

    lens.rotation.x = Math.PI / 2;
    lens.position.z = -0.95;

    group.add(body);
    group.add(lens);
    group.visible = false;

    return group;
  }

  private syncCameraDebugMesh(): void {
    this.cameraDebugMesh.visible = this.debugMode;
    this.cameraDebugMesh.position.copy(this.playerCamera.position);
    this.cameraDebugMesh.quaternion.copy(this.playerCamera.quaternion);
  }

  private createOverlay(): HTMLDivElement {
    const overlay = document.createElement("div");

    overlay.style.position = "fixed";
    overlay.style.left = "16px";
    overlay.style.top = "16px";
    overlay.style.padding = "12px 14px";
    overlay.style.background = "rgba(0, 0, 0, 0.55)";
    overlay.style.color = "#f7f4ea";
    overlay.style.fontFamily = "monospace";
    overlay.style.fontSize = "12px";
    overlay.style.lineHeight = "1.5";
    overlay.style.border = "1px solid rgba(255, 255, 255, 0.2)";
    overlay.style.borderRadius = "10px";
    overlay.style.pointerEvents = "none";
    overlay.style.whiteSpace = "pre-line";

    document.body.appendChild(overlay);

    return overlay;
  }

  private createGui() {
    const gui = new GUI({ width: 320 });
    const sunFolder = gui.addFolder("Sun Test Controls");

    gui
      .add(this.sunDebugState, "debugView")
      .name("Debug view")
      .onChange((value: boolean) => {
        this.debugMode = value;
        this.updateOverlay();
      });

    sunFolder
      .add(this.sunDebugState, "x", -50, 50, 0.1)
      .name("Sun X")
      .onChange((value: number) => {
        this.world.sunPivot.position.x = value;
        this.updateOverlay();
      });

    sunFolder
      .add(this.sunDebugState, "y", 1, 60, 0.1)
      .name("Sun Y")
      .onChange((value: number) => {
        this.world.sunPivot.position.y = value;
        this.updateOverlay();
      });

    sunFolder
      .add(this.sunDebugState, "z", -50, 50, 0.1)
      .name("Sun Z")
      .onChange((value: number) => {
        this.world.sunPivot.position.z = value;
        this.updateOverlay();
      });

    sunFolder
      .add(this.sunDebugState, "intensity", 0, 8, 0.1)
      .name("Intensity")
      .onChange((value: number) => {
        this.world.sun.intensity = value;
      });

    sunFolder.open();

    return gui;
  }

  private updateOverlay(): void {
    const modeLabel = this.debugMode ? "ON" : "OFF";
    const { x, y, z } = this.world.sunPivot.position;

    this.sunDebugState.debugView = this.debugMode;
    this.sunDebugState.x = x;
    this.sunDebugState.y = y;
    this.sunDebugState.z = z;
    this.sunDebugState.intensity = this.world.sun.intensity;

    this.overlay.textContent =
      `Debug view: ${modeLabel} (press C)\n` +
      `GUI: top-right sliders\n` +
      `Sun move: J/L = X, U/O = Y, I/K = Z\n` +
      `Sun position: ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}\n` +
      `Sun intensity: ${this.world.sun.intensity.toFixed(1)}`;

    for (const controller of this.gui.controllersRecursive()) {
      controller.updateDisplay();
    }
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (event.repeat) {
      return;
    }

    if (event.code === "KeyC") {
      this.debugMode = !this.debugMode;
      this.updateOverlay();
      return;
    }

    if (this.isSunControlKey(event.code)) {
      this.pressedDebugKeys.add(event.code);
    }
  };

  private onKeyUp = (event: KeyboardEvent) => {
    this.pressedDebugKeys.delete(event.code);
  };

  private isSunControlKey(code: string): boolean {
    return ["KeyJ", "KeyL", "KeyU", "KeyO", "KeyI", "KeyK"].includes(code);
  }

  private updateSunControls(delta: number): void {
    if (!this.debugMode) {
      if (this.pressedDebugKeys.size > 0) {
        this.pressedDebugKeys.clear();
      }
      return;
    }

    const speed = 8 * delta;
    let moveX = 0;
    let moveY = 0;
    let moveZ = 0;

    if (this.pressedDebugKeys.has("KeyJ")) moveX -= speed;
    if (this.pressedDebugKeys.has("KeyL")) moveX += speed;
    if (this.pressedDebugKeys.has("KeyU")) moveY += speed;
    if (this.pressedDebugKeys.has("KeyO")) moveY -= speed;
    if (this.pressedDebugKeys.has("KeyI")) moveZ -= speed;
    if (this.pressedDebugKeys.has("KeyK")) moveZ += speed;

    if (moveX !== 0 || moveY !== 0 || moveZ !== 0) {
      this.world.moveSun(moveX, moveY, moveZ);
      this.updateOverlay();
    }
  }
}
