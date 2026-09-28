import * as THREE from "three";

import { Renderer } from "./Renderer";
import { World } from "../world/World";
import { Keyboard } from "../input/Keyboard";

import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ThirdPersonCamera } from "../camera/ThirdPersonCamera";

import GUI from "three/examples/jsm/libs/lil-gui.module.min.js";

import { StartupLoading } from "../loaders/StartupLoading";

import { PaperPanel } from "../ui/PaperPanel/PaperPanel";

import { WorldEntrance } from "../ui/WorldEntrance/WorldEntrance";

import rulesHtml from "../ui/PaperPanelContent/rules.html?raw";
import "../ui/PaperPanelContent/rules.css";

type GamePhase = "loading" | "introduction" | "rules" | "playing";

export class Game {
  private scene: THREE.Scene;
  private renderer: Renderer;

  private playerCamera: THREE.PerspectiveCamera;
  private debugCamera: THREE.PerspectiveCamera;

  private world: World;
  private keyboard: Keyboard;

  private controls: OrbitControls;
  private thirdPersonCamera?: ThirdPersonCamera;

  private readonly paperPanel: PaperPanel;
  private readonly entrance: WorldEntrance;

  private readonly loading = new StartupLoading();

  private phase: GamePhase = "loading";

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

    // Gameplay input remains disabled
    // until the introductory rules close.
    this.keyboard = new Keyboard();
    this.keyboard.setEnabled(false);

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

    /*
     * Reusable dialog:
     * It doesn't own the application's phase.
     * It simply notifies Game when it opens
     * or closes.
     */
    this.paperPanel = new PaperPanel({
      onOpen: () => {
        this.keyboard.setEnabled(false);
        this.controls.enabled = false;
        this.pressedDebugKeys.clear();
      },

      onClose: () => {
        if (this.phase === "rules") {
          this.phase = "playing";
          this.showDebugUI();
        }

        // Also supports future mailbox dialogs
        // opened during normal gameplay.
        if (this.phase === "playing") {
          this.keyboard.setEnabled(true);
        }
      },
    });

    this.world = new World(
      this.scene,
      this.keyboard,
      this.loading.manager,
      this.loading.assetReady,
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

    /*
     * The entrance owns the scrolling effect.
     * Game owns what happens afterward.
     */
    this.entrance = new WorldEntrance(() => this.openIntroductionRules());

    this.hideDebugUI();

    window.addEventListener("keydown", this.onKeyDown);

    window.addEventListener("keyup", this.onKeyUp);

    this.renderer.instance.domElement.addEventListener(
      "click",
      this.onCanvasClick,
    );

    window.addEventListener("resize", this.onResize);

    this.renderer.instance.setAnimationLoop(this.update);

    void this.init();
  }

  private async init(): Promise<void> {
    try {
      await this.world.init();

      this.loading.verify();

      this.thirdPersonCamera = new ThirdPersonCamera(
        this.playerCamera,
        this.world.player.model,
      );

      this.thirdPersonCamera.update(1 / 60);

      await this.renderer.instance.compileAsync(this.scene, this.playerCamera);

      this.cameraHelper.visible = false;
      this.cameraDebugMesh.visible = false;

      this.world.setSunDebugVisible(false);

      this.world.setPhysicsDebugVisible(false);

      // Render the initial world behind
      // the loading screen.
      this.renderer.render(this.scene, this.playerCamera);

      /*
       * The scene is ready, but gameplay
       * is not available yet.
       */
      this.phase = "introduction";

      // Wait for the loading fade-out.
      await this.loading.complete();

      // Now the visitor may scroll.
      this.entrance.activate();
    } catch (error) {
      this.phase = "loading";

      this.loading.showError(error);
    }
  }

  private openIntroductionRules(): void {
    if (this.phase !== "introduction") {
      return;
    }

    this.phase = "rules";

    const template = document.createElement("template");

    template.innerHTML = rulesHtml.trim();

    /*
     * The world has fully expanded
     * and document scrolling is locked.
     *
     * Display the existing rules paper.
     */
    this.paperPanel.open(template.content, "World rules");
  }

