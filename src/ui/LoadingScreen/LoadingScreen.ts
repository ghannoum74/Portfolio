const MESSAGES = [
  "Convincing the clouds to stay put.",
  "Waking up the guides. One says it’s still the weekend.",
  "Putting the bugs outside. They live here too.",
  "Asking the cauldron to look productive.",
  "Teaching the grass to mind its own business.",
  "Checking the door. Yes, it opens the normal way.",
];

const REPLIES = [
  "Lights on. Someone is definitely pretending not to be home.",
  "The broom says five more minutes.",
  "Knock received. Filed under ‘urgent-ish’.",
  "The cauldron is answering the door. Bold choice.",
  "Achievement unlocked: slightly louder knocking.",
  "Still here? Excellent. The cottage likes persistent guests.",
];

export class LoadingScreen {
  private readonly root: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly progress: HTMLElement;
  private readonly status: HTMLElement;
  private readonly message: HTMLElement;
  private readonly percentage: HTMLElement;
  private readonly reaction: HTMLElement;
  private readonly knockButton: HTMLButtonElement;
  private readonly retryButton: HTMLButtonElement;
  private readonly cottage: SVGElement;
  private readonly motion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  );
  private hidePromise: Promise<void> | null = null;
  private messageTimer?: number;
  private messageIndex = 0;
  private knocks = 0;
  private lastKnock = -Infinity;
  private terminal = false;
  private knockAnimation?: Animation;

  constructor() {
    const root = document.getElementById("loading-screen");
    if (!root) throw new Error("Missing #loading-screen");
    this.root = root;
    this.fill = this.find("#loading-progress-fill");
    this.progress = this.find("#loading-progress");
    this.status = this.find(".loading-text");
    this.message = this.find("[data-loading-joke]");
    this.percentage = this.find("[data-loading-percentage]");
    this.reaction = this.find("[data-loading-reaction]");
    this.knockButton = this.find<HTMLButtonElement>("[data-loading-knock]");
    this.retryButton = this.find<HTMLButtonElement>("[data-loading-retry]");
    this.cottage = this.find<SVGElement>(".loading-cottage");
    this.knockButton.disabled = false;
    this.knockButton.addEventListener("click", this.knock);
    this.retryButton.addEventListener("click", () => window.location.reload());
    document.addEventListener("visibilitychange", this.syncActivity);
    this.motion.addEventListener("change", this.syncActivity);
    this.syncActivity();
  }

  private find<T extends Element = HTMLElement>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing loading element: ${selector}`);
    return element;
  }

  private knock = (): void => {
    if (
      this.terminal ||
      document.hidden ||
      performance.now() - this.lastKnock < 250
    )
      return;
    this.lastKnock = performance.now();
    this.knockButton.classList.add("is-awake");
    this.reaction.textContent = REPLIES[this.knocks++ % REPLIES.length];
    this.knockAnimation?.cancel();
    if (!this.motion.matches) {
      this.knockAnimation = this.cottage.animate?.(
        [
          { transform: "rotate(0deg)" },
          { transform: "rotate(-3deg)" },
          { transform: "rotate(2deg)" },
          { transform: "rotate(0deg)" },
        ],
        { duration: 380, easing: "ease-out" },
      );
    }
  };

  private syncActivity = (): void => {
    const active = !this.terminal && !document.hidden && !this.motion.matches;
    this.root.dataset.paused = String(!active);
    if (!active) {
      if (this.messageTimer !== undefined)
        window.clearInterval(this.messageTimer);
      this.messageTimer = undefined;
      this.knockAnimation?.cancel();
    } else if (this.messageTimer === undefined) {
      this.messageTimer = window.setInterval(() => {
        this.messageIndex = (this.messageIndex + 1) % MESSAGES.length;
        this.message.textContent = MESSAGES[this.messageIndex];
      }, 3400);
    }
  };

  private stopActivity(): void {
    this.terminal = true;
    this.syncActivity();
    this.knockButton.disabled = true;
    this.knockButton.removeEventListener("click", this.knock);
    document.removeEventListener("visibilitychange", this.syncActivity);
    this.motion.removeEventListener("change", this.syncActivity);
  }

  setAssetProgress(loaded: number, total: number): void {
    if (this.terminal) return;
    const safeTotal = Math.max(Number.isFinite(total) ? total : 1, 1);
    const safeLoaded = Math.min(
      Math.max(Number.isFinite(loaded) ? loaded : 0, 0),
      safeTotal,
    );
    const percentage = Math.round((safeLoaded / safeTotal) * 100);
    const preparing = safeLoaded === safeTotal;
    this.root.dataset.state = preparing ? "preparing" : "loading";
    this.fill.style.width = `${percentage}%`;
    this.percentage.textContent = preparing ? "Nearly there" : `${percentage}%`;
    this.progress.setAttribute(
      "aria-label",
      preparing ? "Preparing the scene" : "Essential files loaded",
    );
    this.progress.setAttribute(
      "aria-valuetext",
      preparing
        ? "Essential files ready. Preparing the scene."
        : `${safeLoaded} of ${safeTotal} essential files ready`,
    );
    if (preparing) this.progress.removeAttribute("aria-valuenow");
    else this.progress.setAttribute("aria-valuenow", String(percentage));
    const status = preparing ? "Setting the scene…" : "Packing the essentials…";
    if (this.status.textContent !== status) this.status.textContent = status;
  }

  complete(): void {
    if (this.root.dataset.state === "error") return;
    this.stopActivity();
    this.root.dataset.state = "ready";
    this.fill.style.width = "100%";
    this.percentage.textContent = "100%";
    this.progress.setAttribute("aria-label", "World ready");
    this.progress.setAttribute("aria-valuenow", "100");
    this.progress.setAttribute("aria-valuetext", "World ready");
    this.status.textContent = "All set. Mind the doorstep.";
    this.message.textContent = "The cauldron has been told to behave.";
  }

  hide(): Promise<void> {
    if (this.hidePromise) return this.hidePromise;
    if (this.root.dataset.state === "error") return Promise.resolve();
    this.stopActivity();
    if (this.root.contains(document.activeElement))
      (document.activeElement as HTMLElement)?.blur();
    this.root.setAttribute("aria-hidden", "true");
    this.hidePromise = new Promise<void>((resolve) => {
      let finished = false;
      let timeoutId = 0;
      const finish = (): void => {
        if (finished) return;
        finished = true;
        this.root.removeEventListener("transitionend", onTransitionEnd);
        window.clearTimeout(timeoutId);
        if (this.root.dataset.state !== "error") {
          this.root.hidden = true;
          document.getElementById("world-root")?.removeAttribute("inert");
          document.getElementById("ui-root")?.removeAttribute("inert");
        }
        resolve();
      };
      const onTransitionEnd = (event: TransitionEvent): void => {
        if (event.target === this.root && event.propertyName === "opacity")
          finish();
      };
      this.root.addEventListener("transitionend", onTransitionEnd);
      this.root.classList.add("loading-screen-hidden");
      const duration = getComputedStyle(this.root)
        .transitionDuration.split(",")[0]
        .trim();
      const milliseconds = duration.endsWith("ms")
        ? parseFloat(duration)
        : parseFloat(duration) * 1000;
      timeoutId = window.setTimeout(
        finish,
        (Number.isFinite(milliseconds) ? milliseconds : 0) + 200,
      );
      if (!milliseconds) finish();
    });
    return this.hidePromise;
  }

  showError(): void {
    this.stopActivity();
    this.root.dataset.state = "error";
    this.root.hidden = false;
    this.root.classList.remove("loading-screen-hidden");
    this.root.setAttribute("aria-hidden", "false");
    this.progress.hidden = true;
    this.percentage.textContent = "";
    this.status.textContent = "The world couldn’t wake up.";
    this.message.textContent = "The broom has requested a short break.";
    this.reaction.textContent =
      "Please try again. The cottage will keep your place.";
    this.retryButton.hidden = false;
  }
}
