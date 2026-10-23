# Skip the zero-light sun shadow pass

Patch parent: `b0239d4f881bf40d4d6b031cce4ff39271aa552c`.
Local asset/test baseline: `a42dfcccb4571f090b01de8d5ccda8605561e267`.

The day/night cycle already reduces sunlight to exactly zero at night. Three.js
still submits a visible, shadow-casting light's shadow pass at zero intensity.
`DayNightCycle` now disables the sun's `castShadow` only while its sunlight is
zero. It restores the original authored shadow preference as soon as sunlight
becomes positive, including faint dawn/dusk light. A sun authored without shadows
remains without shadows throughout the cycle.

The shadow map is retained when it exists, and daylight shadow auto-updating stays
enabled for moving characters. Sun/ambient colors, intensities, positions, sky,
fog, scene geometry and resolution are unchanged. The global Shadows control
continues to work independently. No blanket static-shadow caching is introduced.

## Browser comparison

The existing local diagnostic tab was reloaded into the exterior. Only one
localhost portfolio tab was listed; a deployed portfolio tab and unrelated tabs
remained open. The browser build's commit was not independently fingerprinted.
Other machine workload was uncontrolled, so this is not a laboratory benchmark.

At a fixed camera and preview hour 0, the existing global Shadows control was
compared on/off/on. Each condition records its last five renderer windows after
settling, with sampled asynchronous GPU timing enabled. Viewport was 1745 x 777,
framebuffer 1919 x 854, DPR about 1.1. Normal batching, transforms, LOD, backface
culling and border settings remained enabled; no target border or point light
was active. The player and NPC idle animations continued.

| Condition | Draw calls | Submitted triangles | Median FPS | Median renderer CPU ms | Median window GPU mean ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Night, shadows on A1 | 148 | 341,246 | 29 | 9.57 | 21.79 |
| Night, shadows off B | 144 | 333,196 | 29 | 7.85 | 22.38 |
| Night, shadows on A2 | 148 | 341,246 | 29 | 9.98 | 21.62 |

The repeated draw/triangle counts isolate **4 draws and 8,050 shadow triangles**
that contribute no sunlight at this hour. Submitted triangle counts include the
shadow pass; visible model geometry is not reduced. There were 128 completed GPU
queries, all reporting ready, zero disjoint events and one pending query per
captured window. An A2 FPS window of 17 is retained in the raw data.

**No FPS or GPU-time improvement is established.** Median FPS is unchanged, and
the off condition did not lower GPU time. Renderer CPU medians were lower in B,
but the uncontrolled workload limits attribution. This supports removing a small
amount of wasted work, not treating shadows as the main GPU bottleneck.

The comparison uses the pre-patch global toggle, not the newly automatic sun
policy. A live check of that policy after pulling the commit remains pending.
Night views are visually consistent apart from animated poses; no full-frame
pixel equality is claimed. Daylight preview at hour 13 visibly retains character
shadows. No error-level console entries were returned from the checked tab.
Real time, Shadows and all quality switches were restored; GPU timing was off.
The reload replaced the user's earlier workshop position with exterior spawn.

- [Raw windows and summary](sun-shadow-benchmark-2026-10-23.json)
- [Night with shadows](sun-shadow-night-on-2026-10-23.png)
- [Night without shadows](sun-shadow-night-off-2026-10-23.png)
- [Daytime with shadows](sun-shadow-day-2026-10-23.png)

## Code validation

All **93 local tests**, typecheck, production build and whitespace checks pass.
The owner added a newer house export in `b0239d4` while this patch was being
prepared. That commit also updates the environment report, removes the inactive
WebP house and adds Vite configuration. Those changes are preserved in the remote
parent; none overlaps the eight files in this patch. The repository connector
rejects the binary house download, so local asset-dependent tests use the prior
house. The complete suite against the newer house remains pending. The two
day/night regressions do not depend on any house asset.

The owner's subsequent Windows run passed 92 of 93 tests. The remaining failure
was this real-house culling snapshot: the new export reports 134 meshes, 108,122
triangles and 51 cloned materials, compared with 132 / 108,050 / 50 in the old
export. The follow-up test fix keys these explicit expectations by each GLB's Git
blob hash. It also verifies each changed geometry is closed/outward, checks the
actual changed mesh/triangle/material totals, and retains the hierarchy,
material restoration and stone-LOD assertions. Unknown exports fail explicitly.
The revised suite passes 93 tests locally with the prior house; a rerun with the
new house is still needed. No production code or asset changes in this fix.

Two new
regressions verify zero-sunlight skipping, near-boundary dawn/dusk restoration,
return to real time, retention of an existing map without disposal, continued
daylight auto-updates, and respect for authored disabled shadows. These are real
Three.js scene objects, without a GPU performance claim. Existing large-chunk
and partial-checkout `edge-mask.webp` build warnings remain.

The remaining roughly 22 ms GPU rendering time in this fixed view warrants
profiling exterior geometry/material cost before choosing additional LOD or
texture compression. No geometry simplification or KTX2 conversion is included
in this patch.
