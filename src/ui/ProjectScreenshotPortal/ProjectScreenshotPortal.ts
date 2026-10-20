import * as THREE from "three";

import type { PortfolioProject } from "../../data/projects";
import { PROJECT_SCREENSHOT_FRAME } from "../../world/house/book/ProjectPageTexture";
import {
  PROJECT_SCREENSHOT_SHAPE,
  screenshotWheelDelta,
} from "../../world/house/book/ProjectScreenshotShape";

import "./ProjectScreenshotPortal.css";

interface UVBounds {
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
}

interface ScreenshotQuad {
  topLeft: THREE.Vector3;
  topRight: THREE.Vector3;
  bottomLeft: THREE.Vector3;
  bottomRight: THREE.Vector3;
}

export class ProjectScreenshotPortal {
  private readonly element: HTMLDivElement;
  private readonly image: HTMLImageElement;
  private readonly portalWindow: HTMLDivElement;
  private readonly hitContext = document
    .createElement("canvas")
    .getContext("2d")!;
  private readonly outline = new Path2D(PROJECT_SCREENSHOT_SHAPE);

  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();

  private readonly startPosition = new THREE.Vector3();
  private readonly startQuaternion = new THREE.Quaternion();

  private readonly endPosition = new THREE.Vector3();
  private readonly endQuaternion = new THREE.Quaternion();

  private sourceQuad: ScreenshotQuad | null = null;
  private startNear = 0;
  private currentProject: PortfolioProject | null = null;

  private active = false;
  private navigating = false;

