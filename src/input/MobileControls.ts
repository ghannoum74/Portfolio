import type { Keyboard } from "./Keyboard";
import "./MobileControls.css";

const ICONS = {
  previous: '<path d="m15 5-7 7 7 7"/>',
  next: '<path d="m9 5 7 7-7 7"/>',
  action:
    '<path d="M8 13V5a1.5 1.5 0 0 1 3 0v6-2a1.5 1.5 0 0 1 3 0v2-1a1.5 1.5 0 0 1 3 0v2a1.5 1.5 0 0 1 3 0v4c0 4-2 6-6 6h-2c-2 0-3-1-4-3l-3-5a1.6 1.6 0 0 1 2-2Z"/>',
  back: '<path d="m9 4-5 5 5 5M4 9h9a6 6 0 0 1 0 12h-2"/>',
  project: '<path d="M6 21V4l10-2v19M3 21h18m-8-9h.01"/>',
  jump: '<path d="M12 4v11m-5-6 5-5 5 5M5 20h14m-12-3v3m10-3v3"/>',
  fullscreen: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5"/>',
  landscape:
    '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M18 10v4M5 3h10m0 0-2-2m2 2-2 2"/>',
} as const;

/** Finger travel in CSS pixels, deliberately larger than the displayed knob. */
export const TOUCH_STICK = { radius: 84, runEnter: 78, runExit: 64 } as const;

function shortAction(action: string): string {
  if (action === "Continue") return "Next";
  if (action === "Details") return "Inspect";
  if (/^Talk/i.test(action)) return "Talk";
  if (/^Enter/i.test(action)) return "Enter";
  if (/^Exit|^Return/i.test(action)) return "Back";
  if (/Brew|Cauldron|Side Quest/i.test(action)) return "Brew";
  if (/Sit|Lie|Rest/i.test(action)) return "Rest";
  return "Use";
}

export type MobileContext = {
  movement: boolean;
  action: string | null;
  back: boolean;
  navigation: boolean;
  openProject: boolean;
};

/** Touch UI feeds the same commands and movement state as the keyboard. */
export class MobileControls {
  private readonly media = window.matchMedia("(pointer: coarse)");
  private readonly root = document.createElement("div");
  private readonly zone = document.createElement("div");
  private readonly pad = document.createElement("div");
  private readonly knob = document.createElement("span");
  private readonly toolbar = document.createElement("div");
  private readonly target = document.createElement("p");
  private actionCaption!: HTMLSpanElement;
  private readonly action: HTMLButtonElement;
  private readonly back: HTMLButtonElement;
  private readonly previous: HTMLButtonElement;
  private readonly next: HTMLButtonElement;
  private readonly project: HTMLButtonElement;
  private readonly jump: HTMLButtonElement;
  private readonly fullscreen: HTMLButtonElement;
  private readonly rotate = document.createElement("dialog");
  private readonly rotateButton: HTMLButtonElement;
  private readonly hint = document.createElement("p");
  private hintTimer?: number;
  private hintShown = false;
  private worldActive = false;
  private movement = false;
  private pointer: number | null = null;
  private originX = 0;
  private originY = 0;
  private running = false;
  private blocking = false;
  private destroyed = false;
  private context?: MobileContext;

