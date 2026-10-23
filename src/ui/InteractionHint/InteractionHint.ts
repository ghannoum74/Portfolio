import template from "./InteractionHint.html?raw";
import "./InteractionHint.css";

export class InteractionHint {
  private readonly root: HTMLElement;
  private readonly label: HTMLElement;
  private visible = false;
  private currentLabel: string | null = null;

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
    if (label !== this.currentLabel) {
      this.label.textContent = label;
      this.currentLabel = label;
    }

    if (!this.visible) {
      this.root.classList.add("interaction-hint_visible");
      this.visible = true;
    }
  }

  hide(): void {
    if (!this.visible) return;
    this.root.classList.remove("interaction-hint_visible");
    this.visible = false;
  }
}
