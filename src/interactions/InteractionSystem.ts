import * as THREE from "three";
import type { Interactable } from "./Interactable";
import { InteractionHint } from "../ui/InteractionHint/InteractionHint";

export class InteractionSystem {
  private readonly interactables: Interactable[] = [];

  private active: Interactable | null = null;

  private readonly hint = new InteractionHint();

  constructor(
    private readonly onActiveChange?: (
      Interactable: Interactable | null,
    ) => void,
  ) {}

  register(interactable: Interactable): void {
    this.interactables.push(interactable);
  }

  get highlightTargets(): THREE.Object3D[] {
    return [...new Set(this.interactables.map(interactable => interactable.highlightTarget))];
  }

  get activeHint(): string | null { return this.active?.getHint() ?? null; }

  clear(): void {
    this.active = null;
    this.hint.hide();
    this.onActiveChange?.(null);
  }

  update(playerPositin: THREE.Vector3): void {
    let closest: Interactable | null = null;
    let closesDistance = Infinity;

    for (const interactable of this.interactables) {
      const distance = interactable.distanceTo?.(playerPositin) ?? playerPositin.distanceTo(interactable.position);

      if (
        distance <= interactable.interactionDistance &&
        distance < closesDistance
      ) {
        closest = interactable;
        closesDistance = distance;
      }
    }

    if (closest !== this.active) {
      this.active = closest;

      this.onActiveChange?.(this.active);
    }

    if (this.active) {
      this.hint.show(this.active.getHint());
    } else {
      this.hint.hide();
    }
  }

  interact(): void {
    if (!this.active) {
      return;
    }

    const active = this.active;

    this.active = null;

    this.onActiveChange?.(null);
    this.hint.hide();
    active.interact();
  }
}
