"""Author optional Blender capsule overrides for the portfolio's seven NPCs.

The current runtime already creates configured physics capsules for all seven
NPCs. This script is only needed to replace those dimensions with a custom shape.

In each character source .blend: select the NPC armature or a skinned mesh,
open this script in Scripting, and Run Script in Object Mode. Multiple selected
NPC rigs are supported. The player already has its own runtime capsule and is
skipped. Known mesh names identify the supplied NPCs; set NPC_ID for a renamed rig.

Review the orange wire capsule. It can be moved/scaled in Object Mode. Export
the objects in NPC_EXPORT_<id> as that character's original GLB filename, with
Selected Objects and Custom Properties enabled. Include the helper: do not use
Visible/Renderable Objects filters that exclude it. Save the .blend yourself.

No imports, saving, exports, bone edits, animation changes or mesh deformation.
Reruns preserve existing authored capsules unless REBUILD_EXISTING is enabled.
"""

import math

try:
    import bpy
    from mathutils import Vector
except ModuleNotFoundError:
    bpy = None  # Pure geometry checks can run outside Blender.

# Usually leave blank: the seven supplied characters are identified automatically.
NPC_ID = ""
REBUILD_EXISTING = False
RADIUS_FACTOR = 0.16  # Fraction of the character's evaluated height.
FEET_MARGIN = 0.02
HEAD_MARGIN = 0.02
OWNER = "portfolio.npc-collider.v1"
PREFIX = "COL_CAPSULE_NPC_"
REPORT = "PORTFOLIO_NPC_COLLIDER_REPORT"
NPCS = {
    "frequenc": ("frequenc.glb", ("Ch14",)),
    "mtc": ("MTC.glb", ("Ch46",)),
    "bepro": ("bePro.glb", ("Ch39",)),
    "42": ("42.glb", ("Ch03",)),
    "interphase": ("interphase.glb", ("Elvis_BodyGeo",)),
    "prodigy": ("prodigy.glb", ("Fitness_Grandma_BodyGeo",)),
    "se-factory": ("se-factory.glb", ("mixamorig:Jacket_Geo",)),
}
HELPERS = ("COL_", "ZONE_", "INTERACT_", "CAMERA_", "LOOK_", "SEAT_")


def capsule_geometry(radius, height, segments=12, hemisphere_rings=4):
    """Closed Z-up capsule, including poles; dimensions are in Blender units."""
    if not (math.isfinite(radius) and math.isfinite(height) and radius > 0 and height > radius * 2):
        raise ValueError("Capsule height must exceed twice its positive radius.")
    if segments < 8 or segments % 4 or hemisphere_rings < 2:
        raise ValueError("Use at least 8 segments divisible by 4, and 2 hemisphere rings.")
    half_stem = height * 0.5 - radius
    vertices = [(0.0, 0.0, -height * 0.5)]
    rings = []
    for top in (False, True):
        for i in range(hemisphere_rings):
            angle = (i if top else i - hemisphere_rings + 1) * math.pi / (2 * hemisphere_rings)
            ring = []
            for j in range(segments):
                theta = j * math.tau / segments
                ring.append(len(vertices))
                vertices.append((radius * math.cos(angle) * math.cos(theta),
                                 radius * math.cos(angle) * math.sin(theta),
                                 (half_stem if top else -half_stem) + radius * math.sin(angle)))
            rings.append(ring)
    top_pole = len(vertices)
    vertices.append((0.0, 0.0, height * 0.5))
    faces = []
    for j in range(segments):
        nxt = (j + 1) % segments
        faces.append((0, rings[0][nxt], rings[0][j]))
        for lower, upper in zip(rings, rings[1:]):
            faces.append((lower[j], lower[nxt], upper[nxt], upper[j]))
        faces.append((rings[-1][j], rings[-1][nxt], top_pole))
    return vertices, faces


def visual_meshes(rig):
    descendants = set(rig.children_recursive)
    return [obj for obj in bpy.context.scene.objects
            if obj.type == "MESH" and not obj.name.startswith(HELPERS)
            and (obj in descendants or any(mod.type == "ARMATURE" and mod.object == rig for mod in obj.modifiers))]


def normalized_name(name):
    # Blender appends .001 when more than one model shares an object name.
    parts = name.rsplit(".", 1)
    return (parts[0] if len(parts) == 2 and parts[1].isdigit() else name).lower()


def identify(rig, meshes, explicit_id=""):
    if explicit_id:
        if explicit_id not in NPCS:
            raise ValueError("NPC_ID must be one of: " + ", ".join(NPCS))
        return explicit_id
    names = {normalized_name(obj.name) for obj in meshes}
    matches = [key for key, (_, signatures) in NPCS.items()
               if any(signature.lower() in names for signature in signatures)]
    if len(matches) != 1:
        raise ValueError("Cannot identify NPC rig '" + rig.name + "'. Select one NPC and set NPC_ID at the top of the script.")
    return matches[0]


def capsule_plan(rig, meshes):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    points = []
    for obj in meshes:
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        try:
            points.extend(evaluated.matrix_world @ vertex.co for vertex in mesh.vertices)
        finally:
            evaluated.to_mesh_clear()
    if not points:
        raise ValueError("No evaluated mesh vertices for '" + rig.name + "'.")
    low = Vector(tuple(min(point[i] for point in points) for i in range(3)))
    high = Vector(tuple(max(point[i] for point in points) for i in range(3)))
    if not all(math.isfinite(value) for bound in (low, high) for value in bound):
        raise ValueError("Non-finite bounds on '" + rig.name + "'.")
    body_height = high.z - low.z
    radius = body_height * RADIUS_FACTOR
    height = body_height * (1 - FEET_MARGIN - HEAD_MARGIN)
    capsule_geometry(radius, height)  # Validate before modifying the scene.
    center = (low + high) * 0.5
    hips = next((bone for bone in rig.pose.bones
                 if bone.name.split(":")[-1].lower() in ("hips", "pelvis")), None)
    if hips:
        hips_world = rig.matrix_world @ hips.head
        center.x, center.y = hips_world.x, hips_world.y
    center.z = low.z + body_height * FEET_MARGIN + height * 0.5
    return center, radius, height


