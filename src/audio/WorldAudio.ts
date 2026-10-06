import * as THREE from "three";

export class WorldAudio {
  private readonly dayAmbience = new Audio(
    "/assets/audio/ambience/morning-birds.mp3",
  );

  private readonly nightAmbience = new Audio(
    "/assets/audio/ambience/night-birds.mp3",
  );

  private readonly water = new Audio("/assets/audio/ambience/water.mp3");

  private started = false;

  private muted = false;

  private masterFade = 0;

  private readonly dayMaxVolume = 0.18;

  private readonly nightMaxVolume = 0.22;

  private readonly islandCenter = new THREE.Vector2(-2, 4.5);

  private readonly waterFadeStart = 10;

  private readonly shorelineRadius = 20;

  private readonly waterMaxVolume = 0.35;

  private active = true;

  constructor() {
    this.dayAmbience.loop = true;

    this.dayAmbience.volume = 0;

    this.dayAmbience.preload = "auto";

    this.nightAmbience.loop = true;

    this.nightAmbience.volume = 0;

    this.nightAmbience.preload = "auto";

    this.water.loop = true;

    this.water.volume = 0;

    this.water.preload = "auto";
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    try {
      await Promise.all([
        this.dayAmbience.play(),
        this.nightAmbience.play(),
        this.water.play(),
      ]);

      this.started = true;

      this.fadeIn(1500);
    } catch (error) {
      console.warn("World audio could not start:", error);
    }
  }

  update(playerPosition: THREE.Vector3, hour: number): void {
    if (!this.started || !this.active) {
      return;
    }

    this.updateDayNightAmbience(hour);
    this.updateWater(playerPosition);
  }

  setActive(active: boolean): void {
    this.active = active;

    if (!active) {
      this.dayAmbience.volume = 0;
      this.nightAmbience.volume = 0;
      this.water.volume = 0;
    }
  }

  private updateDayNightAmbience(hour: number): void {
    let nightAmount = 0;

    if (hour >= 17 && hour < 20) {
      nightAmount = (hour - 17) / 3;
    } else if (hour >= 20 || hour < 5) {
      nightAmount = 1;
    } else if (hour >= 5 && hour < 8) {
      nightAmount = 1 - (hour - 5) / 3;
    } else {
      nightAmount = 0;
    }

    const smoothNight = nightAmount * nightAmount * (3 - 2 * nightAmount);

    const dayAmount = 1 - smoothNight;

    this.dayAmbience.volume = dayAmount * this.dayMaxVolume * this.masterFade;

    this.nightAmbience.volume =
      smoothNight * this.nightMaxVolume * this.masterFade;
  }

  private updateWater(playerPosition: THREE.Vector3): void {
    const dx = playerPosition.x - this.islandCenter.x;

    const dz = playerPosition.z - this.islandCenter.y;

    const distanceFromCenter = Math.hypot(dx, dz);

    if (distanceFromCenter <= this.waterFadeStart) {
      this.water.volume = 0;

      return;
    }

    if (distanceFromCenter >= this.shorelineRadius) {
      this.water.volume = this.waterMaxVolume * this.masterFade;

      return;
    }

    const progress =
      (distanceFromCenter - this.waterFadeStart) /
      (this.shorelineRadius - this.waterFadeStart);

    const smoothProgress = progress * progress * (3 - 2 * progress);

    this.water.volume = smoothProgress * this.waterMaxVolume * this.masterFade;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  toggleMuted(): boolean {
    this.muted = !this.muted;

    this.dayAmbience.muted = this.muted;

    this.nightAmbience.muted = this.muted;

    this.water.muted = this.muted;

    return this.muted;
  }

  stop(): void {
    this.dayAmbience.pause();

    this.nightAmbience.pause();

    this.water.pause();

    this.started = false;

    this.masterFade = 0;
  }

  private fadeIn(duration: number): void {
    const startTime = performance.now();

    this.masterFade = 0;

    const animate = (now: number): void => {
      const progress = Math.min((now - startTime) / duration, 1);

      this.masterFade = progress * progress * (3 - 2 * progress);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }
}
