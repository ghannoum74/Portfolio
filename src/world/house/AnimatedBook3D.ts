import * as THREE from "three";

type BookState = "closed" | "opening" | "open" | "turning" | "turned";

interface BookGLTF {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

export class AnimatedBook3D {
  readonly model: THREE.Group;

  private readonly mixer: THREE.AnimationMixer;

  private readonly openAction?: THREE.AnimationAction;
  private readonly pageAction?: THREE.AnimationAction;

  private state: BookState = "closed";

  constructor(gltf: BookGLTF) {
    this.model = gltf.scene;
    this.model.name = "ANIMATED_PROJECT_BOOK";

    this.mixer = new THREE.AnimationMixer(this.model);

    console.log(
      "Book animations:",
      gltf.animations.map((clip) => ({
        name: clip.name,
        duration: clip.duration,
        tracks: clip.tracks.map((t) => t.name),
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
      // The Blender source contains a long hold after
      // opening. Trim playback to the first 36 frames.
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
      // Use only the actual curling portion,
      // not the initial 50-frame waiting period.
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
        this.state = "turned";
        console.log("Paper turn completed");
      }
    });
  }

  private configureAction(action: THREE.AnimationAction): void {
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
  }

  open(): void {
    if (this.state !== "closed") return;

    if (!this.openAction) {
      console.warn("Missing book opening animation");
      return;
    }

    this.state = "opening";
    this.openAction.reset().play();
  }

  turnPage(): void {
    if (this.state !== "open") return;

    if (!this.pageAction) {
      console.warn("Missing paper animation");
      return;
    }

    this.state = "turning";
    this.pageAction.reset().play();
  }

  interact(): void {
    if (this.state === "closed") {
      this.open();
    } else if (this.state === "open") {
      this.turnPage();
    }
  }

  update(delta: number): void {
    this.mixer.update(Math.min(delta, 0.05));
  }

  get currentState(): BookState {
    return this.state;
  }
}
