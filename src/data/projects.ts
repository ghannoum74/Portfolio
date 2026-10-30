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
      "A real-time 3D solar system built with React Three Fiber. The planets and the Moon follow animated orbits, and selecting any body moves the camera to it and opens its key facts.",
    highlights: [
      "Animated orbits for the planets and the Moon",
      "Click-to-focus camera with GSAP transitions",
      "Fact panel for every planet and the Moon",
    ],
    technologies: [
      "React",
      "TypeScript",
      "Three.js",
      "React Three Fiber",
      "WebGL",
      "GSAP",
    ],
    screenshot: "/assets/projects/solar-system.webp",
    projectUrl: "https://galaxymilkyway.netlify.app",
    githubUrl: "https://github.com/ghannoum74/3js_solarSystem",
  },
  {
    id: "project-two",
    title: "Sudoku",
    subtitle: "Play a puzzle, build a board or explore the solver",
    description:
      "A full-stack Sudoku game with four difficulty levels, hints and a timer. Custom boards are solved with a backtracking algorithm, game state lives in Redux Toolkit, and scores are saved through a Node and MongoDB API.",
    highlights: [
      "Four difficulty levels with hints and a timer",
      "Backtracking solver for custom boards",
      "Experimental image import using OpenCV and OCR",
    ],
    technologies: [
      "React",
      "TypeScript",
      "Redux Toolkit",
      "Node.js",
      "Express",
      "MongoDB",
      "OpenCV",
      "Tesseract.js",
    ],
    screenshot: "/assets/projects/sudoku.webp",
    projectUrl: "https://sudoku-mern.netlify.app",
    githubUrl: "https://github.com/ghannoum74/SUDOKU_REACT_TS",
  },
  {
    id: "project-three",
    title: "University Website",
    subtitle: "A responsive education website prototype",
    description:
      "A responsive university website prototype in React, with programme sections, a campus gallery and scroll animations. The contact form is validated on the client and submits to an Express API backed by MongoDB.",
    highlights: [
      "Programme sections and campus gallery",
      "Scroll animations and video overlay",
      "Validated contact form posting to an Express API",
    ],
    technologies: [
      "React",
      "JavaScript",
      "Node.js",
      "Express",
      "MongoDB",
      "REST API",
    ],
    screenshot: "/assets/projects/university.webp",
    projectUrl: "https://universityprojectofficial.netlify.app",
    githubUrl: "https://github.com/ghannoum74/universityProject_MERN.client",
  },
];
