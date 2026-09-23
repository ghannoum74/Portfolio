import {
  Collider,
  KinematicCharacterController,
  RigidBody,
} from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { PhysicsWorld } from "../../physics/PhysicsWorld";

export class PlayerBody {
  private body: RigidBody;
  private collider: Collider;

  private characterController: KinematicCharacterController;

  private verticalVelocity: number = 0;

  private grounded: boolean = false;

  private readonly GRAVITY: number = -9.81;
  private readonly JUMP_SPEED: number = 5;

  private readonly CAPSULE_RADIUS: number = 0.35;
  private readonly CAPSULE_HALF_HEIGHT: number = 0.55;

  private readonly movement = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);

  private fallingTime = 0;

  private readonly FALL_GRACE_TIME = 0.12;
  private readonly MIN_FALL_VELOCITY = -0.5;

  private horizontalVelocity = new THREE.Vector3();
  private airForward = new THREE.Vector3();

  private readonly AIR_ACCELERATION = 4;
  private readonly MIN_AIR_SPEED = 2.5;

  private airSpeedLimit = this.MIN_AIR_SPEED;
  private jumping = false;

  constructor(
    private physics: PhysicsWorld,
    spawnPosition: THREE.Vector3,
  ) {
    const RAPIER = this.physics.rapier;

    /*
     * We control this body ourselves.
     *
     * Rapier does NOT decide where the player goes.
     */
    const bodyDesc =
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        spawnPosition.x,
        spawnPosition.y,
        spawnPosition.z,
      );

    this.body = this.physics.world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.capsule(
      this.CAPSULE_HALF_HEIGHT,
      this.CAPSULE_RADIUS,
    );

    this.collider = this.physics.world.createCollider(colliderDesc, this.body);

    /*
     * Small separation between player and surfaces.
     */
    this.characterController =
      this.physics.world.createCharacterController(0.03);

    /*
     * Small stairs.
     */
    this.characterController.enableAutostep(0.35, 0.2, false);

    /*
     * Keep player attached to descending terrain.
     */
    this.characterController.enableSnapToGround(0.3);

    /*
     * Slope behavior.
     */
    this.characterController.setMaxSlopeClimbAngle(
      THREE.MathUtils.degToRad(60),
    );

    this.characterController.setMinSlopeSlideAngle(
      THREE.MathUtils.degToRad(75),
    );
  }

  update(
    moveDirection: number,
    rotationY: number,
    speed: number,
    jumpRequested: boolean,
    delta: number,
  ): void {
    const wasGrounded = this.grounded;

    // Calculate the player's facing direction.
    this.airForward.set(0, 0, 1).applyAxisAngle(this.up, rotationY);

    // On the ground, movement responds immediately to input.
    if (wasGrounded) {
      this.horizontalVelocity
        .copy(this.airForward)
        .multiplyScalar(moveDirection * speed);
    }

    const jumpStarted = jumpRequested && wasGrounded;

    if (jumpStarted) {
      this.verticalVelocity = this.JUMP_SPEED;
      this.grounded = false;
      this.jumping = true;

      // Remember the player's speed at takeoff.
      // Running jumps retain their faster momentum.
      this.airSpeedLimit = Math.max(
        this.horizontalVelocity.length(),
        this.MIN_AIR_SPEED,
      );
    }

    // Limited forward/backward control during a jump.
    if (this.jumping && !jumpStarted) {
      if (moveDirection !== 0) {
        this.horizontalVelocity.addScaledVector(
          this.airForward,
          moveDirection * this.AIR_ACCELERATION * delta,
        );

        this.horizontalVelocity.clampLength(0, this.airSpeedLimit);
      }
    } else if (!wasGrounded && !this.jumping) {
      // Preserve your existing lock for accidental falls.
      this.horizontalVelocity.set(0, 0, 0);
    }

    // Gravity continues to work during the entire jump.
    this.verticalVelocity += this.GRAVITY * delta;

    this.movement.set(
      this.horizontalVelocity.x * delta,
      this.verticalVelocity * delta,
      this.horizontalVelocity.z * delta,
    );

    this.characterController.computeColliderMovement(this.collider, {
      x: this.movement.x,
      y: this.movement.y,
      z: this.movement.z,
    });

    const correctedMovement = this.characterController.computedMovement();

    const position = this.body.translation();

    this.body.setNextKinematicTranslation({
      x: position.x + correctedMovement.x,
      y: position.y + correctedMovement.y,
      z: position.z + correctedMovement.z,
    });

    this.grounded = this.characterController.computedGrounded();

    if (this.grounded) {
      this.jumping = false;
      this.fallingTime = 0;

      if (this.verticalVelocity < 0) {
        this.verticalVelocity = 0;
      }
    } else if (this.verticalVelocity < 0) {
      this.fallingTime += delta;
    } else {
      this.fallingTime = 0;
    }
  }

  syncModel(model: THREE.Object3D, modelBottomY: number): void {
    const position = this.body.translation();

    /*
     * body.translation() = capsule center.
     *
     * We want the visual character's feet at the bottom of the capsule.
     */
    const capsuleBottom =
      position.y - this.CAPSULE_HALF_HEIGHT - this.CAPSULE_RADIUS;

    model.position.set(position.x, capsuleBottom - modelBottomY, position.z);
  }

  get isGrounded(): boolean {
    return this.grounded;
  }

  getFeetPosition(target: THREE.Vector3): THREE.Vector3 {
    const position = this.body.translation();

    return target.set(
      position.x,
      position.y - this.CAPSULE_HALF_HEIGHT - this.CAPSULE_RADIUS,
      position.z,
    );
  }

  get isFalling(): boolean {
    return (
      !this.grounded &&
      this.verticalVelocity < this.MIN_FALL_VELOCITY &&
      this.fallingTime >= this.FALL_GRACE_TIME
    );
  }

  get isJumping(): boolean {
    return this.jumping && !this.grounded;
  }
}
