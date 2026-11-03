// Savaş robotu: Sketchfab "Combat Robot" (ILUSHANDRO, CC BY 4.0) modelini oyuna hazırlar.
// Kaynakta iskelet ve animasyon yok; 154 sert parça var ve sağ/sol eşler çoğu zaman aynı mesh'te. Bu yüzden:
//  1) Her mesh bağlı bileşenlerine ayrılır (kaynaştırılmış köşelerle), her bileşen ağırlık merkezine göre bir
//     gövde parçasına atanır: leğen, gövde, sol/sağ kol, sol/sağ uyluk, baldır, ayak. Ayak bileği ters dizli
//     (kuş bacağı): uyluk öne-aşağı, baldır geri-aşağı iner.
//  2) Parçalar malzeme başına tek primitive'e birleşir (çizim çağrısı az), eklem noktasına göre konumlanır ve
//     düğüm ağacına konur: kök → leğen → gövde → omuzlar; leğen → kalça → diz → bilek. Oyun (robot.js) bu
//     düğümleri adıyla bulup döndürür.
//  3) Ağ sadeleştirilir, nicemlenir; dokular ayrı JPEG olur (renk, normal, pürüz/metal, ortam gölgesi, ışıma).
//
// Kullanım (web/ içinden):  node tools/prepare-robot.mjs
import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, prune, quantize } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(root, '..');
const SOURCE = 'SourceAssets/Characters/combat_robot_ilushandro/original/combat_robot.glb';
const ID = 'robot';
const HEIGHT = 2.9; // oyundaki boy (m): asker boyunun ~1,6 katı, köy sokaklarına sığar
const SIMPLIFY = { ratio: 0.3, error: 0.01 };
// Parça kuralları kaynak birimiyle (model ~6,5 birim): kalça ekleminin yüksekliği, uyluk/baldır/ayak sınırları,
// kolun gövdeden ayrıldığı yan uzaklık
const RULES = { hipY: -1.12, thighMin: -2.75, shinMin: -4.3, armX: 1.15, legX: 0.45 };
const TEX = { base: 86, data: 90, max: 1024 };

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready;
const src = await io.read(join(repo, SOURCE));
const SR = src.getRoot();
const credit = SR.getAsset().extras || {};

// --- 1) Üçgenler dünya uzayında, bağlı bileşenlere ayrılmış ---
const comps = []; // { mat, tris: [[p0,p1,p2,n0,n1,n2,uv0,uv1,uv2]...], c: centroid, min, max }
let minY = Infinity;
let maxY = -Infinity;
for (const node of SR.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh || /floor/i.test(node.getName())) continue;
  const W = new THREE.Matrix4().fromArray(node.getWorldMatrix());
  const N = new THREE.Matrix3().getNormalMatrix(W);
  for (const prim of mesh.listPrimitives()) {
    const mat = prim.getMaterial();
    if (/floor/i.test(mat?.getName() || '')) continue;
    const P = prim.getAttribute('POSITION');
    const NN = prim.getAttribute('NORMAL');
    const UV = prim.getAttribute('TEXCOORD_0');
    const I = prim.getIndices().getArray();
    const n = P.getCount();
    const pos = new Float32Array(n * 3);
    const nor = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    const v = [];
    const t = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      t.fromArray(P.getElement(i, v)).applyMatrix4(W).toArray(pos, i * 3);
      minY = Math.min(minY, pos[i * 3 + 1]);
      maxY = Math.max(maxY, pos[i * 3 + 1]);
      t.fromArray(NN.getElement(i, v)).applyMatrix3(N).normalize().toArray(nor, i * 3);
      if (UV) UV.getElement(i, v), (uv[i * 2] = v[0]), (uv[i * 2 + 1] = v[1]);
    }
    // Kaynaştırma anahtarı (aynı konumdaki köşeler tek düğüm): bağlı bileşen için birleşim-bul
    const key = new Map();
    const rep = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      const k = `${Math.round(pos[i * 3] * 1e4)},${Math.round(pos[i * 3 + 1] * 1e4)},${Math.round(pos[i * 3 + 2] * 1e4)}`;
      if (!key.has(k)) key.set(k, i);
      rep[i] = key.get(k);
    }
    const par = new Int32Array(n).map((_, i) => i);
    const find = (a) => {
      while (par[a] !== a) a = par[a] = par[par[a]];
      return a;
    };
    for (let f = 0; f < I.length; f += 3) {
      const a = find(rep[I[f]]);
      for (let k = 1; k < 3; k++) {
        const b = find(rep[I[f + k]]);
        if (a !== b) par[b] = a;
      }
    }
    const byRoot = new Map();
    for (let f = 0; f < I.length; f += 3) {
      const r = find(rep[I[f]]);
      if (!byRoot.has(r)) byRoot.set(r, { mat, idx: [], c: new THREE.Vector3(), min: new THREE.Vector3(Infinity, Infinity, Infinity), max: new THREE.Vector3(-Infinity, -Infinity, -Infinity), pos, nor, uv });
      const C = byRoot.get(r);
      for (let k = 0; k < 3; k++) {
        const i = I[f + k];
        C.idx.push(i);
        t.fromArray(pos, i * 3);
        C.c.add(t);
        C.min.min(t);
        C.max.max(t);
      }
    }
    for (const C of byRoot.values()) {
      C.c.divideScalar(C.idx.length);
      comps.push(C);
    }
  }
}

