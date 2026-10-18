export interface PortfolioProject {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  highlights: string[];
  technologies: string[];
  screenshot: string;
  projectUrl: string;
  demoUrl?: string;
  githubUrl?: string;
}

export const PROJECTS: PortfolioProject[] = [
  {
    id: "project-one",
    title: "Your First Project",
    subtitle: "A short project tagline",
    description:
      "Replace this with what you built, what problem it solves, and your contribution.",
    highlights: ["Key feature one", "Key feature two", "Something you learned"],
    technologies: ["TypeScript", "Three.js"],
    screenshot: "/assets/projects/project-one.webp",
    projectUrl: "/projects/project-one",
    // githubUrl: 'https://github.com/...',
    // demoUrl: 'https://...',
  },
  {
    id: "project-two",
    title: "Your Second Project",
    subtitle: "Another short project tagline",
    description:
      "Replace this sample entry with information about another real project.",
    highlights: ["Core challenge", "Interesting solution"],
    technologies: ["React", "Node.js"],
    screenshot: "/assets/projects/project-two.webp",
    projectUrl: "/projects/project-two",
  },
];