  constructor(
    private readonly keyboard: Keyboard,
    private readonly command: (code: string) => void,
  ) {
    this.root.className = "mobile-controls";
    this.root.hidden = true;
    this.zone.className = "mobile-controls_zone";
    this.zone.setAttribute(
      "aria-label",
      "Touch and drag to move; drag farther up or down to run",
    );
    this.pad.className = "mobile-controls_pad";
    this.pad.hidden = true;
    this.pad.setAttribute("aria-hidden", "true");
    this.pad.innerHTML = ["up", "down", "left", "right"]
      .map(
        (direction) =>
          `<span class="mobile-controls_${direction}"><svg viewBox="0 0 24 24"><path d="m6 15 6-6 6 6"/></svg></span>`,
      )
      .join("");
    this.knob.className = "mobile-controls_knob";
    this.pad.appendChild(this.knob);
    this.toolbar.className = "mobile-controls_actions";
    this.toolbar.setAttribute("role", "group");
    this.toolbar.setAttribute("aria-label", "Adventure controls");
    this.target.className = "mobile-controls_target";
    this.target.setAttribute("aria-hidden", "true");
    this.target.hidden = true;
    this.previous = this.button(
      "",
      "Previous item",
      () => this.send("ArrowLeft"),
      "previous",
    );
    this.next = this.button(
      "",
      "Next item",
      () => this.send("ArrowRight"),
      "next",
    );
    this.action = this.button(
      "Use",
      "Interact with nearby object",
      () => this.send("KeyE"),
      "action",
    );
    this.back = this.button(
      "Back",
      "Return to exploring",
      () => this.send("Escape"),
      "back",
    );
    this.project = this.button(
      "Visit",
      "Open current project website",
      () => this.send("KeyO"),
      "project",
    );
    this.jump = this.button(
      "Jump",
      "Jump",
      () => {
        if (
          this.isTouch &&
          this.worldActive &&
          this.movement &&
          !this.blocking &&
          !document.hidden
        )
          this.keyboard.queueJump();
      },
      "jump",
    );
    this.toolbar.append(
      this.target,
      this.previous,
      this.next,
      this.project,
      this.action,
      this.jump,
      this.back,
    );
    this.fullscreen = this.button(
      "",
      "Enter fullscreen landscape",
      () => {
        if (document.fullscreenElement)
          void document.exitFullscreen().catch(() => {});
        else void this.requestLandscape();
      },
      "fullscreen",
    );
    this.hint.className = "mobile-controls_hint";
    this.hint.textContent =
      "Left thumb: move · Push farther to run · Right thumb: look";
    this.hint.hidden = true;
    this.root.append(
      this.zone,
      this.pad,
      this.toolbar,
      this.fullscreen,
      this.hint,
    );
    this.rotate.className = "mobile-rotate";
    this.rotate.setAttribute("aria-labelledby", "mobile-rotate-title");
    const title = document.createElement("h2");
    title.id = "mobile-rotate-title";
    title.textContent = "Turn your phone sideways";
    const message = document.createElement("p");
    message.textContent =
      "Explore the world in landscape. Your adventure will resume when you rotate your phone.";
    this.rotateButton = this.button(
      "Play in landscape",
      "Try fullscreen landscape",
      () => void this.requestLandscape(),
      "landscape",
    );
    const note = document.createElement("small");
    this.rotate.append(title, message, this.rotateButton, note);
    this.rotate.addEventListener("cancel", (event) => event.preventDefault());
    document.body.append(this.root, this.rotate);
    this.zone.addEventListener("pointerdown", this.onDown);
    this.zone.addEventListener("pointermove", this.onMove);
    this.zone.addEventListener("pointerup", this.onUp);
    this.zone.addEventListener("pointercancel", this.onUp);
    this.zone.addEventListener("lostpointercapture", this.onUp);
    this.zone.addEventListener("click", (event) => event.stopPropagation());
    window.addEventListener("blur", this.reset);
    window.addEventListener("resize", this.viewportChanged);
    document.addEventListener("visibilitychange", this.reset);
    document.addEventListener("fullscreenchange", this.viewportChanged);
    this.media.addEventListener("change", this.viewportChanged);
    this.setContext({
      movement: false,
      action: null,
      back: false,
      navigation: false,
      openProject: false,
    });
    this.syncViewport();
  }

  get isBlocking(): boolean {
    return this.blocking;
  }
  get isTouch(): boolean {
    return this.media.matches;
  }