// --- 2) Bileşenleri parçalara ata ---
const segOf = (C) => {
  const m = C.mat?.getName() || '';
  const x = C.c.x;
  const side = x < 0 ? 'L' : 'R'; // model -Z'ye bakar: -X karakterin solu
  if (/legs/i.test(m) || (C.c.y < RULES.hipY && Math.abs(x) > RULES.legX)) {
    if (C.c.y > RULES.thighMin) return `thigh${side}`;
    if (C.c.y > RULES.shinMin) return `shin${side}`;
    return `foot${side}`;
  }
  if (/hands/i.test(m) && Math.abs(x) > RULES.armX) return `arm${side}`;
  if (C.c.y < RULES.hipY + 0.1) return 'pelvis';
  return 'torso';
};
const segs = {};
for (const C of comps) (segs[segOf(C)] ||= []).push(C);
const bbox = (list) => {
  const b = new THREE.Box3();
  for (const C of list) b.expandByPoint(C.min).expandByPoint(C.max);
  return b;
};

// --- 3) Eklem noktaları (kaynak birimiyle), parçaların sınırlarından ---
const S = HEIGHT / (maxY - minY);
const pv = {};
for (const side of ['L', 'R']) {
  const th = bbox(segs[`thigh${side}`]);
  const sh = bbox(segs[`shin${side}`]);
  const ft = bbox(segs[`foot${side}`]);
  const ar = bbox(segs[`arm${side}`]);
  const cx = (th.min.x + th.max.x) / 2;
  pv[`hip${side}`] = new THREE.Vector3(cx, th.max.y - 0.3, (th.min.z + th.max.z) / 2);
  // Diz: uyluğun alt ucu ile baldırın üst ucunun ortası; ters dizli bacakta öne çıkıktır (uyluğun en ön noktası)
  pv[`knee${side}`] = new THREE.Vector3(cx, (th.min.y + sh.max.y) / 2, th.min.z + 0.35);
  pv[`ankle${side}`] = new THREE.Vector3(cx, (sh.min.y + ft.max.y) / 2, (ft.min.z + ft.max.z) / 2 - 0.1);
  pv[`shoulder${side}`] = new THREE.Vector3(side === 'L' ? ar.max.x - 0.55 : ar.min.x + 0.55, ar.max.y - 0.55, (ar.min.z + ar.max.z) / 2 - 0.15);
}
pv.pelvis = new THREE.Vector3(0, RULES.hipY, (pv.hipL.z + pv.hipR.z) / 2);
pv.torso = new THREE.Vector3(0, RULES.hipY + 0.35, pv.pelvis.z);
const muzzles = {};
for (const side of ['L', 'R']) {
  // Namlu ağzı: kol parçalarının en ön noktası (gatling namluları)
  const ar = bbox(segs[`arm${side}`]);
  muzzles[side] = new THREE.Vector3((ar.min.x + ar.max.x) / 2, (ar.min.y + ar.max.y) / 2 - 0.1, ar.min.z);
}

// Oyun uzayı: ayak tabanı y = 0, ölçek S (model zaten -Z'ye bakıyor)
const G = (v) => new THREE.Vector3(v.x * S, (v.y - minY) * S, v.z * S);

