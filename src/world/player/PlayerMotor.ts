import * as CANNON from "cannon-es";
import { PhysicsPlayer } from "../../physics/PhysicsPlayer";

export interface PlayerMovementInput {
  forward: number;
  turn: number;
  jump: boolean;
  run: boolean;
}

export class PlayerMotor {
  private input: PlayerMovementInput = {
    forward: 0,
    turn: 0,
    jump: false,
    run: false,
  };

  private readonly walkSpeed = 5;
  private readonly runSpeed = 8;
  private readonly rotationSpeed = 4;
  private readonly jumpSpeed = 6;
  private yaw = 0;

  constructor(private readonly physics: PhysicsPlayer) {}

  setInput(input: PlayerMovementInput) {
    this.input = input;
  }

  update(delta: number) {
    this.yaw += this.input.turn * this.rotationSpeed * delta;
    this.physics.setYaw(this.yaw);

    const speed = this.input.run ? this.runSpeed : this.walkSpeed;
    const forward = new CANNON.Vec3(Math.sin(this.yaw), 0, Math.cos(this.yaw));

    this.physics.setHorizontalVelocity(
      forward.x * this.input.forward * speed,
      forward.z * this.input.forward * speed,
    );

    if (this.input.jump) {
      this.physics.jump(this.jumpSpeed);
    }
  }
}
