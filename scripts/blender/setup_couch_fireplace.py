"""Portfolio couch + fireplace authoring tool, Blender 4.x / 5.x.

Select the couch, then run in Blender's Text Editor. Automatic setup finds the
fireplace and places the markers. If both objects have anonymous names, select
both with the couch active (selected last). Review the generated positions.
The optional N > Portfolio panel still supports manual settings.
This adds named Empty markers and custom properties for the matching game code.
It never saves, exports, deletes furniture, applies transforms, or adds colliders.

Export the complete house as GLB with Include > Custom Properties enabled.
The website uses E to sit / stand and to light / extinguish the fireplace.
Esc also leaves the couch. These controls require the companion TypeScript code.
"""

import math
import re
import textwrap
import bpy
from mathutils import Vector, Matrix


OWNER = "portfolio.couch-fireplace.v1"
SCRIPT_VERSION = "2026-10-27.3"
REPORT_NAME = "PORTFOLIO_LOUNGE_REPORT"
COUCH_REJECT = r"(^|[_ .-])(table|desk|floor|wall|roof|ceiling|ground)($|[_ .-])"
AUTO_SETUP_ON_RUN = True
# Optional exact-name overrides. Leave empty for selection/name detection.
COUCH_OBJECT_NAME = ""
FIREPLACE_OBJECT_NAME = ""
FLAME_OBJECT_NAME = ""
MARKERS = (
    "INTERACT_COUCH", "SEAT_COUCH", "LOOK_COUCH", "CAM_COUCH",
    "INTERACT_FIREPLACE", "ANCHOR_FIREPLACE_FLAME",
)
FIRE_ROOT = "ANIMATED_FIREPLACE_VISUAL"
FIRE_PARTS = ("ANIMATED_FIREPLACE_OUTER", "ANIMATED_FIREPLACE_INNER", "ANIMATED_FIREPLACE_CORE")
PREFIXES = ("COL_", "INTERACT_", "SEAT_", "LOOK_", "CAM_", "ANCHOR_")


def visual_bounds(root):
    """Evaluated geometry only; Empty/collider bounds are never used as furniture."""
    points = []
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for obj in (root, *root.children_recursive):
        generated_fire = root.name == FIRE_ROOT and root.get("portfolioOwner") == OWNER
        if obj.type != "MESH" or obj.name.startswith(PREFIXES) or (obj.get("portfolioHelper") and not generated_fire):
            continue
        evaluated = obj.evaluated_get(depsgraph)
        if not evaluated.data.vertices:
            continue
        points.extend(evaluated.matrix_world @ Vector(corner) for corner in evaluated.bound_box)
    if not points:
        raise ValueError(root.name + " has no visible mesh bounds. Choose a mesh or its parent/root.")
    low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
    high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
    if not all(math.isfinite(v) for p in (low, high) for v in p):
        raise ValueError("Furniture has non-finite bounds.")
    return low, high


def cushion_surface(couch, fallback, forward):
    """Find an upward cushion surface near the center; otherwise retain bounds."""
    low, high = visual_bounds(couch)
    size = high - low
    depth = max(0.1, min(size.x, size.y))
    right = Vector((-forward.y, forward.x, 0))
    # A thin cushion-only selection can legitimately have its seat at max Z.
    upper = high.z + 0.001 if size.z < depth * 0.45 else low.z + size.z * 0.85
    hits = []
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for front in (0.0, 0.12, 0.24):
        for sideways in (0.0, -0.12, 0.12):
            point = fallback + forward * (front * depth) + right * (sideways * depth)
            point.z = high.z + max(0.3, size.z * 0.2)
            for obj in (couch, *couch.children_recursive):
                if obj.type != "MESH" or obj.name.startswith(PREFIXES) or obj.get("portfolioHelper"):
                    continue
                evaluated = obj.evaluated_get(depsgraph)
                if abs(evaluated.matrix_world.determinant()) < 1e-10:
                    continue
                inverse = evaluated.matrix_world.inverted()
                direction = (inverse.to_3x3() @ Vector((0, 0, -1))).normalized()
                found, location, normal, _ = evaluated.ray_cast(inverse @ point, direction)
                if not found:
                    continue
                world = evaluated.matrix_world @ location
                world_normal = (inverse.transposed().to_3x3() @ normal).normalized()
                if world_normal.z > 0.6 and low.z + size.z * 0.12 <= world.z <= upper:
                    hits.append(world)
    return min(hits, key=lambda p: (p - fallback).length_squared) if hits else fallback


