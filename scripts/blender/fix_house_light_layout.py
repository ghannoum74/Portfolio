"""Fix the existing portfolio house chandelier and dining circulation in Blender.

Object Mode > Scripting > Open > Alt+P. No selection is required.
Moves the existing table/rug toward the center and turns its four chairs into
an inward-facing diagonal arrangement. Moves the matching colliders and rebuilds
all dining/alchemy markers. Adds one ceiling-fixture downlight and a small spill
light, using the same custom properties as the runtime HouseLighting.ts.

Designed for the named objects in this portfolio house. Rerunning is idempotent.
Only the listed assembly and old COZY interior preview rig are changed. Furniture
meshes, materials, images, exterior geometry, and other sections are preserved.
The operation supports Undo. It never saves or exports your file.

Review PORTFOLIO_LIGHT_LAYOUT_REPORT, save a copy of your .blend, then export the
whole house with Custom Properties ON; Selected Objects and Active Collection
OFF. The matching runtime update is required to replace the old generic lights.
"""

import math
import re
import traceback

import bpy
from mathutils import Matrix, Vector

OWNER = "portfolio.dining-alchemy.v1"
REPORT_NAME = "PORTFOLIO_DINING_REPORT"
BOOKSHELF_OBJECT_NAME = "Bookcase_2"
CAULDRON_OBJECT_NAME = "SEC_ALCHEMY_Cauldron"
DRAWER_OBJECT_NAME = "SEC_ALCHEMY_Drawer_4"
HELPERS = ("COL_", "ZONE_", "INTERACT_", "SEAT_", "LOOK_", "CAM_", "ANCHOR_")


def bounds(root):
    """World-space bounds of evaluated visual meshes, in Blender Z-up axes."""
    points = []
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for obj in (root, *root.children_recursive):
        if obj.type != "MESH" or obj.name.startswith(HELPERS) or obj.get("portfolioHelper"):
            continue
        evaluated = obj.evaluated_get(depsgraph)
        if evaluated.data and len(evaluated.data.vertices):
            points.extend(evaluated.matrix_world @ Vector(corner) for corner in evaluated.bound_box)
    if not points:
        raise ValueError("No visual mesh found for '" + root.name + "'.")
    low = Vector(tuple(min(point[i] for point in points) for i in range(3)))
    high = Vector(tuple(max(point[i] for point in points) for i in range(3)))
    if not all(math.isfinite(value) for point in (low, high) for value in point):
        raise ValueError("Non-finite bounds on '" + root.name + "'.")
    return low, high


def visual_object(obj):
    return bool(obj and obj.name in bpy.context.scene.objects and not obj.library and
                not obj.name.startswith(HELPERS) and not obj.get("portfolioHelper"))


def upward_seat(chair, low, high, forward):
    """Sample chair top surfaces; ignore the taller back and helper objects."""
    center, size = (low + high) * 0.5, high - low
    depth = max(0.1, abs(forward.x) * size.x + abs(forward.y) * size.y)
    right = Vector((-forward.y, forward.x, 0))
    width = max(0.1, abs(right.x) * size.x + abs(right.y) * size.y)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    hits = []
    for longitudinal in (0, -0.16, 0.16, -0.30, 0.30):
        for lateral in (0, -0.14, 0.14):
            start = center + forward * (longitudinal * depth) + right * (lateral * width)
            start.z = high.z + 0.25
            for obj in (chair, *chair.children_recursive):
                if obj.type != "MESH" or obj.name.startswith(HELPERS) or obj.get("portfolioHelper"):
                    continue
                evaluated = obj.evaluated_get(depsgraph)
                if abs(evaluated.matrix_world.determinant()) < 1e-10:
                    continue
                inverse = evaluated.matrix_world.inverted()
                direction = (inverse.to_3x3() @ Vector((0, 0, -1))).normalized()
                found, point, normal, _ = evaluated.ray_cast(inverse @ start, direction)
                if not found:
                    continue
                world = evaluated.matrix_world @ point
                world_normal = (inverse.transposed().to_3x3() @ normal).normalized()
                if world_normal.z > 0.45 and low.z + size.z * 0.18 <= world.z <= low.z + size.z * 0.78:
                    hits.append((abs(longitudinal) + abs(lateral), -world.z, world))
    if hits:
        return min(hits, key=lambda item: item[:2])[2], True
    # A reviewable estimate is safer than silently moving or editing the chair.
    center.z = low.z + size.z * 0.43
    return center, False


