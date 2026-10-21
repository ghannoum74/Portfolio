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
    eyebrow: "42 BEIRUT · MARCH 2024",
    title: "42 Piscine — Participation",
    description:
      "Participated in 42 Beirut’s intensive four-week Piscine, from February 12 through March 9, 2024, with practical programming exercises and peer evaluation.",
    footnote: "Certificate of Participation · Issued March 9, 2024",
    artMarkerName: "AWARD_ART_42",
  },
  {
    id: "se-factory",
    objectName: "SEC_AWARDS_Frame_S",
    eyebrow: "SE FACTORY · JULY 2024",
    title: "Foundations of Computer Science",
    description:
      "Successfully completed SE Factory’s Foundations of Computer Science course.",
    footnote: "Certificate of Completion · July 7, 2024",
    artMarkerName: "AWARD_ART_SE_FACTORY",
  },
  {
    id: "networking",
    objectName: "SEC_AWARDS_TrophyCup",
    eyebrow: "NETWORKING STUDIES",
    title: "Cisco CCNA 1 & 2 Coursework",
    description:
      "Networking fundamentals studied through Cisco CCNA 1 and CCNA 2 coursework.",
    footnote:
      "Coursework is not equivalent to a professional CCNA certification.",
  },
];
