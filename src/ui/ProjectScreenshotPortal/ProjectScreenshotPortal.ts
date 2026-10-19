import * as THREE from "three";

import type { PortfolioProject } from "../../data/projects";
import { OrganicPortalMask } from "../WorldEntrance/OrganicPortalMask";
import { PROJECT_SCREENSHOT_FRAME } from "../../world/house/book/ProjectPageTexture";

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
  private readonly mask: OrganicPortalMask;

  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();

  private readonly startPosition = new THREE.Vector3();
  private readonly startQuaternion = new THREE.Quaternion();

  private readonly endPosition = new THREE.Vector3();
  private readonly endQuaternion = new THREE.Quaternion();

  private sourceRect: DOMRect | null = null;
  private currentProject: PortfolioProject | null = null;

  private active = false;
  private navigating = false;

  private progress = 0;
  private target = 0;

  private readonly scrollSensitivity = 0.0007;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly canvas: HTMLCanvasElement,
  ) {
    this.element = document.createElement("div");
    this.element.className = "book-project-portal";

    this.element.innerHTML = `
      <svg
        class="book-project-portal__defs"
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

      <div class="book-project-portal__window">
        <img
          class="book-project-portal__image"
          alt=""
          draggable="false"
        />
      </div>

      <div class="book-project-portal__hint">
        Scroll to enter · Scroll up to return · Esc to cancel
      </div>

      <div class="book-project-portal__progress">
        <div class="book-project-portal__progress-fill"></div>
      </div>
    `;

    document.body.appendChild(this.element);

    const path = this.element.querySelector<SVGPathElement>(
      "[data-book-project-mask]",
    );

    const image = this.element.querySelector<HTMLImageElement>(
      ".book-project-portal__image",
    );

    if (!path || !image) {
      throw new Error("Project portal DOM elements missing");
    }

    this.image = image;
    this.mask = new OrganicPortalMask(path);

    // This listener captures wheel events even after the
    // fullscreen portal visually covers the 3D canvas.
    window.addEventListener("wheel", this.onWindowWheel, {
      passive: false,
      capture: true,
    });

    // Cancel instead of stretching a previously measured
    // screenshot rectangle across a new viewport size.
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
      hit.uv.y <= bounds.maxV
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

  private projectRect(quad: ScreenshotQuad): DOMRect {
    const canvasRect = this.canvas.getBoundingClientRect();

    const corners = [
      quad.topLeft,
      quad.topRight,
      quad.bottomLeft,
      quad.bottomRight,
    ];

    const points = corners.map((corner) => {
      const ndc = corner.clone().project(this.camera);

      return {
        x: canvasRect.left + (ndc.x * 0.5 + 0.5) * canvasRect.width,

        y: canvasRect.top + (-ndc.y * 0.5 + 0.5) * canvasRect.height,
      };
    });

    const left = Math.min(...points.map((p) => p.x));
    const right = Math.max(...points.map((p) => p.x));

    const top = Math.min(...points.map((p) => p.y));
    const bottom = Math.max(...points.map((p) => p.y));

    return new DOMRect(left, top, right - left, bottom - top);
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

    const distance = Math.max(
      right.length() * 0.55,
      down.length() * 0.55,
      this.camera.near + 0.12,
    );

    this.endPosition.copy(center).addScaledVector(normal, distance);

    // Preserve the reading camera's screen-up direction.
    const up = new THREE.Vector3(0, 1, 0)
      .applyQuaternion(this.startQuaternion)
      .normalize();

    if (Math.abs(up.dot(normal)) > 0.98) {
      up.set(0, 0, -1);
    }

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

    const rect = this.projectRect(quad);

    if (
      rect.width < 3 ||
      rect.height < 3 ||
      !Number.isFinite(rect.width) ||
      !Number.isFinite(rect.height)
    ) {
      console.warn("Screenshot not visible in the camera");
      return false;
    }

    this.startPosition.copy(this.camera.position);
    this.startQuaternion.copy(this.camera.quaternion);

    this.prepareCameraTarget(quad);

    this.sourceRect = rect;
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
      this.target + event.deltaY * this.scrollSensitivity,
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
    if (!this.sourceRect) return;

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

    // Simultaneously expand the image overlay.
    const rect = this.sourceRect;

    const left = THREE.MathUtils.lerp(rect.left, 0, eased);

    const top = THREE.MathUtils.lerp(rect.top, 0, eased);

    const width = THREE.MathUtils.lerp(rect.width, window.innerWidth, eased);

    const height = THREE.MathUtils.lerp(rect.height, window.innerHeight, eased);

    Object.assign(this.image.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
    });

    // Use the SAME SVG morph as the world entrance.
    this.mask.setProgress(p, rect);

    this.element.style.setProperty("--book-portal-progress", String(p));

    // Initially transparent so the rendered screenshot
    // doesn't abruptly replace the physical page.
    this.element.style.opacity = String(Math.min(1, p * 35));
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

    this.active = false;
    this.navigating = false;

    this.progress = 0;
    this.target = 0;

    this.sourceRect = null;
    this.currentProject = null;

    this.element.classList.remove("is-active");
    this.element.style.opacity = "0";

    this.image.removeAttribute("style");
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
