# Download a performance report

Baseline: `10cff3e2898eb52c41e74e7f25979443f929da9a` on
`perf/quality-preserving-runtime-2026-10-23`.

`?perfdiag=1` now exposes **Performance → Download report**. It saves the
existing frame, renderer and physics reporting windows as one JSON file, with
their scene, camera, actual resolution, time mode and active settings. This
allows investigation on the owner's hardware without copying console logs or
depending on the assistant's Browser connection.

## Collect the next baseline

1. Pull the feature branch, run the dev server and open `?perfdiag=1`.
2. Keep the preferred quality/time settings and Original water. Enable
   **GPU timing** if available; this remains optional. Leave GPU stats off if
   using the separate timer, since both can own the same query target.
3. At a stationary exterior view, press **Restart readings** and remain there
   for about 20 seconds. Repeat at a stationary house view, then while inspecting
   a workshop craft. Leave the camera and settings steady within each hold.
4. Click **Download report** and share the `portfolio-perf-*.json` file for
   analysis. Earlier holds remain in the file after restarting readings.

No automated upload or extra rendering is performed by the download. The user
starts it explicitly. Normal gameplay does not create a collector, connect
sample listeners or show this control. GPU timing, graph settings and rendering
quality retain their existing defaults. This is a measurement feature, not a
new measured speed improvement.

## Data and limits

- `streams.frame`: existing callback CPU/interval summaries and stage means.
- `streams.renderer`: existing draw/triangle/memory counters and optional
  asynchronous GPU results. Disabled/unsupported timings stay explicitly null.
- `streams.physics`: existing physics means, steps and available LOD/culling/
  water summaries.
- Each entry has a `run`, relative `atMs`, original `sample` and `endContext`.
  The context contains phase/scene/inspection modes, player position, active
  camera world/projection matrices, CSS/framebuffer dimensions, native/actual
  DPR, time mode/hour and the live normalized performance settings.
- Restart/settings/resize/visibility resets retain their existing producer
  behavior and begin a new report run. Completed earlier windows remain.
  Frame/render warm-up exclusions are unchanged. Physics retains its own
  existing reporting cadence; the three streams are not synchronized windows.
- Storage is bounded to 120 completed windows **per stream**, about six minutes
  per stream at three-second cadence. Faster capped frame windows retain less
  time. `counts` and `dropped` show retained/evicted windows. Recording and
  snapshotting copy data so later object mutations cannot rewrite history.
- `endContext` is a window-end snapshot, not proof that the whole window used
  that camera/scene/settings. Loading or moving windows can have mixed content;
  use stationary holds/restarts for comparisons. The schema explicitly marks
  `windowConditionsIndependentlyVerified: false`. Do not pair asynchronous rows
  as if their CPU/GPU/physics durations were additive or precisely aligned.
- `metadata.contextAtDownload` describes the final state. Page metadata includes
  origin/path only, excluding URL query/hash. `sourceRevision` is null because
  no running-checkout fingerprint is available; the report does not claim one.
- The download snapshots already emitted results. It does not render a frame,
  reset timings, drain another GPU sample, enable queries or alter quality.
  Cloning/context capture adds optional diagnostic work at reporting boundaries;
  it is not an uninstrumented benchmark. Cold-load/entry stalls are outside the
  steady-state window protocol.

The anchor is removed immediately after its click. Its object URL is released
after one second, including if the click throws. No model, shader, physics,
animation, texture, dependency, lockfile or Vite configuration changes here.
The complete remote base tree preserves the owner's newer house/export report.

## Validation — October 27, 2026

All **121 local tests**, typecheck, production build and whitespace checks pass.
Six new regressions cover per-stream bounds/eviction, independent copied
samples/contexts/snapshots, empty/nullable data, retained runs, native JSON Blob
payload and deferred URL cleanup on success/failure, disabled Game wiring,
producer resets, actual camera/framebuffer/settings capture, query/hash
exclusion and report download without rendering/query access.

The production renderer/physics methods and frame profiler feed real summary
objects through controlled fixtures into the report; repeat snapshots do not
drain GPU results. Existing warm-up/disabled conditions still suppress
emission. The tests use real Three.js camera/scene objects, a controlled render/
GPU/physics path, and DOM/download test doubles. They do not launch the full
Game constructor or prove a native browser download. Existing geometry,
highlight, lighting, loading and interaction regressions also pass.

The previous owner-reported book/inspector/walking functional passes remain
recorded. This new control still needs its first live capture/download; no
fresh laptop timings, screenshot or browser console capture was obtained here.
The Browser connector's last attempt failed before accessing the page. Local
house-dependent checks still use the earlier export.

Build entry: 1,022.71 kB minified / 272.25 kB gzip, an increase of 3.24 / 1.00 kB
for this diagnostic code. Required physics remains 2,855.12 / 1,078.39 kB.
Existing large-chunk and partial-checkout edge-mask warnings remain.
Machine-readable validation: [performance-report-review.json](performance-report-review.json).
