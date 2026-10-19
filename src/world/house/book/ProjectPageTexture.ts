import * as THREE from "three";
import { PROJECTS, type PortfolioProject } from "../../../data/projects";

/**
 * Visual-only redesign of the real book's two CanvasTextures.
 * AnimatedBook3D's public API and UV conventions remain unchanged.
 */
const WIDTH = 1024;
const HEIGHT = 1536;
const EDGE = 88;

/**
 * The preview component imports this exact rectangle for its raycast hit area.
 * Keep these values in sync with the frame drawn in drawScreenshot().
 */
export const PROJECT_SCREENSHOT_FRAME = {
  textureWidth: WIDTH,
  textureHeight: HEIGHT,
  x: 76,
  y: 465,
  width: 872,
  height: 756,
} as const;

const COLOR = {
  paper: "#f4e8c8",
  light: "#fff5dc",
  ink: "#483525",
  muted: "#8b7259",
  hairline: "#ccb895",
  accent: "#3f716b",
  accentLight: "#d8e6da",
  gold: "#b99761",
  white: "#fffaf0",
} as const;

export class ProjectPageTextures {
  private readonly detailsCache = new Map<string, THREE.CanvasTexture>();
  private readonly screenshotCache = new Map<string, Promise<THREE.CanvasTexture>>();

  async ready(): Promise<void> {
    // Coiny is already loaded by index.html; canvas needs the font ready
    // BEFORE the text is painted into the GPU texture.
    await document.fonts.load('84px "Coiny"');
  }

  private canvas(): {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
  } {
    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is not supported");
    ctx.textBaseline = "top";
    return { canvas, ctx };
  }

