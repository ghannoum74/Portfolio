# Common performance implementation

Branch: `perf/quality-preserving-runtime-2026-10-23`.

This pass adds standard rendering, loading and update-reuse techniques to the
existing optimization stack. Existing model detail, textures, surface materials,
lighting policy, border appearance and resolution defaults are retained.

## Additional GPU instancing

After the existing small-mesh merges, the exterior uses `InstancedMesh` for exact
copies of eligible static geometry with the same material reference. The current
asset has **36 additional source draws represented by 16 instance batches**, with
all **2,200 triangles** retained. That removes 20 potential whole-asset draw calls;
the visible-frame reduction depends on the camera and culling.

Eligibility requires exact attribute/index bytes and compatible rendering state.
This is different from treating meshes with equal vertex counts as equivalent.
Instance matrices use root-local transforms, so moving the root still works.
Named original nodes and their geometry/material references remain available.
The first source geometry is shared; disposal frees instance resources and
restores sources without disposing their geometry or materials.

Batches stay inside 8-world-unit spatial cells, with at most 24 copies and 120,000
submitted triangles per batch. An individual copy is limited to 12,000 triangles
and 10 world units. Overlapping bounds remain separate. Skinning, morphs,
animation/gameplay subtrees, custom hooks/shaders, shear, negative transforms,
transparency, alpha cutouts and special rendering state retain individual draws.
Separate shadow flags and layers also remain separate.

The existing **Static batching** switch and `staticBatching=0` control both
merging and instancing. Prepared instances are reused when switched back on.
`[World static scene]` includes the separate `instancing` counts.

The [structural review](common-performance-review.json) compares 4,328 vertices
from the real instanced groups. Maximum world-position rounding error from
Float32 instance matrices is below 0.000000087 world units; maximum unit-normal
error is below 0.000000017. Attribute/index bytes and material references match.
The inspection copy omits image references in memory; the GLB itself is unchanged.
This is structural validation, not a new hardware appearance/FPS measurement.

## Split the physics backend and overlap startup work

Rapier's large compatibility/WASM payload now loads through `import()` during
physics initialization. Type-only physics imports keep it out of the synchronous
gameplay dependency graph. Concurrent initialization calls share one promise and
world; failure permits a retry. Gameplay still waits for physics readiness.

The world GLB download starts alongside physics initialization. Player model and
seven animation downloads also start together; scene/body/animation setup waits
for the complete set. Failed downloads therefore do not attach a partial player.
Optional NPC loading retains its existing limit of two model requests.

| Production JavaScript | Before | After |
| --- | ---: | ---: |
| Main entry, minified | 3,861.92 kB | 1,012.56 kB |
| Main entry, gzip | 1,348.59 kB | 269.66 kB |
| Separate required physics chunk, minified | Included above | 2,855.12 kB |
| Separate required physics chunk, gzip | Included above | 1,078.39 kB |

These are rounded build output sizes in decimal kB. The main entry is about 74%
smaller, but physics remains required: total JavaScript transfer is essentially
unchanged. Splitting changes when the backend is fetched/evaluated and allows
independent loading to overlap; cold-load latency has not yet been measured.

## Reuse unchanged camera collision queries

The camera's existing Rapier shape cast tests fixed colliders only. It now reuses
the previous result when target, desired position and fixed-collider revision are
exactly unchanged. Movement/zoom/orbit changes trigger a fresh query immediately;
no tolerance or lower update rate is applied to a changing camera.

`WorldColliders.createFromEnvironment()` invalidates the revision before adding
colliders, including partially failed imports. Any future code that directly
adds, moves or removes fixed colliders must call `invalidateStaticQueries()`.
Kinematic player motion is outside this query's `ONLY_FIXED` filter.
The cast also reuses existing vector/quaternion objects rather than allocating
three argument objects on each new query.

A real Rapier regression test repeats 120 idle frames with one cast, then checks
new casts for target/desired movement, imported walls and removed fixed colliders.
Blocked-camera positioning, padding and zero-distance behavior are retained.

## Existing common optimizations retained

- Spatial mesh merging and frozen authored local transforms.
- Projected-error stone LOD with full close-up geometry and safe sidecar fallback.
- Three.js frustum culling and verified closed-surface backface culling.
- Inactive scene detachment and hidden-tab loop suspension.
- Selected-object stencil borders, cached border materials and bounded effects.
- Inspection-only workshop lights and inactive furniture light removal.
- Shader/texture preparation behind covers and optional module loading.
- Verified Meshopt packing, fixed physics steps and one animation update per frame.

See [the earlier implementation](runtime-optimization.md) and
[the earlier profiling results](runtime-profiling.md) for their scope and limits.
The earlier 29-FPS comparison predates this pass and is not its benchmark.

## Validation

`npm test` passes **84 tests**. Type checking, the production build and whitespace
checks pass. The new tests exercise exact instance data, transformed vertices,
exclusions/bounds/resource ownership, the real exterior, actual Rapier movement
queries, initialization sharing, startup overlap and production dependency edges.
The test command lists both suites explicitly for Windows shell compatibility.

Existing large-chunk and partial-checkout `edge-mask.webp` build warnings remain.
The [live browser check](common-performance-live-2026-10-23.md) now covers the
exterior batching appearance switch, all four workshop details, inspection-only
lighting, thin stand borders, return to the house, one complete cached door
exit/reentry cycle and basic camera input. Book/other furniture and full
wall-collision traversal remain pending for this pass. Cold-load latency and frame
timings have not been remeasured. No
hardware FPS improvement is claimed from draw-count or bundle-size reductions.

## Primary references

- [Three.js InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html)
- [Three.js mesh merging guidance](https://threejs.org/manual/pages/optimize-lots-of-objects.html)
- [Vite async chunk loading](https://vite.dev/guide/features.html#async-chunk-loading-optimization)
