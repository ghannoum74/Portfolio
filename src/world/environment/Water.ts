import * as THREE from "three";

export class Water {
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

  constructor(environment: THREE.Object3D) {
    this.setupWater(environment);
  }

  update(delta: number): void {
    this.time.value += delta;
  }

  private setupWater(environment: THREE.Object3D): void {
    environment.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) {
        return;
      }

      const originalMaterials = Array.isArray(child.material)
        ? child.material
        : [child.material];

      let containsWater = false;

      const newMaterials = originalMaterials.map((material) => {
        if (material.name === "Water_Surface") {
          containsWater = true;

          return this.createNearWaterMaterial(material);
        }

        if (material.name === "Water_Horizon") {
          containsWater = true;

          return this.createHorizonWaterMaterial(material);
        }

        return material;
      });

      if (!containsWater) {
        return;
      }

      child.material = Array.isArray(child.material)
        ? newMaterials
        : newMaterials[0];

      child.castShadow = false;
      child.receiveShadow = false;
    });
  }

  private createNearWaterMaterial(
    originalMaterial: THREE.Material,
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
          `,
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        `
          #include <color_fragment>

          float waveA =
            sin(
              vWaterWorldPosition.x * 0.55 +
              vWaterWorldPosition.z * 0.22 +
              uTime * 0.35
            );

          float waveB =
            sin(
              vWaterWorldPosition.z * 0.7 -
              vWaterWorldPosition.x * 0.18 -
              uTime * 0.28
            );

          float ripple =
            sin(
              (
                vWaterWorldPosition.x +
                vWaterWorldPosition.z
              ) *
              1.15 +
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
    vWaterWorldPosition.x * 1.4 -
    vWaterWorldPosition.z * 0.8 +
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

    material.customProgramCacheKey = () => "portfolio-water-near-v1";

    return material;
  }

  private createHorizonWaterMaterial(
    _originalMaterial: THREE.Material,
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
          `,
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        `
          #include <color_fragment>

          float wave =
            sin(
              vWaterWorldPosition.x * 0.10 +
              vWaterWorldPosition.z * 0.08 +
              uTime * 0.12
            );

          float wave2 =
            sin(
              vWaterWorldPosition.z * 0.13 -
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

    material.customProgramCacheKey = () => "portfolio-water-horizon-v1";

    return material;
  }
}
