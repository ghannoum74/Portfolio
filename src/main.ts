import { LoadingScreen } from "./ui/LoadingScreen/LoadingScreen";

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

const loadingScreen = new LoadingScreen();

void import("./core/Game")
  .then(({ Game }) => new Game(canvas, loadingScreen))
  .catch((error) => {
    console.error("World startup failed:", error);
    loadingScreen.showError();
  });
