import * as THREE from "three";

import { PROJECTS } from "../../data/projects";
import { ProjectPageTextures } from "./book/ProjectPageTexture";

type BookState =
  | "closed"
  | "opening"
  | "open"
  | "preparing"
  | "turning"
  | "turned";

interface BookGLTF {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

export class AnimatedBook3D {
  readonly model: THREE.Group;

  private readonly mixer: THREE.AnimationMixer;
  private readonly textures = new ProjectPageTextures();

  private readonly openAction?: THREE.AnimationAction;
  private readonly pageAction?: THREE.AnimationAction;

  private readonly detailsPage?: THREE.Object3D;
  private readonly screenshotPage?: THREE.Object3D;
  private readonly turningPage?: THREE.Object3D;

  private readonly materialCache = new Map<
    string,
    THREE.MeshStandardMaterial
  >();
  private readonly turningFaceRoles = new WeakMap<THREE.Mesh, boolean[]>();

  private state: BookState = "closed";

  private projectIndex = 0;
  private pendingIndex: number | null = null;
  private pagesReady = false;

  constructor(gltf: BookGLTF) {
    this.model = gltf.scene;
    this.model.name = "ANIMATED_PROJECT_BOOK";

    this.mixer = new THREE.AnimationMixer(this.model);

    // Actual mesh names exported from Blender.
    this.detailsPage = this.model.getObjectByName("BOOK_DETAILS_PAGE");

    this.screenshotPage = this.model.getObjectByName("BOOK_SCREENSHOT_PAGE");

    this.turningPage = this.model.getObjectByName("BOOK_TURNING_PAGE");

    console.log(
      "Book animations:",
      gltf.animations.map((clip) => ({
        name: clip.name,
        duration: clip.duration,
      })),
    );

    const hasMorphTracks = (clip: THREE.AnimationClip) =>
      clip.tracks.some((track) => track.name.includes("morphTargetInfluences"));

    const coverClip =
      gltf.animations.find(
        (clip) => /cover/i.test(clip.name) && !hasMorphTracks(clip),
      ) ?? gltf.animations.find((clip) => !hasMorphTracks(clip));

    const pageClip =
      gltf.animations.find(
        (clip) => /curl|page|paper/i.test(clip.name) && hasMorphTracks(clip),
      ) ?? gltf.animations.find(hasMorphTracks);

    if (coverClip) {
      const opening = THREE.AnimationUtils.subclip(
        coverClip,
        "OpenBook",
        0,
        35,
        30,
      );

      this.openAction = this.mixer.clipAction(opening);

      this.configureAction(this.openAction);
    }

    if (pageClip) {
      const turning = THREE.AnimationUtils.subclip(
        pageClip,
        "TurnPaper",
        49,
        115,
        30,
      );

      this.pageAction = this.mixer.clipAction(turning);

      this.configureAction(this.pageAction);
    }

    this.mixer.addEventListener("finished", (event) => {
      if (event.action === this.openAction) {
        this.state = "open";

        console.log("Book opened");
      }

      if (event.action === this.pageAction) {
        this.completePageTurn();
      }
    });
  }

  private configureAction(action: THREE.AnimationAction): void {
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
  }

  async initializePages(): Promise<void> {
    if (this.pagesReady) return;

    if (PROJECTS.length === 0) {
      throw new Error("No portfolio projects configured");
    }

    if (!this.detailsPage || !this.screenshotPage || !this.turningPage) {
      const names: string[] = [];

      this.model.traverse((child) => names.push(child.name));

      console.error("Book GLB objects:", names);

      throw new Error("Missing required BOOK_* page objects in book.glb");
    }

    // The Blender demo contains temporary geometry:
    // PROJECT NOTES, decorative lines, and preview box.
    // Hide those so they don't cover our real textures.
    this.hideBlenderPlaceholders();

    // Keep the animated sheet hidden until we turn.
    // This also avoids z-fighting with the static page.
    this.turningPage.visible = false;

    const first = PROJECTS[0];

    const detailTexture = this.textures.details(first);

    const screenshotTexture = await this.textures.screenshot(first);

    this.paintPage(this.detailsPage, detailTexture);

    this.paintPage(this.screenshotPage, screenshotTexture);

    this.projectIndex = 0;
    this.pagesReady = true;

    console.log("3D project pages initialized:", first.title);
  }

  private hideBlenderPlaceholders(): void {
    const exactNames = new Set([
      "BOOK_Details_Title",
      "BOOK_Right_Label",
      "BOOK_Right_Preview",
    ]);

    this.model.traverse((child) => {
      if (
        exactNames.has(child.name) ||
        child.name.startsWith("BOOK_Details_Line_")
      ) {
        child.visible = false;
      }
    });
  }