def automatic_targets(settings):
    scene = bpy.context.scene

    def eligible(obj):
        if obj is None or obj.name not in scene.objects or obj.library or obj.name.startswith(PREFIXES):
            return False
        if obj.get("portfolioHelper"):
            return False
        try:
            visual_bounds(obj)
            return True
        except ValueError:
            return False

    def exact(name):
        if not name:
            return None
        obj = scene.objects.get(name)
        if not eligible(obj):
            raise ValueError("Exact object override is missing or is not visual furniture: " + name)
        return obj

    def named(names, pattern, exclude=()):
        for name in names:
            obj = scene.objects.get(name)
            if obj not in exclude and eligible(obj):
                return obj
        matches = [o for o in scene.objects if o not in exclude and re.search(pattern, o.name, re.I) and eligible(o)]
        roots = [o for o in matches if not any(o in parent.children_recursive for parent in matches if parent != o)]
        return roots[0] if len(roots) == 1 else None

    fireplace = exact(FIREPLACE_OBJECT_NAME)
    if fireplace is None and eligible(settings.fireplace):
        fireplace = settings.fireplace
    fireplace = fireplace or named(("SEC_HEARTH_Fireplace", "Fireplace", "FIREPLACE_STAND"), r"fireplace")
    selected = [o for o in bpy.context.selected_objects if eligible(o)]
    couch = exact(COUCH_OBJECT_NAME)
    active = bpy.context.view_layer.objects.active
    selected_couch = [o for o in selected if o != fireplace and
                      not re.search(r"fireplace|flame|" + COUCH_REJECT, o.name, re.I)]
    if couch is None:
        if len(selected_couch) == 1:
            couch = selected_couch[0]
        elif len(selected) == 2 and active in selected_couch:
            couch = active
    if couch is None and eligible(settings.couch) and not re.search(COUCH_REJECT, settings.couch.name, re.I):
        couch = settings.couch
    couch = couch or named(("SEC_LOUNGE_Couch", "Couch", "Sofa"), r"couch|sofa", (fireplace,))
    if couch is not None and re.search(COUCH_REJECT, couch.name, re.I) and not COUCH_OBJECT_NAME:
        raise ValueError("The selected object is " + couch.name + ". Select the couch frame, not a table or a room surface.")
    if fireplace is None and couch is not None and len(selected) == 2:
        fireplace = next((o for o in selected if o != couch), None)
    if couch is None or fireplace is None:
        raise ValueError("Select the couch and run again. If the fireplace has no recognizable name, select both objects with the couch active.")
    previous = scene.objects.get("INTERACT_FIREPLACE")
    previous_flame = scene.objects.get(previous.get("flameObject", "")) if previous else None
    flame = exact(FLAME_OBJECT_NAME) if FLAME_OBJECT_NAME else None
    for candidate in (settings.flame, previous_flame, scene.objects.get("FIRE_FLAME"), scene.objects.get("Flame")):
        if flame is None and candidate not in (couch, fireplace) and eligible(candidate):
            flame = candidate
    # Reuse this tool's generated fire through the normal generation/reuse path,
    # so recalculating its origin cannot accumulate an upward offset each run.
    if flame and flame.name == FIRE_ROOT and flame.get("portfolioOwner") == OWNER:
        flame = None
    validate_targets(couch, fireplace, flame)
    return couch, fireplace, flame


