# Verified exterior backface culling

The existing **Backface culling** control now covers verified exterior solids
as well as the house. Normal gameplay enables it; `?surfaceCulling=0` restores
the eligible materials' authored two-sided rendering. The switch under
`?perfdiag=1` changes both scenes, including shared batch/instance materials and
a house that loads after the setting changes.

## Eligible surfaces

The active world, Git blob `97e2f5e33ea4b50f3424db0f0b23f9dd39f88525`, has
**104 eligible meshes, 6,828 source triangles and eight cloned materials**.
These counts describe the surfaces that can reject back-facing triangles;
they are not removed/submitted triangle counts or an FPS measurement.

The same topology and render-state checks used inside the house inspect the
current export. Exact position welding handles UV/normal seams. Every edge must
have two opposite directed uses, with positive signed volume for every connected
shell. Open, degenerate, non-manifold and inward-facing components retain their
authored material. Transparency, alpha cutouts, custom shaders, skinning/morphs,
animation and unsupported render states remain excluded. Only the side of an
owned material clone changes; the authored material is retained for restoration.

The current world's leaves, water and detailed rock materials are not changed
by this pass. Existing exterior LOD continues to control the two dense rock
meshes. Geometry buffers, colliders, object names/hierarchy, textures, vertex
normals, material colors and lighting parameters remain authored.

## Preparation and integration

Exterior preparation limits inspection to **10,000 triangles per mesh**.
Larger meshes keep their original material without topology reads. This avoids
scanning the two dense rock meshes' 219,904 triangles at startup. The house's
existing default inspection limit is unchanged. This budget cannot reduce
geometry detail; it can only leave additional surfaces two-sided.

Player model/animation loading starts before the cooperatively sliced surface
audit, so their downloads overlap. Both finish behind the existing loading
screen before shader/texture preparation. A setting changed during the audit
is reapplied when preparation completes. Failure retains authored materials
and does not block world readiness.

Merging and instancing run after material preparation so front-/double-sided
assignments stay separate. In the actual world, merging still combines 11 meshes
into four batches with 132 triangles; instancing still combines 36 into 16 with
2,200 triangles. The control reuses prepared materials without rebuilding
geometry or batches. Diagnostic `[House physics]` windows now include actual
`exteriorSurfaceCulling` state outside; startup also logs
`[Exterior surface culling]`.

## Validation — October 26, 2026

All **103 local tests**, typecheck, production build and whitespace checks pass.
Four added regressions cover:

- Skipping over-budget topology reads, while retaining the house's default.
- The active-world snapshot, closed/outward checks, material properties, exact
  source stream fingerprints, names/transforms, excluded materials and disposal.
- Player/preparation overlap, changing the setting while preparation is pending,
  shared batch materials and a house created after the setting changes.
- Recovering from preparation failure with authored materials and world readiness.

The existing real house/world and exterior merging/instancing regressions also
exercise the new preparation order and shared culling switches. Local house
checks still use the prior export; the owner's earlier 93-test run covered the
newer house. The world fixture uses the current active asset. No GLB/Blender
source, texture, dependency or Vite configuration changes are part of this pass.

Build entry: 1,017.26 kB minified / 270.70 kB gzip. Required physics remains
2,855.12 / 1,078.39 kB. Existing large-chunk and partial-checkout edge-mask
warnings remain.

**The new exterior assignments have not yet been reviewed/timed in the owner's
live WebGL page.** Submitted draws/triangles can remain unchanged because
backface rejection happens during GPU rendering. No GPU/FPS or all-angle/pixel
equality claim is made from the CPU checks.

## Live review

After pulling, refresh `http://localhost:5173/?perfdiag=1`. At one unchanged
exterior camera, preview hour and native DPR, enable GPU timing and compare
Backface culling on/off/on, restarting readings after each mode settles. Confirm
`exteriorSurfaceCulling` reports 104 meshes and eight materials, and the expected
enabled state. Keep the other performance switches fixed.

Inspect the deck, rails, cottage, ground and paths from ordinary reachable
camera angles and during camera collision/near-surface movement. Check for
missing surfaces and shading changes, then verify house entry/exit, thin borders
and workshop/book interactions. Restore culling on, native DPR, shadows and real
time, with GPU timing off after the comparison. If a visibility regression
appears, `surfaceCulling=0` restores the previous exterior material sides.
