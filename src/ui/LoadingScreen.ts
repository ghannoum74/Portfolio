import template from "./LoadingScreen.html?row";
import styles from "./LoadingScreen.module.css";

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
    const root = document.getElementById("loading-screen");

    if (!root) {
      throw new Error("Missing loading-screen placeholder");
    }

    this.root = root;

    // Parse the static HTML template once.
    const parsedTemplate = document.createElement("template");

    parsedTemplate.innerHTML = template.trim();

    // Resolve CSS Module names before mounting.
    const styledElements =
      parsedTemplate.content.querySelectorAll<HTMLElement>("[data-style]");

    styledElements.forEach((element) => {
      const name = element.dataset.style;

      if (!name) return;

      const className = styles[name];

      if (!className) {
        throw new Error(`Unknown loading style: ${name}`);
      }

      element.classList.add(className);
    });

    // Mount the full component.
    this.root.classList.add(styles.screen);

    this.root.replaceChildren(parsedTemplate.content);

    // The initial fallback is no longer needed.
    this.root.classList.remove("loading-placeholder");

    // Cache DOM references.
    this.status = this.find("loading-status");
    this.file = this.find("loading-file");
    this.fill = this.find("loading-progress-fill");
    this.percent = this.find("loading-percent");
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

  setProgress(value: number, status?: string, filename?: string): void {
    this.currentProgress = Math.max(
      this.currentProgress,
      Math.min(100, Math.max(0, value)),
    );

    const rounded = Math.floor(this.currentProgress);

    this.fill.style.width = `${this.currentProgress}%`;

    this.percent.textContent = `${rounded}%`;

    this.progress.setAttribute("aria-valuenow", String(rounded));

    if (status) {
      this.setStatus(status);
    }

    if (filename) {
      this.file.textContent = filename;
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
    this.root.classList.add(styles.isHidden);
  }

  showError(message: string): void {
    this.setStatus("Unable to load the world");

    this.error.textContent = message;
    this.error.hidden = false;
  }
}
