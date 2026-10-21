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
    date: "MAR 2024",
    title: "The First Trials",
    description: "42 Beirut Piscine — four weeks of intensive coding, challenges and peer learning. Certificate of participation awarded March 9, 2024.",
    details: ["42 Beirut", "Problem solving", "Peer learning"],
  },
  {
    id: "se-factory",
    date: "JUL 2024",
    title: "The Foundations",
    description: "Completed SE Factory's Foundations of Computer Science course on July 7, 2024.",
    details: ["SE Factory", "Computer science", "Foundations"],
  },
  {
    id: "web-dev",
    date: "THE CRAFT",
    title: "Building for the Web",
    description: "Putting those foundations into practice through frontend and full-stack application development.",
    details: ["Angular", "MERN", "Web applications"],
  },
  {
    id: "world-builder",
    date: "THE PRESENT",
    title: "A World of My Own",
    description: "Combining Three.js, Blender and interaction design to turn this portfolio into a world visitors can explore.",
    details: ["Three.js", "Blender", "Creative development"],
  },
];
