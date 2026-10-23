/** Stop all 3D frame work while hidden; resume from a fresh clock/sample window. */
export class VisibleAnimationLoop {
  private running?: boolean;
  constructor(
    private readonly visibility: Pick<Document, "hidden" | "addEventListener" | "removeEventListener">,
    private readonly setLoop: (callback: (() => void) | null) => void,
    private readonly tick: () => void,
    private readonly resume: () => void,
  ) {
    visibility.addEventListener("visibilitychange", this.sync);
    this.sync();
  }

  private sync = (): void => {
    const running = !this.visibility.hidden;
    if (running === this.running) return;
    this.running = running;
    if (running) this.resume();
    this.setLoop(running ? this.tick : null);
  };

  dispose(): void {
    this.visibility.removeEventListener("visibilitychange", this.sync);
    this.setLoop(null);
  }
}
