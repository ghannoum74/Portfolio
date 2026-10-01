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

import { InteractionSystem } from "../interactions/InteractionSystem";

import rulesHtml from "../ui/PaperPanelContent/rules.html?raw";
import "../ui/PaperPanelContent/rules.css";
import { MailboxInteraction } from "../interactions/interactions/MailboxInteraction";
import { DoorInteraction } from "../interactions/interactions/DoorInteraction";
import { DialogueBox } from "../ui/DialogueBox/DialogueBox";
import { NpcInteraction } from "../interactions/interactions/NpcInteraction";

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

  private entranceCameraProgress = 0;

  private debugMode = false;

  private cameraDebugMesh: THREE.Group;
  private cameraHelper: THREE.CameraHelper;

  private overlay: HTMLDivElement;

  private gui: GUI;

  private environmentDebugState: {
    debugView: boolean;
    realTime: boolean;
    hour: number;
  };

  private debugUiElapsed = 0;

  private timer = new THREE.Timer();
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private clickedWorldPoint: THREE.Vector3 | null = null;

  private readonly interactionSystem: InteractionSystem;
  private readonly dialogueBox: DialogueBox;

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

    this.renderer.setupInteractionOutline(this.scene, this.playerCamera);

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

    this.dialogueBox = new DialogueBox({
      onOpen: () => {
        this.keyboard.setEnabled(false);

        this.controls.enabled = false;
      },

      onClose: () => {
        if (this.phase === "playing" && !this.paperPanel.isOpen) {
          this.keyboard.setEnabled(true);
        }
      },
    });

    this.interactionSystem = new InteractionSystem((interactable) => {
      this.renderer.setInteractionOutline(
        interactable?.highlightTarget ?? null,
      );
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

    this.environmentDebugState = {
      debugView: this.debugMode,
      realTime: this.world.isUsingRealTime(),
      hour: this.world.getTimeOfDay(),
    };

    this.gui = this.createGui();

    this.updateOverlay();

    /*
     * The entrance owns the scrolling effect.
     * Game owns what happens afterward.
     */
    this.entrance = new WorldEntrance({
      onProgress: (progress) => {
        this.entranceCameraProgress = progress;
      },

      onComplete: () => {
        this.openIntroductionRules();
      },
    });

    this.hideDebugUI();

    window.addEventListener("keydown", this.onKeyDown);

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

      this.setupInteractions();

      const mailbox = this.world.model.getObjectByName("INTERACT_MAILBOX_01");

      if (!mailbox) {
        throw new Error("Missing INTERACT_MAILBOX_01");
      }

      this.loading.verify();

      this.thirdPersonCamera = new ThirdPersonCamera(
        this.playerCamera,
        this.world.player.model,
      );

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

      this.loadNpcsInBackground();

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

    this.paperPanel.open(this.createRulesContent(), "World rules");
  }

  private update = (): void => {
    this.timer.update();

    const delta = this.timer.getDelta();

    this.debugUiElapsed += delta;

    if (this.debugMode && this.debugUiElapsed >= 0.25) {
      this.debugUiElapsed = 0;

      this.updateOverlay();
    }

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

    if (this.phase === "introduction") {
      this.thirdPersonCamera?.updateEntrance(this.entranceCameraProgress);
    } else {
      this.thirdPersonCamera?.update(delta);
    }

    const gameplayActive =
      this.phase === "playing" &&
      !this.paperPanel.isOpen &&
      !this.dialogueBox.isOpen;

    if (gameplayActive) {
      this.interactionSystem.update(this.world.player.model.position);
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
    if (
      event.button !== 0 ||
      this.phase !== "playing" ||
      this.paperPanel.isOpen ||
      this.dialogueBox.isOpen
    ) {
      return;
    }

    const rect = this.renderer.instance.domElement.getBoundingClientRect();

    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;

    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.getActiveCamera());

    const intersects = this.raycaster.intersectObject(this.world.model, true);

    const hit = intersects.find(({ object }) => {
      for (
        let current: THREE.Object3D | null = object;
        current;
        current = current.parent
      ) {
        if (!current.visible) return false;
      }
      return true;
    });

    this.clickedWorldPoint = hit ? hit.point.clone() : null;

    if (this.clickedWorldPoint) {
      const { x, y, z } = this.clickedWorldPoint;
      console.log("Clicked world coordinates:", { x, y, z });
    }

    this.updateOverlay();
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

    gui
      .add(this.environmentDebugState, "debugView")
      .name("Debug view")
      .onChange((value: boolean) => {
        this.debugMode = value;

        this.updateOverlay();
      });

    const environmentFolder = gui.addFolder("Day / Night");

    const hourController = environmentFolder
      .add(this.environmentDebugState, "hour", 0, 23.99, 0.01)
      .name("Preview hour")
      .onChange((value: number) => {
        if (this.environmentDebugState.realTime) {
          return;
        }

        this.world.setTimeOfDay(value);

        this.updateOverlay();
      });

    environmentFolder
      .add(this.environmentDebugState, "realTime")
      .name("Real time")
      .onChange((realTime: boolean) => {
        if (realTime) {
          /*
           * null means:
           * return control to the visitor's
           * actual local clock.
           */
          this.world.setTimeOfDay(null);

          this.environmentDebugState.hour = this.world.getTimeOfDay();

          hourController.disable();
        } else {
          /*
           * Freeze the world at whatever
           * hour the slider currently shows.
           */
          this.world.setTimeOfDay(this.environmentDebugState.hour);

          hourController.enable();
        }

        this.updateOverlay();
      });

    if (this.environmentDebugState.realTime) {
      hourController.disable();
    }

    environmentFolder.open();

    return gui;
  }

  private updateOverlay(): void {
    const modeLabel = this.debugMode ? "ON" : "OFF";

    const hour = this.world.getTimeOfDay();

    const hours = Math.floor(hour);

    const minutes = Math.floor((hour - hours) * 60);

    const formattedTime =
      `${String(hours).padStart(2, "0")}:` +
      `${String(minutes).padStart(2, "0")}`;

    const timeMode = this.world.isUsingRealTime() ? "REAL TIME" : "PREVIEW";

    this.environmentDebugState.debugView = this.debugMode;

    this.environmentDebugState.realTime = this.world.isUsingRealTime();

    if (this.environmentDebugState.realTime) {
      this.environmentDebugState.hour = hour;
    }

    const period = this.getTimePeriod(hour);

    const { x, y, z } = this.world.sunPivot.position;

    this.overlay.textContent =
      `Debug view: ${modeLabel} (press C)\n` +
      `Time mode: ${timeMode}\n` +
      `World time: ${formattedTime}\n` +
      `Period: ${period}\n` +
      `Sun: ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}\n` +
      `Sun intensity: ${this.world.sun.intensity.toFixed(2)}\n` +
      `Ambient: ${this.world.ambientLight.intensity.toFixed(2)}\n` +
      (this.clickedWorldPoint
        ? `Clicked world: X ${this.clickedWorldPoint.x.toFixed(3)}, ` +
          `Y ${this.clickedWorldPoint.y.toFixed(3)}, ` +
          `Z ${this.clickedWorldPoint.z.toFixed(3)}`
        : "Click a world surface to get X, Y, Z");

    for (const controller of this.gui.controllersRecursive()) {
      controller.updateDisplay();
    }
  }

  private getTimePeriod(hour: number): string {
    if (hour >= 5 && hour < 8) {
      return "Morning";
    }

    if (hour >= 8 && hour < 17) {
      return "Day";
    }

    if (hour >= 17 && hour < 20) {
      return "Sunset";
    }

    return "Night";
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    /*
     * Dialogue gets first priority.
     */
    if (this.dialogueBox.isOpen) {
      if (event.repeat) {
        return;
      }

      if (
        event.code === "KeyE" ||
        event.code === "Enter" ||
        event.code === "Space"
      ) {
        event.preventDefault();

        this.dialogueBox.next();
      }

      if (event.code === "Escape") {
        this.dialogueBox.close();
      }

      return;
    }

    if (this.phase !== "playing" || this.paperPanel.isOpen || event.repeat) {
      return;
    }

    if (event.code === "KeyE") {
      this.interactionSystem.interact();

      return;
    }

    if (event.code === "KeyC") {
      this.debugMode = !this.debugMode;

      this.updateOverlay();

      return;
    }
  };
  private createRulesContent(): DocumentFragment {
    const template = document.createElement("template");

    template.innerHTML = rulesHtml.trim();

    return template.content;
  }

  private setupInteractions(): void {
    const mailbox = this.world.model.getObjectByName("INTERACT_MAILBOX_01");

    if (!mailbox) {
      throw new Error("Missing INTERACT_MAILBOX_01");
    }

    this.interactionSystem.register(
      new MailboxInteraction(
        mailbox,
        this.paperPanel,
        this.createRulesContent(),
      ),
    );

    const door = this.world.model.getObjectByName("INTERACT_DOOR_01");

    if (!door) {
      throw new Error("Missing INTERACT_DOOR_01");
    }

    this.interactionSystem.register(
      new DoorInteraction(door, () => {
        console.log("Door entered");
      }),
    );
  }

  private async loadNpcsInBackground(): Promise<void> {
    try {
      await this.world.loadNpcs();

      for (const npc of this.world.npcs) {
        this.interactionSystem.register(
          new NpcInteraction(npc, this.world.player.model, this.dialogueBox),
        );
      }
    } catch (error) {
      console.error("Failed to load NPCs:", error);
    }
  }
}
