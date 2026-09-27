import Lenis from "lenis";
import "lenis/dist/lenis.css";
import "./WorldEntrance.css";
import { OrganicPortalMask } from "./OrganicPortalMask";

type EntranceState = "idle" | "active" | "complete";

export class WorldEntrance {
  private readonly section: HTMLElement;
  private readonly portal: HTMLElement;

  private state: EntranceState = "idle";

  // Created only while the introduction is active.
  private lenis: Lenis | null = null;

  private readonly mask: OrganicPortalMask;

  private readonly reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  constructor(private readonly onComplete: () => void) {
    this.section = this.find("world-entrance");
    this.portal = this.find("world-portal");

    const shape = document.getElementById("world-portal-shape");

    if (!(shape instanceof SVGPathElement)) {
      throw new Error("Missing SVG world-portal-shape");
    }

    this.mask = new OrganicPortalMask(shape);

    this.renderProgress(0);
  }

  private find(id: string): HTMLElement {
    const element = document.getElementById(id);

    if (!element) {
      throw new Error(`Missing entrance element: #${id}`);
    }

    return element;
  }

  /**
   * Start scrolling only after the world
   * has loaded and the loading screen is gone.
   */
  activate(): void {
    if (this.state !== "idle") return;

    this.state = "active";

    // Start at the beginning of the introduction.
    window.scrollTo(0, 0);

    // Unlock native document scrolling.
    document.documentElement.classList.remove("is-loading");

    // Lenis controls the window's scroll position.
    this.lenis = new Lenis({
      smoothWheel: true,

      // Smaller values produce a longer,
      // smoother trailing effect.
      lerp: 0.05,

      // Game.ts already has a render loop.
      // Do not start a second one.
      autoRaf: false,

      // Keep normal native touch scrolling.
      syncTouch: false,

      // Honor the visitor's accessibility preference.
      respectReducedMotion: true,
    });

    // Update the portal whenever Lenis changes
    // the actual scroll position.
    this.lenis.on("scroll", this.onSmoothScroll);

    window.addEventListener("resize", this.onResize);

    this.update();
  }

  /**
   * Called from the existing Three.js game loop.
   *
   * Lenis expects a timestamp in milliseconds,
   * not your game's delta in seconds.
   */
  raf(time: number): void {
    if (this.state !== "active") return;

    this.lenis?.raf(time);
  }

  private onSmoothScroll = (): void => {
    this.update();
  };

  private onResize = (): void => {
    if (this.state !== "active") return;

    this.lenis?.resize();
    this.update();
  };

  private update(): void {
    if (this.state !== "active") return;

    const rect = this.section.getBoundingClientRect();

    const travel = Math.max(this.section.offsetHeight - window.innerHeight, 1);

    // Progress uses the actual, smoothed
    // scroll position rather than wheel input.
    const progress = this.clamp(-rect.top / travel);

    if (this.reducedMotion && progress > 0.02) {
      this.finish();
      return;
    }

    this.renderProgress(progress);

    // Finish only when the animated scroll
    // has reached the end of the introduction.
    if (progress >= 0.995) {
      this.finish();
    }
  }

  private renderProgress(progress: number): void {
    const revealProgress = this.clamp((progress - 0.12) / 0.88);

    this.mask.setProgress(revealProgress);

    const opacity = this.clamp((progress - 0.12) / 0.08);

    this.portal.style.setProperty("--entrance-opacity", String(opacity));
  }

  private finish(): void {
    if (this.state !== "active") return;

    // Prevent repeated completion callbacks.
    this.state = "complete";

    // Remove scroll momentum before changing
    // document height and locking scrolling.
    this.destroyLenis();

    window.removeEventListener("resize", this.onResize);

    // Guarantee the exact final visual state.
    this.renderProgress(1);

    // The portal becomes fixed and full-screen.
    this.section.classList.add("world-entrance_complete");

    document.documentElement.classList.add("is-world");

    // Safe now because the world is fixed.
    window.scrollTo(0, 0);

    // Paint the full-screen world before
    // Game.ts opens the rules dialog.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.onComplete();
      });
    });
  }

  private destroyLenis(): void {
    if (!this.lenis) return;

    this.lenis.off("scroll", this.onSmoothScroll);

    this.lenis.stop();
    this.lenis.destroy();

    this.lenis = null;
  }

  private clamp(value: number): number {
    return Math.min(1, Math.max(0, value));
  }

  destroy(): void {
    this.destroyLenis();

    window.removeEventListener("resize", this.onResize);
  }
}
