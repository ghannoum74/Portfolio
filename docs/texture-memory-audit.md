# Texture memory audit and shared book detail pages

Audit baseline: `ba29967c1370c386667d2ed3773a4a1178163798`, on
`perf/quality-preserving-runtime-2026-10-23`.

**Validation pending:** the execution workspace is unavailable. The repository
source was reviewed and one regression test was prepared, but the updated Node
test suite, TypeScript check, production build and browser book check have not
run. The earlier 84-test result predates this change. Keep the PR in draft.

## Change: one detail texture per project

`ProjectPageTextures.details()` previously keyed its cache by project ID and
resting/turning role. Both roles execute the same drawing code and apply the same
UV correction. The role argument does not otherwise change the content.

The cache now uses the project ID. Its existing role argument remains accepted
for caller compatibility. Resting and turning pages reuse the same CanvasTexture,
and the existing texture-UUID material cache can reuse its paper material too.
Separate projects still receive separate canvases/textures; screenshot pages
remain separate because their headings, URLs and content belong to each project.

The 1024 x 1536 dimensions, drawing commands, colors, sRGB setting, flipY,
repeat/offset, anisotropy and mipmap/filter settings are unchanged. Shared detail
textures should remain immutable after creation, as they currently are.

After visiting all four configured projects, the existing forward/backward flow
can cache seven detail textures: four resting pages and three turning backs.
The first project's turning-back variant is not reached by valid page turns.
The shared cache needs four detail textures.

| Estimate for the current four-project flow | Before | After | Removed |
| --- | ---: | ---: | ---: |
| Detail CanvasTexture objects | 7 | 4 | 3 |
| Base RGBA8 pixels | 42 MiB | 24 MiB | 18 MiB |
| RGBA8 pixels including full mip chains | About 56 MiB | About 32 MiB | About 24 MiB |

One full mip chain for a 1024 x 1536 RGBA8 image totals **8,388,604 bytes**.
Three avoided copies total **25,165,812 bytes**, or about 24 MiB.
This is a dimensional allocation estimate, not a measured driver/VRAM result.
CPU canvas backing stores may also be avoided; browser storage and actual GPU
allocation were not measured. This change does not establish an FPS increase.

## Prepared regression coverage

The existing common-performance suite now imports the production texture class
and project list. A lightweight 2D-canvas test double checks that:

- Both role calls return the same texture for one project.
- Different projects retain different textures and backing canvases.
- Page dimensions, color space, UV correction, anisotropy and filtering remain.
- Each shared texture is disposed exactly once, even after both roles use it.

The added test body was syntax-parsed during preparation. This is **not** an
executed Node test or a real canvas pixel comparison. Required verification once
the workspace is available:

```sh
npm test
npm run typecheck
npm run build
```

Then open all four book spreads, turn both directions and return with Esc.
Compare the resting and curling-page text/UVs at the same quality settings.

## Other asset findings

These are repository facts, not measurements from the newly attached Blender
files.

| Asset | Repository bytes | Current use / finding |
| --- | ---: | --- |
| environment/house.glb | 12,459,804 | Referenced by the active asset manifest |
| environment/house-webp.glb | 6,358,940 | Present, but not selected by the manifest |
| environment/world.glb | 5,362,764 | Referenced by the active asset manifest |
| environment/book.glb | 892,140 | Referenced by the active asset manifest |
| projects/project-one.png | 980,146 | Same Git blob as project-two.png |
| projects/project-two.png | 980,146 | Used by projects two through four |

The two PNG files share blob SHA
`d75f19ab235da351bf69382092459fb0a89749c7`, so their stored bytes are identical.
Their configured paths are retained so future project-specific replacements keep
their intended identities.

The smaller WebP house has not been compared against the active house for current
geometry, animations, material/UV data or close-up appearance. Its filename and
size do not establish equivalence. Selecting it remains a separate validation
task, rather than a verified optimization in this change.

The current loader configures Meshopt decoding; it does not configure KTX2
transcoding, and the repository tree contains no KTX2/Basis assets. KTX2/Basis is
a possible later GPU-texture-compression pass. It requires inspecting the active
model textures, choosing formats, adding capability-aware loader/transcoder
support, and comparing close-up appearance. No compressed texture conversion is
included here.

## Attached source files

The newly attached `portfolio(1).blend` and
`house-v2(20261023-185436).blend`, as well as the older `world.glb` and
`portfolio.blend1`, have not been inspected during this audit because the
execution workspace is unavailable. No Blender file or model binary is changed.

## Primary references

- [Three.js CanvasTexture defaults](https://threejs.org/docs/pages/CanvasTexture.html)
- [Three.js KTX2Loader and format detection](https://threejs.org/docs/pages/KTX2Loader.html)
