# Frame and GPU profiling

## Current evidence

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

The live GPU and new full-frame measurements still require verification on the
updated Windows branch. No new GPU milliseconds or FPS benefit is claimed by
this implementation. First-load/entry latency remains unmeasured.

Validation: 74 automated tests, TypeScript checking and the production build pass.
The GPU tests use a controlled WebGL test double; they do not substitute for a
driver measurement on the user's Intel GPU. Existing bundle-size and the partial
checkout's unresolved edge-mask build warnings remain.

## References

- [Khronos elapsed-time query specification](https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/)
- [MDN WebGLQuery](https://developer.mozilla.org/en-US/docs/Web/API/WebGLQuery)
- [MDN requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)
