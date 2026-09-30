import * as THREE from "three";

import { AssetLoader } from "../../loaders/AssetLoader";

import { NPC_DEFINITIONS, NPC_SPAWN_POINTS } from "./NpcData";

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
    const assets = await Promise.all(
      NPC_DEFINITIONS.map((definition) =>
        this.loader.loadGLB(definition.asset),
      ),
    );

    assets.forEach((asset, index) => {
      const definition = NPC_DEFINITIONS[index];

      const spawnPoint = NPC_SPAWN_POINTS[index];

      if (!spawnPoint) {
        throw new Error(`Missing spawn point for NPC: ${definition.id}`);
      }

      const model = asset.scene;

      model.name = `NPC_${definition.id}`;

      model.position.copy(spawnPoint);

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
    });
  }
}
