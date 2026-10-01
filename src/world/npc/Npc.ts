import * as THREE from "three";

import type { NpcDialogue } from "./NpcData";
import { NpcAnimator } from "./NpcAnimator";

export interface Npc {
  id: string;

  name: string;

  company: string;

  model: THREE.Group;

  dialogues: readonly NpcDialogue[];

  animator: NpcAnimator;

  shadowMeshes: THREE.Mesh[];

  shadowsEnabled: boolean;
}