def selected_rigs():
    rigs = set()
    for obj in bpy.context.selected_objects:
        if obj.type == "ARMATURE":
            rigs.add(obj)
        if obj.type == "MESH":
            rigs.update(mod.object for mod in obj.modifiers if mod.type == "ARMATURE" and mod.object)
        rigs.update(child for child in obj.children_recursive if child.type == "ARMATURE")
    return sorted(rigs, key=lambda obj: obj.name)


def preflight(rigs, explicit_id):
    if not rigs:
        raise ValueError("Select the NPC armature or one of its skinned meshes first.")
    if explicit_id and len(rigs) != 1:
        raise ValueError("With NPC_ID set, select exactly one rig.")
    plans = []
    seen = set()
    for rig in rigs:
        if rig.library:
            raise ValueError("Use a local, editable character source: " + rig.name)
        meshes = visual_meshes(rig)
        if any(normalized_name(obj.name) == "boy01_body_geo" for obj in meshes):
            continue  # The controlled player is already a Rapier capsule.
        npc_id = identify(rig, meshes, explicit_id)
        if npc_id in seen:
            raise ValueError("More than one selected rig resolves to " + npc_id)
        seen.add(npc_id)
        existing = bpy.data.objects.get(PREFIX + npc_id)
        if existing and (existing.get("portfolioOwner") != OWNER
                         or existing.get("portfolioSourceRig") != rig.name):
            raise ValueError("Collider name is already used by another object: " + existing.name)
        if existing and (existing.type != "MESH" or existing.parent_type == "BONE"
                         or any(mod.type == "ARMATURE" for mod in existing.modifiers)):
            raise ValueError("The existing collider must be an unskinned mesh outside the bones: " + existing.name)
        collection = bpy.data.collections.get("NPC_EXPORT_" + npc_id)
        if collection and collection.get("portfolioOwner") != OWNER:
            raise ValueError("Export collection name already exists: " + collection.name)
        plans.append((npc_id, rig, meshes, existing, capsule_plan(rig, meshes)))
    if not plans:
        raise ValueError("No NPC selected. The player already has a runtime collider.")
    return plans


def add_colliders(rigs=None, explicit_id=NPC_ID):
    if bpy is None:
        raise RuntimeError("Run this script inside Blender.")
    if bpy.context.mode != "OBJECT":
        raise RuntimeError("Switch to Object Mode before running this script.")
    plans = preflight(selected_rigs() if rigs is None else rigs, explicit_id)
    report = ["PORTFOLIO NPC COLLIDERS", "No character transforms, bones or animation tracks changed."]
    for npc_id, rig, meshes, existing, (center, radius, height) in plans:
        collection_name = "NPC_EXPORT_" + npc_id
        collection = bpy.data.collections.get(collection_name)
        if collection is None:
            collection = bpy.data.collections.new(collection_name)
            collection["portfolioOwner"] = OWNER
            bpy.context.scene.collection.children.link(collection)
        collider = existing
        if collider is None or REBUILD_EXISTING:
            vertices, faces = capsule_geometry(radius, height)
            data = bpy.data.meshes.new(PREFIX + npc_id + "_Mesh")
            data.from_pydata(vertices, [], faces)
            data.update()
            if collider is None:
                collider = bpy.data.objects.new(PREFIX + npc_id, data)
            else:
                old_data = collider.data
                collider.data = data
                if old_data.users == 0:
                    bpy.data.meshes.remove(old_data)
            collider.parent = None  # Never a child of an animated bone or skinned mesh.
            collider.location = center
            collider.rotation_euler = (0, 0, 0)
            collider.scale = (1, 1, 1)
        collider.display_type = "WIRE"
        collider.show_in_front = True
        collider.hide_render = True
        collider.color = (1.0, 0.45, 0.08, 1.0)
        collider["portfolioOwner"] = OWNER
        collider["portfolioNpcCollider"] = True
        collider["portfolioNpcId"] = npc_id
        collider["portfolioSourceRig"] = rig.name
        collider["portfolioColliderShape"] = "capsule"
        # Add an export selection without unlinking any original collections.
        for obj in {rig, *rig.children_recursive, *meshes, collider}:
            if obj.name not in collection.objects:
                collection.objects.link(obj)
        status = "kept authored shape" if existing and not REBUILD_EXISTING else "created/rebuilt"
        report.append(npc_id + ": " + status + "; select objects in " + collection_name
                      + "; export as " + NPCS[npc_id][0])
    report.extend(["", "Review capsules in front and side views; adjust their width in Object Mode if needed.",
                   "Export Selected Objects + Custom Properties. Include the capsule despite hide_render.",
                   "Do not export all NPCs into world.glb or one combined character file.",
                   "Existing runtime GLBs remain unchanged until you re-export them."])
    text = bpy.data.texts.get(REPORT) or bpy.data.texts.new(REPORT)
    text.clear()
    text.write("\n".join(report))
    print("\n".join(report))
    return plans


if __name__ == "__main__":
    add_colliders()
