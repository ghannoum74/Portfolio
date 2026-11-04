# Meshopt and collision vertices

The glTF Transform `meshopt` command applies quantization as well as compression. Three.js can therefore load positions as normalized integer attributes, with node transforms restoring their visible dimensions. Rendering those meshes works normally.

The previous trimesh/hull importer cloned the render geometry and called `geometry.applyMatrix4(mesh.matrixWorld)`. That writes transformed coordinates back into the same attribute type. World coordinates outside the normalized integer range cannot be represented correctly there, so the vertices sent to Rapier could wrap/truncate even though the visible model remained correct.

The importer now reads each position through `Vector3.fromBufferAttribute` to decode normalization, applies its world matrix to that floating-point vector, and writes the result into a new `Float32Array` for Rapier. Render geometry is never edited or retyped. Indexed and nonindexed trimeshes and convex hulls use this path. Box/cylinder colliders continue to use decoded local bounds and world scale.

`tests/quantized-colliders.test.mjs` round-trips a translated/scaled floor through the actual glTF Transform Meshopt transform, loads both GLBs and verifies that a real Rapier downward ray hits the same surface. It also checks normalized hull/nonindexed mesh proxies with parent transforms and verifies source attributes remain unchanged. Before the fix, the float floor was hittable and its normalized version was not.

Meshopt can also preserve an authored collider name on a group while moving its geometry into a child mesh. The importer resolves the nearest `COL_` owner for each descendant mesh, hides the entire helper group, and builds the owner's collider type using the geometry child's full world transform. This supports explicit collider groups and glTF multi-primitive wrappers without inventing collision from ordinary visible props. Detection-zone subtrees stay excluded, and nested helpers retain their nearest authored type.

The regression suite also round-trips a collider with a child marker through actual Meshopt, verifies the resulting group still blocks a real Rapier ray, and checks that no helper geometry remains visible. The uploaded optimized house's `COL_BOX_PLANT` now behaves like its pre-Meshopt counterpart. See [house-meshopt-compatibility.md](house-meshopt-compatibility.md) for the separate visual beam-batching repair.

The runtime still recognizes `Land_01`, `Land_02` and explicit `COL_` helpers; a visible plane alone does not automatically create a floor collider. Exported proxies must retain valid geometry and nonzero dimensions where their shape requires thickness.
