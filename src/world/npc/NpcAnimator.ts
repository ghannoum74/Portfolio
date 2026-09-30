import * as THREE from "three";

import type { NpcTalkAnimation } from "./NpcData";

export interface NpcAnimationClips {
  talking_1: THREE.AnimationClip;
  talking_2: THREE.AnimationClip;
  talking_3: THREE.AnimationClip;
}

export class NpcAnimator {
  private readonly mixer: THREE.AnimationMixer;

  private readonly actions = new Map<NpcTalkAnimation, THREE.AnimationAction>();

  private currentAction: THREE.AnimationAction | null = null;

  constructor(model: THREE.Object3D, clips: NpcAnimationClips) {
    this.mixer = new THREE.AnimationMixer(model);

    this.actions.set("talking_1", this.mixer.clipAction(clips.talking_1));
    this.actions.set("talking_2", this.mixer.clipAction(clips.talking_2));
    this.actions.set("talking_3", this.mixer.clipAction(clips.talking_3));
  }

  play(animation: NpcTalkAnimation): void {
    const nextAction = this.actions.get(animation);

    if (!nextAction) {
      return;
    }

    if (nextAction === this.currentAction) {
      return;
    }

    this.currentAction?.stop();

    nextAction.reset().setLoop(THREE.LoopRepeat, Infinity).play();

    this.currentAction = nextAction;
  }

  stop(): void {
    if (!this.currentAction) {
      return;
    }
    this.currentAction.stop();
    this.currentAction = null;
  }

  update(delta: number): void {
    this.mixer.update(delta);
  }
}
