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
    screenshot: "/assets/projects/project-one.png",
    projectUrl: "https://galaxymilkyway.netlify.app",
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
    screenshot: "/assets/projects/project-two.png",
    projectUrl: "https://sudoku-mern.netlify.app",
  },
  {
    id: "project-three",
    title: "Your Third Project",
    subtitle: "A third short project tagline",
    description:
      "Replace this sample entry with information about another real project.",
    highlights: ["Core challenge", "Interesting solution"],
    technologies: ["React", "Node.js"],
    screenshot: "/assets/projects/project-two.png",
    projectUrl: "https://universityprojectofficial.netlify.app",
  },
  {
    id: "project-four",
    title: "Your Fourth Project",
    subtitle: "A fourth short project tagline",
    description:
      "Replace this sample entry with information about another real project.",
    highlights: ["Core challenge", "Interesting solution"],
    technologies: ["React", "Node.js"],
    screenshot: "/assets/projects/project-two.png",
    projectUrl: "https://universityprojectofficial.netlify.app",
  },
];