def validate_targets(couch, fireplace, flame=None):
    if couch is None or fireplace is None:
        raise ValueError("Choose both Couch and Fireplace in the Portfolio panel.")
    if couch == fireplace:
        raise ValueError("Couch and Fireplace must be different objects.")
    for obj in (couch, fireplace):
        if obj.library or obj.name.startswith(PREFIXES):
            raise ValueError("Choose editable visual furniture, not a linked object or collider: " + obj.name)
    if couch in fireplace.children_recursive or fireplace in couch.children_recursive:
        raise ValueError("Choose separate couch and fireplace objects, not the whole house.")
    if flame:
        if flame.library or flame in (couch, fireplace):
            raise ValueError("Existing Flame must contain only the fire, not furniture or the whole fireplace.")
        if couch in flame.children_recursive or fireplace in flame.children_recursive:
            raise ValueError("Existing Flame cannot contain the couch or fireplace.")
        visual_bounds(flame)
    generated = bpy.data.objects.get(FIRE_ROOT)
    if generated and flame is not None and flame != generated:
        if flame in generated.children_recursive:
            raise ValueError("Choose the whole generated flame root, not an individual flame part.")
        if any(o.get("portfolioOwner") != OWNER for o in (generated, *generated.children_recursive)):
            raise ValueError("The generated flame has custom objects; resolve those before changing the fire source.")
    previous = bpy.data.objects.get("INTERACT_FIREPLACE")
    previous_name = previous.get("flameObject") if previous else None
    if flame is None and previous_name and previous_name != FIRE_ROOT and bpy.data.objects.get(previous_name):
        raise ValueError("This fireplace already uses " + previous_name + ". Keep it in Existing Flame, or remove that fire explicitly.")
    for name in MARKERS:
        existing = bpy.data.objects.get(name)
        if existing and existing.type != "EMPTY":
            raise ValueError(name + " already belongs to visible geometry; rename it before creating markers.")
        if existing and existing.library:
            raise ValueError(name + " is linked and cannot be updated.")
        if existing and existing.name not in bpy.context.scene.objects:
            raise ValueError(name + " exists outside the active scene.")
        if existing and existing.get("portfolioOwner") not in (None, OWNER):
            raise ValueError(name + " belongs to another authoring tool.")
    if flame is None:
        for name in (FIRE_ROOT, *FIRE_PARTS):
            existing = bpy.data.objects.get(name)
            if existing and existing.get("portfolioOwner") != OWNER:
                raise ValueError("Name already in use by another object: " + name)
        for i in range(1, 4):
            mat = bpy.data.materials.get("PF_Fire_" + str(i))
            if mat and mat.get("portfolioOwner") != OWNER:
                raise ValueError("Flame material name already in use: " + mat.name)


def ensure_empty(name, position, reset=False):
    obj = bpy.data.objects.get(name)
    owned = obj is not None and obj.get("portfolioOwner") == OWNER
    if obj is None:
        obj = bpy.data.objects.new(name, None)
        bpy.context.scene.collection.objects.link(obj)
    elif obj.name not in bpy.context.scene.objects:
        raise ValueError(name + " exists outside the active scene. Use unique helper names.")
    if not owned or reset:
        # Independent world markers avoid shear under mirrored/nonuniform furniture.
        obj.parent = None
        obj.matrix_world = Matrix.Translation(position)
    obj.empty_display_type = "ARROWS"
    obj.empty_display_size = 0.22
    obj.show_in_front = True
    obj.hide_render = False
    obj.hide_set(False)
    obj["portfolioOwner"] = OWNER
    obj["portfolioHelper"] = True
    obj["staticOptimization"] = False
    return obj


def material(name, color):
    existing = bpy.data.materials.get(name)
    if existing:
        if existing.get("portfolioOwner") != OWNER:
            raise ValueError("Flame material name already in use: " + name)
        return existing
    mat = bpy.data.materials.new(name)
    mat["portfolioOwner"] = OWNER
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Roughness"].default_value = 1.0
    emission = shader.inputs.get("Emission Color")
    if emission is None:
        emission = shader.inputs.get("Emission")
    if emission is not None:
        emission.default_value = (*color, 1.0)
    strength = shader.inputs.get("Emission Strength")
    if strength is not None:
        strength.default_value = 1.6
    return mat


