export class LoadingScreen {
  private readonly root: HTMLElement;
  private readonly status: HTMLElement;
  private readonly file: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly percent: HTMLElement;
  private readonly progress: HTMLElement;
  private readonly error: HTMLElement;

  private currentProgress = 0;

  constructor() {
    this.root = this.getElement("loading-screen");
    this.status = this.getElement("loading-status");
    this.file = this.getElement("loading-file");
    this.fill = this.getElement("loading-progress-fill");
    this.percent = this.getElement("loading-percent");
    this.progress = this.getElement("loading-progress");
    this.error = this.getElement("loading-error");
  }

  private getElement(id: string): HTMLElement {
    const element = document.getElementById(id);

    if (!element) {
      throw new Error(`Missing loading element: #${id}`);
    }

    return element;
  }

  setStatus(message: string): void {
    console.log("Loading status:", message);
    this.status.textContent = message;
  }

  setProgress(value: number, status?: string, file?: string): void {
    // Never move the displayed progress backward.
    this.currentProgress = Math.max(
      this.currentProgress,
      Math.min(100, Math.max(0, value)),
    );

    const rounded = Math.floor(this.currentProgress);

    this.fill.style.width = `${this.currentProgress}%`;
    this.percent.textContent = `${rounded}%`;

    this.progress.setAttribute("aria-valuenow", String(rounded));

    if (status) {
      this.status.textContent = status;
    }

    if (file) {
      this.file.textContent = file;
    }
  }

  complete(): void {
    this.setProgress(
      100,
      "Your adventure is ready!",
      "All initial assets loaded",
    );
  }

  hide(): void {
    this.root.classList.add("is-hidden");
  }

  showError(message: string): void {
    this.status.textContent = "Unable to load the world";
    this.error.textContent = message;
    this.error.hidden = false;
  }
}
