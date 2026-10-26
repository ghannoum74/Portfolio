# Water shader comparison

The Performance folder under `?perfdiag=1` now offers **Water shader**:

| Mode | Purpose | Default |
| --- | --- | --- |
| Original | Existing animated, lit water shader | Yes |
| Vertex phases | Candidate with affine spatial wave arguments computed per vertex | No |
| Depth only (diagnostic) | Opaque water depth coverage without water color shading | No |

Normal gameplay uses Original. `?waterShader=vertex` opts into the candidate.
`?perfdiag=1&waterShader=depth` selects the isolation view; without explicit
diagnostics, requesting depth falls back to Original. Unknown values also use
Original. None of these modes changes resolution, water geometry or colliders.

## Scope

The shipped world contains one animated `Water_Surface` mesh, `Cube048_1`, with
4,802 triangles. Its world bounds at the runtime quarter scale are approximately
132.7 × 3.5 × 136.0 units. Its source roughness is retained by the original and
candidate factories, including the authored negative value; this change does
not normalize or reinterpret the export's material parameters.

Other `Water` and `Water_Sides` materials, including the pond, remain untouched.
There is no `Water_Horizon` material in the current world. The existing horizon
shader still supports the same comparison if that material is used in a future
export. Counts and actual selected mode appear in `[House physics]`; renderer
windows also record the requested `waterShader` value.

## Candidate and limits

Wave arguments have a spatial part such as `0.55 * worldX + 0.22 * worldZ`,
followed by a time offset and a sine. The spatial parts are affine and can be
interpolated before applying the sine. The candidate moves only these spatial
linear expressions to the vertex shader. Sines, time offsets, smoothstep,
radial horizon fade, color mixing, standard lighting, flat normals and fog remain
in the original fragment path. Vertex positions are unchanged. Materials in
all modes share one advancing animation clock and are created lazily/reused,
so switching does not restart water animation.

This is not a measured optimization yet. Extra interpolated values may offset
the saved fragment arithmetic, and the driver can optimize either program.
Floating-point evaluation order differs even though the expressions agree in
real arithmetic. Original remains the default until native-resolution GPU
readings and live appearance checks justify selecting the candidate.

The depth diagnostic uses an opaque Basic material with color writes off and
depth testing/writes on for the animated surface slots. The altered appearance
is intentional. Non-water slots stay authored. It retains surface depth
coverage rather than simply hiding the mesh, but material sorting, early depth
behavior and previously rendered color can still affect the comparison. A GPU
delta estimates the combined rendering effect; it is not an exact additive
measurement of one shader. It leaves the other water materials shaded normally.

## Live procedure

After pulling, refresh `http://localhost:5173/?perfdiag=1` and keep one exterior
camera, fixed preview hour, native DPR, shadows and LOD settings:

1. Enable GPU timing. Let each mode compile once before taking readings, then
   use Restart readings to exclude the first-use work.
2. Capture Original → Depth only → Original to estimate animated-surface cost.
3. Capture Original → Vertex phases → Original. Retain repeated baseline windows
   and compare the same view, including a view with large water coverage.
4. Inspect the waves, highlights, flat-surface shading, horizon transition and
   day/night lighting while switching Original/Vertex phases. The clock keeps
   advancing, so screenshots are not frozen-time pixel comparisons.
5. Restore Original, GPU timing off, native DPR, shadows and real time after
   testing unless a later measured/visual review explicitly changes the default.

## Validation — October 26, 2026

All **99 local tests**, typecheck, production build and whitespace checks pass.
The four new regressions check lazy material reuse, shared clock, depth state,
mixed slots, disposal ownership, actual world geometry/material identity,
diagnostic URL gating, and the generated shader expressions. The Original GLSL
matches hashes generated from the preceding implementation after whitespace
normalization. Tests evaluate the actual old/new scalar shader expressions
across interpolated triangles and time samples, including long sessions, to
check real-arithmetic wave equivalence; this does not emulate GPU precision.

The new variants have not yet been compiled or timed in the owner's live WebGL
page. No GPU/FPS or pixel-equality gain is claimed. The existing larger-chunk and
partial-checkout edge-mask build warnings remain. Local house-dependent tests
use the prior house; the owner previously confirmed the earlier 93-test suite
with the newer house export. No GLB/Blender source, textures or dependencies
change in this follow-up.
