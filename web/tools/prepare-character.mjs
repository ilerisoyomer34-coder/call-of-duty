// Hazır (asset kütüphanesinden gelen) iskeletli karakteri oyuna hazırlar.
//  - Kullanılmayan UV kanallarını ve T-pozu klibini atar, anahtar kareleri ayıklar (2,2 MB → 1,4 MB)
//  - Kemik adlarındaki "mixamorig:" önekini siler (kod kemikleri kısa adla bulur)
//  - Dokuları GLB'den ayırıp ayrı JPEG olarak yazar: tarayıcı bunları <img> ile yükler; blob adresinden
//    doku okumaya izin vermeyen sayfalarda (Artifact CSP) da çalışır
//  - Oyunun okuduğu özet bilgiyi web/src/characterAssets.json'a yazar
//
// Kullanım (web/ içinden):  node tools/prepare-character.mjs soldier
import { NodeIO, PropertyType } from '@gltf-transform/core';
import { prune, dedup, resample } from '@gltf-transform/functions';
import { readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(root, '..');

// Karakter kaynakları: yeni karakter eklenince buraya bir satır yazılır
const SOURCES = {
  soldier: {
    source: 'SourceAssets/Characters/soldier_vanguard/original/Soldier.glb',
    dropClips: ['TPose'],
    // Doku rolleri: GLB içindeki görüntü adı → çıktı soneki
    textures: { vanguard_vanguard_diffuse_tga: 'diffuse', file2: 'normal' },
  },
};

const id = process.argv[2] || 'soldier';
const cfg = SOURCES[id];
if (!cfg) throw new Error(`Bilinmeyen karakter: ${id}`);

const io = new NodeIO();
const doc = await io.read(join(repo, cfg.source));
const R = doc.getRoot();

// 1) Fazla UV kanalları (TEXCOORD_1..6) hiçbir malzemede kullanılmıyor
for (const mesh of R.listMeshes())
  for (const prim of mesh.listPrimitives())
    for (const sem of prim.listSemantics()) if (/^TEXCOORD_[1-9]$/.test(sem)) prim.setAttribute(sem, null);

// 2) Gereksiz klipler
for (const anim of R.listAnimations()) if (cfg.dropClips.includes(anim.getName())) anim.dispose();

// 3) Kemik adları
for (const node of R.listNodes()) node.setName(node.getName().replace(/^mixamorig:?/, ''));

// 4) Dokuları dışarı yaz ve malzemeden ayır
const outDir = join(root, 'assets/characters');
mkdirSync(outDir, { recursive: true });
const texFiles = {};
for (const tex of R.listTextures()) {
  const role = cfg.textures[tex.getName()] || tex.getName();
  const ext = tex.getMimeType() === 'image/png' ? 'png' : 'jpg';
  const file = `assets/characters/${id}_${role}.${ext}`;
  writeFileSync(join(root, file), tex.getImage());
  texFiles[role] = file;
}
const materials = {};
for (const m of R.listMaterials()) {
  materials[m.getName()] = {
    map: m.getBaseColorTexture() ? texFiles.diffuse : null,
    normalMap: m.getNormalTexture() ? texFiles.normal : null,
  };
  m.setBaseColorTexture(null);
  m.setNormalTexture(null);
}
for (const tex of R.listTextures()) tex.dispose();

// dedup yalnızca veri dizilerinde: aynı görünen malzemeler birleşirse vizör ile gövde ayrılamaz.
// UV kanalı dokular ayrıldığı için "kullanılmıyor" görünür; prune silmesin.
// resample: sabit ya da doğrusal kalan anahtar kareleri kayıpsız ayıklar.
await doc.transform(dedup({ propertyTypes: [PropertyType.ACCESSOR] }), resample(), prune({ keepAttributes: true }));

const glbFile = `assets/characters/${id}.glb`;
await io.write(join(root, glbFile), doc);

// 5) Özet
let tris = 0;
for (const mesh of R.listMeshes()) for (const prim of mesh.listPrimitives()) tris += (prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION').getCount()) / 3;
const clips = R.listAnimations().map((a) => a.getName());
const dataFile = join(root, 'src/characterAssets.json');
const data = existsSync(dataFile) ? JSON.parse(readFileSync(dataFile, 'utf8')) : {};
data[id] = {
  file: glbFile,
  materials,
  clips,
  tris,
  bytes: statSync(join(root, glbFile)).size + Object.values(texFiles).reduce((s, f) => s + statSync(join(root, f)).size, 0),
};
writeFileSync(dataFile, JSON.stringify(data, null, 2) + '\n');
console.log(JSON.stringify({ [id]: data[id] }, null, 2));
