import { summarizeTimings } from "./FrameProfiler";

interface TimerExtension { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number; QUERY_COUNTER_BITS_EXT: number }
type TimerStatus = "disabled" | "unsupported" | "pending" | "ready" | "disjoint" | "context-lost" | "busy" | "allocation-failed";

/** Samples render submissions asynchronously. Never waits for the GPU or calls finish(). */
export class GpuTimer {
  private readonly gl: WebGL2RenderingContext;
  private enabled = false;
  private extension?: TimerExtension;
  private status: TimerStatus = "disabled";
  private active?: WebGLQuery;
  private readonly pending: WebGLQuery[] = [];
  private readonly samples: number[] = [];
  private frame = 0;
  private disjointEvents = 0;
  private wasDisjoint = false;
  private contextWasLost = false;

  constructor(
    context: WebGLRenderingContext | WebGL2RenderingContext,
    private readonly sampleEvery = 10,
    private readonly maximumPending = 4,
  ) { this.gl = context as WebGL2RenderingContext; }

  setEnabled(enabled: boolean): void {
    this.reset();
    this.enabled = enabled;
    this.contextWasLost = false;
    this.extension = undefined;
    this.status = enabled ? "pending" : "disabled";
    if (enabled) this.initialize();
  }

  begin(): void {
    if (!this.enabled) return;
    if (this.gl.isContextLost()) {
      this.reset(); this.contextWasLost = true; this.status = "context-lost";
      return;
    }
    if (this.contextWasLost) {
      this.contextWasLost = false; this.initialize();
    }
    if (!this.extension || this.frame++ % this.sampleEvery !== 0) return;
    const gl = this.gl, ext = this.extension;
    // Leave another profiler's active target and disjoint flag untouched.
    if (gl.getQuery(ext.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)) {
      this.clearQueries(); this.samples.length = 0; this.status = "busy";
      return;
    }
    const disjoint = !!gl.getParameter(ext.GPU_DISJOINT_EXT);
    if (disjoint) {
      if (!this.wasDisjoint) this.disjointEvents++;
      this.wasDisjoint = true;
      this.clearQueries(); this.samples.length = 0; this.status = "disjoint";
      return;
    }
    this.wasDisjoint = false;
    // Only read results after QUERY_RESULT_AVAILABLE; each poll is a later frame.
    for (let index = this.pending.length - 1; index >= 0; index--) {
      const query = this.pending[index];
      if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) continue;
      const nanoseconds = gl.getQueryParameter(query, gl.QUERY_RESULT);
      if (typeof nanoseconds === "number" && Number.isFinite(nanoseconds) && nanoseconds >= 0) {
        this.samples.push(nanoseconds / 1e6);
        if (this.samples.length > 256) this.samples.shift();
      }
      gl.deleteQuery(query); this.pending.splice(index, 1);
    }
    this.status = this.samples.length ? "ready" : "pending";
    if (this.pending.length >= this.maximumPending) return;
    const query = gl.createQuery();
    if (!query) { this.status = "allocation-failed"; return; }
    gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
    this.active = query;
  }

  end(): void {
    if (!this.active) return;
    if (this.gl.isContextLost()) {
      this.reset(); this.contextWasLost = true; this.status = "context-lost";
      return;
    }
    if (this.gl.getQuery(this.extension!.TIME_ELAPSED_EXT, this.gl.CURRENT_QUERY) !== this.active) {
      this.gl.deleteQuery(this.active); this.active = undefined; this.status = "busy";
      return;
    }
    this.gl.endQuery(this.extension!.TIME_ELAPSED_EXT);
    this.pending.push(this.active); this.active = undefined;
  }

  /** Completed samples in this reporting window; unresolved queries remain bounded. */
  takeSample() {
    const timing = summarizeTimings(this.samples);
    const result = {
      gpuTimingStatus: this.status, gpuTimingSamples: timing.samples,
      gpuRenderMsMean: timing.mean, gpuRenderMsP50: timing.p50, gpuRenderMsP95: timing.p95,
      gpuTimingPending: this.pending.length, gpuTimingDisjointEvents: this.disjointEvents,
    };
    this.samples.length = 0;
    this.disjointEvents = 0;
    return result;
  }

  reset(): void {
    this.clearQueries();
    this.samples.length = 0;
    this.frame = this.disjointEvents = 0;
    this.wasDisjoint = false;
    if (this.enabled && this.extension) this.status = "pending";
  }

  dispose(): void { this.setEnabled(false); }

  private initialize(): void {
    if (this.gl.isContextLost()) { this.contextWasLost = true; this.status = "context-lost"; return; }
    if (typeof this.gl.createQuery !== "function") { this.status = "unsupported"; return; }
    this.extension = (this.gl.getExtension("EXT_disjoint_timer_query_webgl2") as TimerExtension | null) ?? undefined;
    if (this.extension && !this.gl.getQuery(this.extension.TIME_ELAPSED_EXT, this.extension.QUERY_COUNTER_BITS_EXT)) {
      this.extension = undefined;
    }
    this.status = this.extension ? "pending" : "unsupported";
  }

  private clearQueries(): void {
    if (this.active) {
      if (!this.gl.isContextLost() && this.gl.getQuery(this.extension!.TIME_ELAPSED_EXT, this.gl.CURRENT_QUERY) === this.active) {
        this.gl.endQuery(this.extension!.TIME_ELAPSED_EXT);
      }
      this.gl.deleteQuery(this.active); this.active = undefined;
    }
    for (const query of this.pending) this.gl.deleteQuery(query);
    this.pending.length = 0;
  }
}
