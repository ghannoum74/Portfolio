import * as THREE from "three";
import type Stats from "stats-gl";
import { getPerformanceOptions, performanceOptions } from "./PerformanceOptions";
import { InteractionHighlight } from "./InteractionHighlight";
import { GpuTimer } from "./GpuTimer";

import type { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import type { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import type { OutlinePass } from "three/examples/jsm/postprocessing/OutlinePass.js";

export class Renderer {
  instance: THREE.WebGLRenderer;
  stats?: Stats;

  private composer?: EffectComposer;
  private renderPass?: RenderPass;
  private outlinePass?: OutlinePass;
  private hasInteractionOutline = false;
  private readonly borderHighlight = new InteractionHighlight();

  private readonly options = performanceOptions;
  private outlinedObject: THREE.Object3D | null = null;
  private perfStarted = performance.now();
  private perfFrames = 0;
  private perfRenderMs = 0;
  private perfWarmupUntil = 0;
  private pixelRatioOverride?: number;
  private statsReady?: Promise<void>;
  private outlineReady?: Promise<void>;
  private initializationError?: unknown;
  private gpuTimer?: GpuTimer;

  constructor(canvas: HTMLCanvasElement) {
    this.instance = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      stencil: true,
    });

    this.instance.setSize(window.innerWidth, window.innerHeight);

    this.instance.setPixelRatio(this.options.pixelRatio);
    this.borderHighlight.setSize(window.innerWidth, window.innerHeight, this.options.pixelRatio);

    this.instance.shadowMap.enabled = this.options.shadows;
    // Count every render pass, including OutlinePass and its final output.
    this.instance.info.autoReset = false;

    // GPU queries and graph drawing are opt-in during normal gameplay.
    if (this.options.stats) {
      this.statsReady = this.initializeStats().catch(error => { this.initializationError = error; });
    }
    if (this.options.gpuTiming) this.setGpuTimingEnabled(true);
  }

  private async initializeStats(): Promise<void> {
    const { default: Stats } = await import("stats-gl");
    this.stats = new Stats({ trackGPU: this.options.gpuStats });
    // Pass the context so stats-gl does not also wrap every render pass.
    await this.stats.init(this.instance.getContext());
    document.body.appendChild(this.stats.dom);
  }

  setupInteractionOutline(scene: THREE.Scene, camera: THREE.Camera): void {
    if (!this.options.outlines || this.options.highlightMode !== "outline") return;
    this.outlineReady ??= this.initializeOutline(scene, camera).catch(error => { this.initializationError = error; });
  }

  private async initializeOutline(scene: THREE.Scene, camera: THREE.Camera): Promise<void> {
    const [{ EffectComposer }, { RenderPass }, { OutlinePass }, { OutputPass }] = await Promise.all([
      import("three/examples/jsm/postprocessing/EffectComposer.js"),
      import("three/examples/jsm/postprocessing/RenderPass.js"),
      import("three/examples/jsm/postprocessing/OutlinePass.js"),
      import("three/examples/jsm/postprocessing/OutputPass.js"),
    ]);
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

  async ready(): Promise<void> {
    await Promise.all([this.statsReady, this.outlineReady]);
    if (this.initializationError) throw this.initializationError;
  }

  /** Prepare uploads as well as programs while the loading/transition cover is visible. */
  async prepareScene(scene: THREE.Scene, camera: THREE.Camera): Promise<void> {
    await this.ready();
    const textures = new Set<THREE.Texture>();
    const collect = (value: unknown) => {
      if (value instanceof THREE.Texture) textures.add(value);
    };
    collect(scene.background); collect(scene.environment);
    scene.traverseVisible(object => {
      const material = (object as THREE.Mesh).material;
      for (const item of Array.isArray(material) ? material : [material]) {
        if (!(item instanceof THREE.Material)) continue;
        Object.values(item).forEach(collect);
        if (item instanceof THREE.ShaderMaterial) Object.values(item.uniforms).forEach(uniform => {
          if (Array.isArray(uniform.value)) uniform.value.forEach(collect);
          else collect(uniform.value);
        });
      }
    });
    let sliceStarted = performance.now();
    for (const texture of textures) {
      this.instance.initTexture(texture);
      if (performance.now() - sliceStarted >= 6) {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        sliceStarted = performance.now();
      }
    }
    await this.instance.compileAsync(scene, camera);
  }

  /** Called only behind an opaque cover; cached rim programs survive deselection. */
  async prepareHighlights(scene: THREE.Scene, camera: THREE.Camera, targets: readonly THREE.Object3D[]): Promise<void> {
    if (!this.options.outlines || this.options.highlightMode !== "border") return;
    const previous = this.outlinedObject;
    try {
      for (const target of targets) {
        let ancestor: THREE.Object3D | null = target;
        while (ancestor && ancestor !== scene) ancestor = ancestor.parent;
        if (!ancestor) continue;
        this.setInteractionOutline(target);
        if (this.borderHighlight.active) await this.instance.compileAsync(scene, camera);
      }
    } finally {
      this.setInteractionOutline(previous);
    }
  }

  setInteractionOutline(object: THREE.Object3D | null): void {
    if (object === this.outlinedObject) return;
    this.outlinedObject = object;
    this.applyInteractionOutline();
  }

  /** Keep the current/latest target while the diagnostic comparison is disabled. */
  setBorderHighlightEnabled(enabled: boolean): void {
    if (this.options.highlightMode !== "border") return;
    this.options.outlines = enabled;
    this.applyInteractionOutline();
    this.resetPerformanceSamples();
  }

  setShadowsEnabled(enabled: boolean): void {
    this.options.shadows = enabled;
    this.instance.shadowMap.enabled = enabled;
    this.resetPerformanceSamples();
  }

  setGpuTimingEnabled(enabled: boolean): void {
    // stats-gl can own TIME_ELAPSED_EXT. Its existing opt-in remains independent.
    this.options.gpuTiming = enabled && this.options.perfDiag && !this.options.gpuStats;
    if (this.options.gpuTiming) this.gpuTimer ??= new GpuTimer(this.instance.getContext());
    this.gpuTimer?.setEnabled(this.options.gpuTiming);
    this.resetPerformanceSamples();
  }

  private applyInteractionOutline(): void {
    const object = this.options.outlines ? this.outlinedObject : null;

    if (this.options.highlightMode === "border") {
      this.borderHighlight.setTarget(object);
      this.hasInteractionOutline = this.borderHighlight.active;
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
    this.borderHighlight.update();
    this.stats?.begin();
    if (this.gpuTimer && performance.now() >= this.perfWarmupUntil) this.gpuTimer.begin();
    try {
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
    } finally {
      this.gpuTimer?.end();
    }

    this.stats?.end();
    this.stats?.update();

    if (this.options.perfDiag) {
      if (performance.now() < this.perfWarmupUntil) {
        this.perfStarted = performance.now();
        return;
      }
      this.perfFrames++;
      this.perfRenderMs += performance.now() - renderStarted;
      const now = performance.now();
      const seconds = (now - this.perfStarted) / 1000;
      if (seconds >= 3) {
        const info = this.instance.info;
        let pointLights = 0;
        scene.traverseVisible(object => { if (object instanceof THREE.PointLight) pointLights++; });
        const sample = {
          fpsApprox: Math.round(this.perfFrames / seconds),
          rendererCpuMsApprox: +(this.perfRenderMs / this.perfFrames).toFixed(2),
          drawCallsLastFrame: info.render.calls,
          trianglesLastFrame: info.render.triangles,
          gpuTextures: info.memory.textures,
          gpuGeometries: info.memory.geometries,
          highlightActive: this.hasInteractionOutline && this.options.outlines,
          highlightMode: this.options.highlightMode,
          outlineActive: this.hasInteractionOutline && this.options.outlines,
          postprocessOutlineActive: this.hasInteractionOutline && this.options.outlines && this.options.highlightMode === "outline",
          lowFx: this.options.lowFx,
          shadows: this.options.shadows,
          pixelRatio: this.instance.getPixelRatio(),
          stats: this.options.stats,
          gpuStats: this.options.gpuStats,
          gpuTiming: this.options.gpuTiming,
          ...(this.gpuTimer?.takeSample() ?? {
            gpuTimingStatus: "disabled", gpuTimingSamples: 0,
            gpuRenderMsMean: null, gpuRenderMsP50: null, gpuRenderMsP95: null,
            gpuTimingPending: 0, gpuTimingDisjointEvents: 0,
          }),
          decorativeLights: this.options.decorativeLights,
          workshopLights: this.options.workshopLights,
          beamBatching: this.options.beamBatching,
          staticBatching: this.options.staticBatching,
          staticTransforms: this.options.staticTransforms,
          stoneLod: this.options.stoneLod,
          surfaceCulling: this.options.surfaceCulling,
          activeLightsOnly: this.options.activeLightsOnly,
          pointLights,
        };
        // Keep the object for existing collectors and text for browser log bridges.
        console.info("[House perf]", sample, JSON.stringify(sample));
        this.perfFrames = 0;
        this.perfRenderMs = 0;
        this.perfStarted = now;
      }
    }
  }

  resetPerformanceSamples(): void {
    this.gpuTimer?.reset();
    this.perfStarted = performance.now();
    this.perfFrames = 0;
    this.perfRenderMs = 0;
    // Exclude the shader/resize warm-up immediately after a diagnostic switch.
    this.perfWarmupUntil = this.perfStarted + 2000;
  }

  setPixelRatio(pixelRatio: number): void {
    if (!Number.isFinite(pixelRatio) || pixelRatio <= 0) return;
    const maximum = getPerformanceOptions("", window.devicePixelRatio).pixelRatio;
    this.pixelRatioOverride = Math.min(maximum, Math.max(Math.min(0.5, maximum), pixelRatio));
    this.resize();
  }

  resize() {
    const requested = this.pixelRatioOverride ?? getPerformanceOptions(window.location.search, window.devicePixelRatio).pixelRatio;
    const pixelRatio = Math.min(requested, getPerformanceOptions("", window.devicePixelRatio).pixelRatio);

    this.instance.setSize(window.innerWidth, window.innerHeight);

    this.instance.setPixelRatio(pixelRatio);
    this.borderHighlight.setSize(window.innerWidth, window.innerHeight, pixelRatio);

    this.composer?.setSize(window.innerWidth, window.innerHeight);

    this.composer?.setPixelRatio(pixelRatio);
    this.resetPerformanceSamples();
  }
}
