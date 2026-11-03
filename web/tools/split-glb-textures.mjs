// Blender'dan dokulu çıkan silah GLB'sinin gömülü dokularını ayrı JPEG dosyalarına ayırır (Sketchfab silahlarıyla
// aynı düzen: assets/weapons/<id>_t<n>.jpg + weaponAssets.json → materials; oyun assets.js → applyTextureSpec ile
// bağlar). Neden: telefondaki doku sınırı (setTextureCap) yalnız ayrı dosyalara işler, Node'daki ölçüm araçları
// (fit-hands, nişan testleri) gömülü görüntüyü açamaz, PWA önbelleği dokuları ayrı tutar. Köşe verisi de nicemlenir.
// Kullanım: node tools/split-glb-textures.mjs <id>   (Tools/blender/export_weapon.py, textures: true ise kendisi çağırır)
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, quantize } from '@gltf-transform/functions';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const id = process.argv[2];
if (!id) {
  console.error('Kullanım: node tools/split-glb-textures.mjs <silah kimliği>');
  process.exit(2);
}
const glbPath = join(root, 'assets/weapons', `${id}.glb`);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(glbPath);
const R = doc.getRoot();

const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const roleOf = { baseColor: 'map', normal: 'normalMap', metallicRoughness: 'ormMap', occlusion: 'aoMap', emissive: 'emissiveMap' };
const files = new Map();
const materials = {};
let n = 0;
for (const m of R.listMaterials()) {
  const slots = {
    baseColor: m.getBaseColorTexture(),
    normal: m.getNormalTexture(),
    metallicRoughness: m.getMetallicRoughnessTexture(),
    occlusion: m.getOcclusionTexture(),
    emissive: m.getEmissiveTexture(),
  };
  const spec = {};
  for (const [slot, tex] of Object.entries(slots)) {
    if (!tex) continue;
    if (!files.has(tex)) {
      // Görüntü yeniden kodlanmaz: Blender JPEG kalitesiyle yazdı
      const file = `assets/weapons/${id}_t${n++}.${ext[tex.getMimeType()] || 'jpg'}`;
      writeFileSync(join(root, file), Buffer.from(tex.getImage()));
      files.set(tex, file);
    }
    spec[roleOf[slot]] = files.get(tex);
  }
  // glTF'de pürüz/metal haritası çarpanla okunur; ayrı dosyadan bağlanınca three.js çarpanı aynı kalır
  if (Object.keys(spec).length) materials[m.getName()] = spec;
  m.setBaseColorTexture(null).setNormalTexture(null).setMetallicRoughnessTexture(null).setOcclusionTexture(null).setEmissiveTexture(null);
}
// Dokular ayrı dosyalardan bağlanacak: "kullanılmıyor" görünen UV'ler korunmalı
await doc.transform(prune({ keepAttributes: true }));
for (const t of R.listTextures()) t.dispose();
// Köşe verisi nicemlenir (Sketchfab silahlarıyla aynı ayar): dosya ~%20 küçülür, görünüşte fark yok
await doc.transform(quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 14 }));
await io.write(glbPath, doc);

const dataFile = join(root, 'src/weaponAssets.json');
const data = JSON.parse(readFileSync(dataFile, 'utf8'));
if (!data[id]) throw new Error(`weaponAssets.json'da ${id} yok`);
data[id].materials = materials;
data[id].bytes = statSync(glbPath).size;
writeFileSync(dataFile, `${JSON.stringify(data, null, 2)}\n`);
console.log(JSON.stringify({ id, textures: files.size, materials: Object.keys(materials), bytes: data[id].bytes }));
