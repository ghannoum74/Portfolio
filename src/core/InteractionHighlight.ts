import * as THREE from "three";

type SurfaceMaterial = THREE.Material & {
  map?: THREE.Texture | null;
  alphaMap?: THREE.Texture | null;
};
type Replacement = {
  mesh: THREE.Mesh;
  original: THREE.Material | THREE.Material[];
  masked: THREE.Material | THREE.Material[];
  proxies: THREE.Mesh[];
  matrixVersion: number;
  instanceCount: number;
  morphWeights: number[];
};

const DIRECTIONS = 8;
const OFFSETS = [[1, 0], [-1, 0], [0, 1], [0, -1],
  [Math.SQRT1_2, Math.SQRT1_2], [-Math.SQRT1_2, Math.SQRT1_2],
  [Math.SQRT1_2, -Math.SQRT1_2], [-Math.SQRT1_2, -Math.SQRT1_2]];

/** A two-CSS-pixel silhouette border, without scene copies or blur targets. */
export class InteractionHighlight {
  private target: THREE.Object3D | null = null;
  private readonly root = new THREE.Group();
  private readonly replacements: Replacement[] = [];
  private readonly masks = new Map<THREE.Material, { material: THREE.Material; version: number }>();
  private readonly rims = new Map<THREE.MeshBasicMaterial, SurfaceMaterial>();
  private readonly viewport = { value: new THREE.Vector2(1, 1) };
  private readonly width = { value: 2 };
  private readonly matrix = new THREE.Matrix4();

  constructor() {
    this.root.name = "INTERACTION_BORDER";
    // Keep the rim after normal opaque and transparent surfaces.
    this.root.renderOrder = Number.MAX_SAFE_INTEGER;
  }

  get active(): boolean {
    return this.replacements.length > 0;
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    this.viewport.value.set(Math.max(1, width * pixelRatio), Math.max(1, height * pixelRatio));
    this.width.value = 2 * pixelRatio;
  }

  setTarget(target: THREE.Object3D | null): void {
    if (target === this.target) return;
    this.clear();
    this.target = target;
    target?.traverseVisible(object => {
      if (!(object instanceof THREE.Mesh) || (object as THREE.BatchedMesh).isBatchedMesh ||
          (object instanceof THREE.InstancedMesh && object.morphTexture)) return;
      const original = object.material;
      const sources = Array.isArray(original) ? original : [original];
      const masks = sources.map(source => this.maskMaterial(source));
      if (masks.every((material, index) => material === sources[index])) return;
      const masked = Array.isArray(original) ? masks : masks[0];
      const proxies: THREE.Mesh[] = [];
      // Rigid meshes use eight instances in ONE extra draw per material group.
      // Native skinning keeps the exact pose, using one draw per offset instead.
      const skinned = object instanceof THREE.SkinnedMesh;
      for (let i = 0; i < (skinned ? DIRECTIONS : 1); i++) {
        const rims = sources.map(source => this.rimMaterial(source, i));
        const material = Array.isArray(original) ? rims : rims[0];
        const proxy = skinned
          ? new THREE.SkinnedMesh(object.geometry, material)
          : new THREE.InstancedMesh(object.geometry, material,
            DIRECTIONS * (object instanceof THREE.InstancedMesh ? object.instanceMatrix.count : 1));
        if (proxy instanceof THREE.SkinnedMesh && object instanceof THREE.SkinnedMesh) {
          proxy.skeleton = object.skeleton;
          proxy.morphTargetInfluences = object.morphTargetInfluences;
          proxy.morphTargetDictionary = object.morphTargetDictionary;
        }
        proxy.name = "INTERACTION_BORDER_SILHOUETTE";
        proxy.matrixAutoUpdate = false;
        proxy.matrixWorldAutoUpdate = false;
        proxy.frustumCulled = false;
        proxy.layers.mask = object.layers.mask;
        proxy.raycast = () => {}; // Never become a gameplay/click target.
        proxy.onBeforeRender = () => {
          proxy.matrixWorld.copy(object.matrixWorld);
          if (proxy instanceof THREE.SkinnedMesh && object instanceof THREE.SkinnedMesh) {
            proxy.bindMatrix.copy(object.bindMatrix);
            proxy.bindMatrixInverse.copy(object.bindMatrixInverse);
          }
        };
        this.root.add(proxy);
        proxies.push(proxy);
      }
      this.replacements.push({ mesh: object, original, masked, proxies,
        matrixVersion: -1, instanceCount: -1, morphWeights: [] });
      object.material = masked;
    });
    if (target && this.active) {
      let parent = target;
      while (parent.parent) parent = parent.parent;
      parent.add(this.root);
    }
    this.update();
  }

  private supported(source: THREE.Material): boolean {
    // Custom vertex deformation needs its own silhouette implementation.
    return source.visible && source.colorWrite && !(source instanceof THREE.ShaderMaterial) &&
      source.onBeforeCompile === THREE.Material.prototype.onBeforeCompile;
  }

  private maskMaterial(source: THREE.Material): THREE.Material {
    if (!this.supported(source)) return source;
    let entry = this.masks.get(source);
    if (!entry) {
      entry = { material: source.clone(), version: source.version };
      this.masks.set(source, entry);
    }
    return entry.material;
  }

