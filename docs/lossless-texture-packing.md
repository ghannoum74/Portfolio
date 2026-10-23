# Lossless texture delivery

Baseline: `ee223af1aa96933a40ab984bbecbdba3e75c2286` on
`perf/quality-preserving-runtime-2026-10-23`.

The exterior's three embedded PNGs and the two project screenshot URLs now use
lossless WebP. Every decoded RGBA pixel and original image dimension matches.
The screenshot paths remain separate so each project image can be replaced
independently. The original PNG files remain available in the repository.

| Requested asset | Before | After | Saved |
| --- | ---: | ---: | ---: |
| environment/world.glb | 5,362,764 B | 5,044,436 B | 318,328 B (5.9%) |
| projects/project-one | 980,146 B | 664,422 B | 315,724 B (32.2%) |
| projects/project-two | 980,146 B | 664,422 B | 315,724 B (32.2%) |
| Total across these three URLs | 7,323,056 B | 6,373,280 B | 949,776 B (13.0%) |

These are stored asset bytes, before HTTP compression. A visitor must request all
three URLs to realize the total; browser/CDN caching and transport compression
affect actual transfer. This does not measure cold-load latency or an FPS gain.
WebP reduces encoded size; decoded texture dimensions and GPU storage are
unchanged. The separate book-detail cache change avoids duplicate GPU textures.

## Preservation and compatibility

`pack-lossless-textures.mjs` compares source and output dimensions and every RGBA
pixel before accepting output. It retains the PNG when WebP would not be smaller
inside a GLB. It rejects animated, oriented, profiled, non-sRGB or non-8-bit PNGs
rather than treating their color conversion as lossless.

The GLB packer copies all non-image binary bytes exactly. It relocates physical
bufferView and Meshopt payload offsets, retaining virtual fallback offsets.
Nodes, names, transforms, meshes, accessors, materials, samplers, skins, animations,
scenes and cameras retain their JSON values. Unknown extensions and overlapping
image/geometry ranges are rejected. Output replaces the destination only after
verification succeeds, using a temporary file next to it. Sources stay separate.

WebP image references use `EXT_texture_webp`, declared used and required because
the GLB does not retain a PNG fallback. The project's existing Three.js GLTFLoader
supports this extension. The project already uses WebP textures in the house.
The supported browser must decode WebP; legacy non-WebP loaders are unsupported.

For the actual world, both source and output were also read through NodeIO and
the game Meshopt decoder. Their complete decoded snapshots match after restoring
the source encoded image bytes in the inspection copy. The asset file itself is
not restored or modified by this comparison. A separate Pillow decode confirms
the three embedded images and two screenshots have identical RGBA pixels.
Hashes, dimensions and per-image sizes are in
[the machine-readable review](lossless-texture-packing-review.json).

## Repeat after a Blender export

Keep authored exports in `asset-sources/house.glb`, `asset-sources/world.glb` and
`asset-sources/book.glb`, then run:

```sh
npm run assets:optimize -- --lossless-textures
```

This applies the existing verified Meshopt packing, then verified lossless PNG
packing, before replacing each runtime GLB. It writes the final sizes and texture
details to the existing environment size report. Plain `npm run assets:optimize`
retains its earlier behavior of preserving encoded texture bytes.

For a single GLB, keep input and output paths different:

```sh
npm run assets:textures -- asset-sources/world.glb public/assets/models/environment/world.glb
```

For project screenshots, convert each replacement PNG and keep the `.webp` path
in `src/data/projects.ts`:

```sh
npm run assets:textures -- public/assets/projects/project-one.png public/assets/projects/project-one.webp
npm run assets:textures -- public/assets/projects/project-two.png public/assets/projects/project-two.webp
```

The full 5800 x 3197 screenshot dimensions are retained. This pass does not require
editing the Blender scene. Re-exporting alone does not apply runtime packing.

## Validation

The regression suite covers alpha/color preservation, raw and Meshopt binary
relocation, runtime geometry decoding, material/sampler/transform preservation,
repeat packing, unknown extensions, overlap rejection, source preservation,
atomic failure and the combined Meshopt/texture pipeline. Shipped assets are
checked against recorded Git hashes, image dimensions and source RGBA hashes.

All **91 tests**, typecheck, production build and whitespace checks pass for the final image-packing
code, including the earlier shared book-detail texture change. Existing large
chunk and partial-checkout `edge-mask.webp` build warnings remain. The full
three-model command was also run on the current environment: it reproduced the
shipped packed world and the unchanged house/book files byte for byte.
A live browser recheck of the latest assets and
book texture sharing remains pending; earlier browser captures predate both.

## Primary references

- [Khronos EXT_texture_webp](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Vendor/EXT_texture_webp/README.md)
- [Sharp WebP output options](https://sharp.pixelplumbing.com/api-output/#webp)
- [Three.js GLTFLoader supported extensions](https://threejs.org/docs/pages/GLTFLoader.html)
