import * as THREE from "three";
import Stats from "stats-gl";

import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { OutlinePass } from "three/examples/jsm/postprocessing/OutlinePass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

export class Renderer {
  instance: THREE.WebGLRenderer;
  stats: Stats;

  private composer?: EffectComposer;
  private renderPass?: RenderPass;
  private outlinePass?: OutlinePass;
  private hasInteractionOutline = false;

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
  setupInteractionOutline(scene: THREE.Scene, camera: THREE.Camera): void {
    this.composer = new EffectComposer(this.instance);

    this.renderPass = new RenderPass(scene, camera);

    this.outlinePass = new OutlinePass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      scene,
      camera,
    );

    // border appearance
    this.outlinePass.edgeStrength = 4;
    this.outlinePass.edgeThickness = 1.5;
    this.outlinePass.edgeGlow = 0.25;

    this.outlinePass.pulsePeriod = 0;

    this.outlinePass.visibleEdgeColor.set(0xd);

    this.outlinePass.hiddenEdgeColor.set(0x5c4534);

    this.composer.addPass(this.renderPass);

    this.composer.addPass(this.outlinePass);

    this.composer.addPass(new OutputPass());
  }

  setInteractionOutline(object: THREE.Object3D | null): void {
    if (!this.outlinePass) {
      return;
    }

    this.outlinePass.selectedObjects = object ? [object] : [];

    this.hasInteractionOutline = object !== null;
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.stats.begin();

    if (
      this.hasInteractionOutline &&
      this.composer &&
      this.renderPass &&
      this.outlinePass
    ) {
      this.renderPass.scene = scene;
      this.renderPass.camera = camera;

      this.outlinePass.renderScene = scene;

      this.outlinePass.renderCamera = camera;

      this.composer.render();
    } else {
      this.instance.render(scene, camera);
    }

    this.stats.end();
    this.stats.update();
  }

  resize() {
    const pixelRatio = Math.min(window.devicePixelRatio, 2);

    this.instance.setSize(window.innerWidth, window.innerHeight);

    this.instance.setPixelRatio(pixelRatio);

    this.composer?.setSize(window.innerWidth, window.innerHeight);

    this.composer?.setPixelRatio(pixelRatio);
  }
}
