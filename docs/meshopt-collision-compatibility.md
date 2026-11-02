# Meshopt and collision vertices

The glTF Transform `meshopt` command applies quantization as well as compression. Three.js can therefore load positions as normalized integer attributes, with node transforms restoring their visible dimensions. Rendering those meshes works normally.

The previous trimesh/hull importer cloned the render geometry and called `geometry.applyMatrix4(mesh.matrixWorld)`. That writes transformed coordinates back into the same attribute type. World coordinates outside the normalized integer range cannot be represented correctly there, so the vertices sent to Rapier could wrap/truncate even though the visible model remained correct.

The importer now reads each position through `Vector3.fromBufferAttribute` to decode normalization, applies its world matrix to that floating-point vector, and writes the result into a new `Float32Array` for Rapier. Render geometry is never edited or retyped. Indexed and nonindexed trimeshes and convex hulls use this path. Box/cylinder colliders continue to use decoded local bounds and world scale.

`tests/quantized-colliders.test.mjs` round-trips a translated/scaled floor through the actual glTF Transform Meshopt transform, loads both GLBs and verifies that a real Rapier downward ray hits the same surface. It also checks normalized hull/nonindexed mesh proxies with parent transforms and verifies source attributes remain unchanged. Before the fix, the float floor was hittable and its normalized version was not.

Scope: this fixes mesh/hull vertex conversion. It does not diagnose every possible source export. The inspected repository house still retains `COL_BOX_HOUSE_FLOOR` as a mesh with nonzero thickness after the CLI command. If a particular floor still fails, compare the exact input/output files for missing names, a collider becoming a group instead of a mesh, or a zero-thickness proxy. The runtime recognizes `Land_01`, `Land_02` and the existing `COL_` naming convention; a visible plane alone does not automatically create a floor collider.
