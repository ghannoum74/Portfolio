export class Keyboard {
  forward = false;
  backward = false;
  left = false;
  right = false;
  run = false;
  private jumpQueued = false;

  constructor() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  private onKeyDown = (event: KeyboardEvent) => {
    switch (event.code) {
      case "KeyW":
        this.forward = true;
        break;

      case "KeyS":
        this.backward = true;
        break;

      case "KeyA":
        this.left = true;
        break;

      case "KeyD":
        this.right = true;
        break;

      case "ShiftLeft":
        this.run = true;
        break;

      case "Space":
        // listen to this event only once
        if (!event.repeat) {
          this.jumpQueued = true;
        }
        break;
    }
  };

  private onKeyUp = (event: KeyboardEvent) => {
    switch (event.code) {
      case "KeyW":
        this.forward = false;
        break;

      case "KeyS":
        this.backward = false;
        break;

      case "KeyA":
        this.left = false;
        break;

      case "KeyD":
        this.right = false;
        break;

      case "ShiftLeft":
        this.run = false;
        break;
    }
  };

  consumeJump() {
    const shouldJump = this.jumpQueued;

    this.jumpQueued = false;

    return shouldJump;
  }
}
