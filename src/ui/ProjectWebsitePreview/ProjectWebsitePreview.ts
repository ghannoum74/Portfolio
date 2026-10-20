import * as THREE from "three";
import type { AnimatedBook3D } from "../../world/house/AnimatedBook3D";
import type { PortfolioProject } from "../../data/projects";
import { PROJECT_SCREENSHOT_FRAME } from "../../world/house/book/ProjectPageTexture";
import "./ProjectWebsitePreview.css";

type UVRect = { minU: number; maxU: number; minV: number; maxV: number };
type Point = [number, number];

/**
 * Modern hover for the REAL textured right-hand page, not an HTML book modal.
 * No scroll input, popup splash screen, or camera overrides.
 */
export class ProjectWebsitePreview {
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();

  private readonly overlay: HTMLDivElement;
  private readonly polygon: SVGPolygonElement;

  private pointerX = 0;
  private pointerY = 0;
  private pointerInside = false;
  private hovering = false;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly canvas: HTMLCanvasElement,
  ) {
    this.overlay = document.createElement("div");
    this.overlay.className = "book-live-hover";
    this.overlay.setAttribute("aria-hidden", "true");
    this.overlay.innerHTML = `
      <svg class="book-live-hover_outline" focusable="false">
        <polygon></polygon>
      </svg>
      <div class="book-live-hover_action">
        <span>Open website</span>
        <span aria-hidden="true">↗</span>
      </div>
    `;

    const polygon = this.overlay.querySelector<SVGPolygonElement>("polygon");
    if (!polygon) {
      throw new Error("ProjectWebsitePreview DOM could not be created");
    }
    this.polygon = polygon;

    document.body.appendChild(this.overlay);
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
    root?.traverse((child) => {
      if (!result && child instanceof THREE.Mesh) result = child;
    });
    return result;
  }

  private bounds(mesh: THREE.Mesh): UVRect | null {
    const uv = mesh.geometry.getAttribute("uv");
    if (!uv || uv.count === 0) return null;
    let minU = Infinity;
    let minV = Infinity;
    let maxU = -Infinity;
    let maxV = -Infinity;
    for (let i = 0; i < uv.count; i++) {
      minU = Math.min(minU, uv.getX(i));
      minV = Math.min(minV, uv.getY(i));
      maxU = Math.max(maxU, uv.getX(i));
      maxV = Math.max(maxV, uv.getY(i));
    }
    if (maxU - minU < 0.00001 || maxV - minV < 0.00001) return null;
    return { minU, maxU, minV, maxV };
  }

  /** Convert the drawn browser rectangle to raw Blender page UVs. */
  private frameUV(b: UVRect): UVRect {
    const f = PROJECT_SCREENSHOT_FRAME;
    const du = b.maxU - b.minU;
    const dv = b.maxV - b.minV;
    return {
      minU: b.minU + (du * f.x) / f.textureWidth,
      maxU: b.minU + (du * (f.x + f.width)) / f.textureWidth,
      minV: b.minV + (dv * f.y) / f.textureHeight,
      maxV: b.minV + (dv * (f.y + f.height)) / f.textureHeight,
    };
  }

  private isInsideFrame(mesh: THREE.Mesh, x: number, y: number): boolean {
    const canvasRect = this.canvas.getBoundingClientRect();
    if (canvasRect.width <= 0 || canvasRect.height <= 0) return false;
    const uv = this.bounds(mesh);
    if (!uv) return false;
    const f = this.frameUV(uv);

    this.pointer.set(
      ((x - canvasRect.left) / canvasRect.width) * 2 - 1,
      (-(y - canvasRect.top) / canvasRect.height) * 2 + 1,
    );
    this.camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObject(mesh, true)[0];
    return (
      !!hit?.uv &&
      hit.uv.x >= f.minU &&
      hit.uv.x <= f.maxU &&
      hit.uv.y >= f.minV &&
      hit.uv.y <= f.maxV
    );
  }

  /** Project all four corners of the physical screenshot into screen space. */
  private projectFrame(mesh: THREE.Mesh): Point[] | null {
    const uv = mesh.geometry.getAttribute("uv");
    const position = mesh.geometry.getAttribute("position");
    const b = this.bounds(mesh);
    if (!b || !uv || !position) return null;
    const f = this.frameUV(b);

    // The supplied Blender book uses a rectangular four-corner page.
    const corner = (u: number, v: number): THREE.Vector3 => {
      let index = 0;
      let best = Infinity;
      for (let i = 0; i < uv.count; i++) {
        const d = (uv.getX(i) - u) ** 2 + (uv.getY(i) - v) ** 2;
        if (d < best) {
          best = d;
          index = i;
        }
      }
      return new THREE.Vector3().fromBufferAttribute(position, index);
    };

    const p00 = corner(b.minU, b.minV);
    const p10 = corner(b.maxU, b.minV);
    const p01 = corner(b.minU, b.maxV);
    const p11 = corner(b.maxU, b.maxV);

    mesh.updateWorldMatrix(true, false);
    this.camera.updateMatrixWorld(true);
    const rect = this.canvas.getBoundingClientRect();

    const project = (u: number, v: number): Point => {
      const du = (u - b.minU) / (b.maxU - b.minU);
      const dv = (v - b.minV) / (b.maxV - b.minV);
      const local = p00
        .clone()
        .lerp(p10, du)
        .lerp(p01.clone().lerp(p11, du), dv);
      const ndc = local.applyMatrix4(mesh.matrixWorld).project(this.camera);
      return [
        rect.left + (ndc.x + 1) * 0.5 * rect.width,
        rect.top + (1 - ndc.y) * 0.5 * rect.height,
      ];
    };

    const points = [
      project(f.minU, f.minV),
      project(f.maxU, f.minV),
      project(f.maxU, f.maxV),
      project(f.minU, f.maxV),
    ];
    return points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
      ? points
      : null;
  }

  private getProjectUrl(project: PortfolioProject): URL | null {
    try {
      const url = new URL(
        project.demoUrl || project.projectUrl,
        window.location.href,
      );
      return url.protocol === "https:" || url.protocol === "http:" ? url : null;
    } catch {
      return null;
    }
  }

  /** Called every frame by Game.ts, only when the book is in reading mode. */
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
    const url = this.getProjectUrl(book.currentProject);
    if (!url) {
      this.hide();
      return;
    }
    const points = this.projectFrame(mesh);
    if (!points) {
      this.hide();
      return;
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    this.polygon.setAttribute(
      "points",
      points.map(([x, y]) => `${x},${y}`).join(" "),
    );
    this.overlay
      .querySelector("svg")
      ?.setAttribute("viewBox", `0 0 ${vw} ${vh}`);

    // CTA is anchored to the PAGE, not the moving mouse cursor.
    const right = Math.max(...points.map(([x]) => x));
    const bottom = Math.max(...points.map(([, y]) => y));
    this.overlay.style.setProperty(
      "--book-action-x",
      `${THREE.MathUtils.clamp(right - 14, 160, vw - 16)}px`,
    );
    this.overlay.style.setProperty(
      "--book-action-y",
      `${THREE.MathUtils.clamp(bottom - 12, 75, vh - 16)}px`,
    );

    this.hovering = true;
    this.canvas.style.cursor = "pointer";
    this.overlay.classList.add("is-visible");
  }

  /** Opens directly in a new tab, synchronously within the click or key event. */
  openCurrent(book: AnimatedBook3D | null): boolean {
    if (!book || book.currentState !== "open") return false;
    const url = this.getProjectUrl(book.currentProject);
    if (!url) return false;
    window.open(url.href, "_blank", "noopener,noreferrer");
    this.hide();
    return true;
  }

  openAt(
    book: AnimatedBook3D | null,
    clientX: number,
    clientY: number,
  ): boolean {
    if (!book || book.currentState !== "open") return false;
    const mesh = this.screenshotMesh(book);
    if (!mesh || !this.isInsideFrame(mesh, clientX, clientY)) return false;
    return this.openCurrent(book);
  }

  hide(): void {
    this.overlay.classList.remove("is-visible");
    if (this.hovering) this.canvas.style.cursor = "";
    this.hovering = false;
  }

  destroy(): void {
    this.hide();
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerleave", this.onLeave);
    this.overlay.remove();
  }
}
