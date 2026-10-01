"""
Asset cleanup pipeline (run headless with Blender 4.x):
  /Applications/Blender.app/Contents/MacOS/Blender -b --python tools/process_assets.py -- <src_dir> <out_dir>

Keyboard 75% (kennypang, CC-BY) -> public/models/keyboard.glb
  * splits the two source meshes into 84 individual keycaps + case + base plate
  * names every keycap after its KeyboardEvent.code (row/column assignment from measured bounds)
  * subdivides keycaps (Catmull-Clark, 1 level) so the vertex-shader jelly deformation has enough resolution
  * rescales to metres (19.05 mm key pitch) and rests the keyboard on y = 0
Computer Mouse (PoneMyintMyat, CC-BY) -> public/models/mouse.glb
  * names parts (shell / body / band / wheel / wheel_housing), Catmull-Clark subdivides shell, body and band
  * rescales to metres (~115 mm long) and rests the mouse on y = 0
"""
import bpy, sys, os, math, json
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = argv[0], argv[1]
os.makedirs(OUT, exist_ok=True)

def world_bounds(objs):
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    mn = Vector(map(min, zip(*pts))); mx = Vector(map(max, zip(*pts)))
    return mn, mx

def separate_loose(o):
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.separate(type='LOOSE'); bpy.ops.object.mode_set(mode='OBJECT')

def apply_all_transforms(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

def merge_doubles(o, threshold):
    """The mouse parts are patchworks of separate surface pieces sharing coincident border vertices;
    welding them makes each part one manifold surface so subdivision and smooth normals have no seams."""
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=threshold)
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')

def tris_to_quads(o):
    """glTF triangulated the source quads; recovering them keeps Catmull-Clark edges straight instead of wavy."""
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.tris_convert_to_quads(face_threshold=math.radians(45), shape_threshold=math.radians(45))
    bpy.ops.object.mode_set(mode='OBJECT')

def subdivide(o, levels, kind='SIMPLE'):
    m = o.modifiers.new('subd', 'SUBSURF'); m.subdivision_type = kind; m.levels = levels; m.render_levels = levels
    bpy.context.view_layer.objects.active = o; o.select_set(True)
    bpy.ops.object.modifier_apply(modifier=m.name)

def clear_parents_and_empties():
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes: o.select_set(True)
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    for o in list(bpy.context.scene.objects):
        if o.type != 'MESH': bpy.data.objects.remove(o)
    return [o for o in bpy.context.scene.objects if o.type == 'MESH']

def export(path):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_yup=True, export_apply=True,
                              export_materials='NONE', export_normals=True, export_texcoords=False,
                              export_animations=False, export_skins=False, export_cameras=False, export_lights=False)

# ---------------------------------------------------------------- keyboard
LAYOUT = [
    ['Escape','F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12','PrintScreen','Pause','Delete'],
    ['Backquote','Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9','Digit0','Minus','Equal','Backspace','Home'],
    ['Tab','KeyQ','KeyW','KeyE','KeyR','KeyT','KeyY','KeyU','KeyI','KeyO','KeyP','BracketLeft','BracketRight','Backslash','PageUp'],
    ['CapsLock','KeyA','KeyS','KeyD','KeyF','KeyG','KeyH','KeyJ','KeyK','KeyL','Semicolon','Quote','Enter','PageDown'],
    ['ShiftLeft','KeyZ','KeyX','KeyC','KeyV','KeyB','KeyN','KeyM','Comma','Period','Slash','ShiftRight','ArrowUp','End'],
    ['ControlLeft','MetaLeft','AltLeft','Space','AltRight','Fn','ControlRight','ArrowLeft','ArrowDown','ArrowRight'],
]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, 'd859eb1b182d46dbad4e1cdefd8255b4.glb'))
meshes = clear_parents_and_empties()
apply_all_transforms(meshes)
for o in list(meshes): separate_loose(o)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
caps, case = [], []
for o in meshes:
    (caps if len(o.data.polygons) > 200 else case).append(o)
assert len(caps) == 84, len(caps)
# group caps into rows by their top y (Blender: keyboard depth axis is Y, up is Z)
rows = {}
for o in caps:
    mn, mx = world_bounds([o]); rows.setdefault(round(mx.y, 1), []).append((mn.x, o, mn, mx))
row_keys = sorted(rows.keys(), reverse=True)  # back row (F-row) first
assert len(row_keys) == 6, row_keys
key_info = []
for r, ry in enumerate(row_keys):
    items = sorted(rows[ry], key=lambda t: t[0]); codes = LAYOUT[r]
    assert len(items) == len(codes), (r, len(items), len(codes))
    for (x, o, mn, mx), code in zip(items, codes):
        o.name = f'key_{code}'; o.data.name = o.name
        key_info.append((code, r, mn, mx))
