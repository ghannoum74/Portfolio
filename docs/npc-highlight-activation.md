# Repeated character highlight pause

Each character focus creates eight skinned silhouette proxies per rendered mesh. The old proxies had `boundingSphere = null`. Three.js r184's `WebGLRenderer.projectObject` requests that sphere for depth sorting even when `frustumCulled` is false. `SkinnedMesh.computeBoundingSphere` visits every posed vertex on the CPU. Consequently, each new focus repeated eight full CPU skinning scans per mesh. Shader preparation cannot prevent these scans: they are triggered later by render-list sorting on newly created objects.

`InteractionHighlight` now gives each skinned proxy its own sorting sphere immediately, copying the source mesh's sphere or its geometry sphere when available. If neither exists, the source's local origin is the sorting anchor. These overlays have culling disabled and raycasting replaced with a no-op; the sphere only supplies a sorting center. It does not affect their rendered vertices. Source bounds are never mutated, and the original skeleton, morph weights, bind transforms and eight-offset silhouette remain in use.

## Verification

`tests/highlight-activation.test.mjs` loads all seven real character GLBs and repeatedly activates/deselects their borders. It exercises the installed renderer's sorting-bounds request and fails if a proxy visits any posed vertex. All four activations per character now require zero such scans. A baseline reproduction confirms this check detects the old behavior. A separate pose test covers source/geometry/missing bounds, changing bones and morph weights, source-bound ownership and material/skeleton restoration. Existing border, alpha-cutout, transform and material-cache checks remain passing.

Using the compressed character assets from commit `5e394f5`, a CPU-only before/after comparison used three warm-up activations and twelve measured activations per version, alternating the old and new implementations. Asset loading was outside the timing window, and checks/builds were finished before measurement. The measured scope is highlight activation plus the renderer's sorting-bounds request, not a whole frame or GPU rendering.

| Character asset | Before median (ms) | After median (ms) |
| --- | ---: | ---: |
| Frequenc | 23.357 | 0.180 |
| MTC | 44.805 | 0.196 |
| 42 | 51.937 | 0.121 |
| BePro | 54.793 | 0.161 |
| Interphase | 16.297 | 0.253 |
| Prodigy | 21.307 | 0.279 |
| SE Factory | 18.505 | 0.536 |

TypeScript and the production build pass. The full suite is 208/220 passing. A clean baseline at `5e394f5` is 206/218 passing with the identical twelve failing test names (content expectations and asset/batching/LOD fingerprints after asset compression); the highlight fix adds two passing regressions and no new failures. The preview browser has WebGL disabled, so end-to-end gameplay frame timing was not measured. The eight silhouette draws per skinned material group still have a rendering cost; this change removes the reproduced CPU stall on activation.