// --- 4) Çıktı belgesi: düğüm ağacı ve malzeme başına birleşik primitive'ler ---
const out = new (await import('@gltf-transform/core')).Document();
const buf = out.createBuffer();
const scene = out.createScene('robot');
const PARENT = {
  pelvis: null,
  torso: 'pelvis',
  shoulderL: 'torso',
  shoulderR: 'torso',
  hipL: 'pelvis',
  kneeL: 'hipL',
  ankleL: 'kneeL',
  hipR: 'pelvis',
  kneeR: 'hipR',
  ankleR: 'kneeR',
};
const SEG_JOINT = { pelvis: 'pelvis', torso: 'torso', armL: 'shoulderL', armR: 'shoulderR', thighL: 'hipL', shinL: 'kneeL', footL: 'ankleL', thighR: 'hipR', shinR: 'kneeR', footR: 'ankleR' };
const nodes = {};
const rootNode = out.createNode('robot_root');
scene.addChild(rootNode);
for (const [j, p] of Object.entries(PARENT)) {
  const n = out.createNode(j);
  const w = G(pv[j]);
  const pw = p ? G(pv[p]) : new THREE.Vector3();
  n.setTranslation(w.clone().sub(pw).toArray());
  nodes[j] = n;
  (p ? nodes[p] : rootNode).addChild(n);
}
// Kaynak malzemeleri: dokuları yazılıp çıkarılır, adları korunur
const matMap = new Map();
const materials = {};
const texFile = new Map();
const roleOf = { baseColor: 'map', normal: 'normalMap', metallicRoughness: 'ormMap', occlusion: 'aoMap', emissive: 'emissiveMap' };
for (const m of SR.listMaterials()) {
  if (/floor/i.test(m.getName())) continue;
  const om = out.createMaterial(m.getName()).setMetallicFactor(m.getMetallicFactor()).setRoughnessFactor(m.getRoughnessFactor()).setEmissiveFactor(m.getEmissiveFactor());
  matMap.set(m, om);
  const spec = {};
  const slots = { baseColor: m.getBaseColorTexture(), normal: m.getNormalTexture(), metallicRoughness: m.getMetallicRoughnessTexture(), occlusion: m.getOcclusionTexture(), emissive: m.getEmissiveTexture() };
  for (const [slot, tex] of Object.entries(slots)) {
    if (!tex) continue;
    if (!texFile.has(tex)) {
      const file = `assets/characters/${ID}_${m.getName().toLowerCase()}_${slot === 'metallicRoughness' ? 'orm' : slot}.jpg`;
      await sharp(Buffer.from(tex.getImage())).resize(TEX.max, TEX.max, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: slot === 'baseColor' || slot === 'emissive' ? TEX.base : TEX.data, mozjpeg: true }).toFile(join(root, file));
      texFile.set(tex, file);
    }
    spec[roleOf[slot]] = texFile.get(tex);
  }
  materials[m.getName()] = spec;
}
for (const [seg, list] of Object.entries(segs)) {
  const joint = SEG_JOINT[seg];
  const jw = G(pv[joint]);
  const byMat = new Map();
  for (const C of list) (byMat.get(C.mat) || byMat.set(C.mat, []).get(C.mat)).push(C);
  const mesh = out.createMesh(seg);
  for (const [sm, cl] of byMat) {
    const P = [];
    const Nn = [];
    const U = [];
    const t = new THREE.Vector3();
    for (const C of cl)
      for (const i of C.idx) {
        G(t.fromArray(C.pos, i * 3)).sub(jw).toArray(P, P.length);
        Nn.push(C.nor[i * 3], C.nor[i * 3 + 1], C.nor[i * 3 + 2]);
        U.push(C.uv[i * 2], C.uv[i * 2 + 1]);
      }
    const prim = out
      .createPrimitive()
      .setMaterial(matMap.get(sm))
      .setAttribute('POSITION', out.createAccessor().setType('VEC3').setArray(new Float32Array(P)).setBuffer(buf))
      .setAttribute('NORMAL', out.createAccessor().setType('VEC3').setArray(new Float32Array(Nn)).setBuffer(buf))
      .setAttribute('TEXCOORD_0', out.createAccessor().setType('VEC2').setArray(new Float32Array(U)).setBuffer(buf));
    mesh.addPrimitive(prim);
  }
  nodes[joint].addChild(out.createNode(`${seg}_mesh`).setMesh(mesh));
}
const trisOf = (d) => d.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((t, p) => t + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0), 0);
const before = trisOf(out);
await out.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: SIMPLIFY.ratio, error: SIMPLIFY.error }), prune({ keepAttributes: true }), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
const file = `assets/characters/${ID}.glb`;
await io.write(join(root, file), out);

// --- 5) Özet: eklemler ve namlular oyun uzayında (köke göre) ---
const dataFile = join(root, 'src/characterAssets.json');
const data = existsSync(dataFile) ? JSON.parse(readFileSync(dataFile, 'utf8')) : {};
const r3 = (v) => v.toArray().map((x) => +x.toFixed(3));
data[ID] = {
  file,
  kind: 'rigid',
  materials,
  height: HEIGHT,
  joints: Object.fromEntries(Object.keys(PARENT).map((j) => [j, r3(G(pv[j]))])),
  muzzles: { L: r3(G(muzzles.L)), R: r3(G(muzzles.R)) },
  tris: Math.round(trisOf(out)),
  bytes: statSync(join(root, file)).size + [...new Set(texFile.values())].reduce((s, f) => s + statSync(join(root, f)).size, 0),
  credit: { title: credit.title || '', author: credit.author || '', license: credit.license || '', source: credit.source || '' },
};
writeFileSync(dataFile, JSON.stringify(data, null, 2) + '\n');
console.log(`${ID}: ${Math.round(before)} → ${data[ID].tris} üçgen, ${(data[ID].bytes / 1024).toFixed(0)} KB, ölçek ${S.toFixed(3)}`);
console.log('parçalar', Object.fromEntries(Object.entries(segs).map(([k, v]) => [k, v.length])));
console.log('eklemler', JSON.stringify(data[ID].joints));
console.log('sha256', createHash('sha256').update(readFileSync(join(repo, SOURCE))).digest('hex'));
