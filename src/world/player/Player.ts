import * as THREE from "three";
import { PlayerAnimations } from "./PlayerAnimations";
import { PlayerController } from "./PlayerController";
import { AssetLoader } from "../../loaders/AssetLoader";
import { Keyboard } from "../../input/Keyboard";
import { PhysicsWorld } from "../../physics/PhysicsWorld";
import { PlayerBody } from "./PlayerBody";
import { StairDetector } from "../StairDetector";

export class Player {
  model!: THREE.Group;

  private mixer!: THREE.AnimationMixer;
  private animations!: PlayerAnimations;
  private controller!: PlayerController;
  private loader: AssetLoader;

  private body!: PlayerBody;

  private modelBottomY = 0;

  constructor(
    private scene: THREE.Scene,
    private keyboard: Keyboard,
    private loadingManager: THREE.LoadingManager,
    private physics: PhysicsWorld,
    private stairDetector: StairDetector,
  ) {
    this.loader = new AssetLoader(loadingManager);
  }

  async load() {
    const playerAsset = await this.loader.loadGLB(
      "/assets/models/player/player.glb",
    );

    this.model = playerAsset.scene;

    // this.model.scale.setScalar(0.01);

    this.model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    this.scene.add(this.model);

    this.model.updateMatrixWorld(true);
    const boundingBox = new THREE.Box3().setFromObject(this.model);

    this.modelBottomY = boundingBox.min.y - this.model.position.y;

    this.body = new PlayerBody(this.physics, new THREE.Vector3(0, 20, 0));

    this.mixer = new THREE.AnimationMixer(this.model);

    this.animations = new PlayerAnimations(this.mixer);

    await this.loadAnimations();

    this.controller = new PlayerController(
      this.model,
      this.keyboard,
      this.animations,
      this.body,
      this.stairDetector,
    );

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
      ascendingStairs,
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

      this.loader.loadGLB(
        "/assets/models/player/animations/ascending-stairs.glb",
      ),

      // this.loader.loadGLB("/assets/models/player/animations/left-turn.glb"),

      // this.loader.loadGLB("/assets/models/player/animations/right-turn.glb"),
    ]);

    this.animations.add("idle", idle.animations[0]);

    this.animations.add("walking", walking.animations[0]);

    this.animations.add("walking_backword", walkingBackword.animations[0]);

    this.animations.add("running", running.animations[0]);

    this.animations.add("running_backword", runningBackword.animations[0]);

    this.animations.add("jump", jump.animations[0]);

    this.animations.add("ascending_stairs", ascendingStairs.animations[0]);

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

  update(delta: number) {
    this.controller?.update(delta);

    this.mixer?.update(delta);
  }

  syncFromPhysics(): void {
    this.body.syncModel(this.model, this.modelBottomY);
  }
}
