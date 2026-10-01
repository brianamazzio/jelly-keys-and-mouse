"""
Room + desk items pipeline (headless Blender 4.x). All sources are Poly Haven CC0 models (geometry only).

  /Applications/Blender.app/Contents/MacOS/Blender -b --python tools/process_room_assets.py -- tools/source/polyhaven public/models/items

For every entry: import the source glTF, pick the named parts, join them, scale to a believable desk-object
size, optionally decimate, set the origin (dynamic items: bounds centre; furniture: floor centre; wall decor:
centre), and export one material-less GLB. Writes manifest.json with final sizes and triangle counts.
"""
import bpy, sys, os, json
from mathutils import Vector

SRC, OUT = sys.argv[sys.argv.index('--') + 1:][:2]
os.makedirs(OUT, exist_ok=True)

# name: (source id, part selector, scale, origin mode, decimate-to-triangles or None)
# part selector: None = everything, 'prefix:xyz' = objects whose name starts with xyz,
#                'nth:k' = k-th object by name, 'cup' / 'pen:k' = stationery heuristics
ITEMS = {
    # ---- things you can pick up
    'duck':       ('rubber_duck_toy', None, 0.30, 'center', None),
    'apple':      ('food_apple_01', None, 0.80, 'center', None),
    'lemon':      ('lemon', None, 0.85, 'center', None),
    'croissant':  ('croissant', None, 0.70, 'center', None),
    'baseball':   ('baseball_01', None, 1.00, 'center', None),
    'alarmclock': ('alarm_clock_01', None, 0.75, 'center', None),
    'stapler':    ('vintage_stapler', None, 0.80, 'center', None),
    'succulent':  ('potted_plant_04', None, 0.55, 'center', None),
    'lightbulb':  ('lightbulb_01', None, 1.00, 'center', None),
    'magnifier':  ('magnifying_glass_01', None, 0.75, 'center', None),
    'spectacles': ('round_spectacles', None, 0.90, 'center', None),
    'thermos':    ('plastic_thermos', None, 0.70, 'center', None),
    'cake':       ('carrot_cake', None, 0.60, 'center', None),
    'cat':        ('concrete_cat_statue', None, 0.45, 'center', None),
    'gnome':      ('garden_gnome', None, 0.30, 'center', 14000),
    'teapot':     ('tea_set_01', 'prefix:tea_set_01_teapot_01', 0.70, 'center', None),
    'teacup':     ('tea_set_01', 'exact:tea_set_01_cup_small_01', 0.80, 'center', None),
    'pencilcup':  ('stationery_supplies', 'cup', 1.00, 'center', None),
    'pen_a':      ('stationery_supplies', 'pen:0', 1.00, 'center', None),
    'pen_b':      ('stationery_supplies', 'pen:1', 1.00, 'center', None),
    'book_a':     ('book_encyclopedia_set_01', 'nth:0', 0.80, 'center', None),
    'book_b':     ('book_encyclopedia_set_01', 'nth:5', 0.80, 'center', None),
    'book_c':     ('book_encyclopedia_set_01', 'nth:11', 0.80, 'center', None),
    'king':       ('chess_set', 'exact:piece_king_white', 1.00, 'center', None),
    'rook':       ('chess_set', 'exact:piece_rook_white_01', 1.00, 'center', None),
    'knight':     ('chess_set', 'prefix:piece_knight_white_01', 1.00, 'center', None),
    'cassette':   ('cassette_player', None, 1.00, 'center', None),
    'binder':     ('binder_notebook', 'exact:binder_notebook_closed', 0.90, 'center', None),
    'goblet':     ('brass_goblets', 'exact:brass_goblet_01', 0.45, 'center', None),
    'frame':      ('standing_picture_frame_01', None, 0.70, 'center', None),
    'vase':       ('ceramic_vase_01', None, 0.50, 'center', None),
    # ---- furniture and decor (static)
    'desk':       ('metal_office_desk', None, 1.00, 'floor', None),
    'chair':      ('modern_arm_chair_01', None, 1.00, 'floor', None),
    'bookshelf':  ('wooden_bookshelf_worn', None, 1.00, 'floor', None),
    'floorplant': ('potted_plant_01', None, 0.80, 'floor', 30000),
    'desklamp':   ('desk_lamp_arm_01', None, 0.62, 'floor', None),
    'ceilinglamp': ('modern_ceiling_lamp_01', None, 1.00, 'top', None),
    'wallclock':  ('wall_clock', None, 1.00, 'center', None),
    'tallframe':  ('hanging_picture_frame_01', None, 0.75, 'center', None),
    'wideframe':  ('fancy_picture_frame_01', None, 1.00, 'center', None),
    'dartboard':  ('dartboard', None, 1.00, 'center', None),
    # ---- not from Poly Haven: Objaverse / Sketchfab, CC BY (see ASSETS.md); 0.60 m wide = a 27" class monitor
    'monitor':    ('glb:24e471ac730f40fcb0501930a83784be', None, 0.70, 'floor', None),
}

def bounds(objs):
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    return Vector(map(min, zip(*pts))), Vector(map(max, zip(*pts)))

def pick(meshes, sel):
    if sel is None: return meshes
    kind, _, arg = sel.partition(':')
    by_name = sorted(meshes, key=lambda o: o.name)
    if kind == 'prefix': return [o for o in meshes if o.name.startswith(arg)]
    if kind == 'exact': return [o for o in meshes if o.name == arg]
    if kind == 'nth': return [by_name[int(arg)]]
    if kind == 'cup': return [max(meshes, key=lambda o: min(o.dimensions))]
    if kind == 'pen':
        pens = sorted([o for o in meshes if max(o.dimensions) > 8 * sorted(o.dimensions)[1]], key=lambda o: -len(o.data.polygons))
        return [pens[int(arg)]]
    raise ValueError(sel)

manifest = {}
for name, (src, sel, scale, origin, decimate) in ITEMS.items():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if src.startswith('glb:'):
        bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, '..', src[4:] + '.glb'))
    else:
        bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, src, src + '.gltf'))
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    parts = pick(meshes, sel)
    assert parts, (name, sel, [o.name for o in meshes])
    for o in list(bpy.context.scene.objects):
        if o not in parts: bpy.data.objects.remove(o)
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts: o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    if len(parts) > 1: bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = name; obj.data.name = name
    obj.data.materials.clear()
    if decimate and len(obj.data.polygons) > decimate:
        m = obj.modifiers.new('dec', 'DECIMATE'); m.ratio = decimate / len(obj.data.polygons)
        bpy.ops.object.modifier_apply(modifier=m.name)
    mn, mx = bounds([obj])
    c = (mn + mx) / 2
    pivot = {'center': c, 'floor': Vector((c.x, c.y, mn.z)), 'top': Vector((c.x, c.y, mx.z))}[origin]
    obj.location = -pivot * scale
    obj.scale = (scale, scale, scale)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, name + '.glb'), export_format='GLB', use_selection=True, export_yup=True,
                              export_apply=True, export_materials='NONE', export_normals=True, export_texcoords=False,
                              export_animations=False, export_skins=False)
    mn, mx = bounds([obj]); d = mx - mn
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    # three.js axes: x = blender x, y = blender z, z = -blender y
    manifest[name] = {'source': src, 'size': [round(d.x, 4), round(d.z, 4), round(d.y, 4)], 'tris': tris, 'scale': scale}
    print('ITEM', name, manifest[name])
json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)
