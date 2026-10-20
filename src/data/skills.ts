/** Workshop presentation data. Change the copy without touching the interaction code. */
export interface WorkshopSkill {
  id: string;
  eyebrow: string;
  name: string;
  description: string;
  technologies: readonly string[];
  note: string;
}

export const FIRST_WORKSHOP_SKILL: WorkshopSkill = {
  id: "interface-craft",
  eyebrow: "01 / THE CRAFT",
  name: "Interface Craft",
  description:
    "From the first sketch to the final interaction — interfaces that feel responsive, useful, and unmistakably human.",
  technologies: ["TypeScript", "Angular", "React", "CSS"],
  note: "Hover the rune to wake it. Click to reveal its craft.",
};
