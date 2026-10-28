# Follow camera stability

Walking or turning past house furniture and beams could make the camera shift
between two follow behaviors. `ThirdPersonCamera` interpolated its position in
open space but copied the unsmoothed collision endpoint on every blocked frame.
An obstructed turn therefore skipped the normal follow damping. Brief clear
frames at an edge moved the camera out, followed by an immediate pull-in when
the next frame detected the obstruction again.

## Resulting behavior

- An independent requested camera position follows the player continuously,
  including while the actual camera is shortened by an obstacle.
- A single fixed-collider sphere sweep checks that smoothed path each update.
  Inward shortening is immediate. Additional distance becomes available smoothly.
- Full clearance must persist for 100 ms before the camera expands again. Brief
  misses at posts, beam edges or furniture no longer start an outward recovery.
- `snap()` checks collisions and resets follow/recovery state for house entry,
  exit and returns from a seated or inspection camera.
- Close walls can fully shorten the camera arm. The former 15 cm minimum could
  force the camera beyond the clearance returned by Rapier.
- The existing query cache remains active at rest. Movement adds no second sweep
  per frame, and the update introduces no vector allocations.

The change preserves camera offsets, lens/projection settings, rendering options,
movement controls, physics stepping, scene assets and interaction cameras.

## Verification

The original implementation failed four deterministic native Rapier regressions:
a small obstructed turn jumped sideways by 0.10183 m in one 60 Hz frame; one
clear frame extended the camera arm by 0.17721 m; brief clearance started recovery
immediately; and `snap()` placed the camera beyond a nearby wall.

Eight camera regressions now pass:

1. Obstructed turn displacement stays below 0.025 m for that same small turn.
2. Repeated three-frame clearance intervals do not change the resting arm length.
3. A new obstruction shortens the arm immediately, with delayed, smooth recovery.
4. A close-wall query keeps the camera sphere outside the wall even with less
   than 15 cm of clearance.
5. Transition and cinematic-return snaps discard stale obstruction history and
   retain projection settings.
6. Stationary queries cache, and movement uses at most one sweep per update.
7. A blocked turn converges consistently at 30, 60 and 120 FPS.
8. Walk and run paths, including reversing and changing heading, run for 960
   combined physics frames against the reference house GLB's actual colliders;
   camera spheres do not intersect fixed geometry.

`npm test` passes all 148 tests, `npm run typecheck` and `npm run build` pass,
and `git diff --check` passes. The build retains its existing edge-mask asset
and chunk-size warnings.

The fixture uses the repository house available in this workspace. These checks
do not replay the owner's latest local Blender export or measure their Intel GPU.
Review the recorded route after pulling the feature branch, including turns by
the bed, fireplace and overhead beams, dragging the camera, and E/Esc returns.
