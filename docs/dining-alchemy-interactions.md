# Dining and alchemy interactions

The house supports sitting on authored dining chairs, brewing three potions at
the cauldron and browsing a small bookshelf. The cauldron is the only alchemy
interaction: individual bottles and the recipe cabinet are decorative. Old
recipe markers in existing GLBs are ignored; no Blender re-export is needed
for this behavior change.

## Prepare the house in Blender

1. Open the current house `.blend`, switch to Object Mode, and select the round
   dining table. The table must be the active object.
2. In the Scripting workspace open `scripts/blender/setup_dining_alchemy.py`
   and press **Alt+P** in the Text Editor. Existing
   `SEC_PROJECTS_Chair_1` chairs near the table are found automatically. If the
   chairs use different names, select the chairs first and Shift-select the
   table last, then run the script.
3. Open the `PORTFOLIO_DINING_REPORT` text in Blender. It reports the chairs,
   any missing optional objects and any seat/camera that needs review. The
   script looks for `Bookcase_2`, `SEC_ALCHEMY_Cauldron`, and
   `SEC_ALCHEMY_Drawer_4`; change the corresponding constants near the top of
   the script if these objects have different names in your file.
4. Inspect each generated `SEAT_DINING_XX`, `LOOK_DINING_XX` and
   `CAM_DINING_XX` Empty. Their **positions** control seat contact, facing and
   the seated camera; move the Empty if adjustment is needed. Do not rotate the
   camera marker to aim it. Re-running the script recalculates these markers.
5. In Git Bash at the project root, create an export folder:

   ```bash
   mkdir -p dining-house-export/input
   ```

   Save the Blender file, then export the **whole house** as
   `dining-house-export/input/house.glb`, with **Include → Custom Properties**
   enabled and **Selected Objects** disabled.
6. In Git Bash, pack that one export and copy it to the game. Keep only the
   house GLB in the input folder; `--recursive` processes every GLB in it.

   ```bash
   node scripts/optimize-assets.mjs dining-house-export/input dining-house-export/output --recursive &&
   cp dining-house-export/output/house.glb public/assets/models/environment/house.glb
   ```

   The existing optimizer checks that decoded geometry and marker properties
   are preserved. The copy runs only if packing succeeds. The input and output
   folders are temporary working files and can be removed after verification.

The script adds only owned Empty markers and their properties. It never moves,
deletes or re-materials furniture, changes existing colliders, saves, or exports.
The marker names are reserved: it stops if an unowned object uses one of them.
Rerunning updates its own markers and disables unused chair triggers. The
reference house's four chairs and their camera sight lines are checked in a
disposable Blender copy; the owner's current model still needs a live review.

Dining chairs require the Blender-authored `INTERACT_DINING_CHAIR_XX` markers
and their custom properties; the game does not create substitute chair markers.
If the report contains `Object 'Raft' has no evaluated mesh data`, update the
script, select the table and run it again. Excluded Blender collections are
ignored by the camera check. Confirm the report says `READY` before exporting.

## Controls

- Approach a prepared chair and press **E**. The avatar sits facing the table;
  **E** or **Esc** stands up and restores movement.
- Approach the cauldron from any side and press **E**, or tap **Brew a Potion**
  on mobile. Proximity is measured from the pot surface, with a 2.5 m reach.
  The first potion starts brewing immediately; arrows or buttons change the
  potion and brew its selected color automatically. **Brew again** repeats it.
  **Esc** or **Close** stops the effect and returns to walking.
- At the bookshelf press **E**; use arrows or buttons to browse and **Esc** or
  **Close** to return. The first page appears immediately when reopening.

Verify each chair from a clear approach, especially near the cauldron and
bookshelf. Check the seat, camera view, nearby prompts, return movement and
all three potion colors in the actual exported house. Effects reuse the
existing cauldron bubbles and optional non-shadow light and stop on exit.
