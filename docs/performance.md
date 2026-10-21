# Performance improvements — first pass

Baseline: `634dcd2f93fb60677a8ecfe8eb18066d5d2320e1`.

## Changes

- Stats graphs and GPU timestamp queries are opt-in. When enabled, one explicit
  timing scope covers the whole frame; stats-gl does not also wrap every pass.
- Renderer counters reset once per frame and accumulate the scene, outline,
  and output passes. Triangle totals include repeated passes and are not a
  count of unique geometry.
- Workshop, furniture, journey, and awards updates pause outside the house.
  On exit the house model detaches from the scene, avoiding hidden transform
  updates. Re-entry reattaches it with the same interaction state.
- Hidden bubbles skip instance matrix calculations and uploads. Their buffer
  uses dynamic usage; transparent furniture auras hide when their power is zero.
- The book mixer runs while opening or turning. Finished poses stay clamped.
- Camera debug geometry and helper updates run only when needed.
- Static building beams sharing a material are merged into root-local render
  meshes. In the current house, 61 source meshes become 2 render meshes while
  preserving all 5,104 triangles, positions, normals, UVs, and material references.
  The mirrored window bar keeps its original rendering. Source object names
  remain available; colliders and interaction objects are excluded.
- Independent query switches allow controlled comparisons.
- Three GLBs use unfiltered Meshopt encoding without simplifying, quantizing,
  joining, flattening, renaming, or changing textures. The existing loader already
  includes the compatible decoder. The unused `house-webp.glb` is untouched.
- Type checking is now available; its existing animation-frame callback error
  in StartupLoading was corrected.

## Asset results

| Asset | Before (bytes) | After (bytes) | Reduction |
| --- | ---: | ---: | ---: |
| house.glb | 19,611,060 | 12,459,804 | 36.5% |
| world.glb | 8,741,240 | 5,362,764 | 38.6% |
| book.glb | 2,031,792 | 892,140 | 56.1% |
| Total | 30,384,092 | 18,714,708 | 38.4% |

The optimizer verifies decoded geometry, triangle winding, morph targets,
animation samples, scene hierarchy, names, transforms, texture bytes, and
material definitions before accepting each output. It restores tiny source
transforms that the serializer would otherwise omit as near-default values.
All source files were byte-identical to the three baseline repository assets.
The separately supplied older world.glb is not used by this revision.

Compression reduces transfer size. It does not reduce triangle counts or
draw calls, and does not prove an FPS improvement.

