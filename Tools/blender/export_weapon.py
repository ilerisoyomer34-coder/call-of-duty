# Blender silah modelini oyuna hazırlar ve GLB olarak dışa aktarır.
#  - Kamera/ışık/fon gibi sahne nesnelerini atar
#  - Namluyu oyunun eksenine çevirir (Blender +Y ileri → glTF -Z), sağ el tutuşunu orijine alır, ölçekler
#  - Ağır nesneleri sadeleştirir (Decimate), değiştiricileri uygular
#  - Animasyonlu parçaları (şarjör, sürgü, kurma kolu) ayrı düğüm olarak tutar, kalanını tek gövdede birleştirir
#  - Yardımcı noktaları (namlu ucu, nişan, sol el, kovan) oyun koordinatlarında JSON'a yazar
#  - İsteğe bağlı önizleme görüntüsü ve içe aktarma raporu üretir
#
# Kullanım (depo kökünden):
#   python Tools/blender/export_weapon.py mar556 [--render]      (bpy kurulu Python)
#   blender -b -P Tools/blender/export_weapon.py -- mar556 [--render]
import json
import math
import os
import re
import sys

import bpy
from mathutils import Matrix, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
RIG = json.load(open(os.path.join(ROOT, 'Tools', 'blender', 'weapon_rig_map.json'), encoding='utf-8'))
OUT_DIR = os.path.join(ROOT, 'web', 'assets', 'weapons')
DATA_FILE = os.path.join(ROOT, 'web', 'src', 'weaponAssets.json')
REPORT_DIR = os.path.join(ROOT, 'Docs', 'import_reports')

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
wid = next(a for a in args if not a.startswith('-'))
render = '--render' in args
cfg = RIG[wid]


def tri_count(me):
    return sum(len(p.vertices) - 2 for p in me.polygons)


bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, cfg['source']))
scene = bpy.context.scene
warnings = []

# 1) Sahne nesnelerini ve hariç tutulanları sil
exclude = re.compile(cfg.get('exclude') or '^$')
for ob in list(bpy.data.objects):
    if ob.type != 'MESH' or (cfg.get('exclude') not in (None, '^$') and exclude.search(ob.name)):
        bpy.data.objects.remove(ob, do_unlink=True)

# 2) Sadeleştir + değiştiricileri uygula + dünya dönüşümünü köşelere göm
caps = cfg.get('caps', {})
tris_before = 0
depsgraph = bpy.context.evaluated_depsgraph_get()
for ob in list(bpy.data.objects):
    base = ob.evaluated_get(depsgraph).to_mesh()
    t = tri_count(base)
    ob.evaluated_get(depsgraph).to_mesh_clear()
    tris_before += t
    cap = caps.get(ob.name, caps.get('default', 100000))
    if t > cap:
        # Önce düzlemsel eritme: bölünmüş düz yüzleri şekli bozmadan birleştirir
        mod = ob.modifiers.new('planar', 'DECIMATE')
        mod.decimate_type = 'DISSOLVE'
        mod.angle_limit = math.radians(4.0)
        dg = bpy.context.evaluated_depsgraph_get()
        t2 = tri_count(ob.evaluated_get(dg).to_mesh())
        ob.evaluated_get(dg).to_mesh_clear()
        if t2 > cap * 1.3:
            # Hâlâ ağırsa kenar çökertme
            mod2 = ob.modifiers.new('collapse', 'DECIMATE')
            mod2.decimate_type = 'COLLAPSE'
            mod2.ratio = max(0.02, cap / t2)
depsgraph = bpy.context.evaluated_depsgraph_get()
for ob in list(bpy.data.objects):
    ev = ob.evaluated_get(depsgraph)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=False, depsgraph=depsgraph)
    me.transform(ob.matrix_world)
    ob.modifiers.clear()
    ob.data = me
    ob.matrix_world = Matrix.Identity(4)

# 3) Eksen: namlu Blender +Y yönüne (glTF'de -Z olur), sağ taraf +X
rot = Matrix.Identity(4)
if cfg['forward'] == '+X':
    rot = Matrix.Rotation(math.radians(90), 4, 'Z')
elif cfg['forward'] == '-X':
    rot = Matrix.Rotation(math.radians(-90), 4, 'Z')
elif cfg['forward'] == '-Y':
    rot = Matrix.Rotation(math.radians(180), 4, 'Z')
hand = rot @ Vector(cfg['hand'])
lo = Vector((1e9, 1e9, 1e9))
hi = Vector((-1e9, -1e9, -1e9))
for ob in bpy.data.objects:
    for v in ob.data.vertices:
        p = rot @ v.co
        lo = Vector(map(min, lo, p))
        hi = Vector(map(max, hi, p))
length = hi.y - lo.y
scale = (cfg['scaleTo'] / length) if cfg.get('scaleTo') else 1.0
M = Matrix.Scale(scale, 4) @ Matrix.Translation(-hand) @ rot
for ob in bpy.data.objects:
    ob.data.transform(M)
    ob.data.update()

# 4) Parçaları birleştir: animasyonlu parçalar ayrı, kalan tek gövde
groups = {}
patterns = {k: re.compile(v) for k, v in cfg.get('parts', {}).items()}
for ob in bpy.data.objects:
    key = next((k for k, rx in patterns.items() if rx.search(ob.name)), 'body')
    groups.setdefault(key, []).append(ob)
for key, obs in groups.items():
    if len(obs) > 1:
        with bpy.context.temp_override(active_object=obs[0], selected_editable_objects=obs, selected_objects=obs):
            bpy.ops.object.join()
    obs[0].name = key
    obs[0].data.name = key
