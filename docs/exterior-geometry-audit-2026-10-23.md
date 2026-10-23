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