## Run and verify

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run dev
```

Tests cover query options, outline/direct render paths, complete frame counters,
hidden bubble uploads and reactivation, decoding all compressed buffers with
Three.js's bundled decoder, loading/sampling the book's morph animations, beam
world-space geometry/material preservation, exclusion of animated/gameplay
objects, and the actual house's 61-to-2 beam batching result. There are 10 tests.

GPU rendering and gameplay have not been visually verified in the remote
environment, which could not create a WebGL context during the earlier tests.
Walk around outside, enter and exit twice, open/turn the project book both ways,
use workshop/map/awards, and toggle the furniture effects on your computer.
The existing Vite warning about a large JS bundle remains.

## Controlled captures

Keep the same browser, window dimensions, scene, route, and loading state.
Reload between configurations and wait for assets and shaders to settle.
Use the existing 20-second collector on each run. Disable stats in ordinary
captures to avoid measuring their overhead.

| URL query | Purpose |
| --- | --- |
| `?perfdiag=1` | New normal baseline: original visual quality, stats off |
| `?perfdiag=1&outlines=0` | Outline cost only |
| `?perfdiag=1&shadows=0` | Shadow cost only |
| `?perfdiag=1&dpr=1` | Resolution cost only |
| `?perfdiag=1&decorativeLights=0` | Furniture/workshop light cost; glow sprites remain |
| `?perfdiag=1&beamBatching=0` | Original separate beam meshes for comparison |
| `?perfdiag=1&stats=1` | CPU graphs enabled, GPU queries off |
| `?perfdiag=1&gpuStats=1` | Stats including GPU queries |
| `?perfdiag=1&lowfx=1` | Combined outlines/shadows/GPU-stats off and DPR 1 |

Stats graphs are visible whenever explicitly enabled, independently of the
debug UI. Normal DPR remains native, capped at 2. Explicit `dpr` values are
clamped between 0.5 and 2 and do not exceed native DPR. `lowfx=0` disables lowfx.
Decorative lights stay enabled by default, including in lowfx, for comparison
with the previous lowfx behavior. The decorative-light switch leaves the main
interior lights enabled.

The collector labels every configuration without `lowfx=1` as `normal`;
keep its complete recorded URL with each report or rename downloads to identify
the separate switches. The old captures are historical baselines: default stats
and full-frame counter behavior changed, so collect a fresh baseline first.
Renderer CPU timing measures JavaScript submission, not GPU execution.

## Reproduce asset compression

Keep the original Blender/export files. Copy the uncompressed exports into an
ignored `asset-sources` directory named `house.glb`, `world.glb`, and `book.glb`.
Then run:

```sh
npm run assets:optimize
npm test
```

Default output is `public/assets/models/environment`. Source and output
directories must differ. Custom locations are supported:

```sh
node scripts/optimize-assets.mjs /path/to/originals /path/to/output
```

Each output replaces the destination only after its checks pass. Original
exports also remain available in Git at the baseline commit above. Never use
an optimized output as the source for later art edits.

## Remaining investigation

### Follow-up captures, before beam batching

The warmed captures supplied on October 21 used identical window and canvas
dimensions. Both had stats/GPU stats disabled, shadows and decorative lights
enabled. Geometry counts were nearly stable (normal 533–534, outlines off 537).

| Metric | Normal | Outlines disabled |
| --- | ---: | ---: |
| Average FPS | 19.8 | 22.6 |
| Median frame time | 33.4 ms | 16.9 ms |
| 95th percentile frame time | 116.9 ms | 116.7 ms |
| 99th percentile frame time | 183.6 ms | 150.1 ms |
| Frames over 100 ms | 47 / 395 | 36 / 450 |
| Main-thread long tasks | 7 | 0 |

The outlines-off run was 14.1% faster on average, but the normal run's six
diagnostic snapshots also had outlineActive=false. Sparse snapshots do not
measure how long outlines were active between samples, and visible mesh/triangle
counts varied with camera direction. The entire improvement cannot be assigned
to outline rendering from this pair alone. Both reports had zero errors/warnings.
Long frames persist without recorded main-thread long tasks in the second run;
their cause is not identified by the collector.

### Next rendering change: small static beams

Beam batching targets CPU draw submission overhead without changing topology.
With every eligible beam visible it replaces 61 submissions with 2 per scene
pass. It does not reduce all scene rendering to two calls. Only a small set of
5,104 beam triangles shares coarser culling; large walls, high-poly stones, and
furniture keep their individual bounds. Transparent, mirrored, morphed, animated,
hidden, specially rendered, collider, and interaction meshes are excluded.
The batch uses the original material objects and shadow/layer settings.

This revision is enabled by default and can be disabled with beamBatching=0.
It passed CPU structural/transform tests and a production build, but GPU visuals
and FPS still require local verification. For a first capture, use
`?perfdiag=1&outlines=0` again after updating the branch and walking through the
house once. Compare it to the previous 22.6-FPS outlines-off capture while
checking that beams/window bars and interaction highlights still look correct.

### Geometry and remaining stalls

The house still has roughly 361k triangles and 366 exported mesh primitives.
Its two largest stone meshes contribute about 100k triangles. Simplification
and static batching need visual comparison and interaction exclusions before
they can be accepted. The world has roughly 240k triangles; two meshes account
for about 220k. Rendering passes can submit these triangles more than once.

The historical 327–333 ms stalls have not been attributed to a function. A fresh
Chrome Performance trace is required if they persist. No new FPS result is
claimed by these changes.
