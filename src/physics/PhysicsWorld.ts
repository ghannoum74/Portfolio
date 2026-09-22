import RAPIER from "@dimforge/rapier3d-compat";

export class PhysicsWorld {
  public world!: RAPIER.World;
  public rapier = RAPIER;

  private initialized = false;

  async init(): Promise<void> {
    await RAPIER.init();

    this.world = new RAPIER.World({
      x: 0,
      y: -9.81,
      z: 0,
    });

    this.initialized = true;

    console.log("Rapier physics initialized");
  }

  beginFrame(delta: number): void {
    if (!this.initialized) {
      return;
    }

    this.world.timestep = Math.min(delta, 1 / 30);
  }

  step(): void {
    if (!this.initialized) {
      return;
    }

    this.world.step();
  }

  get isInitialized(): boolean {
    return this.initialized;
  }
}
