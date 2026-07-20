import { Keyboard } from "../../input/Keyboard";
import { PlayerMotor, PlayerMovementInput } from "./PlayerMotor";

export class PlayerController {
  private input: PlayerMovementInput = {
    forward: 0,
    turn: 0,
    jump: false,
    run: false,
  };

  constructor(
    private keyboard: Keyboard,
    private motor: PlayerMotor,
  ) {}

  update(movementLocked: boolean) {
    const forward =
      !movementLocked && this.keyboard.forward
        ? 1
        : !movementLocked && this.keyboard.backward
          ? -1
          : 0;
    const turn = Number(this.keyboard.left) - Number(this.keyboard.right);

    this.input = {
      forward,
      turn,
      jump: this.keyboard.consumeJump() && !movementLocked,
      run: this.keyboard.run,
    };

    this.motor.setInput(this.input);
  }

  getInput() {
    return this.input;
  }
}
