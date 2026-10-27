# Share second-precision wall-clock formatting

Baseline: `7dbdac750a9c4b762080b6e5c6ba72e7e1be6885` on
`perf/quality-preserving-runtime-2026-10-23`.

`Game.update()` asks `World.getTimeOfDay()` for exterior ambience every displayed
frame. `DayNightCycle.getTimeOfDay()` previously created a Date and called
`Intl.DateTimeFormat.formatToParts()` on every real-time request, independently
of the lighting cycle's existing one-second update interval. Its returned hour
contains whole seconds only. Repeated requests within a second therefore
reformatted the same clock value.

The cycle now captures `Date.now()` and keys its formatted value by the UTC
epoch second. Requests in that same second reuse the value. A different second
always reformats, including backward clock changes, large jumps and the first
read after updates were paused. The formatter still owns the same configured
timezone/hour cycle. It receives the captured numeric timestamp directly.
There is no timer, simulated clock, extrapolation or delayed invalidation.

Fixed-hour previews continue to bypass real-time reads. Clearing a preview
applies the real-time hour immediately. `getTimeOfDay()` still reads the clock
on demand independently of lighting's update interval; sun/ambient/sky/fog and
zero-daylight shadow behavior keep their existing cadence and calculations.
No sound mixing/fade, render setting, asset, dependency or collider changes.

## Validation — October 27, 2026

All **115 local tests**, typecheck, production build and whitespace checks pass.
Four focused regressions use the production cycle and real Three.js scene/light
objects with an instrumented wall clock and Intl formatter:

- Simulate 240 displayed frames at 60 Hz across four wall-clock seconds, calling
  both the existing lighting update and the audio-facing getter. The cycle
  receives **245 current-hour requests**, including construction/four lighting
  samples; it executes **four formats**. The preceding source formatted once
  per request, implying 245 formats for the same request sequence. The prior
  count is derived, not a separately timed baseline. Every returned value equals
  an independent `Intl.DateTimeFormat.format()`/HH:mm:ss parsing oracle.
- Compare second/minute/midnight and timezone-transition boundary timestamps in
  the system timezone, UTC, Asia/Beirut and America/New_York. Repeated queries
  retain second precision, and forward/backward jumps refresh immediately.
  The oracle uses the host's timezone data; this does not audit timezone rules.
- Check preview clamping, no real-time clock/formatter work during fixed-hour
  reads/updates, and immediate same-second/new-second return to real time.
- Refresh getter values while lighting updates are paused, keep the configured
  lighting interval, and retain night/day shadow, ambient, sky/fog and sun
  position restoration when the next lighting update runs.

Existing sun-shadow boundary and authored-shadow-setting regressions also pass.
The new isolated suite is included in `npm test`. Local house-dependent tests
still use the earlier export. The current book/world fixtures remain unchanged;
the newer remote house, export report and Vite configuration are preserved by
building on the complete remote base tree.

Build entry: 1,019.47 kB minified / 271.25 kB gzip. Required physics remains
2,855.12 / 1,078.39 kB. Existing large-chunk and partial-checkout edge-mask
warnings remain. Machine-readable counts:
[day-night-clock-work-review.json](day-night-clock-work-review.json).

These counts establish avoided formatting work in a controlled CPU fixture,
not wall-time, heap, GPU or FPS gains. No new live browser/audio review or
hardware profile was obtained. The latest Browser attempt failed before page
access with "Browser access requires the originating browser context".

## Outstanding live checks

The owner reported the book's earlier manual checklist passed on October 27.
The subsequent Awards Hall/journey map hover change has automated coverage but
still needs its requested manual review. Complete the
[inspector and walking checklist](experience-hover-performance.md#remaining-manual-review)
after pulling, retaining the existing quality settings. Exterior/world WebP
appearance and the complete collision/interaction route remain pending.

For this clock change, optionally compare real time and a fixed preview hour,
then return to the preferred time mode. Verify ambience and light transitions
remain consistent; no quality or time-mode change is required to use the cache.
