import * as THREE from "three";

import type { Interactable } from "../Interactable";

import type { Npc } from "../../world/npc/Npc";

import { DialogueBox } from "../../ui/DialogueBox/DialogueBox";

export class NpcInteraction implements Interactable {
  readonly interactionDistance: number = 2.5;

  readonly position: THREE.Vector3 = new THREE.Vector3();

  readonly highlightTarget: THREE.Object3D<THREE.Object3DEventMap>;

  constructor(
    private readonly npc: Npc,
    private readonly dialogueBox: DialogueBox,
  ) {
    this.highlightTarget = npc.model;

    npc.model.getWorldPosition(this.position);
  }

  getHint(): string {
    return `Talk to ${this.npc.name}`;
  }

  interact(): void {
    const conversations = this.npc.dialogues;

    const conversation =
      conversations[Math.floor(Math.random() * conversations.length)];

    this.dialogueBox.open({
      speaker: this.npc.name,
      company: this.npc.company,
      lines: conversation,
      onLineChange: (index) => {
        const layer = conversation[index];

        this.npc.animator.play(layer.animation);
      },

      onClose: () => {
        this.npc.animator.stop();
      },
    });
  }
}
