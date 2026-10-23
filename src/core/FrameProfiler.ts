export function summarizeTimings(values: readonly number[]) {
  if (!values.length) return { samples: 0, mean: null, p50: null, p95: null };
  const sorted = [...values].sort((a, b) => a - b);
  const rounded = (value: number) => +value.toFixed(2);
  const percentile = (fraction: number) => rounded(sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]);
  return {
    samples: values.length,
    mean: rounded(values.reduce((total, value) => total + value, 0) / values.length),
    p50: percentile(0.5), p95: percentile(0.95),
  };
}

export type FrameStage = "setup" | "world" | "camera" | "effectsUi" | "interaction" | "lod" | "render";
const emptyStages = (): Record<FrameStage, number> => ({
  setup: 0, world: 0, camera: 0, effectsUi: 0, interaction: 0, lod: 0, render: 0,
});

/** Opt-in callback CPU work and callback intervals; neither is GPU time. */
export class FrameProfiler {
  private scene?: string;
  private warmupUntil = 0;
  private windowStarted?: number;
  private frameStarted = 0;
  private phaseStarted = 0;
  private previousFrameStarted?: number;
  private pendingInterval?: number;
  private recording = false;
  private readonly cpu: number[] = [];
  private readonly intervals: number[] = [];
  private stages = emptyStages();

  constructor(
    private readonly now: () => number = () => performance.now(),
    private readonly windowMs = 3000,
    private readonly warmupMs = 2000,
  ) { this.reset(); }

  reset(): void {
    this.clearWindow();
    this.warmupUntil = this.now() + this.warmupMs;
    this.previousFrameStarted = undefined;
    this.recording = false;
  }

  /** Loading/covered preparation must not become a giant gameplay frame. */
  skip(): void { this.reset(); }

  begin(): void {
    const at = this.now();
    this.recording = at >= this.warmupUntil;
    if (!this.recording) { this.previousFrameStarted = undefined; return; }
    this.frameStarted = this.phaseStarted = at;
    this.pendingInterval = this.previousFrameStarted === undefined ? undefined : at - this.previousFrameStarted;
    this.previousFrameStarted = at;
    this.windowStarted ??= at;
  }

  mark(stage: FrameStage): void {
    if (!this.recording) return;
    const at = this.now();
    this.stages[stage] += at - this.phaseStarted;
    this.phaseStarted = at;
  }

  finish(scene: string) {
    if (scene !== this.scene) { this.scene = scene; this.reset(); return; }
    if (!this.recording) return;
    this.recording = false;
    const at = this.now();
    this.cpu.push(at - this.frameStarted);
    if (this.pendingInterval !== undefined && this.pendingInterval >= 0) this.intervals.push(this.pendingInterval);
    const elapsedMs = at - this.windowStarted!;
    // Also bound storage on very high-refresh displays or a suspended clock.
    if (elapsedMs < this.windowMs && this.cpu.length < 600) return;
    const sample = {
      scene, frames: this.cpu.length, elapsedMs: +elapsedMs.toFixed(2),
      callbackCpuMs: summarizeTimings(this.cpu),
      callbackIntervalMs: summarizeTimings(this.intervals),
      stagesCpuMsMean: Object.fromEntries(Object.entries(this.stages)
        .map(([name, total]) => [name, +(total / this.cpu.length).toFixed(2)])),
    };
    this.clearWindow();
    return sample;
  }

  private clearWindow(): void {
    this.cpu.length = this.intervals.length = 0;
    this.stages = emptyStages();
    this.windowStarted = undefined;
    this.pendingInterval = undefined;
  }
}
