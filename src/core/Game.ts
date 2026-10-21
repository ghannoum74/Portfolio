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

import rulesHtml from "../ui/PaperPanelContent/rules/rules.html?raw";
import "../ui/PaperPanelContent/rules/rules.css";
import { MailboxInteraction } from "../interactions/interactions/MailboxInteraction";
import { DoorInteraction } from "../interactions/interactions/DoorInteraction";
import { DialogueBox } from "../ui/DialogueBox/DialogueBox";
import { NpcInteraction } from "../interactions/interactions/NpcInteraction";
import { HelpButton } from "../ui/HelpButton/HelpButton";
import { createContactContent } from "../ui/PaperPanelContent/contact/contact";
import { WorldAudio } from "../audio/WorldAudio";
import { SoundButton } from "../ui/SoundButton/SoundButton";
import { SceneTransition } from "../ui/SceneTransition/SceneTransition";
import { HouseInterior } from "../world/house/HouseInterior";
import { ProjectBookInteraction } from "../interactions/interactions/ProjectBookInteraction";
import { ProjectBookCamera } from "../world/house/ProjectBookCamera";
import type { AnimatedBook3D } from "../world/house/AnimatedBook3D";
import { ProjectWebsitePreview } from "../ui/ProjectWebsitePreview/ProjectWebsitePreview";
import { BookPageControls } from "../ui/BookPageControls/BookPageControls";
import { WorkshopExperience } from "../world/house/workshop/WorkshopExperience";
import { WorkshopInteraction } from "../interactions/interactions/WorkshopInteraction";
import { JourneyMapExperience } from "../world/house/journey/JourneyMapExperience";
import { JourneyMapInteraction } from "../interactions/interactions/JourneyMapInteraction";
import { AwardsExperience } from "../world/house/awards/AwardsExperience";
import { AwardsInteraction } from "../interactions/interactions/AwardsInteraction";

