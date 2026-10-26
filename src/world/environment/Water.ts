import * as THREE from "three";

export type WaterShaderMode = "original" | "vertex" | "depth";
type WaterEntry = {
  mesh: THREE.Mesh;
  source: THREE.Material | THREE.Material[];
  castShadow: boolean;
  receiveShadow: boolean;
  variants: Map<WaterShaderMode, THREE.Material | THREE.Material[]>;
};

export class Water {
  private readonly entries: WaterEntry[] = [];
  private readonly ownedMaterials = new Set<THREE.Material>();
  private shaderMode: WaterShaderMode = "original";
  private readonly time = {
    value: 0,
  };

  private readonly deepColor = {
    value: new THREE.Color("#147f9f"),
  };

  private readonly surfaceColor = {
    value: new THREE.Color("#32b7cf"),
  };

  private readonly highlightColor = {
    value: new THREE.Color("#8ce8e5"),
  };

  private readonly horizonDeepColor = {
    value: new THREE.Color("#208fab"),
  };

  private readonly horizonSurfaceColor = {
    value: new THREE.Color("#48bfd0"),
  };

  constructor(environment: THREE.Object3D, mode: WaterShaderMode = "original") {
    this.setupWater(environment);
    this.setShaderMode(mode);
  }

  update(delta: number): void {
    this.time.value += delta;
  }