def flame_mesh(name, parent, radius, height, offset, mat):
    if bpy.data.objects.get(name):
        return bpy.data.objects[name]
    vertices = []
    sides = 5
    for z, r, bend in ((0.0, 0.48, 0.0), (0.25, 1.0, 0.02), (0.60, 0.62, -0.05), (0.88, 0.20, 0.05)):
        for i in range(sides):
            angle = i * math.tau / sides
            vertices.append((radius * r * math.cos(angle) + bend * height,
                             radius * r * math.sin(angle), z * height))
    tip = len(vertices)
    vertices.append((0.10 * height, -0.03 * height, height))
    base = len(vertices)
    vertices.append((0, 0, 0))
    faces = []
    for ring in range(3):
        for i in range(sides):
            a, b = ring * sides + i, ring * sides + (i + 1) % sides
            c, d = b + sides, a + sides
            faces.extend(((a, b, c), (a, c, d)))
    for i in range(sides):
        faces.extend(((3 * sides + i, 3 * sides + (i + 1) % sides, tip),
                      ((i + 1) % sides, i, base)))
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = parent
    obj.location = offset
    obj.data.materials.append(mat)
    obj["portfolioOwner"] = OWNER
    obj["portfolioHelper"] = True
    obj["staticOptimization"] = False
    return obj


def remove_generated_flame(root):
    """Only this tool's generated fire; never delete authored furniture or fire."""
    for obj in (*reversed(root.children_recursive), root):
        mesh = obj.data if obj.type == "MESH" else None
        bpy.data.objects.remove(obj, do_unlink=True)
        if mesh and mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    for i in range(1, 4):
        mat = bpy.data.materials.get("PF_Fire_" + str(i))
        if mat and mat.get("portfolioOwner") == OWNER and mat.users == 0:
            bpy.data.materials.remove(mat)


def create_markers(couch, fireplace, flame=None, initial_on=False, reset_positions=False):
    validate_targets(couch, fireplace, flame)
    couch_low, couch_high = visual_bounds(couch)
    fire_low, fire_high = visual_bounds(fireplace)
    seat = (couch_low + couch_high) * 0.5
    seat.z = couch_low.z + (couch_high.z - couch_low.z) * 0.42
    fire = (fire_low + fire_high) * 0.5
    fire.z = fire_low.z + min(0.55, (fire_high.z - fire_low.z) * 0.22)
    if flame is not None:
        low, high = visual_bounds(flame)
        fire = (low + high) * 0.5
        fire.z = low.z + (high.z - low.z) * 0.15
    forward = Vector((fire.x - seat.x, fire.y - seat.y, 0.0))
    if forward.length_squared < 0.0001:
        forward = Vector((0, -1, 0))
    forward.normalize()
    seat = cushion_surface(couch, seat, forward)
    right = Vector((-forward.y, forward.x, 0))
    reach = min(couch_high.x - couch_low.x, couch_high.y - couch_low.y) * 0.5 + 0.45
    approach = seat + forward * reach
    approach.z = couch_low.z + 0.6
    look = seat + forward
    look.z += 0.45
    camera = seat + forward * 2.0 + right * 1.6 + Vector((0, 0, 1.15))
    couch_marker = ensure_empty("INTERACT_COUCH", approach, reset_positions)
    ensure_empty("SEAT_COUCH", seat, reset_positions)
    ensure_empty("LOOK_COUCH", look, reset_positions)
    ensure_empty("CAM_COUCH", camera, reset_positions)
    fire_marker = ensure_empty("INTERACT_FIREPLACE", fire - forward + Vector((0, 0, 0.25)), reset_positions)
    origin = ensure_empty("ANCHOR_FIREPLACE_FLAME", fire, reset_positions)
    generated = bpy.data.objects.get(FIRE_ROOT)
    if flame is not None and generated is not None and flame != generated:
        remove_generated_flame(generated)
    if flame is None:
        flame = ensure_empty(FIRE_ROOT, origin.matrix_world.translation)
        if flame.parent is None:
            world = flame.matrix_world.copy()
            flame.parent = origin
            flame.matrix_world = world
        if not flame.children:
            colors = ((1.0, 0.16, 0.015), (1.0, 0.48, 0.025), (1.0, 0.82, 0.20))
            for i, (radius, height, front) in enumerate(((0.22, 0.65, 0.0), (0.15, 0.48, 0.13), (0.10, 0.29, 0.22))):
                flame_mesh(FIRE_PARTS[i], flame, radius, height, forward * front,
                           material("PF_Fire_" + str(i + 1), colors[i]))
    for obj in (couch, fireplace, flame):
        obj["staticOptimization"] = False
        obj["portfolioAuthoringName"] = obj.name
    couch_marker["portfolioInteraction"] = "couch"
    couch_marker["targetObject"] = couch.name
    couch_marker["seatObject"] = "SEAT_COUCH"
    couch_marker["lookObject"] = "LOOK_COUCH"
    couch_marker["cameraObject"] = "CAM_COUCH"
    fire_marker["portfolioInteraction"] = "fireplace"
    fire_marker["targetObject"] = fireplace.name
    fire_marker["flameObject"] = flame.name
    fire_marker["flameAnchor"] = origin.name
    fire_marker["initialOn"] = bool(initial_on)
    return couch_marker, fire_marker


