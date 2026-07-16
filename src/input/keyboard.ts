export class Keyboard {
  forward = false;
  backward = false;
  left = false;
  right = false;
  run = false;
  jump = false;

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
        this.jump = true;
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

      case "Space":
        this.jump = false;
        break;
    }
  };
}
