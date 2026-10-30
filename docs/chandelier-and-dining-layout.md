# Chandelier light and dining access

The interior's main light now comes from the hanging `Chandelier`. A warm,
downward spotlight provides contact shadows; a small spill at the same source
reveals its suspension. The previous directional light above the roof and
unanchored room-center point light are removed. A restrained hemisphere light
represents bounce. Only the spotlight uses a shadow map, and `?shadows=0` or
`?lowfx` disables that map. No new work runs per frame.

`HouseLighting.ts` reads the `LIGHT_HOUSE_CHANDELIER` Empty and its color,
intensity, range and spill custom properties. Existing exports without that
Empty use the actual chandelier mesh bounds, including the interior's -30 m
offset. Imported Blender preview lights are hidden to avoid doubled lighting.

## Apply the layout in Blender

1. Open your current house `.blend` in Object Mode.
2. In Scripting, open `scripts/blender/fix_house_light_layout.py` and run Alt+P.
   No selection is required. The script is standalone.
3. Review the result and `PORTFOLIO_LIGHT_LAYOUT_REPORT`. The table and rug move
   to Blender XY `(6.3, -1.7)`; all four chairs turn 45 degrees around the table
   while facing inward. Their collision boxes move with them; the table's two
   existing collision boxes also move. Dining seat, look, camera and interaction
   markers are regenerated. The cauldron, recipe cabinet and bookshelf stay put.
4. The chandelier receives an Empty with shared lighting settings and two
   parented Blender preview lights. Its Empty is exported even when punctual
   light export is off. The old `COZY_LIGHTS` preview rig is hidden; exterior
   lights are preserved.
5. After reviewing the layout, save a copy of the source `.blend`. Export the
   whole house with **Custom Properties ON**, **Selected Objects OFF** and
   **Active Collection OFF**. Replace the project's house model through the
   existing asset pipeline. This code change deliberately contains no new GLB.

The script preserves mesh data, materials, images and object names. It stores
the original assembly transforms so rerunning produces the same result. Ctrl+Z
undoes the operation. Missing/excluded required objects or foreign markers are
reported before furniture moves. No file is automatically saved or exported.

## Validation

- Typecheck and production build pass.
- Three new lighting checks pass, including the actual current house geometry,
  transformed Blender markers, imported preview-light suppression and shadows
  disabled.
- Blender 5.1.2 verification on the current source: all furniture geometry,
  materials and packed images preserved; a second run is identical; four chair
  collider bounds match; all sixteen dining markers resolve; no camera warnings.
- Right-side chair-to-cabinet clearance measures 2.336 m. A fixed-collider
  navigation check using the production player capsule (radius .35 m,
  half-height .55 m) reaches all chairs, the cauldron and recipe cabinet from
  the entrance side. This checks authored transforms against the current model,
  without exporting a replacement model.
- Full suite: 181/184 pass. The existing compressed-house, stone-LOD hash and
  reviewed-culling hash failures remain unchanged.

The candidate furniture arrangement has authoring preview renders. Human layout
review and live runtime review of the next Blender export remain pending; no
model export, merge or deployment is included here.