def record_setup(status, detail="", targets=None):
    context = bpy.context
    settings = getattr(context.scene, "portfolio_lounge", None)
    report = bpy.data.texts.get(getattr(settings, "report_name", "") or REPORT_NAME)
    if report is None or report.get("portfolioOwner") != OWNER:
        report = bpy.data.texts.new(REPORT_NAME)
        report["portfolioOwner"] = OWNER
    active = context.view_layer.objects.active
    lines = [
        "Portfolio couch and fireplace setup",
        "Script: " + SCRIPT_VERSION,
        "Blender: " + bpy.app.version_string,
        "Status: " + status,
        "Detail: " + detail,
        "Active object: " + (active.name if active else "(none)"),
        "Selected: " + (", ".join(o.name for o in context.selected_objects) or "(none)"),
    ]
    if targets:
        lines.extend(("Couch: " + targets[0].name, "Fireplace: " + targets[1].name,
                      "Flame: " + (targets[2].name if targets[2] else "(generated/reused)")))
    lines.append("Marker objects in the active scene:")
    for name in MARKERS:
        obj = context.scene.objects.get(name)
        lines.append("  " + name + ": " + ("PRESENT" if obj else "MISSING"))
    lines.append("Couch names: " + ", ".join(o.name for o in context.scene.objects
                 if re.search(r"couch|sofa", o.name, re.I) and not o.name.startswith(PREFIXES)))
    lines.append("Fireplace names: " + ", ".join(o.name for o in context.scene.objects
                 if re.search("fireplace", o.name, re.I) and not o.name.startswith(PREFIXES)))
    report.clear()
    report.write("\n".join(lines) + "\n")
    if settings is not None:
        for name, value in (("status", status), ("detail", detail), ("report_name", report.name)):
            if hasattr(settings, name):
                setattr(settings, name, value)
    print("\n".join(lines))
    return report.name


def reveal_markers(context):
    """Expose Empty objects in the Outliner; leave render settings alone."""
    for area in context.screen.areas if context.screen else ():
        if area.type == "VIEW_3D":
            area.spaces.active.show_region_ui = True
        elif area.type == "OUTLINER":
            space = area.spaces.active
            space.filter_text = ""
            if hasattr(space, "use_filter_object_empty"):
                space.use_filter_object_empty = True


def verify_markers():
    missing = [name for name in MARKERS if bpy.context.scene.objects.get(name) is None]
    if missing:
        raise RuntimeError("Setup did not create all markers: " + ", ".join(missing))


