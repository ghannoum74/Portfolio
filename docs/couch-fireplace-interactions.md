# Couch and fireplace

The Blender tool prepares the existing house for two game interactions:

- Couch: E sits the real player on the cushion. E or Esc restores the standing
  position, animation, input and camera.
- Fireplace: a continuously burning, colored 3D fire. E near the existing
  fireside chair seats the real player facing the hearth; E or Esc stands up.
  The camera frames both the seated player and the fire.

The tool is in [setup_couch_fireplace.py](../scripts/blender/setup_couch_fireplace.py).
It does not save or export the .blend, move the furniture, change its materials,
apply transforms, or add/change colliders. Its setup operator supports Undo.
Authored flame objects provide the runtime fire's placement and size. When absent,
the tool creates three placement meshes totaling 120 triangles. Reassigning a
generated fire removes only this tool's generated fire.

## Run in Blender

1. Open the **house** .blend and save a working copy.
2. Select the couch in the 3D View. Choose **Scripting**. In the Text Editor, choose **Open**, select
   scripts/blender/setup_couch_fireplace.py, then **Run Script** (Alt+P while the
   pointer is over that editor).
3. Automatic setup detects the fireplace, creates the markers and selects
   SEAT_COUCH. It raycasts near the cushion center to find a seat surface. Review
   the resulting seat and camera positions. If both furniture objects have
   anonymous names, select both with the couch active (selected last), then run
   again. Ambiguous detection stops with a selection message.
4. The optional panel is under **N → Portfolio → Couch and Fireplace**.
   **Auto Detect + Place Markers** recalculates existing marker positions and
   supports Undo. Use **Create / Update Interactions** to preserve manually
   adjusted positions instead. Set AUTO_SETUP_ON_RUN = False at the top of the
   script if you want it to register only the panel.
5. Use the eyedroppers to select the couch and fireplace if you prefer manual setup. For multipart furniture,
   select its parent/root in the Outliner. Choose only the actual fire under
   **Existing Flame**, if present; the tool preselects FIRE_FLAME when available.
6. Click **Create / Update Interactions** for manual setup.
7. In the Outliner, select and move these Empty markers as needed. Retain their names:

   | Marker | Placement |
   | --- | --- |
   | SEAT_COUCH | Cushion contact surface where the player sits |
   | LOOK_COUCH | In front of the seat, toward the intended facing direction |
   | CAM_COUCH | Clear camera position inside the room, viewing the seated player |
   | INTERACT_COUCH | On the floor approach, roughly waist height |
   | INTERACT_FIREPLACE | Fireplace metadata; the game places E on the nearby chair |
   | ANCHOR_FIREPLACE_FLAME | Fire/light origin inside the hearth |

   Defaults use evaluated world bounds, including rotated, mirrored and scaled
   furniture. Cushion and camera placement still need an artist's visual check.
   The game fits the pelvis above the cushion using the avatar's actual skinned
   pelvis/thigh clearance and moves toward the open cushion edge so the calves
   hang outside the sofa. Markers are
   independent world objects to avoid shear under mirrored/nonuniform furniture;
   move them as well if you later relocate the furniture.

8. Save the working copy. Export the complete house as GLB with
   **Include → Custom Properties** enabled. Keep the interaction Empty objects and
   flame objects in the export. Use the existing source/export optimization
   workflow for house.glb; regenerate the house stone LOD after geometry changes.

The sidebar is registered for the current Blender session. Run the script again
after reopening Blender if you want its controls. Saved marker custom properties
remain in the .blend. Manual Create / Update preserves adjusted positions;
automatic setup recalculates them from the current furniture geometry.

## When the markers are missing

The green text.run_script message confirms Python execution. It does not mean
that furniture detection or marker creation succeeded.

Open the complete downloaded .py file directly using Text Editor → Open. Select
the fireplace, then Shift-select the couch frame last, and run the script.
Automatic detection skips coffee tables such as Table_Large as couch targets.

The N → Portfolio panel shows the persistent setup status and a live marker
count. READY is recorded only after all six markers exist in the active scene.
Successful setup clears the Outliner search and exposes Empty objects.

For a failure, use the Text Editor's text dropdown to open
PORTFOLIO_LOUNGE_REPORT. It contains the exact error, Blender/script versions,
active/selected object names, candidate names and PRESENT/MISSING for each
marker. This report remains available after the popup closes. It is not exported
as runtime geometry.

## Game integration

The companion game code is required; Blender Python does not become executable
website logic when exported. The game uses the existing E-key proximity and thin
border systems. Original or incomplete house exports retain existing behavior;
the new controls appear only when the prepared markers and custom properties exist.

The seated pose uses the loaded avatar's neutral local bone transforms without an
extra animation download. This avoids retaining an interrupted walking pose or
the idle clip's different bone translations. The original animated pose is saved
and restored on standing; the Armature scale remains intact.
The player's complete Euler rotation, including its unwrapped yaw and order, is
preserved through successful and declined seating. Movement reads that yaw;
quaternion-only restoration can recode a turned-around heading into X/Z rotations
and make W/S disagree with the visible avatar. Follow resumes after the original
player heading is restored.

