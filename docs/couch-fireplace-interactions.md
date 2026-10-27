# Couch and fireplace

The Blender tool prepares the existing house for two game interactions:

- Couch: E sits the real player on the cushion. E or Esc restores the standing
  position, animation, input and camera.
- Fireplace: E lights or extinguishes the authored fire. If no separate flame
  exists, the tool creates three small flame meshes totaling 120 triangles.

The tool is in [setup_couch_fireplace.py](../scripts/blender/setup_couch_fireplace.py).
It does not save or export the .blend, move the furniture, change its materials,
apply transforms, or add/change colliders. Its setup operator supports Undo.
Existing authored flames are reused. Reassigning a generated fire removes only
this tool's generated fire, so two fire sources do not remain overlaid.

## Run in Blender

1. Open the **house** .blend and save a working copy.
2. Choose **Scripting**. In the Text Editor, choose **Open**, select
   scripts/blender/setup_couch_fireplace.py, then **Run Script** (Alt+P while the
   pointer is over that editor).
3. Return to the 3D View. Press **N**, then open **Portfolio → Couch and Fireplace**.
4. Use the eyedroppers to select the couch and fireplace. For multipart furniture,
   select its parent/root in the Outliner. Choose only the actual fire under
   **Existing Flame**, if present; the tool preselects FIRE_FLAME when available.
5. Click **Create / Update Interactions**.
6. In the Outliner, select and move these Empty markers as needed. Retain their names:

   | Marker | Placement |
   | --- | --- |
   | SEAT_COUCH | Cushion contact surface where the player sits |
   | LOOK_COUCH | In front of the seat, toward the intended facing direction |
   | CAM_COUCH | Clear camera position inside the room, viewing the seated player |
   | INTERACT_COUCH | On the floor approach, roughly waist height |
   | INTERACT_FIREPLACE | In front of the hearth, within comfortable reach |
   | ANCHOR_FIREPLACE_FLAME | Fire/light origin inside the hearth |

   Defaults use evaluated world bounds, including rotated, mirrored and scaled
   furniture. Cushion and camera placement still need an artist's visual check.
   The game places the pelvis 0.1 world units above SEAT_COUCH. Markers are
   independent world objects to avoid shear under mirrored/nonuniform furniture;
   move them as well if you later relocate the furniture.

7. Save the working copy. Export the complete house as GLB with
   **Include → Custom Properties** enabled. Keep the interaction Empty objects and
   flame objects in the export. Use the existing source/export optimization
   workflow for house.glb; regenerate the house stone LOD after geometry changes.

The sidebar is registered for the current Blender session. Run the script again
after reopening Blender if you want its controls. Saved marker custom properties
remain in the .blend; rerunning setup preserves adjusted marker positions.

## Game integration

The companion game code is required; Blender Python does not become executable
website logic when exported. The game uses the existing E-key proximity and thin
border systems. Original or incomplete house exports retain existing behavior;
the new controls appear only when the prepared markers and custom properties exist.

The seated pose uses the current Mixamo rig without an extra animation download.
Movement and mixer updates pause during sitting. The physics capsule stays at the
clear approach point and returns there when standing, avoiding a capsule inside
the couch. Unsupported rigs and airborne players decline sitting.

The fireplace uses its authored flame group, one non-shadow-casting point light
while lit, and no extra render pass. Settled extinguished flames do not update
their transforms. With decorative lights disabled, the fire still toggles without
adding a light. Fire material/light-count variants warm behind the existing cover.
Workshop inspection lighting retains its existing behavior.

Custom properties mark furniture/flames as excluded from static optimization.
A separate authoring-name tag preserves targets whose Blender names contain
spaces or suffixes such as .001 after GLTFLoader sanitizes names.

## Validation and remaining review

- 129 Node regressions, TypeScript checking and production build pass.
- The eight new regressions use the shipped avatar's actual skeleton and skinned
  vertices, repeat seating/restoration, check physics/mixer suspension, camera
  transitions, fireplace/light release, shader preparation, teardown and names.
- Native Blender 4.5.3 LTS fixture passes: repeated registration, operator use,
  mirrored/scaled geometry, unchanged source transforms/mesh/materials/colliders,
  preserved edited markers, original-flame binding, owned-fire replacement, and
  GLB export with exact custom properties and converted Y-up marker positions.
- The fixture is disposable. No owner .blend or runtime house GLB was modified.
- Native browser appearance, cushion contact, camera clearance and updated
  house-export culling baselines remain to be reviewed after the owner's export.
  The existing culling test intentionally requests review for an unknown export.
- No FPS gain is claimed. Existing large-chunk and partial-checkout image warnings
  remain. The original-texture-only decision is retained.

Repeat the Blender test in a separate process:

    blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python tests/blender-lounge.test.py -- /path/to/temporary-review

Reference: [Blender glTF custom properties](https://docs.blender.org/manual/en/5.0/addons/import_export/scene_gltf2.html#custom-properties).
