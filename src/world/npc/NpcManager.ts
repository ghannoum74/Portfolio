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
  ) {
    this.loader = new AssetLoader(loadingManager);
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

    /*
     * Create the animation system only AFTER
     * the NPC has its final transform.
     */
    const animator = new NpcAnimator(model, animationClips);

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
    const [idle, talking1, talking2, talking3] = await Promise.all([
      this.loader.loadGLB(ASSETS.npcAnimations.idle),

      this.loader.loadGLB(ASSETS.npcAnimations.talking1),

      this.loader.loadGLB(ASSETS.npcAnimations.talking2),

      this.loader.loadGLB(ASSETS.npcAnimations.talking3),
    ]);

    return {
      idle: this.prepareNpcClip(idle.animations[0]),

      talking_1: this.prepareNpcClip(talking1.animations[0]),

      talking_2: this.prepareNpcClip(talking2.animations[0]),

      talking_3: this.prepareNpcClip(talking3.animations[0]),
    };
  }

  update(delta: number): void {
    for (const npc of this.npcs) {
      npc.animator.update(delta);
    }
  }

  // because of the animation that is sticky to the character
  // so this cause make the character bigger then the idle character and re shrink it
  // so i override this
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
}
