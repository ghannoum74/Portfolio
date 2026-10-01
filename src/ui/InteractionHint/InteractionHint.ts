import template from "./InteractionHint.html?raw";
import "./InteractionHint.css";

export class InteractionHint {
  private readonly root: HTMLElement;
  private readonly label: HTMLElement;

  constructor() {
    const uiRoot = document.getElementById("ui-root");

    if (!uiRoot) {
      throw new Error("Missing #ui-root");
    }

    const htmlTemplate = document.createElement("template");

    htmlTemplate.innerHTML = template.trim();

    const root = htmlTemplate.content.firstElementChild;

    if (!(root instanceof HTMLElement)) {
      throw new Error("Invalid InteractionHint template");
    }

    const label = root.querySelector<HTMLElement>("[data-interaction-label]");

    if (!label) {
      throw new Error("Missing interaction label");
    }

    this.root = root;
    this.label = label;

    uiRoot.appendChild(root);

    this.hide();
  }

  show(label: string): void {
    this.label.textContent = label;

    this.root.classList.add("interaction-hint_visible");
  }

  hide(): void {
    this.root.classList.remove("interaction-hint_visible");
  }
}