  private button(
    text: string,
    label: string,
    click: () => void,
    icon: keyof typeof ICONS,
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `mobile-controls_button mobile-controls_${icon}`;
    button.setAttribute("aria-label", label);
    const symbol = document.createElement("span"),
      caption = document.createElement("span");
    symbol.className = "mobile-controls_icon";
    symbol.setAttribute("aria-hidden", "true");
    symbol.innerHTML = `<svg viewBox="0 0 24 24" focusable="false">${ICONS[icon]}</svg>`;
    caption.className = "mobile-controls_label";
    caption.textContent = text;
    caption.hidden = !text;
    button.append(symbol, caption);
    if (icon === "action") this.actionCaption = caption;
    let touchedAt = -Infinity;
    // Explicit touch release also works for the second finger while the first
    // holds the movement pad. Keep this a user gesture for links/fullscreen.
    button.addEventListener("pointerup", (event) => {
      if (event.pointerType !== "touch") return;
      event.preventDefault();
      event.stopPropagation();
      touchedAt = performance.now();
      click();
    });
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (event.detail > 0 && performance.now() - touchedAt < 700) return;
      click();
    });
    return button;
  }

  setWorldActive(active: boolean): void {
    if (active === this.worldActive) return;
    this.worldActive = active;
    if (!active) this.reset();
    this.syncViewport();
  }

  setContext(context: MobileContext): void {
    const previous = this.context;
    this.context = context;
    if (
      previous &&
      Object.keys(context).every(
        (key) =>
          context[key as keyof MobileContext] ===
          previous[key as keyof MobileContext],
      )
    )
      return;
    this.movement = context.movement;
    this.zone.hidden = !context.movement;
    this.jump.hidden = !context.movement;
    this.action.hidden = !context.action;
    this.target.hidden =
      !context.action ||
      context.action === "Continue" ||
      context.action === "Details";
    if (context.action) {
      this.actionCaption.textContent = shortAction(context.action);
      this.target.textContent = context.action;
      this.action.setAttribute("aria-label", context.action);
    }
    this.back.hidden = !context.back;
    this.previous.hidden = this.next.hidden = !context.navigation;
    this.project.hidden = !context.openProject;
    if (!context.movement) {
      this.reset();
      this.hint.hidden = true;
    }
    if (context.movement && this.isTouch && !this.hintShown) {
      this.hintShown = true;
      this.hint.hidden = false;
      this.hintTimer = window.setTimeout(() => {
        this.hint.hidden = true;
      }, 5000);
    }
  }

  private send(code: string): void {
    if (this.isTouch && this.worldActive && !this.blocking && !document.hidden)
      this.command(code);
  }

  private syncViewport(): void {
    document.documentElement.classList.toggle(
      "has-touch-controls",
      this.isTouch,
    );
    this.blocking =
      this.isTouch &&
      this.worldActive &&
      window.innerHeight > window.innerWidth;
    this.keyboard.setSuspended(this.blocking);
    this.root.hidden = !this.isTouch || !this.worldActive || this.blocking;
    if (this.blocking && !this.rotate.open) this.rotate.showModal();
    if (!this.blocking && this.rotate.open) this.rotate.close();
    this.fullscreen.setAttribute(
      "aria-label",
      document.fullscreenElement
        ? "Exit fullscreen"
        : "Enter fullscreen landscape",
    );
  }

  private viewportChanged = (): void => {
    this.reset();
    this.syncViewport();
  };

  /** Must be called directly by a visitor's tap; unsupported APIs are optional. */
  async requestLandscape(): Promise<void> {
    if (!this.isTouch || this.destroyed) return;
    try {
      if (
        !document.fullscreenElement &&
        document.documentElement.requestFullscreen
      ) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      /* Manual rotation remains available when fullscreen is refused. */
    }
    try {
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (orientation: string) => Promise<void>;
      };
      if (!this.destroyed) await orientation?.lock?.("landscape");
    } catch {
      /* Keep the landscape guard instead of pretending the lock worked. */
    }
    if (!this.destroyed) this.syncViewport();
  }

  private onDown = (event: PointerEvent): void => {
    if (
      event.pointerType !== "touch" ||
      this.pointer !== null ||
      !this.isTouch ||
      this.blocking ||
      !this.worldActive ||
      !this.movement ||
      !this.keyboard.isEnabled
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    this.pointer = event.pointerId;
    // Keep the complete pad on screen, including notched/short landscape screens.
    this.originX = event.clientX;
    this.originY = event.clientY;
    this.pad.style.left = `${Math.max(60, Math.min(window.innerWidth * 0.45 - 55, event.clientX))}px`;
    this.pad.style.top = `${Math.max(window.innerHeight * 0.42 + 55, Math.min(window.innerHeight - 65, event.clientY))}px`;
    this.pad.hidden = false;
    this.knob.style.transform = "translate(-50%, -50%)";
    this.zone.setPointerCapture(event.pointerId);
  };

  private onMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointer) return;
    if (!this.keyboard.isEnabled || !this.movement || this.blocking) {
      this.reset();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const dx = event.clientX - this.originX,
      dy = event.clientY - this.originY;
    const length = Math.hypot(dx, dy),
      scale = Math.max(TOUCH_STICK.radius, length);
    const x = dx / scale,
      y = dy / scale;
    this.knob.style.transform = `translate(calc(-50% + ${x * 40}px), calc(-50% + ${y * 40}px))`;
    this.running =
      Math.abs(y) > 0.65 &&
      length > (this.running ? TOUCH_STICK.runExit : TOUCH_STICK.runEnter);
    this.keyboard.setTouchMovement(x, y, this.running);
    this.pad.dataset.pace = this.keyboard.run
      ? "run"
      : this.keyboard.forward || this.keyboard.backward
        ? "walk"
        : "idle";
    this.pad.dataset.x = this.keyboard.left
      ? "left"
      : this.keyboard.right
        ? "right"
        : "none";
    this.pad.dataset.y = this.keyboard.forward
      ? "up"
      : this.keyboard.backward
        ? "down"
        : "none";
  };

  private onUp = (event: PointerEvent): void => {
    if (event.pointerId === this.pointer) this.reset();
  };

  private reset = (): void => {
    const pointer = this.pointer;
    this.pointer = null;
    this.running = false;
    this.pad.hidden = true;
    this.pad.dataset.pace = "idle";
    this.pad.dataset.x = this.pad.dataset.y = "none";
    this.knob.style.transform = "translate(-50%, -50%)";
    this.keyboard.clearTouchMovement();
    if (pointer !== null && this.zone.hasPointerCapture(pointer))
      this.zone.releasePointerCapture(pointer);
  };

  destroy(): void {
    this.destroyed = true;
    this.reset();
    this.keyboard.setSuspended(false);
    if (this.hintTimer !== undefined) window.clearTimeout(this.hintTimer);
    window.removeEventListener("blur", this.reset);
    window.removeEventListener("resize", this.viewportChanged);
    document.removeEventListener("visibilitychange", this.reset);
    document.removeEventListener("fullscreenchange", this.viewportChanged);
    this.media.removeEventListener("change", this.viewportChanged);
    if (this.rotate.open) this.rotate.close();
    this.root.remove();
    this.rotate.remove();
    document.documentElement.classList.remove("has-touch-controls");
  }
}