  private update = (): void => {
    this.timer.update();

    const delta = this.timer.getDelta();

    // smooth scrolling
    this.entrance.raf(performance.now());

    if (this.phase === "loading") {
      return;
    }

    /*
     * Keep physics and animations running
     * in the background.
     *
     * Keyboard input remains disabled
     * until gameplay begins.
     */
    this.world.update(delta);

    this.thirdPersonCamera?.update(delta);

    const gameplayActive = this.phase === "playing" && !this.paperPanel.isOpen;

    if (gameplayActive) {
      this.updateSunControls(delta);
    }

    this.syncCameraDebugMesh();

    this.controls.enabled = gameplayActive && this.debugMode;

    if (this.controls.enabled) {
      this.controls.update();
    }

    const showDebug = gameplayActive && this.debugMode;

    this.cameraHelper.visible = showDebug;

    this.world.setSunDebugVisible(showDebug);

    this.world.setPhysicsDebugVisible(showDebug);

    this.cameraHelper.update();

    this.renderer.render(this.scene, this.getActiveCamera());
  };

  private onResize = (): void => {
    const aspect = window.innerWidth / window.innerHeight;

    this.playerCamera.aspect = aspect;

    this.debugCamera.aspect = aspect;

    this.playerCamera.updateProjectionMatrix();

    this.debugCamera.updateProjectionMatrix();

    this.renderer.resize();
  };

  private onCanvasClick = (event: MouseEvent): void => {
    if (this.phase !== "playing" || this.paperPanel.isOpen) {
      return;
    }

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

      // Future interaction logic.
      // console.log(point);
    }
  };

  private getActiveCamera(): THREE.PerspectiveCamera {
    return this.debugMode ? this.debugCamera : this.playerCamera;
  }

  private hideDebugUI(): void {
    this.overlay.style.display = "none";

    this.gui.domElement.style.display = "none";

    this.renderer.stats.dom.style.display = "none";
  }

  private showDebugUI(): void {
    this.overlay.style.display = "";

    this.gui.domElement.style.display = "";

    this.renderer.stats.dom.style.display = "";
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
    this.cameraDebugMesh.visible =
      this.phase === "playing" && this.debugMode && !this.paperPanel.isOpen;

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

  private createGui(): GUI {
    const gui = new GUI({
      width: 320,
    });

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

  private onKeyDown = (event: KeyboardEvent): void => {
    if (this.phase !== "playing" || this.paperPanel.isOpen || event.repeat) {
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

  private onKeyUp = (event: KeyboardEvent): void => {
    this.pressedDebugKeys.delete(event.code);
  };

  private isSunControlKey(code: string): boolean {
    return ["KeyJ", "KeyL", "KeyU", "KeyO", "KeyI", "KeyK"].includes(code);
  }

  private updateSunControls(delta: number): void {
    if (!this.debugMode) {
      this.pressedDebugKeys.clear();
      return;
    }

    const speed = 8 * delta;

    let moveX = 0;
    let moveY = 0;
    let moveZ = 0;

    if (this.pressedDebugKeys.has("KeyJ")) {
      moveX -= speed;
    }

    if (this.pressedDebugKeys.has("KeyL")) {
      moveX += speed;
    }

    if (this.pressedDebugKeys.has("KeyU")) {
      moveY += speed;
    }

    if (this.pressedDebugKeys.has("KeyO")) {
      moveY -= speed;
    }

    if (this.pressedDebugKeys.has("KeyI")) {
      moveZ -= speed;
    }

    if (this.pressedDebugKeys.has("KeyK")) {
      moveZ += speed;
    }

    if (moveX !== 0 || moveY !== 0 || moveZ !== 0) {
      this.world.moveSun(moveX, moveY, moveZ);

      this.updateOverlay();
    }
  }
}
