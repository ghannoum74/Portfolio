"""Prepare the dining chairs, cauldron, recipe and bookshelf for the portfolio.

Blender 4.x / 5.x. In Object Mode select the round dining table and run this
script from the Text Editor (Alt+P). The table must be the active object.
Chairs with the existing SEC_PROJECTS_Chair names are found automatically. If
they have different names, select the chairs as well, selecting the table last.

Review the generated SEAT_DINING_*, LOOK_DINING_* and CAM_DINING_* empties.
These are starting positions, not a substitute for testing the exported game.
Only this tool's own markers are updated on another run. It does not move or
delete furniture, alter materials/colliders, save, or export the blend file.

Export the whole house as GLB: Include > Custom Properties ON and Selected
Objects OFF. The matching game code is required for the interaction behavior.
The recipe opens as a panel; a cabinet that is one mesh is not pulled apart.
"""

import math
import re
import traceback

import bpy
from mathutils import Vector

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


def run():
    planned, warnings, chairs = make_plan()  # Validate everything before editing.
    scene = bpy.context.scene
    created_names = {item[0] for item in planned}
    for name, point, data in planned:
        marker = scene.objects.get(name)
        if marker is None:
            marker = bpy.data.objects.new(name, None)
            scene.collection.objects.link(marker)
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


class PORTFOLIO_OT_setup_dining_alchemy(bpy.types.Operator):
    bl_idname = "portfolio.setup_dining_alchemy"
    bl_label = "Prepare Dining and Alchemy"
    bl_options = {"REGISTER", "UNDO"}

    def execute(self, context):
        try:
            lines = run()
            self.report({"INFO"}, lines[0])
            return {"FINISHED"}
        except Exception as error:
            traceback.print_exc()
            report = bpy.data.texts.get(REPORT_NAME) or bpy.data.texts.new(REPORT_NAME)
            report.clear()
            report.write("ERROR: " + str(error))
            self.report({"ERROR"}, str(error))
            print("DINING SETUP ERROR:", error)
            return {"CANCELLED"}


def main():
    try:
        previous = getattr(bpy.types, "PORTFOLIO_OT_setup_dining_alchemy", None)
        if previous:
            bpy.utils.unregister_class(previous)
        bpy.utils.register_class(PORTFOLIO_OT_setup_dining_alchemy)
        bpy.ops.portfolio.setup_dining_alchemy()
    except Exception as error:
        print("DINING SETUP ERROR:", error)
        traceback.print_exc()


if __name__ == "__main__":
    main()