  private progress = 0;
  private target = 0;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly canvas: HTMLCanvasElement,
  ) {
    this.element = document.createElement("div");
    this.element.className = "book-project-portal";

    this.element.innerHTML = `
      <svg
        class="book-project-portal_defs"
        width="0"
        height="0"
        aria-hidden="true"
      >
        <defs>
          <clipPath
            id="book-project-portal-clip"
            clipPathUnits="objectBoundingBox"
          >
            <path data-book-project-mask />
          </clipPath>
        </defs>
      </svg>

      <div class="book-project-portal_window">
        <img
          class="book-project-portal_image"
          alt=""
          draggable="false"
        />
      </div>

      <div class="book-project-portal_hint">
        Scroll up to enter · Scroll down to return · Esc to cancel
      </div>

      <div class="book-project-portal_progress">
        <div class="book-project-portal_progress-fill"></div>
      </div>
    `;

    document.body.appendChild(this.element);

    const path = this.element.querySelector<SVGPathElement>(
      "[data-book-project-mask]",
    );

    const image = this.element.querySelector<HTMLImageElement>(
      ".book-project-portal_image",
    );
    const portalWindow = this.element.querySelector<HTMLDivElement>(
      ".book-project-portal_window",
    );

    if (!path || !image || !portalWindow) {
      throw new Error("Project portal DOM elements missing");
    }

    this.image = image;
    this.portalWindow = portalWindow;
    path.setAttribute("d", PROJECT_SCREENSHOT_SHAPE);

    // This listener captures wheel events even after the
    // fullscreen portal visually covers the 3D canvas.
    window.addEventListener("wheel", this.onWindowWheel, {
      passive: false,
      capture: true,
    });

    // Return to the reading pose when the viewport changes.
    window.addEventListener("resize", this.onResize);
  }

  get isActive(): boolean {
    return this.active;
  }

  private getUVBounds(mesh: THREE.Mesh): UVBounds | null {
    const uv = mesh.geometry.getAttribute("uv");

    if (!uv || uv.count === 0) return null;

    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;

    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i);
      const v = uv.getY(i);

      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }

    return { minU, maxU, minV, maxV };
  }

  private getScreenshotUV(mesh: THREE.Mesh): UVBounds | null {
    const bounds = this.getUVBounds(mesh);

    if (!bounds) return null;

    const frame = PROJECT_SCREENSHOT_FRAME;

    const du = bounds.maxU - bounds.minU;
    const dv = bounds.maxV - bounds.minV;

    return {
      minU: bounds.minU + (frame.x / frame.textureWidth) * du,

      maxU: bounds.minU + ((frame.x + frame.width) / frame.textureWidth) * du,

      minV: bounds.minV + (frame.y / frame.textureHeight) * dv,

      maxV: bounds.minV + ((frame.y + frame.height) / frame.textureHeight) * dv,
    };
  }

  isPointerOverScreenshot(
    mesh: THREE.Mesh,
    clientX: number,
    clientY: number,
  ): boolean {
    if (!mesh.visible) return false;

    const bounds = this.getScreenshotUV(mesh);

    if (!bounds) return false;

    const rect = this.canvas.getBoundingClientRect();

    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );

    this.camera.updateMatrixWorld(true);

    this.raycaster.setFromCamera(this.pointer, this.camera);

    const hit = this.raycaster.intersectObject(mesh, true)[0];

    if (!hit?.uv) return false;

    return (
      hit.uv.x >= bounds.minU &&
      hit.uv.x <= bounds.maxU &&
      hit.uv.y >= bounds.minV &&
      hit.uv.y <= bounds.maxV &&
      this.hitContext.isPointInPath(
        this.outline,
        (hit.uv.x - bounds.minU) / (bounds.maxU - bounds.minU),
        (hit.uv.y - bounds.minV) / (bounds.maxV - bounds.minV),
      )
    );
  }

  private getScreenshotQuad(mesh: THREE.Mesh): ScreenshotQuad | null {
    const uv = mesh.geometry.getAttribute("uv");
    const position = mesh.geometry.getAttribute("position");
    const bounds = this.getUVBounds(mesh);
    const frame = this.getScreenshotUV(mesh);

    if (!uv || !position || !bounds || !frame) {
      return null;
    }

    // The Blender V2 screenshot page is a four-corner
    // rectangular mesh. Find its UV corner vertices.
    const findCorner = (u: number, v: number): THREE.Vector3 => {
      let closest = 0;
      let closestDistance = Infinity;

      for (let i = 0; i < uv.count; i++) {
        const du = uv.getX(i) - u;
        const dv = uv.getY(i) - v;
        const distance = du * du + dv * dv;

        if (distance < closestDistance) {
          closestDistance = distance;
          closest = i;
        }
      }

      return new THREE.Vector3().fromBufferAttribute(position, closest);
    };

    const p00 = findCorner(bounds.minU, bounds.minV);
    const p10 = findCorner(bounds.maxU, bounds.minV);
    const p01 = findCorner(bounds.minU, bounds.maxV);
    const p11 = findCorner(bounds.maxU, bounds.maxV);

    const sample = (u: number, v: number): THREE.Vector3 => {
      const uRatio =
        (u - bounds.minU) / Math.max(bounds.maxU - bounds.minU, 0.000001);

      const vRatio =
        (v - bounds.minV) / Math.max(bounds.maxV - bounds.minV, 0.000001);

      const a = p00.clone().lerp(p10, uRatio);
      const b = p01.clone().lerp(p11, uRatio);

      return a.lerp(b, vRatio).applyMatrix4(mesh.matrixWorld);
    };

    mesh.updateWorldMatrix(true, false);

    return {
      topLeft: sample(frame.minU, frame.minV),
      topRight: sample(frame.maxU, frame.minV),
      bottomLeft: sample(frame.minU, frame.maxV),
      bottomRight: sample(frame.maxU, frame.maxV),
    };
  }

  private projectCorners(quad: ScreenshotQuad): THREE.Vector2[] {
    const canvasRect = this.canvas.getBoundingClientRect();

    const corners = [
      quad.topLeft,
      quad.topRight,
      quad.bottomLeft,
      quad.bottomRight,
    ];

    const points = corners.map((corner) => {
      const ndc = corner.clone().project(this.camera);

      return new THREE.Vector2(
        canvasRect.left + (ndc.x * 0.5 + 0.5) * canvasRect.width,
        canvasRect.top + (-ndc.y * 0.5 + 0.5) * canvasRect.height,
      );
    });
    return points;
  }

  private prepareCameraTarget(quad: ScreenshotQuad): void {
    const center = new THREE.Vector3()
      .add(quad.topLeft)
      .add(quad.topRight)
      .add(quad.bottomLeft)
      .add(quad.bottomRight)
      .multiplyScalar(0.25);

    const right = quad.topRight.clone().sub(quad.topLeft);
    const down = quad.bottomLeft.clone().sub(quad.topLeft);

    // Normal of the screenshot's actual page plane.
    const normal = right.clone().cross(down).normalize();

    // Always approach from the camera-facing side.
    const towardCamera = this.camera.position.clone().sub(center);

    if (normal.dot(towardCamera) < 0) {
      normal.negate();
    }

    // Finish inside the opening: the page and its outline leave the viewport
    // through perspective as the camera approaches the actual image plane.
    const distance = Math.min(right.length(), down.length()) * 0.025;
    this.camera.near = Math.min(this.startNear, distance * 0.1);
    this.camera.updateProjectionMatrix();

    this.endPosition.copy(center).addScaledVector(normal, distance);

    const up = down.clone().normalize().negate();

    const matrix = new THREE.Matrix4().lookAt(this.endPosition, center, up);

    this.endQuaternion.setFromRotationMatrix(matrix);
  }

  start(
    project: PortfolioProject,
    mesh: THREE.Mesh,
    initialScroll = 0.04,
  ): boolean {
    if (this.active) return false;

    this.camera.updateMatrixWorld(true);

    const quad = this.getScreenshotQuad(mesh);

    if (!quad) {
      console.warn("Screenshot mesh has no usable UV geometry");
      return false;
    }

    const corners = this.projectCorners(quad);
    const width =
      Math.max(...corners.map((p) => p.x)) -
      Math.min(...corners.map((p) => p.x));
    const height =
      Math.max(...corners.map((p) => p.y)) -
      Math.min(...corners.map((p) => p.y));

    if (
      width < 3 ||
      height < 3 ||
      !Number.isFinite(width) ||
      !Number.isFinite(height)
    ) {
      console.warn("Screenshot not visible in the camera");
      return false;
    }

    this.startPosition.copy(this.camera.position);
    this.startQuaternion.copy(this.camera.quaternion);
    this.startNear = this.camera.near;

    this.prepareCameraTarget(quad);

    this.sourceQuad = quad;
    this.currentProject = project;

    this.image.src = project.screenshot;
    this.image.alt = project.title;

    this.progress = 0;
    this.target = THREE.MathUtils.clamp(initialScroll, 0.01, 1);

    this.active = true;
    this.navigating = false;

    this.element.classList.add("is-active");

    this.render();

    return true;
  }

  private onWindowWheel = (event: WheelEvent): void => {
    if (!this.active || this.navigating) return;

    event.preventDefault();
    event.stopPropagation();

    this.target = THREE.MathUtils.clamp(
      this.target + screenshotWheelDelta(event),
      0,
      1,
    );
  };

  update(delta: number): void {
    if (!this.active || this.navigating) return;

    const safeDelta = Math.min(delta, 0.05);
    const smoothing = 1 - Math.exp(-7 * safeDelta);

    this.progress += (this.target - this.progress) * smoothing;

    if (Math.abs(this.progress - this.target) < 0.0005) {
      this.progress = this.target;
    }

    this.render();

    if (this.target === 0 && this.progress <= 0.001) {
      this.cancel();
      return;
    }

    if (this.target === 1 && this.progress >= 0.995) {
      this.finish();
    }
  }

  private render(): void {
    if (!this.sourceQuad) return;

    const p = THREE.MathUtils.clamp(this.progress, 0, 1);

    const eased = p * p * (3 - 2 * p);

    // Move the REAL Three.js camera toward the page.
    this.camera.position.lerpVectors(
      this.startPosition,
      this.endPosition,
      eased,
    );

    this.camera.quaternion.slerpQuaternions(
      this.startQuaternion,
      this.endQuaternion,
      eased,
    );

    this.camera.updateMatrixWorld(true);
    this.alignImageToPage(this.projectCorners(this.sourceQuad));

    this.element.style.setProperty("--book-portal-progress", String(p));

    // Initially transparent so the rendered screenshot
    // doesn't abruptly replace the physical page.
    this.element.style.opacity = String(Math.min(1, p * 12));
  }

  private alignImageToPage(corners: THREE.Vector2[]): void {
    const [a, b, c, d] = corners;
    // Project the image rectangle onto the real page quad, including perspective.
    // Both the SVG clip and image inherit this one transform.
    const dx1 = b.x - d.x;
    const dx2 = c.x - d.x;
    const dy1 = b.y - d.y;
    const dy2 = c.y - d.y;
    const sx = a.x - b.x - c.x + d.x;
    const sy = a.y - b.y - c.y + d.y;
    const determinant = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(determinant) < 0.000001) {
      this.portalWindow.style.visibility = "hidden";
      return;
    }
    this.portalWindow.style.visibility = "";
    const g = (sx * dy2 - dx2 * sy) / determinant;
    const h = (dx1 * sy - sx * dy1) / determinant;
    const { width, height } = PROJECT_SCREENSHOT_FRAME;
    const matrix = [
      (b.x - a.x + g * b.x) / width,
      (b.y - a.y + g * b.y) / width,
      0,
      g / width,
      (c.x - a.x + h * c.x) / height,
      (c.y - a.y + h * c.y) / height,
      0,
      h / height,
      0,
      0,
      1,
      0,
      a.x,
      a.y,
      0,
      1,
    ];
    this.portalWindow.style.width = `${width}px`;
    this.portalWindow.style.height = `${height}px`;
    this.portalWindow.style.transform = `matrix3d(${matrix.join(",")})`;
  }

  private finish(): void {
    if (this.navigating || !this.currentProject) return;

    const destination = this.currentProject.projectUrl;

    let url: URL;

    try {
      url = new URL(destination, window.location.href);

      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("Unsupported URL protocol");
      }
    } catch (error) {
      console.error("Invalid project URL:", error);
      this.cancel();
      return;
    }

    this.navigating = true;

    this.progress = 1;
    this.target = 1;
    this.render();

    // Let the browser paint the fully opened portal.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.location.assign(url.href);
      });
    });
  }

  cancel(): void {
    if (!this.active) return;

    this.camera.position.copy(this.startPosition);
    this.camera.quaternion.copy(this.startQuaternion);
    this.camera.near = this.startNear;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);

    this.active = false;
    this.navigating = false;

    this.progress = 0;
    this.target = 0;

    this.sourceQuad = null;
    this.currentProject = null;

    this.element.classList.remove("is-active");
    this.element.style.opacity = "0";

    this.portalWindow.removeAttribute("style");
  }

  private onResize = (): void => {
    this.cancel();
  };

  destroy(): void {
    this.cancel();

    window.removeEventListener("wheel", this.onWindowWheel, true);

    window.removeEventListener("resize", this.onResize);

    this.element.remove();
  }
}