class PFLOUNGE_PG_settings(bpy.types.PropertyGroup):
    couch: bpy.props.PointerProperty(name="Couch", type=bpy.types.Object)
    fireplace: bpy.props.PointerProperty(name="Fireplace", type=bpy.types.Object)
    flame: bpy.props.PointerProperty(name="Existing Flame (optional)", type=bpy.types.Object)
    initial_on: bpy.props.BoolProperty(name="Fire initially on in game", default=False)
    status: bpy.props.StringProperty(name="Setup status", default="NOT RUN")
    detail: bpy.props.StringProperty(name="Setup detail", default="")
    report_name: bpy.props.StringProperty(name="Diagnostic report", default="")


class PFLOUNGE_OT_build(bpy.types.Operator):
    bl_idname = "portfolio_lounge.build"
    bl_label = "Create / Update Interactions"
    bl_description = "Create markers; retain manually adjusted marker positions on later runs"
    bl_options = {"REGISTER", "UNDO"}

    def execute(self, context):
        settings = context.scene.portfolio_lounge
        try:
            record_setup("RUNNING", "Manual marker setup")
            create_markers(settings.couch, settings.fireplace, settings.flame, settings.initial_on)
            verify_markers()
        except Exception as exc:
            record_setup("FAILED", type(exc).__name__ + ": " + str(exc))
            self.report({"ERROR"}, str(exc))
            return {"CANCELLED"}
        reveal_markers(context)
        record_setup("READY", "All 6 markers are present in the active scene.")
        self.report({"INFO"}, "Ready. Adjust SEAT_COUCH / LOOK_COUCH / CAM_COUCH, then export with Custom Properties.")
        return {"FINISHED"}


class PFLOUNGE_OT_auto_setup(bpy.types.Operator):
    bl_idname = "portfolio_lounge.auto_setup"
    bl_label = "Auto Detect + Place Markers"
    bl_description = "Find furniture and recalculate marker positions; Undo restores previous placements"
    bl_options = {"REGISTER", "UNDO"}

    def execute(self, context):
        settings = context.scene.portfolio_lounge
        try:
            record_setup("RUNNING", "Detecting the selected couch and fireplace")
            couch, fireplace, flame = automatic_targets(settings)
            create_markers(couch, fireplace, flame, settings.initial_on, reset_positions=True)
            verify_markers()
        except Exception as exc:
            record_setup("FAILED", type(exc).__name__ + ": " + str(exc))
            self.report({"ERROR"}, str(exc))
            return {"CANCELLED"}
        settings.couch, settings.fireplace, settings.flame = couch, fireplace, flame
        for obj in context.selected_objects:
            obj.select_set(False)
        marker = bpy.data.objects["SEAT_COUCH"]
        marker.select_set(True)
        context.view_layer.objects.active = marker
        reveal_markers(context)
        record_setup("READY", "All 6 markers are present in the active scene.", (couch, fireplace, flame))
        self.report({"INFO"}, "Markers placed. SEAT_COUCH is selected. Review cushion contact and camera placement.")
        return {"FINISHED"}


class PFLOUNGE_PT_setup(bpy.types.Panel):
    bl_label = "Couch and Fireplace"
    bl_idname = "PFLOUNGE_PT_setup"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "Portfolio"

    def draw(self, context):
        layout = self.layout
        settings = context.scene.portfolio_lounge
        status = layout.box()
        count = sum(context.scene.objects.get(name) is not None for name in MARKERS)
        status.label(text="Status: " + settings.status)
        status.label(text="Markers: " + str(count) + " / " + str(len(MARKERS)))
        for line in textwrap.wrap(settings.detail, 40):
            status.label(text=line)
        if settings.report_name:
            status.label(text="Text: " + settings.report_name)
        layout.operator("portfolio_lounge.auto_setup")
        layout.label(text="Choose a mesh or parent/root.")
        layout.prop(settings, "couch")
        layout.prop(settings, "fireplace")
        layout.prop(settings, "flame")
        layout.prop(settings, "initial_on")
        layout.operator("portfolio_lounge.build")
        box = layout.box()
        box.label(text="SEAT_COUCH: seat cushion surface")
        box.label(text="LOOK_COUCH: facing direction")
        box.label(text="CAM_COUCH: seated camera")
        box.label(text="ANCHOR_FIREPLACE_FLAME: light")
        layout.label(text="Export GLB: Custom Properties ON")
        layout.label(text="Website: E interact, Esc stand up")


