import * as THREE from "three";

export class Renderer {
  instance: THREE.WebGLRenderer;

  constructor(canvas: HTMLCanvasElement) {
    this.instance = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
    });

    this.instance.setSize(window.innerWidth, window.innerHeight);

    this.instance.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.instance.shadowMap.enabled = true;
  }

  resize() {
    this.instance.setSize(window.innerWidth, window.innerHeight);

    this.instance.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }
}
