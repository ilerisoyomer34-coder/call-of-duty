// Sketchfab'den (GLB olarak) gelen silah modellerini oyunun silah düzenine çevirir; Blender betiğinin
// (Tools/blender/export_weapon.py) GLB karşılığıdır, çıktısı aynı: web/assets/weapons/<id>.glb + weaponAssets.json.
//  - Sergi amaçlı parçaları (yedek şarjör, fişek) atar, tüm dönüşümleri köşelere gömer
//  - Eksen: namlu -Z, üst +Y, sağ +X; gerçek boyuna ölçekler; köken tabanca kabzasının üstü (sağ el)
//  - Animasyonlu parçaları (şarjör, kurma kolu, nişangah gövdesi) ad kalıbıyla ya da bölge kutusuyla ayırır,
//    kalan her şey tek gövde; aynı malzemeli parçalar birleşir (az çizim çağrısı)
//  - Ağır modeli meshoptimizer ile sadeleştirir, konum/normal/UV'yi nicemler
//  - Dokuları GLB'den ayırır: tarayıcıda (Playwright tuvali) küçültür, gerçek marka yazılarını çevresinin
//    rengiyle boyar ve JPEG yazar (oyun dokuları <img> ile yükler; Artifact CSP blob adresine izin vermez)
//  - Lisans bilgisini (asset.extras) ve yardımcı noktaları weaponAssets.json'a yazar
//
// Kullanım (web/ içinden):
//   node tools/prepare-weapon-glb.mjs k8            → hazırla
//   node tools/prepare-weapon-glb.mjs k8 --preview  → yalnızca yönlendirilmiş/ölçeklenmiş modeli ve sınır kutusunu
//                                                    yazdırır (noktaları seçmek için; köken değişmez)
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, quantize, join, transformMesh } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { Matrix4, Vector3, Box3 } from 'three';
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join as pjoin } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = pjoin(dirname(fileURLToPath(import.meta.url)), '..');
const repo = pjoin(root, '..');
const SOURCES = JSON.parse(readFileSync(pjoin(root, 'tools/weapon-glb-map.json'), 'utf8'));

const id = process.argv[2];
const preview = process.argv.includes('--preview');
const cfg = id?.startsWith('_') ? null : SOURCES[id];
if (!cfg) throw new Error(`Bilinmeyen silah: ${id} (tools/weapon-glb-map.json)`);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const srcPath = pjoin(repo, cfg.source);
const doc = await io.read(srcPath);
const R = doc.getRoot();
const scene = R.listScenes()[0];
const credit = R.getAsset().extras || {};
const countTris = () => {
  let n = 0;
  for (const m of R.listMeshes()) for (const p of m.listPrimitives()) n += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  return n;
};
const trisBefore = countTris();
// Dokuların özgün sırası: boyama kuralları bu sıra numarasıyla yazılır (dedup/prune sırayı değiştirebilir)
const texIndex = new Map(R.listTextures().map((t, i) => [t, i]));

// 1) Sergi parçalarını at
const exclude = cfg.exclude ? new RegExp(cfg.exclude) : null;
const nameChain = (node) => {
  const names = [];
  for (let n = node; n; n = n.getParentNode()) names.push(n.getName());
  return names;
};
const meshNodes = R.listNodes().filter((n) => n.getMesh());
for (const n of meshNodes) {
  if (exclude && nameChain(n).some((nm) => exclude.test(nm))) n.setMesh(null);
}

