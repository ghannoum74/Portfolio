import * as THREE from "three";

import { ASSETS } from "../../loaders/AssetManifest";

export interface NpcDefinition {
  id: string;

  name: string;

  company: string;

  asset: string;

  position: THREE.Vector3;

  rotationY?: number;

  scale?: number;

  dialogues: readonly (readonly string[])[];
}

export const NPC_DEFINITIONS: readonly NpcDefinition[] = [
  {
    id: "interphase",
    name: "Interphase Teammate",
    company: "Interphase",
    asset: ASSETS.characters.interphase,

    position: new THREE.Vector3(13, 7.8, -4.8),

    rotationY: 0,

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

    position: new THREE.Vector3(7, 3, 6),

    rotationY: 0,

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

    position: new THREE.Vector3(-12, 3, -4),

    rotationY: 0,

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

    position: new THREE.Vector3(10, 3, -8),

    rotationY: 0,

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

    position: new THREE.Vector3(-3, 3, -13),

    rotationY: 0,

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

    position: new THREE.Vector3(13, 3, 1),

    rotationY: 0,

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

    position: new THREE.Vector3(3, 3, 12),

    rotationY: 0,

    dialogues: [
      [
        "Ah. A visitor.",
        "This is another stop in the portfolio world.",
        "The final story for this character is still being written.",
      ],
    ],
  },
];
