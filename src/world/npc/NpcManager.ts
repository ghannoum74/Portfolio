import * as THREE from "three";

import { AssetLoader } from "../../loaders/AssetLoader";

import { NPC_DEFINITIONS, type NpcDefinition } from "./NpcData";

import type { Npc } from "./Npc";

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
    for (const definition of NPC_DEFINITIONS) {
      const asset = await this.loader.loadGLB(definition.asset);

      this.createNpc(definition, asset.scene);
    }
  }

  private createNpc(definition: NpcDefinition, model: THREE.Group): void {
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
    });
  }
}
