import type { Keyboard } from "./Keyboard";
import "./MobileControls.css";

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
  private blocking = false;
  private destroyed = false;
  private context?: MobileContext;

  constructor(private readonly keyboard: Keyboard, private readonly command: (code: string) => void) {
    this.root.className = "mobile-controls";
    this.root.hidden = true;
    this.zone.className = "mobile-controls__zone";
    this.zone.setAttribute("aria-label", "Touch and drag to move; drag farther to run");
    this.pad.className = "mobile-controls__pad";
    this.pad.hidden = true;
    this.pad.setAttribute("aria-hidden", "true");
    this.pad.innerHTML = '<span class="mobile-controls__up">▲</span><span class="mobile-controls__down">▼</span><span class="mobile-controls__left">◀</span><span class="mobile-controls__right">▶</span>';
    this.knob.className = "mobile-controls__knob";
    this.pad.appendChild(this.knob);
    this.toolbar.className = "mobile-controls__actions";
    this.previous = this.button("←", "Previous item", () => this.send("ArrowLeft"));
    this.next = this.button("→", "Next item", () => this.send("ArrowRight"));
    this.action = this.button("Interact", "Interact with nearby object", () => this.send("KeyE"));
    this.back = this.button("Back", "Return to exploring", () => this.send("Escape"));
    this.project = this.button("Open website ↗", "Open current project website", () => this.send("KeyO"));
    this.jump = this.button("Jump", "Jump", () => {
      if (this.movement && !this.blocking) this.keyboard.queueJump();
    });
    this.toolbar.append(this.previous, this.next, this.project, this.action, this.jump, this.back);
    this.fullscreen = this.button("⛶", "Enter fullscreen landscape", () => {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      else void this.requestLandscape();
    });
    this.fullscreen.className = "mobile-controls__fullscreen";
    this.hint.className = "mobile-controls__hint";
    this.hint.textContent = "Touch left to move · Drag farther to run · Drag right to look";
    this.hint.hidden = true;
    this.root.append(this.zone, this.pad, this.toolbar, this.fullscreen, this.hint);
    this.rotate.className = "mobile-rotate";
    this.rotate.setAttribute("aria-labelledby", "mobile-rotate-title");
    const title = document.createElement("h2"); title.id = "mobile-rotate-title"; title.textContent = "Turn your phone sideways";
    const message = document.createElement("p"); message.textContent = "Explore the world in landscape. Your adventure will resume when you rotate your phone.";
    this.rotateButton = this.button("Play in landscape ⛶", "Try fullscreen landscape", () => void this.requestLandscape());
    const note = document.createElement("small"); note.textContent = "If your browser cannot rotate automatically, turn your phone manually.";
    this.rotate.append(title, message, this.rotateButton, note);
    this.rotate.addEventListener("cancel", event => event.preventDefault());
    document.body.append(this.root, this.rotate);
    this.zone.addEventListener("pointerdown", this.onDown);
    this.zone.addEventListener("pointermove", this.onMove);
    this.zone.addEventListener("pointerup", this.onUp);
    this.zone.addEventListener("pointercancel", this.onUp);
    this.zone.addEventListener("lostpointercapture", this.onUp);
    this.zone.addEventListener("click", event => event.stopPropagation());
    window.addEventListener("blur", this.reset);
    window.addEventListener("resize", this.viewportChanged);
    document.addEventListener("visibilitychange", this.reset);
    document.addEventListener("fullscreenchange", this.viewportChanged);
    this.media.addEventListener("change", this.viewportChanged);
    this.setContext({ movement: false, action: null, back: false, navigation: false, openProject: false });
    this.syncViewport();
  }

  get isBlocking(): boolean { return this.blocking; }
  get isTouch(): boolean { return this.media.matches; }

  private button(text: string, label: string, click: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button"; button.textContent = text; button.setAttribute("aria-label", label);
    let touchedAt = -Infinity;
    // Explicit touch release also works for the second finger while the first
    // holds the movement pad. Keep this a user gesture for links/fullscreen.
    button.addEventListener("pointerup", event => {
      if (event.pointerType !== "touch") return;
      event.preventDefault(); event.stopPropagation(); touchedAt = performance.now(); click();
    });
    button.addEventListener("click", event => {
      event.stopPropagation();
      if (event.detail > 0 && performance.now() - touchedAt < 700) return;
      click();
    });
    return button;
  }

  setWorldActive(active: boolean): void {
    if (active === this.worldActive) return;
    this.worldActive = active;
    this.syncViewport();
  }

  setContext(context: MobileContext): void {
    const previous = this.context;
    this.context = context;
    if (previous && Object.keys(context).every(key => context[key as keyof MobileContext] === previous[key as keyof MobileContext])) return;
    this.movement = context.movement;
    this.zone.hidden = !context.movement;
    this.jump.hidden = !context.movement;
    this.action.hidden = !context.action;
    if (context.action) {
      this.action.textContent = context.action;
      this.action.setAttribute("aria-label", context.action);
    }
    this.back.hidden = !context.back;
    this.previous.hidden = this.next.hidden = !context.navigation;
    this.project.hidden = !context.openProject;
    if (!context.movement) { this.reset(); this.hint.hidden = true; }
    if (context.movement && this.isTouch && !this.hintShown) {
      this.hintShown = true;
      this.hint.hidden = false;
      this.hintTimer = window.setTimeout(() => { this.hint.hidden = true; }, 5000);
    }
  }

  private send(code: string): void {
    if (this.isTouch && this.worldActive && !this.blocking && !document.hidden) this.command(code);
  }

  private syncViewport(): void {
    document.documentElement.classList.toggle("has-touch-controls", this.isTouch);
    this.blocking = this.isTouch && this.worldActive && window.innerHeight > window.innerWidth;
    this.keyboard.setSuspended(this.blocking);
    this.root.hidden = !this.isTouch || !this.worldActive || this.blocking;
    if (this.blocking && !this.rotate.open) this.rotate.showModal();
    if (!this.blocking && this.rotate.open) this.rotate.close();
    this.fullscreen.setAttribute("aria-label", document.fullscreenElement ? "Exit fullscreen" : "Enter fullscreen landscape");
  }

  private viewportChanged = (): void => { this.reset(); this.syncViewport(); };

  /** Must be called directly by a visitor's tap; unsupported APIs are optional. */
  async requestLandscape(): Promise<void> {
    if (!this.isTouch || this.destroyed) return;
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch { /* Manual rotation remains available when fullscreen is refused. */ }
    try {
      const orientation = screen.orientation as ScreenOrientation & { lock?: (orientation: string) => Promise<void> };
      if (!this.destroyed) await orientation?.lock?.("landscape");
    } catch { /* Keep the landscape guard instead of pretending the lock worked. */ }
    if (!this.destroyed) this.syncViewport();
  }

  private onDown = (event: PointerEvent): void => {
    if (event.pointerType !== "touch" || this.pointer !== null || !this.isTouch || this.blocking ||
        !this.worldActive || !this.movement || !this.keyboard.isEnabled) return;
    event.preventDefault(); event.stopPropagation();
    this.pointer = event.pointerId;
    // Keep the complete pad on screen, including notched/short landscape screens.
    this.originX = event.clientX;
    this.originY = event.clientY;
    this.pad.style.left = `${Math.max(60, Math.min(window.innerWidth * .45 - 55, event.clientX))}px`;
    this.pad.style.top = `${Math.max(window.innerHeight * .42 + 55, Math.min(window.innerHeight - 65, event.clientY))}px`;
    this.pad.hidden = false; this.knob.style.transform = "translate(-50%, -50%)";
    this.zone.setPointerCapture(event.pointerId);
  };

  private onMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointer) return;
    if (!this.keyboard.isEnabled || !this.movement || this.blocking) { this.reset(); return; }
    event.preventDefault(); event.stopPropagation();
    const dx = event.clientX - this.originX, dy = event.clientY - this.originY;
    const length = Math.hypot(dx, dy), scale = Math.max(48, length);
    const x = dx / scale, y = dy / scale;
    this.knob.style.transform = `translate(calc(-50% + ${x * 34}px), calc(-50% + ${y * 34}px))`;
    this.keyboard.setTouchMovement(x, y, length > 42);
  };

  private onUp = (event: PointerEvent): void => {
    if (event.pointerId === this.pointer) this.reset();
  };

  private reset = (): void => {
    const pointer = this.pointer;
    this.pointer = null;
    this.pad.hidden = true;
    this.keyboard.clearTouchMovement();
    if (pointer !== null && this.zone.hasPointerCapture(pointer)) this.zone.releasePointerCapture(pointer);
  };

  destroy(): void {
    this.destroyed = true; this.reset(); this.keyboard.setSuspended(false);
    if (this.hintTimer !== undefined) window.clearTimeout(this.hintTimer);
    window.removeEventListener("blur", this.reset);
    window.removeEventListener("resize", this.viewportChanged);
    document.removeEventListener("visibilitychange", this.reset);
    document.removeEventListener("fullscreenchange", this.viewportChanged);
    this.media.removeEventListener("change", this.viewportChanged);
    if (this.rotate.open) this.rotate.close();
    this.root.remove(); this.rotate.remove();
    document.documentElement.classList.remove("has-touch-controls");
  }
}
