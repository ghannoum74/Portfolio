import { PROJECTS } from "../../data/projects";
import type { PortfolioProject } from "../../data/projects";
import { OrganicPortalMask } from "../WorldEntrance/OrganicPortalMask";
import "./ProjectBook.css";

interface ProjectBookOptions {
  onClose: () => void;
}

type TurnDirection = -1 | 1;

export class ProjectBook {
  private readonly dialog: HTMLDialogElement;
  private readonly spread: HTMLElement;
  private readonly pageNumber: HTMLElement;

  private readonly portal: HTMLDivElement;
  private readonly portalImage: HTMLImageElement;
  private readonly portalMask: OrganicPortalMask;

  private index = 0;
  private turning = false;
  private entering = false;
  private navigating = false;

  private progress = 0;
  private target = 0;

  private sourceRect: DOMRect | null = null;
  private projectUrl = "";

  private readonly scrollSensitivity = 0.00065;
  private readonly reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  private portalHasProgressed = false;

  constructor(private readonly options: ProjectBookOptions) {
    const root = document.getElementById("ui-root");

    if (!root) {
      throw new Error("Missing #ui-root");
    }

    this.dialog = document.createElement("dialog");
    this.dialog.className = "project-book";

    this.dialog.innerHTML = `
      <div class="project-book_shell">
        <header class="project-book_toolbar">
          <span>THE ARCHIVE OF CREATIONS</span>

          <button
            type="button"
            data-close
            aria-label="Close book"
          >
            ✕
          </button>
        </header>

        <div class="project-book_book">
          <div
            class="project-book_spread"
            data-spread
          ></div>

          <div class="project-book_spine"></div>
        </div>

        <footer class="project-book_controls">
          <button type="button" data-prev>
            ← Previous
          </button>

          <span data-page-number></span>

          <button type="button" data-next>
            Next →
          </button>
        </footer>
      </div>
    `;

    root.appendChild(this.dialog);

    const spread = this.dialog.querySelector<HTMLElement>("[data-spread]");

    const pageNumber =
      this.dialog.querySelector<HTMLElement>("[data-page-number]");

    if (!spread || !pageNumber) {
      throw new Error("Project book elements missing");
    }

    this.spread = spread;
    this.pageNumber = pageNumber;

    this.portal = document.createElement("div");
    this.portal.className = "project-portal";

    this.portal.innerHTML = `
      <svg
        class="project-portal_defs"
        width="0"
        height="0"
        aria-hidden="true"
      >
        <defs>
          <clipPath
            id="project-portal-clip"
            clipPathUnits="objectBoundingBox"
          >
            <path data-portal-path />
          </clipPath>
        </defs>
      </svg>

      <div class="project-portal_window">
        <img
          class="project-portal_image"
          alt=""
          draggable="false"
        />
      </div>

      <button
        type="button"
        class="project-portal_back"
        data-portal-back
      >
        ← Back to book
      </button>

      <div class="project-portal_hint">
        Scroll to enter the project
      </div>

      <div class="project-portal_progress">
        <div
          class="project-portal_progress-fill"
          data-portal-progress
        ></div>
      </div>
    `;

    this.dialog.appendChild(this.portal);

    const path =
      this.portal.querySelector<SVGPathElement>("[data-portal-path]");

    const image = this.portal.querySelector<HTMLImageElement>(
      ".project-portal_image",
    );

    if (!path || !image) {
      throw new Error("Project portal elements missing");
    }

    this.portalImage = image;
    this.portalMask = new OrganicPortalMask(path);

    this.dialog.addEventListener("click", this.onClick);

    this.dialog.addEventListener("wheel", this.onBookWheel, {
      passive: false,
    });

    this.portal.addEventListener("wheel", this.onPortalWheel, {
      passive: false,
    });

    this.dialog.addEventListener("cancel", (event) => {
      event.preventDefault();

      if (this.entering) {
        this.cancelPortal();
      } else {
        this.close();
      }
    });

    this.dialog.addEventListener("close", () => {
      this.cancelPortal();
      this.options.onClose();
    });

    window.addEventListener("keydown", this.onKeyDown);
  }

  get isOpen(): boolean {
    return this.dialog.open;
  }

  get isEntering(): boolean {
    return this.entering;
  }

  open(): void {
    if (this.dialog.open) return;

    if (PROJECTS.length === 0) {
      console.warn("No projects configured");
      return;
    }

    this.index = 0;
    this.turning = false;

    this.cancelPortal();
    this.render();

    this.dialog.showModal();
  }

  close(): void {
    if (!this.dialog.open) return;

    this.dialog.close();
  }

