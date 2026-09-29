import * as THREE from "three";
import type { Interactable } from "../Interactable";
import { PaperPanel } from "../../ui/PaperPanel/PaperPanel";

export class MailboxInteraction implements Interactable {
  readonly interactionDistance: number = 2;

  readonly position = new THREE.Vector3();

  readonly highlightTarget: THREE.Object3D;

  constructor(
    mailbox: THREE.Object3D,
    private readonly paperPanel: PaperPanel,
    private readonly content: DocumentFragment,
  ) {
    this.highlightTarget = mailbox;

    mailbox.getWorldPosition(this.position);
  }

  getHint(): string {
    return "Open the mailbox";
  }

  interact(): void {
    this.paperPanel.open(
      this.content.cloneNode(true) as DocumentFragment,
      "Mailbox letter",
    );
  }
}
