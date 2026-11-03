import * as THREE from "three";
import { Keyboard } from "../../input/Keyboard";
import { PlayerAnimations } from "./PlayerAnimations";
import { PlayerBody } from "./PlayerBody";
import { StairDetector } from "../StairDetector";

export class PlayerController {
  private walkSpeed = 2;
  private runSpeed = 8;
  private stairsSpeed = 2;
  private rotationSpeed = 4;

  private feetPosition = new THREE.Vector3();
  private movementDirection = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);

  constructor(
    private player: THREE.Group,
    private keyboard: Keyboard,
    private animations: PlayerAnimations,
    private body: PlayerBody,
    private stairDetector: StairDetector,
  ) {}

  update(delta: number): void {
    const jumpPressed = this.keyboard.consumeJump();

    const falling = this.body.isFalling;
    const jumping = this.body.isJumping;

    const canJump =
      jumpPressed &&
      !this.animations.isLocked() &&
      !falling &&
      this.body.isGrounded;

    if (canJump) {
      this.animations.playOnce("jump", 0.05);
    }

    const locked = this.animations.isLocked();

    const allowAirControl = jumping || canJump;

    const movementBlocked = !allowAirControl && (locked || falling);

    let moveDirection = 0;

    if (!movementBlocked) {
      if (this.keyboard.forward) {
        moveDirection += 1;
      }

      if (this.keyboard.backward) {
        moveDirection -= 1;
      }
    }

    if (!falling || allowAirControl) {
      if (this.keyboard.left) {
        this.player.rotation.y +=
          this.rotationSpeed * this.keyboard.turnStrength * delta;
      }

      if (this.keyboard.right) {
        this.player.rotation.y -=
          this.rotationSpeed * this.keyboard.turnStrength * delta;
      }
    }

    this.movementDirection
      .set(0, 0, moveDirection)
      .applyAxisAngle(this.up, this.player.rotation.y);

    if (this.movementDirection.lengthSq() > 0) {
      this.movementDirection.normalize();
    }

    this.body.getFeetPosition(this.feetPosition);

    const ascending =
      !movementBlocked &&
      !canJump &&
      !jumping &&
      this.body.isGrounded &&
      moveDirection !== 0 &&
      this.stairDetector.isAscending(this.feetPosition, this.movementDirection);

    const speed = movementBlocked
      ? 0
      : ascending
        ? this.stairsSpeed
        : this.keyboard.run
          ? this.runSpeed
          : this.walkSpeed;

    this.body.update(
      moveDirection,
      this.player.rotation.y,
      speed,
      canJump,
      delta,
    );

    this.updateAnimation(moveDirection !== 0, locked, ascending, falling);
  }

  private updateAnimation(
    moving: boolean,
    locked: boolean,
    ascending: boolean,
    falling: boolean,
  ): void {
    if (locked) return;

    if (falling) {
      this.animations.play("idle", 0.1);
      return;
    }

    if (!moving) {
      this.animations.play("idle");
      return;
    }

    if (ascending) {
      this.animations.play("ascending_stairs");
      this.animations.setPlaybackSpeed("ascending_stairs", 1.5);

      return;
    }

    if (this.keyboard.backward) {
      this.animations.play(
        this.keyboard.run ? "running_backword" : "walking_backword",
      );
      return;
    }

    this.animations.play(this.keyboard.run ? "running" : "walking");
  }
}