// 2) Yön ve ölçek: kaynaktaki namlu ekseni -Z'ye, üst eksen +Y'ye
const AX = { '+x': [1, 0, 0], '-x': [-1, 0, 0], '+y': [0, 1, 0], '-y': [0, -1, 0], '+z': [0, 0, 1], '-z': [0, 0, -1] };
const f = new Vector3(...AX[cfg.forward]);
const u = new Vector3(...AX[cfg.up]);
const r = new Vector3().crossVectors(f, u); // kaynakta sağ
// Kaynak → oyun: f → -Z, u → +Y, r → +X. Satırları kaynak eksenleri olan dönüşüm matrisi
const rot = new Matrix4().set(r.x, r.y, r.z, 0, u.x, u.y, u.z, 0, -f.x, -f.y, -f.z, 0, 0, 0, 0, 1);
if (cfg.preRotate) rot.multiply(new Matrix4().makeRotationFromQuaternion({ x: cfg.preRotate[0], y: cfg.preRotate[1], z: cfg.preRotate[2], w: cfg.preRotate[3], isQuaternion: true }));
// Önce kutuyu yönlendirilmiş uzayda ölç (ölçek için)
const box = new Box3();
const tmp = new Vector3();
// localTo: kaynağın kök düğümünde sergi için verilmiş eğik duruş varsa, köşeler o düğümün yerel uzayında alınır
const anchor = cfg.localTo ? R.listNodes().find((n) => n.getName() === cfg.localTo) : null;
const anchorInv = anchor ? new Matrix4().fromArray(anchor.getWorldMatrix()).invert() : new Matrix4();
const worldOf = (n) => new Matrix4().multiplyMatrices(anchorInv, new Matrix4().fromArray(n.getWorldMatrix()));
for (const n of R.listNodes().filter((x) => x.getMesh())) {
  const W = new Matrix4().multiplyMatrices(rot, worldOf(n));
  for (const p of n.getMesh().listPrimitives()) {
    const pos = p.getAttribute('POSITION');
    for (let i = 0; i < pos.getCount(); i += 7) box.expandByPoint(tmp.fromArray(pos.getElement(i, [])).applyMatrix4(W));
  }
}
const length = box.max.z - box.min.z;
const scale = cfg.scaleTo / length;
const hand = new Vector3(...(cfg.hand || [0, 0, 0]));
const M = new Matrix4().makeTranslation(-hand.x, -hand.y, -hand.z).multiply(new Matrix4().makeScale(scale, scale, scale)).multiply(rot);

// 3) Dönüşümleri köşelere göm, parçalara ayır: her parça bir düğüm + bir mesh
const partRx = Object.fromEntries(Object.entries(cfg.parts || {}).map(([k, v]) => [k, new RegExp(v)]));
const partBox = Object.fromEntries(Object.entries(cfg.partBoxes || {}).map(([k, v]) => [k, new Box3(new Vector3(...v[0]), new Vector3(...v[1]))]));
const splitBox = cfg.splitBoxes ? Object.fromEntries(Object.entries(cfg.splitBoxes).map(([k, v]) => [k, new Box3(new Vector3(...v[0]), new Vector3(...v[1]))])) : null;
const groups = {};
const center = new Vector3();
for (const n of R.listNodes().filter((x) => x.getMesh())) {
  const W = new Matrix4().multiplyMatrices(M, worldOf(n));
  const mesh = n.getMesh();
  // Paylaşılan mesh'i bozmamak için kopyala, dönüşümü göm
  const copy = doc.createMesh(mesh.getName());
  for (const p of mesh.listPrimitives()) copy.addPrimitive(p.clone());
  transformMesh(copy, W.toArray());
  // Parça: önce ad kalıbı (düğüm ya da ataları), sonra bölge kutusu (mesh merkezi)
  let key = Object.keys(partRx).find((k) => nameChain(n).some((nm) => partRx[k].test(nm)));
  if (!key && Object.keys(partBox).length) {
    const b = new Box3();
    for (const p of copy.listPrimitives()) {
      const pos = p.getAttribute('POSITION');
      for (let i = 0; i < pos.getCount(); i += 5) b.expandByPoint(tmp.fromArray(pos.getElement(i, [])));
    }
    // Kutular noktalarla aynı uzayda (köken ele taşınmadan önce) yazılır
    b.getCenter(center).add(hand);
    key = Object.keys(partBox).find((k) => partBox[k].containsPoint(center));
  }
  key = key || 'body';
  // Üçgen düzeyinde ayırma: gövdede kalan mesh'in, ağırlık merkezi kutuya düşen üçgenleri o parçaya taşınır
  // (ör. holografik nişangahın camı el kundağıyla aynı mesh'teyse)
  if (key === 'body' && splitBox) {
    for (const [part, box] of Object.entries(splitBox)) {
      const moved = doc.createMesh(`${part}-split`);
      for (const p of copy.listPrimitives()) {
        const idx = p.getIndices();
        const pos = p.getAttribute('POSITION');
        if (!idx) continue;
        const keep = [];
        const take = [];
        const a = [];
        for (let t = 0; t < idx.getCount(); t += 3) {
          center.set(0, 0, 0);
          for (let k = 0; k < 3; k++) center.add(tmp.fromArray(pos.getElement(idx.getScalar(t + k), a)));
          center.multiplyScalar(1 / 3).add(hand);
          (box.containsPoint(center) ? take : keep).push(idx.getScalar(t), idx.getScalar(t + 1), idx.getScalar(t + 2));
        }
        if (!take.length) continue;
        const q = p.clone();
        q.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(take)).setBuffer(idx.getBuffer()));
        p.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(keep)).setBuffer(idx.getBuffer()));
        moved.addPrimitive(q);
      }
      if (moved.listPrimitives().length) (groups[part] ||= []).push(moved);
    }
  }
  if (process.env.DEBUG_SPLIT) key = n.getName(); // hata ayıklama: her mesh kendi düğümünde
  if (process.env.DEBUG_PARTS) {
    // Parça kutusu ayarlamak için: her mesh'in merkezi (noktalarla aynı uzayda), boyu ve üçgeni
    const b = new Box3();
    let t = 0;
    for (const p of copy.listPrimitives()) {
      const pos = p.getAttribute('POSITION');
      t += (p.getIndices()?.getCount() ?? pos.getCount()) / 3;
      for (let i = 0; i < pos.getCount(); i += 3) b.expandByPoint(tmp.fromArray(pos.getElement(i, [])));
    }
    const c = b.getCenter(new Vector3()).add(hand);
    const sz = b.getSize(new Vector3());
    console.log(key.padEnd(8), n.getName().padEnd(12), 'merkez', c.toArray().map((v) => v.toFixed(3)).join(','), 'boy', sz.toArray().map((v) => v.toFixed(3)).join(','), 'üçgen', t);
  }
  (groups[key] ||= []).push(copy);
  n.setMesh(null);
}
// Eski hiyerarşiyi kaldır, parça düğümlerini sahneye ekle
for (const n of scene.listChildren()) scene.removeChild(n);
for (const [key, meshes] of Object.entries(groups)) {
  const mesh = doc.createMesh(key);
  for (const m of meshes) for (const p of m.listPrimitives()) mesh.addPrimitive(p);
  scene.addChild(doc.createNode(key).setMesh(mesh));
}

