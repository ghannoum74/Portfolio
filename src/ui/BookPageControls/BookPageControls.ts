import * as THREE from "three";
import type { AnimatedBook3D } from "../../world/house/AnimatedBook3D";
import "./BookPageControls.css";

/** Screen-space controls anchored to the physical book, not a book-shaped UI. */
export class BookPageControls {
  private readonly root: HTMLDivElement;
  private readonly previous: HTMLButtonElement;
  private readonly next: HTMLButtonElement;
  private readonly counter: HTMLSpanElement;
  private readonly bounds = new THREE.Box3();
  private readonly corner = new THREE.Vector3();
  private readonly bookWorld = new THREE.Matrix4();
  private readonly cameraWorld = new THREE.Matrix4();
  private readonly projection = new THREE.Matrix4();
  private layoutBook: AnimatedBook3D | null = null;
  private layoutPoseRevision = -1;
  private viewportWidth = 0;
  private viewportHeight = 0;
  private visible = false;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly onPrevious: () => void,
    private readonly onNext: () => void,
  ) {
    this.root = document.createElement("div");
    this.root.className = "book-page-controls";
    this.root.innerHTML = `
      <button class="book-page-controls_button" type="button" data-book-prev aria-label="Previous project">
        <img src="/assets/icons/chevron-icon.webp" class="book-page-controls_chevron book-page-controls_chevron--left" alt="" />
      </button>
      <div class="book-page-controls_counter" aria-live="polite"></div>
      <button class="book-page-controls_button" type="button" data-book-next aria-label="Next project">
        <img src="/assets/icons/chevron-icon.webp" class="book-page-controls_chevron book-page-controls_chevron--right" alt="" />
      </button>
    `;
    this.previous =
      this.root.querySelector<HTMLButtonElement>("[data-book-prev]")!;
    this.next = this.root.querySelector<HTMLButtonElement>("[data-book-next]")!;
    this.counter = this.root.querySelector<HTMLSpanElement>(
      ".book-page-controls_counter",
    )!;
    this.previous.addEventListener("click", this.onPreviousClick);
    this.next.addEventListener("click", this.onNextClick);
    document.body.appendChild(this.root);
  }

  private onPreviousClick = (): void => this.onPrevious();
  private onNextClick = (): void => this.onNext();

  update(book: AnimatedBook3D | null): void {
    const enabled = !!book && book.currentState === "open";
    if (!book || !enabled) { this.hide(); return; }
    if (!this.visible) {
      this.root.classList.add("is-visible");
      this.visible = true;
    }

    if (this.previous.disabled !== !book.canTurnBack) this.previous.disabled = !book.canTurnBack;
    if (this.next.disabled !== !book.canTurnPage) this.next.disabled = !book.canTurnPage;
    const label = `${String(book.currentProjectIndex + 1).padStart(2, "0")} / ${String(book.projectCount).padStart(2, "0")}`;
    if (this.counter.textContent !== label) this.counter.textContent = label;

    // Place the controls on opposite sides of the projected book rather
    // than near the viewport corners. The book can have any world position.
    book.model.updateWorldMatrix(true, false);
    const boundsChanged = book !== this.layoutBook || book.poseRevision !== this.layoutPoseRevision ||
      !this.bookWorld.equals(book.model.matrixWorld);
    if (boundsChanged) {
      // Preserve precise morph-aware bounds; scan vertices only after a pose/transform change.
      this.bounds.setFromObject(book.model, true);
      this.layoutBook = book;
      this.layoutPoseRevision = book.poseRevision;
      this.bookWorld.copy(book.model.matrixWorld);
    }
    if (this.bounds.isEmpty()) return;
    this.camera.updateMatrixWorld();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (!boundsChanged && vw === this.viewportWidth && vh === this.viewportHeight &&
        this.cameraWorld.equals(this.camera.matrixWorld) && this.projection.equals(this.camera.projectionMatrix)) return;
    this.viewportWidth = vw; this.viewportHeight = vh;
    this.cameraWorld.copy(this.camera.matrixWorld); this.projection.copy(this.camera.projectionMatrix);

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < 8; i++) {
      this.corner.set(i & 4 ? this.bounds.max.x : this.bounds.min.x,
        i & 2 ? this.bounds.max.y : this.bounds.min.y, i & 1 ? this.bounds.max.z : this.bounds.min.z).project(this.camera);
      const x = (this.corner.x + 1) * 0.5 * vw, y = (1 - this.corner.y) * 0.5 * vh;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const centerY = (minY + maxY) / 2;
    const left = THREE.MathUtils.clamp(minX - 76, 62, vw - 62);
    const right = THREE.MathUtils.clamp(maxX + 76, 62, vw - 62);
    const y = THREE.MathUtils.clamp(centerY, 86, vh - 86);

    if (this.previous.style.left !== `${left}px`) this.previous.style.left = `${left}px`;
    if (this.previous.style.top !== `${y}px`) this.previous.style.top = `${y}px`;
    if (this.next.style.left !== `${right}px`) this.next.style.left = `${right}px`;
    if (this.next.style.top !== `${y}px`) this.next.style.top = `${y}px`;
  }

  hide(): void {
    if (this.visible) this.root.classList.remove("is-visible");
    this.visible = false;
    this.layoutBook = null;
  }

  destroy(): void {
    this.hide();
    this.previous.removeEventListener("click", this.onPreviousClick);
    this.next.removeEventListener("click", this.onNextClick);
    this.root.remove();
  }
}
