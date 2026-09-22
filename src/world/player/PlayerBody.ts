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
      THREE.MathUtils.degToRad(45),
    );

    this.characterController.setMinSlopeSlideAngle(
      THREE.MathUtils.degToRad(30),
    );
  }

  update(
    moveDirection: number,
    rotationY: number,
    speed: number,
    jumpRequested: boolean,
    delta: number,
  ): void {
    /*
     * Jump only if we're standing on something.
     */
    if (jumpRequested && this.grounded) {
      this.verticalVelocity = this.JUMP_SPEED;
      this.grounded = false;
    }

    /*
     * Gravity.
     *
     * Kinematic characters aren't automatically pulled down,
     * so we add gravity ourselves.
     */
    this.verticalVelocity += this.GRAVITY * delta;

    /*
     * Start with local movement.
     *
     * +Z = forward in your current player system.
     */
    this.movement.set(
      0,
      this.verticalVelocity * delta,
      moveDirection * speed * delta,
    );

    /*
     * Convert local movement into world-space movement
     * according to the player's Y rotation.
     */
    const horizontalMovement = new THREE.Vector3(
      this.movement.x,
      0,
      this.movement.z,
    );

    horizontalMovement.applyAxisAngle(this.up, rotationY);

    this.movement.x = horizontalMovement.x;
    this.movement.z = horizontalMovement.z;

    /*
     * Convert local movement into world-space movement
     * according to the player's Y rotation.
     */
    this.characterController.computeColliderMovement(this.collider, {
      x: this.movement.x,
      y: this.movement.y,
      z: this.movement.z,
    });

    /*
     * Rapier gives us the safe movement.
     */
    const correctedMovement = this.characterController.computedMovement();

    const currentPosition = this.body.translation();

    /*
     * Tell the kinematic body where it should be next.
     */
    this.body.setNextKinematicTranslation({
      x: currentPosition.x + correctedMovement.x,
      y: currentPosition.y + correctedMovement.y,
      z: currentPosition.z + correctedMovement.z,
    });

    /*
     * Did Rapier detect ground?
     */
    this.grounded = this.characterController.computedGrounded();

    if (this.grounded && this.verticalVelocity < 0) {
      this.verticalVelocity = 0;
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
}
