# First house visit

The first successful entry introduces the Projects Book, Journey Map,
Achievements and Workshop as optional objectives. Each cue briefly frames the
real object, then restores the visitor's camera and movement. A small card and
an on-screen diamond help the visitor find the current objective.

The next cue waits until the current interaction has successfully opened and
the visitor has closed it. Discoveries made out of order count immediately and
are omitted from later cues. Missing destinations are omitted.

- **E**, **Enter**, **Space**, or **Let me explore** ends a camera cue early.
- **Esc** during a cue, or **Skip guide**, dismisses the entire guide.
- Leaving the house cancels pending cues and restores camera ownership.
- Reduced-motion visitors get objective cards without camera cutaways.

The entry is remembered under `portfolio.house-first-visit.v1` in localStorage
as soon as the guide starts. Re-entry and reload therefore do not restart it,
including when the visitor leaves early. If storage is blocked, the guide still
runs at most once within the current Game instance.

For a repeat development check, remove that one key in the browser's application
storage panel and reload. No geometry, interaction markers or house assets need
to be re-exported. Camera directions use existing camera markers where present;
otherwise they approach real target bounds from the entrance. Portrait framing
lowers the viewing angle to stay below the cottage roof. Transitions cut under
an opaque cover rather than flying through furniture.

## Validation

`npm run typecheck`, `npm run build`, and `node --test tests/house-guide.test.mjs`.
The guide tests cover successful/failed house entry, completion hooks, input and
camera ownership, skip/cancel during every transition, blocked storage, reduced
motion, reload, missing targets, out-of-order exploration, and landscape/portrait
framing with the production house geometry.

The house at base commit `3a19599c51b600118b138943b14f538b65e315b4` also has
three existing performance-test failures: its new house export is uncompressed,
the stone LOD source has changed, and its surface-culling hash has not been
reviewed. This feature does not change model files or those performance checks.