CLASSES = (PFLOUNGE_PG_settings, PFLOUNGE_OT_build, PFLOUNGE_OT_auto_setup, PFLOUNGE_PT_setup)


def show_message(message, error=False):
    if bpy.app.background:
        print("[Portfolio]", message)
        return
    def draw(self, context):
        for line in textwrap.wrap(message, 65):
            self.layout.label(text=line)
    bpy.context.window_manager.popup_menu(
        draw, title="Couch and Fireplace", icon="ERROR" if error else "INFO")


def register():
    saved = []
    if hasattr(bpy.types.Scene, "portfolio_lounge"):
        for scene in bpy.data.scenes:
            p = scene.portfolio_lounge
            saved.append((scene, p.couch, p.fireplace, p.flame, p.initial_on,
                          getattr(p, "status", "NOT RUN"), getattr(p, "detail", ""), getattr(p, "report_name", "")))
        del bpy.types.Scene.portfolio_lounge
    for cls in reversed(CLASSES):
        if issubclass(cls, bpy.types.Operator):
            prefix, suffix = cls.bl_idname.split(".")
            old = bpy.types.Operator.bl_rna_get_subclass_py(prefix.upper() + "_OT_" + suffix)
        elif issubclass(cls, bpy.types.Panel):
            old = bpy.types.Panel.bl_rna_get_subclass_py(cls.bl_idname)
        else:
            old = bpy.types.PropertyGroup.bl_rna_get_subclass_py(cls.__name__)
        if old is not None:
            bpy.utils.unregister_class(old)
    for cls in CLASSES:
        bpy.utils.register_class(cls)
    bpy.types.Scene.portfolio_lounge = bpy.props.PointerProperty(type=PFLOUNGE_PG_settings)
    for scene, couch, fireplace, flame, initial, status, detail, report_name in saved:
        p = scene.portfolio_lounge
        p.couch, p.fireplace, p.flame, p.initial_on = couch, fireplace, flame, initial
        p.status, p.detail, p.report_name = status, detail, report_name
    p = bpy.context.scene.portfolio_lounge
    if p.couch is None:
        p.couch = bpy.data.objects.get("SEC_LOUNGE_Couch") or bpy.data.objects.get("Couch")
    if p.fireplace is None:
        p.fireplace = bpy.data.objects.get("SEC_HEARTH_Fireplace") or bpy.data.objects.get("FIREPLACE_STAND")
    if p.flame is None:
        p.flame = bpy.data.objects.get("FIRE_FLAME")
    print("[Portfolio] Open the 3D View sidebar: N > Portfolio > Couch and Fireplace.")
    print("[Portfolio] No file saved/exported. Existing furniture, materials and colliders are preserved.")


if __name__ == "__main__":
    try:
        register()
        record_setup("NOT RUN", "Script loaded. Select the couch before automatic setup.")
        if AUTO_SETUP_ON_RUN:
            result = bpy.ops.portfolio_lounge.auto_setup()
            if "FINISHED" in result:
                show_message("READY: all 6 markers exist. SEAT_COUCH is selected. Review the seat and camera before export.")
            else:
                show_message("Setup did not finish. Open PORTFOLIO_LOUNGE_REPORT in the Text Editor for the reason.", error=True)
    except Exception as exc:
        record_setup("FAILED", type(exc).__name__ + ": " + str(exc))
        show_message(str(exc) + " See PORTFOLIO_LOUNGE_REPORT in the Text Editor.", error=True)
