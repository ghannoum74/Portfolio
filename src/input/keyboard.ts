export class Keyboard {
  forward = false;
  backward = false;
  left = false;
  right = false;
  run = false;
  private jumpQueued = false;
  private enabled = true;

  constructor() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);

    // Prevent stuck movement if the visitor switches browser tabs or windows.
    window.addEventListener("blur", this.reset);
  }

  /**
   * Enable or disable gameplay input.
   *
   * Called when opening or closing UI panels.
   */
  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;

    this.enabled = enabled;

    // Clear existing input when changing modes.
    this.reset();
  }

  private reset = (): void => {
    this.forward = false;
    this.backward = false;
    this.left = false;
    this.right = false;
    this.run = false;
    this.jumpQueued = false;
  };

  private onKeyDown = (event: KeyboardEvent) => {
    if (!this.enabled) return;

    // Don't intercept keyboard input in form controls.
    const target = event.target;

    if (
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
    ) {
      return;
    }

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

  consumeJump(): boolean {
    if (!this.enabled) {
      this.jumpQueued = false;
      return false;
    }

    const shouldJump = this.jumpQueued;
    this.jumpQueued = false;

    return shouldJump;
  }
}