# case parts
case.sort(key=lambda o: -len(o.data.polygons))
case[0].name = 'case'; case[0].data.name = 'case'
for i, o in enumerate(case[1:]): o.name = f'case_plate{i}'; o.data.name = o.name
# scale: measured pitch 0.195 units -> 19.05 mm
mn, mx = world_bounds(meshes)
scale = 0.01905 / 0.1953
for o in meshes:
    o.location = (o.location - Vector((0, 0, mn.z))) * scale  # rest on z=0 (Blender), y=0 after export
    o.location.x -= (mn.x + mx.x) / 2 * scale
    o.location.y -= (mn.y + mx.y) / 2 * scale
    o.scale = (scale, scale, scale)
apply_all_transforms(meshes)
# the case is jelly too and sags under pressed keys: give its flat walls and deck enough vertices to bend.
# Simple subdivision keeps its crisp silhouette (Catmull-Clark would melt the corners).
case_obj = bpy.context.scene.objects['case']
tris_to_quads(case_obj)
subdivide(case_obj, 4, 'SIMPLE')
print('KEYBOARD case faces after subdivision:', len(case_obj.data.polygons))
for o in caps:
    # Catmull-Clark (not simple) so the tessellation is uniformly curved: simple subdivision + recomputed
    # smooth normals leaves a quilted normal field on the original quad borders that shows in the reflections
    tris_to_quads(o)
    subdivide(o, 1, 'CATMULL_CLARK')
    for p in o.data.polygons: p.use_smooth = True
export(os.path.join(OUT, 'keyboard.glb'))
mn, mx = world_bounds(meshes)
print('KEYBOARD bounds (m):', [round(v, 4) for v in mn], [round(v, 4) for v in mx], 'caps tris:', sum(len(o.data.polygons) for o in caps))

# ---------------------------------------------------------------- mouse
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, '836aa5c61155474fba05ec15a8a29410.glb'))
meshes = clear_parents_and_empties()
apply_all_transforms(meshes)
names = {'Object_10': 'shell', 'Object_4': 'body', 'Object_6': 'band', 'Object_8': 'wheel', 'Object_11': 'wheel_housing'}
for o in meshes:
    o.name = names[o.name]; o.data.name = o.name
for name in ('shell', 'body', 'band'):
    o = bpy.context.scene.objects[name]
    before = len(o.data.vertices)
    merge_doubles(o, 0.0015)  # source units (~0.03 mm at final scale)
    tris_to_quads(o)
    print('MOUSE weld', name, before, '->', len(o.data.vertices), 'verts')
mn, mx = world_bounds(meshes)
scale = 0.115 / (mx.y - mn.y)
for o in meshes:
    o.location = Vector((-(mn.x + mx.x) / 2, -(mn.y + mx.y) / 2, -mn.z)) * scale
    o.scale = (scale, scale, scale)
apply_all_transforms(meshes)
shell = bpy.context.scene.objects['shell']
subdivide(shell, 1, 'CATMULL_CLARK')
# the rigid parts are fairly low-poly for a macro camera: one Catmull-Clark level removes the faceting
for name in ('body', 'band'):
    subdivide(bpy.context.scene.objects[name], 1, 'CATMULL_CLARK')
for o in meshes:
    for p in o.data.polygons: p.use_smooth = True
# wheel: move origin to its centre so it can spin about its axle
wheel = bpy.context.scene.objects['wheel']
wmn, wmx = world_bounds([wheel]); c = (wmn + wmx) / 2
bpy.context.scene.cursor.location = c
bpy.ops.object.select_all(action='DESELECT'); wheel.select_set(True); bpy.context.view_layer.objects.active = wheel
bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
export(os.path.join(OUT, 'mouse.glb'))
for o in meshes:
    a, b = world_bounds([o]); print('MOUSE part', o.name, len(o.data.polygons), [round(v, 4) for v in a], [round(v, 4) for v in b])
print('MOUSE wheel centre', [round(v, 4) for v in c])

# colour-id render of mouse parts for inspection
sc = bpy.context.scene
cols = {'shell': (1, .3, .3, 1), 'body': (.3, .4, 1, 1), 'band': (.3, 1, .4, 1), 'wheel': (1, 1, .2, 1), 'wheel_housing': (1, .4, 1, 1)}
for o in meshes: o.color = cols[o.name]
sc.render.engine = 'BLENDER_WORKBENCH'; sh = sc.display.shading; sh.light = 'STUDIO'; sh.color_type = 'OBJECT'; sh.show_cavity = True
sc.render.resolution_x = 1200; sc.render.resolution_y = 800
cam = bpy.data.cameras.new('c'); co = bpy.data.objects.new('c', cam); sc.collection.objects.link(co); sc.camera = co
mn, mx = world_bounds(meshes); ctr = (mn + mx) / 2; r = max(mx - mn)
for i, (az, el) in enumerate([(40, 30), (-140, 15), (0, 89), (90, 5)]):
    a = math.radians(az); e = math.radians(el); d = r * 1.6
    co.location = ctr + Vector((math.cos(e) * math.sin(a) * d, -math.cos(e) * math.cos(a) * d, math.sin(e) * d))
    co.rotation_euler = (ctr - co.location).to_track_quat('-Z', 'Y').to_euler(); cam.lens = 60
    sc.render.filepath = os.path.join(OUT, f'_mouse_parts_{i}.png'); bpy.ops.render.render(write_still=True)