  setShaderMode(mode: WaterShaderMode): void {
    if (mode !== "original" && mode !== "vertex" && mode !== "depth") throw new Error("Unknown water shader mode");
    for (const entry of this.entries) {
      let materials = entry.variants.get(mode);
      if (!materials) {
        const create = (source: THREE.Material) => {
          if (source.name !== "Water_Surface" && source.name !== "Water_Horizon") return source;
          // Diagnostic keeps the same opaque depth coverage and vertex positions.
          // Its missing water color is an isolation view, never a quality preset.
          const material = mode === "depth"
            ? new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.FrontSide })
            : source.name === "Water_Surface"
              ? this.createNearWaterMaterial(source, mode === "vertex")
              : this.createHorizonWaterMaterial(source, mode === "vertex");
          this.ownedMaterials.add(material);
          return material;
        };
        materials = Array.isArray(entry.source) ? entry.source.map(create) : create(entry.source);
        entry.variants.set(mode, materials);
      }
      entry.mesh.material = materials;
    }
    this.shaderMode = mode;
  }

  get stats() {
    return { mode: this.shaderMode, meshes: this.entries.length };
  }

  dispose(): void {
    for (const entry of this.entries) {
      if ([...entry.variants.values()].includes(entry.mesh.material)) {
        entry.mesh.material = entry.source;
        entry.mesh.castShadow = entry.castShadow;
        entry.mesh.receiveShadow = entry.receiveShadow;
      }
    }
    for (const material of this.ownedMaterials) material.dispose();
    this.ownedMaterials.clear();
    this.entries.length = 0;
  }

  private setupWater(environment: THREE.Object3D): void {
    environment.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) {
        return;
      }

      const originalMaterials = Array.isArray(child.material)
        ? child.material
        : [child.material];

      if (!originalMaterials.some(material => material.name === "Water_Surface" || material.name === "Water_Horizon")) {
        return;
      }

      this.entries.push({ mesh: child, source: child.material,
        castShadow: child.castShadow, receiveShadow: child.receiveShadow, variants: new Map() });

      child.castShadow = false;
      child.receiveShadow = false;
    });
  }

  private createNearWaterMaterial(
    originalMaterial: THREE.Material,
    vertexPhases = false,
  ): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
      color: this.surfaceColor.value,

      roughness: 0.32,

      metalness: 0,

      flatShading: true,

      side: THREE.FrontSide,
    });

    if (originalMaterial instanceof THREE.MeshStandardMaterial) {
      material.roughness = originalMaterial.roughness;
    }

    material.name = "Water_Surface_Animated";

    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.time;

      shader.uniforms.uDeepColor = this.deepColor;

      shader.uniforms.uSurfaceColor = this.surfaceColor;

      shader.uniforms.uHighlightColor = this.highlightColor;

      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        `
          #include <common>

          varying vec3 vWaterWorldPosition;
          ${vertexPhases ? "varying vec4 vWaterPhases;" : ""}
          `,
      );

      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `
          #include <begin_vertex>

          vWaterWorldPosition =
            (
              modelMatrix *
              vec4(
                transformed,
                1.0
              )
            ).xyz;
          ${vertexPhases ? `
            vWaterPhases = vec4(
              vWaterWorldPosition.x * 0.55 + vWaterWorldPosition.z * 0.22,
              vWaterWorldPosition.z * 0.7 - vWaterWorldPosition.x * 0.18,
              (vWaterWorldPosition.x + vWaterWorldPosition.z) * 1.15,
              vWaterWorldPosition.x * 1.4 - vWaterWorldPosition.z * 0.8
            );
          ` : ""}
          `,
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        `
          #include <common>

          uniform float uTime;

          uniform vec3 uDeepColor;
          uniform vec3 uSurfaceColor;
          uniform vec3 uHighlightColor;

          varying vec3 vWaterWorldPosition;
          ${vertexPhases ? "varying vec4 vWaterPhases;" : ""}
          `,
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        `
          #include <color_fragment>

          float waveA =
            sin(
              ${vertexPhases ? "vWaterPhases.x" : "vWaterWorldPosition.x * 0.55 + vWaterWorldPosition.z * 0.22"} +
              uTime * 0.35
            );

          float waveB =
            sin(
              ${vertexPhases ? "vWaterPhases.y" : "vWaterWorldPosition.z * 0.7 - vWaterWorldPosition.x * 0.18"} -
              uTime * 0.28
            );

          float ripple =
            sin(
              ${vertexPhases ? "vWaterPhases.z" : "(vWaterWorldPosition.x + vWaterWorldPosition.z) * 1.15"} +
              uTime *
              0.65
            );

          float pattern =
            (
              waveA * 0.5 +
              waveB * 0.35 +
              ripple * 0.15
            ) *
            0.5 +
            0.5;

          pattern =
            smoothstep(
              0.15,
              0.85,
              pattern
            );

          vec3 waterColor =
  mix(
    uDeepColor,
    uSurfaceColor,
    pattern
  );

float distanceFromIsland =
  distance(
    vWaterWorldPosition.xz,
    vec2(-2.0, 4.5)
  );

float horizonFade =
  smoothstep(
    22.0,
    55.0,
    distanceFromIsland
  );

float highlightPattern =
  sin(
    ${vertexPhases ? "vWaterPhases.w" : "vWaterWorldPosition.x * 1.4 - vWaterWorldPosition.z * 0.8"} +
    uTime * 0.75
  ) *
  0.5 +
  0.5;

float highlight =
  smoothstep(
    0.82,
    1.0,
    highlightPattern
  );

highlight *=
  1.0 - horizonFade;

waterColor =
  mix(
    waterColor,
    uHighlightColor,
    highlight * 0.18
  );

vec3 farWaterColor =
  vec3(
    0.38,
    0.78,
    0.84
  );

waterColor =
  mix(
    waterColor,
    farWaterColor,
    horizonFade
  );

diffuseColor.rgb =
  waterColor;
          `,
      );
    };

    material.customProgramCacheKey = () => vertexPhases ? "portfolio-water-near-vertex-v1" : "portfolio-water-near-v1";

    return material;
  }

  private createHorizonWaterMaterial(
    _originalMaterial: THREE.Material,
    vertexPhases = false,
  ): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
      color: this.horizonSurfaceColor.value,

      roughness: 0.5,

      metalness: 0,

      side: THREE.FrontSide,
    });

    material.name = "Water_Horizon_Animated";

    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.time;

      shader.uniforms.uHorizonDeep = this.horizonDeepColor;

      shader.uniforms.uHorizonSurface = this.horizonSurfaceColor;

      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        `
          #include <common>

          varying vec3 vWaterWorldPosition;
          ${vertexPhases ? "varying vec2 vWaterPhases;" : ""}
          `,
      );

      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `
          #include <begin_vertex>

          vWaterWorldPosition =
            (
              modelMatrix *
              vec4(
                transformed,
                1.0
              )
            ).xyz;
          ${vertexPhases ? `
            vWaterPhases = vec2(
              vWaterWorldPosition.x * 0.10 + vWaterWorldPosition.z * 0.08,
              vWaterWorldPosition.z * 0.13
            );
          ` : ""}
          `,
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        `
          #include <common>

          uniform float uTime;

          uniform vec3 uHorizonDeep;
          uniform vec3 uHorizonSurface;

          varying vec3 vWaterWorldPosition;
          ${vertexPhases ? "varying vec2 vWaterPhases;" : ""}
          `,
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        `
          #include <color_fragment>

          float wave =
            sin(
              ${vertexPhases ? "vWaterPhases.x" : "vWaterWorldPosition.x * 0.10 + vWaterWorldPosition.z * 0.08"} +
              uTime * 0.12
            );

          float wave2 =
            sin(
              ${vertexPhases ? "vWaterPhases.y" : "vWaterWorldPosition.z * 0.13"} -
              uTime * 0.09
            );

          float pattern =
            (
              wave * 0.65 +
              wave2 * 0.35
            ) *
            0.5 +
            0.5;

          vec3 waterColor =
            mix(
              uHorizonDeep,
              uHorizonSurface,
              pattern
            );

          diffuseColor.rgb =
            waterColor;
          `,
      );
    };

    material.customProgramCacheKey = () => vertexPhases ? "portfolio-water-horizon-vertex-v1" : "portfolio-water-horizon-v1";

    return material;
  }
}
