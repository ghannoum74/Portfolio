import * as THREE from "three";
import Stats from "stats-gl";
import { getPerformanceOptions, performanceOptions } from "./PerformanceOptions";
import { InteractionHighlight } from "./InteractionHighlight";

import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { OutlinePass } from "three/examples/jsm/postprocessing/OutlinePass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

export class Renderer {
  instance: THREE.WebGLRenderer;
  stats?: Stats;

  private composer?: EffectComposer;
  private renderPass?: RenderPass;
  private outlinePass?: OutlinePass;
  private hasInteractionOutline = false;
  private readonly materialHighlight = new InteractionHighlight();

  private readonly options = performanceOptions;
  private outlinedObject: THREE.Object3D | null = null;
  private perfStarted = performance.now();
  private perfFrames = 0;
  private perfRenderMs = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.instance = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
    });

    this.instance.setSize(window.innerWidth, window.innerHeight);

    this.instance.setPixelRatio(this.options.pixelRatio);

    this.instance.shadowMap.enabled = this.options.shadows;
    // Count every render pass, including OutlinePass and its final output.
    this.instance.info.autoReset = false;

    // GPU queries and graph drawing are opt-in during normal gameplay.
    if (this.options.stats) {
      this.stats = new Stats({ trackGPU: this.options.gpuStats });
      // Pass the context so stats-gl does not also wrap every render pass.
      void this.stats.init(this.instance.getContext());
      document.body.appendChild(this.stats.dom);
    }
  }
  setupInteractionOutline(scene: THREE.Scene, camera: THREE.Camera): void {
    if (!this.options.outlines || this.options.highlightMode !== "outline") return;
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
    if (!this.options.outlines) return;
    if (object === this.outlinedObject) return;
    this.outlinedObject = object;

    if (this.options.highlightMode === "material") {
      this.materialHighlight.setTarget(object);
      this.hasInteractionOutline = this.materialHighlight.active;
      return;
    }
    if (!this.outlinePass) return;

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
    const renderStarted = this.options.perfDiag ? performance.now() : 0;
    this.instance.info.reset();
    this.materialHighlight.update();
    this.stats?.begin();

    if (
      this.options.outlines &&
      this.options.highlightMode === "outline" &&
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

    this.stats?.end();
    this.stats?.update();

    if (this.options.perfDiag) {
      this.perfFrames++;
      this.perfRenderMs += performance.now() - renderStarted;
      const now = performance.now();
      const seconds = (now - this.perfStarted) / 1000;
      if (seconds >= 3) {
        const info = this.instance.info;
        let pointLights = 0;
        scene.traverseVisible(object => { if (object instanceof THREE.PointLight) pointLights++; });
        console.info("[House perf]", {
          fpsApprox: Math.round(this.perfFrames / seconds),
          rendererCpuMsApprox: +(this.perfRenderMs / this.perfFrames).toFixed(2),
          drawCallsLastFrame: info.render.calls,
          trianglesLastFrame: info.render.triangles,
          gpuTextures: info.memory.textures,
          gpuGeometries: info.memory.geometries,
          highlightActive: this.hasInteractionOutline && this.options.outlines,
          highlightMode: this.options.highlightMode,
          outlineActive: this.hasInteractionOutline && this.options.outlines && this.options.highlightMode === "outline",
          lowFx: this.options.lowFx,
          shadows: this.options.shadows,
          pixelRatio: this.instance.getPixelRatio(),
          stats: this.options.stats,
          gpuStats: this.options.gpuStats,
          decorativeLights: this.options.decorativeLights,
          workshopLights: this.options.workshopLights,
          beamBatching: this.options.beamBatching,
          activeLightsOnly: this.options.activeLightsOnly,
          pointLights,
        });
        this.perfFrames = 0;
        this.perfRenderMs = 0;
        this.perfStarted = now;
      }
    }
  }

  resize() {
    const pixelRatio = getPerformanceOptions(window.location.search, window.devicePixelRatio).pixelRatio;

    this.instance.setSize(window.innerWidth, window.innerHeight);

    this.instance.setPixelRatio(pixelRatio);

    this.composer?.setSize(window.innerWidth, window.innerHeight);

    this.composer?.setPixelRatio(pixelRatio);
  }
}
