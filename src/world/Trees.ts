import { AssetLoader } from "../loaders/AssetLoader";
import * as THREE from "three";

type TreePlacement = {
  variant: number;
  position: [number, number, number];
  rotationY: number;
  scale?: number;
};

export class Trees {
  public model = new THREE.Group();
  private readonly loader: AssetLoader;
  private readonly treePaths = [
    "/assets/models/environment/trees/tree.glb",
    "/assets/models/environment/trees/fall-tree.glb",
    "/assets/models/environment/trees/simple-tree.glb",
  ];

  private readonly placements: TreePlacement[] = [
    {
      variant: 0,
      position: [-6.6, 0, 6.3],
      rotationY: 0,
      scale: 1,
    },
    {
      variant: 0,
      position: [-5.8, 0, -2.12],
      rotationY: Math.PI * 0.4,
      scale: 0.85,
    },
    {
      variant: 1,
      position: [-12.7, 0, 6.11],
      rotationY: Math.PI,
      scale: 1,
    },
    {
      variant: 2,
      position: [12, 0, 8],
      rotationY: Math.PI * 1.5,
      scale: 0.95,
    },
  ];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly loadingManager: THREE.LoadingManager,
  ) {
    this.loader = new AssetLoader(loadingManager);
    this.model.name = "trees";
  }

  async load(): Promise<void> {
    const assets = await Promise.all(
      this.treePaths.map((path) => this.loader.loadGLB(path)),
    );

    const variants = assets.map((asset) => asset.scene);

    variants.forEach((variant) => {
      variant.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) {
          return;
        }

        child.castShadow = true;
        child.receiveShadow = true;
      });
    });

    this.placements.forEach((placement) => {
      const source = variants[placement.variant];

      if (!source) {
        console.warn(`Tree variant ${placement.variant} does not exist`);

        return;
      }

      const treeClone = source.clone(true);

      treeClone.position.set(...placement.position);
      treeClone.rotation.y = placement.rotationY ?? 0;
      treeClone.scale.setScalar(placement.scale ?? 1);

      treeClone.name = `tree-${placement.variant}`;
      this.model.add(treeClone);
    });

    this.scene.add(this.model);
  }
}
