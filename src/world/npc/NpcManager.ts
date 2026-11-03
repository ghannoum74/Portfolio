import * as THREE from "three";

import { AssetLoader } from "../../loaders/AssetLoader";

import { NPC_DEFINITIONS, type NpcDefinition } from "./NpcData";

import type { Npc } from "./Npc";
import { ASSETS } from "../../loaders/AssetManifest";
import { NpcAnimationClips, NpcAnimator } from "./NpcAnimator";
import { mapConcurrent } from "../../loaders/mapConcurrent";
import type { PhysicsWorld } from "../../physics/PhysicsWorld";
import { createNpcCollider, isNpcColliderHelper } from "./NpcCollider";

export class NpcManager {
  readonly npcs: Npc[] = [];
  private readonly loader: AssetLoader;
  private readonly startupLoader: AssetLoader;
  private readonly animationDistance = 15;
  private readonly animationDistanceSq =
    this.animationDistance * this.animationDistance;

  private readonly shadowDistance = 12;
  private readonly shadowDistanceSq = this.shadowDistance * this.shadowDistance;
  private visible = true;
  private loadPromise?: Promise<void>;
  private startupPromise?: Promise<void>;
  private animationsPromise?: Promise<NpcAnimationClips>;

  constructor(
    private readonly scene: THREE.Scene,

    loadingManager: THREE.LoadingManager,
    private readonly physics: PhysicsWorld,
    onAssetReady?: (url: string) => void,
  ) {
    this.startupLoader = new AssetLoader(loadingManager, onAssetReady);

    this.loader = new AssetLoader(new THREE.LoadingManager());
  }

  loadStartup(): Promise<void> {
    this.startupPromise ??= this.loadStartupAssets().catch((error) => {
      this.startupPromise = undefined;
      throw error;
    });
    return this.startupPromise;
  }

  private async loadStartupAssets(): Promise<void> {
    const definition = NPC_DEFINITIONS.find(
      (npc) => npc.asset === ASSETS.characters.frequenc,
    );
    if (!definition)
      throw new Error("Missing startup Frequenc character definition");
    const [asset, animationClips] = await Promise.all([
      this.startupLoader.loadGLB(definition.asset),
      this.loadAnimations(),
      this.physics.init(),
    ]);
    this.createNpc(definition, asset.scene, animationClips);
  }

  load(): Promise<void> {
    this.loadPromise ??= this.loadAssets().catch((error) => {
      this.loadPromise = undefined;
      throw error;
    });
    return this.loadPromise;
  }

  private async loadAssets(): Promise<void> {
    await this.loadStartup();
    const animationClips = await this.loadAnimations();
    const loadedIds = new Set(this.npcs.map((npc) => npc.id));
    const remaining = NPC_DEFINITIONS.filter((npc) => !loadedIds.has(npc.id));
    const failures: Error[] = [];

    await mapConcurrent(remaining, 2, async (definition) => {
      try {
        const asset = await this.loader.loadGLB(definition.asset);
        this.createNpc(definition, asset.scene, animationClips);
      } catch (cause) {
        failures.push(
          new Error(
            `Could not load guide ${definition.id}: ${definition.asset}`,
            { cause },
          ),
        );
      }
    });
    this.npcs.sort(
      (a, b) =>
        NPC_DEFINITIONS.findIndex((npc) => npc.id === a.id) -
        NPC_DEFINITIONS.findIndex((npc) => npc.id === b.id),
    );
    if (failures.length)
      throw new AggregateError(
        failures,
        "Some optional career guides could not load",
      );
  }

  private createNpc(
    definition: NpcDefinition,
    model: THREE.Group,
    animationClips: NpcAnimationClips,
  ): void {
    model.name = `NPC_${definition.id}`;

    model.position.copy(definition.position);

    model.rotation.y = definition.rotationY ?? 0;

    model.scale.setScalar(definition.scale ?? 1);

    const shadowMeshes: THREE.Mesh[] = [];

    model.traverse((child) => {
      if (isNpcColliderHelper(child)) {
        child.visible = false;
        return;
      }
      if (!(child instanceof THREE.Mesh)) {
        return;
      }

      child.castShadow = true;
      child.receiveShadow = true;

      shadowMeshes.push(child);
    });

    model.visible = this.visible;
    if (this.visible) this.scene.add(model);

    model.updateMatrixWorld(true);

    const animator = new NpcAnimator(model, animationClips);
    const collision = createNpcCollider(
      model,
      this.physics,
      this.visible,
      definition.collision,
    );

    this.npcs.push({
      id: definition.id,
      name: definition.name,
      company: definition.company,
      model,
      dialogues: definition.dialogues,
      animator,
      shadowMeshes,
      shadowsEnabled: true,
      collision,
    });
  }

  private loadAnimations(): Promise<NpcAnimationClips> {
    this.animationsPromise ??= this.loadAnimationAssets().catch((error) => {
      this.animationsPromise = undefined;
      throw error;
    });
    return this.animationsPromise;
  }

  private async loadAnimationAssets(): Promise<NpcAnimationClips> {
    const [idle, talking1, talking2, talking3] = await Promise.all([
      this.startupLoader.loadGLB(ASSETS.npcAnimations.idle),

      this.startupLoader.loadGLB(ASSETS.npcAnimations.talking1),

      this.startupLoader.loadGLB(ASSETS.npcAnimations.talking2),

      this.startupLoader.loadGLB(ASSETS.npcAnimations.talking3),
    ]);

    return {
      idle: this.prepareNpcClip(idle.animations[0]),

      talking_1: this.prepareNpcClip(talking1.animations[0]),

      talking_2: this.prepareNpcClip(talking2.animations[0]),

      talking_3: this.prepareNpcClip(talking3.animations[0]),
    };
  }

  update(delta: number, playerPosition: THREE.Vector3): void {
    for (const npc of this.npcs) {
      npc.collision?.sync();
      const distanceSq = npc.model.position.distanceToSquared(playerPosition);

      if (distanceSq <= this.animationDistanceSq) {
        npc.animator.update(delta);
      }

      const shouldCastShadow = distanceSq <= this.shadowDistanceSq;

      if (shouldCastShadow !== npc.shadowsEnabled) {
        for (const mesh of npc.shadowMeshes) {
          mesh.castShadow = shouldCastShadow;
        }

        npc.shadowsEnabled = shouldCastShadow;
      }
    }
  }

  private prepareNpcClip(clip: THREE.AnimationClip): THREE.AnimationClip {
    const cleanClip = clip.clone();

    cleanClip.tracks = cleanClip.tracks.filter((track) => {
      const isPositionTrack = track.name.endsWith(".position");

      const isScaleTrack = track.name.endsWith(".scale");

      return !isPositionTrack && !isScaleTrack;
    });

    cleanClip.resetDuration();

    return cleanClip;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;

    for (const npc of this.npcs) {
      npc.collision?.setEnabled(visible);
      npc.model.visible = visible;
      if (visible) this.scene.add(npc.model);
      else this.scene.remove(npc.model);
    }
  }
}
