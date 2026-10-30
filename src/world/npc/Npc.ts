import * as THREE from "three";

import type { NpcDialogue } from "./NpcData";
import { NpcAnimator } from "./NpcAnimator";
import type { NpcCollider } from "./NpcCollider";

export interface Npc {
  id: string;

  name: string;

  company: string;

  model: THREE.Group;

  dialogues: readonly NpcDialogue[];

  animator: NpcAnimator;

  shadowMeshes: THREE.Mesh[];

  shadowsEnabled: boolean;

  collision: NpcCollider | null;
}
