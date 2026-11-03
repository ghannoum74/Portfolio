import * as THREE from "three";

import { Renderer } from "./Renderer";

import { VisibleAnimationLoop } from "./VisibleAnimationLoop";

import { World } from "../world/World";

import { Keyboard } from "../input/Keyboard";
import { MobileControls, type MobileContext } from "../input/MobileControls";

import { ThirdPersonCamera } from "../camera/ThirdPersonCamera";

import { TimeOfDay } from "../ui/TimeOfDay/TimeOfDay";

import { StartupLoading } from "../loaders/StartupLoading";
import type { LoadingScreen } from "../ui/LoadingScreen/LoadingScreen";

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
import {
  HouseFirstVisitGuide,
  houseTourSteps,
} from "../world/house/HouseFirstVisitGuide";
import { HouseTourPath } from "../world/house/HouseTourPath";

type GamePhase = "loading" | "introduction" | "rules" | "playing";

export class Game {
  private scene: THREE.Scene;
  private renderer: Renderer;

  private playerCamera: THREE.PerspectiveCamera;

  private world: World;
  private keyboard: Keyboard;
  private readonly mobileControls: MobileControls;

  private thirdPersonCamera?: ThirdPersonCamera;

  private readonly paperPanel: PaperPanel;
  private readonly entrance: WorldEntrance;

  private readonly loading: StartupLoading;

  private phase: GamePhase = "loading";

  private entranceCameraProgress = 0;

  private readonly timeOfDay: TimeOfDay;

  private controlsUiElapsed = 0;

  private timer = new THREE.Timer();

  private readonly interactionSystem: InteractionSystem;
  private readonly dialogueBox: DialogueBox;

  private readonly helpButton: HelpButton;

  private readonly worldAudio: WorldAudio;

  private readonly soundButton: SoundButton;

  private readonly sceneTransition: SceneTransition;

  private transitioning = false;
  private preparingScene = false;

  private insideHouse = false;

  private houseInteractionsRegistered = false;

  private readonly houseReturnPosition = new THREE.Vector3();

  private houseReturnRotationY = 0;

  private readonly projectBookCamera: ProjectBookCamera;

  private projectBookMode:
    "idle" | "opening" | "focusing" | "reading" | "returning" = "idle";

  private activeProjectBook: AnimatedBook3D | null = null;

  private projectBookMarker: THREE.Object3D | null = null;

  private readonly projectWebsitePreview: ProjectWebsitePreview;
  private readonly bookPageControls: BookPageControls;
  private workshop: WorkshopExperience | null = null;
  private journey: JourneyMapExperience | null = null;
  private awards: AwardsExperience | null = null;

  private furniture: HouseFurnitureInteractions | null = null;
  private houseGuide: HouseFirstVisitGuide | null = null;

  constructor(canvas: HTMLCanvasElement, screen?: LoadingScreen) {
    this.loading = new StartupLoading(screen);
    this.scene = new THREE.Scene();

    this.playerCamera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );

    this.playerCamera.position.set(0, 12, 18);

    this.playerCamera.lookAt(0, 0, 0);

    this.keyboard = new Keyboard();
    this.keyboard.setEnabled(false);

