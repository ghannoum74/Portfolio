import "./ScreenTransition.css";
import houseLoadingHtml from "./HouseLoading.html?raw";

export type HouseLoadingStage =
  "loading" | "lighting" | "finishing" | "ready" | "error";

const STAGES: Record<HouseLoadingStage, string> = {
  loading: "Bringing the cottage to life…",
  lighting: "Waking up the chandelier…",
  finishing: "Putting the last book away…",
  ready: "All tidy. Come on in.",
  error: "The cottage needs another minute. Please try the door again.",
};
const MESSAGES = [
  "Hiding the laundry. Please don't open that cupboard.",
  "Convincing the broom this is in its job description.",
  "Sweeping the bugs under the rug. The literal ones.",
  "Asking the cauldron to look productive.",
];

export class SceneTransition {
  private readonly element: HTMLDivElement;
  private readonly houseLoading: HTMLElement;
  private readonly message: HTMLElement;
  private readonly status: HTMLElement;
  private readonly reducedMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  private messageTimer: number | null = null;
  private messageIndex = 0;
  private houseActive = false;
  private revision = 0;

  constructor(parent: HTMLElement) {
    this.element = document.createElement("div");

    this.element.className = "scene-transition";
    this.element.setAttribute("aria-hidden", "true");
    this.element.innerHTML = houseLoadingHtml.trim();
    this.houseLoading = this.element.querySelector<HTMLElement>(
      "[data-house-loading]",
    )!;
    this.message = this.element.querySelector<HTMLElement>(
      "[data-house-loading-message]",
    )!;
    this.status = this.element.querySelector<HTMLElement>(
      "[data-house-loading-phase]",
    )!;

    parent.appendChild(this.element);
  }

  async fadeIn(purpose: "plain" | "house" = "plain"): Promise<void> {
    this.revision++;
    this.stopMessages();
    this.houseActive = purpose === "house";
    this.houseLoading.hidden = !this.houseActive;
    this.element.classList.toggle("is-house-entry", this.houseActive);
    this.element.setAttribute("aria-hidden", String(!this.houseActive));
    if (this.houseActive) {
      this.messageIndex = 0;
      this.message.textContent = MESSAGES[0];
      this.setHouseStage("loading");
      if (!this.reducedMotion) {
        this.messageTimer = window.setInterval(() => {
          this.messageIndex = (this.messageIndex + 1) % MESSAGES.length;
          this.message.textContent = MESSAGES[this.messageIndex];
        }, 2800);
      }
    }
    this.element.classList.add("is-visible");

    await this.wait(this.reducedMotion ? 0 : 450);
  }

  setHouseStage(stage: HouseLoadingStage): void {
    if (!this.houseActive) return;
    this.element.dataset.houseStage = stage;
    this.status.textContent = STAGES[stage];
    if (stage === "ready" || stage === "error") {
      this.stopMessages();
      this.message.textContent =
        stage === "ready"
          ? "Not a speck of dust. Probably."
          : "The broom has requested a short break.";
    }
  }

  async fadeOut(): Promise<void> {
    const revision = ++this.revision;
    this.stopMessages();
    this.element.classList.remove("is-visible");

    await this.wait(this.reducedMotion ? 0 : 450);

    if (revision !== this.revision) return;
    this.houseActive = false;
    this.houseLoading.hidden = true;
    this.element.classList.remove("is-house-entry");
    this.element.setAttribute("aria-hidden", "true");
  }

  destroy(): void {
    this.revision++;
    this.stopMessages();
    this.element.remove();
  }

  private stopMessages(): void {
    if (this.messageTimer === null) return;
    window.clearInterval(this.messageTimer);
    this.messageTimer = null;
  }

  private wait(ms: number): Promise<void> {
    if (!ms) return Promise.resolve();
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }
}
