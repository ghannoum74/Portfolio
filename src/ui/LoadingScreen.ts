// Vite resolves the `?raw` asset at build time; TypeScript may not know this
// query-string module when the project does not include Vite's client types.
// @ts-expect-error The bundler provides the raw HTML module.
import template from "./LoadingScreen.html?raw";
// Vite handles CSS imports at build time; TypeScript may not know this module
// @ts-expect-error The bundler provides the CSS module.
import "./LoadingScreen.css";

export class LoadingScreen {
  private readonly root: HTMLElement;
  private readonly status: HTMLElement;
  private readonly file: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly count: HTMLElement;
  private readonly progress: HTMLElement;
  private readonly error: HTMLElement;

  constructor() {
    const root = document.getElementById("loading-screen");

    if (!root) {
      throw new Error("Missing loading-screen placeholder");
    }

    this.root = root;

    // Our trusted static template is mounted only once.
    this.root.innerHTML = template;
    this.root.classList.add("loading-screen");
    this.root.classList.remove("loading-placeholder");

    this.status = this.find("loading-status");
    this.file = this.find("loading-file");
    this.fill = this.find("loading-progress-fill");
    this.count = this.find("loading-count");
    this.progress = this.find("loading-progress");
    this.error = this.find("loading-error");
  }

  private find(id: string): HTMLElement {
    const element = this.root.querySelector<HTMLElement>(`#${id}`);

    if (!element) {
      throw new Error(`Missing loading element: ${id}`);
    }

    return element;
  }

  setStatus(message: string): void {
    this.status.textContent = message;
  }

  setAssetProgress(loaded: number, total: number, filename?: string): void {
    const safeTotal = Math.max(total, 1);
    const safeLoaded = Math.min(Math.max(loaded, 0), safeTotal);

    const percentage = (safeLoaded / safeTotal) * 100;

    this.fill.style.width = `${percentage}%`;

    this.count.textContent = `${safeLoaded} / ${total} assets`;

    this.progress.setAttribute("aria-valuemax", String(total));

    this.progress.setAttribute("aria-valuenow", String(safeLoaded));

    if (filename) {
      this.file.textContent = filename;
    }
  }

  complete(): void {
    this.setStatus("Your adventure is ready!");
    this.file.textContent = "All startup assets prepared";
  }

  hide(): void {
    this.root.classList.add("loading-screen--hidden");
  }

  showError(message: string): void {
    this.setStatus("Unable to load the world");

    this.error.textContent = message;
    this.error.hidden = false;
  }
}
