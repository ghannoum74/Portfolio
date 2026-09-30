import * as THREE from "three";

import { AssetLoader } from "../../loaders/AssetLoader";

import { NPC_DEFINITIONS, type NpcDefinition } from "./NpcData";

import type { Npc } from "./Npc";
import { ASSETS } from "../../loaders/AssetManifest";
import { NpcAnimationClips, NpcAnimator } from "./NpcAnimator";

export class NpcManager {
  readonly npcs: Npc[] = [];
  private readonly loader: AssetLoader;

  constructor(
    private readonly scene: THREE.Scene,
    loadingManager: THREE.LoadingManager,
    onAssetReady?: (url: string) => void,
  ) {
    this.loader = new AssetLoader(loadingManager, onAssetReady);
  }

  async load(): Promise<void> {
    const animationClips = await this.loadAnimations();

    for (const definition of NPC_DEFINITIONS) {
      const asset = await this.loader.loadGLB(definition.asset);

      this.createNpc(definition, asset.scene, animationClips);
    }
  }

  private createNpc(
    definition: NpcDefinition,
    model: THREE.Group,
    animationClips: NpcAnimationClips,
  ): void {
    const animator = new NpcAnimator(model, animationClips);

    model.name = `NPC_${definition.id}`;

    model.position.copy(definition.position);

    model.rotation.y = definition.rotationY ?? 0;

    model.scale.setScalar(definition.scale ?? 1);

    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) {
        return;
      }

      child.castShadow = true;
      child.receiveShadow = true;
    });

    this.scene.add(model);

    model.updateMatrixWorld(true);
    this.npcs.push({
      id: definition.id,
      name: definition.name,
      company: definition.company,
      model,
      dialogues: definition.dialogues,
      animator,
    });
  }

  private async loadAnimations(): Promise<NpcAnimationClips> {
    const [talking1, talking2, talking3] = await Promise.all([
      this.loader.loadGLB(ASSETS.npcAnimations.talking1),

      this.loader.loadGLB(ASSETS.npcAnimations.talking2),

      this.loader.loadGLB(ASSETS.npcAnimations.talking3),
    ]);

    console.log(talking1, talking2, talking3);

    return {
      talking_1: talking1.animations[0],

      talking_2: talking2.animations[0],

      talking_3: talking3.animations[0],
    };
  }

  update(delta: number): void {
    for (const npc of this.npcs) {
      npc.animator.update(delta);
    }
  }
}
