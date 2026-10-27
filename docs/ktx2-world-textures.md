# Exterior KTX2 texture comparison

The normal game retains its original images. An explicit
`?perfdiag=1&ktx2=1` comparison replaces the exterior world's three opaque,
1024 × 1024 base-color images with UASTC KTX2 textures. House surfaces,
certificates, book pages, character textures and original model files remain
outside this pass.

This is a GPU texture-memory comparison, with no measured FPS benefit yet.
UASTC compression changes pixels; the result needs a native close-up review
before any default changes. The loader accepts only BC7 or ASTC 4×4 output for
this comparison. Devices without either format use the original images.

## Assets and offline checks

The current world is 5,044,436 bytes, Git blob
`97e2f5e33ea4b50f3424db0f0b23f9dd39f88525`, SHA-256
`2731f90a21b31b1cf7ec8d3f42df49bd81d15b6a58b409f0e3a114f41a4e8e88`.
The uploaded older world is not used as a replacement.

KTX-Software 4.4.2 encodes full dimensions at UASTC quality 4, with RDO disabled,
Zstandard level 18 and a full 11-level mip chain. Color primaries and transfer
function remain sRGB/BT.709. Mipmaps use a box filter and repeat wrapping; their
appearance can differ from driver-generated mipmaps and needs live review too.

| Original image | KTX2 bytes | Base-level RGBA decode PSNR | 99th-percentile RGB channel error |
| --- | ---: | ---: | ---: |
| PathRocks_Diffuse | 933,399 | 49.17 dB | 4/255 |
| Image_0 | 573,068 | 53.45 dB | 2/255 |
| tiny_treats_texture_1 | 53,515 | 58.46 dB | 1/255 |

The encoder rejects alpha changes, resizing, mixed color/data texture use,
PSNR below 42 dB or 99th-percentile RGB errors above 6/255. These checks compare
the source with an RGBA8 decode of UASTC, not pixels rendered by a BC7/ASTC GPU.
They do not establish perceptual equivalence at every distance or lighting angle.

| Three image allocations, including mipmaps | Payload / estimate |
| --- | ---: |
| RGBA8 | 16,777,212 B, about 16 MiB |
| BC7 or ASTC 4×4 | 4,194,384 B, about 4 MiB |
| Difference | 12,582,828 B, about 12 MiB / 75% |

The runtime's Basis WASM successfully transcodes all 33 mip levels to each of
BC7 and ASTC 4×4 in the Node regression. Those produced block-array sizes match
the table. GPU allocation/driver overhead, peak RAM, native upload latency and
frame rate have not been measured.

## Loading and failure behavior

The required world downloads once through the existing startup manager. Only
when the explicit diagnostic flag is present does the asset loader import the
compression code. It reads the optional manifest, verifies SHA-256 against the
actual downloaded GLB, and makes a temporary GLB copy with different image
references. The entire original BIN chunk and the JSON geometry, nodes,
transforms, materials, samplers, animations and collider tags remain unchanged.
The standard GLTFLoader and KHR_texture_basisu extension handle the images.

This preserves existing Meshopt data and exterior LOD geometry hashes. It also
prevents a future Blender re-export from silently using stale compressed
textures. Rebuilding the sidecars updates the source fingerprint.

Optional resources have their own loading manager so failure does not poison
required startup validation. Unsupported formats, stale source fingerprints,
missing optional code/manifest, failed transcodes and unexpected texture
formats/dimensions/mipmaps fall back to parsing the same original source bytes.
Only a successful world load marks the original required asset ready. Invalid
completed candidates release their textures/materials/geometry; the KTX2 loader
releases its worker pool after the comparison load.

The Performance folder's read-only **World textures** field shows `original`
or `ktx2-uastc`; its disabled appearance is intentional. The **KTX2 status** text
field is read-only but selectable/copyable. It distinguishes a missing
`&ktx2=1` flag from loading, an active target and the actual fallback reason.
Worker error-event messages and optional module-load errors are retained.
Texture callback failures are captured before GLTFLoader can replace a failed
map with null, so a missing/bad asset reports its URL and underlying error.
The downloadable report records `worldTextureCompression`,
including actual format or fallback reason. The requested URL flag alone is
not proof that compression was used. This field describes the exterior asset
even in a report captured inside the house.

### Delivery tradeoff

The comparison keeps the original GLB intact, including its unused original
image payload, and adds 1,559,982 bytes of KTX2 sidecars. That is extra transfer,
not a download-size improvement. Even as direct image replacements, these KTX2
files are larger than the existing 985,594 bytes of lossless WebP images.

