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
Three.js's bundled decoder, and loading/sampling the book's morph animations.

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

The house still has roughly 361k triangles and 366 exported mesh primitives.
Its two largest stone meshes contribute about 100k triangles. Simplification
and static batching need visual comparison and interaction exclusions before
they can be accepted. The world has roughly 240k triangles; two meshes account
for about 220k. Rendering passes can submit these triangles more than once.

The historical 327–333 ms stalls have not been attributed to a function. A fresh
Chrome Performance trace is required if they persist. No new FPS result is
claimed by these changes.
