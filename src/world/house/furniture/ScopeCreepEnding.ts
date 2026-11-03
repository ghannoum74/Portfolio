export const SCOPE_CREEP_STEPS = [
  {
    name: "Just a landing page.",
    description:
      "Three sections. One contact button. Surely nothing can go wrong.",
    status: "The cauldron is suspiciously calm.",
    action: "Add accounts & payments →",
    color: 0x85dd9e,
  },
  {
    name: "With accounts and payments.",
    description:
      "Authentication. Permissions. Payment webhooks. The potion has acquired responsibilities.",
    status: "The bubbling gets louder.",
    action: "A tiny admin dashboard →",
    color: 0x82c8ef,
  },
  {
    name: "And a tiny admin dashboard.",
    description:
      "Reports, roles and an audit trail. “Tiny” is doing a lot of work in that sentence.",
    status: "The requirements are starting to overflow.",
    action: "One last small request… →",
    color: 0xe9ba70,
  },
  {
    name: "Can it work offline, too?",
    description: "And sync safely when it reconnects. The spoon has resigned.",
    status: "The cauldron would like a revised brief.",
    action: "See what we summoned →",
    color: 0xe6a4a0,
  },
  {
    name: "Congratulations. You have summoned a platform.",
    description:
      "Good projects begin with the right questions. Then comes the architecture, the code, and making everything work together.",
    status: "Quest complete. Thanks for exploring.",
    action: "Brew another brief ↺",
    color: 0x85dd9e,
  },
] as const;