The production build emits the transcoder from the installed Three.js package:
57.53 kB of JS plus 527.33 kB of WASM before HTTP compression, together with lazy
comparison/loader chunks. Normal gameplay does not request these resources.
The temporary GLB copy and transcoder introduce opt-in startup work and a memory
peak that are not measured here. Keeping this comparison off by default lets
us evaluate the GPU memory benefit alongside those costs.

## Regenerate after a Blender export

Install [KTX-Software](https://github.com/KhronosGroup/KTX-Software/releases),
with `ktx` on PATH. Version 4.4.2 was used for the shipped sidecars.
The committed sidecars and normal tests/build do not require the native SDK.

```sh
npm run assets:ktx2 -- --report docs/ktx2-texture-review.json
```

An executable outside PATH can be provided without shell-string interpolation:

```sh
npm run assets:ktx2 -- --ktx "C:/Program Files/KTX-Software/bin/ktx.exe" --report docs/ktx2-texture-review.json
```

The generator does not overwrite its source. It stages all encoded files and
checks their pixels/container data before replacing the manifest. Failed
conversion retains the previous manifest and removes temporary public files.
Content-hashed filenames avoid reusing cached images from an older conversion.
Older sidecars are not deleted automatically.

### Root-relative model folder fix

The first comparison used image URIs beginning `/assets/models/environment/`
and passed that same root-relative folder to `GLTFLoader.parseAsync`. Three.js
concatenated them, requesting paths such as
`/assets/models/environment//assets/models/environment/ktx2/world-2-….ktx2`.
The dev server could then return HTML instead of image bytes. GLTFLoader logged
the missing texture, swallowed the image rejection, and returned a model with
missing maps; the later validation incorrectly labeled this a format error.

The temporary GLB now uses model-relative `ktx2/world-….ktx2` image URIs. The
manifest retains its canonical URLs. The exact previous console/status error
was reproduced before this change, and the same root-relative loading test now
loads all three textures. The format checks remain strict. Missing-map counts
and texture fetch/decode errors have separate messages.

## Validation and remaining review

The 132-test local suite, typecheck, production build and whitespace checks
passed. The new tests cover source/geometry identity, flag independence,
ordinary asset loading, fail-open startup, invalid/stale manifests, BC7/ASTC
selection, worker/candidate cleanup, encoder failure, numerical quality gates,
real asset hashes and the runtime Basis WASM's mip-by-mip compatibility.
An additional HTTP regression uses the production GLTF/KTX2 loaders and Basis
worker program, with VM message transport and browser-like Request/fetch URL
resolution on the CPU. It checks all three canonical requests, successful BC7
materials, forced HTTP 404 and HTTP-200 HTML responses, accurate fallback errors,
a peak of two workers, and worker cleanup after every condition. This test and
the existing DOM/renderer/optional-loader test doubles do not prove native WebGL
operation or an FPS gain.
Existing house tests still use the older execution-workspace house fixture;
this pass does not replace or claim to retest the owner's newer house export.

The main entry builds to 1,025.58 kB minified / 273.38 kB gzip, versus the preceding
1,022.71 / 272.25 kB. Physics is unchanged at 2,855.12 / 1,078.39 kB. KTX2 assets
and loader/transcoder code are lazy. A separate dependency-graph check confirms
that the ordinary AssetLoader's static graph excludes the comparison module and
KTX2 loader/transcoder. Existing large-chunk and partial-checkout
edge-mask build warnings remain.

For a native comparison, use these two URLs sequentially, with the same camera,
viewport, DPR, fixed preview hour and quality settings:

1. Original: `http://localhost:5173/?perfdiag=1`
2. Compressed: `http://localhost:5173/?perfdiag=1&ktx2=1`

Check **World textures** in Performance before interpreting readings. If it
shows `original`, copy **KTX2 status** or download the report so the exact reason
can be inspected. Do not infer unsupported hardware from the mode alone. Compare
rocks, ground/cliffs and the prop atlas close up and at distance. Confirm full
LODs, seams, wrapping, colors, shadows and animated water still match the intended
appearance. Enable GPU timing if available, restart readings and hold the same
view for 20 seconds, then download a report for each condition. Return to the
original URL afterward. No new native measurements or default changes are
claimed by this pass.

## Primary references

- [Three.js KTX2Loader](https://threejs.org/docs/pages/KTX2Loader.html)
- [KHR_texture_basisu](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_texture_basisu/README.md)
- [KTX-Software create options](https://github.khronos.org/KTX-Software/ktxtools/ktx_create.html)