missing = [k for k in patterns if k not in groups]
if missing:
    warnings.append(f"Eşleşmeyen parça kalıpları: {missing}")

# Yumuşak gölgeleme: sadeleştirmeden sonra düz yüzler bozulmasın diye açıya göre
for ob in bpy.data.objects:
    for p in ob.data.polygons:
        p.use_smooth = False
    try:
        with bpy.context.temp_override(active_object=ob, selected_editable_objects=[ob], selected_objects=[ob], object=ob):
            bpy.ops.object.shade_auto_smooth(angle=math.radians(35))
    except Exception as e:  # eski/yeni sürüm farkları
        warnings.append(f"Açıya göre yumuşatma uygulanamadı ({ob.name}): {e}")

tris_after = sum(tri_count(ob.data) for ob in bpy.data.objects)

# 5) GLB dışa aktar
os.makedirs(OUT_DIR, exist_ok=True)
glb = os.path.join(OUT_DIR, f'{wid}.glb')
kw = dict(filepath=glb, export_format='GLB', use_selection=False, export_cameras=False, export_apply=True,
          export_yup=True, export_texcoords=False, export_normals=True, export_animations=False)
try:
    bpy.ops.export_scene.gltf(export_lights=False, **kw)
except TypeError:
    bpy.ops.export_scene.gltf(**kw)


# 6) Yardımcı noktalar: Blender (x, y, z) → glTF/three (x, z, -y)
def to_three(p):
    q = M @ Vector(p)
    return [round(q.x, 4), round(q.z, 4), round(-q.y, 4)]


blo = Vector((1e9, 1e9, 1e9))
bhi = Vector((-1e9, -1e9, -1e9))
for ob in bpy.data.objects:
    for v in ob.data.vertices:
        blo = Vector(map(min, blo, v.co))
        bhi = Vector(map(max, bhi, v.co))
entry = {
    'file': f'assets/weapons/{wid}.glb',
    'points': {k: to_three(v) for k, v in cfg['points'].items()},
    'parts': sorted(k for k in groups if k != 'body'),
    'bounds': {'min': [round(blo.x, 3), round(blo.z, 3), round(-bhi.y, 3)], 'max': [round(bhi.x, 3), round(bhi.z, 3), round(-blo.y, 3)]},
    'length': round((bhi.y - blo.y), 3),
    'tris': tris_after,
    'bytes': os.path.getsize(glb),
}
data = json.load(open(DATA_FILE, encoding='utf-8')) if os.path.exists(DATA_FILE) else {}
data[wid] = entry
with open(DATA_FILE, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write('\n')

# 7) Önizleme ve rapor
os.makedirs(REPORT_DIR, exist_ok=True)
png = None
if render:
    for ob in list(bpy.data.objects):
        ob.hide_render = False
    cam_data = bpy.data.cameras.new('cam')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = (bhi.y - blo.y) * 1.15
    cam = bpy.data.objects.new('cam', cam_data)
    scene.collection.objects.link(cam)
    mid = (blo + bhi) / 2
    cam.location = (mid.x + 2.0, mid.y, mid.z)
    cam.rotation_euler = (math.radians(90), 0, math.radians(90))
    scene.camera = cam
    for name, loc, energy in (('key', (1.5, -1.0, 1.5), 400), ('fill', (1.5, 1.2, 0.2), 150)):
        ld = bpy.data.lights.new(name, 'AREA')
        ld.energy = energy
        ld.size = 1.5
        lo_ = bpy.data.objects.new(name, ld)
        lo_.location = loc
        lo_.rotation_euler = (Vector(mid) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        scene.collection.objects.link(lo_)
    world = scene.world or bpy.data.worlds.new('w')
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    if bg:
        bg.inputs[0].default_value = (0.55, 0.52, 0.48, 1)
        bg.inputs[1].default_value = 0.6
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 24
    scene.render.resolution_x = 1200
    scene.render.resolution_y = int(1200 * max(0.3, (bhi.z - blo.z) / (bhi.y - blo.y) * 1.3))
    png = os.path.join(REPORT_DIR, f'{wid}.jpg')
    scene.render.image_settings.file_format = 'JPEG'
    scene.render.image_settings.quality = 82
    scene.render.filepath = png
    bpy.ops.render.render(write_still=True)

with open(os.path.join(REPORT_DIR, f'{wid}.md'), 'w', encoding='utf-8') as f:
    f.write(f"# İçe aktarma raporu: {wid}\n\n")
    f.write(f"- Kaynak: `{cfg['source']}`\n")
    f.write(f"- Çıktı: `web/{entry['file']}` ({entry['bytes'] / 1024:.0f} KB)\n")
    f.write(f"- Üçgen: {tris_before} → {tris_after}\n")
    f.write(f"- Uygulanan ölçek: {scale:.3f} (uzunluk {length:.3f} m → {entry['length']:.3f} m)\n")
    f.write(f"- Parçalar: gövde + {', '.join(entry['parts']) or '—'}\n")
    f.write(f"- Doku: yok (yalnızca PBR renk malzemeleri)\n")
    f.write(f"- Oyun koordinatlarında noktalar: `{json.dumps(entry['points'], ensure_ascii=False)}`\n")
    if png:
        f.write(f"\n![{wid}]({wid}.jpg)\n")
    if warnings:
        f.write('\n## Uyarılar\n' + ''.join(f'- {w}\n' for w in warnings))
print(json.dumps({wid: entry}, ensure_ascii=False))
for w in warnings:
    print('UYARI:', w)
