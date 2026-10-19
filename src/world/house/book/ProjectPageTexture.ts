import * as THREE from "three";
import type { PortfolioProject } from "../../../data/projects";
import { PROJECT_SCREENSHOT_SHAPE } from "./ProjectScreenshotShape";

export const PROJECT_SCREENSHOT_FRAME = {
  textureWidth: 1024,
  textureHeight: 1536,
  x: 94,
  y: 420,
  width: 836,
  height: 650,
} as const;

const WIDTH = 1024;
const HEIGHT = 1536;
const MARGIN = 94;

export class ProjectPageTextures {
  private readonly detailsCache = new Map<string, THREE.CanvasTexture>();

  private readonly screenshotCache = new Map<
    string,
    Promise<THREE.CanvasTexture>
  >();

  private createCanvas(): {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
  } {
    const canvas = document.createElement("canvas");

    canvas.width = WIDTH;
    canvas.height = HEIGHT;

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("Canvas 2D is unavailable");
    }

    return { canvas, ctx };
  }

  private createTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
    const texture = new THREE.CanvasTexture(canvas);

    texture.colorSpace = THREE.SRGBColorSpace;

    // GLB meshes use glTF UV coordinates.
    texture.flipY = false;

    texture.anisotropy = 8;
    texture.needsUpdate = true;

    return texture;
  }

  private background(ctx: CanvasRenderingContext2D): void {
    const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);

    gradient.addColorStop(0, "#f3e9d5");
    gradient.addColorStop(0.5, "#e8d9bc");
    gradient.addColorStop(1, "#d7bf96");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.strokeStyle = "#b39870";
    ctx.lineWidth = 7;
    ctx.strokeRect(45, 45, WIDTH - 90, HEIGHT - 90);

    ctx.strokeStyle = "#c6ae86";
    ctx.lineWidth = 2;
    ctx.strokeRect(61, 61, WIDTH - 122, HEIGHT - 122);
  }

  private wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    startY: number,
    maxWidth: number,
    lineHeight: number,
    maxLines: number,
  ): number {
    const words = text.split(/\s+/);
    let line = "";
    let y = startY;
    let lines = 0;

    for (const word of words) {
      const test = line ? `${line} ${word}` : word;

      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, y);
        y += lineHeight;
        lines++;

        if (lines >= maxLines) return y;

        line = word;
      } else {
        line = test;
      }
    }

    if (line && lines < maxLines) {
      ctx.fillText(line, x, y);
      y += lineHeight;
    }

    return y;
  }

  details(project: PortfolioProject): THREE.CanvasTexture {
    const cached = this.detailsCache.get(project.id);

    if (cached) return cached;

    const { canvas, ctx } = this.createCanvas();

    this.background(ctx);

    ctx.textBaseline = "top";

    ctx.fillStyle = "#9b754b";
    ctx.font = "bold 25px Georgia";

    ctx.fillText("THE ARCHIVE OF CREATIONS", MARGIN, 115);

    ctx.fillStyle = "#493628";
    ctx.font = "bold 67px Georgia";

    let y = this.wrapText(
      ctx,
      project.title,
      MARGIN,
      180,
      WIDTH - MARGIN * 2,
      82,
      3,
    );

    ctx.fillStyle = "#956c51";
    ctx.font = "italic 34px Georgia";

    y = this.wrapText(
      ctx,
      project.subtitle,
      MARGIN,
      y + 14,
      WIDTH - MARGIN * 2,
      47,
      2,
    );

    y += 36;

    ctx.strokeStyle = "#a58b66";
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.moveTo(MARGIN, y);
    ctx.lineTo(WIDTH - MARGIN, y);
    ctx.stroke();

    y += 38;

    ctx.fillStyle = "#493c31";
    ctx.font = "31px Georgia";

    y = this.wrapText(
      ctx,
      project.description,
      MARGIN,
      y,
      WIDTH - MARGIN * 2,
      47,
      7,
    );

    y += 39;

    ctx.fillStyle = "#865f42";
    ctx.font = "bold 35px Georgia";
    ctx.fillText("Highlights", MARGIN, y);

    y += 57;

    ctx.fillStyle = "#4f4035";
    ctx.font = "28px Georgia";

    for (const highlight of project.highlights.slice(0, 4)) {
      if (y > HEIGHT - 340) break;

      ctx.fillStyle = "#ad8956";
      ctx.fillText("✦", MARGIN, y);

      ctx.fillStyle = "#4f4035";

      y = this.wrapText(
        ctx,
        highlight,
        MARGIN + 49,
        y,
        WIDTH - MARGIN * 2 - 49,
        41,
        2,
      );

      y += 20;
    }

    const techY = Math.max(y + 24, HEIGHT - 270);

    ctx.fillStyle = "#865f42";
    ctx.font = "bold 32px Georgia";
    ctx.fillText("Crafted with", MARGIN, techY);

    ctx.font = "25px Georgia";
    ctx.fillStyle = "#5c5144";

    this.wrapText(
      ctx,
      project.technologies.join("  ·  "),
      MARGIN,
      techY + 53,
      WIDTH - MARGIN * 2,
      37,
      3,
    );

    const texture = this.createTexture(canvas);

    this.detailsCache.set(project.id, texture);

    return texture;
  }

  screenshot(project: PortfolioProject): Promise<THREE.CanvasTexture> {
    const cached = this.screenshotCache.get(project.id);

    if (cached) return cached;

    const promise = this.loadScreenshot(project);

    this.screenshotCache.set(project.id, promise);

    return promise;
  }

  private loadScreenshot(
    project: PortfolioProject,
  ): Promise<THREE.CanvasTexture> {
    const { canvas, ctx } = this.createCanvas();

    this.background(ctx);

    ctx.textBaseline = "top";
    ctx.fillStyle = "#574133";
    ctx.font = "bold 55px Georgia";

    this.wrapText(ctx, project.title, MARGIN, 145, WIDTH - MARGIN * 2, 66, 2);

    ctx.fillStyle = "#987b55";
    ctx.font = "italic 30px Georgia";
    ctx.fillText("A window into another world", MARGIN, 300);

    const {
      x: frameX,
      y: frameY,
      width: frameW,
      height: frameH,
    } = PROJECT_SCREENSHOT_FRAME;

    const opening = new Path2D(PROJECT_SCREENSHOT_SHAPE);
    const frameTransform = new DOMMatrix()
      .translate(frameX, frameY)
      .scale(frameW, frameH);
    const frame = new Path2D();
    frame.addPath(opening, frameTransform);

    ctx.fillStyle = "#769e9c";
    ctx.fill(frame);
    ctx.strokeStyle = "#b69768";
    ctx.lineWidth = 12;
    ctx.stroke(frame);

    ctx.fillStyle = "#6e5039";
    ctx.font = "italic 30px Georgia";
    ctx.fillText("Scroll up to enter this creation", MARGIN, 1150);

    const texture = this.createTexture(canvas);

    const promise = new Promise<THREE.CanvasTexture>((resolve) => {
      const image = new Image();

      image.crossOrigin = "anonymous";

      image.onload = () => {
        const scale = Math.max(frameW / image.width, frameH / image.height);

        const sourceW = frameW / scale;
        const sourceH = frameH / scale;

        const sourceX = (image.width - sourceW) / 2;
        const sourceY = (image.height - sourceH) / 2;

        ctx.save();
        ctx.clip(frame);
        ctx.drawImage(
          image,
          sourceX,
          sourceY,
          sourceW,
          sourceH,
          frameX,
          frameY,
          frameW,
          frameH,
        );
        ctx.restore();

        texture.needsUpdate = true;
        resolve(texture);
      };

      image.onerror = () => {
        ctx.fillStyle = "#f4e8d0";
        ctx.font = "bold 36px Georgia";
        ctx.textAlign = "center";

        ctx.fillText("Screenshot coming soon", WIDTH / 2, frameY + frameH / 2);

        ctx.textAlign = "left";
        texture.needsUpdate = true;

        console.warn("Screenshot not found:", project.screenshot);

        resolve(texture);
      };

      image.src = project.screenshot;
    });

    return promise;
  }

  dispose(): void {
    for (const texture of this.detailsCache.values()) {
      texture.dispose();
    }

    this.detailsCache.clear();

    for (const promise of this.screenshotCache.values()) {
      void promise.then((texture) => texture.dispose());
    }

    this.screenshotCache.clear();
  }
}
