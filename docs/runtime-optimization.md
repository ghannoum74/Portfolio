# Combined runtime optimization

Branch: `perf/quality-preserving-runtime-2026-10-23`.
Base: `perf/house-runtime-2026-10-21` at `5f6bebec8f0c5484e9d611ebf0aa3f4a16042b68`.

The later [common performance pass](common-performance.md) adds exact exterior
instancing, asynchronous physics loading, startup overlap and camera-query reuse.

## Result

The additional rendering pass batches nearby, non-overlapping opaque decorations,
freezes local transform composition for authored static nodes, retains border
shader materials across focus changes, and prepares textures/light variants under
the loading cover. It preserves the existing resolution, models, surface values,
textures, close-up detail, gameplay targets and inspection-only workshop lighting.

| Scene | Additional source meshes | Additional batches | Preserved triangles | Frozen local transforms |
| --- | ---: | ---: | ---: | ---: |
| Repository house | 50 | 22 | 7,576 | 235 |
| Repository exterior | 11 | 4 | 132 | 218 |
| Last captured local house | 50 | 22 | 7,576 | 236 |

These are whole-asset eligibility counts. They are not camera-frame counters or
FPS gains. The earlier 61-to-2 beam batching remains a separate optimization.
New batches have conservative spatial limits: 3-world-unit cells, individual
objects no larger than 3 units, at most 24 sources and 12,000 triangles per batch.
Objects above 4,000 triangles retain their own draws. Intersecting world bounds
stay separate to preserve possible coplanar/tie ordering.

## Appearance and ownership

- Batches retain original material references, layers and shadow flags. They
  preserve attributes and ordered triangles; source geometry is never rewritten.
- Named source nodes remain available. Source render meshes hide while their
  replacements draw; disabling batching detaches replacements and restores sources.
- Gameplay/section/book/collider/zone nodes and descendants, animation bindings,
  skinning, morphs, instancing, mirrored roots/meshes, custom hooks, cutouts,
  transparency, displacement and unusual render state are excluded. Quantized
  integer position/normal/tangent attributes are excluded from transform baking.
- `userData.staticOptimization = false` opts an authored subtree out.
- Local matrix composition freezes only eligible authored nodes. World matrices
  still follow root movement. A snapshot of authored nodes prevents a later live
  toggle from freezing effects or helper nodes created during gameplay.
- Border masks/rims use a 64-source material cache, retaining currently active
  entries. Focus changes release proxy/instance resources but retain reusable
  shader materials. Eviction and explicit clear dispose owned materials only;
  source geometry, textures and skeletons remain owned by their original systems.

The [geometry review](runtime-optimization-review.json) compares every merged
vertex for repository house/world and the last captured local house. Maximum
world-position error is below 0.00000064 units; maximum unit-normal vector error
is below 0.000000041. Other inspected attribute components and ordered indices
are unchanged. This is CPU structural/transform validation, not full PBR or
hardware rendering validation.

## Preparation and loading

- Optional stats and legacy composer/outline modules load as separate chunks.
  Normal border rendering does not statically load those modules. Rapier remains
  the main contributor to the large initial JavaScript bundle.
- Required visible textures upload before scene compilation, yielding between
  preparation slices. Border programs warm for registered, attached targets.
- Furniture point-light counts and the additional workshop-inspection variant
  compile under the opaque house-entry cover. Visibility and brightness restore
  on success/failure. The game update pauses during covered preparation while
  the clock continues ticking, preventing preparation light states from being
  overwritten by effect updates or a large simulated delta on return.
- Interior preloading starts after essential world/player loading completes.
- NPC loading is deduplicated and overlaps at most two character model requests.
  Animation downloads retain their existing behavior. Started model work drains
  before a failure returns; no partial character set is registered, and retries
  cannot duplicate already-created NPCs. Indoor completion stays detached.

Preparation trades some covered entry time for fewer first-use shader/upload
stalls. Entry latency and actual FPS need hardware measurement on this branch.
The later [local review and profiling notes](runtime-profiling.md) confirm cached
exit/re-entry and workshop behavior; precise first-entry latency is still unmeasured.

## Lossless character and animation packing

Fifteen active assets total **5,362,740 → 4,222,884 bytes**, saving **1,139,856 bytes
(21.3%)**. The [asset report](../public/assets/models/asset-sizes.json) includes
original Git blob IDs and decoded fingerprints. Geometry, skin/joint and inverse
bind data, morphs, animation samples, hierarchy, transforms, material definitions,
samplers and texture bytes are validated before an output replaces its destination.
Animation files already contain no render meshes, so no model stripping was used.

The repository connection returned empty file contents for the larger `42.glb`,
`MTC.glb`, `bePro.glb` and `prodigy.glb`, and its blob reader could not return those
binary bytes. Their original repository blobs remain unchanged. The recursive
command supports them when original files are available locally.

The house, world, animated book and Blender sources are unchanged by this pass.
No texture recompression, decimation, quantization or animation resampling is used.
Transfer savings are not a claim of higher steady-state FPS.

### Reproduce

Keep original exports outside `public`. To optimize a complete model tree, mirror
the intended public subpaths under `asset-sources/models`, then run:

```sh
npm run assets:optimize-all
```

For example, `asset-sources/models/player/player.glb` becomes
`public/assets/models/player/player.glb`. The report is written to
`public/assets/models/asset-sizes.json`. The earlier three-file command remains:

```sh
npm run assets:optimize
```

Source/output trees must be separate and non-nested. Unknown extensions reject
rather than being discarded. Outputs use private temporary directories and only
replace each destination after decoded validation succeeds. After changing the
house export/compression, regenerate its stone LOD sidecar as before.

## Review

Run `npm test`, `npm run typecheck`, and `npm run build`.

With `?perfdiag=1`, the Performance folder now also has **Static batching** and
**Static transforms** switches. They reuse prepared data and keep the same camera.
`staticBatching=0` and `staticTransforms=0` independently disable their defaults
at load time. Renderer samples include both live settings.

Keep lighting, viewport, browser load and camera fixed; change one switch, allow
warm-up, then collect frame timings. Review outside movement, house entry/exit,
each E interaction, book turns, furniture effects and the unchanged thin border.
Check cold/warm entry latency, long frames and memory as well as average FPS.

The original 62-test suite covers source geometry/material ownership, exclusions, root
movement, local bounds, live toggles and late-created effects; culling/LOD
compatibility; cache reuse/eviction; preparation cleanup; bounded loading and
retry; real character decoding/fingerprints; skinned/morph/animated packing; and
optional-module chunk separation. Local browser checks and their limits are in
the [profiling notes](runtime-profiling.md); the fixed living-room comparison did
not establish an FPS gain. Existing bundle-size and partial-checkout
`edge-mask.webp` build warnings remain.

The current combined test command runs 84 tests; see the common pass for the
additional checks and updated build sizes.
