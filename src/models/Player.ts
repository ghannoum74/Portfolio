import * as THREE from "three";
import { PlayerAnimations } from "../world/player/PlayerAnimations";
import { PlayerController } from "../world/player/PlayerController";
import { AssetLoader } from "../loaders/AssetLoader";
import { Keyboard } from "../input/Keyboard";

export class Player {
  model!: THREE.Group;

  private mixer!: THREE.AnimationMixer;
  private animations!: PlayerAnimations;
  private controller!: PlayerController;
  private loader = new AssetLoader();

  constructor(
    private scene: THREE.Scene,
    private keyboard: Keyboard,
  ) {}

  async load() {
    this.model = await this.loader.loadFBX("/assets/models/player/player.fbx");

    this.model.scale.setScalar(0.01);

    this.model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    this.scene.add(this.model);

    this.mixer = new THREE.AnimationMixer(this.model);

    this.animations = new PlayerAnimations(this.mixer);

    await this.loadAnimations();

    this.controller = new PlayerController(
      this.model,
      this.keyboard,
      this.animations,
    );

    this.animations.play("idle");
  }

  private async loadAnimations() {
    const [idle, walking, walkingBackword, running, jump] = await Promise.all([
      this.loader.loadFBX("/assets/models/player/animations/idle.fbx"),

      this.loader.loadFBX("/assets/models/player/animations/walking.fbx"),

      this.loader.loadFBX(
        "/assets/models/player/animations/walking-backwards.fbx",
      ),

      this.loader.loadFBX("/assets/models/player/animations/running.fbx"),

      this.loader.loadFBX("/assets/models/player/animations/jump.fbx"),
    ]);

    this.animations.add("idle", this.fixAnimationBoneNames(idle.animations[0]));

    this.animations.add(
      "walking",
      this.fixAnimationBoneNames(walking.animations[0]),
    );

    this.animations.add(
      "walking_backword",
      this.fixAnimationBoneNames(walkingBackword.animations[0]),
    );

    this.animations.add(
      "running",
      this.fixAnimationBoneNames(running.animations[0]),
    );

    this.animations.add("jump", this.fixAnimationBoneNames(jump.animations[0]));

    this.model.traverse((child) => {
      if (child instanceof THREE.Bone) {
        console.log("Character bone:", child.name);
      }
    });
  }

  update(delta: number) {
    this.controller?.update(delta);

    this.mixer?.update(delta);
  }

  private fixAnimationBoneNames(clip: THREE.AnimationClip) {
    clip.tracks.forEach((track) => {
      track.name = track.name.replace(/^mixamorig(?!_)/, "mixamorig_");
    });

    return clip;
  }

  private removeRootMotion(clip: THREE.AnimationClip): THREE.AnimationClip {
    clip.tracks = clip.tracks.filter(
      (track) => track.name !== "mixamorig_Hips.position",
    );

    return clip;
  }
}