  private asTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false; // Do not change: matches Blender's exported page UVs.
    texture.anisotropy = 8;
    return texture;
  }

  private paper(ctx: CanvasRenderingContext2D): void {
    // Soft paper color with a hint of depth at the binding edge.
    const ground = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    ground.addColorStop(0, COLOR.light);
    ground.addColorStop(0.55, COLOR.paper);
    ground.addColorStop(1, "#e9d9b6");
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const binding = ctx.createLinearGradient(0, 0, 130, 0);
    binding.addColorStop(0, "rgba(98,65,38,.11)");
    binding.addColorStop(1, "rgba(98,65,38,0)");
    ctx.fillStyle = binding;
    ctx.fillRect(0, 0, 130, HEIGHT);

    // Folio marks, not a heavy frame around every element.
    ctx.strokeStyle = COLOR.hairline;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(EDGE, 181);
    ctx.lineTo(WIDTH - EDGE, 181);
    ctx.moveTo(EDGE, HEIGHT - 103);
    ctx.lineTo(WIDTH - EDGE, HEIGHT - 103);
    ctx.stroke();
  }

  private label(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    color: string = COLOR.accent,
  ): void {
    ctx.fillStyle = color;
    ctx.font = '25px "Coiny", system-ui';
    ctx.fillText(text, x, y);
  }

  private rule(
    ctx: CanvasRenderingContext2D,
    y: number,
    x = EDGE,
    width = WIDTH - EDGE * 2,
  ): void {
    ctx.strokeStyle = COLOR.hairline;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + width, y);
    ctx.stroke();
  }

  private ellipsis(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
  ): string {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let end = text.length;
    while (end > 0 && ctx.measureText(text.slice(0, end) + "…").width > maxWidth) {
      end--;
    }
    return text.slice(0, end).trimEnd() + "…";
  }

  /** Word wrap without overflowing the physical page. Returns next baseline. */
  private wrap(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    top: number,
    maxWidth: number,
    lineHeight: number,
    maxLines: number,
  ): number {
    const words = text.trim().split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = "";

    for (const word of words) {
      const attempt = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(attempt).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = attempt;
      }
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      lines.length = maxLines;
      lines[maxLines - 1] = this.ellipsis(ctx, lines[maxLines - 1] + "…", maxWidth);
    }

    lines.forEach((value, i) => {
      ctx.fillText(this.ellipsis(ctx, value, maxWidth), x, top + i * lineHeight);
    });
    return top + lines.length * lineHeight;
  }

  private projectNumber(project: PortfolioProject): string {
    const index = PROJECTS.findIndex((item) => item.id === project.id);
    return String(Math.max(0, index) + 1).padStart(2, "0");
  }

  private numberFooter(
    ctx: CanvasRenderingContext2D,
    number: string,
    side: "left" | "right",
  ): void {
    ctx.font = '23px "Coiny", system-ui';
    ctx.fillStyle = COLOR.muted;
    ctx.fillText("GHANNOUM  /  SELECTED WORK", EDGE, HEIGHT - 75);
    ctx.textAlign = "right";
    ctx.fillText(`${number}  /  ${side === "left" ? "STORY" : "LIVE"}`, WIDTH - EDGE, HEIGHT - 75);
    ctx.textAlign = "left";
  }

  details(project: PortfolioProject, forLeftPage = true): THREE.CanvasTexture {
    const key = `${project.id}:${forLeftPage ? "left" : "turning"}`;
    const cached = this.detailsCache.get(key);
    if (cached) return cached;

    const { canvas, ctx } = this.canvas();
    this.paper(ctx);
    const number = this.projectNumber(project);

    // Top folio line.
    this.label(ctx, "FIELD NOTES  /  PROJECTS", EDGE, 112);
    ctx.textAlign = "right";
    this.label(ctx, `NO. ${number}`, WIDTH - EDGE, 112, COLOR.muted);
    ctx.textAlign = "left";

    // Title is the hero. Minimal decorative UI around it.
    ctx.fillStyle = COLOR.ink;
    ctx.font = '82px "Coiny", system-ui';
    const titleEnd = this.wrap(ctx, project.title, EDGE, 238, 830, 95, 3);

    ctx.font = '31px system-ui, sans-serif';
    ctx.fillStyle = COLOR.muted;
    this.wrap(ctx, project.subtitle, EDGE + 3, Math.min(titleEnd + 24, 530), 816, 43, 2);

    // One strong editorial divider instead of multiple colored cards.
    ctx.fillStyle = COLOR.accent;
    ctx.fillRect(EDGE, 644, 90, 7);
    this.label(ctx, "THE IDEA", EDGE, 708);

    ctx.fillStyle = COLOR.ink;
    ctx.font = '34px system-ui, sans-serif';
    this.wrap(ctx, project.description, EDGE, 766, 823, 52, 4);

    this.rule(ctx, 1000);
    this.label(ctx, "WHAT WENT INTO IT", EDGE, 1026);

    const featureY = [1091, 1164, 1237];
    ctx.font = '28px system-ui, sans-serif';
    project.highlights.slice(0, 3).forEach((item, index) => {
      ctx.fillStyle = COLOR.gold;
      ctx.font = '25px "Coiny", system-ui';
      ctx.fillText(String(index + 1).padStart(2, "0"), EDGE, featureY[index]);
      ctx.fillStyle = COLOR.ink;
      ctx.font = '28px system-ui, sans-serif';
      ctx.fillText(this.ellipsis(ctx, item, 746), EDGE + 72, featureY[index]);
    });

    this.label(ctx, "TOOLS", EDGE, 1319);
    let chipX = EDGE + 115;
    let chipY = 1307;
    let visible = 0;
    for (const tech of project.technologies) {
      if (visible >= 7) break;
      ctx.font = '24px system-ui, sans-serif';
      const chipWidth = Math.min(ctx.measureText(tech).width + 36, 310);
      if (chipX + chipWidth > WIDTH - EDGE) {
        chipX = EDGE + 115;
        chipY += 52;
      }
      if (chipY > 1375) break;
      ctx.fillStyle = COLOR.accentLight;
      ctx.beginPath();
      ctx.roundRect(chipX, chipY, chipWidth, 42, 21);
      ctx.fill();
      ctx.fillStyle = COLOR.accent;
      ctx.fillText(this.ellipsis(ctx, tech, chipWidth - 34), chipX + 18, chipY + 8);
      chipX += chipWidth + 11;
      visible++;
    }

    this.numberFooter(ctx, number, "left");
    const texture = this.asTexture(canvas);

    // CRITICAL: keep the proven Blender left-page correction on BOTH
    // the resting page and the back of the page-turn animation.
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
    const loading = this.drawScreenshot(project);
    this.screenshotCache.set(project.id, loading);
    return loading;
  }

  private destinationLabel(project: PortfolioProject): string {
    const destination = project.demoUrl || project.projectUrl;
    try {
      const url = new URL(destination, window.location.href);
      return url.host + (url.pathname === "/" ? "" : url.pathname);
    } catch {
      return destination;
    }
  }

  private drawScreenshot(project: PortfolioProject): Promise<THREE.CanvasTexture> {
    const { canvas, ctx } = this.canvas();
    const number = this.projectNumber(project);
    const f = PROJECT_SCREENSHOT_FRAME;
    const toolbarHeight = 75;
    const contentY = f.y + toolbarHeight;
    const contentHeight = f.height - toolbarHeight;

    this.paper(ctx);
    this.label(ctx, "ON THE WEB  /  LIVE PREVIEW", EDGE, 112);
    ctx.textAlign = "right";
    this.label(ctx, `NO. ${number}`, WIDTH - EDGE, 112, COLOR.muted);
    ctx.textAlign = "left";

    ctx.fillStyle = COLOR.ink;
    ctx.font = '70px "Coiny", system-ui';
    this.wrap(ctx, project.title, EDGE, 245, 830, 80, 2);

    const site = this.destinationLabel(project);
    ctx.fillStyle = COLOR.muted;
    ctx.font = '29px system-ui, sans-serif';
    ctx.fillText(this.ellipsis(ctx, site, 824), EDGE, 415);

    // An intentional little browser object printed on physical paper.
    ctx.save();
    ctx.shadowColor = "rgba(65,43,26,.16)";
    ctx.shadowBlur = 27;
    ctx.shadowOffsetY = 16;
    ctx.fillStyle = COLOR.white;
    ctx.beginPath();
    ctx.roundRect(f.x, f.y, f.width, f.height, 22);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(f.x + 2, f.y + 2, f.width - 4, f.height - 4, 20);
    ctx.clip();

    // Minimal browser chrome. No fake traffic-light controls or huge CTA card.
    ctx.fillStyle = "#fff9eb";
    ctx.fillRect(f.x, f.y, f.width, toolbarHeight);
    ctx.fillStyle = COLOR.accent;
    ctx.beginPath();
    ctx.arc(f.x + 43, f.y + 38, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '25px system-ui, sans-serif';
    ctx.fillStyle = COLOR.ink;
    ctx.fillText(this.ellipsis(ctx, site, f.width - 160), f.x + 70, f.y + 22);
    ctx.textAlign = "right";
    ctx.font = '28px system-ui, sans-serif';
    ctx.fillText("↗", f.x + f.width - 30, f.y + 20);
    ctx.textAlign = "left";

    // Deliberate fallback if the screenshot asset is missing.
    ctx.fillStyle = COLOR.accentLight;
    ctx.fillRect(f.x, contentY, f.width, contentHeight);
    ctx.fillStyle = COLOR.accent;
    ctx.font = '60px "Coiny", system-ui';
    ctx.textAlign = "center";
    ctx.fillText(project.title.slice(0, 22), WIDTH / 2, contentY + 250);
    ctx.textAlign = "left";

    const texture = this.asTexture(canvas);

    const finish = (): THREE.CanvasTexture => {
      ctx.restore();
      ctx.strokeStyle = COLOR.hairline;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(f.x, f.y, f.width, f.height, 22);
      ctx.stroke();

      this.label(ctx, "EXPLORE THE LIVE SITE", EDGE, 1284);
      ctx.fillStyle = COLOR.ink;
      ctx.font = '47px "Coiny", system-ui';
      ctx.fillText("A project you can visit.", EDGE, 1345);

      ctx.beginPath();
      ctx.arc(WIDTH - EDGE - 33, 1367, 39, 0, Math.PI * 2);
      ctx.fillStyle = COLOR.accent;
      ctx.fill();
      ctx.textAlign = "center";
      ctx.fillStyle = COLOR.white;
      ctx.font = '43px system-ui, sans-serif';
      ctx.fillText("↗", WIDTH - EDGE - 33, 1338);
      ctx.textAlign = "left";

      this.numberFooter(ctx, number, "right");
      texture.needsUpdate = true;
      return texture;
    };

    return new Promise((resolve) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => {
        // Show the TOP of a web page, not a crop from its middle.
        const sourceScale = Math.max(f.width / image.width, contentHeight / image.height);
        const cropWidth = f.width / sourceScale;
        const cropHeight = contentHeight / sourceScale;
        const cropX = (image.width - cropWidth) * 0.5;
        ctx.drawImage(
          image,
          cropX, 0, cropWidth, cropHeight,
          f.x, contentY, f.width, contentHeight,
        );
        resolve(finish());
      };
      image.onerror = () => {
        console.warn("Website screenshot could not be loaded:", project.screenshot);
        resolve(finish());
      };
      image.src = project.screenshot;
    });
  }

  dispose(): void {
    for (const texture of this.detailsCache.values()) texture.dispose();
    for (const pending of this.screenshotCache.values()) {
      void pending.then((texture) => texture.dispose());
    }
    this.detailsCache.clear();
    this.screenshotCache.clear();
  }
}
