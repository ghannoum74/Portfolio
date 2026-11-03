import * as THREE from "three";
import { InteractionHighlight } from "./InteractionHighlight";

function pixelRatio(): number {
  const nativeRatio = Math.max(0.5, window.devicePixelRatio || 1);
  return Math.min(
    nativeRatio,
    window.matchMedia("(pointer: coarse)").matches ? 1.5 : 2,
  );
}

export class Renderer {
  readonly instance: THREE.WebGLRenderer;
  private readonly borderHighlight = new InteractionHighlight();
  private outlinedObject: THREE.Object3D | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.instance = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      stencil: true,
    });
    this.instance.shadowMap.enabled = true;
    this.resize();
  }

  async prepareScene(scene: THREE.Scene, camera: THREE.Camera): Promise<void> {
    const textures = new Set<THREE.Texture>();
    const collect = (value: unknown) => {
      if (value instanceof THREE.Texture) textures.add(value);
    };
    collect(scene.background);
    collect(scene.environment);
    scene.traverseVisible((object) => {
      const material = (object as THREE.Mesh).material;
      for (const item of Array.isArray(material) ? material : [material]) {
        if (!(item instanceof THREE.Material)) continue;
        Object.values(item).forEach(collect);
        if (item instanceof THREE.ShaderMaterial)
          Object.values(item.uniforms).forEach((uniform) => {
            if (Array.isArray(uniform.value)) uniform.value.forEach(collect);
            else collect(uniform.value);
          });
      }
    });
    let sliceStarted = performance.now();
    for (const texture of textures) {
      this.instance.initTexture(texture);
      if (performance.now() - sliceStarted >= 6) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        sliceStarted = performance.now();
      }
    }
    await this.instance.compileAsync(scene, camera);
  }

  async prepareHighlights(
    scene: THREE.Scene,
    camera: THREE.Camera,
    targets: readonly THREE.Object3D[],
  ): Promise<void> {
    const previous = this.outlinedObject;
    try {
      for (const target of targets) {
        let ancestor: THREE.Object3D | null = target;
        while (ancestor && ancestor !== scene) ancestor = ancestor.parent;
        if (!ancestor) continue;
        this.setInteractionOutline(target);
        if (this.borderHighlight.active)
          await this.instance.compileAsync(scene, camera);
      }
    } finally {
      this.setInteractionOutline(previous);
    }
  }

  setInteractionOutline(object: THREE.Object3D | null): void {
    if (object === this.outlinedObject) return;
    this.outlinedObject = object;
    this.borderHighlight.setTarget(object);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.borderHighlight.update();
    this.instance.render(scene, camera);
  }

  resize(): void {
    const ratio = pixelRatio();
    this.instance.setSize(window.innerWidth, window.innerHeight);
    this.instance.setPixelRatio(ratio);
    this.borderHighlight.setSize(window.innerWidth, window.innerHeight, ratio);
  }
}
