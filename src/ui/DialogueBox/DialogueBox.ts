import template from "./DialogueBox.html?raw";

import "./DialogueBox.css";

interface DialogueBoxOptions {
  onOpen?: () => void;
  onClose?: () => void;
}

interface DialogueContent {
  speaker: string;
  company: string;
  lines: readonly string[];
}

export class DialogueBox {
  private readonly root: HTMLElement;
  private readonly speaker: HTMLElement;
  private readonly company: HTMLElement;
  private readonly text: HTMLElement;
  private readonly nextButton: HTMLButtonElement;
  private readonly action: HTMLElement;
  private lines: readonly string[] = [];

  private lineIndex = 0;
  private typingTimer: number | null = null;
  private fullText = "";
  private visibleCharacters = 0;
  private typing = false;
  private readonly reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  constructor(private readonly options: DialogueBoxOptions = {}) {
    const uiRoot = document.getElementById("ui-root");

    if (!uiRoot) {
      throw new Error("Missing #ui-root");
    }

    const htmlTemplate = document.createElement("template");
    htmlTemplate.innerHTML = template.trim();

    const root = htmlTemplate.content.firstChild;

    if (!(root instanceof HTMLElement)) {
      throw new Error("Invalid DialogueBox template");
    }

    const speaker = root.querySelector<HTMLElement>("[data-dialogue-speaker]");

    const company = root.querySelector<HTMLElement>("[data-dialogue-company]");

    const text = root.querySelector<HTMLElement>("[data-dialogue-text]");

    const nextButton = root.querySelector<HTMLButtonElement>(
      "[data-dialogue-next]",
    );

    const action = root.querySelector<HTMLElement>("[data-dialogue-action]");

    if (!speaker || !company || !text || !nextButton || !action) {
      throw new Error("DialogueBox is missing required elements");
    }

    this.root = root;
    this.speaker = speaker;
    this.company = company;
    this.text = text;
    this.nextButton = nextButton;
    this.action = action;

    this.nextButton.addEventListener("click", this.next);

    uiRoot.appendChild(this.root);
  }

  get isOpen(): boolean {
    return this.root.classList.contains("dialogue-box_visible");
  }

  open(content: DialogueContent): void {
    if (this.isOpen || content.lines.length === 0) {
      return;
    }

    this.speaker.textContent = content.speaker;

    this.company.textContent = content.company;

    this.lines = content.lines;
    this.lineIndex = 0;

    this.root.classList.add("dialogue-box_visible");
    this.root.setAttribute("aria-hidden", "false");

    this.options.onOpen?.();

    this.showCurrentLine();
  }

  next = (): void => {
    if (!this.isOpen) {
      return;
    }

    // if text still typing reveals it instantly
    if (this.typing) {
      this.finishTyping();

      return;
    }

    // move to next line
    if (this.lineIndex < this.lines.length - 1) {
      this.lineIndex++;

      this.showCurrentLine();

      return;
    }

    // if no more lines
    this.close();
  };

  close(): void {
    if (!this.isOpen) {
      return;
    }

    this.stopTyping();

    this.root.classList.remove("dialogue-box_visible");

    this.root.setAttribute("aria-hidden", "true");

    this.text.textContent = "";

    this.lines = [];

    this.options.onClose?.();
  }

  private showCurrentLine(): void {
    this.stopTyping();

    this.fullText = this.lines[this.lineIndex];

    this.visibleCharacters = 0;

    this.text.textContent = "";

    const isLastLine = this.lineIndex === this.lines.length - 1;

    this.action.textContent = isLastLine ? "Finish" : "Continue";

    if (this.reduceMotion) {
      this.text.textContent = this.fullText;
      return;
    }

    this.typing = true;

    this.typingTimer = window.setInterval(() => {
      this.visibleCharacters++;

      this.text.textContent = this.fullText.slice(0, this.visibleCharacters);

      if (this.visibleCharacters >= this.fullText.length) {
        this.stopTyping();
      }
    }, 24);
  }

  private finishTyping(): void {
    this.stopTyping();

    this.text.textContent = this.fullText;
  }

  private stopTyping(): void {
    if (this.typingTimer !== null) {
      window.clearInterval(this.typingTimer);

      this.typingTimer = null;
    }

    this.typing = false;
  }

  destroy(): void {
    this.stopTyping();

    this.nextButton.removeEventListener("click", this.next);

    this.root.remove();
  }
}
