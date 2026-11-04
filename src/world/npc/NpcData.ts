import * as THREE from "three";

import { ASSETS } from "../../loaders/AssetManifest";
import type { NpcCapsuleDefinition } from "./NpcCollider";

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

  collision: NpcCapsuleDefinition;

  dialogues: readonly NpcDialogue[];
}

// Local-space capsules measured against the current GLBs in their initial idle
// pose. They are physics-only and do not depend on world.blend or extra meshes.
export const NPC_DEFINITIONS: readonly NpcDefinition[] = [
  {
    id: "frequenc",
    name: "Frequenc · Career Guide",
    company: "Frequenc",
    asset: ASSETS.characters.frequenc,
    collision: { radius: 0.22, height: 1.311, center: [0, 0.674, 0] },
    position: new THREE.Vector3(2.5, 12.5, 5),
    rotationY: Math.PI,
    scale: 1.3,
    dialogues: [
      [
        {
          text: "This stop covers my work at Frequenc, where I joined as a Full Stack Developer in July 2025.",
          animation: "talking_1",
        },
        {
          text: "I work across the frontend and backend of a SaaS event management platform, building features with the team and maintaining the application.",
          animation: "talking_2",
        },
        {
          text: "My work also includes deploying Node and NestJS services on AWS EC2, with security groups, environment configuration and automated deployments.",
          animation: "talking_3",
        },
        {
          text: "Working across the stack means considering how the interface, API and infrastructure fit together, including performance, security and maintainability.",
          animation: "talking_1",
        },
      ],
    ],
  },
  {
    id: "mtc",
    name: "Healthcare · Career Guide",
    company: "Medicals at the Center",
    asset: ASSETS.characters.mtc,
    collision: { radius: 0.235, height: 1.407, center: [0, 0.744, -0.009] },
    position: new THREE.Vector3(13, 7.8, -4.8),
    rotationY: -Math.PI / 4,
    scale: 1.3,
    dialogues: [
      [
        {
          text: "Since December 2025, I have worked part-time as a Full Stack Developer with Medicals at the Center, alongside my role at Frequenc.",
          animation: "talking_1",
        },
        {
          text: "I build APIs and end-to-end features, and model data with TypeORM, including the relationships between entities.",
          animation: "talking_2",
        },
        {
          text: "My work includes tenant-aware data isolation: keeping each organization’s information separate within a shared application.",
          animation: "talking_3",
        },
        {
          text: "In healthcare software, careful data modeling and attention to security are part of the everyday development work.",
          animation: "talking_1",
        },
      ],
    ],
  },

  {
    id: "prodigy",
    name: "Training · Learning Guide",
    company: "Prodigy InfoTech",
    asset: ASSETS.characters.prodigy,
    collision: { radius: 0.312, height: 1.871, center: [0, 0.980, 0.023] },
    position: new THREE.Vector3(10, 3, -8),
    rotationY: 0,
    dialogues: [
      [
        {
          text: "This stop is about continued learning. My training includes a full-stack internship with Prodigy InfoTech.",
          animation: "talking_1",
        },
        {
          text: "I have also taken courses in React, Next.js, Three.js and Java with object-oriented programming.",
          animation: "talking_2",
        },
        {
          text: "Personal projects help me put that learning into practice. Inside the cottage, the Projects Book links to three examples you can try yourself.",
          animation: "talking_3",
        },
      ],
    ],
  },

  {
    id: "se-factory",
    name: "SE Factory · Learning Guide",
    company: "SE Factory",
    asset: ASSETS.characters.seFactory,
    collision: { radius: 0.32, height: 1.922, center: [0, 0.989, 0] },
    position: new THREE.Vector3(4, 3, 22),
    rotationY: Math.PI,
    dialogues: [
      [
        {
          text: "From April to July 2024, I attended SE Factory’s foundations programme.",
          animation: "talking_1",
        },
        {
          text: "It helped strengthen my programming and problem-solving foundations before I moved into professional web development.",
          animation: "talking_2",
        },
        {
          text: "The journey map inside the cottage connects this training with my later frontend and full-stack roles.",
          animation: "talking_3",
        },
      ],
    ],
  },

  {
    id: "42",
    name: "42 Beirut · Learning Guide",
    company: "42 Beirut",
    asset: ASSETS.characters.fortyTwo,
    collision: { radius: 0.264, height: 1.584, center: [0, 0.842, -0.005] },
    position: new THREE.Vector3(16.5, 3, 7.5),
    rotationY: Math.PI,
    scale: 1.3,
    dialogues: [
      [
        {
          text: "In February–March 2024, I took part in the four-week C Piscine at 42 Beirut.",
          animation: "talking_1",
        },
        {
          text: "The work covered C functions, pointers, memory management and algorithms, with a strong emphasis on solving problems and learning with peers.",
          animation: "talking_2",
        },
        {
          text: "It gave me practice reading unfamiliar code, tracing errors and working through a problem step by step.",
          animation: "talking_3",
        },
      ],
    ],
  },

  {
    id: "bepro",
    name: "BePro · Career Guide",
    company: "bePro",
    asset: ASSETS.characters.bePro,
    collision: { radius: 0.284, height: 1.704, center: [0, 0.877, 0.046] },
    position: new THREE.Vector3(13, 3, 17),
    rotationY: Math.PI,
    dialogues: [
      [
        {
          text: "From June to November 2025, I worked with BePro as a Full Stack Developer on a project basis.",
          animation: "talking_1",
        },
        {
          text: "I delivered custom web and mobile applications, working from requirements through development and deployment.",
          animation: "talking_2",
        },
        {
          text: "That meant connecting the different parts of an application and keeping the original requirements in view throughout delivery.",
          animation: "talking_3",
        },
      ],
    ],
  },
  {
    id: "interphase",
    name: "Interphase · Career Guide",
    company: "Interphase",
    asset: ASSETS.characters.interphase,
    collision: { radius: 0.312, height: 1.871, center: [0, 1.004, 0.044] },
    position: new THREE.Vector3(7.5, 3, 12),
    rotationY: Math.PI,
    dialogues: [
      [
        {
          text: "From February to July 2025, I worked as a Front End Developer at Interphase in Tripoli.",
          animation: "talking_1",
        },
        {
          text: "I built Angular and SCSS interfaces for Populus, including dashboards, Kanban boards and calendars.",
          animation: "talking_2",
        },
        {
          text: "The work involved responsive layouts and accessibility, alongside the practical details of building and maintaining interactive screens.",
          animation: "talking_3",
        },
      ],
    ],
  },
];