The Blender couch can consist of separate scene-level frame, cushion, back and
pillow meshes. The runtime assembles a bounded, touching set of support meshes
around the tagged furniture. It uses non-rendered wrappers sharing the original
geometry and materials, including originals hidden by static batches. It excludes
colliders, optimization batches, floors and disconnected furniture. Source objects
are never reparented or made visible. A small surface index prepares behind the
house entry cover; fitting and skin contact run only when sitting begins.

Seat height is recovered from the cushion when a frame-only marker is too low.
For a recognizable broad back, a generated sideways/backward LOOK direction is
corrected toward the open side. Ambiguous shapes retain the authored direction;
an unsupported or blocked seat declines cleanly. The authored camera position
remains, with its aim adjusted to the fitted avatar. The owner's actual export
still needs a visual check for cushion contact and nearby camera obstructions.

Movement and mixer updates pause during sitting. The physics capsule stays at the
clear approach point and returns there when standing, avoiding a capsule inside
the couch. Unsupported rigs and airborne players decline sitting.

The fireplace uses seven instanced 3D flame tongues and eight rising embers.
The flame shader combines height-based red/orange/gold/cream heat, surface shading,
upward-flowing noise, alpha breakup and independent curling tips. A time uniform
animates the effect; source meshes, instance matrices and vertex buffers stay
unchanged each frame. The fire and embers use two draws, verified in WebGL.
Only the fire materials bypass tone mapping to retain their
color; the renderer settings remain. One existing non-shadow-casting light warms
the hearth, or the colored fire renders without a light when decorative lights
are disabled. House visibility suspends its animation outside. Shader/light-count
variants prepare behind the entry cover; workshop inspection lighting remains.

The authored fire and a recognized nearby imported flame (including geometry_0
with its old stone material) are hidden for the runtime effect. Their geometry,
materials, transforms and original visibility are retained and restored on teardown;
only the effect's own geometries and materials are disposed.

The fire stays burning while the visitor sits or stands. Older initialOn metadata
does not toggle it. The nearest recognizable chair, armchair, pouf or stool within
3.5 world units supplies the actual seat; this includes chair02_textured.obj in the
house source. The interaction highlights the chair rather than the stone hearth.
The prepared six-marker export works without another Blender export.

For an explicit artist binding, INTERACT_FIREPLACE can optionally reference
seatTargetObject (the chair's original authoring name), seatObject, lookObject and
cameraObject. Named SEAT_FIREPLACE / LOOK_FIREPLACE / CAM_FIREPLACE markers are
also recognized. Without these, runtime defaults derive the seat from the chair,
face the fire and place a camera to its side. Missing or invalid explicit targets
leave the visual fire burning without a misleading toggle prompt.

Custom properties mark furniture/flames as excluded from static optimization.
A separate authoring-name tag preserves targets whose Blender names contain
spaces or suffixes such as .001 after GLTFLoader sanitizes names.

## Validation and remaining review

- Node regressions, TypeScript checking and production build pass.
- The interaction regressions use the shipped avatar's actual skeleton and skinned
  vertices, repeat seating/restoration, check physics/mixer suspension, camera
  transitions, fireside seating, shader preparation, teardown and names.
  They also compare seating after real idle/walking clips, verify a deep cushion's
  knee clearance and outward leg pose, mirrored/scaled support, separate hidden
  cushions with a frame-only marker, clean cancellation and adjusted camera aim.
  The real player controller and follow camera are also checked after repeated
  sitting at both turn-around headings, side angles and multiple full turns: W/S
  retain their camera-relative directions, A/D keep their turn directions, and a
  declined seat preserves the original movement heading.
- Native Blender 4.5.3 LTS and 5.1.2 fixtures pass: repeated registration, operator use,
  mirrored/scaled geometry, unchanged source transforms/mesh/materials/colliders,
  preserved edited markers, original-flame binding, owned-fire replacement, and
  GLB export with exact custom properties and converted Y-up marker positions.
  The automatic Text Editor entry also passes detection from the selected couch,
  exact cushion-surface placement, anonymous two-object selection, ambiguous
  selection rejection and repeated recalculation without marker drift/duplicates.
  The coffee-table selection case produces a persistent failure report when
  detection cannot resolve the furniture; a rerun never binds the table as the
  couch. READY is verified against all six marker objects.
- The fixture is disposable. No owner .blend or runtime house GLB was modified.
- A Chromium WebGL2 / ANGLE SwiftShader check renders the actual repo house,
  avatar and fireside chair: visible warm flame colors, changed fire pixels across
  frames, multiple viewing angles, seated camera framing and preserved heading on
  standing. Shader and console errors are empty. This is software WebGL validation,
  not a benchmark of the owner's Intel GPU or a test of their latest local export.
- Native browser appearance, cushion contact, camera clearance and updated
  house-export culling baselines remain to be reviewed after the owner's export.
  The existing culling test intentionally requests review for an unknown export.
- No FPS gain is claimed. Existing large-chunk and partial-checkout image warnings
  remain. The original-texture-only decision is retained.

Repeat the Blender test in a separate process:

    blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python tests/blender-lounge.test.py -- /path/to/temporary-review

Reference: [Blender glTF custom properties](https://docs.blender.org/manual/en/5.0/addons/import_export/scene_gltf2.html#custom-properties).
