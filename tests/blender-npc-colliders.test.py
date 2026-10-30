"""Disposable Blender authoring/export check; never opens the owner's sources.

blender --background --factory-startup --python tests/blender-npc-colliders.test.py -- OUTPUT_DIR
"""
import json
import runpy
import struct
import sys
from pathlib import Path

import bpy

if "--factory-startup" not in sys.argv or bpy.data.filepath:
    raise RuntimeError("Use a separate Blender process with --factory-startup.")
output = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
output.mkdir(parents=True, exist_ok=True)
root = Path(__file__).resolve().parents[1]
tool = runpy.run_path(str(root / "scripts/blender/add_npc_colliders.py"), run_name="npc_authoring_test")

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
data = bpy.data.armatures.new("FixtureRig")
rig = bpy.data.objects.new("FixtureRig", data)
bpy.context.scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
hips = data.edit_bones.new("mixamorig:Hips")
hips.head, hips.tail = (0, 0, .9), (0, 0, 1.1)
bpy.ops.object.mode_set(mode="OBJECT")
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, .9))
mesh = bpy.context.object
mesh.name = "Ch14"
mesh.dimensions = (.5, .4, 1.8)
mesh.parent = rig
group = mesh.vertex_groups.new(name="mixamorig:Hips")
group.add(list(range(len(mesh.data.vertices))), 1, "REPLACE")
modifier = mesh.modifiers.new("Rig", "ARMATURE")
modifier.object = rig
rig.location = (2, -1, .2)
rig.rotation_euler.z = .6
rig.scale = (1.3, 1.3, 1.3)
bpy.context.view_layer.update()
transforms = {obj.name: obj.matrix_world.copy() for obj in (rig, mesh)}
bones = [(bone.name, bone.matrix_local.copy()) for bone in rig.data.bones]
tool["add_colliders"]([rig])
capsule = bpy.data.objects["COL_CAPSULE_NPC_frequenc"]
assert capsule.parent is None
assert capsule.display_type == "WIRE" and capsule.hide_render
assert not capsule.modifiers
assert capsule["portfolioNpcCollider"] is True
capsule.location.x += .1
bpy.context.view_layer.update()
authored_matrix = capsule.matrix_world.copy()
mesh_data = capsule.data
tool["add_colliders"]([rig])
bpy.context.view_layer.update()
assert capsule.data == mesh_data
assert capsule.matrix_world == authored_matrix
assert len([obj for obj in bpy.data.objects if obj.name.startswith("COL_CAPSULE_NPC_")]) == 1
assert [(bone.name, bone.matrix_local) for bone in rig.data.bones] == bones
for obj in (rig, mesh):
    assert obj.matrix_world == transforms[obj.name]

bpy.ops.object.select_all(action="DESELECT")
for obj in bpy.data.collections["NPC_EXPORT_frequenc"].objects:
    obj.select_set(True)
path = output / "frequenc-fixture.glb"
bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True,
                          use_renderable=False, export_extras=True)
raw = path.read_bytes()
size = struct.unpack_from("<I", raw, 12)[0]
document = json.loads(raw[20:20 + size])
marker = next(node for node in document["nodes"] if node.get("name") == capsule.name)
assert "mesh" in marker
assert marker["extras"]["portfolioNpcCollider"] is True
assert marker["extras"]["portfolioNpcId"] == "frequenc"
print("PASS: authoring is idempotent, preserves rig data and exports the hidden-render helper.")
