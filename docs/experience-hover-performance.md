# Reduce repeated Awards Hall and journey map hover work

Baseline: `71781bb167d89ae5192c684d3d43c6ecc79f1203` on
`perf/quality-preserving-runtime-2026-10-23`.

Both experiences previously rewrote the cursor, hover class and two label
coordinates on every active hovered frame. They read the canvas rectangle once
for picking and again for placement, with DOM writes between those reads. Awards
also allocated a result array for each exhibit and a projected vector; the map
allocated a hit-target list, result array and projected vector each frame.

The experiences now read the canvas rectangle once before hover DOM writes and
share it between picking and placement. Direct clicks still read a fresh
rectangle. Cursor/class changes are conditional, and each label retains its last
requested numeric coordinates so CSSOM pixel-string rounding cannot cause
repeated writes. Each experience owns a reusable projection vector and result
array; the map builds its four hit-target references during stop creation.
Result records are cleared after picking, and award picks also clear the array
between exhibits to retain the original nearest-hit ordering.

**Picking still runs every active frame while the pointer is inside.** There is
no hover-result cache, reduced pick frequency or assumption that camera/target
geometry remains static. Animating glimmers, waypoint gems, route progress,
camera transitions, navigation, authored projection/clamping and return behavior
retain their existing updates. No asset, shader, lighting, resolution or
collider setting changes. The owner's newer house/report/Vite files remain in
the remote base tree.

## Validation — October 27, 2026

All **111 local tests**, typecheck, production build and whitespace checks pass.
Four regressions instantiate the production experiences with the real configured
entry lists, named synthetic Three.js geometry, real raycasts, and DOM/canvas
test doubles. The DOM fixture deliberately serializes pixel coordinates with
different precision from their assigned strings.

Each experience is primed while hovering, then updated for 120 unchanged frames:

| Work over 120 hovered frames, per experience | Previous code, derived | Current executed fixture |
| --- | ---: | ---: |
| Hover DOM writes | 480 | 0 |
| Canvas rectangle reads | 240 | 120 |
| Awards exhibit raycast calls | 360 | 360 |
| Map hit-list raycast calls | 120 | 120 |

The two raycast rows apply only to their respective experience. The prior
figures come from the preceding source's unconditional calls, not a separately
timed baseline. Current result-array identity stays constant; the map's
hit-target list is also reused. Three.js can still allocate individual hit
records and internal temporaries; this is not an allocation-free claim.

The regressions also cover:

- The original projection/clamping coordinates and reading layout before writes.
- Resize/offset/aspect changes, a moving hit target, camera movement, pointer
  leave, zero-size canvas rejection and hidden-house inactivity.
- Every configured entry through both arrow directions and wraparound, real
  click hits, same-target/selection toggles and overview return.
- Normal/reduced-motion transitions, duplicate-entry/return guards, interrupted
  entry, return callbacks and restoration of saved camera position/rotation.
- Listener, panel and generated-decoration removal on destruction.

The existing isolated ring-material test bypasses the map constructor; its
fixture now supplies the new hit-target array. Its original material assertions
are unchanged. The test script includes the new experience suite. Dependencies,
lockfile and model binaries are unchanged. House-dependent tests still use the
prior local export; these new fixtures do not assert the owner's newer layout.

Build entry: 1,019.28 kB minified / 271.19 kB gzip. Required physics remains
2,855.12 / 1,078.39 kB. Existing large-chunk and partial-checkout edge-mask
warnings remain. Machine-readable counts:
[experience-hover-work-review.json](experience-hover-work-review.json).

These are avoided-work counts in CPU fixtures, not measured wall-time, heap,
GPU, FPS or full-browser CSS/pixel results. The Browser connector still rejects
access before a page action with "Browser access requires the originating
browser context". No new live review, screenshot, console capture or rendering
settings capture was obtained. The earlier owner's successful book review
does not validate these subsequent changes.

## Remaining manual review

After pulling, open `?perfdiag=1` and enter the house at the existing quality
settings. In Awards Hall, hover/click the three physical exhibits, navigate both
directions through all three, toggle inspection/overview with E, resize, return
with Esc and reopen. On the journey map, repeat for all four chapters and
confirm the route, waypoint animation, hover label and camera return. Check the
console for new errors. Then traverse the complete outside/house walking route,
including doors, stairs and furniture, to finish the outstanding collision and
interaction review. These live checks remain pending.
