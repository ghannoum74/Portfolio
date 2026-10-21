/** Text displayed by the real, interactive workshop artifacts. */
export interface WorkshopSkill {
  readonly id: string;
  readonly eyebrow: string;
  readonly name: string;
  readonly description: string;
  readonly technologies: readonly string[];
  readonly note: string;
  readonly artifact: string;
}

export const WORKSHOP_SKILLS: readonly WorkshopSkill[] = [
  {
    id: "interface-craft",
    eyebrow: "01 / THE INTERFACE",
    name: "Interface Craft",
    description: "Interfaces built to feel clear, responsive and human. I care about the small interactions as much as the screen they live on.",
    technologies: ["TypeScript", "Angular", "React", "CSS"],
    note: "A little light, a lot of attention to detail.",
    artifact: "The Runestone",
  },
  {
    id: "systems-logic",
    eyebrow: "02 / UNDER THE HOOD",
    name: "Systems & Logic",
    description: "The parts you don't always see: APIs, databases, application logic and the structure that keeps everything working.",
    technologies: ["Node.js", "Express", "MongoDB", "SQL"],
    note: "Good systems should make complexity feel simple.",
    artifact: "The Clockwork Core",
  },
  {
    id: "creative-worlds",
    eyebrow: "03 / BUILDING WORLDS",
    name: "Creative Engineering",
    description: "Bringing scenes to life with models, lighting, motion and real-time interaction — just like the world you're exploring now.",
    technologies: ["Three.js", "Blender", "WebGL", "Shaders"],
    note: "Code can be a place you explore.",
    artifact: "The Living Blueprint",
  },
  {
    id: "developer-tools",
    eyebrow: "04 / KEEPING THE COURSE",
    name: "The Developer's Kit",
    description: "The everyday tools behind building, shipping and maintaining projects, from version control to deployment and cloud workflows.",
    technologies: ["Git", "GitHub", "AWS", "Deployment"],
    note: "Make it work. Make it reliable. Keep improving it.",
    artifact: "The Navigator",
  },
];

/** Backwards-compatible export for any older files still using the prototype. */
export const FIRST_WORKSHOP_SKILL = WORKSHOP_SKILLS[0];
