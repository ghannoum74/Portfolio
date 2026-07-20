import * as THREE from "three";
import { PlayerAnimations } from "./PlayerAnimations";
import { PlayerController } from "./PlayerController";
import { PlayerMotor } from "./PlayerMotor";
import { AssetLoader } from "../../loaders/AssetLoader";
import { Keyboard } from "../../input/Keyboard";
import { PhysicsPlayer } from "../../physics/PhysicsPlayer";

export class Player {
  model!: THREE.Group;
  physics: PhysicsPlayer;

  private renderModel!: THREE.Group;
  private mixer!: THREE.AnimationMixer;
  private animations!: PlayerAnimations;
  private motor!: PlayerMotor;
  private controller!: PlayerController;
  private loader: AssetLoader;

  constructor(
    private scene: THREE.Scene,
    private keyboard: Keyboard,
    private loadingManager: THREE.LoadingManager,
  ) {
    this.physics = new PhysicsPlayer();
    this.loader = new AssetLoader(loadingManager);
  }

  async load() {
    const playerAsset = await this.loader.loadGLB(
      "/assets/models/player/player.glb",
    );

    this.model = new THREE.Group();
    this.renderModel = playerAsset.scene;

    // this.model.scale.setScalar(0.01);

    this.renderModel.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    this.model.add(this.renderModel);
    this.scene.add(this.model);
    this.syncPhysics();

    this.mixer = new THREE.AnimationMixer(this.renderModel);

    this.animations = new PlayerAnimations(this.mixer);

    await this.loadAnimations();

    this.motor = new PlayerMotor(this.physics);
    this.controller = new PlayerController(this.keyboard, this.motor);

    this.animations.play("idle");
  }

  private async loadAnimations() {
    const [
      idle,
      walking,
      walkingBackword,
      running,
      runningBackword,
      jump,
      // leftTurn,
      // rightTurn,
    ] = await Promise.all([
      this.loader.loadGLB("/assets/models/player/animations/idle.glb"),

      this.loader.loadGLB("/assets/models/player/animations/walking.glb"),

      this.loader.loadGLB(
        "/assets/models/player/animations/walking-backwords.glb",
      ),

      this.loader.loadGLB("/assets/models/player/animations/running.glb"),

      this.loader.loadGLB(
        "/assets/models/player/animations/running-backwords.glb",
      ),

      this.loader.loadGLB("/assets/models/player/animations/jump-fast.glb"),

      // this.loader.loadGLB("/assets/models/player/animations/left-turn.glb"),

      // this.loader.loadGLB("/assets/models/player/animations/right-turn.glb"),
    ]);

    this.animations.add("idle", idle.animations[0]);

    this.animations.add("walking", walking.animations[0]);

    this.animations.add("walking_backword", walkingBackword.animations[0]);

    this.animations.add("running", running.animations[0]);

    this.animations.add("running_backword", runningBackword.animations[0]);

    this.animations.add("jump", jump.animations[0]);

    // this.animations.add(
    //   "left_turn",
    //   leftTurn.animations[0],
    //   THREE.LoopPingPong,
    // );

    // this.animations.add(
    //   "right_turn",
    //   rightTurn.animations[0],
    //   THREE.LoopPingPong,
    // );
  }

  updateInput(delta: number) {
    this.controller?.update(this.animations?.isLocked() ?? false);
    this.motor?.update(delta);
  }

  update(delta: number) {
    this.syncPhysics();
    this.updateAnimation();

    this.mixer?.update(delta);
  }

  syncPhysics() {
    if (!this.model) return;

    const { position, quaternion } = this.physics.body;

    this.model.position.set(
      position.x,
      position.y - this.physics.height / 2,
      position.z,
    );

    this.model.quaternion.set(
      quaternion.x,
      quaternion.y,
      quaternion.z,
      quaternion.w,
    );
  }

  private updateAnimation() {
    if (!this.animations || this.animations.isLocked()) return;

    const input = this.controller.getInput();

    if (input.jump) {
      this.animations.playOnce("jump");
      return;
    }

    if (input.forward === 0) {
      if (input.turn > 0) return this.animations.play("left_turn");
      if (input.turn < 0) return this.animations.play("right_turn");
      return this.animations.play("idle");
    }

    if (input.forward < 0) {
      if (input.run) return this.animations.play("running_backword");
      return this.animations.play("walking_backword");
    }

    if (input.run) return this.animations.play("running");

    this.animations.play("walking");
  }
}
