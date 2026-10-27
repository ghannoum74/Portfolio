# Frame and GPU profiling

## Current common-pass comparison

The [new same-view batching capture](common-performance-timing-2026-10-23.md)
checks on -> off -> on separately near the Projects Book and at the exterior
spawn. Indoor draw calls are 110 unbatched versus 92 batched (16.4% fewer);
exterior calls are 176 versus 149 (15.3% fewer), with unchanged triangle counts.
Thirty renderer windows and thirty callback windows include 188 valid GPU samples.
The indoor FPS medians are 30 / 29 / 29 and exterior medians 7 / 16 / 16 in test
order. Initial/restored timing baselines drifted and other portfolio tabs were
open, so these results do not establish a consistent FPS gain or regression.
The report preserves the slow first exterior baseline, full raw windows, viewport
sizes, quality flags, cleanup and post-capture reload. Cold startup and an isolated
camera-query comparison remain unmeasured.

The measurements below predate that common implementation pass.

## Earlier live evidence

The local Chrome app was checked with the new static batching/transform controls
enabled. Workshop approach keeps the original wood surface with a thin border.
All four inspections, E closing, arrow navigation, mouse picking and Escape
return work. Workshop lights add one visible point light while inspecting and
none in overview or after exit. Two cached house exit/re-entry cycles completed
without application console errors or a stuck loading cover. Renderer geometry
and texture counts stayed at 486 and 66 across that repeat. These are functional
checks, not a long-session leak test or a cold-entry benchmark. The exact Windows
Git commit was not read; the new controls and their logged state were present.

In the original fixed living-room view, additional batching reduced draw calls
from 94 to 90; median FPS was 30 in both states. A later repeat changed camera
framing and is excluded from that comparison.

The following controlled runs used the same near-entry camera, viewport
1226 × 828, a frozen preview hour, active door border, one visible point light,
shadows/culling enabled, and both static optimizations on. Each row contains the
last five three-second readings collected during a browser-control call after
resetting and allowing the existing two-second warm-up exclusion.

| Pixel ratio | Stone LOD | Median FPS | Median renderer CPU ms | Calls | Submitted triangles |
| --- | --- | ---: | ---: | ---: | ---: |
| 1.1 | On | 30 | 6.07 | 139 | 186,438 |
| 0.55 | On | 30 | 3.90 | 139 | 186,438 |
| 1.1 | Off | 30 | 4.26 | 139 | 238,010 |

Halving each framebuffer dimension did not increase median FPS in these runs.
Removing stone LOD added 51,572 submitted triangles without changing median FPS.
The samples are sequential, browser/device load varies, and multiple portfolio
tabs were open. An earlier uncontrolled baseline fell to 18 FPS; it does not
establish a resolution-related gain. These results do not isolate GPU execution,
browser pacing, or total main-thread work. Original DPR 1.1, LOD and real time
were restored. Model, texture and shader quality were not changed.

Raw readings: [comparison data](runtime-profile-comparison-2026-10-23.json).

## New diagnostic controls

Open `?perfdiag=1`. The Performance folder additionally exposes:

- **Border highlight**: same-camera border on/off comparison in the default
  border mode. Focus changes still track the latest object while disabled.
  Re-enabling restores that target; source surface materials remain unchanged.
- **Shadows**: same-camera renderer shadow comparison. Re-enable after sampling.
- **GPU timing**: asynchronous samples of the 3D renderer's GPU work. It starts
  off; `?perfdiag=1&gpuTiming=1` enables it at load time. It is disabled alongside
  `gpuStats=1`, since stats-gl may own the same elapsed-time query target.

Normal gameplay creates neither a frame profiler nor GPU timer queries. Existing
quality defaults remain enabled. Diagnostic switches reset CPU/GPU windows and
exclude the next two seconds. Resize and visibility resume also reset windows.

## Read the measurements

`[Frame profile]` reports callback CPU work and start-to-start callback intervals
separately. It includes mean, p50 and p95 values, with mean CPU costs for setup,
world updates, camera, house effects/UI, interaction/debug work, LOD and render
submission. Windows last about three seconds or at most 600 frames. Loading,
covered preparation and scene changes reset the window so they are not mixed
into a giant gameplay frame. Logging/profiling has some overhead.

`[House perf]` keeps the existing counters and adds flat GPU fields:
`gpuTimingStatus`, `gpuTimingSamples`, `gpuRenderMsMean`, `gpuRenderMsP50`,
`gpuRenderMsP95`, `gpuTimingPending` and `gpuTimingDisjointEvents`.

GPU queries sample one render in ten with at most four unresolved queries. They
are read only after availability on a later frame. Invalid/disjoint samples and
results pending across a reset are discarded. Unsupported contexts return null
timings with an explicit status. Context restoration reacquires the extension;
external active queries are left alone. Render failures still close an owned
query. These are sampled GPU durations, not hardware-utilization percentages or
browser presentation times. They do not include DOM compositing or non-render
world update work. CPU/GPU work can overlap, so do not add or subtract the
reported durations as a frame-budget equation.

