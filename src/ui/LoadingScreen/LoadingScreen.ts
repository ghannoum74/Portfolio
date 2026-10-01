export class LoadingScreen {
  private readonly root: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly progress: HTMLElement;
  private readonly status: HTMLElement;

  private hidePromise: Promise<void> | null = null;

  constructor() {
    const root = document.getElementById("loading-screen");

    if (!root) {
      throw new Error("Missing #loading-screen");
    }

    this.root = root;

    this.fill = this.find("loading-progress-fill");

    this.progress = this.find("loading-progress");

    const status = root.querySelector<HTMLElement>(".loading-text");

    if (!status) {
      throw new Error("Missing .loading-text");
    }

    this.status = status;
  }

  private find(id: string): HTMLElement {
    const element = this.root.querySelector<HTMLElement>(`#${id}`);

    if (!element) {
      throw new Error(`Missing loading element: ${id}`);
    }

    return element;
  }

  setAssetProgress(loaded: number, total: number): void {
    const safeTotal = Math.max(total, 1);

    const safeLoaded = Math.min(Math.max(loaded, 0), safeTotal);

    const percentage = (safeLoaded / safeTotal) * 100;

    this.fill.style.width = `${percentage}%`;

    this.progress.setAttribute("aria-valuenow", String(percentage));
  }

  complete(): void {
    this.setAssetProgress(1, 1);
  }

  hide(): Promise<void> {
    if (this.hidePromise) {
      return this.hidePromise;
    }

    this.hidePromise = new Promise<void>((resolve) => {
      let finished = false;
      let timeoutId = 0;

      const finish = (): void => {
        if (finished) return;

        finished = true;

        this.root.removeEventListener("transitionend", onTransitionEnd);

        window.clearTimeout(timeoutId);

        resolve();
      };

      const onTransitionEnd = (event: TransitionEvent): void => {
        if (event.target === this.root && event.propertyName === "opacity") {
          finish();
        }
      };

      this.root.addEventListener("transitionend", onTransitionEnd);

      this.root.classList.add("loading-screen-hidden");

      const duration = getComputedStyle(this.root)
        .transitionDuration.split(",")[0]
        .trim();

      const milliseconds = duration.endsWith("ms")
        ? parseFloat(duration)
        : parseFloat(duration) * 1000;

      // Fallback if a browser interrupts
      // the CSS transition.
      timeoutId = window.setTimeout(finish, milliseconds + 200);

      if (milliseconds === 0) {
        finish();
      }
    });

    return this.hidePromise;
  }

  showError(): void {
    this.status.textContent = "Unable to load the portfolio. Please refresh.";
  }
}
