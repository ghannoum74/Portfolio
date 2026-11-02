# The final brew and restored guides

Based on `main` at `ec6f8db`. The cauldron is now an optional closing side quest: a landing-page brief gains accounts/payments, a dashboard and offline sync, then ends with “Congratulations. You have summoned a platform.” Each action advances one step and changes the existing cauldron's effect color. The parchment panel includes an inline animated SVG, progress, back/replay controls, keyboard and touch actions, reduced-motion support and an always-accessible close button. There are no timers or mandatory completion gates.

The final step links to the real Sudoku project and the existing CV PDF. “Let’s build something” closes the cauldron panel, releases furniture focus and opens the existing contact panel. The story is a fictional brief, not a claim that the linked project implements those requirements. The project list reverted to placeholders during the merge; the three factual entries and existing preview paths are restored from `c48a464`.

## Why the guides disappeared

The current main tree omitted `MTC.glb`, `prodigy.glb` and `se-factory.glb` while `AssetManifest.ts` still requested their exact filenames. The optional NPC loader downloaded the group before creating any of its members. One missing file rejected that operation, preventing the remaining optional characters from appearing too. The playable avatar file itself was present.

The three original compressed files are restored byte-for-byte from the last working feature tree. Optional guides now load independently, still with a maximum of two requests in flight. Successful guides are retained on failure, Game registers their interactions in its completion/failure path, and retry loads only missing IDs. Frequenc remains a startup dependency. Shared animation downloads, deduplication, definition ordering and indoor detachment remain covered by tests.

`npm run build` now first runs `scripts/check-runtime-assets.mjs`. It derives the 22 required GLB URLs from the existing manifest and checks their exact public paths and container headers. A missing, incomplete or incorrectly cased file fails the build with its URL. Optional LOD sidecars are not deployment gates. `npm test` uses native Node test discovery because the previous command still named several tests deleted during the merge.

## Verification

- TypeScript, the required-asset guard and the production build pass. All 22 required GLBs decode through the actual Three.js/Meshopt geometry loader, including the playable avatar and all seven guides.
- Seven new focused checks pass: the ending story/actions/replay/exit, real project/CV routes, loading all seven real guide models with animations and Rapier colliders, one-model failure/retry, Game registration after failure, shipped asset presence and the negative missing/truncated build-guard case.
- Browser QA exercised the actual ending panel at desktop size and in a 667 × 375 mobile iframe, completed it with clicks and E, and verified its handoff to the actual contact panel. Full 3D GPU rendering remains unverified because the preview browser has WebGL disabled.
- The full discovered suite is 125/142 passing. A clean main baseline is 115/135 passing; all 17 remaining failing test names are also present in that baseline. Three baseline failures are resolved. Existing unrelated fixture/asset/LOD fingerprint failures remain outside this change. The old NPC loader fixtures and the restored three-project book count were updated to their current contracts.

The branch targets `main`; publishing its source does not merge or deploy production.