// 4) Malzeme düzeltmeleri (kaynağa göre): taban rengi çarpanı, saydamlık
for (const m of R.listMaterials()) {
  const fix = cfg.materials?.[m.getName()] || cfg.materials?.['*'];
  if (!fix) continue;
  if (fix.baseColor) m.setBaseColorFactor(fix.baseColor);
  if (fix.alphaMode) m.setAlphaMode(fix.alphaMode);
  if (fix.alphaCutoff != null) m.setAlphaCutoff(fix.alphaCutoff);
  if (fix.emissive) m.setEmissiveFactor(fix.emissive);
}

await MeshoptSimplifier.ready;
const steps = [prune(), dedup(), weld()];
if (cfg.ratio && cfg.ratio < 1) steps.push(simplify({ simplifier: MeshoptSimplifier, ratio: cfg.ratio, error: cfg.error ?? 0.0005 }));
steps.push(join({ keepNamed: true }), prune()); // adlı parça düğümleri (mag, charging, optic) ayrı kalsın
await doc.transform(...steps);

// Son kutu (oyun uzayında)
const bounds = getBounds(scene);
if (preview) {
  const outp = pjoin(root, `tools/shots/_preview-${id}.glb`);
  mkdirSync(dirname(outp), { recursive: true });
  await io.write(outp, doc);
  console.log(JSON.stringify({ id, length, scale, bounds, groups: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length])), preview: outp }));
  process.exit(0);
}

