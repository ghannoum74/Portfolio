# Texture memory audit and shared book detail pages

Audit baseline: `ba29967c1370c386667d2ed3773a4a1178163798`, on
`perf/quality-preserving-runtime-2026-10-23`.

**Book-cache checks passed:** all 85 tests, typecheck, production build and
whitespace checks passed once the execution workspace recovered. The added test
exercises production texture creation and disposal with a canvas test double.
A live book recheck remains pending. The later
[lossless delivery pass](lossless-texture-packing.md) records the additional asset
changes and its separate validation. Keep the PR in draft for live review.

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

## Regression coverage

The existing common-performance suite now imports the production texture class
and project list. A lightweight 2D-canvas test double checks that:

- Both role calls return the same texture for one project.
- Different projects retain different textures and backing canvases.
- Page dimensions, color space, UV correction, anisotropy and filtering remain.
- Each shared texture is disposed exactly once, even after both roles use it.

The added regression passed in the executed Node suite, with typecheck and build.
It is not a real canvas glyph/pixel comparison. Verification commands:

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
| environment/world.glb | 5,362,764 | Baseline before the later lossless image packing; now 5,044,436 B |
| environment/book.glb | 892,140 | Referenced by the active asset manifest |
| projects/project-one.png | 980,146 | Same Git blob as project-two.png |
| projects/project-two.png | 980,146 | Used by projects two through four |

The two source PNG files share blob SHA
`d75f19ab235da351bf69382092459fb0a89749c7`, so their stored bytes are identical.
The later packing pass adds separate `project-one.webp` and `project-two.webp`
runtime paths, retaining independent project-specific replacement identities.

### Exported texture inventory

The active house has 15 embedded images: thirteen 512 x 512 JPEG surface maps and
two WebP certificate images (1755 x 1240 and 560 x 800). Its image payload totals
well under 1 MB; most of its 12.46 MB file is geometry and other model data. The
world has three 1024 x 1024 images, now packed losslessly. The book GLB embeds no
images; its full-resolution pages are generated at runtime.

As a size reference, one RGBA8 allocation per image with a complete mip chain is
about 30.7 MiB for the house and 16 MiB for the world. Eight generated book page
textures after visiting all projects would be about 64 MiB. These exclude other
textures and render targets, and do not measure actual driver memory. WebP does
not reduce these decoded allocation estimates.

The inactive `house-webp.glb` is a different asset: 201 meshes/19 materials,
compared with the active house's 248 meshes/72 materials. It uses different
material maps as well. Its smaller file size does not establish equivalence.

The current loader configures Meshopt decoding; it does not configure KTX2
transcoding, and the repository tree contains no KTX2/Basis assets. KTX2/Basis is
a possible later GPU-texture-compression pass. It requires inspecting the active
model textures, choosing formats, adding capability-aware loader/transcoder
support, and comparing close-up appearance. KTX2/Basis GPU compression is not
included in the lossless WebP delivery pass.

## Attached source files

This pass inspects the active runtime GLBs. The recovered workspace contains
`01-world.glb` and `02-portfolio.blend1`, but the newer `portfolio(1).blend` and
`house-v2(20261023-185436).blend` filenames are not present. Their Blender content
has not been inspected. The older world attachment is not used to replace the
current runtime world. Blender files remain unchanged; the runtime world changes
only through the verified lossless image packing described above.

## Primary references

- [Three.js CanvasTexture defaults](https://threejs.org/docs/pages/CanvasTexture.html)
- [Three.js KTX2Loader and format detection](https://threejs.org/docs/pages/KTX2Loader.html)
