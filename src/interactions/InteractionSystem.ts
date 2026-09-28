import * as THREE from "three";
import type { Interactable } from "./Interactable";
import { InteractionHint } from "../ui/InteractionHint/InteractionHint";

export class InteractionSystem {
  private readonly interactables: Interactable[] = [];

  private active: Interactable | null = null;

  private readonly hint = new InteractionHint();

  register(interactable: Interactable): void {
    this.interactables.push(interactable);
  }

  update(playerPositin: THREE.Vector3): void {
    let closest: Interactable | null = null;
    let closesDistance = Infinity;

    for (const interactable of this.interactables) {
      const distance = playerPositin.distanceTo(interactable.position);

      if (
        distance <= interactable.interactionDistance &&
        distance < closesDistance
      ) {
        closest = interactable;
        closesDistance = distance;
      }
    }

    this.active = closest;

    if (this.active) {
      this.hint.show(this.active.getHint());
    } else {
      this.hint.hide();
    }
  }

  interact(): void {
    this.active?.interact();
  }
}
