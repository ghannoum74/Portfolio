# House geometry after Meshopt

The three supplied files reproduce two independent runtime issues:

- `batchHouseBeams` cloned normalized integer attributes and baked mesh transforms back into those same buffers. Positions outside the integer attribute's decoded range wrapped/clamped, collapsing ceiling/furniture beam parts around the room origin. The source GLB remained correct.
- In `house-optimized.glb`, `COL_BOX_PLANT` became a named Object3D with a mesh child. `WorldColliders` previously recognized only a mesh whose own name started with `COL_`, so this helper stayed visible and had no physics shape.

Beam batching now decodes position, normal and tangent attributes into owned Float32 buffers before transforming the temporary geometry. Existing UV/color/index storage, source arrays and authored gameplay nodes are retained. All 61 eligible parts still merge into two batches (5,104 triangles). This also supports normalized interleaved attributes; tangent handedness is preserved.

The collider importer now uses the nearest explicit `COL_` owner for mesh children, creates the appropriate shape from each child's world geometry and hides the whole helper subtree. Nested typed helpers keep their own shape type. Detection zones remain excluded, and ordinary visible props do not acquire generated colliders.

## Exact-file audit

CPU inspection loaded all three GLBs with the runtime Three.js/Meshopt decoder, preserving geometry, hierarchy and animation. Texture references were omitted only from the inspection copy because CPU tooling cannot decode browser images. The audit applied house offset, colliders, beam batching, closed-surface preparation, static batching and static transforms.

| Uploaded file | Beams → batches | Colliders | Visible helper meshes | Largest beam-bounds error |
| --- | --- | ---: | ---: | ---: |
| house-resized.glb | 61 → 2 | 58 | 0 | 0.000000448 |
| house-webp.glb | 61 → 2 | 58 | 0 | 0.000000448 |
| house-optimized.glb | 61 → 2 | 58 | 0 | 0.000000439 |

Bounds are compared in world space against the decoded source geometry immediately before batching, not against the unquantized file. Every original position buffer remained byte-for-byte unchanged. Before the repair, the optimized file's batches collapsed into approximately a 2 × 2 × 2 region around the house origin and the plant helper remained visible; the resized/WebP files did not exhibit that collapse.

The existing general static-batching path conservatively skips quantized attributes. The optimized file therefore retains those props as their authored meshes while beam batching continues to reduce its draw calls. Existing optional LOD sidecars that no longer match compressed geometry remain rejected rather than replacing the new source data.

## Verification

- Parameterized beam regressions compare world positions, normals, tangents, UVs, source buffers and shadow/material settings for float, normalized integer and interleaved integer geometry.
- Collider regressions exercise an actual Meshopt wrapper, real Rapier hits, subtree visibility, nested owner types and zone/visual exclusions.
- TypeScript and the production build pass. The full suite is 212/224 passing. A clean baseline at `193e2a1` is 208/220 passing with the identical twelve failing test names (existing content/asset/batching/LOD fingerprint expectations); the repair adds four passing cases and no new failures.

The uploaded binaries are not rewritten or committed by this repair. Use the existing optimized house with the updated runtime. Full WebGL visual QA remains unverified because the available preview browser has WebGL disabled; the exact decoded geometry and physics paths were checked on the CPU.
