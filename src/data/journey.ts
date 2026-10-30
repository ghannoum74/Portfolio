/** A symbolic route through real milestones, not a literal geographic map. */
export interface JourneyChapter {
  id: string;
  date: string;
  title: string;
  description: string;
  details: readonly string[];
}

export const JOURNEY_CHAPTERS: readonly JourneyChapter[] = [
  {
    id: "beirut-42",
    date: "2021–2024",
    title: "Building the foundations",
    description: "After technical studies in IT from 2021 to 2023, I joined 42 Beirut's four-week C Piscine in February–March 2024, then SE Factory's foundations programme from April to July 2024.",
    details: ["Technical studies", "42 Beirut", "SE Factory"],
  },
  {
    id: "se-factory",
    date: "FEB–JUL 2025",
    title: "Frontend work at Interphase",
    description: "At Interphase in Tripoli, I worked on Angular interfaces for Populus: dashboards, Kanban boards and calendars, with responsive layouts and accessibility in mind.",
    details: ["Interphase", "Angular", "Populus"],
  },
  {
    id: "web-dev",
    date: "JUN 2025–PRESENT",
    title: "Delivering across the stack",
    description: "I delivered project-based web and mobile applications with BePro from June to November 2025. In July 2025, I also joined Frequenc, working across its SaaS event platform and AWS deployments.",
    details: ["BePro", "Frequenc", "Full-stack delivery"],
  },
  {
    id: "world-builder",
    date: "DEC 2025–PRESENT",
    title: "Healthcare and interactive work",
    description: "Alongside Frequenc, I work part-time with Medicals at the Center on APIs, TypeORM data models and tenant-aware features. I also build interactive 3D projects, including this portfolio.",
    details: ["Medicals at the Center", "TypeORM", "Three.js"],
  },
];
