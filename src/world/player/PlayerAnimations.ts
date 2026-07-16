import * as THREE from "three";

export class PlayerAnimations {
  private actions = new Map<string, THREE.AnimationAction>();

  private currentAction?: THREE.AnimationAction;

  constructor(private mixer: THREE.AnimationMixer) {}

  add(name: string, clip: THREE.AnimationClip) {
    const action = this.mixer.clipAction(clip);

    this.actions.set(name, action);
  }

  play(name: string) {
    const nextAction = this.actions.get(name);

    if (!nextAction) return;

    if (nextAction === this.currentAction) return;

    this.currentAction?.fadeOut(0.2);
    nextAction.reset().fadeIn(0.2).play();

    this.currentAction = nextAction;
  }
}
