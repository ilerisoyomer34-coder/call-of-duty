// Hazır (Sketchfab'den indirilmiş) araç ve eşya modellerini oyuna hazırlar.
//  - Kopyaları birleştirir (dedup), köşeleri kaynaştırır (weld) ve üçgen sayısını hedefe indirir (meshoptimizer):
//    Sketchfab modelleri çoğu zaman yüz binlerce üçgendir; tarayıcıda, telefonda ve yazılımsal GPU'da akıcı kalsın
//  - Hareketli parçaları (rotor, taret…) kodun bulacağı kısa adlarla yeniden adlandırır (three.js boşluklu adları değiştirir)
//  - Konumları ve normalleri nicemler (KHR_mesh_quantization): dosya yarıya iner, three.js doğrudan okur
//  - Lisans bilgisini (Sketchfab'in asset.extras alanı) ve özet bilgiyi web/src/propAssets.json'a yazar
//
//  - Gömülü dokuları küçültür ve yeniden kodlar (Chromium tuvaliyle): saydamlık gereken taban rengi PNG, diğerleri JPEG
//
// Kullanım (web/ içinden):  node tools/prepare-prop.mjs helicopter | pine
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, quantize } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { chromium } from 'playwright';
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
//  lockBorder: sadeleştirmede açık kenarlar korunur (yaprak kartları gibi tek katlı yüzeyler bozulmasın)
//  textures: { max: en uzun kenar (px), quality: JPEG kalitesi } — verilmezse dokular olduğu gibi kalır
//  kind: 'tree' → oyun boyu ve gövde tabanını modelin sınırlarından alır (kit.js ağaçları)
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
  // Çam ağacı: tüm haritalardaki ağaçların görünümü (çarpışma kodla kurulan gövde kutusu kalır)
  pine: {
    source: 'SourceAssets/Sketchfab/pine_evolveduk/original/pine_tree.glb',
    kind: 'tree',
    ratio: 0.3,
    error: 0.004,
    lockBorder: true,
    rename: {},
    textures: { max: 512, quality: 0.85 },
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
for (const list of Object.values(cfg.rotors || {})) for (const name of list) if (!R.listNodes().some((n) => n.getName() === name)) throw new Error(`${name} düğümü bulunamadı`);

// 2) Kuyruk pervanesinin dönme ekseni: pervane diskinin en ince olduğu eksen (sahne uzayında)
const axisOf = (name) => {
  const node = R.listNodes().find((n) => n.getName() === name);
  const b = getBounds(node);
  const size = [0, 1, 2].map((i) => b.max[i] - b.min[i]);
  return 'xyz'[size.indexOf(Math.min(...size))];
};
const axes = cfg.rotors ? { main: axisOf(cfg.rotors.main[0]), tail: axisOf(cfg.rotors.tail[0]) } : null;

// 3) Sadeleştirme: önce aynı köşeleri birleştir, sonra meshoptimizer ile üçgen azalt
await MeshoptSimplifier.ready;
const perMesh = () => R.listMeshes().map((m) => `${m.getName()}: ${m.listPrimitives().reduce((n, p) => n + (p.getIndices()?.getCount() ?? 0) / 3, 0)}`).join(', ');
const meshesBefore = perMesh();
await doc.transform(dedup(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio: cfg.ratio, error: cfg.error, lockBorder: !!cfg.lockBorder }), prune(), quantize({ quantizePosition: 14, quantizeNormal: 10 }));
const trisAfter = countTris();
console.log(`mesh üçgenleri: ${meshesBefore} → ${perMesh()}`);

// 3b) Dokular: küçült, saydamlık gerekmiyorsa JPEG
if (cfg.textures) {
  const alphaTex = new Set();
  for (const m of R.listMaterials()) if (m.getAlphaMode() !== 'OPAQUE' && m.getBaseColorTexture()) alphaTex.add(m.getBaseColorTexture());
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  const page = await browser.newPage();
  let before = 0;
  let after = 0;
  for (const t of R.listTextures()) {
    const img = t.getImage();
    before += img.byteLength;
    const png = alphaTex.has(t);
    const b64 = await page.evaluate(async (j) => {
      const im = new Image();
      im.src = `data:${j.mime};base64,${j.data}`;
      await im.decode();
      const k = Math.min(1, j.max / Math.max(im.naturalWidth, im.naturalHeight));
      const c = new OffscreenCanvas(Math.round(im.naturalWidth * k), Math.round(im.naturalHeight * k));
      const x = c.getContext('2d');
      x.imageSmoothingQuality = 'high';
      x.drawImage(im, 0, 0, c.width, c.height);
      const blob = await c.convertToBlob(j.png ? { type: 'image/png' } : { type: 'image/jpeg', quality: j.quality });
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return btoa(s);
    }, { mime: t.getMimeType(), data: Buffer.from(img).toString('base64'), max: cfg.textures.max, quality: cfg.textures.quality, png });
    const out = new Uint8Array(Buffer.from(b64, 'base64'));
    after += out.byteLength;
    t.setImage(out).setMimeType(png ? 'image/png' : 'image/jpeg');
  }
  await browser.close();
  console.log(`dokular: ${(before / 1048576).toFixed(2)} MB → ${(after / 1048576).toFixed(2)} MB (en çok ${cfg.textures.max} px)`);
}

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
// Ağaç: oyun boyu sınırlardan (gövde tabanı y=0'a, gövde merkezi orijine oturtulur)
const sceneBounds = getBounds(R.listScenes()[0]);
all[id] = {
  file,
  kind: cfg.kind || 'vehicle',
  rotors: cfg.rotors || null,
  axes,
  forward: cfg.forward || null,
  length: cfg.length || null,
  bounds: { min: sceneBounds.min.map((v) => +v.toFixed(3)), max: sceneBounds.max.map((v) => +v.toFixed(3)) },
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
