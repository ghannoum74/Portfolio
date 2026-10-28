# Follow camera stability

Walking or turning past house furniture and beams could make the camera shift
between two follow behaviors. `ThirdPersonCamera` interpolated its position in
open space but copied the unsmoothed collision endpoint on every blocked frame.
An obstructed turn therefore skipped the normal follow damping. Brief clear
frames at an edge moved the camera out, followed by an immediate pull-in when
the next frame detected the obstruction again.

Walking also exposed a separate timing problem: the avatar root was copied from
Rapier only after a fixed 60 Hz physics step, while the camera aimed at that
stepped position on every render frame. At higher or uneven render rates this
produced a repeated pitch vibration, even with a flat floor and no camera blocker.

## Resulting behavior

- An independent requested camera position follows the player continuously,
  including while the actual camera is shortened by an obstacle.
- A fixed-collider sphere sweep checks that smoothed path each update. Inward
  shortening is immediate for a present obstruction. Additional distance becomes
  available smoothly.
- While turning, the camera checks three approaching orbit headings, up to
  450 ms or 90 degrees ahead, and refines the first predicted impact time.
  Proactive shortening is scheduled before that impact and limited to 10 m/s.
  A prediction remains valid until arrival even when a thin obstacle briefly
  falls between sample headings; reversing the turn or moving the pivot cancels it.
- Full clearance must persist for 100 ms before the camera expands again. Brief
  misses at posts, beam edges or furniture no longer start an outward recovery.
- `snap()` checks collisions and resets follow/recovery state for house entry,
  exit and returns from a seated or inspection camera.
- Close walls can fully shorten the camera arm. The former 15 cm minimum could
  force the camera beyond the clearance returned by Rapier.
- Straight movement retains one sweep per update. Turning uses at most seven,
  including the present-path sweep and bounded prediction/refinement queries.
  The existing query cache remains active at rest. Vectors and query results are
  reused, without per-frame allocations.
- Rendering interpolates the avatar's position between the last two physics
  samples, using the accumulator fraction on every displayed frame. The camera
  follows that same visual position. The usual one-physics-step visual delay is
  bounded to about 16.7 ms; simulation input, colliders and heading remain current.
- Animation advances once per displayed frame, including frames between physics
  steps, and drops the same excess backlog as physics after a severe stall.
  Teleports reset both position samples; seated poses bypass interpolation.

The change preserves camera offsets, lens/projection settings, rendering options,
movement controls, physics stepping, scene assets and interaction cameras.

## Verification

The original implementation failed four deterministic native Rapier regressions:
a small obstructed turn jumped sideways by 0.10183 m in one 60 Hz frame; one
clear frame extended the camera arm by 0.17721 m; brief clearance started recovery
immediately; and `snap()` placed the camera beyond a nearby wall.

Full-turn testing also reproduced a 2.559 m single-frame camera jump beside the
highlighted fireside chair and a 2.949 m jump while dragging around a furniture
collider. The player's unwrapped yaw remained continuous: the apparent reset was
the abrupt loss of camera clearance when its orbit entered the furniture's shadow.
Turn prediction addresses this before the present-path safety clamp is needed.

Sixteen camera regressions now pass:

1. Obstructed turn displacement stays below 0.025 m for that same small turn.
2. Repeated three-frame clearance intervals do not change the resting arm length.
3. A new obstruction shortens the arm immediately, with delayed, smooth recovery.
4. A close-wall query keeps the camera sphere outside the wall even with less
   than 15 cm of clearance.
5. Transition and cinematic-return snaps discard stale obstruction history and
   retain projection settings.
6. Stationary queries cache, and straight movement uses one sweep per update.
7. A blocked turn converges consistently at 30, 60 and 120 FPS.
8. Walk and run paths, including reversing and changing heading, run for 960
   combined physics frames against the reference house GLB's actual colliders;
   camera spheres do not intersect fixed geometry.
9. Repeated full turns in both directions beside the highlighted fireside chair
   and alchemy stool retain unwrapped player heading and collision clearance;
   per-frame camera movement stays below 0.35 m in these 60 Hz fixtures.
10. Multiple dragged camera revolutions and release preserve the viewing direction,
    including angle wrapping, without rotating the player.
11. Turn prediction stays within its seven-sweep budget and stops querying at rest.
12. Zero-time frames during a turn keep the camera finite and stationary.
13. Visual interpolation uses the last two substeps, preserves unwrapped heading
    and never feeds an interpolated position back into the physics body.
14. Teleports render at their destination for every interpolation fraction.
15. Walking on a flat floor at 120/144 Hz and uneven render intervals keeps
    frame-to-frame camera pitch RMS below 0.0006 radians. The 120 Hz probe reduced
    RMS from 0.001263 to 0.000286 radians without changing the camera lens.
16. Interpolated walk/run paths toward the hearth and backward, with high and
    uneven render rates, keep the camera sphere outside the actual house colliders.

The world-loop integration test also verifies that fractional render frames sync
the visual pose and advance animation without taking extra physics steps.

`npm test` passes all 157 tests, `npm run typecheck` and `npm run build` pass,
and `git diff --check` passes. The build retains its existing edge-mask asset
and chunk-size warnings.

The fixture uses the repository house available in this workspace. These checks
do not replay the owner's latest local Blender export or measure their Intel GPU.
Review the recorded route after pulling the feature branch, including turns by
the bed, fireplace and overhead beams, dragging the camera, and E/Esc returns.
