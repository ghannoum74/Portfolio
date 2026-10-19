import * as THREE from "three";
import type { PortfolioProject } from "../../../data/projects";

const WIDTH = 1024;
const HEIGHT = 1536;

/** Coordinates in the right-page canvas, measured from its top-left corner. */
export const PROJECT_SCREENSHOT_FRAME = {
  textureWidth: WIDTH,
  textureHeight: HEIGHT,
  x: 88,
  y: 435,
  width: 848,
  height: 640,
} as const;

const PALETTE = {
  page: "#f3e7c2",
  pageLight: "#fbf3dd",
  ink: "#483829",
  muted: "#856c57",
  border: "#cbb78f",
  teal: "#426d68",
  tealSoft: "#dce8df",
  gold: "#ba9460",
} as const;

export class ProjectPageTextures {
  private readonly detailsCache = new Map<string, THREE.CanvasTexture>();
  private readonly screenshotCache = new Map<string, Promise<THREE.CanvasTexture>>();

  /** Canvas rendering captures fonts at draw time. Wait for Coiny to load. */
  async ready(): Promise<void> {
    await document.fonts.load('44px "Coiny"');
  }

  private createCanvas() {
    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is unavailable");
    ctx.textBaseline = "top";
    return { canvas, ctx };
  }

  private texture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false; // GLTF's UV orientation, as used by the current book
    texture.anisotropy = 8;
    return texture;
  }

  private paper(ctx: CanvasRenderingContext2D): void {
    const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    gradient.addColorStop(0, PALETTE.pageLight);
    gradient.addColorStop(1, PALETTE.page);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.strokeStyle = PALETTE.border;
    ctx.lineWidth = 3;
    ctx.strokeRect(48, 48, WIDTH - 96, HEIGHT - 96);
  }

  private textLines(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    width: number,
    lineHeight: number,
    maxLines: number,
  ): number {
    const words = text.trim().split(/\s+/).filter(Boolean);
    let line = "";
    let lines = 0;
    for (const word of words) {
      const trial = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(trial).width > width) {
        ctx.fillText(line, x, y);
        y += lineHeight;
        lines++;
        if (lines >= maxLines) return y;
        line = word;
      } else {
        line = trial;
      }
    }
    if (line && lines < maxLines) {
      ctx.fillText(line, x, y);
      y += lineHeight;
    }
    return y;
  }

  private roundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
  ): void {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
  }

  details(project: PortfolioProject, forLeftPage = true): THREE.CanvasTexture {
    const key = `${project.id}:${forLeftPage ? "left" : "turning"}`;
    const cached = this.detailsCache.get(key);
    if (cached) return cached;

    const { canvas, ctx } = this.createCanvas();
    this.paper(ctx);

    ctx.fillStyle = PALETTE.teal;
    ctx.font = '34px "Coiny", system-ui';
    ctx.fillText("THE PROJECT ARCHIVE", 92, 112);

    ctx.fillStyle = PALETTE.muted;
    ctx.font = '25px system-ui, sans-serif';
    ctx.fillText("SELECTED WORK  /  CASE STUDY", 92, 172);

    ctx.fillStyle = PALETTE.ink;
    ctx.font = '66px "Coiny", system-ui';
    let y = this.textLines(ctx, project.title, 92, 240, 820, 82, 3);

    ctx.font = '31px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.muted;
    y = this.textLines(ctx, project.subtitle, 92, y + 20, 817, 43, 3);

    y += 40;
    ctx.fillStyle = PALETTE.gold;
    ctx.fillRect(92, y, 110, 6);
    y += 43;

    ctx.fillStyle = PALETTE.ink;
    ctx.font = '31px system-ui, sans-serif';
    y = this.textLines(ctx, project.description, 92, y, 826, 49, 7);

    y += 52;
    ctx.fillStyle = PALETTE.teal;
    ctx.font = '37px "Coiny", system-ui';
    ctx.fillText("Highlights", 92, y);
    y += 64;

    ctx.fillStyle = PALETTE.ink;
    ctx.font = '28px system-ui, sans-serif';
    for (const item of project.highlights.slice(0, 3)) {
      if (y > HEIGHT - 350) break;
      ctx.fillStyle = PALETTE.gold;
      ctx.beginPath();
      ctx.arc(108, y + 15, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.ink;
      y = this.textLines(ctx, item, 132, y, 775, 42, 2) + 21;
    }

    // Keep the technology panel anchored to the bottom for a tidy spread.
    const footerY = HEIGHT - 262;
    ctx.fillStyle = PALETTE.tealSoft;
    this.roundedRect(ctx, 84, footerY, WIDTH - 168, 164, 18);
    ctx.fill();
    ctx.fillStyle = PALETTE.teal;
    ctx.font = '32px "Coiny", system-ui';
    ctx.fillText("Made with", 110, footerY + 25);
    ctx.font = '27px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.ink;
    this.textLines(ctx, project.technologies.join("  ·  "), 110, footerY + 88, 790, 37, 2);

    const texture = this.texture(canvas);
    // Both the static left sheet and the back of the turning sheet end
    // up on the left after a 180° hinge movement. In both cases U is
    // mirrored, not rotated by 180°: flip U only, preserve V.
    texture.rotation = 0;
    texture.center.set(0, 0);
    texture.repeat.set(-1, 1);
    texture.offset.set(1, 0);
    texture.needsUpdate = true;
    this.detailsCache.set(key, texture);
    return texture;
  }

  screenshot(project: PortfolioProject): Promise<THREE.CanvasTexture> {
    const cached = this.screenshotCache.get(project.id);
    if (cached) return cached;
    const pending = this.drawScreenshot(project);
    this.screenshotCache.set(project.id, pending);
    return pending;
  }

  private drawScreenshot(project: PortfolioProject): Promise<THREE.CanvasTexture> {
    const { canvas, ctx } = this.createCanvas();
    this.paper(ctx);
    const f = PROJECT_SCREENSHOT_FRAME;

    ctx.fillStyle = PALETTE.teal;
    ctx.font = '35px "Coiny", system-ui';
    ctx.fillText("LIVE PROJECT PREVIEW", 91, 124);

    ctx.fillStyle = PALETTE.ink;
    ctx.font = '58px "Coiny", system-ui';
    this.textLines(ctx, project.title, 91, 194, 840, 72, 2);

    ctx.fillStyle = PALETTE.muted;
    ctx.font = '29px system-ui, sans-serif';
    this.textLines(ctx, project.subtitle, 91, 345, 830, 40, 2);

    // Browser preview, with a neutral title bar and recognizable URL.
    ctx.fillStyle = "#ffffff";
    this.roundedRect(ctx, f.x, f.y, f.width, f.height, 24);
    ctx.fill();
    ctx.strokeStyle = "#bbac91";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.save();
    this.roundedRect(ctx, f.x + 3, f.y + 3, f.width - 6, f.height - 6, 21);
    ctx.clip();
    ctx.fillStyle = "#f3f1ea";
    ctx.fillRect(f.x, f.y, f.width, 81);
    for (const [i, color] of ["#d7776e", "#d3aa61", "#75a48f"].entries()) {
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(f.x + 35 + i * 30, f.y + 40, 9, 0, Math.PI * 2);
      ctx.fill();
    }

    const destination = project.demoUrl || project.projectUrl;
    let displayUrl = destination;
    try {
      const url = new URL(destination, location.href);
      displayUrl = url.host + (url.pathname === "/" ? "" : url.pathname);
    } catch { /* Keep the configured label. */ }
    ctx.fillStyle = "#fff";
    this.roundedRect(ctx, f.x + 158, f.y + 17, f.width - 190, 46, 13);
    ctx.fill();
    ctx.font = '24px system-ui, sans-serif';
    ctx.fillStyle = "#756e60";
    ctx.fillText(`↗  ${displayUrl.slice(0, 41)}`, f.x + 177, f.y + 24);

    const imageY = f.y + 81;
    const imageHeight = f.height - 81;
    ctx.fillStyle = "#bfd2c6";
    ctx.fillRect(f.x, imageY, f.width, imageHeight);
    const texture = this.texture(canvas);

    const complete = () => {
      ctx.restore();
      ctx.fillStyle = PALETTE.teal;
      ctx.font = '36px "Coiny", system-ui';
      ctx.fillText("Explore this website", 92, 1170);
      ctx.font = '30px system-ui, sans-serif';
      ctx.fillStyle = PALETTE.muted;
      ctx.fillText("Click the preview to open in a new tab  ↗", 92, 1235);
      ctx.fillStyle = PALETTE.gold;
      ctx.fillRect(92, 1310, 112, 6);
      texture.needsUpdate = true;
      return texture;
    };

    return new Promise((resolve) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => {
        const scale = Math.max(f.width / image.width, imageHeight / image.height);
        const sw = f.width / scale;
        const sh = imageHeight / scale;
        ctx.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh,
          f.x, imageY, f.width, imageHeight);
        resolve(complete());
      };
      image.onerror = () => {
        ctx.fillStyle = PALETTE.teal;
        ctx.font = '46px "Coiny", system-ui';
        ctx.textAlign = "center";
        ctx.fillText("Preview coming soon", WIDTH / 2, imageY + 200);
        ctx.textAlign = "left";
        console.warn("Project screenshot unavailable:", project.screenshot);
        resolve(complete());
      };
      image.src = project.screenshot;
    });
  }

  dispose(): void {
    for (const texture of this.detailsCache.values()) texture.dispose();
    for (const promise of this.screenshotCache.values()) {
      void promise.then(texture => texture.dispose());
    }
    this.detailsCache.clear();
    this.screenshotCache.clear();
  }
}
