import * as THREE from "three";

export class PlayerAnimations {
  private actions = new Map<string, THREE.AnimationAction>();
  private lockedActionName?: string;
  private currentActionName?: string;
  private currentAction?: THREE.AnimationAction;

  constructor(private mixer: THREE.AnimationMixer) {
    this.mixer.addEventListener("finished", this.handleFinished);
  }

  add(
    name: string,
    clip: THREE.AnimationClip,
    loop?: THREE.AnimationActionLoopStyles,
  ) {
    const action = this.mixer.clipAction(clip);

    if (loop !== undefined) {
      action.setLoop(loop, Infinity);
    }
    this.actions.set(name, action);

    this.actions.set(name, action);
  }

  play(name: string) {
    if (this.lockedActionName && this.lockedActionName !== name) return;

    const nextAction = this.actions.get(name);

    if (!nextAction) return;

    if (nextAction === this.currentAction) return;

    this.currentAction?.fadeOut(0.2);
    nextAction.reset().fadeIn(0.2).play();

    this.currentAction = nextAction;
    this.currentActionName = name;
  }

  playOnce(name: string) {
    const nextAction = this.actions.get(name);

    if (!nextAction) return;

    this.lockedActionName = name;
    nextAction.setLoop(THREE.LoopOnce, 1);
    nextAction.clampWhenFinished = true;

    this.play(name);
  }

  isLocked() {
    return Boolean(this.lockedActionName);
  }

  private handleFinished = (event: THREE.Event) => {
    const action = (event as { action?: THREE.AnimationAction }).action;

    if (!action) return;

    if (action === this.currentAction) {
      this.lockedActionName = undefined;
    }

    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
  };
}
