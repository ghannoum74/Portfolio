export class Keyboard {
  forward = false;
  backward = false;
  left = false;
  right = false;
  run = false;
  private jumpQueued = false;
  private enabled = true;
  private suspended = false;
  private readonly physical = new Set<string>();
  private touch = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    run: false,
  };
  private touchTurnStrength = 0;

  get turnStrength(): number {
    if (
      this.physical.has("KeyA") ||
      this.physical.has("KeyD") ||
      (!this.touch.left && !this.touch.right)
    )
      return 1;
    return this.touchTurnStrength;
  }

  get isEnabled(): boolean {
    return this.enabled && !this.suspended;
  }

  setSuspended(suspended: boolean): void {
    if (this.suspended === suspended) return;
    this.suspended = suspended;
    this.reset();
  }

  setTouchMovement(x: number, y: number, run = false): void {
    if (!this.isEnabled) return;

    const left = x < -(this.touch.left ? 0.2 : 0.3);
    const right = x > (this.touch.right ? 0.2 : 0.3);
    const forward = y < -(this.touch.forward ? 0.17 : 0.24);
    const backward = y > (this.touch.backward ? 0.17 : 0.24);
    const turn = Math.max(0, Math.min(1, (Math.abs(x) - 0.2) / 0.8));
    this.touchTurnStrength = Math.pow(turn, 1.4) * 0.65;
    this.touch = {
      forward,
      backward,
      left,
      right,
      run: run && (forward || backward),
    };
    this.applyMovement();
  }

  clearTouchMovement(): void {
    this.touch = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      run: false,
    };
    this.touchTurnStrength = 0;
    this.applyMovement();
  }

  queueJump(): void {
    if (this.isEnabled) this.jumpQueued = true;
  }

  private applyMovement(): void {
    this.forward =
      this.isEnabled && (this.touch.forward || this.physical.has("KeyW"));
    this.backward =
      this.isEnabled && (this.touch.backward || this.physical.has("KeyS"));
    this.left =
      this.isEnabled && (this.touch.left || this.physical.has("KeyA"));
    this.right =
      this.isEnabled && (this.touch.right || this.physical.has("KeyD"));
    this.run =
      this.isEnabled &&
      (this.touch.run ||
        this.physical.has("ShiftLeft") ||
        this.physical.has("ShiftRight"));
  }

  constructor() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);

    window.addEventListener("blur", this.reset);
    document.addEventListener("visibilitychange", this.reset);
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;

    this.enabled = enabled;

    this.reset();
  }

  private reset = (): void => {
    this.physical.clear();
    this.touch = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      run: false,
    };
    this.touchTurnStrength = 0;
    this.forward = false;
    this.backward = false;
    this.left = false;
    this.right = false;
    this.run = false;
    this.jumpQueued = false;
  };

  private onKeyDown = (event: KeyboardEvent) => {
    if (!this.isEnabled) return;

    const target = event.target;

    if (
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
    ) {
      return;
    }

    this.physical.add(event.code);
    this.applyMovement();
    if (event.code === "Space" && !event.repeat) this.queueJump();
  };

  private onKeyUp = (event: KeyboardEvent) => {
    this.physical.delete(event.code);
    this.applyMovement();
  };

  consumeJump(): boolean {
    if (!this.isEnabled) {
      this.jumpQueued = false;
      return false;
    }

    const shouldJump = this.jumpQueued;
    this.jumpQueued = false;

    return shouldJump;
  }
}
