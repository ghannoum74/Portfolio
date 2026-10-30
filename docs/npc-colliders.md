# NPC collision and optional Blender overrides

The seven career guides load from individual GLBs, independently of `world.blend`. Each now receives its own Rapier capsule when `NpcManager` creates it. The existing GLBs work without modification or re-export. Their positions, appearance, rigs, animation clips, dialogue range and the room layout remain unchanged.

## Runtime configuration

Each definition in `NpcData.ts` supplies a `collision` radius, full height and center in local GLB scene coordinates. These values were measured against the seven current character assets in their initial idle pose, using the hips for horizontal centering and a modest margin at the feet/head. Runtime placement, yaw and scale are then applied to those values. No visual meshes or per-frame skinned-bound scans are created for collision. Update the corresponding configuration when replacing a character with a differently proportioned asset.

The capsule uses a kinematic Rapier body. The player controller collides with it, while the follow camera's fixed-wall queries ignore it. Bone animation cannot reshape it, the NPC cannot be pushed, and a changed placement or turn updates its center. Collision is disabled while indoors and restored with the exterior. Startup awaits shared physics and constructs Frequenc's capsule before its readiness gate completes.

An optional valid `COL_CAPSULE_NPC_` mesh inside a GLB takes precedence over its configured dimensions. It replaces the configured shape, so a character still has exactly one collider. Invalid markers produce a warning and use the configured capsule. Legacy assets with no marker require no Blender work.

## Optional Blender authoring

Use [add_npc_colliders.py](../scripts/blender/add_npc_colliders.py) only to author a custom override in a character's source `.blend`:

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

The runtime hides exported helpers and excludes them from NPC shadow meshes before initial rendering. Their transformed vertices determine the override dimensions once on load. Helpers must be unskinned and outside the bones.

## Validation and review

- `node --test tests/npc-colliders.test.mjs`: real Rapier player blocking without a helper, no pushing/autostep, transforms/scales, camera behavior, indoor disabling, optional overrides and cleanup. It also loads the actual seven character GLBs with their shared animations and verifies every configured capsule fits vertically inside its character and creates exactly one body, without a re-export.
- `python tests/npc-capsule-geometry.test.py`: closed, outward-facing capsule topology, dimensions in multiple unit scales and invalid-input rejection; runs without Blender.
- Optional authoring/export check in a separate Blender process: `blender --background --factory-startup --python tests/blender-npc-colliders.test.py -- /path/to/disposable-output`. It makes a fixture rig and exports only that fixture, without opening an owner's source file.

No Blender executable was available in the implementation environment. Python syntax and pure capsule geometry were checked, but the optional Blender scene/export test has not been executed there. In the running app, verify that walking/running stops at each torso, E still reaches the conversation, talking does not shift collision, and entering/exiting the house restores the correct behavior. The live camera and player are the authority for final clearance.
