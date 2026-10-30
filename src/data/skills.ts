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
    name: "Frontend Development",
    description: "I build web interfaces with React, Next.js and Angular. My work includes dashboards, calendars and forms, with attention to responsive layouts and clear interaction states.",
    technologies: ["TypeScript", "React", "Next.js", "Angular", "SCSS"],
    note: "I care about how an interface behaves as much as how it looks.",
    artifact: "The Runestone",
  },
  {
    id: "systems-logic",
    eyebrow: "02 / UNDER THE HOOD",
    name: "Backend & Data",
    description: "I build APIs with NestJS and Express and work with SQL and MongoDB. In healthcare software, my work includes TypeORM models, entity relationships and tenant-aware data isolation.",
    technologies: ["NestJS", "Node.js", "Express", "SQL", "MongoDB", "TypeORM"],
    note: "Clear data models make features easier to build and maintain.",
    artifact: "The Clockwork Core",
  },
  {
    id: "creative-worlds",
    eyebrow: "03 / BUILDING WORLDS",
    name: "Interactive 3D",
    description: "I use Three.js, React Three Fiber and Blender to build browser-based 3D experiences. The Solar System Explorer and this portfolio are two ways I put those tools into practice.",
    technologies: ["Three.js", "React Three Fiber", "Blender", "GSAP", "WebGL"],
    note: "A different way to make the web worth exploring.",
    artifact: "The Living Blueprint",
  },
  {
    id: "developer-tools",
    eyebrow: "04 / KEEPING THE COURSE",
    name: "Deployment & Reporting",
    description: "I deploy Node and NestJS services on AWS EC2, manage application configuration and work with Git. My reporting work also includes SQL, data-quality checks and Amazon QuickSight.",
    technologies: ["AWS EC2", "S3", "Git", "GitHub", "SQL", "QuickSight"],
    note: "The work continues after the first deployment.",
    artifact: "The Navigator",
  },
];

/** Backwards-compatible export for any older files still using the prototype. */
export const FIRST_WORKSHOP_SKILL = WORKSHOP_SKILLS[0];
