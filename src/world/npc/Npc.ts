import * as THREE from "three";

export interface Npc {
  id: string;

  name: string;

  company: string;

  model: THREE.Group;

  dialogues: readonly (readonly string[])[];
}
