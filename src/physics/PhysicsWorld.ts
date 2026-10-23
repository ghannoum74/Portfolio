import type RAPIER from "@dimforge/rapier3d-compat";

export class PhysicsWorld {
  public world!: RAPIER.World;
  public rapier!: typeof RAPIER;
  public colliderNames = new Map<number, string>();

  private initialized = false;
  private initPromise?: Promise<void>;
  private fixedRevision = 0;

  init(): Promise<void> {
    this.initPromise ??= this.initialize().catch(error => {
      this.initPromise = undefined;
      throw error;
    });
    return this.initPromise;
  }

  private async initialize(): Promise<void> {
    const { default: RAPIER } = await import("@dimforge/rapier3d-compat");
    await RAPIER.init();
    this.rapier = RAPIER;

    this.world = new RAPIER.World({
      x: 0,
      y: -9.81,
      z: 0,
    });

    this.initialized = true;

    console.log("Rapier physics initialized");
  }

  get staticColliderRevision(): number { return this.fixedRevision; }

  /** Invalidate cached fixed-only queries after adding, moving or removing fixed colliders. */
  invalidateStaticQueries(): void { this.fixedRevision++; }

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
