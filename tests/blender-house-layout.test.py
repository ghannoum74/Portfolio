"""Read-only source verification. Run Blender in a separate process:
blender --background --factory-startup --python tests/blender-house-layout.test.py -- HOUSE.blend [AUDIT.json]
"""
import bpy,runpy,json,hashlib,sys
from pathlib import Path
from mathutils import Vector
repo=Path(__file__).resolve().parents[1]
args=sys.argv[sys.argv.index('--')+1:]
if not args:
    raise RuntimeError('Pass the source .blend after --; the test never saves or exports it.')
bpy.ops.wm.open_mainfile(filepath=str(Path(args[0]).resolve()))
tool=runpy.run_path(str(repo/'scripts/blender/fix_house_light_layout.py'))
def plain(v):
    if hasattr(v,'to_dict'):return v.to_dict()
    if hasattr(v,'to_list'):return v.to_list()
    return str(v)
def state(o):
    return json.dumps(dict(matrix=[list(r) for r in o.matrix_world],props=dict(o.items()),parent=o.parent.name if o.parent else None,render=o.hide_render,viewport=o.hide_viewport,hidden=o.hide_get(),data=o.data.name if o.data else None),sort_keys=True,default=plain)
before={o.name:state(o) for o in bpy.context.scene.objects}
packed={im.name:hashlib.sha256(bytes(im.packed_file.data)).hexdigest() for im in bpy.data.images if im.packed_file}
geometry={o.name:hashlib.sha256(b''.join(bytes(v.co) for v in o.data.vertices)).hexdigest() for o in bpy.context.scene.objects if o.type=='MESH'}
materials={o.name:[s.material.name if s.material else None for s in o.material_slots] for o in bpy.context.scene.objects if o.type=='MESH'}
lines=tool['run']()
assert not [l for l in lines if l.startswith('WARNING:')],lines
first={o.name:state(o) for o in bpy.context.scene.objects}
tool['run']()
assert first=={o.name:state(o) for o in bpy.context.scene.objects},'Second run changed scene state'
allowed=set(tool['TRANSLATED_NAMES']+tool['ROTATED_NAMES'])
allowed|={o.name for o in bpy.context.scene.objects if o.get('portfolioOwner')==tool['OWNER'] or (o.type=='LIGHT' and any(c.name=='COZY_LIGHTS' for c in o.users_collection))}
assert not [name for name in before if name not in allowed and before[name]!=state(bpy.data.objects[name])]
assert geometry=={o.name:hashlib.sha256(b''.join(bytes(v.co) for v in o.data.vertices)).hexdigest() for o in bpy.context.scene.objects if o.type=='MESH'}
assert materials=={o.name:[s.material.name if s.material else None for s in o.material_slots] for o in bpy.context.scene.objects if o.type=='MESH'}
assert packed=={im.name:hashlib.sha256(bytes(im.packed_file.data)).hexdigest() for im in bpy.data.images if im.packed_file}
def raw_bounds(obj):
    points=[obj.matrix_world@Vector(p) for p in obj.bound_box]
    return (Vector(tuple(min(p[i] for p in points) for i in range(3))),Vector(tuple(max(p[i] for p in points) for i in range(3))))
for name in tool['CHAIR_NAMES']:
    a=tool['bounds'](bpy.data.objects[name]);b=raw_bounds(bpy.data.objects[name.replace('SEC_','COL_BOX_',1)])
    assert max((x-y).length for x,y in zip(a,b))<1e-4,(name,a,b)
chair_high=max(tool['bounds'](bpy.data.objects[n])[1].x for n in tool['CHAIR_NAMES'])
drawer_low=tool['bounds'](bpy.data.objects['SEC_ALCHEMY_Drawer_4'])[0].x
assert drawer_low-chair_high>1.2,(chair_high,drawer_low)
marker=bpy.data.objects['LIGHT_HOUSE_CHANDELIER'];low,high=tool['bounds'](bpy.data.objects['Chandelier'])
assert all(low[i]<=marker.matrix_world.translation[i]<=high[i] for i in range(3))
markers=[o for o in bpy.context.scene.objects if o.name.startswith(('INTERACT_DINING_CHAIR_','SEAT_DINING_','LOOK_DINING_','CAM_DINING_'))]
assert len(markers)==16
for o in markers:
    if o.get('portfolioInteraction')=='diningChair':
        for k in ('seatObject','lookObject','cameraObject','targetObject'):assert bpy.data.objects.get(o[k])
objects=[]
for o in bpy.context.scene.objects:
    if o.name in allowed or o.get('portfolioOwner')==tool['LAYOUT_OWNER']:
        objects.append(dict(name=o.name,matrix=[list(r) for r in o.matrix_world],props=dict(o.items()),type=o.type))
if len(args)>1:
    Path(args[1]).write_text(json.dumps(dict(objects=objects,aisle_width=drawer_low-chair_high),indent=2,default=plain))
print('HOUSE_LIGHT_LAYOUT_QA_PASS',len(objects),'checked objects; right aisle',round(drawer_low-chair_high,3),'meters; no geometry/material/image changes; second run identical')
