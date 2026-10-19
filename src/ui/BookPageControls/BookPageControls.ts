import * as THREE from "three";
import type { AnimatedBook3D } from "../../world/house/AnimatedBook3D";
import "./BookPageControls.css";

/** Screen-space controls anchored to the physical book, not a book-shaped UI. */
export class BookPageControls {
  private readonly root: HTMLDivElement;
  private readonly previous: HTMLButtonElement;
  private readonly next: HTMLButtonElement;
  private readonly counter: HTMLSpanElement;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly onPrevious: () => void,
    private readonly onNext: () => void,
  ) {
    this.root = document.createElement("div");
    this.root.className = "book-page-controls";
    this.root.innerHTML = `
      <button class="book-page-controls__button" type="button" data-book-prev aria-label="Previous project">
        <img src="/assets/icons/chevron-icon.webp" class="book-page-controls__chevron book-page-controls__chevron--left" alt="" />
        <kbd>←</kbd><span>Previous</span>
      </button>
      <div class="book-page-controls__counter" aria-live="polite"></div>
      <button class="book-page-controls__button" type="button" data-book-next aria-label="Next project">
        <span>Next</span><kbd>→</kbd>
        <img src="/assets/icons/chevron-icon.webp" class="book-page-controls__chevron book-page-controls__chevron--right" alt="" />
      </button>
    `;
    this.previous = this.root.querySelector<HTMLButtonElement>("[data-book-prev]")!;
    this.next = this.root.querySelector<HTMLButtonElement>("[data-book-next]")!;
    this.counter = this.root.querySelector<HTMLSpanElement>(".book-page-controls__counter")!;
    this.previous.addEventListener("click", this.onPreviousClick);
    this.next.addEventListener("click", this.onNextClick);
    document.body.appendChild(this.root);
  }

  private onPreviousClick = (): void => this.onPrevious();
  private onNextClick = (): void => this.onNext();

  update(book: AnimatedBook3D | null): void {
    const enabled = !!book && book.currentState === "open";
    this.root.classList.toggle("is-visible", enabled);
    if (!book || !enabled) return;

    this.previous.disabled = !book.canTurnBack;
    this.next.disabled = !book.canTurnPage;
    this.counter.textContent = `${String(book.currentProjectIndex + 1).padStart(2, "0")} / ${String(book.projectCount).padStart(2, "0")}`;

    // Place the controls on opposite sides of the projected book rather
    // than near the viewport corners. The book can have any world position.
    const box = new THREE.Box3().setFromObject(book.model, true);
    if (box.isEmpty()) return;
    this.camera.updateMatrixWorld();
    const corners: THREE.Vector3[] = [];
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z])
          corners.push(new THREE.Vector3(x, y, z).project(this.camera));

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const minX = Math.min(...corners.map(p => (p.x + 1) * 0.5 * vw));
    const maxX = Math.max(...corners.map(p => (p.x + 1) * 0.5 * vw));
    const centerY = (Math.min(...corners.map(p => (1 - p.y) * 0.5 * vh)) +
      Math.max(...corners.map(p => (1 - p.y) * 0.5 * vh))) / 2;
    const left = THREE.MathUtils.clamp(minX - 76, 62, vw - 62);
    const right = THREE.MathUtils.clamp(maxX + 76, 62, vw - 62);
    const y = THREE.MathUtils.clamp(centerY, 86, vh - 86);

    this.previous.style.left = `${left}px`;
    this.previous.style.top = `${y}px`;
    this.next.style.left = `${right}px`;
    this.next.style.top = `${y}px`;
  }

  hide(): void { this.root.classList.remove("is-visible"); }

  destroy(): void {
    this.previous.removeEventListener("click", this.onPreviousClick);
    this.next.removeEventListener("click", this.onNextClick);
    this.root.remove();
  }
}
