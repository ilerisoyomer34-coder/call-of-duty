# Blender dosyasındaki nesneleri, üçgen sayılarını, boyutları, malzemeleri ve dokuları listeler.
# Kullanım: python inspect_model.py dosya.blend   (bpy modülü kurulu Python ile)
#       ya da: blender -b dosya.blend -P inspect_model.py
import sys
import bpy
from mathutils import Vector

path = next((a for a in sys.argv[1:] if a.endswith(('.blend', '.blend1'))), None)
if path:
    bpy.ops.wm.open_mainfile(filepath=path)

scene = bpy.context.scene
print(f"== {bpy.data.filepath}")
print(f"birim: {scene.unit_settings.system} ölçek={scene.unit_settings.scale_length}")
dg = bpy.context.evaluated_depsgraph_get()
total = 0
lo = Vector((1e9, 1e9, 1e9))
hi = Vector((-1e9, -1e9, -1e9))
for ob in bpy.data.objects:
    line = f"- {ob.name!r} tür={ob.type} ebeveyn={ob.parent.name if ob.parent else None} gizli={ob.hide_get() if ob.name in bpy.context.view_layer.objects else 'katmanda yok'}"
    if ob.type == 'MESH':
        ev = ob.evaluated_get(dg)
        me = ev.to_mesh()
        tris = sum(len(p.vertices) - 2 for p in me.polygons)
        total += tris
        corners = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
        for c in corners:
            lo = Vector(map(min, lo, c))
            hi = Vector(map(max, hi, c))
        dims = ob.dimensions
        mats = [s.material.name if s.material else None for s in ob.material_slots]
        mods = [m.type for m in ob.modifiers]
        line += f" üçgen={tris} boyut=({dims.x:.3f},{dims.y:.3f},{dims.z:.3f}) malzeme={mats} değiştirici={mods}"
        line += f" konum=({ob.location.x:.3f},{ob.location.y:.3f},{ob.location.z:.3f}) dönüş=({ob.rotation_euler.x:.2f},{ob.rotation_euler.y:.2f},{ob.rotation_euler.z:.2f}) ölçek=({ob.scale.x:.3f},{ob.scale.y:.3f},{ob.scale.z:.3f})"
        ev.to_mesh_clear()
    print(line)
print(f"toplam üçgen: {total}")
print(f"dünya sınırları: min=({lo.x:.3f},{lo.y:.3f},{lo.z:.3f}) max=({hi.x:.3f},{hi.y:.3f},{hi.z:.3f}) boyut=({hi.x-lo.x:.3f},{hi.y-lo.y:.3f},{hi.z-lo.z:.3f})")
for m in bpy.data.materials:
    if m.users == 0:
        continue
    info = [f"* malzeme {m.name!r}"]
    if m.use_nodes and m.node_tree:
        for n in m.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED':
                bc = n.inputs['Base Color']
                info.append(f"renk={tuple(round(v, 3) for v in bc.default_value)} bağlı={bc.is_linked} metal={n.inputs['Metallic'].default_value:.2f} pürüz={n.inputs['Roughness'].default_value:.2f}")
            if n.type == 'TEX_IMAGE' and n.image:
                img = n.image
                info.append(f"doku={img.name!r} {img.size[0]}x{img.size[1]} paketli={bool(img.packed_file)} yol={img.filepath!r}")
    print(' '.join(info))
for img in bpy.data.images:
    print(f"# görüntü {img.name!r} {img.size[0]}x{img.size[1]} paketli={bool(img.packed_file)} yol={img.filepath!r} kullanıcı={img.users}")
