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
    const spawnPoints = this.shuffle(
      NPC_SPAWN_POINTS.map((position) => position.clone()),
    );

    const assets = await Promise.all(
      NPC_DEFINITIONS.map((definition) =>
        this.loader.loadGLB(definition.asset),
      ),
    );

    assets.forEach((asset, index: number) => {
      const definition = NPC_DEFINITIONS[index];

      const model: THREE.Group = asset.scene;

      const spawnPoint = spawnPoints[index % spawnPoints.length];

      model.name = `NPC_${definition.id}`;

      model.position.copy(spawnPoint);

      model.rotation.y = Math.random() * Math.PI * 2;

      model.scale.setScalar(definition.scale ?? 1);

      model.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;

        console.log(child);

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

  private shuffle<T>(values: readonly T[]): T[] {
    const result = [...values];

    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));

      [result[i], result[j]] = [result[j], result[i]];
    }

    return result;
  }
}
