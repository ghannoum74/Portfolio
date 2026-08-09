import * as THREE from "three";

export class GameLoadingManager {
  instance: THREE.LoadingManager;

  constructor() {
    this.instance = new THREE.LoadingManager();

    this.instance.onStart = (url, itemsLoaded, itemsTotal) => {
      // console.log(`Started loading: ${url}`);
      // console.log(`${itemsLoaded}/${itemsTotal}`);
    };

    this.instance.onProgress = (url, itemsLoaded, itemsTotal) => {
      const progress = (itemsLoaded / itemsTotal) * 100;

      // console.log(`Loading: ${progress.toFixed(0)}%`);
    };

    this.instance.onLoad = () => {
      // console.log("All assets loaded");
    };

    this.instance.onError = (url) => {
      console.error(`Failed to load: ${url}`);
    };
  }
}
