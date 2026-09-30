import * as THREE from "three";

import { ASSETS } from "../../loaders/AssetManifest";

export type NpcTalkAnimation = "talking_1" | "talking_2" | "talking_3";

export interface NpcDialogueLayer {
  text: string;

  animation: NpcTalkAnimation;
}

export type NpcDialogue = readonly NpcDialogueLayer[];
export interface NpcDefinition {
  id: string;

  name: string;

  company: string;

  asset: string;

  position: THREE.Vector3;

  rotationY?: number;

  scale?: number;

  dialogues: readonly NpcDialogue[];
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
        {
          text: "Oh, you found me.",
          animation: "talking_1",
        },

        {
          text: "This part of the world represents Abdelrahman's time at Interphase.",
          animation: "talking_2",
        },

        {
          text: "There's a lot more to this story, but we'll save that for the real testimonial.",
          animation: "talking_3",
        },
      ],

      [
        {
          text: "Welcome to the Interphase corner.",
          animation: "talking_1",
        },

        {
          text: "You should probably keep exploring.",
          animation: "talking_2",
        },

        {
          text: "Some of the interesting work is hiding around here.",
          animation: "talking_3",
        },
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
        {
          text: "Oh, you found me.",
          animation: "talking_1",
        },

        {
          text: "This part of the world represents Abdelrahman's time at Interphase.",
          animation: "talking_2",
        },

        {
          text: "There's a lot more to this story, but we'll save that for the real testimonial.",
          animation: "talking_3",
        },
      ],

      [
        {
          text: "Welcome to the Interphase corner.",
          animation: "talking_1",
        },

        {
          text: "You should probably keep exploring.",
          animation: "talking_2",
        },

        {
          text: "Some of the interesting work is hiding around here.",
          animation: "talking_3",
        },
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
        {
          text: "Oh, you found me.",
          animation: "talking_1",
        },

        {
          text: "This part of the world represents Abdelrahman's time at Interphase.",
          animation: "talking_2",
        },

        {
          text: "There's a lot more to this story, but we'll save that for the real testimonial.",
          animation: "talking_3",
        },
      ],

      [
        {
          text: "Welcome to the Interphase corner.",
          animation: "talking_1",
        },

        {
          text: "You should probably keep exploring.",
          animation: "talking_2",
        },

        {
          text: "Some of the interesting work is hiding around here.",
          animation: "talking_3",
        },
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
        {
          text: "Oh, you found me.",
          animation: "talking_1",
        },

        {
          text: "This part of the world represents Abdelrahman's time at Interphase.",
          animation: "talking_2",
        },

        {
          text: "There's a lot more to this story, but we'll save that for the real testimonial.",
          animation: "talking_3",
        },
      ],

      [
        {
          text: "Welcome to the Interphase corner.",
          animation: "talking_1",
        },

        {
          text: "You should probably keep exploring.",
          animation: "talking_2",
        },

        {
          text: "Some of the interesting work is hiding around here.",
          animation: "talking_3",
        },
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
        {
          text: "Oh, you found me.",
          animation: "talking_1",
        },

        {
          text: "This part of the world represents Abdelrahman's time at Interphase.",
          animation: "talking_2",
        },

        {
          text: "There's a lot more to this story, but we'll save that for the real testimonial.",
          animation: "talking_3",
        },
      ],

      [
        {
          text: "Welcome to the Interphase corner.",
          animation: "talking_1",
        },

        {
          text: "You should probably keep exploring.",
          animation: "talking_2",
        },

        {
          text: "Some of the interesting work is hiding around here.",
          animation: "talking_3",
        },
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
        {
          text: "Oh, you found me.",
          animation: "talking_1",
        },

        {
          text: "This part of the world represents Abdelrahman's time at Interphase.",
          animation: "talking_2",
        },

        {
          text: "There's a lot more to this story, but we'll save that for the real testimonial.",
          animation: "talking_3",
        },
      ],

      [
        {
          text: "Welcome to the Interphase corner.",
          animation: "talking_1",
        },

        {
          text: "You should probably keep exploring.",
          animation: "talking_2",
        },

        {
          text: "Some of the interesting work is hiding around here.",
          animation: "talking_3",
        },
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
        {
          text: "Oh, you found me.",
          animation: "talking_1",
        },

        {
          text: "This part of the world represents Abdelrahman's time at Interphase.",
          animation: "talking_2",
        },

        {
          text: "There's a lot more to this story, but we'll save that for the real testimonial.",
          animation: "talking_3",
        },
      ],

      [
        {
          text: "Welcome to the Interphase corner.",
          animation: "talking_1",
        },

        {
          text: "You should probably keep exploring.",
          animation: "talking_2",
        },

        {
          text: "Some of the interesting work is hiding around here.",
          animation: "talking_3",
        },
      ],
    ],
  },
];