  // Called every frame from Game.ts.
  update(delta: number): void {
    if (!this.entering || this.navigating) return;

    const safeDelta = Math.min(delta, 0.05);

    const smoothing = this.reducedMotion ? 1 : 1 - Math.exp(-7 * safeDelta);

    this.progress += (this.target - this.progress) * smoothing;

    if (Math.abs(this.progress - this.target) < 0.0005) {
      this.progress = this.target;
    }

    this.renderPortal();

    if (this.target >= 1 && this.progress >= 0.995) {
      this.finishPortal();
    }
  }

  private get current(): PortfolioProject {
    return PROJECTS[this.index];
  }

  private escape(value: string): string {
    return value.replace(/[&<>"']/g, (character) => {
      const replacements: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };

      return replacements[character];
    });
  }

  private safeUrl(value: string): string {
    try {
      const url = new URL(value, window.location.href);

      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return "#";
      }

      return this.escape(url.href);
    } catch {
      return "#";
    }
  }

  private details(project: PortfolioProject): string {
    const highlights = project.highlights
      .map((item) => `<li>${this.escape(item)}</li>`)
      .join("");

    const technologies = project.technologies
      .map((item) => `<span>${this.escape(item)}</span>`)
      .join("");

    const github = project.githubUrl
      ? `
        <a
          href="${this.safeUrl(project.githubUrl)}"
          target="_blank"
          rel="noopener noreferrer"
          class="project-book_link"
        >
          View Source Code ↗
        </a>
      `
      : "";

    return `
      <span class="project-book_eyebrow">
        A PROJECT CHAPTER
      </span>

      <h2>${this.escape(project.title)}</h2>

      <h3>${this.escape(project.subtitle)}</h3>

      <p>${this.escape(project.description)}</p>

      <div class="project-book_section-title">
        Highlights
      </div>

      <ul>${highlights}</ul>

      <div class="project-book_section-title">
        Made with
      </div>

      <div class="project-book_technologies">
        ${technologies}
      </div>

      <div class="project-book_links">
        ${github}
      </div>
    `;
  }

  private snapshot(project: PortfolioProject): string {
    return `
      <div
        class="project-book_snapshot"
        data-snapshot
        tabindex="0"
        role="button"
        aria-label="Enter ${this.escape(project.title)}"
      >
        <img
          src="${this.escape(project.screenshot)}"
          alt="${this.escape(project.title)} screenshot"
          draggable="false"
        />

        <div class="project-book_snapshot-label">
          SCROLL TO ENTER THIS WORLD ↓
        </div>
      </div>

      <p class="project-book_caption">
        A window into ${this.escape(project.title)}
      </p>
    `;
  }

  private render(): void {
    const project = this.current;

    this.spread.innerHTML = `
      <article class="project-book_page project-book_left">
        ${this.details(project)}
      </article>

      <article class="project-book_page project-book_right">
        ${this.snapshot(project)}
      </article>
    `;

    this.pageNumber.textContent = `${this.index + 1} / ${PROJECTS.length}`;

    const prev = this.dialog.querySelector<HTMLButtonElement>("[data-prev]");

    const next = this.dialog.querySelector<HTMLButtonElement>("[data-next]");

    if (prev) {
      prev.disabled = this.index === 0;
    }

    if (next) {
      next.disabled = this.index === PROJECTS.length - 1;
    }
  }

  private onClick = (event: MouseEvent): void => {
    if (!(event.target instanceof Element)) return;

    const target = event.target;

    if (target.closest("[data-portal-back]")) {
      event.preventDefault();
      this.cancelPortal();
      return;
    }

    if (this.entering) return;

    if (target.closest("[data-close]")) {
      this.close();
      return;
    }

    if (target.closest("[data-prev]")) {
      this.turn(-1);
      return;
    }

    if (target.closest("[data-next]")) {
      this.turn(1);
      return;
    }

    if (target.closest("[data-snapshot]")) {
      this.startPortal(true);
    }
  };

  private turn(direction: TurnDirection): void {
    if (this.turning || this.entering) return;

    const nextIndex = this.index + direction;

    if (nextIndex < 0 || nextIndex >= PROJECTS.length) {
      return;
    }

    this.turning = true;

    const nextProject = PROJECTS[nextIndex];

    const sheet = document.createElement("div");

    sheet.className = `project-book_turning-sheet ${
      direction === 1 ? "is-forward" : "is-backward"
    }`;

    sheet.innerHTML = `
      <div class="project-book_sheet-front">
        ${
          direction === 1
            ? this.snapshot(this.current)
            : this.details(this.current)
        }
      </div>

      <div class="project-book_sheet-back">
        ${
          direction === 1
            ? this.details(nextProject)
            : this.snapshot(nextProject)
        }
      </div>
    `;

    this.spread.appendChild(sheet);

    const finishTurn = () => {
      if (!this.turning) return;

      sheet.remove();
      this.index = nextIndex;
      this.turning = false;
      this.render();
    };

    sheet.addEventListener("animationend", finishTurn, {
      once: true,
    });
  }

  private onBookWheel = (event: WheelEvent): void => {
    if (!this.dialog.open || this.turning || this.entering) {
      return;
    }

    if (!(event.target instanceof Element)) return;

    // Only the screenshot initiates the portal.
    if (!event.target.closest("[data-snapshot]")) {
      return;
    }

    event.preventDefault();

    // Scroll down = enter.
    if (event.deltaY > 0) {
      this.startPortal(false);

      this.target = this.clamp(event.deltaY * this.scrollSensitivity);
    }
  };

  private startPortal(autoEnter: boolean): void {
    if (this.entering || this.turning) return;

    const snapshot = this.spread.querySelector<HTMLElement>("[data-snapshot]");

    if (!snapshot) return;

    this.sourceRect = snapshot.getBoundingClientRect();

    if (this.sourceRect.width <= 0 || this.sourceRect.height <= 0) {
      return;
    }

    this.projectUrl = this.current.projectUrl;

    this.portalImage.src = this.current.screenshot;
    this.portalImage.alt = this.current.title;

    this.progress = 0;
    this.target = autoEnter ? 1 : 0;

    this.entering = true;
    this.navigating = false;

    this.portal.classList.add("is-active");
    this.portalHasProgressed = false;

    this.renderPortal();
  }

  private onPortalWheel = (event: WheelEvent): void => {
    if (!this.entering || this.navigating) return;

    event.preventDefault();

    // Don't let the parent dialog handle the same wheel event.
    event.stopPropagation();

    this.target = this.clamp(
      this.target + event.deltaY * this.scrollSensitivity,
    );

    // Reverse scrolling all the way returns to the book.
    if (event.deltaY < 0 && this.target === 0) {
      // Let the animation smoothly return to zero.
      // update() will close the portal at the end.
    }
  };

  private renderPortal(): void {
    if (!this.sourceRect) return;

    const p = this.clamp(this.progress);
    const eased = p * p * (3 - 2 * p);

    const rect = this.sourceRect;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Expand screenshot from its position on the right
    // page toward the full viewport.
    const left = rect.left * (1 - eased);
    const top = rect.top * (1 - eased);

    const width = rect.width + (viewportWidth - rect.width) * eased;

    const height = rect.height + (viewportHeight - rect.height) * eased;

    this.portalImage.style.left = `${left}px`;
    this.portalImage.style.top = `${top}px`;
    this.portalImage.style.width = `${width}px`;
    this.portalImage.style.height = `${height}px`;

    // Shape originates from the screenshot rectangle.
    // Requires the sourceRect support added to
    // OrganicPortalMask.ts below.
    this.portalMask.setProgress(p, rect);

    this.portal.style.setProperty("--portal-progress", String(p));

    const progressFill = this.portal.querySelector<HTMLElement>(
      "[data-portal-progress]",
    );

    if (progressFill) {
      progressFill.style.width = `${p * 100}%`;
    }
    if (p > 0.01) {
      this.portalHasProgressed = true;
    }

    if (this.portalHasProgressed && this.target === 0 && p <= 0.001) {
      this.cancelPortal();
    }
  }

  private finishPortal(): void {
    if (this.navigating) return;

    this.navigating = true;
    this.progress = 1;
    this.target = 1;

    this.renderPortal();

    const url = this.projectUrl;

    try {
      const destination = new URL(url, window.location.href);

      if (
        destination.protocol !== "http:" &&
        destination.protocol !== "https:"
      ) {
        throw new Error("Unsupported project URL");
      }

      // Give the browser a frame to paint the completed portal.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.location.assign(destination.href);
        });
      });
    } catch (error) {
      console.error("Invalid project URL:", error);
      this.cancelPortal();
    }
  }

  private cancelPortal(): void {
    this.entering = false;
    this.navigating = false;

    this.progress = 0;
    this.target = 0;

    this.sourceRect = null;

    this.portal.classList.remove("is-active");

    this.portalImage.removeAttribute("style");
    this.portal.style.removeProperty("--portal-progress");
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (!this.dialog.open) return;

    if (event.code === "Escape") {
      event.preventDefault();

      if (this.entering) {
        this.cancelPortal();
      } else {
        this.close();
      }

      return;
    }

    if (this.entering || this.turning) return;

    if (event.code === "ArrowRight") {
      event.preventDefault();
      this.turn(1);
    }

    if (event.code === "ArrowLeft") {
      event.preventDefault();
      this.turn(-1);
    }

    if (
      (event.code === "Enter" || event.code === "Space") &&
      document.activeElement?.matches("[data-snapshot]")
    ) {
      event.preventDefault();
      this.startPortal(true);
    }
  };

  private clamp(value: number): number {
    return Math.min(1, Math.max(0, value));
  }
}
