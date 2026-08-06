import * as THREE from "three";
import Stats from "stats-gl";

export class Renderer {
  instance: THREE.WebGLRenderer;
  stats: Stats;

  constructor(canvas: HTMLCanvasElement) {
    this.instance = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
    });

    this.instance.setSize(window.innerWidth, window.innerHeight);

    this.instance.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.instance.shadowMap.enabled = true;

    // PERFORMANCE STATS
    this.stats = new Stats({
      trackGPU: true,
    });

    this.stats.init(this.instance);

    document.body.appendChild(this.stats.dom);
  }

  render(scene: THREE.Scene, camera: THREE.Camera) {
    this.stats.begin();

    this.instance.render(scene, camera);

    this.stats.end();
    this.stats.update();
  }

  resize() {
    this.instance.setSize(window.innerWidth, window.innerHeight);

    this.instance.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }
}