  private rimMaterial(source: SurfaceMaterial, direction: number): THREE.MeshBasicMaterial {
    const rim = new THREE.MeshBasicMaterial({
      color: 0xf3e7c2, toneMapped: false, fog: false,
      transparent: true, blending: THREE.NoBlending, forceSinglePass: true,
      depthTest: true, depthWrite: false,
      stencilWrite: true, stencilWriteMask: 0, stencilRef: 1, stencilFuncMask: 1,
      stencilFunc: THREE.NotEqualStencilFunc,
    });
    rim.visible = this.supported(source);
    const offset = { value: new THREE.Vector2(OFFSETS[direction][0], OFFSETS[direction][1]) };
    rim.onBeforeCompile = shader => {
      shader.uniforms.borderViewport = this.viewport;
      shader.uniforms.borderWidth = this.width;
      shader.uniforms.borderOffset = offset;
      shader.vertexShader = `uniform vec2 borderViewport;
uniform float borderWidth;
uniform vec2 borderOffset;
const vec2 borderDirections[8] = vec2[8](
  vec2(1.,0.), vec2(-1.,0.), vec2(0.,1.), vec2(0.,-1.),
  vec2(.70710678,.70710678), vec2(-.70710678,.70710678),
  vec2(.70710678,-.70710678), vec2(-.70710678,-.70710678));
${shader.vertexShader}`.replace("#include <project_vertex>", `#include <project_vertex>
vec2 rimOffset = borderOffset;
#ifdef USE_INSTANCING
  rimOffset = borderDirections[gl_InstanceID % 8];
#endif
gl_Position.xy += rimOffset * borderWidth * 2.0 / borderViewport * gl_Position.w;`);
      // Keep alpha cutouts without multiplying the cream rim by texture RGB.
      shader.fragmentShader = shader.fragmentShader.replace("#include <alphahash_fragment>",
        "#include <alphahash_fragment>\ndiffuseColor.rgb = diffuse;");
    };
    rim.customProgramCacheKey = () => "interaction-stencil-border-v1";
    this.rims.set(rim, source);
    return rim;
  }

  update(): void {
    for (const [source, entry] of this.masks) {
      // Preserve the surface, including authored opacity/color animation.
      entry.material.copy(source);
      entry.material.stencilWrite = true;
      entry.material.stencilWriteMask = 1;
      entry.material.stencilFuncMask = 1;
      entry.material.stencilRef = 1;
      entry.material.stencilFunc = THREE.AlwaysStencilFunc;
      entry.material.stencilFail = THREE.KeepStencilOp;
      entry.material.stencilZFail = THREE.KeepStencilOp;
      entry.material.stencilZPass = THREE.ReplaceStencilOp;
      if (entry.version !== source.version) {
        entry.material.needsUpdate = true;
        entry.version = source.version;
      }
    }
    for (const [rim, source] of this.rims) {
      const changed = rim.map !== (source.map ?? null) || rim.alphaMap !== (source.alphaMap ?? null) ||
        rim.side !== source.side || rim.alphaHash !== source.alphaHash;
      rim.map = source.map ?? null;
      rim.alphaMap = source.alphaMap ?? null;
      rim.alphaTest = source.alphaTest;
      rim.alphaHash = source.alphaHash;
      rim.side = source.side;
      rim.opacity = source.opacity;
      rim.visible = this.supported(source) && source.opacity > 0;
      if (changed) rim.needsUpdate = true;
    }
    for (const entry of this.replacements) {
      let visible = entry.mesh.material === entry.masked;
      let ancestor: THREE.Object3D | null = entry.mesh;
      while (ancestor && ancestor !== this.root.parent) {
        visible = visible && ancestor.visible;
        ancestor = ancestor.parent;
      }
      visible = visible && ancestor !== null && ancestor.visible;
      for (const proxy of entry.proxies) {
        proxy.visible = visible;
        proxy.layers.mask = entry.mesh.layers.mask;
        if (!(proxy instanceof THREE.InstancedMesh)) continue;
        const source = entry.mesh;
        const instanced = source instanceof THREE.InstancedMesh;
        proxy.count = DIRECTIONS * (instanced ? source.count : 1);
        if (entry.matrixVersion !== (instanced ? source.instanceMatrix.version : 0) ||
            entry.instanceCount !== proxy.count) {
          for (let i = 0; i < proxy.count; i++) {
            if (instanced) source.getMatrixAt(Math.floor(i / DIRECTIONS), this.matrix);
            else this.matrix.identity();
            proxy.setMatrixAt(i, this.matrix);
          }
          proxy.instanceMatrix.needsUpdate = true;
          entry.matrixVersion = instanced ? source.instanceMatrix.version : 0;
          entry.instanceCount = proxy.count;
        }
        const weights = source.morphTargetInfluences;
        if (weights && (weights.length !== entry.morphWeights.length ||
            weights.some((weight, i) => weight !== entry.morphWeights[i]))) {
          for (let i = 0; i < DIRECTIONS; i++) proxy.setMorphAt(i, source);
          proxy.morphTexture!.needsUpdate = true;
          entry.morphWeights = weights.slice();
        }
      }
    }
  }

  clear(): void {
    this.root.removeFromParent();
    for (const { mesh, original, masked, proxies } of this.replacements) {
      if (mesh.material === masked) mesh.material = original;
      for (const proxy of proxies) {
        if (proxy instanceof THREE.InstancedMesh) proxy.dispose();
      }
    }
    this.root.clear();
    for (const entry of this.masks.values()) entry.material.dispose();
    for (const rim of this.rims.keys()) rim.dispose();
    this.replacements.length = 0;
    this.masks.clear();
    this.rims.clear();
    this.target = null;
  }
}
