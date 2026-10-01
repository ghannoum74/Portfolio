import * as THREE from "three";

import type { NpcTalkAnimation } from "./NpcData";

export interface NpcAnimationClips {
  idle: THREE.AnimationClip;

  talking_1: THREE.AnimationClip;
  talking_2: THREE.AnimationClip;
  talking_3: THREE.AnimationClip;
}

export class NpcAnimator {
  private readonly mixer: THREE.AnimationMixer;

  private readonly idleAction: THREE.AnimationAction;

  private readonly talkingActions = new Map<
    NpcTalkAnimation,
    THREE.AnimationAction
  >();

  private currentAction: THREE.AnimationAction;

  constructor(model: THREE.Object3D, clips: NpcAnimationClips) {
    this.mixer = new THREE.AnimationMixer(model);

    this.idleAction = this.mixer.clipAction(clips.idle);

    this.talkingActions.set(
      "talking_1",
      this.mixer.clipAction(clips.talking_1),
    );

    this.talkingActions.set(
      "talking_2",
      this.mixer.clipAction(clips.talking_2),
    );

    this.talkingActions.set(
      "talking_3",
      this.mixer.clipAction(clips.talking_3),
    );

    this.idleAction.reset().setLoop(THREE.LoopRepeat, Infinity).play();

    this.currentAction = this.idleAction;

    /*
     * Apply the first idle frame immediately.
     * This keeps far NPCs in a proper idle pose
     * even while their mixer is paused.
     */
    this.mixer.update(0);
  }

  play(animation: NpcTalkAnimation): void {
    const nextAction = this.talkingActions.get(animation);

    if (!nextAction) {
      return;
    }

    this.transitionTo(nextAction);
  }

  playIdle(): void {
    this.transitionTo(this.idleAction);
  }

  update(delta: number): void {
    this.mixer.update(delta);
  }

  private transitionTo(
    nextAction: THREE.AnimationAction,

    fadeDuration = 0.2,
  ): void {
    if (nextAction === this.currentAction) {
      return;
    }

    this.currentAction.fadeOut(fadeDuration);

    nextAction
      .reset()
      .setLoop(THREE.LoopRepeat, Infinity)
      .fadeIn(fadeDuration)
      .play();

    this.currentAction = nextAction;
  }
}