import { HouseFurnitureInteractions } from "../world/house/furniture/HouseFurnitureInteractions";

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

  private readonly helpButton: HelpButton;

  private readonly worldAudio: WorldAudio;

  private readonly soundButton: SoundButton;

  private readonly sceneTransition: SceneTransition;

  private transitioning = false;

  private insideHouse = false;

  private houseInteractionsRegistered = false;

  private readonly houseReturnPosition = new THREE.Vector3();

  private houseReturnRotationY = 0;

  private readonly projectBookCamera: ProjectBookCamera;

  private projectBookMode:
    | "idle"
    | "opening"
    | "focusing"
    | "reading"
    | "returning" = "idle";

  private activeProjectBook: AnimatedBook3D | null = null;

  private projectBookMarker: THREE.Object3D | null = null;

  private readonly projectWebsitePreview: ProjectWebsitePreview;
  private readonly bookPageControls: BookPageControls;
  private workshop: WorkshopExperience | null = null;
  private journey: JourneyMapExperience | null = null;
  private awards: AwardsExperience | null = null;

  private furniture: HouseFurnitureInteractions | null = null;

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

    this.projectBookCamera = new ProjectBookCamera(this.playerCamera);

    this.projectWebsitePreview = new ProjectWebsitePreview(
      this.playerCamera,
      this.renderer.instance.domElement,
    );

    this.bookPageControls = new BookPageControls(
      this.playerCamera,
      () => {
        if (this.projectBookMode === "reading") {
          void this.activeProjectBook?.turnPage(-1);
        }
      },
      () => {
        if (this.projectBookMode === "reading") {
          void this.activeProjectBook?.turnPage(1);
        }
      },
    );

    this.controls = new OrbitControls(
      this.debugCamera,
      this.renderer.instance.domElement,
    );

    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 2, 0);
    this.controls.enabled = false;
    this.controls.update();

    this.worldAudio = new WorldAudio();

    this.soundButton = new SoundButton(() => {
      return this.worldAudio.toggleMuted();
    });

    this.soundButton.setVisible(false);

    const uiRoot = document.getElementById("ui-root");

    if (!uiRoot) {
      throw new Error("Missing #ui-root");
    }

    this.sceneTransition = new SceneTransition(uiRoot);

    this.paperPanel = new PaperPanel({
      onOpen: () => {
        this.keyboard.setEnabled(false);
        this.controls.enabled = false;
      },

      onClose: () => {
        if (this.phase === "rules") {
          this.phase = "playing";
          this.showDebugUI();
          this.helpButton.setVisible(true);
        }

        // Also supports future mailbox dialogs
        // opened during normal gameplay.
        if (this.phase === "playing") {
          this.keyboard.setEnabled(true);
        }

        this.soundButton.setVisible(true);

        this.worldAudio.start();
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

    this.helpButton = new HelpButton(() => {
      if (
        this.phase !== "playing" ||
        this.paperPanel.isOpen ||
        this.dialogueBox.isOpen
      ) {
        return;
      }

      this.paperPanel.open(this.createRulesContent(), "World guide");
    });

    this.helpButton.setVisible(false);

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
        this.renderer.instance.domElement,
        this.world.physics,
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

    this.entrance.raf(performance.now());

    if (this.phase === "loading") {
      return;
    }

    this.world.update(delta, !this.insideHouse);

    if (!this.insideHouse) {
      this.worldAudio.update(
        this.world.player.model.position,
        this.world.getTimeOfDay(),
      );
    }

    // Wait until the physical cover finishes opening
    // before moving the cinematic camera toward it.

    if (
      this.projectBookMode === "opening" &&
      this.activeProjectBook?.currentState === "open"
    ) {
      this.focusOnProjectBook();
    }

    // Only one main camera controller should control
    // the player camera at any given time.

    if (this.phase === "introduction") {
      this.thirdPersonCamera?.updateEntrance(this.entranceCameraProgress);
    } else if (
      this.projectBookMode === "focusing" ||
      this.projectBookMode === "reading" ||
      this.projectBookMode === "returning"
    ) {
      // Cinematic camera focused on the real 3D book.
      this.projectBookCamera.update(delta);
    } else if (this.workshop?.isControllingCamera) {
      // The workshop camera is driven in workshop.update() below.
    } else if (this.awards?.isControllingCamera) {
      // AwardsExperience owns the cinematic shot while inspecting.
    } else if (this.journey?.isControllingCamera) {
      // JourneyMapExperience animates the camera in its own update.
    } else if (this.furniture?.isControllingCamera) {
      // Rest camera is animated by furniture.update below.
    } else {
      // Normal third-person camera.
      this.thirdPersonCamera?.update(delta);
    }

    this.workshop?.update(delta);
    this.furniture?.update(delta);
    this.journey?.update(delta);
    this.awards?.update(delta);

    this.projectWebsitePreview.update(
      this.projectBookMode === "reading" ? this.activeProjectBook : null,
    );
    this.bookPageControls.update(
      this.projectBookMode === "reading" ? this.activeProjectBook : null,
    );

    const gameplayActive =
      this.phase === "playing" &&
      !this.transitioning &&
      this.projectBookMode === "idle" &&
      !this.workshop?.isControllingCamera &&
      !this.furniture?.isControllingCamera &&
      !this.journey?.isControllingCamera &&
      !this.awards?.isControllingCamera &&
      !this.paperPanel.isOpen &&
      !this.dialogueBox.isOpen;

    this.thirdPersonCamera?.setInputEnabled(gameplayActive && !this.debugMode);

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
    if (this.furniture?.isControllingCamera) return;

    if (this.journey?.isControllingCamera) {
      this.journey.clickAt(event.clientX, event.clientY);
      return;
    }

    if (this.awards?.isControllingCamera) {
      this.awards.clickAt(event.clientX, event.clientY);
      return;
    }

    if (this.workshop?.isControllingCamera) {
      if (this.workshop.mode === "active") {
        this.workshop.clickAt(event.clientX, event.clientY);
      }
      return;
    }

    if (this.projectBookMode === "reading") {
      this.projectWebsitePreview.openAt(
        this.activeProjectBook,
        event.clientX,
        event.clientY,
      );

      return;
    }

    if (
      this.phase !== "playing" ||
      this.projectBookMode !== "idle" ||
      this.transitioning ||
      this.paperPanel.isOpen
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
    this.gui.domElement.style.display = "none";

    this.renderer.stats.dom.style.display = "none";
  }

  private showDebugUI(): void {
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
    this.environmentDebugState.debugView = this.debugMode;

    this.environmentDebugState.realTime = this.world.isUsingRealTime();

    for (const controller of this.gui.controllersRecursive()) {
      controller.updateDisplay();
    }
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    // Bed / fireside cinematic: allow E or Esc to return, not gameplay input.
    if (this.furniture?.isControllingCamera) {
      if (event.code === "Escape" || event.code === "KeyE" || event.code === "Enter") {
        event.preventDefault();
        if (!event.repeat) this.furniture.leaveFocus();
      } else if (["Space", "KeyW", "KeyA", "KeyS", "KeyD", "ArrowLeft", "ArrowRight"].includes(event.code)) {
        event.preventDefault();
      }
      return;
    }

    if (this.journey?.isControllingCamera) {
      if (event.code === "Escape") {
        event.preventDefault();
        if (!event.repeat) this.leaveJourneyMap();
      } else if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
        event.preventDefault();
        if (!event.repeat) this.journey.selectRelative(event.code === "ArrowRight" ? 1 : -1);
      } else if (event.code === "KeyE" || event.code === "Enter") {
        event.preventDefault();
        if (!event.repeat) this.journey.toggleSelection();
      } else if (["Space", "KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)) {
        event.preventDefault();
      }
      return;
    }

    if (this.awards?.isControllingCamera) {
      if (event.code === "Escape") {
        event.preventDefault();
        if (!event.repeat) this.leaveAwardsExperience();
      } else if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
        event.preventDefault();
        if (!event.repeat) this.awards.selectRelative(event.code === "ArrowRight" ? 1 : -1);
      } else if (event.code === "KeyE" || event.code === "Enter") {
        event.preventDefault();
        if (!event.repeat) this.awards.toggleSelection();
      } else if (["Space", "KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)) {
        event.preventDefault();
      }
      return;
    }

    if (this.workshop?.isControllingCamera) {
      if (event.code === "Escape") {
        event.preventDefault();
        if (!event.repeat) this.leaveWorkshopExperience();
      } else if (event.code === "KeyE" || event.code === "Enter") {
        event.preventDefault();
        if (!event.repeat) this.workshop.toggleSelection();
      } else if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
        event.preventDefault();
        if (!event.repeat) {
          this.workshop.selectRelative(event.code === "ArrowLeft" ? -1 : 1);
        }
      } else if (["Space", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)) {
        event.preventDefault();
      }
      return;
    }

    if (this.projectBookMode !== "idle") {
      if (this.projectBookMode === "reading" && event.code === "KeyO") {
        event.preventDefault();
        if (!event.repeat)
          this.projectWebsitePreview.openCurrent(this.activeProjectBook);
        return;
      }

      if (event.code === "Escape") {
        event.preventDefault();

        if (!event.repeat) {
          this.leaveProjectBookReading();
        }

        return;
      }

      if (
        this.projectBookMode === "reading" &&
        (event.code === "ArrowRight" ||
          event.code === "ArrowLeft" ||
          event.code === "KeyE")
      ) {
        event.preventDefault();

        if (!event.repeat) {
          // Reverse or forward the same Blender morph-target animation.
          void this.activeProjectBook?.turnPage(
            event.code === "ArrowLeft" ? -1 : 1,
          );
        }

        return;
      }

      // Block gameplay controls while the cinematic
      // camera is focusing or returning.

      if (
        event.code === "Space" ||
        event.code === "ArrowRight" ||
        event.code === "ArrowLeft"
      ) {
        event.preventDefault();
      }

      return;
    }

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

        return;
      }

      if (event.code === "Escape") {
        event.preventDefault();

        this.dialogueBox.close();

        return;
      }

      return;
    }

    if (
      this.phase !== "playing" ||
      this.transitioning ||
      this.paperPanel.isOpen ||
      event.repeat
    ) {
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
      new MailboxInteraction(mailbox, this.paperPanel, createContactContent),
    );

    const door = this.world.model.getObjectByName("INTERACT_DOOR_01");

    if (!door) {
      throw new Error("Missing INTERACT_DOOR_01");
    }

    this.interactionSystem.register(
      new DoorInteraction(
        door,
        () => {
          void this.enterHouse();
        },
        "Enter",
      ),
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

  private async enterHouse(): Promise<void> {
    if (this.transitioning || this.insideHouse) {
      return;
    }

    this.transitioning = true;

    /*
     * Store the exact exterior position
     * so exiting returns us to where we
     * entered from.
     */
    this.world.player.getFeetPosition(this.houseReturnPosition);

    this.houseReturnRotationY = this.world.player.model.rotation.y;

    this.keyboard.setEnabled(false);

    let house: HouseInterior | undefined;

    try {
      /*
       * Completely cover the scene first.
       */
      await this.sceneTransition.fadeIn();

      house = await this.world.loadHouseInterior();

      const spawn = house.getSpawn();

      if (!spawn) {
        throw new Error("Missing SPAWN_HOUSE in house.glb");
      }

      this.registerHouseInteractions(house);

      const spawnPosition = new THREE.Vector3();

      spawn.getWorldPosition(spawnPosition);

      const spawnQuaternion = new THREE.Quaternion();

      spawn.getWorldQuaternion(spawnQuaternion);

      const spawnRotation = new THREE.Euler().setFromQuaternion(
        spawnQuaternion,
        "YXZ",
      );

      /*
       * Swap environments while the
       * cream overlay completely covers
       * the screen.
       */
      this.worldAudio.setActive(false);

      this.world.setExteriorVisible(false);

      this.world.setExteriorLightingEnabled(false);

      house.show();

      // Move the REAL Rapier player.
      const spawnForward = new THREE.Vector3(0, 0, 1)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), spawnRotation.y + Math.PI)
        .multiplyScalar(2);

      spawnPosition.add(spawnForward);

      this.world.player.teleport(spawnPosition, spawnRotation.y + Math.PI);

      this.thirdPersonCamera?.setInteriorMode(true);

      this.thirdPersonCamera?.snap();

      /*
       * First entry may require shader
       * compilation.
       *
       * Do it while the screen is covered
       * so there is no visible hitch.
       */
      await this.renderer.instance.compileAsync(this.scene, this.playerCamera);

      this.insideHouse = true;

      await this.sceneTransition.fadeOut();
    } catch (error) {
      console.error("Failed to enter house:", error);

      house?.hide();

      this.world.setExteriorVisible(true);

      this.world.setExteriorLightingEnabled(true);

      this.worldAudio.setActive(true);
      /*
       * Restore the player if something
       * failed after teleporting.
       */
      this.world.player.teleport(
        this.houseReturnPosition,
        this.houseReturnRotationY,
      );

      this.thirdPersonCamera?.setInteriorMode(false);

      this.thirdPersonCamera?.snap();

      await this.sceneTransition.fadeOut();
    } finally {
      this.transitioning = false;

      if (
        this.phase === "playing" &&
        !this.paperPanel.isOpen &&
        !this.dialogueBox.isOpen
      ) {
        this.keyboard.setEnabled(true);
      }
    }
  }

  private registerHouseInteractions(house: HouseInterior): void {
    if (this.houseInteractionsRegistered) {
      return;
    }

    const exitZone = house.getExitZone();
    const exitDoor = house.getExitDoor();

    if (!exitZone) {
      throw new Error("Missing ZONE_EXIT_DOOR in house.glb");
    }

    if (!exitDoor) {
      throw new Error("Missing INTERACT_EXIT_DOOR_01 in house.glb");
    }

    this.interactionSystem.register(
      new DoorInteraction(
        exitZone,
        () => {
          void this.exitHouse();
        },
        "Exit",
        exitDoor,
      ),
    );

    const anchor = house.model.getObjectByName("INTERACT_BOOK_PROJECTS");

    const book = house.projectBook;

    if (anchor && book) {
      this.interactionSystem.register(
        new ProjectBookInteraction(
          anchor,
          book.model,

          () => {
            this.startProjectBookReading(house);
          },

          () => {
            switch (book.currentState) {
              case "closed":
                return "Open Projects Book";

              case "opening":
                return "Opening book...";

              case "open":
                return "Turn Page";

              case "turning":
                return "Turning page...";

              default:
                return "Read Projects";
            }
          },
        ),
      );
    } else {
      console.warn("Animated Projects Book or interaction anchor missing");
    }

    // Reuse the existing Blender workshop stand as an E-key anchor.
    const workshopStand = house.model.getObjectByName("SEC_WORKSHOP_WeaponStand");
    if (workshopStand) {
      this.workshop = new WorkshopExperience(
        house.model, workshopStand, this.playerCamera, this.renderer.instance.domElement,
        () => !this.worldAudio.isMuted,
      );
      this.interactionSystem.register(
        new WorkshopInteraction(workshopStand, () => this.enterWorkshopExperience()),
      );
    } else {
      console.warn("Workshop asset SEC_WORKSHOP_WeaponStand not found in house.glb");
    }

    // Awards Hall: inspect the actual physical framed pictures and trophy.
    // No duplicated geometry or guessed certification claims.
    this.awards = new AwardsExperience(
      house.model,
      this.playerCamera,
      this.renderer.instance.domElement,
    );
    if (this.awards.exhibitCount > 0) {
      const exhibitNames = [
        "SEC_AWARDS_Frame_M",
        "SEC_AWARDS_Frame_S",
        "SEC_AWARDS_TrophyCup",
      ];
      for (const [index, name] of exhibitNames.entries()) {
        const exhibit = house.model.getObjectByName(name);
        if (!exhibit) continue;
        this.interactionSystem.register(
          new AwardsInteraction(exhibit, () => this.enterAwardsExperience(index)),
        );
      }
    }

    // Cartographer's Trail: interactive symbolic path on the REAL map table.
    const mapTop = house.model.getObjectByName("SEC_MAP_MapTop");
    const mapTable = house.model.getObjectByName("SEC_MAP_Table_Large");
    if (mapTop && mapTable) {
      this.journey = new JourneyMapExperience(
        house.model, mapTop, this.playerCamera, this.renderer.instance.domElement,
      );
      this.interactionSystem.register(
        new JourneyMapInteraction(mapTable, () => this.enterJourneyMap()),
      );
    } else {
      console.warn("Journey Map requires SEC_MAP_MapTop and SEC_MAP_Table_Large in house.glb");
    }

    // Extra cottage furniture: a single system for the remaining physical props.
    this.furniture = new HouseFurnitureInteractions(
      house.model,
      this.playerCamera,
      {
        onFocusStart: () => {
          if (
            this.phase !== "playing" || !this.insideHouse ||
            this.transitioning || this.projectBookMode !== "idle" ||
            this.paperPanel.isOpen || this.dialogueBox.isOpen
          ) return false;
          if (this.debugMode) {
            this.debugMode = false;
            this.updateOverlay();
          }
          this.keyboard.setEnabled(false);
          this.thirdPersonCamera?.setInputEnabled(false);
          this.renderer.setInteractionOutline(null);
          this.world.player.model.visible = false;
          this.helpButton.setVisible(false);
          return true;
        },
        onFocusEnd: () => {
          this.world.player.model.visible = true;
          this.thirdPersonCamera?.snap();
          this.helpButton.setVisible(this.phase === "playing");
          this.keyboard.setEnabled(
            this.phase === "playing" && this.insideHouse &&
            !this.transitioning && !this.paperPanel.isOpen && !this.dialogueBox.isOpen,
          );
        },
        isMuted: () => this.worldAudio.isMuted,
      },
    );
    this.furniture.register((interaction) => this.interactionSystem.register(interaction));

    this.houseInteractionsRegistered = true;
  }

  private async exitHouse(): Promise<void> {
    if (this.transitioning || !this.insideHouse) {
      return;
    }

    this.transitioning = true;

    this.keyboard.setEnabled(false);

    try {
      await this.sceneTransition.fadeIn();

      const house = await this.world.loadHouseInterior();

      house.hide();

      this.world.setExteriorVisible(true);

      this.world.setExteriorLightingEnabled(true);

      this.worldAudio.setActive(true);
      /*
       * Return exactly outside where
       * the visitor entered.
       */
      this.world.player.teleport(
        this.houseReturnPosition,
        this.houseReturnRotationY,
      );

      this.thirdPersonCamera?.setInteriorMode(false);

      this.thirdPersonCamera?.snap();

      this.insideHouse = false;

      await this.sceneTransition.fadeOut();
    } catch (error) {
      console.error("Failed to exit house:", error);

      await this.sceneTransition.fadeOut();
    } finally {
      this.transitioning = false;

      if (
        this.phase === "playing" &&
        !this.paperPanel.isOpen &&
        !this.dialogueBox.isOpen
      ) {
        this.keyboard.setEnabled(true);
      }
    }
  }

  private enterWorkshopExperience(): void {
    const workshop = this.workshop;
    if (!workshop || this.phase !== "playing" || !this.insideHouse ||
        this.transitioning || this.projectBookMode !== "idle") return;
    if (this.debugMode) {
      this.debugMode = false;
      this.updateOverlay();
    }
    if (!workshop.enter()) return;
    this.keyboard.setEnabled(false);
    this.thirdPersonCamera?.setInputEnabled(false);
    this.renderer.setInteractionOutline(null);
    this.world.player.model.visible = false;
  }

  private leaveWorkshopExperience(): void {
    this.workshop?.leave(() => {
      this.world.player.model.visible = true;
      this.thirdPersonCamera?.snap();
      this.keyboard.setEnabled(
        this.phase === "playing" && this.insideHouse &&
        !this.transitioning && !this.paperPanel.isOpen && !this.dialogueBox.isOpen,
      );
    });
  }

  private enterAwardsExperience(index: number): void {
    if (
      !this.awards || this.phase !== "playing" || !this.insideHouse ||
      this.transitioning || this.projectBookMode !== "idle" ||
      this.workshop?.isControllingCamera || this.paperPanel.isOpen ||
      this.dialogueBox.isOpen
    ) return;
    if (this.debugMode) {
      this.debugMode = false;
      this.updateOverlay();
    }
    if (!this.awards.enter(index)) return;
    this.keyboard.setEnabled(false);
    this.thirdPersonCamera?.setInputEnabled(false);
    this.renderer.setInteractionOutline(null);
    this.world.player.model.visible = false;
    this.helpButton.setVisible(false);
  }

  private leaveAwardsExperience(): void {
    this.awards?.leave(() => {
      this.world.player.model.visible = true;
      this.thirdPersonCamera?.snap();
      this.helpButton.setVisible(this.phase === "playing");
      this.keyboard.setEnabled(
        this.phase === "playing" && this.insideHouse &&
        !this.transitioning && !this.paperPanel.isOpen && !this.dialogueBox.isOpen,
      );
    });
  }

  private enterJourneyMap(): void {
    if (
      !this.journey || this.phase !== "playing" || !this.insideHouse ||
      this.transitioning || this.projectBookMode !== "idle" ||
      this.workshop?.isControllingCamera || this.awards?.isControllingCamera ||
      this.paperPanel.isOpen || this.dialogueBox.isOpen
    ) return;
    if (this.debugMode) {
      this.debugMode = false;
      this.updateOverlay();
    }
    if (!this.journey.enter()) return;
    this.keyboard.setEnabled(false);
    this.thirdPersonCamera?.setInputEnabled(false);
    this.renderer.setInteractionOutline(null);
    this.world.player.model.visible = false;
    this.helpButton.setVisible(false);
  }

  private leaveJourneyMap(): void {
    this.journey?.leave(() => {
      this.world.player.model.visible = true;
      this.thirdPersonCamera?.snap();
      this.helpButton.setVisible(this.phase === "playing");
      this.keyboard.setEnabled(
        this.phase === "playing" && this.insideHouse &&
        !this.transitioning && !this.paperPanel.isOpen && !this.dialogueBox.isOpen,
      );
    });
  }

  private startProjectBookReading(house: HouseInterior): void {
    if (
      this.phase !== "playing" ||
      !this.insideHouse ||
      this.transitioning ||
      this.projectBookMode !== "idle"
    ) {
      return;
    }

    const book = house.projectBook;

    const marker = house.model.getObjectByName("CAMERA_PROJECT_BOOK");

    if (!book || !marker) {
      console.warn("Animated book or CAMERA_PROJECT_BOOK missing");
      return;
    }

    // Don't interrupt a running paper animation.
    if (
      book.currentState === "opening" ||
      book.currentState === "turning" ||
      book.currentState === "preparing"
    ) {
      return;
    }

    this.activeProjectBook = book;
    this.projectBookMarker = marker;
    this.projectBookMode = "opening";

    // Always render through the gameplay camera
    // during this cinematic interaction.
    if (this.debugMode) {
      this.debugMode = false;
      this.updateOverlay();
    }

    // Freeze player and mouse-camera input.
    this.keyboard.setEnabled(false);
    this.thirdPersonCamera?.setInputEnabled(false);

    // Clear the book's proximity outline.
    this.renderer.setInteractionOutline(null);

    if (book.currentState === "closed") {
      book.open();

      // If the GLB animation couldn't start,
      // don't leave the player controls locked.
      if (book.currentState === "closed") {
        this.finishProjectBookReading();
      }

      return;
    }

    // The player may return to a previously opened book.
    this.focusOnProjectBook();
  }

  private focusOnProjectBook(): void {
    if (
      !this.activeProjectBook ||
      !this.projectBookMarker ||
      this.projectBookMode !== "opening"
    ) {
      return;
    }

    this.projectBookMode = "focusing";

    // Keep the character from blocking the close-up.
    this.world.player.model.visible = false;

    try {
      this.projectBookCamera.focus(
        this.activeProjectBook.model,
        this.projectBookMarker,
        () => {
          if (this.projectBookMode === "focusing") {
            this.projectBookMode = "reading";
          }
        },
      );
    } catch (error) {
      console.error("Could not focus Projects Book:", error);
      this.finishProjectBookReading();
    }
  }

  private leaveProjectBookReading(): void {
    this.projectWebsitePreview.hide();
    this.bookPageControls.hide();

    if (
      this.projectBookMode === "idle" ||
      this.projectBookMode === "returning"
    ) {
      return;
    }

    // If the cover is still opening, we haven't
    // started the cinematic camera movement.
    if (this.projectBookMode === "opening") {
      this.finishProjectBookReading();
      return;
    }

    this.projectBookMode = "returning";

    this.projectBookCamera.returnToPlayer(() => {
      this.finishProjectBookReading();
    });
  }

  private finishProjectBookReading(): void {
    this.projectWebsitePreview.hide();
    this.bookPageControls.hide();
    this.projectBookCamera.cancel();

    this.projectBookMode = "idle";
    this.activeProjectBook = null;
    this.projectBookMarker = null;

    // Reveal the player again.
    this.world.player.model.visible = true;

    // Resume normal camera-follow behavior.
    this.thirdPersonCamera?.snap();

    this.keyboard.setEnabled(
      this.phase === "playing" &&
        this.insideHouse &&
        !this.transitioning &&
        !this.paperPanel.isOpen &&
        !this.dialogueBox.isOpen,
    );
  }
}
