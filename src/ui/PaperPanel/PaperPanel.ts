import template from "./PaperPanel.html?raw";
import "./PaperPanel.css";

interface PaperPanelOptions {
  onOpen?: () => void;
  onClose?: () => void;
}

export class PaperPanel {
  private readonly dialog: HTMLDialogElement;
  private readonly content: HTMLElement;
  private readonly closeButton: HTMLButtonElement;
  constructor(private readonly options: PaperPanelOptions = {}) {
    const uiRoot = document.getElementById("ui-root");

    if (!uiRoot) {
      throw new Error("Missing Entry point #ui-root");
    }

    const htmlTemplate = document.createElement("template");

    htmlTemplate.innerHTML = template.trim();

    const dialog = htmlTemplate.content.firstElementChild;

    if (!(dialog instanceof HTMLDialogElement)) {
      throw new Error("Invalid PaperPanel template");
    }

    const content = dialog.querySelector<HTMLElement>("[data-paper-content]");

    const closeButton =
      dialog.querySelector<HTMLButtonElement>("[data-paper-close]");

    if (!content || !closeButton) {
      throw new Error("PaperPanel is missing required elements");
    }

    this.dialog = dialog;
    this.content = content;
    this.closeButton = closeButton;

    this.closeButton.addEventListener("click", this.close);

    this.dialog.addEventListener("close", this.handleClose);

    uiRoot.appendChild(this.dialog);
  }

  get isOpen(): boolean {
    return this.dialog.open;
  }

  open(content: DocumentFragment, accessibleName: string): void {
    if (this.dialog.open) return;

    this.dialog.setAttribute("aria-label", accessibleName);

    this.content.replaceChildren(content);
    this.content.scrollTop = 0;

    this.dialog.showModal();

    this.options.onOpen?.();
  }

  close = (): void => {
    if (this.dialog.open) {
      this.dialog.close;
    }
  };

  private handleClose = (): void => {
    console.trace("[Paper] Dialog closed");
    this.options.onClose?.();
  };

  destroy(): void {
    this.closeButton.removeEventListener("click", this.close);

    this.dialog.removeEventListener("close", this.handleClose);

    this.close();
    this.dialog.remove();
  }
}