    this.renderer = new Renderer(canvas);

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
      },

      onClose: () => {
        if (this.phase === "rules") {
          this.phase = "playing";
          this.showWorldControls();
          this.helpButton.setVisible(true);
        }

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

    this.timeOfDay = new TimeOfDay(uiRoot, this.world);

    this.mobileControls = new MobileControls(this.keyboard, (code) =>
      this.handleCommand({ code, repeat: false, preventDefault() {} }),
    );

    this.updateOverlay();

    this.entrance = new WorldEntrance({
      onEnter: () => {
        void this.mobileControls.requestLandscape();
      },
      onProgress: (progress) => {
        this.entranceCameraProgress = progress;
      },

      onComplete: () => {
        this.openIntroductionRules();
      },
    });

    this.hideWorldControls();

    window.addEventListener("keydown", this.onKeyDown);

    this.renderer.instance.domElement.addEventListener(
      "click",
      this.onCanvasClick,
    );

    window.addEventListener("resize", this.onResize);

    this.timer.connect(document);
    new VisibleAnimationLoop(
      document,
      (callback) => this.renderer.instance.setAnimationLoop(callback),
      this.update,
      () => this.timer.reset(),
    );

    void this.init();
  }

  private async init(): Promise<void> {
    try {
      await this.world.init();

      this.setupInteractions();
      this.registerNpcInteractions();

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

      await this.renderer.prepareScene(this.scene, this.playerCamera);

      await this.renderer.prepareHighlights(
        this.scene,
        this.playerCamera,
        this.interactionSystem.highlightTargets,
      );

      this.renderer.render(this.scene, this.playerCamera);

      this.phase = "introduction";

      this.entrance.prepare();
      await this.loading.complete();

      this.loadNpcsInBackground();

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

    this.controlsUiElapsed += delta;
    if (this.phase === "playing" && this.controlsUiElapsed >= 1) {
      this.controlsUiElapsed = 0;
      this.updateOverlay();
    }

    this.timeOfDay.setVisible(
      this.phase === "playing" &&
        !this.insideHouse &&
        !this.transitioning &&
        !this.preparingScene &&
        !this.paperPanel.isOpen &&
        !this.dialogueBox.isOpen,
    );

    this.entrance.raf(performance.now());

    this.mobileControls?.setWorldActive(
      this.phase === "playing" || this.phase === "rules",
    );
    if (this.transitioning || this.preparingScene)
      this.mobileControls?.setContext(this.mobileContext(false));
    if (this.mobileControls?.isBlocking) {
      this.thirdPersonCamera?.setInputEnabled(false);

      return;
    }

    if (this.phase === "loading" || this.preparingScene) {
      return;
    }

    this.world.update(delta, !this.insideHouse);

    if (!this.insideHouse) {
      this.worldAudio.update(
        this.world.player.model.position,
        this.world.getTimeOfDay(),
      );
    }

    if (
      this.projectBookMode === "opening" &&
      this.activeProjectBook?.currentState === "open"
    ) {
      this.focusOnProjectBook();
    }

    this.houseGuide?.update(
      delta,
      this.insideHouse &&
        this.phase === "playing" &&
        !this.transitioning &&
        this.projectBookMode === "idle" &&
        !this.workshop?.isControllingCamera &&
        !this.awards?.isControllingCamera &&
        !this.journey?.isControllingCamera &&
        !this.furniture?.isControllingCamera &&
        !this.paperPanel.isOpen &&
        !this.dialogueBox.isOpen,
    );

    const cameraControlled =
      this.houseGuide?.isControllingCamera ||
      this.workshop?.isControllingCamera ||
      this.awards?.isControllingCamera ||
      this.journey?.isControllingCamera ||
      this.furniture?.isControllingCamera;
    if (this.phase === "introduction") {
      this.thirdPersonCamera?.updateEntrance(this.entranceCameraProgress);
    } else if (
      !this.houseGuide?.isControllingCamera &&
      (this.projectBookMode === "focusing" ||
        this.projectBookMode === "reading" ||
        this.projectBookMode === "returning")
    ) {
      this.projectBookCamera.update(delta);
    } else if (!cameraControlled) {
      this.thirdPersonCamera?.update(delta);
    }

    if (this.insideHouse) {
      this.workshop?.update(delta);
      this.furniture?.update(delta);
      this.journey?.update(delta);
      this.awards?.update(delta);
    }

    this.projectWebsitePreview.update(
      this.projectBookMode === "reading" ? this.activeProjectBook : null,
    );
    this.bookPageControls.update(
      this.projectBookMode === "reading" ? this.activeProjectBook : null,
    );

    const gameplayActive =
      this.phase === "playing" &&
      !this.transitioning &&
      !this.houseGuide?.isControllingCamera &&
      this.projectBookMode === "idle" &&
      !this.workshop?.isControllingCamera &&
      !this.furniture?.isControllingCamera &&
      !this.journey?.isControllingCamera &&
      !this.awards?.isControllingCamera &&
      !this.paperPanel.isOpen &&
      !this.dialogueBox.isOpen;

    this.thirdPersonCamera?.setInputEnabled(gameplayActive);

    if (gameplayActive) {
      this.interactionSystem.update(this.world.player.model.position);
    }
    this.mobileControls?.setContext(this.mobileContext(gameplayActive));

    this.renderer.render(this.scene, this.playerCamera);
  };

  private onResize = (): void => {
    const aspect = window.innerWidth / window.innerHeight;

    this.playerCamera.aspect = aspect;

    this.playerCamera.updateProjectionMatrix();

    this.renderer.resize();

    this.updateOverlay();
  };

  private onCanvasClick = (event: MouseEvent): void => {
    if (this.mobileControls?.isBlocking) return;
    if (this.houseGuide?.isControllingCamera) return;
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
  };

  private hideWorldControls(): void {
    this.timeOfDay.setVisible(false);
  }

  private showWorldControls(): void {
    this.timeOfDay.setVisible(!this.insideHouse);
  }

  private updateOverlay(): void {
    this.timeOfDay.sync();
  }

  private mobileContext(gameplayActive: boolean): MobileContext {
    const context: MobileContext = {
      movement: false,
      action: null,
      back: false,
      navigation: false,
      openProject: false,
    };
    if (
      this.transitioning ||
      this.preparingScene ||
      this.paperPanel.isOpen ||
      this.houseGuide?.isControllingCamera
    )
      return context;
    if (this.dialogueBox.isOpen)
      return { ...context, action: "Continue", back: true };
    if (this.furniture?.isControllingCamera)
      return { ...context, back: !this.furniture.isPanelOpen };
    if (
      this.workshop?.isControllingCamera ||
      this.awards?.isControllingCamera ||
      this.journey?.isControllingCamera
    ) {
      return { ...context, action: "Details", back: true, navigation: true };
    }
    if (this.projectBookMode === "reading")
      return { ...context, navigation: true, back: true, openProject: true };
    if (this.projectBookMode !== "idle")
      return { ...context, back: this.projectBookMode !== "returning" };
    return {
      ...context,
      movement: gameplayActive,
      action: gameplayActive ? this.interactionSystem.activeHint : null,
    };
  }

  private onKeyDown = (event: KeyboardEvent): void => this.handleCommand(event);

  private handleCommand(
    event: Pick<KeyboardEvent, "code" | "repeat" | "preventDefault">,
  ): void {
    if (this.mobileControls?.isBlocking) {
      event.preventDefault();
      return;
    }
    if (this.houseGuide?.isControllingCamera) {
      if (
        [
          "Escape",
          "KeyE",
          "Enter",
          "Space",
          "KeyW",
          "KeyA",
          "KeyS",
          "KeyD",
          "ArrowLeft",
          "ArrowRight",
        ].includes(event.code)
      ) {
        event.preventDefault();
        if (!event.repeat) {
          if (event.code === "Escape") this.houseGuide.skip();
          else if (["KeyE", "Enter", "Space"].includes(event.code))
            this.houseGuide.advance();
        }
      }
      return;
    }

    if (this.furniture?.isControllingCamera) {
      if (
        [
          "Escape",
          "KeyE",
          "Enter",
          "Space",
          "KeyW",
          "KeyA",
          "KeyS",
          "KeyD",
          "ArrowLeft",
          "ArrowRight",
        ].includes(event.code)
      ) {
        event.preventDefault();
        if (!event.repeat) this.furniture.handleFocusKey(event.code);
      }
      return;
    }

    if (this.journey?.isControllingCamera) {
      if (event.code === "Escape") {
        event.preventDefault();
        if (!event.repeat) this.leaveJourneyMap();
      } else if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
        event.preventDefault();
        if (!event.repeat)
          this.journey.selectRelative(event.code === "ArrowRight" ? 1 : -1);
      } else if (event.code === "KeyE" || event.code === "Enter") {
        event.preventDefault();
        if (!event.repeat) this.journey.toggleSelection();
      } else if (
        ["Space", "KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)
      ) {
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
        if (!event.repeat)
          this.awards.selectRelative(event.code === "ArrowRight" ? 1 : -1);
      } else if (event.code === "KeyE" || event.code === "Enter") {
        event.preventDefault();
        if (!event.repeat) this.awards.toggleSelection();
      } else if (
        ["Space", "KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)
      ) {
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
      } else if (
        [
          "Space",
          "ArrowLeft",
          "ArrowRight",
          "KeyW",
          "KeyA",
          "KeyS",
          "KeyD",
        ].includes(event.code)
      ) {
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
          void this.activeProjectBook?.turnPage(
            event.code === "ArrowLeft" ? -1 : 1,
          );
        }

        return;
      }

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
  }

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

  private readonly registeredNpcIds = new Set<string>();

  private registerNpcInteractions(): void {
    for (const npc of this.world.npcs) {
      if (this.registeredNpcIds.has(npc.id)) continue;
      this.interactionSystem.register(
        new NpcInteraction(npc, this.world.player.model, this.dialogueBox),
      );
      this.registeredNpcIds.add(npc.id);
    }
  }

  private async loadNpcsInBackground(): Promise<void> {
    try {
      await this.world.loadNpcs();
    } catch (error) {
      console.error("Failed to load NPCs:", error);
    } finally {
      this.registerNpcInteractions();
    }
  }

  private async enterHouse(): Promise<void> {
    if (this.transitioning || this.insideHouse) {
      return;
    }

    this.transitioning = true;

    this.world.player.getFeetPosition(this.houseReturnPosition);

    this.houseReturnRotationY = this.world.player.model.rotation.y;

    this.keyboard.setEnabled(false);

    let house: HouseInterior | undefined;
    let entered = false;

    try {
      await this.sceneTransition.fadeIn("house");

      this.preparingScene = true;

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

      this.worldAudio.setActive(false);

      this.world.setExteriorVisible(false);

      this.world.setExteriorLightingEnabled(false);

      house.show();

      const spawnForward = new THREE.Vector3(0, 0, 1)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), spawnRotation.y + Math.PI)
        .multiplyScalar(2);

      spawnPosition.add(spawnForward);

      this.world.player.teleport(spawnPosition, spawnRotation.y + Math.PI);

      this.thirdPersonCamera?.setInteriorMode(true);

      this.thirdPersonCamera?.snap();

      this.sceneTransition.setHouseStage("lighting");
      await this.renderer.prepareScene(this.scene, this.playerCamera);
      const compile = () =>
        this.renderer.instance.compileAsync(this.scene, this.playerCamera);
      if (this.furniture) {
        await this.furniture.prepareLightingVariants(
          compile,
          () =>
            this.workshop?.prepareLightingVariants(compile) ??
            Promise.resolve(),
        );
      } else await this.workshop?.prepareLightingVariants(compile);

      this.sceneTransition.setHouseStage("finishing");
      await this.renderer.prepareHighlights(
        this.scene,
        this.playerCamera,
        this.interactionSystem.highlightTargets,
      );

      this.insideHouse = true;
      this.preparingScene = false;
      this.sceneTransition.setHouseStage("ready");

      await this.sceneTransition.fadeOut();
      entered = true;
    } catch (error) {
      console.error("Failed to enter house:", error);
      this.sceneTransition.setHouseStage("error");
      this.insideHouse = false;

      house?.hide();

      this.world.setExteriorVisible(true);

      this.world.setExteriorLightingEnabled(true);

      this.worldAudio.setActive(true);

      this.world.player.teleport(
        this.houseReturnPosition,
        this.houseReturnRotationY,
      );

      this.thirdPersonCamera?.setInteriorMode(false);

      this.thirdPersonCamera?.snap();

      this.preparingScene = false;

      await this.sceneTransition.fadeOut();
    } finally {
      this.preparingScene = false;
      this.transitioning = false;

      if (
        this.phase === "playing" &&
        !this.paperPanel.isOpen &&
        !this.dialogueBox.isOpen
      ) {
        this.keyboard.setEnabled(true);
      }
    }

    if (entered && this.phase === "playing") this.houseGuide?.start();
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

    const workshopStand = house.model.getObjectByName(
      "SEC_WORKSHOP_WeaponStand",
    );
    if (workshopStand) {
      this.workshop = new WorkshopExperience(
        house.model,
        workshopStand,
        this.playerCamera,
        this.renderer.instance.domElement,
        () => !this.worldAudio.isMuted,
      );
      this.interactionSystem.register(
        new WorkshopInteraction(workshopStand, () =>
          this.enterWorkshopExperience(),
        ),
      );
    } else {
      console.warn(
        "Workshop asset SEC_WORKSHOP_WeaponStand not found in house.glb",
      );
    }

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
      for (const name of exhibitNames) {
        const exhibit = house.model.getObjectByName(name);
        if (!exhibit) continue;
        this.interactionSystem.register(
          new AwardsInteraction(exhibit, () => this.enterAwardsExperience()),
        );
      }
    }

    const mapTop = house.model.getObjectByName("SEC_MAP_MapTop");
    const mapTable = house.model.getObjectByName("SEC_MAP_Table_Large");
    if (mapTop && mapTable) {
      this.journey = new JourneyMapExperience(
        house.model,
        mapTop,
        this.playerCamera,
        this.renderer.instance.domElement,
      );
      this.interactionSystem.register(
        new JourneyMapInteraction(mapTable, () => this.enterJourneyMap()),
      );
    } else {
      console.warn(
        "Journey Map requires SEC_MAP_MapTop and SEC_MAP_Table_Large in house.glb",
      );
    }

    this.furniture = new HouseFurnitureInteractions(
      house.model,
      this.playerCamera,
      {
        onFocusStart: (showPlayer = false) => {
          if (
            this.phase !== "playing" ||
            !this.insideHouse ||
            this.transitioning ||
            this.houseGuide?.isControllingCamera ||
            this.projectBookMode !== "idle" ||
            this.paperPanel.isOpen ||
            this.dialogueBox.isOpen
          )
            return false;

          this.keyboard.setEnabled(false);
          this.thirdPersonCamera?.setInputEnabled(false);
          this.renderer.setInteractionOutline(null);
          this.world.player.model.visible = showPlayer;
          this.helpButton.setVisible(false);
          return true;
        },
        onFocusEnd: () => {
          this.world.player.model.visible = true;
          this.thirdPersonCamera?.snap();
          this.helpButton.setVisible(this.phase === "playing");
          this.keyboard.setEnabled(
            this.phase === "playing" &&
              this.insideHouse &&
              !this.transitioning &&
              !this.paperPanel.isOpen &&
              !this.dialogueBox.isOpen,
          );
        },
        onSitStart: (seat, look, couch) =>
          this.world.player.beginSitting(seat, look, couch),
        onSitEnd: () => this.world.player.endSitting(),
        onLieStart: (bed) => this.world.player.beginLying(bed),
        onLieEnd: () => this.world.player.endSitting(),
        onEndingContact: () => {
          if (
            this.phase === "playing" &&
            this.insideHouse &&
            !this.transitioning
          ) {
            this.paperPanel.open(createContactContent(), "Let’s talk.");
          }
        },
        isMuted: () => this.worldAudio.isMuted,
      },
    );
    this.furniture.register((interaction) =>
      this.interactionSystem.register(interaction),
    );

    const steps = houseTourSteps(house.model, book?.model).filter(
      (step) =>
        step.id === "projects" ||
        (step.id === "journey" && this.journey) ||
        (step.id === "awards" && (this.awards?.exhibitCount ?? 0) > 0) ||
        (step.id === "workshop" && this.workshop),
    );
    this.houseGuide = new HouseFirstVisitGuide(this.playerCamera, steps, {
      approach: house.getSpawn()!.getWorldPosition(new THREE.Vector3()),
      route: new HouseTourPath(this.world.physics, house.model),
      onTargetChange: (target) => this.renderer.setInteractionOutline(target),
      onCameraStart: (target) => {
        this.keyboard.setEnabled(false);
        this.thirdPersonCamera?.setInputEnabled(false);
        this.interactionSystem.clear();
        this.renderer.setInteractionOutline(target);
        this.world.player.model.visible = false;
        this.helpButton.setVisible(false);
      },
      onCameraEnd: () => {
        this.world.player.model.visible = true;
        this.renderer.setInteractionOutline(null);
        const playable =
          this.phase === "playing" &&
          this.insideHouse &&
          !this.transitioning &&
          !this.paperPanel.isOpen &&
          !this.dialogueBox.isOpen;
        this.keyboard.setEnabled(playable);
        this.thirdPersonCamera?.setInputEnabled(playable);
        this.helpButton.setVisible(playable);
      },
    });

    this.houseInteractionsRegistered = true;
  }

  private async exitHouse(): Promise<void> {
    if (this.transitioning || !this.insideHouse) {
      return;
    }

    this.transitioning = true;

    this.keyboard.setEnabled(false);

    this.houseGuide?.cancel();

    try {
      await this.sceneTransition.fadeIn();

      const house = await this.world.loadHouseInterior();

      house.hide();

      this.world.setExteriorVisible(true);

      this.world.setExteriorLightingEnabled(true);

      this.worldAudio.setActive(true);

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
    if (
      !workshop ||
      this.phase !== "playing" ||
      !this.insideHouse ||
      this.transitioning ||
      this.houseGuide?.isControllingCamera ||
      this.projectBookMode !== "idle"
    )
      return;

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
        this.phase === "playing" &&
          this.insideHouse &&
          !this.transitioning &&
          !this.paperPanel.isOpen &&
          !this.dialogueBox.isOpen,
      );
    });
  }

  private enterAwardsExperience(): void {
    if (
      !this.awards ||
      this.phase !== "playing" ||
      !this.insideHouse ||
      this.transitioning ||
      this.houseGuide?.isControllingCamera ||
      this.projectBookMode !== "idle" ||
      this.workshop?.isControllingCamera ||
      this.paperPanel.isOpen ||
      this.dialogueBox.isOpen
    )
      return;

    if (!this.awards.enter()) return;
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
        this.phase === "playing" &&
          this.insideHouse &&
          !this.transitioning &&
          !this.paperPanel.isOpen &&
          !this.dialogueBox.isOpen,
      );
    });
  }

  private enterJourneyMap(): void {
    if (
      !this.journey ||
      this.phase !== "playing" ||
      !this.insideHouse ||
      this.transitioning ||
      this.houseGuide?.isControllingCamera ||
      this.projectBookMode !== "idle" ||
      this.workshop?.isControllingCamera ||
      this.awards?.isControllingCamera ||
      this.paperPanel.isOpen ||
      this.dialogueBox.isOpen
    )
      return;

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
        this.phase === "playing" &&
          this.insideHouse &&
          !this.transitioning &&
          !this.paperPanel.isOpen &&
          !this.dialogueBox.isOpen,
      );
    });
  }

  private startProjectBookReading(house: HouseInterior): void {
    if (
      this.phase !== "playing" ||
      !this.insideHouse ||
      this.transitioning ||
      this.houseGuide?.isControllingCamera ||
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

    this.keyboard.setEnabled(false);
    this.thirdPersonCamera?.setInputEnabled(false);

    this.renderer.setInteractionOutline(null);

    if (book.currentState === "closed") {
      book.open();

      if (book.currentState === "closed") {
        this.finishProjectBookReading();
      }

      return;
    }

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

    this.world.player.model.visible = true;

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
