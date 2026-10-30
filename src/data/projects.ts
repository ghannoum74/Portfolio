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
    title: "Solar System Explorer",
    subtitle: "An interactive journey through the solar system",
    description:
      "A 3D solar system built with React and React Three Fiber. Select the Sun, planets or Moon to explore their orbits and key facts.",
    highlights: ["Planets, Moon and animated orbits", "Click-to-focus camera and planet facts", "React Three Fiber and GSAP animation"],
    technologies: ["React", "TypeScript", "Three.js", "React Three Fiber", "GSAP"],
    screenshot: "/assets/projects/solar-system.webp",
    projectUrl: "https://galaxymilkyway.netlify.app",
    githubUrl: "https://github.com/ghannoum74/3js_solarSystem",
  },
  {
    id: "project-two",
    title: "Sudoku",
    subtitle: "Play a puzzle, build a board or explore the solver",
    description:
      "A Sudoku app with four difficulty levels, hints and a custom-board solver. I used React, TypeScript and Redux, with a Node API for saving scores.",
    highlights: ["Four difficulty levels, hints and timer", "Custom boards and backtracking solver", "Experimental image import with OCR"],
    technologies: ["React", "TypeScript", "Redux Toolkit", "Node.js", "MongoDB", "OpenCV", "Tesseract.js"],
    screenshot: "/assets/projects/sudoku.webp",
    projectUrl: "https://sudoku-mern.netlify.app",
    githubUrl: "https://github.com/ghannoum74/SUDOKU_REACT_TS",
  },
  {
    id: "project-three",
    title: "University Website",
    subtitle: "A responsive education website prototype",
    description:
      "A responsive university website prototype built with React. It combines programme information, a campus gallery and a validated contact form connected to a Node API.",
    highlights: ["Programme sections and campus gallery", "Scroll animations and video overlay", "Validated form with an Express API"],
    technologies: ["React", "JavaScript", "Node.js", "Express", "MongoDB"],
    screenshot: "/assets/projects/university.webp",
    projectUrl: "https://universityprojectofficial.netlify.app",
    githubUrl: "https://github.com/ghannoum74/universityProject_MERN.client",
  },
];
