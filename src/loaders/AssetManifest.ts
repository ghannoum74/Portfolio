export const ASSETS = {
  world: "/assets/models/environment/world.glb",

  player: "/assets/models/player/player.glb",

  animations: {
    idle: "/assets/models/player/animations/idle.glb",
    walking: "/assets/models/player/animations/walking.glb",
    walkingBackward: "/assets/models/player/animations/walking-backwords.glb",
    running: "/assets/models/player/animations/running.glb",
    runningBackward: "/assets/models/player/animations/running-backwords.glb",
    jump: "/assets/models/player/animations/jump-fast.glb",
    ascendingStairs: "/assets/models/player/animations/ascending-stairs.glb",
  },
} as const;

export const STARTUP_ASSETS: readonly string[] = [
  ASSETS.world,
  ASSETS.player,
  ...Object.values(ASSETS.animations),
];
