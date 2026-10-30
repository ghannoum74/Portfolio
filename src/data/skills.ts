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
    description:
      "React, Next.js and Angular applications, mostly dashboards, calendars and forms with a lot of moving parts. Components stay small and reusable, state is handled deliberately, and every screen has proper loading, error and empty states. Layouts hold up from phone to desktop.",
    technologies: [
      "TypeScript",
      "React",
      "Next.js",
      "Angular",
      "RxJS",
      "SCSS",
      "Tailwind CSS",
      "Jest",
    ],
    note: "How an interface behaves matters as much as how it looks.",
    artifact: "The Runestone",
  },
  {
    id: "systems-logic",
    eyebrow: "02 / UNDER THE HOOD",
    name: "Backend & Data",
    description:
      "REST APIs built with NestJS and Express on top of SQL and MongoDB. In healthcare software, that meant TypeORM models with real entity relationships, tenant-aware data isolation, and authentication with role-based access handled in the service layer.",
    technologies: [
      "NestJS",
      "Node.js",
      "Express",
      "PostgreSQL",
      "SQL",
      "MongoDB",
      "TypeORM",
      "REST APIs",
      "JWT",
    ],
    note: "Clear data models make features easier to build and maintain.",
    artifact: "The Clockwork Core",
  },
  {
    id: "creative-worlds",
    eyebrow: "03 / BUILDING WORLDS",
    name: "Interactive 3D",
    description:
      "Browser-based 3D with Three.js and React Three Fiber, with models made in Blender and motion driven by GSAP. That covers scene setup, lighting, custom shaders, camera movement and keeping the render loop fast. The Solar System Explorer and this portfolio both come from that.",
    technologies: [
      "Three.js",
      "React Three Fiber",
      "WebGL",
      "GLSL",
      "Blender",
      "GSAP",
      "glTF",
    ],
    note: "A different way to make the web worth exploring.",
    artifact: "The Living Blueprint",
  },
  {
    id: "developer-tools",
    eyebrow: "04 / KEEPING THE COURSE",
    name: "Deployment & Reporting",
    description:
      "Node and NestJS services deployed on AWS EC2 behind Nginx, with PM2 running the processes, config kept out of the code, and Git and GitHub for version control. On the reporting side, SQL queries, data-quality checks and Amazon QuickSight dashboards.",
    technologies: [
      "AWS EC2",
      "S3",
      "Nginx",
      "PM2",
      "Git",
      "GitHub",
      "GitHub Actions",
      "SQL",
      "QuickSight",
    ],
    note: "The work continues after the first deployment.",
    artifact: "The Navigator",
  },
];
/** Backwards-compatible export for any older files still using the prototype. */
export const FIRST_WORKSHOP_SKILL = WORKSHOP_SKILLS[0];
