import * as THREE from "three";
import { Keyboard } from "../../input/Keyboard";
import { PlayerAnimations } from "./PlayerAnimations";
import { PlayerBody } from "./PlayerBody";
import { StairDetector } from "../StairDetector";

export class PlayerController {
  private walkSpeed = 2;
  private runSpeed = 10;
  private stairsSpeed = 1.3;
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

    // Preserve your existing jump lock.
    const canJump =
      jumpPressed && !this.animations.isLocked() && this.body.isGrounded;

    if (canJump) {
      this.animations.playOnce("jump", 0.05);
    }

    const locked = this.animations.isLocked();

    let moveDirection = 0;

    // No forward/backward movement while jumping.
    if (!locked) {
      if (this.keyboard.forward) {
        moveDirection += 1;
      }

      if (this.keyboard.backward) {
        moveDirection -= 1;
      }
    }

    // Preserve rotation during jumping.
    if (this.keyboard.left) {
      this.player.rotation.y += this.rotationSpeed * delta;
    }

    if (this.keyboard.right) {
      this.player.rotation.y -= this.rotationSpeed * delta;
    }

    // Convert requested movement into world direction.
    this.movementDirection
      .set(0, 0, moveDirection)
      .applyAxisAngle(this.up, this.player.rotation.y);

    if (this.movementDirection.lengthSq() > 0) {
      this.movementDirection.normalize();
    }

    // Find the capsule's current foot position.
    this.body.getFeetPosition(this.feetPosition);

    // Activate climbing only when grounded,
    // moving, and heading toward the top marker.
    const ascending =
      !locked &&
      this.body.isGrounded &&
      moveDirection !== 0 &&
      this.stairDetector.isAscending(this.feetPosition, this.movementDirection);

    const speed = ascending
      ? this.stairsSpeed
      : this.keyboard.run
        ? this.runSpeed
        : this.walkSpeed;

    // Physics always runs, even during animation lock.
    this.body.update(
      moveDirection,
      this.player.rotation.y,
      speed,
      canJump,
      delta,
    );

    this.updateAnimation(moveDirection !== 0, locked, ascending);
  }

  private updateAnimation(
    moving: boolean,
    locked: boolean,
    ascending: boolean,
  ): void {
    if (locked) return;

    if (!moving) {
      this.animations.play("idle");
      return;
    }

    // Stair animation has priority over walking/running.
    if (ascending) {
      this.animations.play("ascending_stairs");
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
