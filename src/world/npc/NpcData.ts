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
    id: "frequenc",
    name: "Frequenc Teammate",
    company: "Frequenc",
    asset: ASSETS.characters.frequenc,
    position: new THREE.Vector3(2.5, 12.5, 5),
    rotationY: Math.PI,
    scale: 1.3,
    dialogues: [
      [
        {
          text: "There you are! You've reached the big one. Frequenc. Grab a seat, this is where he levels up from developer to engineer.",
          animation: "talking_1",
        },
        {
          text: "We run a SaaS event management platform, and he owns it end to end: frontend, backend, deployment. He designs the backend in NestJS with modular architecture and dependency injection, so features stay isolated and testable.",
          animation: "talking_2",
        },
        {
          text: "He thinks in system design. Scalability, security, performance and how each change affects the whole system, not just the ticket in front of him.",
          animation: "talking_3",
        },
        {
          text: "Infrastructure too. He deploys and runs our Node and NestJS services handling security groups, environment configuration and automated deployments. No throwing code over the wall.",
          animation: "talking_1",
        },
        {
          text: "And here's the part I respect most: he runs our pull request flow. Every PR goes through his review for code quality, patterns and risk before it merges.",
          animation: "talking_2",
        },
        {
          text: "He also breaks down the work and assigns tasks across the team, so everyone knows what to build and why. He keeps the team moving and the codebase clean at the same time.",
          animation: "talking_3",
        },
      ],
    ],
  },
  {
    id: "mtc",
    name: "Medical Platform Teammate",
    company: "Medicals at the Center",
    asset: ASSETS.characters.mtc,
    position: new THREE.Vector3(13, 7.8, -4.8),
    rotationY: -Math.PI / 4,
    scale: 1.3,
    dialogues: [
      [
        {
          text: "Welcome! Quiet here, but don't be fooled. We build a medical platform, and he's part of the team on top of his full-time job.",
          animation: "talking_1",
        },
        {
          text: "On the backend he designs scalable APIs and a relational data model with TypeORM, with clean entity relationships and domain-driven thinking so the schema reflects the real business.",
          animation: "talking_2",
        },
        {
          text: "The hard part is multi-tenancy. He built tenant-aware data isolation, so one organization can never see another's data. In healthcare that's non-negotiable.",
          animation: "talking_3",
        },
        {
          text: "Security, data integrity and maintainability decide everything here. He's the kind of engineer you trust with that. And that's the whole journey, so thanks for walking it!",
          animation: "talking_1",
        },
      ],
    ],
  },

  {
    id: "prodigy",
    name: "Prodigy Guide",
    company: "Prodigy InfoTech",
    asset: ASSETS.characters.prodigy,
    position: new THREE.Vector3(10, 3, -8),
    rotationY: 0,
    dialogues: [
      [
        {
          text: "Oh, a visitor! I'm guessing you're curious how he got so comfortable across the whole stack. This is where that started.",
          animation: "talking_1",
        },
        {
          text: "Prodigy InfoTech was his full-stack training ground: REST APIs, databases, frontend integration, and getting an application from an idea to something actually running.",
          animation: "talking_2",
        },
        {
          text: "He didn't stop there. He kept stacking deep dives on the side: Next.js, React, Three.js (yes, the engine behind this very world) and Java with OOP principles.",
          animation: "talking_3",
        },
        {
          text: "Fun fact: you're standing inside something he built with those skills. Keep exploring!",
          animation: "talking_1",
        },
      ],
    ],
  },

  {
    id: "se-factory",
    name: "SE Factory Mentor",
    company: "SE Factory",
    asset: ASSETS.characters.seFactory,
    position: new THREE.Vector3(4, 3, 22),
    rotationY: Math.PI,
    dialogues: [
      [
        {
          text: "Welcome, traveler. This is where the foundations were laid. SE Factory, 2024.",
          animation: "talking_1",
        },
        {
          text: "Before frameworks and cloud, there was computer science. Data structures, algorithms, complexity, how things work under the hood.",
          animation: "talking_2",
        },
        {
          text: "Frameworks change every year. Fundamentals don't. That's why he can pick up a new stack fast and still make sound decisions in it.",
          animation: "talking_3",
        },
        {
          text: "Every good engineer I've met has a solid base. He built his here. Now go see what he built on top of it.",
          animation: "talking_1",
        },
      ],
    ],
  },

  {
    id: "42",
    name: "42 Peer",
    company: "42 Beirut",
    asset: ASSETS.characters.fortyTwo,
    position: new THREE.Vector3(16.5, 3, 7.5),
    rotationY: Math.PI,
    scale: 1.3,
    dialogues: [
      [
        {
          text: "Hey, new face! Careful, this is 42. No teachers, no lectures. Just you, a problem and whoever's sitting next to you.",
          animation: "talking_1",
        },
        {
          text: "Abdelrahman spent four brutal weeks in C. Pointers, manual memory management, algorithms, no safety net and no garbage collector to bail him out.",
          animation: "talking_2",
        },
        {
          text: "When your program segfaults at 2 a.m., you learn to debug systematically. You read, you trace, you reason about memory instead of guessing.",
          animation: "talking_3",
        },
        {
          text: "That mindset never left him. It's why he's calm when production acts up. Good luck out there!",
          animation: "talking_1",
        },
      ],
    ],
  },

  {
    id: "bepro",
    name: "bePro Collaborator",
    company: "bePro",
    asset: ASSETS.characters.bePro,
    position: new THREE.Vector3(13, 3, 17),
    rotationY: Math.PI,
    dialogues: [
      [
        {
          text: "Ah, you found bePro! This was his freelance-style chapter. Client projects, real deadlines, real expectations.",
          animation: "talking_1",
        },
        {
          text: "Here he wasn't just a developer on a ticket. He was the whole delivery pipeline: requirements, architecture, frontend, backend, deployment, all on his own.",
          animation: "talking_2",
        },
        {
          text: "Every client had a different problem, so he had to pick the right tools and structure for each one. Web apps, mobile apps, different stacks. That's trade-off thinking, not copy-paste coding.",
          animation: "talking_3",
        },
        {
          text: "That's where full ownership clicked for him. When it's your project, you care about performance, scalability and maintenance before anyone asks. Ready for the next one?",
          animation: "talking_1",
        },
      ],
    ],
  },
  {
    id: "interphase",
    name: "Interphase Teammate",
    company: "Interphase",
    asset: ASSETS.characters.interphase,
    position: new THREE.Vector3(7.5, 3, 12),
    rotationY: Math.PI,
    dialogues: [
      [
        {
          text: "Hey, you made it all the way up here! Welcome to Interphase. Abdelrahman and I shipped the Populus platform together.",
          animation: "talking_1",
        },
        {
          text: "He owned the Angular frontend. Dashboards, Kanban boards, calendars. Those screens are state-heavy, so he split them into reusable, component-driven modules instead of one-off pages.",
          animation: "talking_2",
        },
        {
          text: "Everything was responsive and accessible, too. He treated accessibility as a requirement from day one, not a cleanup task at the end.",
          animation: "talking_3",
        },
        {
          text: "That's where he learned what production frontend really means: clean architecture, maintainable UI and real users depending on it. Go on, the next stop is where it gets fun.",
          animation: "talking_1",
        },
      ],
    ],
  },
];
