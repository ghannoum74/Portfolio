import * as THREE from "three";
import type { AnimatedBook3D } from "../../world/house/AnimatedBook3D";
import type { PortfolioProject } from "../../data/projects";
import { PROJECT_SCREENSHOT_FRAME } from "../../world/house/book/ProjectPageTexture";
import "./ProjectWebsitePreview.css";

/**
 * Hover + click interaction over the actual BOOK_SCREENSHOT_PAGE mesh.
 * No wheel listener, camera override, SVG portal, or iframe is involved.
 */
export class ProjectWebsitePreview {
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly tooltip: HTMLDivElement;
  private readonly title: HTMLSpanElement;
  private readonly host: HTMLSpanElement;
  private pointerX = 0;
  private pointerY = 0;
  private pointerInside = false;
  private hovering = false;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly canvas: HTMLCanvasElement,
  ) {
    this.tooltip = document.createElement("div");
    this.tooltip.className = "book-website-tooltip";
    this.tooltip.setAttribute("role", "status");
    this.tooltip.innerHTML = `
      <span class="book-website-tooltip__icon" aria-hidden="true">↗</span>
      <span class="book-website-tooltip__copy">
        <span class="book-website-tooltip__title"></span>
        <span class="book-website-tooltip__host"></span>
      </span>
      <span class="book-website-tooltip__action">Click to visit</span>
    `;
    const title = this.tooltip.querySelector<HTMLSpanElement>(".book-website-tooltip__title");
    const host = this.tooltip.querySelector<HTMLSpanElement>(".book-website-tooltip__host");
    if (!title || !host) throw new Error("Website tooltip elements missing");
    this.title = title;
    this.host = host;
    document.body.appendChild(this.tooltip);
    this.canvas.addEventListener("pointermove", this.onMove);
    this.canvas.addEventListener("pointerleave", this.onLeave);
  }

  private onMove = (event: PointerEvent): void => {
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;
    this.pointerInside = true;
  };

  private onLeave = (): void => {
    this.pointerInside = false;
    this.hide();
  };

  private screenshotMesh(book: AnimatedBook3D): THREE.Mesh | null {
    const root = book.model.getObjectByName("BOOK_SCREENSHOT_PAGE");
    if (root instanceof THREE.Mesh) return root;
    let result: THREE.Mesh | null = null;
    root?.traverse(child => {
      if (!result && child instanceof THREE.Mesh) result = child;
    });
    return result;
  }

  private isInsideFrame(mesh: THREE.Mesh, clientX: number, clientY: number): boolean {
    const canvasRect = this.canvas.getBoundingClientRect();
    if (canvasRect.width <= 0 || canvasRect.height <= 0) return false;
    this.pointer.set(
      ((clientX - canvasRect.left) / canvasRect.width) * 2 - 1,
      -((clientY - canvasRect.top) / canvasRect.height) * 2 + 1,
    );
    this.camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObject(mesh, true)[0];
    if (!hit?.uv) return false;

    const uv = mesh.geometry.getAttribute("uv");
    if (!uv) return false;
    let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity;
    for (let i = 0; i < uv.count; i++) {
      minU = Math.min(minU, uv.getX(i));
      maxU = Math.max(maxU, uv.getX(i));
      minV = Math.min(minV, uv.getY(i));
      maxV = Math.max(maxV, uv.getY(i));
    }
    const du = maxU - minU;
    const dv = maxV - minV;
    if (du <= 0 || dv <= 0) return false;

    // Same UV mapping that is currently used by the Blender-exported page.
    const u = (hit.uv.x - minU) / du;
    const v = (hit.uv.y - minV) / dv;
    const frame = PROJECT_SCREENSHOT_FRAME;
    return (
      u >= frame.x / frame.textureWidth &&
      u <= (frame.x + frame.width) / frame.textureWidth &&
      v >= frame.y / frame.textureHeight &&
      v <= (frame.y + frame.height) / frame.textureHeight
    );
  }

  private getProjectUrl(project: PortfolioProject): URL | null {
    try {
      const configured = project.demoUrl || project.projectUrl;
      const url = new URL(configured, window.location.href);
      return url.protocol === "https:" || url.protocol === "http:" ? url : null;
    } catch {
      return null;
    }
  }

  /** Called each frame; updates the hover state as the player changes projects. */
  update(book: AnimatedBook3D | null): void {
    if (!book || book.currentState !== "open" || !this.pointerInside) {
      this.hide();
      return;
    }
    const mesh = this.screenshotMesh(book);
    if (!mesh || !this.isInsideFrame(mesh, this.pointerX, this.pointerY)) {
      this.hide();
      return;
    }
    const project = book.currentProject;
    const url = this.getProjectUrl(project);
    if (!url) {
      this.hide();
      return;
    }
    this.hovering = true;
    this.canvas.style.cursor = "pointer";
    this.title.textContent = project.title;
    this.host.textContent = url.host;
    this.tooltip.classList.add("is-visible");
    const x = Math.min(this.pointerX + 19, window.innerWidth - 280);
    const y = Math.min(this.pointerY + 19, window.innerHeight - 100);
    this.tooltip.style.transform = `translate(${Math.max(12, x)}px, ${Math.max(12, y)}px)`;
  }

  /** Invoke synchronously from the user's click or keydown for popup safety. */
  openCurrent(book: AnimatedBook3D | null): boolean {
    if (!book || book.currentState !== "open") return false;
    const project = book.currentProject;
    const url = this.getProjectUrl(project);
    if (!url) {
      console.warn("Invalid website URL for project:", project.id);
      return false;
    }

    // A real new tab navigates through our short branded entrance page.
    // No delayed window.open(), so the browser sees a genuine user gesture.
    const transition = new URL("project-enter.html", document.baseURI);
    transition.searchParams.set("to", url.href);
    transition.searchParams.set("title", project.title);
    transition.searchParams.set("image", project.screenshot);
    window.open(transition.href, "_blank", "noopener,noreferrer");
    this.hide();
    return true;
  }

  openAt(book: AnimatedBook3D | null, clientX: number, clientY: number): boolean {
    if (!book || book.currentState !== "open") return false;
    const mesh = this.screenshotMesh(book);
    if (!mesh || !this.isInsideFrame(mesh, clientX, clientY)) return false;
    return this.openCurrent(book);
  }

  hide(): void {
    if (this.hovering) this.canvas.style.cursor = "";
    this.hovering = false;
    this.tooltip.classList.remove("is-visible");
  }

  destroy(): void {
    this.hide();
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerleave", this.onLeave);
    this.tooltip.remove();
  }
}
