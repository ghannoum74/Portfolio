export interface AwardEntry {
  id: string;
  objectName: string;
  eyebrow: string;
  title: string;
  description: string;
  footnote: string;
  proofUrl?: string;
  /** Image placed physically inside an existing frame. */
  certificateImage?: string;
  artMarkerName?: string;
}

export const AWARD_ENTRIES: readonly AwardEntry[] = [
  {
    id: "42-piscine",
    objectName: "SEC_AWARDS_Frame_M",
    eyebrow: "42 BEIRUT · FEB–MAR 2024",
    title: "42 Beirut Piscine",
    description:
      "Four weeks of practical C programming, covering functions, pointers, memory management and problem solving through peer learning.",
    footnote: "Piscine participation · February–March 2024",
    artMarkerName: "AWARD_ART_42",
  },
  {
    id: "se-factory",
    objectName: "SEC_AWARDS_Frame_S",
    eyebrow: "SE FACTORY · APR–JUL 2024",
    title: "Foundations of Computer Science",
    description:
      "I completed SE Factory's foundations programme, strengthening the programming and problem-solving skills I use in web development.",
    footnote: "Foundations programme · April–July 2024",
    artMarkerName: "AWARD_ART_SE_FACTORY",
  },
  {
    id: "networking",
    objectName: "SEC_AWARDS_TrophyCup",
    eyebrow: "CONTINUED LEARNING",
    title: "Learning through practice",
    description:
      "My learning also includes a full-stack internship with Prodigy InfoTech and courses in React, Next.js, Three.js and Java with object-oriented programming.",
    footnote:
      "Web development courses and internship training",
  },
];
