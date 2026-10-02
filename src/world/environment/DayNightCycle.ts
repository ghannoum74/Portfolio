import * as THREE from "three";

interface DayNightCycleOptions {
  timeZone?: string;

  sunRadius?: number;

  updateInterval?: number;
}

export class DayNightCycle {
  private readonly sunRadius: number;
  private readonly updateInterval: number;
  private readonly timeFormatter: Intl.DateTimeFormat;
  private elapsed = Infinity;

  // for debbuging purposes
  private overrideHours: number | null = null;

  private readonly horizonSunColor = new THREE.Color(0xff9a5a);

  private readonly dayAmbientColor = new THREE.Color(0xffffff);

  private readonly nightAmbientColor = new THREE.Color(0x617096);

  private readonly daySkyColor = new THREE.Color(0x6dd4f3);

  private readonly horizonSkyColor = new THREE.Color(0xd69b76);

  private readonly nightSkyColor = new THREE.Color(0x111827);

  private readonly daySunColor = new THREE.Color(0xfff1bf);

  private readonly calculatedSkyColor = new THREE.Color();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly sunPivot: THREE.Group,
    private readonly sun: THREE.DirectionalLight,
    private readonly ambientLight: THREE.AmbientLight,
    options: DayNightCycleOptions = {},
  ) {
    this.sunRadius = options.sunRadius ?? 35;

    this.updateInterval = options.updateInterval ?? 1;

    this.timeFormatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: options.timeZone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });

    if (!(this.scene.background instanceof THREE.Color)) {
      this.scene.background = new THREE.Color();
    }

    this.applyTime(this.getCurrentHour());
  }

  update(delta: number): void {
    this.elapsed += delta;

    if (this.elapsed < this.updateInterval) {
      return;
    }

    this.elapsed = 0;

    const hour = this.overrideHours ?? this.getCurrentHour();

    this.applyTime(hour);
  }

  private getCurrentHour(): number {
    const parts = this.timeFormatter.formatToParts(new Date());

    const getPart = (type: Intl.DateTimeFormatPartTypes): number => {
      const value = parts.find((part) => part.type === type)?.value;

      return Number(value ?? 0);
    };

    const hour = getPart("hour");
    const minute = getPart("minute");
    const second = getPart("second");

    return hour + minute / 60 + second / 3600;
  }

  private applyTime(hour: number): void {
    /*
     * Sun cycle:
     *
     * 06:00 -> eastern horizon
     * 12:00 -> highest point
     * 18:00 -> western horizon
     * 00:00 -> below the world
     */
    const angle = ((hour - 6) / 24) * Math.PI * 2;

    const horizontal = Math.cos(angle);

    const height = Math.sin(angle);

    /*
     * +X = sunrise side
     * -X = sunset side
     *
     * Z remains slightly offset so the light
     * isn't perfectly aligned with one axis.
     */
    this.sunPivot.position.set(
      horizontal * this.sunRadius,
      height * this.sunRadius,
      10,
    );

    /*
     * height:
     *
     * -1 = deep night
     *  0 = horizon
     *  1 = midday
     *
     * smoothstep gives us a soft dawn/dusk
     * rather than lights suddenly switching.
     */
    const daylight = THREE.MathUtils.smoothstep(height, -0.15, 0.2);

    /*
     * Strong close to the horizon,
     * zero once the sun is high.
     */
    const horizonWarmth =
      1 - THREE.MathUtils.smoothstep(Math.abs(height), 0, 0.45);

    /*
     * ----- SUN -----
     */

    this.sun.intensity = THREE.MathUtils.lerp(0, 3, daylight);

    this.sun.color
      .copy(this.horizonSunColor)
      .lerp(this.daySunColor, 1 - horizonWarmth);

    /*
     * ----- AMBIENT LIGHT -----
     */

    this.ambientLight.intensity = THREE.MathUtils.lerp(0.22, 1.5, daylight);

    this.ambientLight.color
      .copy(this.nightAmbientColor)
      .lerp(this.dayAmbientColor, daylight);

    /*
     * ----- SKY -----
     */

    this.calculatedSkyColor
      .copy(this.nightSkyColor)
      .lerp(this.daySkyColor, daylight);

    /*
     * Add orange/pink near sunrise
     * and sunset.
     */
    this.calculatedSkyColor.lerp(this.horizonSkyColor, horizonWarmth * 0.5);

    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.copy(this.calculatedSkyColor);
    }
  }

  setTimeOverride(hour: number | null): void {
    if (hour === null) {
      this.overrideHours = null;

      this.applyTime(this.getCurrentHour());
      return;
    }

    this.overrideHours = THREE.MathUtils.clamp(hour, 0, 23.99);

    this.applyTime(this.overrideHours);
  }

  getTimeOfDay(): number {
    return this.overrideHours ?? this.getCurrentHour();
  }

  isUsingRealTime(): boolean {
    return this.overrideHours === null;
  }
}
