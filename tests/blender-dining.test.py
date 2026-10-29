"""Run with Blender --background --factory-startup --python this_file -- OUTPUT_DIR.

Exercises the authoring tool on a disposable scene with an excluded collection.
It never opens or changes the owner's house file.
"""
import importlib.util
import json
import math
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("portfolio_dining", ROOT / "scripts/blender/setup_dining_alchemy.py")
tool = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tool)
OUTPUT = Path(sys.argv[sys.argv.index("--") + 1])
OUTPUT.mkdir(parents=True, exist_ok=True)


def box(name, location, size):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj


def main():
    if bpy.data.filepath or "--factory-startup" not in sys.argv:
        raise RuntimeError("Run this fixture in a separate Blender process with --factory-startup.")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    table = box("Table_RoundSmall2", (0, 0, 0.7), (1.8, 1.8, 0.12))
    seat = box("seat-part", (1.55, 0, 0.48), (0.62, 0.62, 0.1))
    back = box("back-part", (1.83, 0, 0.8), (0.1, 0.62, 0.7))
    leg = box("leg-part", (1.55, 0, 0.23), (0.12, 0.12, 0.46))
    bpy.ops.object.select_all(action="DESELECT")
    for obj in (seat, back, leg):
        obj.select_set(True)
    bpy.context.view_layer.objects.active = seat
    bpy.ops.object.join()
    seat.name = "SEC_PROJECTS_Chair_1"

    excluded = bpy.data.collections.new("Excluded_Reference_Collection")
    bpy.context.scene.collection.children.link(excluded)
    raft = box("Raft", (0, 0, 0.6), (12, 12, 4))
    for collection in tuple(raft.users_collection):
        collection.objects.unlink(raft)
    excluded.objects.link(raft)
    bpy.context.view_layer.layer_collection.children[excluded.name].exclude = True
    bpy.context.view_layer.update()
    assert bpy.context.view_layer.objects.get(raft.name) is None

    bpy.ops.object.select_all(action="DESELECT")
    table.select_set(True)
    bpy.context.view_layer.objects.active = table
    bpy.context.view_layer.update()
    before = {obj.name: (tuple(obj.location), tuple(obj.rotation_euler), tuple(obj.scale), obj.data.name)
              for obj in (table, seat, raft)}
    lines = tool.run()
    assert lines[0] == "READY: 1 dining chair(s), 4 markers.", lines
    marker = bpy.context.scene.objects["INTERACT_DINING_CHAIR_01"]
    assert marker["portfolioInteraction"] == "diningChair"
    assert marker["targetObject"] == seat.name
    for key in ("seatObject", "lookObject", "cameraObject"):
        assert bpy.context.scene.objects.get(marker[key])
    assert "Raft" not in {obj.name for obj, _, _ in tool.camera_obstacles()[0]}
    for obj in (table, seat, raft):
        assert before[obj.name] == (tuple(obj.location), tuple(obj.rotation_euler), tuple(obj.scale), obj.data.name)
    first = {obj.name: tuple(obj.matrix_world.translation) for obj in bpy.context.scene.objects if obj.get("portfolioOwner") == tool.OWNER}
    tool.run()
    second = {obj.name: tuple(obj.matrix_world.translation) for obj in bpy.context.scene.objects if obj.get("portfolioOwner") == tool.OWNER}
    assert first.keys() == second.keys() and len(second) == 4
    for name in first:
        assert all(math.isclose(a, b, abs_tol=1e-6) for a, b in zip(first[name], second[name]))

    class NoEvaluatedMesh:
        name = "UnavailableVisibleMesh"
        matrix_world = Matrix.Identity(4)

        def ray_cast(self, *_args):
            raise RuntimeError("No evaluated mesh data")

    unavailable = set()
    assert tool.clear_camera(Vector((0, 0, 0)), Vector((1, 0, 0)),
        [(NoEvaluatedMesh(), Vector((-1, -1, -1)), Vector((2, 1, 1)))], [], unavailable)
    assert unavailable == {"UnavailableVisibleMesh"}

    bpy.ops.object.select_all(action="DESELECT")
    seat.select_set(True)
    for obj in bpy.context.scene.objects:
        if obj.get("portfolioOwner") == tool.OWNER:
            obj.select_set(True)
    path = OUTPUT / "dining-marker-fixture.glb"
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True,
                              export_extras=True, export_animations=False)
    with path.open("rb") as stream:
        stream.read(12)
        size, _ = struct.unpack("<II", stream.read(8))
        gltf = json.loads(stream.read(size))
    node = next(node for node in gltf["nodes"] if node.get("name") == "INTERACT_DINING_CHAIR_01")
    assert node["extras"]["portfolioInteraction"] == "diningChair"
    assert node["extras"]["targetObject"] == "SEC_PROJECTS_Chair_1"
    print("PORTFOLIO_DINING_BLENDER_TEST_PASS", bpy.app.version_string)


main()
