import * as THREE from "three";

import { ASSETS } from "../../loaders/AssetManifest";

export interface NpcDefinition {
  id: string;

  name: string;

  company: string;

  asset: string;

  scale?: number;

  dialogues: readonly (readonly string[])[];
}

export const NPC_DEFINITIONS: readonly NpcDefinition[] = [
  {
    id: "interphase",
    name: "Interphase Teammate",
    company: "Interphase",
    asset: ASSETS.characters.interphase,

    dialogues: [
      [
        "Oh, you found me.",
        "This part of the world represents Abdelrahman's time at Interphase.",
        "There's a lot more to this story, but we'll save that for the real testimonial.",
      ],

      [
        "Welcome to the Interphase corner.",
        "You should probably keep exploring.",
        "Some of the interesting work is hiding around here.",
      ],
    ],
  },

  {
    id: "prodigy",
    name: "Prodigy Teammate",
    company: "Prodigy Infotech",
    asset: ASSETS.characters.prodigy,

    dialogues: [
      [
        "Hey there.",
        "You've reached the Prodigy part of the journey.",
        "This dialogue is temporary, but later I'll tell you about the work done here.",
      ],
    ],
  },

  {
    id: "se-factory",
    name: "SE Factory Mentor",
    company: "SE Factory",
    asset: ASSETS.characters.seFactory,

    dialogues: [
      [
        "So you made it this far.",
        "This character represents another chapter of the developer journey.",
        "Eventually this conversation will tell the actual story.",
      ],
    ],
  },

  {
    id: "42",
    name: "42 Student",
    company: "42",
    asset: ASSETS.characters.fortyTwo,

    dialogues: [
      [
        "No teachers. No lectures.",
        "Just problems waiting to be solved.",
        "Sounds suspiciously like a developer's natural habitat.",
      ],
    ],
  },

  {
    id: "frequenc",
    name: "Frequenc Teammate",
    company: "Frequenc",
    asset: ASSETS.characters.frequenc,

    dialogues: [
      [
        "You've discovered the Frequenc character.",
        "For now I'm mostly here to test the dialogue system.",
        "Later, I'll have something much more interesting to say.",
      ],
    ],
  },

  {
    id: "bepro",
    name: "bePro Teammate",
    company: "bePro",
    asset: ASSETS.characters.bePro,

    dialogues: [
      [
        "Hello traveler.",
        "You're currently talking to placeholder dialogue.",
        "Don't worry. I have been promised a better script later.",
      ],
    ],
  },

  {
    id: "mtc",
    name: "MTC Teammate",
    company: "MTC",
    asset: ASSETS.characters.mtc,

    dialogues: [
      [
        "Ah. A visitor.",
        "This is another stop in the portfolio world.",
        "The final story for this character is still being written.",
      ],
    ],
  },
];

export const NPC_SPAWN_POINTS: readonly THREE.Vector3[] = [
  new THREE.Vector3(13, 7.8, -4.8),
  new THREE.Vector3(7, 3, 6),
  new THREE.Vector3(-12, 3, -4),
  new THREE.Vector3(10, 3, -8),
  new THREE.Vector3(-3, 3, -13),
  new THREE.Vector3(13, 3, 1),
  new THREE.Vector3(3, 3, 12),
];
