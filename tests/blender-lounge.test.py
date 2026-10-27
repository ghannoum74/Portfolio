"""Run with Blender --background --factory-startup --python this_file -- OUTPUT_DIR.

Uses a disposable synthetic scene, never the owner's source .blend or runtime GLB.
"""
import importlib.util
import json
import math
import runpy
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("portfolio_lounge", ROOT / "scripts/blender/setup_couch_fireplace.py")
tool = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tool)
OUTPUT = Path(sys.argv[sys.argv.index("--") + 1])
OUTPUT.mkdir(parents=True, exist_ok=True)


def box(name, position, scale=(1, 1, 1), parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1)
    obj = bpy.context.object
    obj.name = name
    obj.parent = parent
    obj.location = position
    obj.scale = scale
    return obj


def snapshot(objects):
    return {
        obj.name: {
            "matrix": [list(row) for row in obj.matrix_world],
            "mesh": obj.data.name if obj.type == "MESH" else None,
            "vertices": [list(v.co) for v in obj.data.vertices] if obj.type == "MESH" else None,
            "materials": [m.name if m else None for m in obj.data.materials] if obj.type == "MESH" else None,
            "parent": obj.parent.name if obj.parent else None,
        }
        for obj in objects
    }


def main():
    if bpy.data.filepath or "--factory-startup" not in sys.argv:
        raise RuntimeError("Run this disposable fixture in a separate Blender process with --factory-startup.")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    couch = bpy.data.objects.new("Fixture Couch.001", None)
    bpy.context.scene.collection.objects.link(couch)
    couch.location = (1, -1, 0)
    couch.rotation_euler.z = math.radians(35)
    couch.scale = (-1.2, 0.8, 1.1)
    seat = box("Fixture_Cushion", (0, 0, 0.45), (2.2, 0.85, 0.3), couch)
    back = box("Fixture_Back", (0, 0.38, 0.8), (2.2, 0.18, 1.0), couch)
    fireplace = box("Fixture_Fireplace", (5, -2, 0.7), (1.5, 0.8, 1.6))
    collider = box("COL_BOX_FIXTURE_COUCH", (1, -1, 0.5), (2, 1, 1))
    bpy.context.view_layer.update()
    originals = (couch, seat, back, fireplace, collider)
    before = snapshot(originals)
    tool.register()
    settings = bpy.context.scene.portfolio_lounge
    settings.couch, settings.fireplace = couch, fireplace
    tool.register()  # Text Editor rerun keeps the pointers and has no class collision.
    assert bpy.context.scene.portfolio_lounge.couch == couch
    repeat_spec = importlib.util.spec_from_file_location("portfolio_lounge_repeat", spec.origin)
    repeated = importlib.util.module_from_spec(repeat_spec)
    repeat_spec.loader.exec_module(repeated)
    repeated.register()  # A new Text Editor execution creates new Python class objects.
    assert bpy.context.scene.portfolio_lounge.couch == couch
    settings = bpy.context.scene.portfolio_lounge
    settings.couch, settings.fireplace = None, None
    bpy.ops.object.select_all(action="DESELECT")
    couch.select_set(True)
    bpy.context.view_layer.objects.active = couch
    runpy.run_path(str(spec.origin), run_name="__main__")
    assert bpy.context.scene.portfolio_lounge.couch == couch
    assert bpy.context.scene.portfolio_lounge.fireplace == fireplace
    bpy.context.view_layer.update()
    expected_cushion_top = max((seat.matrix_world @ Vector(v.co)).z for v in seat.data.vertices)
    assert abs(bpy.data.objects["SEAT_COUCH"].matrix_world.translation.z - expected_cushion_top) < 1e-5
    auto_positions = {name: list(bpy.data.objects[name].matrix_world.translation) for name in tool.MARKERS}
    generated_count = len(bpy.data.objects)
    assert bpy.ops.portfolio_lounge.auto_setup() == {"FINISHED"}
    bpy.context.view_layer.update()
    assert len(bpy.data.objects) == generated_count
    assert {name: list(bpy.data.objects[name].matrix_world.translation) for name in tool.MARKERS} == auto_positions
    assert bpy.ops.portfolio_lounge.build() == {"FINISHED"}
    bpy.context.view_layer.update()
    assert snapshot(originals) == before
    # Referencing the generated root itself must remain valid in the manual panel.
    tool.create_markers(couch, fireplace, bpy.data.objects[tool.FIRE_ROOT])
    assert len(bpy.data.objects) == generated_count
    assert len([o for o in bpy.data.objects if o.type == "LIGHT"]) == 0
    assert all(bpy.data.objects[name].type == "EMPTY" for name in tool.MARKERS)
    flame = bpy.data.objects[tool.FIRE_ROOT]
    assert len(flame.children) == 3
    triangles = sum(len(obj.data.polygons) for obj in flame.children)
    assert triangles == 120
    marker = bpy.data.objects["SEAT_COUCH"]
    marker.location.z += 0.03
    bpy.context.view_layer.update()
    positions = {name: list(bpy.data.objects[name].matrix_world.translation) for name in tool.MARKERS}
    count = len(bpy.data.objects)
    tool.create_markers(couch, fireplace)
    bpy.context.view_layer.update()
    assert len(bpy.data.objects) == count
    assert {name: list(bpy.data.objects[name].matrix_world.translation) for name in tool.MARKERS} == positions
    assert snapshot(originals) == before
    # Empty/collider input is rejected before mutating the valid setup.
    try:
        tool.create_markers(collider, fireplace)
    except ValueError:
        pass
    else:
        raise AssertionError("Collider must not be treated as a visual couch")
    assert len(bpy.data.objects) == count
    assert snapshot(originals) == before

    path = OUTPUT / "lounge-fixture.glb"
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", export_extras=True,
                              export_animations=False, use_selection=False)
    data = path.read_bytes()
    length = struct.unpack_from("<I", data, 12)[0]
    document = json.loads(data[20:20 + length])
    nodes = {node.get("name"): node for node in document["nodes"]}
    for name, position in positions.items():
        actual = nodes[name].get("translation", [0, 0, 0])
        expected = [position[0], position[2], -position[1]]
        assert max(abs(a - b) for a, b in zip(actual, expected)) < 1e-5, (name, actual, expected)
    assert nodes["INTERACT_COUCH"]["extras"]["targetObject"] == couch.name
    assert nodes["INTERACT_FIREPLACE"]["extras"]["flameObject"] == flame.name
    assert nodes["INTERACT_FIREPLACE"]["extras"]["initialOn"] is False
    assert nodes[couch.name]["extras"]["staticOptimization"] is False
    assert snapshot(originals) == before

    # A separately authored flame is referenced, not rebuilt, moved or reparented.
    existing = box("AuthoredFlame", (5, -2, 0.6), (0.2, 0.2, 0.5))
    bpy.context.view_layer.update()
    authored = snapshot((existing,))
    tool.create_markers(couch, fireplace, existing, True)
    assert bpy.data.objects["INTERACT_FIREPLACE"]["flameObject"] == existing.name
    assert bpy.data.objects["INTERACT_FIREPLACE"]["initialOn"] is True
    assert snapshot((existing,)) == authored
    assert bpy.data.objects.get(tool.FIRE_ROOT) is None
    assert not any(bpy.data.objects.get(name) for name in tool.FIRE_PARTS)
    count = len(bpy.data.objects)
    try:
        tool.create_markers(couch, fireplace)
    except ValueError:
        pass
    else:
        raise AssertionError("Do not generate a second fire while an authored flame is still bound")
    assert len(bpy.data.objects) == count
    assert snapshot(originals) == before

    # Anonymous object names are supported by explicit two-object selection.
    from types import SimpleNamespace
    original_names = couch.name, fireplace.name
    try:
        couch.name, fireplace.name = "Furniture_A", "Furniture_B"
        bpy.ops.object.select_all(action="DESELECT")
        couch.select_set(True)
        fireplace.select_set(True)
        bpy.context.view_layer.objects.active = couch
        detected = tool.automatic_targets(SimpleNamespace(couch=None, fireplace=None, flame=None))
        assert detected[:2] == (couch, fireplace)
        bpy.ops.object.select_all(action="DESELECT")
        try:
            tool.automatic_targets(SimpleNamespace(couch=None, fireplace=None, flame=None))
        except ValueError:
            pass
        else:
            raise AssertionError("Ambiguous furniture must request selection instead of guessing")
        assert len(bpy.data.objects) == count
    finally:
        couch.name, fireplace.name = original_names
    assert snapshot(originals) == before

    result = {
        "blender": bpy.app.version_string,
        "script": "scripts/blender/setup_couch_fireplace.py",
        "sourceFurnitureTransformsMeshesMaterialsPreserved": True,
        "automaticTextEditorRunPassed": True,
        "cushionSurfaceRaycastPassed": True,
        "automaticRerunHasNoDriftOrDuplicates": True,
        "anonymousSelectedFurnitureDetected": True,
        "ambiguousFurnitureDeclinedWithoutMutation": True,
        "collidersPreserved": True,
        "rerunPreservesAdjustedMarkers": True,
        "textEditorReregistrationPassed": True,
        "noBlenderLightsAdded": True,
        "generatedFlameTriangles": triangles,
        "customPropertiesExported": True,
        "yUpMarkerPositionsVerified": True,
        "existingFlamePreserved": True,
        "changingFlameSourceRemovesOnlyOwnedGeneratedFire": True,
        "fixture": str(path),
        "ownerHouseModified": False,
        "nativeGameVisualReview": False,
    }
    (OUTPUT / "review.json").write_text(json.dumps(result, indent=2) + "\n")
    print("PORTFOLIO_BLENDER_TEST_PASS", json.dumps(result))


main()
