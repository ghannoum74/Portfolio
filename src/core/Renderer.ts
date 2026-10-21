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

  // HOUSE_PERFORMANCE_V1: append ?lowfx=1 for a temporary A/B GPU test.
  // The normal render quality is unchanged unless that query param is present.
  private readonly lowFx = new URLSearchParams(window.location.search).has("lowfx");
  // Append ?perfdiag=1 and inspect the browser console every ~3 seconds.
  private readonly perfDiag = new URLSearchParams(window.location.search).has("perfdiag");
  private perfStarted = performance.now();
  private perfFrames = 0;
  private perfRenderMs = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.instance = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
    });

    this.instance.setSize(window.innerWidth, window.innerHeight);

    this.instance.setPixelRatio(this.lowFx ? 1 : Math.min(window.devicePixelRatio, 2));

    this.instance.shadowMap.enabled = !this.lowFx;

    // PERFORMANCE STATS
    this.stats = new Stats({
      trackGPU: !this.lowFx,
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

    this.outlinePass.visibleEdgeColor.set(0xf3e7c2);

    this.outlinePass.hiddenEdgeColor.set(0x5c4534);

    this.composer.addPass(this.renderPass);

    this.composer.addPass(this.outlinePass);

    this.composer.addPass(new OutputPass());
  }

  setInteractionOutline(object: THREE.Object3D | null): void {
    if (!this.outlinePass) {
      console.error("OutlinePass not initialized");
      return;
    }

    const meshes: THREE.Object3D[] = [];

    object?.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        meshes.push(child);
      }
    });

    this.outlinePass.selectedObjects = meshes;
    this.hasInteractionOutline = meshes.length > 0;

  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    const renderStarted = this.perfDiag ? performance.now() : 0;
    this.stats.begin();

    if (
      !this.lowFx &&
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

    if (this.perfDiag) {
      this.perfFrames++;
      this.perfRenderMs += performance.now() - renderStarted;
      const now = performance.now();
      const seconds = (now - this.perfStarted) / 1000;
      if (seconds >= 3) {
        const info = this.instance.info;
        console.info("[House perf]", {
          fpsApprox: Math.round(this.perfFrames / seconds),
          rendererCpuMsApprox: +(this.perfRenderMs / this.perfFrames).toFixed(2),
          drawCallsLastFrame: info.render.calls,
          trianglesLastFrame: info.render.triangles,
          gpuTextures: info.memory.textures,
          gpuGeometries: info.memory.geometries,
          outlineActive: this.hasInteractionOutline && !this.lowFx,
          lowFx: this.lowFx,
        });
        this.perfFrames = 0;
        this.perfRenderMs = 0;
        this.perfStarted = now;
      }
    }
  }

  resize() {
    const pixelRatio = this.lowFx ? 1 : Math.min(window.devicePixelRatio, 2);

    this.instance.setSize(window.innerWidth, window.innerHeight);

    this.instance.setPixelRatio(pixelRatio);

    this.composer?.setSize(window.innerWidth, window.innerHeight);

    this.composer?.setPixelRatio(pixelRatio);
  }
}
