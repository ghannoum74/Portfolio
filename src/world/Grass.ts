import * as THREE from "three";
import { AssetLoader } from "../loaders/AssetLoader";

type GrassVariant = {
  name: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  weight: number;
};

type GrassPatch = {
  centerX: number;
  centerZ: number;
  radiusX: number;
  radiusZ: number;
  spacing: number;
};

export class Grass {
  private readonly loader: AssetLoader;

  private readonly patches: GrassPatch[] = [
    // Left-middle patch
    {
      centerX: -1,
      centerZ: -5,
      radiusX: 4,
      radiusZ: 8,
      spacing: 0.35,
    },

    // Back-left patch
    {
      centerX: -16,
      centerZ: -18,
      radiusX: 7,
      radiusZ: 4,
      spacing: 0.36,
    },

    // Small back-center patch
    {
      centerX: -2,
      centerZ: -21,
      radiusX: 6,
      radiusZ: 3,
      spacing: 0.38,
    },

    // Back-right patch
    {
      centerX: 14,
      centerZ: -18,
      radiusX: 6,
      radiusZ: 4,
      spacing: 0.36,
    },

    // Right-middle patch
    {
      centerX: 20,
      centerZ: -2,
      radiusX: 4,
      radiusZ: 8,
      spacing: 0.35,
    },

    // Front-right patch
    {
      centerX: 16,
      centerZ: 16,
      radiusX: 7,
      radiusZ: 4,
      spacing: 0.37,
    },

    // Front-left patch
    {
      centerX: -15,
      centerZ: 17,
      radiusX: 7,
      radiusZ: 4,
      spacing: 0.37,
    },

    // Small decorative patch
    {
      centerX: 5,
      centerZ: 19,
      radiusX: 3,
      radiusZ: 2,
      spacing: 0.4,
    },
  ];

  private readonly variantWeights: Record<string, number> = {
    shortGrass: 25,
    originalGrass: 15,
    wideGrass: 8,
    tallGrass: 50,
    bentLeftGrass: 6,
    bentRightGrass: 6,
  };

  constructor(
    private readonly scene: THREE.Scene,
    loadingManager: THREE.LoadingManager,
  ) {
    this.loader = new AssetLoader(loadingManager);
  }

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

  private createGrassPatch(variants: GrassVariant[], patch: GrassPatch): void {
    const matricesByVariant: THREE.Matrix4[][] = variants.map(() => []);

    const dummy = new THREE.Object3D();
    const jitter = patch.spacing * 0.1;
    console.log(patch, dummy, jitter);

    for (
      let localZ = -patch.radiusZ;
      localZ <= patch.radiusZ;
      localZ += patch.spacing
    ) {
      for (
        let localX = -patch.radiusX;
        localX <= patch.radiusX;
        localX += patch.spacing
      ) {
        // Prevent perfectly straight rows.
        const randomX = localX + THREE.MathUtils.randFloat(-jitter, jitter);

        const randomZ = localZ + THREE.MathUtils.randFloat(-jitter, jitter);

        // Check if this position is inside the ellipse.
        const normalizedX = randomX / patch.radiusX;
        const normalizedZ = randomZ / patch.radiusZ;

        const distance = normalizedX * normalizedX + normalizedZ * normalizedZ;

        if (distance > 1) {
          continue;
        }

        // Make the border less perfectly shaped.
        const placementChance = THREE.MathUtils.lerp(0.3, 1, 1 - distance);

        if (Math.random() > placementChance) {
          continue;
        }

        // Select one of the seven variants.
        const variantIndex = this.selectVariant(variants);

        dummy.position.set(
          patch.centerX + randomX,
          0.001,
          patch.centerZ + randomZ,
        );

        dummy.updateMatrix();

        matricesByVariant[variantIndex].push(dummy.matrix.clone());
      }
    }

    variants.forEach((variant, variantIndex) => {
      const matrices = matricesByVariant[variantIndex];

      if (matrices.length === 0) {
        return;
      }

      const instances = new THREE.InstancedMesh(
        variant.geometry,
        variant.material,
        matrices.length,
      );

      instances.name = `grass-${variant.name}`;

      matrices.forEach((matrix, index) => {
        instances.setMatrixAt(index, matrix);
      });

      instances.instanceMatrix.setUsage(THREE.StaticDrawUsage);

      instances.instanceMatrix.needsUpdate = true;

      instances.castShadow = false;
      instances.receiveShadow = false;

      instances.computeBoundingBox();
      instances.computeBoundingSphere();

      this.scene.add(instances);
    });
  }

  async load(): Promise<void> {
    const grassAsset = await this.loader.loadGLB(
      "/assets/models/environment/grass.glb",
    );

    const variants = this.extractVariants(grassAsset.scene);

    console.log(variants);

    if (variants.length === 0) {
      throw new Error("grass.glb does not contain any grass meshes");
    }

    for (const patch of this.patches) {
      this.createGrassPatch(variants, patch);
    }
  }
}
