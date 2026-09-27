import { Game } from "./core/Game";

import entranceHtml from "./ui/WorldEntrance/WorldEntrance.html?raw";

// 1. Locate the application's world mounting point.
const worldRoot = document.getElementById("world-root");

if (!worldRoot) {
  throw new Error("Missing #world-root");
}

// 2. Parse our trusted, static HTML template.
const template = document.createElement("template");

template.innerHTML = entranceHtml.trim();

// 3. Mount the entrance exactly once.
worldRoot.replaceChildren(template.content);

// 4. The canvas now exists in the document.
const canvas = worldRoot.querySelector<HTMLCanvasElement>("#game");

if (!canvas) {
  throw new Error("WorldEntrance.html must contain #game");
}

// 5. Create the existing game.
new Game(canvas);
