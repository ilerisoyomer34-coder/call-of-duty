// Hazır (Sketchfab'den indirilmiş) araç ve eşya modellerini oyuna hazırlar.
//  - Kopyaları birleştirir (dedup), köşeleri kaynaştırır (weld) ve üçgen sayısını hedefe indirir (meshoptimizer):
//    Sketchfab modelleri çoğu zaman yüz binlerce üçgendir; tarayıcıda, telefonda ve yazılımsal GPU'da akıcı kalsın
//  - Hareketli parçaları (rotor, taret…) kodun bulacağı kısa adlarla yeniden adlandırır (three.js boşluklu adları değiştirir)
//  - Konumları ve normalleri nicemler (KHR_mesh_quantization): dosya yarıya iner, three.js doğrudan okur
//  - Lisans bilgisini (Sketchfab'in asset.extras alanı) ve özet bilgiyi web/src/propAssets.json'a yazar
//
// Kullanım (web/ içinden):  node tools/prepare-prop.mjs helicopter
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, quantize } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(root, '..');

// Model kaynakları: yeni model eklenince buraya bir satır yazılır.
//  ratio/error: sadeleştirme hedefi (üçgen oranı, izin verilen en büyük sapma, model boyuna göre)
//  rename: özgün düğüm adı → kodun aradığı ad
//  forward: modelin burnunun baktığı eksen (oyunda burun -Z'ye çevrilir)
//  length: oyundaki gövde boyu (m, pervaneler hariç)
//  tint: malzeme adı → oyundaki renk (askerî görünüm; özgün renk korunacaksa yazılmaz)
const SOURCES = {
  helicopter: {
    source: 'SourceAssets/Sketchfab/helicopter_pranav27/original/helicopter.glb',
    ratio: 0.16,
    error: 0.0015,
    rename: { BLADE_1: 'RotorMain', 'REAR BLADE_22': 'RotorTail', Circle_2: 'RotorHub', 'DOOR 1_12': 'DoorFront', 'DOOR 2_13': 'DoorRear' },
    rotors: { main: ['RotorMain', 'RotorHub'], tail: ['RotorTail'] },
    forward: '+z',
    length: 11,
    tint: { 'Material.004': 0x55603f },
  },
};

const id = process.argv[2] || 'helicopter';
const cfg = SOURCES[id];
if (!cfg) throw new Error(`Bilinmeyen model: ${id}`);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const srcPath = join(repo, cfg.source);
const doc = await io.read(srcPath);
const R = doc.getRoot();
const countTris = () => {
  let n = 0;
  for (const m of R.listMeshes()) for (const p of m.listPrimitives()) n += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  return n;
};
const trisBefore = countTris();
const credit = R.getAsset().extras || {};

// 1) Hareketli parçaların adları
for (const n of R.listNodes()) {
  const to = cfg.rename[n.getName()];
  if (to) n.setName(to);
}
for (const list of Object.values(cfg.rotors)) for (const name of list) if (!R.listNodes().some((n) => n.getName() === name)) throw new Error(`${name} düğümü bulunamadı`);

// 2) Kuyruk pervanesinin dönme ekseni: pervane diskinin en ince olduğu eksen (sahne uzayında)
const axisOf = (name) => {
  const node = R.listNodes().find((n) => n.getName() === name);
  const b = getBounds(node);
  const size = [0, 1, 2].map((i) => b.max[i] - b.min[i]);
  return 'xyz'[size.indexOf(Math.min(...size))];
};
const axes = { main: axisOf(cfg.rotors.main[0]), tail: axisOf(cfg.rotors.tail[0]) };

// 3) Sadeleştirme: önce aynı köşeleri birleştir, sonra meshoptimizer ile üçgen azalt
await MeshoptSimplifier.ready;
await doc.transform(dedup(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio: cfg.ratio, error: cfg.error }), prune(), quantize({ quantizePosition: 14, quantizeNormal: 10 }));
const trisAfter = countTris();

// 4) Malzeme özeti (renk ayarı ve rapor için)
const matReport = {};
for (const m of R.listMaterials()) matReport[m.getName()] = m.getBaseColorFactor().slice(0, 3).map((v) => +v.toFixed(3));

const outDir = join(root, 'assets/props');
mkdirSync(outDir, { recursive: true });
const file = `assets/props/${id}.glb`;
await io.write(join(root, file), doc);
const bytes = statSync(join(root, file)).size;

// 5) Özet: oyun bu tablodan okur (rotor adları, eksenler, yön, boy, renk, lisans)
const jsonPath = join(root, 'src/propAssets.json');
const all = existsSync(jsonPath) ? JSON.parse(readFileSync(jsonPath, 'utf8')) : {};
all[id] = {
  file,
  rotors: cfg.rotors,
  axes,
  forward: cfg.forward,
  length: cfg.length,
  tint: Object.fromEntries(Object.entries(cfg.tint || {}).map(([k, v]) => [k, `#${v.toString(16).padStart(6, '0')}`])),
  credit: { title: credit.title || id, author: credit.author || '', license: credit.license || '', source: credit.source || '' },
  tris: Math.round(trisAfter),
  bytes,
};
writeFileSync(jsonPath, JSON.stringify(all, null, 2) + '\n');
const sha = createHash('sha256').update(readFileSync(srcPath)).digest('hex');
console.log(`${id}: ${Math.round(trisBefore)} → ${Math.round(trisAfter)} üçgen, ${(statSync(srcPath).size / 1048576).toFixed(1)} MB → ${(bytes / 1048576).toFixed(2)} MB`);
console.log('eksenler', axes, 'malzemeler', JSON.stringify(matReport));
console.log('kaynak sha256', sha);