def camera_obstacles():
    """Cache evaluated bounds once; helpers do not obscure a camera view."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    visuals, colliders, unavailable = [], [], set()
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or obj.get("portfolioHelper"):
            continue
        # Scene objects in excluded collections are not in the active
        # dependency graph and cannot be ray-cast, even when hide_get() is false.
        if bpy.context.view_layer.objects.get(obj.name) is None:
            continue
        is_collider = obj.name.startswith("COL_BOX_")
        if not is_collider and (obj.name.startswith(HELPERS) or obj.hide_render or not obj.visible_get()):
            continue
        evaluated = obj.evaluated_get(depsgraph)
        if not evaluated.data or not len(evaluated.data.vertices) or abs(evaluated.matrix_world.determinant()) < 1e-10:
            continue
        points = [evaluated.matrix_world @ Vector(corner) for corner in evaluated.bound_box]
        low = Vector(tuple(min(point[i] for point in points) for i in range(3)))
        high = Vector(tuple(max(point[i] for point in points) for i in range(3)))
        if is_collider:
            colliders.append((low, high))
        else:
            visuals.append((evaluated, low, high))
    return visuals, colliders, unavailable


def clear_camera(camera, target, visuals, colliders, unavailable):
    # Keep the camera outside expanded collider bounds, including walls.
    for low, high in colliders:
        if all(low[i] - 0.18 <= camera[i] <= high[i] + 0.18 for i in range(3)):
            return False
    direction = target - camera
    distance = direction.length
    if distance < 0.1:
        return False
    for obj, low, high in visuals:
        # Most of the room cannot intersect this short line segment.
        if any(max(camera[i], target[i]) < low[i] or min(camera[i], target[i]) > high[i] for i in range(3)):
            continue
        inverse = obj.matrix_world.inverted()
        local_direction = (inverse.to_3x3() @ direction).normalized()
        try:
            found, location, _, _ = obj.ray_cast(inverse @ camera, local_direction)
        except RuntimeError:
            # Some visible objects can still lack an evaluated mesh. Keep the
            # setup usable, but tell the author that its camera needs review.
            unavailable.add(obj.name)
            continue
        if found:
            hit = obj.matrix_world @ location
            if (hit - camera).length < distance - 0.03:
                return False
    return True


def camera_for_seat(seat, forward, right, obstacles):
    target = seat + Vector((0, 0, 0.43))
    # Try a small number of side views before settling for an obstructed shot.
    for sideways in (1.9, -1.9, 2.2, -2.2, 1.5, -1.5, 1.1, -1.1):
        for behind in (0.6, 0.0, 0.95, 1.3):
            for height in (1.25, 1.55, 1.85):
                camera = seat - forward * behind + right * sideways + Vector((0, 0, height))
                if clear_camera(camera, target, *obstacles):
                    return camera, True
    return seat - forward * 0.6 + right * 1.9 + Vector((0, 0, 1.25)), False


def make_plan():
    scene = bpy.context.scene
    table = bpy.context.view_layer.objects.active
    if not visual_object(table) or "table" not in table.name.lower():
        raise ValueError("Select the round dining table in Object Mode, make it active, and run again.")
    table_low, table_high = bounds(table)
    table_center, table_size = (table_low + table_high) * 0.5, table_high - table_low
    if min(table_size.x, table_size.y) < 0.25 or max(table_size.x, table_size.y) > 5:
        raise ValueError("The active table has unexpected bounds. Select the dining table itself.")
    selected = [obj for obj in bpy.context.selected_objects if obj != table and visual_object(obj)]
    if selected:
        chairs = selected
    else:
        chairs = [obj for obj in scene.objects if visual_object(obj) and
                  re.match(r"^SEC_PROJECTS_Chair_1(?:\.\d+)?$", obj.name, re.I)]
    candidates = []
    max_distance = max(table_size.x, table_size.y) * 0.5 + 1.6
    for chair in chairs:
        low, high = bounds(chair)
        size, center = high - low, (high + low) * 0.5
        distance = (center - table_center).to_2d().length
        if size.z < 0.3 or size.z > 2.5 or max(size.x, size.y) > 2 or distance > max_distance:
            raise ValueError("'" + chair.name + "' is not a nearby chair-sized object. Select only the table and its chairs.")
        candidates.append((chair, low, high, center))
    if not candidates:
        raise ValueError("No dining chairs found. Select the chairs, then Shift-select the table last and run again.")
    if len(candidates) > 8:
        raise ValueError("More than eight chairs were selected; select only the dining chairs.")
    candidates.sort(key=lambda item: (math.atan2(item[3].y - table_center.y, item[3].x - table_center.x), item[0].name))

    planned, warnings = [], []
    obstacles = camera_obstacles()
    for index, (chair, low, high, center) in enumerate(candidates, 1):
        forward = table_center - center
        forward.z = 0
        if forward.length < 0.05:
            raise ValueError("Chair '" + chair.name + "' is centered on the table.")
        forward.normalize()
        right = Vector((-forward.y, forward.x, 0))
        seat, found = upward_seat(chair, low, high, forward)
        if not found:
            warnings.append("Seat height estimated for " + chair.name + "; inspect SEAT_DINING_%02d." % index)
        size = high - low
        depth = abs(forward.x) * size.x + abs(forward.y) * size.y
        trigger = center - forward * (depth * 0.5 + 0.2)
        trigger.z = low.z + 0.25
        look = seat + forward
        camera, camera_clear = camera_for_seat(seat, forward, right, obstacles)
        if not camera_clear:
            warnings.append("Camera view may be blocked for " + chair.name + "; inspect CAM_DINING_%02d." % index)
        suffix = "%02d" % index
        names = ["INTERACT_DINING_CHAIR_" + suffix, "SEAT_DINING_" + suffix,
                 "LOOK_DINING_" + suffix, "CAM_DINING_" + suffix]
        metadata = {"portfolioInteraction": "diningChair", "targetObject": chair.name,
                    "seatObject": names[1], "lookObject": names[2], "cameraObject": names[3]}
        for name, position, data in zip(names, (trigger, seat, look, camera), (metadata, {}, {}, {})):
            planned.append((name, position, data))

    for object_name, marker_name, interaction in (
        (CAULDRON_OBJECT_NAME, "INTERACT_ALCHEMY_CAULDRON", "alchemy"),
        (DRAWER_OBJECT_NAME, "INTERACT_RECIPE_DRAWER", "recipe"),
        (BOOKSHELF_OBJECT_NAME, "INTERACT_LIBRARY_SHELF", "bookshelf"),
    ):
        target = scene.objects.get(object_name)
        if not visual_object(target):
            warnings.append("Optional object not found: " + object_name + ". Change its name in the script if needed.")
            continue
        low, high = bounds(target)
        center, size = (low + high) * 0.5, high - low
        front = table_center - center
        front.z = 0
        if front.length < 0.05:
            front = Vector((0, -1, 0))
        front.normalize()
        if interaction == "alchemy":
            point = center.copy()
        else:
            distance = (abs(front.x) * size.x + abs(front.y) * size.y) * 0.5 + 0.15
            point = center + front * distance
        point.z = low.z + min(0.55, size.z * 0.5)
        planned.append((marker_name, point, {"portfolioInteraction": interaction, "targetObject": target.name}))

    if obstacles[2]:
        warnings.append("Camera check could not ray-cast: " + ", ".join(sorted(obstacles[2])) + "; inspect the camera markers.")

    for name, _, _ in planned:
        existing = bpy.data.objects.get(name)
        if existing and (existing.type != "EMPTY" or existing.library or existing.get("portfolioOwner") != OWNER or
                         existing.name not in scene.objects):
            raise ValueError("'" + name + "' already exists and was not created by this tool. Rename it before continuing.")
    return planned, warnings, candidates


def prepare_markers():
    planned, warnings, chairs = make_plan()  # Validate everything before editing.
    scene = bpy.context.scene
    created_names = {item[0] for item in planned}
    for name, point, data in planned:
        marker = scene.objects.get(name)
        if marker is None:
            marker = bpy.data.objects.new(name, None)
        if scene.collection.objects.get(name) is None:
            scene.collection.objects.link(marker)
        marker.hide_render = False
        marker.hide_viewport = False
        marker.empty_display_type = "SPHERE" if name.startswith("INTERACT_") else "ARROWS"
        marker.empty_display_size = 0.12 if name.startswith("INTERACT_") else 0.16
        marker.matrix_world.translation = point
        marker["portfolioOwner"] = OWNER
        marker["portfolioHelper"] = True
        for key in ("portfolioInteraction", "targetObject", "seatObject", "lookObject", "cameraObject"):
            if key in marker:
                del marker[key]
        for key, value in data.items():
            marker[key] = value
    # Retire only this tool's unused chair triggers, without deleting markers.
    for obj in scene.objects:
        if obj.name.startswith("INTERACT_DINING_CHAIR_") and obj.get("portfolioOwner") == OWNER and obj.name not in created_names:
            obj["portfolioInteraction"] = "unusedDiningChair"
    bpy.context.view_layer.update()
    for name in created_names:
        scene.objects[name].hide_set(False)
    report = bpy.data.texts.get(REPORT_NAME) or bpy.data.texts.new(REPORT_NAME)
    report.clear()
    lines = ["READY: %d dining chair(s), %d markers." % (len(chairs), len(planned)),
             "Review SEAT_DINING, LOOK_DINING and CAM_DINING placements before export.",
             "Chairs: " + ", ".join(item[0].name for item in chairs),
             "Export the whole house as GLB with Custom Properties ON and Selected Objects OFF.",
             "The recipe is a panel; this tool does not pull apart a single-mesh cabinet."]
    lines.extend("WARNING: " + warning for warning in warnings)
    report.write("\n".join(lines))
    print("\n".join(lines))
    return lines


LAYOUT_OWNER = "portfolio.house-light-layout.v1"
LAYOUT_REPORT = "PORTFOLIO_LIGHT_LAYOUT_REPORT"
ORIGINAL_MATRIX = "portfolioDiningOriginalMatrix"
TARGET_TABLE_XY = (6.3, -1.7)  # Blender X/Y; game X/Z becomes (6.3, 1.7).
CHAIR_TURN_DEGREES = 45
LIGHT_COLOR = "#ffd3a0"
LIGHT_INTENSITY = 100  # Candela, shared with HouseLighting.ts.
LIGHT_RANGE = 26
LIGHT_SPILL = 8
CHAIR_NAMES = tuple("SEC_PROJECTS_Chair_1" + suffix for suffix in ("", ".001", ".002", ".003"))
TRANSLATED_NAMES = ("Table_RoundSmall2", "SEC_PROJECTS_Carpet_1",
                    "COL_BOX_PROJECTS_Table_RoundSmall2", "COL_BOX_PROJECTS_TABLE")
ROTATED_NAMES = CHAIR_NAMES + tuple(name.replace("SEC_", "COL_BOX_", 1) for name in CHAIR_NAMES)


def original_matrix(obj):
    stored = obj.get(ORIGINAL_MATRIX)
    if stored is None:
        return obj.matrix_world.copy()
    if len(stored) != 16 or not all(math.isfinite(v) for v in stored):
        raise ValueError("Invalid stored layout matrix on " + obj.name)
    return Matrix([list(stored[i:i + 4]) for i in range(0, 16, 4)])


def layout_plan():
    scene = bpy.context.scene
    required = TRANSLATED_NAMES + ROTATED_NAMES + ("Chandelier", "SEC_ALCHEMY_Cauldron", "COL_BOX_ALCHEMY_Cauldron")
    objects = {}
    for name in required:
        obj = scene.objects.get(name)
        if not obj or obj.type != "MESH" or obj.library or bpy.context.view_layer.objects.get(name) is None:
            raise ValueError("Required editable house object is missing/excluded: " + name)
        objects[name] = obj
    for name, kind in (("LIGHT_HOUSE_CHANDELIER", "EMPTY"),
                       ("PREVIEW_HOUSE_CHANDELIER_DOWN", "LIGHT"),
                       ("PREVIEW_HOUSE_CHANDELIER_SPILL", "LIGHT")):
        obj = bpy.data.objects.get(name)
        if obj and (obj.type != kind or obj.library or obj.get("portfolioOwner") != LAYOUT_OWNER):
            raise ValueError(name + " exists and is not owned by this tool; rename it first.")

    table = objects["Table_RoundSmall2"]
    saved = original_matrix(table)
    corners = [saved @ Vector(corner) for corner in table.bound_box]
    center = Vector(((min(p.x for p in corners) + max(p.x for p in corners)) * 0.5,
                     (min(p.y for p in corners) + max(p.y for p in corners)) * 0.5, 0))
    if max((saved.to_scale().x, saved.to_scale().y)) > 1.1:
        raise ValueError("The dining assembly scale has changed; review TARGET_TABLE_XY before using this house-specific layout.")
    destination = Vector((*TARGET_TABLE_XY, 0))
    shift = Matrix.Translation(destination - center)
    turn = Matrix.Translation(destination) @ Matrix.Rotation(math.radians(CHAIR_TURN_DEGREES), 4, 'Z') @ Matrix.Translation(-center)
    planned = [(objects[name], transform @ original_matrix(objects[name]))
               for names, transform in ((TRANSLATED_NAMES, shift), (ROTATED_NAMES, turn)) for name in names]
    return table, objects["Chandelier"], planned


def fixture_anchor(fixture, position):
    name = "LIGHT_HOUSE_CHANDELIER"
    obj = bpy.context.scene.objects.get(name)
    if obj is None:
        obj = bpy.data.objects.new(name, None)
        bpy.context.scene.collection.objects.link(obj)
    obj["portfolioOwner"] = LAYOUT_OWNER
    obj["portfolioHelper"] = True
    obj["portfolioLightColor"] = LIGHT_COLOR
    obj["portfolioLightIntensity"] = LIGHT_INTENSITY
    obj["portfolioLightRange"] = LIGHT_RANGE
    obj["portfolioLightSpill"] = LIGHT_SPILL
    obj.empty_display_type = 'PLAIN_AXES'
    obj.empty_display_size = .2
    obj.parent = fixture
    obj.matrix_parent_inverse = fixture.matrix_world.inverted()
    obj.matrix_world = Matrix.Translation(position)
    obj.hide_render = False
    obj.hide_viewport = False
    bpy.context.view_layer.update()
    obj.hide_set(False)
    return obj


def fixture_light(name, kind, fixture, position, intensity):
    obj = bpy.context.scene.objects.get(name)
    if obj is None:
        data = bpy.data.lights.new(name, kind)
        obj = bpy.data.objects.new(name, data)
        bpy.context.scene.collection.objects.link(obj)
    obj.data.type = kind
    obj["portfolioOwner"] = LAYOUT_OWNER
    # The separate Empty anchor survives even with punctual-light export off.
    obj["portfolioLightColor"] = LIGHT_COLOR
    obj["portfolioLightIntensity"] = LIGHT_INTENSITY
    obj["portfolioLightRange"] = LIGHT_RANGE
    obj["portfolioLightSpill"] = LIGHT_SPILL
    color = [int(LIGHT_COLOR[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    obj.data.color = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in color]
    # Blender's glTF SPEC conversion is watts * 683 / (4*pi).
    obj.data.energy = intensity * 4 * math.pi / 683
    obj.data.shadow_soft_size = .22
    obj.data.use_shadow = kind == "SPOT"
    obj.data.use_custom_distance = True
    obj.data.cutoff_distance = LIGHT_RANGE if kind == "SPOT" else LIGHT_RANGE * .55
    if kind == "SPOT":
        obj.data.spot_size = 2 * 1.32
        obj.data.spot_blend = .55
    obj.parent = fixture
    obj.matrix_parent_inverse = fixture.matrix_world.inverted()
    obj.matrix_world = Matrix.Translation(position)
    obj.hide_render = False
    obj.hide_viewport = False
    bpy.context.view_layer.update()
    obj.hide_set(False)
    return obj


def run():
    if bpy.context.mode != "OBJECT":
        raise ValueError("Switch to Object Mode before running the house fix.")
    table, chandelier, planned = layout_plan()
    # make_plan validates marker ownership before any furniture is changed.
    selected, active = list(bpy.context.selected_objects), bpy.context.view_layer.objects.active
    for obj in selected:
        obj.select_set(False)
    table.select_set(True)
    bpy.context.view_layer.objects.active = table
    try:
        _, _, chairs = make_plan()
        if {chair[0].name for chair in chairs} != set(CHAIR_NAMES):
            raise ValueError("This layout expects exactly the four named dining chairs; review extra/renamed chairs before continuing.")
        original = {obj.name: obj.matrix_world.copy() for obj, _ in planned}
        new_properties = [obj for obj, _ in planned if ORIGINAL_MATRIX not in obj]
        existing_names = set(bpy.data.objects.keys())
        markers_before = {obj.name: (obj.matrix_world.copy(), dict(obj.items()), obj.hide_render, obj.hide_viewport, obj.hide_get())
                          for obj in bpy.context.scene.objects if obj.get("portfolioOwner") == OWNER}
        try:
            # Apply absolute destinations from saved original transforms, so a
            # second run cannot translate/rotate the furniture again.
            for obj, matrix in planned:
                if ORIGINAL_MATRIX not in obj:
                    obj[ORIGINAL_MATRIX] = [value for row in obj.matrix_world for value in row]
                obj.matrix_world = matrix
            bpy.context.view_layer.update()
            lines = prepare_markers()
            low, high = bounds(chandelier)
            source = (low + high) * .5
            source.z = low.z + .18
            anchor = fixture_anchor(chandelier, source)
            fixture_light("PREVIEW_HOUSE_CHANDELIER_DOWN", "SPOT", anchor, source, LIGHT_INTENSITY)
            fixture_light("PREVIEW_HOUSE_CHANDELIER_SPILL", "POINT", anchor, source, LIGHT_SPILL)
        except Exception:
            for obj, _ in planned:
                obj.matrix_world = original[obj.name]
            for obj in new_properties:
                if ORIGINAL_MATRIX in obj:
                    del obj[ORIGINAL_MATRIX]
            for name, (matrix, props, render, viewport, hidden) in markers_before.items():
                obj = bpy.data.objects[name]
                obj.matrix_world = matrix
                for key in list(obj.keys()):
                    del obj[key]
                for key, value in props.items():
                    obj[key] = value
                obj.hide_render, obj.hide_viewport = render, viewport
                obj.hide_set(hidden)
            for obj in list(bpy.data.objects):
                if obj.name not in existing_names and obj.get("portfolioOwner") in (OWNER, LAYOUT_OWNER):
                    bpy.data.objects.remove(obj, do_unlink=True)
            bpy.context.view_layer.update()
            raise

        # Retire only the old interior preview rig, leaving exterior lights alone.
        retired = []
        for obj in bpy.context.scene.objects:
            if obj.type == "LIGHT" and any(c.name == "COZY_LIGHTS" for c in obj.users_collection):
                obj.hide_render = True
                obj.hide_set(True)
                retired.append(obj.name)
        report_lines = ["READY: chandelier lighting and dining layout updated.",
                        "Table/rug center: Blender (6.30, -1.70). Four chairs face the table at diagonal angles.",
                        "Moved 4 chair colliders and both table colliders; regenerated dining/alchemy interaction markers.",
                        "Cauldron and recipe cabinet kept in place; right-side walking aisle opened.",
                        "Chandelier downlight: 100 cd; ceiling spill: 8 cd. Runtime reads the fixture position and properties.",
                        "Old interior preview lights hidden: " + ", ".join(retired),
                        "Review the layout in Blender. Ctrl+Z undoes this operation; rerunning does not accumulate movement.",
                        "Save your .blend and export the whole house with Custom Properties ON.",
                        "Selected Objects and Active Collection OFF. No file has been saved or exported."]
        report_lines.extend(line for line in lines if line.startswith("WARNING:"))
        report = bpy.data.texts.get(LAYOUT_REPORT) or bpy.data.texts.new(LAYOUT_REPORT)
        report.clear()
        report.write("\n".join(report_lines))
        print("\n".join(report_lines))
        return report_lines
    finally:
        for obj in bpy.context.selected_objects:
            obj.select_set(False)
        for obj in selected:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = active


class PORTFOLIO_OT_fix_house_light_layout(bpy.types.Operator):
    bl_idname = "portfolio.fix_house_light_layout"
    bl_label = "Fix House Chandelier and Dining Layout"
    bl_options = {"REGISTER", "UNDO"}

    def execute(self, context):
        try:
            lines = run()
            self.report({"INFO"}, lines[0])
            return {"FINISHED"}
        except Exception as error:
            traceback.print_exc()
            report = bpy.data.texts.get(LAYOUT_REPORT) or bpy.data.texts.new(LAYOUT_REPORT)
            report.clear()
            report.write("ERROR: " + str(error))
            self.report({"ERROR"}, str(error))
            return {"CANCELLED"}


if __name__ == "__main__":
    previous = getattr(bpy.types, "PORTFOLIO_OT_fix_house_light_layout", None)
    if previous:
        bpy.utils.unregister_class(previous)
    bpy.utils.register_class(PORTFOLIO_OT_fix_house_light_layout)
    bpy.ops.portfolio.fix_house_light_layout()


