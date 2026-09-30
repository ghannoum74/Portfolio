export const ASSETS = {
  world: "/assets/models/environment/world.glb",

  player: "/assets/models/player/player.glb",

  characters: {
    fortyTwo: "/assets/models/player/42.glb",
    mtc: "/assets/models/player/MTC.glb",
    bePro: "/assets/models/player/bePro.glb",
    frequenc: "/assets/models/player/frequenc.glb",
    interphase: "/assets/models/player/interphase.glb",
    prodigy: "/assets/models/player/prodigy.glb",
    seFactory: "/assets/models/player/se-factory.glb",
  },

  animations: {
    idle: "/assets/models/player/animations/idle.glb",
    walking: "/assets/models/player/animations/walking.glb",
    walkingBackward: "/assets/models/player/animations/walking-backwords.glb",
    running: "/assets/models/player/animations/running.glb",
    runningBackward: "/assets/models/player/animations/running-backwords.glb",
    jump: "/assets/models/player/animations/jump.glb",
    ascendingStairs: "/assets/models/player/animations/ascending-stairs.glb",
  },

  npcAnimations: {
    talking1: "/assets/models/player/animations/talking_1.glb",

    talking2: "/assets/models/player/animations/talking_2.glb",

    talking3: "/assets/models/player/animations/talking_3.glb",
  },
} as const;

export const STARTUP_ASSETS: readonly string[] = [
  ASSETS.world,
  ASSETS.player,
  ...Object.values(ASSETS.animations),
  ...Object.values(ASSETS.characters),
  ...Object.values(ASSETS.npcAnimations),
];
