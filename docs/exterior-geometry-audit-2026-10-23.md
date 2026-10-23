# Exterior geometry audit — October 23, 2026

Inspected the shipped lossless-packed world, Git blob
`97e2f5e33ea4b50f3424db0f0b23f9dd39f88525`. This is the active world,
not the older uploaded world. GLTFLoader expands it to 258 mesh objects with
240,188 source triangles before runtime culling/batching.

Two meshes under `Cube067` / `RootNode002` contain 219,904 triangles, or 91.6%
of that source total. Both use opaque DoubleSide `Material.002`, have position,
normal and UV streams, and no geometry groups. Their names are
`Cube_Material002_0` and `Cube_Material002_0001`. Their overlapping bounds
require identifying the surfaces visually before making any removal/culling
assumptions. Bounds alone do not establish duplicate geometry.

| Mesh | Original triangles | Trial 60% | Trial 40% | Relative error at 40% |
| --- | ---: | ---: | ---: | ---: |
| Cube_Material002_0 | 124,063 | 74,437 | 49,625 | 0.000201991 |
| Cube_Material002_0001 | 95,841 | 57,503 | 38,335 | 0.000125373 |
| Total | 219,904 | 131,940 | 87,960 | — |

Offline Meshopt simplification trial only: welded identical decoded position,
normal and UV tuples; normal weights 1, UV weights 0.1; LockBorder; maximum
relative error 0.0005. Indices continued to address original vertex streams.
No source GLB was rewritten and no runtime geometry was changed.
The 40% trial removes 131,944 triangles from these source meshes; this is not
a measured reduction in a visible frame or an FPS claim.

Next implementation should retain full close-up geometry and source-hash fallback,
select optional index levels using projected error with hysteresis, preserve
colliders/materials/names, and compare silhouettes, UVs and shading while walking
through the actual exterior. Large bounding spheres can keep full detail active,
so test real camera positions before deciding whether these objects need spatial
partitioning. The existing house stone LOD provides a reference implementation.

## Optional runtime implementation

`?perfdiag=1&exteriorLod=1` loads an 809,223-byte index-only sidecar after
essential world initialization. Default gameplay does not request it.
This is intentionally opt-in while exterior silhouette, UV and shading review
is pending; do not infer a measured FPS gain from the offline counts.

The existing index LOD implementation now accepts explicit trusted target names.
House defaults and thresholds remain unchanged. Exterior selection uses the same
projected error/hysteresis policy (downgrade below 0.75 estimated CSS pixel,
upgrade above 1 pixel), plus full authored geometry within 3 world units of
the bounding sphere. Large bounds make this conservative. Both additional
levels share original attributes/materials; indices alone differ. Colliders are
created from the authored world before optional preparation. Missing/stale data
is caught without replacing geometry. Source hashes cover all decoded attributes
and original indices. The real-world regression checks near/far selection,
source count, index range, shared streams/materials, restoration and stale data.

Rebuild after Blender export and verified world packing:

```sh
npm run assets:exterior-lods
npm test
npm run typecheck
npm run build
```

Compare `?perfdiag=1` with `?perfdiag=1&exteriorLod=1` at the same exterior
camera/time/DPR. The `[House physics]` diagnostic includes `exteriorLod` counts
when outside. Inspect near-to-far transitions, silhouettes, texture seams,
shading and collision traversal before enabling it by default. The existing
Stone LOD UI switch continues to control house stone geometry only.

Validation: 94 local tests pass (including the real shipped world), typecheck,
production build and whitespace checks pass. Local house-dependent tests still
use the prior house export; the owner's earlier 93-test run passed with the newer
house. The exterior sidecar targets the current world blob recorded above.
Build retains existing large-chunk and partial-checkout edge-mask warnings.
No browser visual validation of this new optional path has been completed.
