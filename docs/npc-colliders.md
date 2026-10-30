# NPC collision contract and Blender workflow

Purpose: stop the player from walking through the seven stationary career guides. Their authored positions, appearance, rigs, animation clips, dialogue range and the room layout remain unchanged. No paid assets, room reconstruction, production exports or deployment are part of this source change.

## Blender is the collision source

Run [add_npc_colliders.py](../scripts/blender/add_npc_colliders.py) in the character's source `.blend`:

1. Select the NPC armature or one of its skinned meshes in **Object Mode**.
2. Open the script in **Scripting** and run it with **Alt+P**. Known mesh names identify the supplied characters automatically. If the source meshes were renamed, set `NPC_ID` near the top of the script to one of the IDs below. Several selected NPC rigs can be processed together when `NPC_ID` is blank. The player is skipped because its controller already creates a capsule.
3. Review the orange wire capsule in front and side views. Its initial radius is 16% of evaluated character height, with a 2% margin at the feet and head. It is centered horizontally at the hips when available. Move/scale it in Object Mode to fit the torso; it should not span the outstretched arms. Reruns retain manual edits. Set `REBUILD_EXISTING = True` only when intentionally regenerating the shape.
4. In the Outliner, right-click `NPC_EXPORT_<id>` and **Select Objects**. This includes the armature, visual meshes and `COL_CAPSULE_NPC_<id>`. The helper is unparented and unskinned; export it with the character, not with `world.glb`.
5. Export **glTF 2.0 → GLB**, with **Selected Objects** and **Custom Properties** enabled. Keep **Renderable Objects** and **Visible Objects** filtering disabled so the helper is included despite `hide_render`. Preserve animation/skin export settings used by the character source. Export only one character per GLB, using its original filename below. Save the source `.blend` yourself; the script never saves or exports.

| NPC_ID | Runtime GLB under `public/assets/models/player/` |
| --- | --- |
| `frequenc` | `frequenc.glb` |
| `mtc` | `MTC.glb` |
| `bepro` | `bePro.glb` |
| `42` | `42.glb` |
| `interphase` | `interphase.glb` |
| `prodigy` | `prodigy.glb` |
| `se-factory` | `se-factory.glb` |

Use the original Blender sources. Some runtime GLBs are meshopt-compressed and may not be directly importable by a Blender installation. The helper and source asset must share the same export units and transforms. Do not apply transforms to the rig just to add this helper.

## Runtime behavior

`NpcCollider.ts` reads exactly one unskinned `COL_CAPSULE_NPC_` mesh from each character GLB. Its transformed vertices determine the capsule dimensions once on load, including the scale set by `NpcData.ts`. Helpers are hidden and excluded from NPC shadow meshes before initial rendering. There is deliberately no collider inferred from the visible character when the marker is missing or invalid; the console reports the asset that needs re-exporting.

The capsule uses a kinematic Rapier body. The existing player controller collides with it, while the follow camera's fixed-wall queries ignore it. Bone animation cannot reshape it. A changed character placement or turn updates its authored center; the NPC cannot be pushed by the player. NPC collision is disabled while indoors and restored with the exterior. Startup awaits shared physics before constructing the first NPC's collider, preserving the Frequenc readiness gate.

The current seven checked-in GLBs have no authored NPC capsules. **Collision becomes active per character after its source is updated and its GLB is re-exported.** This change intentionally leaves those binaries untouched.

## Validation and review

- `node --test tests/npc-colliders.test.mjs`: real Rapier player blocking, no pushing/autostep, transforms/scales, camera behavior, indoor disabling, missing/invalid markers and cleanup.
- `python tests/npc-capsule-geometry.test.py`: closed, outward-facing capsule topology, dimensions in multiple unit scales and invalid-input rejection; runs without Blender.
- Optional authoring/export check in a separate Blender process: `blender --background --factory-startup --python tests/blender-npc-colliders.test.py -- /path/to/disposable-output`. It makes a fixture rig and exports only that fixture, without opening an owner's source file.

No Blender executable was available in the implementation environment. Python syntax and pure capsule geometry were checked, but the Blender scene/export test has not been executed there. After re-exporting, verify in the running app that walking/running stops at each torso, E still reaches the conversation, talking does not shift collision, and entering/exiting the house restores the correct behavior. The live camera and player are the authority for final clearance.
