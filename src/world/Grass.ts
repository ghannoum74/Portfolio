import * as THREE from "three";
import { AssetLoader } from "../loaders/AssetLoader";
import { loadGrassMask, type GrassMaskData } from "../loaders/GrassMaskLoader";

type GrassVariant = {
  name: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  weight: number;
};

type GrassPlacement = {
  position: THREE.Vector3;
  scale: number;
};

type MaskBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export class Grass {
  private readonly loader: AssetLoader;
  private readonly windTime = { value: 0 };
  private mask!: GrassMaskData;

  private readonly variantWeights: Record<string, number> = {
    shortGrass: 25,
    originalGrass: 15,
    wideGrass: 8,
    tallGrass: 50,
    bentLeftGrass: 6,
    bentRightGrass: 6,
  };

  private readonly maskBounds: MaskBounds = {
    minX: -100,
    maxX: 100,
    minZ: -100,
    maxZ: 100,
  };

  constructor(
    private readonly scene: THREE.Scene,
    private readonly loadingManager: THREE.LoadingManager,
  ) {
    this.loader = new AssetLoader(loadingManager);
  }

  // this is to make sure the grass is centered at the origin, so that when we place it in the world, it will be positioned correctly
  private normalizeGeometry(geometry: THREE.BufferGeometry): void {
    geometry.computeBoundingBox();

    const box = geometry.boundingBox;

    if (!box) {
      throw new Error("Bounding box is not defined");
    }

    const centerX = (box.min.x + box.max.x) / 2;
    const centerZ = (box.min.z + box.max.z) / 2;
    const centerY = box.min.y;

    geometry.translate(-centerX, -centerY, -centerZ);

    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }

  private extractVariants(scene: THREE.Group): GrassVariant[] {
    const variants: GrassVariant[] = [];

    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) {
        return;
      }

      const geometry = object.geometry.clone();

      this.normalizeGeometry(geometry);

      const grassHeight = geometry.boundingBox!.max.y;

      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];

      materials.forEach((material) => {
        this.applyBillboardShader(material, grassHeight);
      });

      variants.push({
        name: object.name,
        geometry,
        material: object.material,
        weight: this.variantWeights[object.name] ?? 1,
      });
    });

    return variants;
  }

  private selectVariant(variants: GrassVariant[]): number {
    const totalWeight = variants.reduce(
      (total, variant) => total + variant.weight,
      0,
    );

    let randomWeight = Math.random() * totalWeight;

    for (let index = 0; index < variants.length; index++) {
      randomWeight -= variants[index].weight;

      if (randomWeight <= 0) {
        return index;
      }
    }

    return variants.length - 1;
  }

  private createGrassFromMask(variants: GrassVariant[]): void {
    const placementsByVariant: GrassPlacement[][] = variants.map(() => []);

    const spacing = 0.25;

    const jitter = spacing * 0.2;
    const groundY = 0.001;

    const { minX, maxX, minZ, maxZ } = this.maskBounds;

    for (let z = minZ; z <= maxZ; z += spacing) {
      for (let x = minX; x <= maxX; x += spacing) {
        // Prevent visible straight rows.
        const worldX = x + THREE.MathUtils.randFloat(-jitter, jitter);

        const worldZ = z + THREE.MathUtils.randFloat(-jitter, jitter);

        const density = this.sampleMaskDensity(worldX, worldZ);

        // Treat pixels that are almost black as completely empty.
        if (density < 0.03) {
          continue;
        }

        // Gray values produce partial density.
        if (Math.random() > density) {
          continue;
        }

        const variantIndex = this.selectVariant(variants);

        placementsByVariant[variantIndex].push({
          position: new THREE.Vector3(worldX, groundY, worldZ),
          scale: THREE.MathUtils.randFloat(0.85, 1.15),
        });
      }
    }

    variants.forEach((variant, variantIndex) => {
      const placements = placementsByVariant[variantIndex];

      if (placements.length === 0) {
        return;
      }

      const instances = new THREE.InstancedMesh(
        variant.geometry,
        variant.material,
        placements.length,
      );

      instances.name = `grass-${variant.name}`;

      const dummy = new THREE.Object3D();

      placements.forEach((placement, index) => {
        dummy.position.copy(placement.position);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(placement.scale);
        dummy.updateMatrix();

        instances.setMatrixAt(index, dummy.matrix);
      });

      instances.instanceMatrix.setUsage(THREE.StaticDrawUsage);

      instances.instanceMatrix.needsUpdate = true;

      instances.castShadow = true;
      instances.receiveShadow = true;

      this.scene.add(instances);
    });
  }

  async load(): Promise<void> {
    const [grassAsset, mask] = await Promise.all([
      this.loader.loadGLB("/assets/models/environment/grass.glb"),

      loadGrassMask("/assets/mask/grass-mask-v2.png", this.loadingManager),
    ]);

    this.mask = mask;

    const variants = this.extractVariants(grassAsset.scene);

    if (variants.length === 0) {
      throw new Error("grass.glb does not contain any grass meshes");
    }

    this.createGrassFromMask(variants);
  }

  private applyBillboardShader(
    material: THREE.Material,
    grassHeight: number,
  ): void {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uWindTime = this.windTime;

      shader.uniforms.uGrassHeight = {
        value: grassHeight,
      };

      shader.vertexShader = shader.vertexShader.replace(
        "void main() {",
        `
        uniform float uWindTime;
        uniform float uGrassHeight;

        void main() {

        #ifdef USE_INSTANCING

          vec3 grassWorldPosition = (
            modelMatrix *
            instanceMatrix *
            vec4(0.0, 0.0, 0.0, 1.0)
          ).xyz;

          vec3 grassToCamera =
            cameraPosition - grassWorldPosition;

          float grassAngle = atan(
            grassToCamera.x,
            grassToCamera.z
          );

          float grassSin = sin(grassAngle);
          float grassCos = cos(grassAngle);

        #endif
      `,
      );

      shader.vertexShader = shader.vertexShader.replace(
        "#include <beginnormal_vertex>",
        `
      #include <beginnormal_vertex>

      #ifdef USE_INSTANCING

        float normalX =
          grassCos * objectNormal.x +
          grassSin * objectNormal.z;

        float normalZ =
          -grassSin * objectNormal.x +
          grassCos * objectNormal.z;

        objectNormal.x = normalX;
        objectNormal.z = normalZ;

      #endif
      `,
      );

      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `
        #include <begin_vertex>
            
        #ifdef USE_INSTANCING
            
          // 0 at the root, 1 at the tip.
          float heightFactor = clamp(
            position.y / uGrassHeight,
            0.0,
            1.0
          );
            
          // Make the bottom much stiffer.
          heightFactor *= heightFactor;
            
          // Different world positions get different wind phases.
          float windPhase =
            uWindTime * 2.0 +
            grassWorldPosition.x * 0.7 +
            grassWorldPosition.z * 0.5;
            
          // Main wind + smaller secondary wave.
          float wind =
            sin(windPhase) +
            sin(windPhase * 2.3 + 1.7) * 0.35;
            
          // Bend the grass.
          transformed.x +=
            wind * 0.12 * heightFactor;
            
            
          // BILLBOARD
          float rotatedX =
            grassCos * transformed.x +
            grassSin * transformed.z;
            
          float rotatedZ =
            -grassSin * transformed.x +
            grassCos * transformed.z;
            
          transformed.x = rotatedX;
          transformed.z = rotatedZ;
            
        #endif
        `,
      );
    };

    material.needsUpdate = true;
  }

  update(delta: number): void {
    this.windTime.value += delta;
  }

  private sampleMaskDensity(worldX: number, worldZ: number): number {
    const { minX, maxX, minZ, maxZ } = this.maskBounds;

    const u = (worldX - minX) / (maxX - minX);
    const v = (worldZ - minZ) / (maxZ - minZ);

    //  check position outside the ground
    if (u < 0 || u > 1 || v < 0 || v > 1) {
      return 0;
    }

    const pixelX = Math.min(
      this.mask.width - 1,
      Math.floor(u * this.mask.width),
    );
    const pixelY = Math.min(
      this.mask.height - 1,
      Math.floor((1 - v) * this.mask.height),
    );

    const pixelIndex = (pixelY * this.mask.width + pixelX) * 4;

    const brightness = this.mask.pixels[pixelIndex];

    return brightness / 255;
  }
}
