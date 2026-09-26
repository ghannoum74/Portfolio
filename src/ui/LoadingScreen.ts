export class LoadingScreen {
  private readonly root: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly progress: HTMLElement;

  constructor() {
    const root = document.getElementById("loading-screen");

    if (!root) {
      throw new Error("Missing loading-screen placeholder");
    }

    this.root = root;

    this.fill = this.find("loading-progress-fill");
    this.progress = this.find("loading-progress");
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

  hide(): void {
    this.root.classList.add("loading-screen-hidden");
  }

}