  private getPaperMaterial(texture: THREE.Texture): THREE.MeshStandardMaterial {
    const existing = this.materialCache.get(texture.uuid);

    if (existing) return existing;

    const material = new THREE.MeshStandardMaterial({
      name: `PROJECT_PAPER_${texture.uuid}`,
      map: texture,
      color: 0xffffff,
      roughness: 0.95,
      metalness: 0,
      side: THREE.DoubleSide,
    });

    this.materialCache.set(texture.uuid, material);

    return material;
  }

  private paintPage(object: THREE.Object3D, texture: THREE.Texture): void {
    const material = this.getPaperMaterial(texture);

    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;

      child.material = material;
    });
  }

  private paintTurningPage(
    currentScreenshot: THREE.Texture,
    nextProjectDetails: THREE.Texture,
  ): void {
    if (!this.turningPage) return;

    const front = this.getPaperMaterial(currentScreenshot);
    const back = this.getPaperMaterial(nextProjectDetails);

    this.turningPage.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;

      const originals = Array.isArray(child.material)
        ? child.material
        : [child.material];

      let roles = this.turningFaceRoles.get(child);

      if (!roles) {
        roles = originals.map((material, index) => {
          const name = material.name.toLowerCase();

          if (name.includes("cream")) return false;
          if (name.includes("teal")) return true;

          return index === 0;
        });

        this.turningFaceRoles.set(child, roles);
      }

      const materials = roles.map((isFront) => (isFront ? front : back));

      child.material = Array.isArray(child.material) ? materials : materials[0];
    });
  }

  open(): void {
    if (this.state !== "closed" || !this.pagesReady) {
      return;
    }

    if (!this.openAction) {
      console.warn("Missing cover-opening animation");
      return;
    }

    this.state = "opening";

    this.openAction.reset().play();
  }

  async turnPage(): Promise<void> {
    if (
      this.state !== "open" ||
      !this.pagesReady ||
      !this.pageAction ||
      !this.turningPage ||
      !this.screenshotPage
    ) {
      return;
    }

    if (!this.canTurnPage) {
      console.log("Already at the last project");
      return;
    }

    this.state = "preparing";

    const currentProject = PROJECTS[this.projectIndex];
    const nextIndex = this.projectIndex + 1;
    const nextProject = PROJECTS[nextIndex];

    try {
      const [currentScreenshot, nextScreenshot] = await Promise.all([
        this.textures.screenshot(currentProject),
        this.textures.screenshot(nextProject),
      ]);

      const nextDetails = this.textures.details(nextProject);

      // The turning page carries the old screenshot
      // on its front, next details on its back.
      this.paintTurningPage(currentScreenshot, nextDetails);

      // The next screenshot is underneath the sheet.
      // It becomes visible as the page curls away.
      this.paintPage(this.screenshotPage, nextScreenshot);

      this.pendingIndex = nextIndex;

      this.resetTurningMorphs();

      this.turningPage.visible = true;

      this.state = "turning";

      this.pageAction.reset().play();
    } catch (error) {
      console.error("Could not prepare project page:", error);

      this.pendingIndex = null;
      this.state = "open";
    }
  }

  private completePageTurn(): void {
    if (this.pendingIndex === null || !this.detailsPage || !this.turningPage) {
      this.state = "open";
      return;
    }

    const nextProject = PROJECTS[this.pendingIndex];

    // Once paper lands on the left, its back has
    // already revealed this project's details.
    // Make the permanent left page match it.
    this.paintPage(this.detailsPage, this.textures.details(nextProject));

    this.projectIndex = this.pendingIndex;
    this.pendingIndex = null;

    // Hide the temporary sheet before resetting
    // its morph targets. This prevents a visual pop.
    this.turningPage.visible = false;

    this.pageAction?.stop();
    this.resetTurningMorphs();

    this.state = "open";

    console.log(
      `Now showing project ${this.projectIndex + 1}:`,
      nextProject.title,
    );
  }

  private resetTurningMorphs(): void {
    this.turningPage?.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;

      child.morphTargetInfluences?.fill(0);
    });
  }

  interact(): void {
    if (this.state === "closed") {
      this.open();
      return;
    }

    if (this.state === "open") {
      void this.turnPage();
    }
  }

  // =======================================================
  // GAME LOOP
  // =======================================================

  update(delta: number): void {
    this.mixer.update(Math.min(delta, 0.05));
  }

  // =======================================================
  // PUBLIC STATE
  // =======================================================

  get currentState(): BookState {
    return this.state;
  }

  get currentProjectIndex(): number {
    return this.projectIndex;
  }

  get canTurnPage(): boolean {
    return this.pagesReady && this.projectIndex < PROJECTS.length - 1;
  }

  get currentProject() {
    return PROJECTS[this.projectIndex];
  }
}
