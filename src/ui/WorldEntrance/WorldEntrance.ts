import Lenis from "lenis";
import "lenis/dist/lenis.css";
import "./WorldEntrance.css";
import { OrganicPortalMask } from "./OrganicPortalMask";

type EntranceState = "idle" | "active" | "complete";

interface WorldEntranceOptions {
  onProgress?: (progress: number) => void;
  onComplete: () => void;
  onEnter?: () => void;
}

export class WorldEntrance {
  private readonly section: HTMLElement;
  private readonly portal: HTMLElement;

  private state: EntranceState = "idle";

  private lenis: Lenis | null = null;

  private readonly mask: OrganicPortalMask;

  private readonly reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  constructor(private readonly options: WorldEntranceOptions) {
    this.section = this.find("world-entrance");
    this.portal = this.find("world-portal");

    const shape = document.getElementById("world-portal-shape");

    if (!(shape instanceof SVGPathElement)) {
      throw new Error("Missing SVG world-portal-shape");
    }

    this.mask = new OrganicPortalMask(shape);
    document
      .querySelector("[data-enter-world]")
      ?.addEventListener("click", this.onEnter);

    this.renderProgress(0);
  }

  private find(id: string): HTMLElement {
    const element = document.getElementById(id);

    if (!element) {
      throw new Error(`Missing entrance element: #${id}`);
    }

    return element;
  }

  private onEnter = (): void => {
    if (this.state !== "active") return;
    this.options.onEnter?.();
    this.finish();
  };

  activate(): void {
    if (this.state !== "idle") return;

    this.state = "active";

    window.scrollTo(0, 0);

    document.documentElement.classList.remove("is-loading");

    this.lenis = new Lenis({
      smoothWheel: true,

      lerp: 0.05,

      autoRaf: false,

      syncTouch: false,

      respectReducedMotion: true,
    });

    this.lenis.on("scroll", this.onSmoothScroll);

    window.addEventListener("resize", this.onResize);

    this.update();
  }

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

    const progress = this.clamp(-rect.top / travel);

    if (this.reducedMotion && progress > 0.02) {
      this.finish();
      return;
    }

    this.renderProgress(progress);

    if (progress >= 0.995) {
      this.finish();
    }
  }

  private renderProgress(progress: number): void {
    const revealProgress = this.clamp((progress - 0.12) / 0.88);

    this.mask.setProgress(revealProgress);

    const opacity = this.clamp((progress - 0.12) / 0.08);

    this.portal.style.setProperty("--entrance-opacity", String(opacity));

    this.options.onProgress?.(revealProgress);
  }

  private finish(): void {
    if (this.state !== "active") return;

    this.state = "complete";

    this.destroyLenis();

    window.removeEventListener("resize", this.onResize);

    this.renderProgress(1);

    this.section.classList.add("world-entrance_complete");

    document.documentElement.classList.add("is-world");

    window.scrollTo(0, 0);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.options.onComplete();
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
    document
      .querySelector("[data-enter-world]")
      ?.removeEventListener("click", this.onEnter);
    this.destroyLenis();

    window.removeEventListener("resize", this.onResize);
  }
}
