export type PerformanceStream = "frame" | "renderer" | "physics";
export type PerformanceSampleListener = (sample: Record<string, unknown>) => void;

type RecordedSample = {
  run: number;
  atMs: number;
  sample: Record<string, unknown>;
  endContext: Record<string, unknown>;
};

/** Bounded copies of existing diagnostic windows; never samples or enables GPU queries. */
export class PerformanceReport {
  private readonly streams: Record<PerformanceStream, RecordedSample[]> = { frame: [], renderer: [], physics: [] };
  private readonly dropped: Record<PerformanceStream, number> = { frame: 0, renderer: 0, physics: 0 };
  private readonly startedAt: number;
  private run = 0;

  constructor(
    private readonly limitPerStream = 120,
    private readonly now: () => number = () => performance.now(),
  ) {
    if (!Number.isInteger(limitPerStream) || limitPerStream < 1 || limitPerStream > 120)
      throw new RangeError("Performance report limit must be between 1 and 120");
    this.startedAt = now();
  }

  record(stream: PerformanceStream, sample: Record<string, unknown>, endContext: Record<string, unknown>): void {
    const records = this.streams[stream];
    const entry = { run: this.run, atMs: this.elapsed(), sample: structuredClone(sample), endContext: structuredClone(endContext) };
    if (records.length === this.limitPerStream) { records.shift(); this.dropped[stream]++; }
    records.push(entry);
  }

  /** Keep earlier comparison runs while the producers discard/reset in-flight windows. */
  newRun(): void { this.run++; }

  snapshot(metadata: Record<string, unknown>) {
    return structuredClone({
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      elapsedMs: this.elapsed(),
      currentRun: this.run,
      limitPerStream: this.limitPerStream,
      endContextIsWindowEndSnapshot: true,
      windowConditionsIndependentlyVerified: false,
      metadata,
      counts: { frame: this.streams.frame.length, renderer: this.streams.renderer.length, physics: this.streams.physics.length },
      dropped: this.dropped,
      streams: this.streams,
    });
  }

  private elapsed(): number { return +(this.now() - this.startedAt).toFixed(2); }
}

/** Explicit diagnostic download; no network request or automatic upload. */
export function downloadPerformanceReport(snapshot: ReturnType<PerformanceReport["snapshot"]>): void {
  const link = document.createElement("a");
  const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" }));
  try {
    link.href = url;
    link.download = `portfolio-perf-${snapshot.createdAt.replace(/[:.]/g, "-")}.json`;
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    // Let the browser start the download before releasing the URL.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
