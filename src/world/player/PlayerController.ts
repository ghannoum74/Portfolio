import * as THREE from "three";
import { Keyboard } from "../../input/Keyboard";
import { PlayerAnimations } from "./PlayerAnimations";

export class PlayerController {
  private walkSpeed = 2;
  private runSpeed = 5;
  private rotationSpeed = 4;

  constructor(
    private player: THREE.Group,
    private keyboard: Keyboard,
    private animations: PlayerAnimations,
  ) {}

  update(delta: number) {
    let moving: boolean = false;

    let speed: number = this.walkSpeed;

    if (this.keyboard.run) {
      speed = this.runSpeed;
    }

    if (this.keyboard.forward) {
      this.player.translateZ(speed * delta);

      moving = true;
    }

    if (this.keyboard.backward) {
      this.player.translateZ(-speed * delta);

      moving = true;
    }

    if (this.keyboard.left) {
      this.player.rotation.y += this.rotationSpeed * delta;
    }

    if (this.keyboard.right) {
      this.player.rotation.y -= this.rotationSpeed * delta;
    }

    this.updateAnimation(moving);
  }

  private updateAnimation(moving: boolean) {
    if (this.keyboard.consumeJump()) {
      return this.animations.playOnce("jump");
    }

    if (this.animations.isLocked()) {
      return;
    }

    if (!moving) {
      if (this.keyboard.left) {
        return this.animations.play("left_turn");
      }

      if (this.keyboard.right) {
        return this.animations.play("right_turn");
      }

      return this.animations.play("idle");
    }

    if (this.keyboard.backward) {
      if (this.keyboard.run) {
        return this.animations.play("running_backword");
      }

      return this.animations.play("walking_backword");
    }

    if (this.keyboard.run) {
      return this.animations.play("running");
    }

    this.animations.play("walking");
  }
}