// 5) Dokular: tarayıcı tuvalinde küçült, marka yazılarını boya, JPEG yaz; GLB'den çıkar (UV'ler kalır)
const outDir = pjoin(root, 'assets/weapons');
mkdirSync(outDir, { recursive: true });
const materials = {};
const texJobs = [];
const texFile = new Map();
const roleOf = { baseColor: 'map', normal: 'normalMap', metallicRoughness: 'ormMap', occlusion: 'aoMap', emissive: 'emissiveMap' };
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
    if (!texFile.has(tex)) {
      const idx = texIndex.get(tex);
      const rule = cfg.textures?.[idx] || {};
      const srgb = slot === 'baseColor' || slot === 'emissive';
      const max = rule.max || (slot === 'baseColor' ? cfg.texMax || 2048 : cfg.texMaxData || 1024);
      const file = `assets/weapons/${id}_t${idx}.jpg`;
      texFile.set(tex, file);
      texJobs.push({ file, image: Buffer.from(tex.getImage()).toString('base64'), mime: tex.getMimeType(), max, paint: rule.paint || [], quality: srgb ? 0.88 : 0.92 });
    }
    spec[roleOf[slot]] = texFile.get(tex);
  }
  if (Object.keys(spec).length) materials[m.getName()] = spec;
  m.setBaseColorTexture(null).setNormalTexture(null).setMetallicRoughnessTexture(null).setOcclusionTexture(null).setEmissiveTexture(null);
}
if (texJobs.length) {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  const page = await browser.newPage();
  for (const job of texJobs) {
    const b64 = await page.evaluate(async (j) => {
      const img = new Image();
      img.src = `data:${j.mime};base64,${j.image}`;
      await img.decode();
      const W0 = img.naturalWidth;
      const H0 = img.naturalHeight;
      // Boyama önce özgün çözünürlükte: marka yazısını kenarındaki örnek rengin kutusuyla kapat
      const c0 = new OffscreenCanvas(W0, H0);
      const x0 = c0.getContext('2d');
      x0.drawImage(img, 0, 0);
      for (const [x, y, w, h, sx, sy] of j.paint) {
        const px = x0.getImageData(sx, sy, 1, 1).data;
        x0.fillStyle = `rgb(${px[0]},${px[1]},${px[2]})`;
        x0.fillRect(x, y, w, h);
      }
      const k = Math.min(1, j.max / Math.max(W0, H0));
      const c = new OffscreenCanvas(Math.round(W0 * k), Math.round(H0 * k));
      const x = c.getContext('2d');
      x.imageSmoothingQuality = 'high';
      x.drawImage(c0, 0, 0, c.width, c.height);
      const blob = await c.convertToBlob({ type: 'image/jpeg', quality: j.quality });
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return btoa(s);
    }, job);
    writeFileSync(pjoin(root, job.file), Buffer.from(b64, 'base64'));
  }
  await browser.close();
}
// Dokusuz malzemelerin UV'leri gereksiz: dosya küçülsün
for (const mesh of R.listMeshes())
  for (const p of mesh.listPrimitives()) if (!materials[p.getMaterial()?.getName()]) for (const sem of p.listSemantics()) if (/^TEXCOORD_/.test(sem)) p.setAttribute(sem, null);
await doc.transform(prune());
for (const t of R.listTextures()) t.dispose();
await doc.transform(quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 14 }));

const trisAfter = countTris();
const file = `assets/weapons/${id}.glb`;
await io.write(pjoin(root, file), doc);
const bytes = statSync(pjoin(root, file)).size;

// 6) weaponAssets.json: noktalar oyun uzayında (köken el), sınırlar, parçalar, dokular, atıf
const P = (v) => [+(v[0] - hand.x).toFixed(4), +(v[1] - hand.y).toFixed(4), +(v[2] - hand.z).toFixed(4)];
const dataPath = pjoin(root, 'src/weaponAssets.json');
const data = existsSync(dataPath) ? JSON.parse(readFileSync(dataPath, 'utf8')) : {};
const fb = getBounds(scene);
data[id] = {
  file,
  points: Object.fromEntries(Object.entries(cfg.points).map(([k, v]) => [k, P(v)])),
  parts: Object.keys(groups).filter((k) => k !== 'body').sort(),
  bounds: { min: fb.min.map((v) => +v.toFixed(3)), max: fb.max.map((v) => +v.toFixed(3)) },
  length: +cfg.scaleTo.toFixed(3),
  tris: Math.round(trisAfter),
  bytes,
  ...(Object.keys(materials).length ? { materials } : {}),
  credit: { title: credit.title || id, author: credit.author || '', license: credit.license || '', source: credit.source || '' },
};
writeFileSync(dataPath, JSON.stringify(data, null, 2) + '\n');
const sha = createHash('sha256').update(readFileSync(srcPath)).digest('hex');
const texBytes = [...new Set(texFile.values())].reduce((s, f) => s + statSync(pjoin(root, f)).size, 0);
console.log(`${id}: ${Math.round(trisBefore)} → ${Math.round(trisAfter)} üçgen; GLB ${(bytes / 1024).toFixed(0)} KB, dokular ${(texBytes / 1024).toFixed(0)} KB (${texFile.size}); parçalar ${JSON.stringify(Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length])))}`);
console.log('kaynak sha256', sha);