Compare one switch at a time, at the same camera and preview hour. Allow warm-up,
collect at least five readings, restore the switch, and repeat the baseline.
Check shader/upload stutters separately from steady-state timing. Frame interval
improvements must be measured rather than inferred from a lower triangle count.
If CPU/GPU numbers leave a large unexplained callback gap, use a fresh Chrome
Performance trace to investigate scheduling, other work and presentation.

The live GPU and callback measurements were subsequently verified in the workshop
approach view below. First-load/entry latency remains unmeasured.

Validation: 74 automated tests, TypeScript checking and the production build pass.
The automated GPU tests use a controlled WebGL test double; the following live
comparison additionally verifies successful asynchronous timing in the connected
Chrome app. Existing bundle-size and partial-checkout edge-mask warnings remain.

## Live CPU/GPU comparison on 2026-10-23

The updated diagnostic controls and their log fields were present. One portfolio
tab was open, the document was visible, and the workshop approach camera remained
fixed. The viewport was 1745 × 828, with a baseline framebuffer of 1919 × 910 at
DPR 1.1, as read after baseline A3; dimensions were not read separately for every
run. The later restored-settings screenshot is 1745 × 777. Preview hour was held
at 19.2933. One house point light was visible and
workshop inspection lights were inactive. The player idle animation continued.
The exact Windows checkout SHA was not independently read.

Each condition resets readings, excludes two seconds of warm-up, and collects
five roughly three-second windows. Values below are medians across those window
summaries; GPU ms uses each window's mean sampled GPU duration. These are
sequential comparisons, not pooled per-frame percentiles.

| Condition | Median FPS | Callback CPU ms | Sampled GPU ms | Callback interval ms |
| --- | ---: | ---: | ---: | ---: |
| Baseline A: border/shadows on, DPR 1.1 | 29 | 7.25 | 16.52 | 34.08 |
| Border off | 29 | 6.57 | 16.03 | 34.08 |
| Baseline A2 restored | 29 | 5.91 | 16.54 | 34.27 |
| Shadows off | 29 | 6.34 | 16.57 | 34.09 |
| DPR 0.55, border/shadows on | 29 | 6.14 | 5.29 | 34.47 |
| Baseline A3 restored | 29 | 6.82 | 16.63 | 34.08 |
| GPU timing disabled, original quality | 29 | 6.66 | — | 34.67 |

The six GPU-enabled conditions yielded 254 completed samples, all reported
`ready`, with no disjoint events and at most one pending query in the captured
reporting windows. Disabling timing produced null GPU durations and zero pending
queries. No error-level browser logs were observed. Startup warnings included
unmatched finger animation tracks and unrelated extension locator warnings.

Disabling the border removed one submitted draw and 16,672 submitted triangles
(72 → 71 calls, 46,886 → 30,214 triangles). Its roughly 0.5 ms GPU difference
against adjacent baselines did not change median FPS. Shadow disabling did not
improve GPU time or FPS in this particular view/hour; this does not establish the
cost of other shadowed scenes. The lower-resolution comparison cut sampled GPU
time by about 68%, while median FPS remained 29. Original DPR, border, shadows,
other quality switches and real time were restored; GPU timing was turned off.

These results make callback pacing or work outside the measured callback the
next investigation. They do not prove a browser frame cap, a 30 Hz display,
Energy Saver activation, GPU utilization or a specific driver/OS cause. The
inspected Game/VisibleAnimationLoop path forwards visible frames to Three.js
`setAnimationLoop` without an application 30 FPS limiter. A fresh Chrome
Performance trace and the user's display/power configuration are still needed.
Browser control and diagnostic logging were active throughout these tests;
there was no uninstrumented comparison. Occasional 19–20 FPS windows are retained
in the raw readings rather than removed.

Chrome documents that Energy Saver can reduce animation frame rate. Browser
security blocked internal settings navigation during the capture. The user later
reported that Energy Saver is off. No settings change was attempted. Subsequent
work applies the [common performance techniques](common-performance.md); the
measurements above predate that implementation.

See [raw CPU/GPU readings](runtime-gpu-profile-2026-10-23.json) and
[the restored quality settings](runtime-gpu-profile-2026-10-23-restored.jpg).

## References

- [Khronos elapsed-time query specification](https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/)
- [MDN WebGLQuery](https://developer.mozilla.org/en-US/docs/Web/API/WebGLQuery)
- [MDN requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)
- [Chrome Memory and Energy Saver behavior](https://developer.chrome.com/blog/memory-and-energy-saver-mode)
- [Chrome performance settings](https://support.google.com/chrome/answer/12929150)
