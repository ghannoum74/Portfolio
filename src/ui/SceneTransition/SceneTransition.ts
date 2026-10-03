import "./ScreenTransition.css";

export class SceneTransition {
  private readonly element: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.element = document.createElement("div");

    this.element.className = "scene-transition";

    parent.appendChild(this.element);
  }

  async fadeIn(): Promise<void> {
    this.element.classList.add("is-visible");

    await this.wait(450);
  }

  async fadeOut(): Promise<void> {
    this.element.classList.remove("is-visible");

    await this.wait(450);
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }
}
