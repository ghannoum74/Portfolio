import { Game } from "./core/Game";

const canvas = document.querySelector<HTMLCanvasElement>("#game");

if (!canvas) {
  throw new Error("Canvas not found");
}

new Game(canvas);
