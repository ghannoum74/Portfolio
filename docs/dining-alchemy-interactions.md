# Dining and alchemy interactions

The house supports sitting on the authored dining chairs, choosing and brewing
three potions, reading a Moonwater recipe and browsing a small bookshelf. The
existing individual potion interactions remain available. The recipe is a
panel: the original cabinet is one mesh in the reference house, so no part of
it is pulled apart or moved.

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

If no usable chair markers were exported, the game can recover the original
`Table_RoundSmall2` and `SEC_PROJECTS_Chair_1` dining set from its geometry.
Valid authored markers take precedence; intentionally retired chair triggers
stay retired. The fallback is calculated once when the house is prepared.

## Controls

- Approach a prepared chair and press **E**. The avatar sits facing the table;
  **E** or **Esc** stands up and restores movement.
- At the cauldron press **E**. The first potion appears immediately; use the
  arrow keys or buttons to choose, then **E** or **Brew** to start bubbling.
  **Esc** or **Close** stops the effect and returns to walking.
- At the bookshelf press **E**; use arrows or buttons to browse and **Esc** or
  **Close** to return. The first page appears immediately when reopening.
- At the alchemy cabinet press **E** to read the Moonwater recipe; **E**,
  **Esc** or **Close** returns to walking.

Verify each chair from a clear approach, especially near the cauldron and
bookshelf. Check the seat, camera view, nearby prompts, return movement and
all three potion colors in the actual exported house. Effects reuse the
existing cauldron bubbles and optional non-shadow light and stop on exit.
