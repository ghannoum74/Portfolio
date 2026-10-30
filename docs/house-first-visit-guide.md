# Cinematic first house visit

The first successful entry plays an automatic tour of the Projects Book,
Journey Map, Achievements and Workshop. It begins with a welcome view, travels
to each available section, pauses for 3.4 seconds with a short caption, and
returns to the original player view at the end. No interaction is required to
advance, and player control is retained by the tour for the entire sequence.

Shots use oblique angles and wider context rather than the book reading
camera. Real target bounds are framed with room for their surroundings. Travel
uses swept camera-sphere checks against existing fixed colliders, roof
clearance and the floor footprint. Blocked routes use a small navigation grid;
curves are accepted only when their sampled segments stay clear. A short fade
is used if no clear travel route exists. Roof and furniture checks do no work
after the tour ends.

- **Enter**, **E**, **Space**, or **Next section** advances during a pause.
- **Esc** or **Skip tour** ends the tour and restores the player camera.
- Leaving the house cancels it synchronously before the scene transition.
- Reduced-motion visitors see every section as still shots with short fades.
- Missing destinations are omitted; a failed house load consumes no visit flag.

First entry is remembered under `portfolio.house-first-visit.v2` in localStorage
as soon as the tour starts. It does not repeat on re-entry, reload, or after a
skip. The new version key lets visitors who only saw the previous book hint see
the complete cinematic tour once. If storage is blocked, it runs once within
the current Game instance.

For development replay, remove that one key and reload. No Blender re-export
is needed. Optional `CAMERA_TOUR_PROJECTS`, `CAMERA_TOUR_JOURNEY`,
`CAMERA_TOUR_AWARDS` and `CAMERA_TOUR_WORKSHOP` markers can set the preferred
viewing direction. Existing camera markers and entrance direction are used
otherwise; their reading angles are replaced by oblique tour framing.

## Validation

`npm run typecheck`, `npm run build`, and `node --test tests/house-guide.test.mjs`.
Tests cover automatic progression through every section, continuous movement,
final camera/input restoration, entrance success/failure, skip/cancel, reduced
motion, reload/version migration, missing destinations, blocked storage,
landscape/portrait framing, production-house collision clearance and obstructed
routes. Live visual review in the browser remains part of local acceptance.
