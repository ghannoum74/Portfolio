# Reuse precise book-control layout

While reading, BookPageControls previously computed a precise bounding box for
the entire book every displayed frame, including hidden placeholder/curl meshes.
The current book has 7,426 vertices in that traversal; 6,030 belong to meshes
with 12 morph targets each. It also allocated a Box3, eight projected vectors
and temporary arrays, and reassigned visibility, button state, counter text and
positions on unchanged frames.

The controls now reuse the same precise bounds until the book instance,
animation pose revision or model world transform changes. AnimatedBook3D
increments its pose revision after existing mixer samples, including the zero
delta sample at either page-turn endpoint. Its existing settled-pose update
guard, clip clocks, page materials, animation data and state transitions are
retained. Ancestor/model transforms are checked through the model world matrix.
Bounds caching relies on AnimatedBook3D owning internal cover/page pose changes;
future deformation code must participate in pose invalidation.

Camera world/projection matrices and CSS viewport dimensions invalidate screen
projection without repeating vertex reads. Reprojection uses the original eight
bounding-box corners, margins and clamping with one reusable vector and Box3.
Buttons, counter, visibility classes and coordinates are written only when their
values change. Counter/button state is still checked before the layout-cache
early return. Hiding/destroying clears the cached book, so returning to reading
or finishing a page turn cannot reuse an earlier book's layout.

## Validation — October 26, 2026

All **107 local tests**, typecheck, production build and whitespace checks pass.
Four focused regressions use the production classes and real book GLB with a
small DOM and texture-delivery test doubles:

- Opening, forward/backward initial samples, animation completion and settled
  holds advance or retain the pose revision appropriately.
- The real book's first layout performs 7,426 vertex reads. After priming,
  **120 unchanged updates perform zero vertex reads and zero DOM writes**.
  Coordinates match the preceding precise-bounds/eight-corner calculation;
  callback bindings and listener cleanup remain functional.
- Camera translation/rotation, projection changes and viewport resizing
  reproject correctly without scanning book geometry. Model/ancestor transforms,
  pose changes and replacement book instances rebuild bounds. Counter and button
  changes remain immediate even with an otherwise cached layout.
- Both page-turn directions hide/reveal controls, screenshot preparation failure
  returns to a valid layout, and hide/reentry rebuilds bounds. Inactive repeated
  updates perform no vertex reads or DOM writes.

The previous full traversal would read 891,120 vertices across those same 120
unchanged updates (7,426 × 120, derived from the initial scan). This is an avoided
work count, **not a wall-time, heap, GPU or FPS measurement**. The four tests
exercise real geometry/morph animation; their DOM fixture is not a browser CSS,
font, screenshot or pixel comparison. The code does not reduce book geometry,
texture resolution, page animation sampling or rendering quality settings.

Local house tests still use the prior house export; the owner previously
reported the earlier 93-test suite passing with the newer house. No GLB/Blender
source, textures, dependencies, lockfile or Vite configuration change here.
The test script includes the new isolated book-control suite.

Build entry: 1,018.53 kB minified / 271.04 kB gzip. Required physics remains
2,855.12 / 1,078.39 kB. Existing large-chunk and partial-checkout edge-mask
warnings remain. Machine-readable work evidence:
[book-controls-work-review.json](book-controls-work-review.json).

## Live review

After pulling, open the Projects book and leave it in reading mode with
`?perfdiag=1`. Inspect both arrows and the counter on all four spreads, turn
forward/backward, resize the window and return/reopen with Esc. Confirm controls
hide during the curl, settle at their original positions and update first/last
page button states. This can also cover the outstanding shared detail-texture
and lossless WebP appearance checks. The latest change has not yet received
that live browser review; no hardware FPS/GPU improvement is claimed.
