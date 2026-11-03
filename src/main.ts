import { Game } from "./core/Game";

import entranceHtml from "./ui/WorldEntrance/WorldEntrance.html?raw";

const worldRoot = document.getElementById("world-root");

if (!worldRoot) {
  throw new Error("Missing #world-root");
}

const template = document.createElement("template");

template.innerHTML = entranceHtml.trim();

worldRoot.replaceChildren(template.content);

const canvas = worldRoot.querySelector<HTMLCanvasElement>("#game");

if (!canvas) {
  throw new Error("WorldEntrance.html must contain #game");
}

new Game(canvas);
