// Alfa Timi askerleri: Sketchfab "3 soldier low poly (outdated)" (buh, CC BY 4.0) modelindeki üç askeri
// oyunun asker iskeletine taşır. Kaynak modelde animasyon yok, iskeleti de oyununkinden farklı (59 kemik,
// "Bone.0xx" adları, A pozu, +Z'ye bakar). Oyunun kodu (soldier.js) ve klipleri (Idle/Walk/Run) Mixamo
// adlı iskelet bekliyor; bu yüzden:
//  1) Model A pozundan oyun iskeletinin T pozuna bükülür: her kemik, düşman askerinin (soldier.glb) aynı
//     kemiğinin dinlenme yönüne döndürülür (yukarıdan aşağı); el, parmak yönü ve avuç ekseniyle iki yönden
//     hizalanır ki avuç oyunun beklediği gibi aşağı baksın. Köşeler bu pozda deri ağırlıklarıyla bükülür.
//  2) Çıktı iskeleti soldier.glb'nin iskeletidir (aynı adlar, aynı yerel dönüşler); yalnız kemik konumları yeni
//     modelden gelir. Böylece düşman askerinin klipleri kemik dönüşleriyle aynen oynar (oyun klipleri
//     soldier şablonundan alır, kalça yüksekliği farkını ölçekler: characterAssets.json → hipRatio).
//  3) Ağırlıklar yeni kemiklerden eski adlara aktarılır (avuç içi kemikleri ele, iskelette olmayan uç kemikler
//     bir üstüne). Ağ sadeleştirilir, uzak model yazılır, dokular ayrı JPEG olur.
//
// Kullanım (web/ içinden):  node tools/prepare-squad.mjs
import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, prune, quantize } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { readFileSync, writeFileSync, statSync, existsSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(root, '..');
const SOURCE = 'SourceAssets/Characters/squad_buh/original/3_soldier_low_poly.glb';
const SKELETON = 'assets/characters/soldier.glb'; // hedef iskelet ve kliplerin sahibi
// Kaynaktaki üç asker (deri adlarındaki harf) → oyundaki kimlik. Görünüşe göre adlandırıldı
const VARIANTS = { A: 'squad_desert', S: 'squad_forest', R: 'squad_woodland' };
const HEIGHT = 1.84; // kask tepesine kadar boy (m); düşman askeri 1,83
const HI = { ratio: 0.5, error: 0.004 }; // yakın model: ≈15 bin üçgen (üç asker oyuncunun hemen yanında)
const LOD = { ratio: 0.085, error: 0.04 }; // uzak model: ≈2,5 bin üçgen
const QUANT = { quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeWeight: 8 };

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

// Yumuşak köşe normalleri: komşu üçgenlerin alanla ağırlıklı normallerinin toplamı
function smoothNormals(prim) {
  const P = prim.getAttribute('POSITION').getArray();
  const I = prim.getIndices().getArray();
  const N = new Float32Array(P.length);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let t = 0; t < I.length; t += 3) {
    a.fromArray(P, I[t] * 3);
    b.fromArray(P, I[t + 1] * 3).sub(a);
    c.fromArray(P, I[t + 2] * 3).sub(a);
    b.cross(c);
    for (let k = 0; k < 3; k++) for (let e = 0; e < 3; e++) N[I[t + k] * 3 + e] += b.getComponent(e);
  }
  for (let i = 0; i < N.length; i += 3) a.fromArray(N, i).normalize().toArray(N, i);
  return N;
}
await MeshoptSimplifier.ready;
const M4 = (a) => new THREE.Matrix4().fromArray(a);
const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

// --- Hedef iskelet: dinlenme pozunda dünya konumları (m) ---
const oldDoc = await io.read(join(root, SKELETON));
const oldPos = {};
for (const n of oldDoc.getRoot().listNodes()) oldPos[n.getName()] = new THREE.Vector3().setFromMatrixPosition(M4(n.getWorldMatrix()));
const oldDir = (a, b) => oldPos[b].clone().sub(oldPos[a]).normalize();
// Deriye bağlı kemikler (iskelette uç düğümler de var: sol başparmak 3, serçe 3; onlar ağırlık almaz)
const oldJoint = new Set(oldDoc.getRoot().listSkins().find((sk) => sk.listJoints().length > 10).listJoints().map((j) => j.getName()));
const hipOld = oldPos.Hips.y;

// --- Kemik eşlemesi (yeni → eski ad). Kaynak +Z'ye bakar: +X yanı karakterin solu ---
const B = (n) => (n === 0 ? 'Bone' : `Bone.${String(n).padStart(3, '0')}`);
const SIDES = [
  { s: 'Left', shoulder: 6, arm: 13, fore: 14, hand: 15, thumb: [16, 17, 18], meta: [19, 20, 21, 22], fingers: { Index: [23, 27, 31], Middle: [24, 28, 32], Ring: [25, 29, 33], Pinky: [26, 30, 34] }, leg: [7, 8, 9] },
  { s: 'Right', shoulder: 35, arm: 36, fore: 37, hand: 38, thumb: [39, 40, 41], meta: [42, 43, 44, 45], fingers: { Index: [46, 50, 54], Middle: [47, 51, 55], Ring: [48, 52, 56], Pinky: [49, 53, 57] }, leg: [10, 11, 12] },
];
const MAP = { rootJoint: 'Hips', [B(0)]: 'Hips', [B(1)]: 'Hips', [B(2)]: 'Spine', [B(3)]: 'Spine2', [B(4)]: 'Neck', [B(5)]: 'Head' };
// Hizalama: yeni kemik → [yönünü veren yeni kemik, eski iskelette aynı yönün başı, sonu]
const ALIGN = { [B(2)]: [B(3), 'Spine', 'Spine2'], [B(3)]: [B(4), 'Spine2', 'Neck'], [B(4)]: [B(5), 'Neck', 'Head'] };
const HANDS = {};
for (const S of SIDES) {
  const s = S.s;
  const chain = (bones, names) => {
    // İskelette olmayan uç kemik (sol başparmak 3, serçe 3) ağırlığını bir üstüne verir
    let last = null;
    bones.forEach((b, i) => {
      const nm = oldJoint.has(names[i]) ? names[i] : last;
      MAP[B(b)] = nm;
      last = nm;
    });
    for (let i = 0; i < bones.length - 1; i++) {
      const a = oldJoint.has(names[i]) ? names[i] : names[i - 1];
      const bb = oldJoint.has(names[i + 1]) ? names[i + 1] : null;
      // Eski zincirin sonu yoksa son parçanın yönü öncekininki (düz parmak)
      ALIGN[B(bones[i])] = bb ? [B(bones[i + 1]), a, bb] : [B(bones[i + 1]), names[i - 1] || names[0], a];
    }
  };
  chain([S.shoulder, S.arm, S.fore, S.hand], [`${s}Shoulder`, `${s}Arm`, `${s}ForeArm`, `${s}Hand`]);
  chain(S.leg, [`${s}UpLeg`, `${s}Leg`, `${s}Foot`]);
  for (const m of S.meta) MAP[B(m)] = `${s}Hand`;
  chain(S.thumb, [1, 2, 3].map((i) => `${s}HandThumb${i}`));
  for (const [f, bones] of Object.entries(S.fingers)) chain(bones, [1, 2, 3].map((i) => `${s}Hand${f}${i}`));
  delete ALIGN[B(S.hand)]; // el iki yönden hizalanır (aşağıda)
  HANDS[B(S.hand)] = { mid: B(S.fingers.Middle[0]), idx: B(S.fingers.Index[0]), pinky: B(S.fingers.Pinky[0]), s };
}

const src = await io.read(join(repo, SOURCE));
const SR = src.getRoot();
const parentOf = new Map();
for (const n of SR.listNodes()) for (const c of n.listChildren()) parentOf.set(c, n);
const baseName = (n) => (/_rootJoint$/.test(n) ? 'rootJoint' : n.match(/^(Bone(?:\.\d+)?)_/)?.[1]);

// Dokuyu JPEG yaz (renk ve veri dokuları ayrı kalite)
async function writeJpeg(tex, file, quality) {
  await sharp(Buffer.from(tex.getImage())).jpeg({ quality, mozjpeg: true }).toFile(join(root, file));
  return file;
}

const dataFile = join(root, 'src/characterAssets.json');
const data = existsSync(dataFile) ? JSON.parse(readFileSync(dataFile, 'utf8')) : {};
const credit = src.getRoot().getAsset().extras || {};

for (const [tag, id] of Object.entries(VARIANTS)) {
  const skin = SR.listSkins().find((sk) => sk.listJoints().some((j) => j.getName().includes(`_${tag}_`)));
  const joints = skin.listJoints();
  const names = joints.map((j) => baseName(j.getName()));
  const idx = Object.fromEntries(names.map((n, i) => [n, i]));
  const ibm = skin.getInverseBindMatrices();
  const skinMat = joints.map((j, i) => {
    const e = [];
    ibm.getElement(i, e);
    return M4(j.getWorldMatrix()).multiply(M4(e));
  });
  const prims = SR.listNodes()
    .filter((n) => n.getSkin() === skin && n.getMesh())
    .flatMap((n) => n.getMesh().listPrimitives().map((p) => ({ p, small: p.getAttribute('POSITION').getCount() < 1000 })));

  // 1) Köşeler düğüm pozunda (dünya): Σ w · (J · IBM) · v
  const tmp = new THREE.Vector3();
  const nrm = new THREE.Matrix3();
  const meshes = prims.map(({ p, small }) => {
    const pos = p.getAttribute('POSITION');
    const nor = p.getAttribute('NORMAL');
    const tan = p.getAttribute('TANGENT');
    const J = p.getAttribute('JOINTS_0');
    const W = p.getAttribute('WEIGHTS_0');
    const n = pos.getCount();
    const P = new Float32Array(n * 3);
    const N = new Float32Array(n * 3);
    const T = tan ? new Float32Array(n * 4) : null;
    const ji = [];
    const wi = [];
    const v = [];
    const m = new THREE.Matrix4();
    // Ağırlıklar: toplamı 1'e; birkaç başıboş köşenin hiç ağırlığı yok, köke bağlanır
    const JI = new Uint16Array(n * 4);
    const WI = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      J.getElement(i, ji);
      W.getElement(i, wi);
      const sum = wi.reduce((a, b) => a + Math.max(0, b), 0);
      for (let k = 0; k < 4; k++) (JI[i * 4 + k] = ji[k]), (WI[i * 4 + k] = sum > 1e-6 ? Math.max(0, wi[k]) / sum : 0);
      if (!(sum > 1e-6)) (JI[i * 4] = idx.rootJoint), (WI[i * 4] = 1);
    }
    for (let i = 0; i < n; i++) {
      m.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      for (let k = 0; k < 4; k++) {
        const w = WI[i * 4 + k];
        if (w > 0) for (let e = 0; e < 16; e++) m.elements[e] += skinMat[JI[i * 4 + k]].elements[e] * w;
      }
      pos.getElement(i, v);
      tmp.fromArray(v).applyMatrix4(m).toArray(P, i * 3);
      nrm.getNormalMatrix(m);
      nor.getElement(i, v);
      tmp.fromArray(v).applyMatrix3(nrm).normalize().toArray(N, i * 3);
      if (T) {
        tan.getElement(i, v);
        tmp.set(v[0], v[1], v[2]).transformDirection(m).toArray(T, i * 4);
        T[i * 4 + 3] = v[3];
      }
    }
    return { p, small, n, P, N, T, JI, WI, uv: p.getAttribute('TEXCOORD_0'), idxs: p.getIndices(), mat: p.getMaterial() };
  });

  // 2) Oyun uzayına: kalça ortada, taban y = 0, -Z'ye bakar (Y çevresinde 180°)
  const hipW = new THREE.Vector3().setFromMatrixPosition(M4(joints[idx[B(1)]].getWorldMatrix()));
  let minY = Infinity;
  let maxY = -Infinity;
  for (const M of meshes) for (let i = 1; i < M.P.length; i += 3) (minY = Math.min(minY, M.P[i])), (maxY = Math.max(maxY, M.P[i]));
  const G = (x, y, z, out) => out.set(-(x - hipW.x), y - minY, -(z - hipW.z));
  for (const M of meshes)
    for (let i = 0; i < M.n; i++) {
      G(M.P[i * 3], M.P[i * 3 + 1], M.P[i * 3 + 2], tmp).toArray(M.P, i * 3);
      M.N[i * 3] *= -1;
      M.N[i * 3 + 2] *= -1;
      if (M.T) (M.T[i * 4] *= -1), (M.T[i * 4 + 2] *= -1);
    }
  const scale = HEIGHT / (maxY - minY);
  const Pj = joints.map((j) => {
    const w = new THREE.Vector3().setFromMatrixPosition(M4(j.getWorldMatrix()));
    return G(w.x, w.y, w.z, new THREE.Vector3());
  });

  // 3) T pozuna bük: yukarıdan aşağı her kemiğin dünya dönüş farkı D ve yeni konumu Pp
  const D = joints.map(() => new THREE.Quaternion());
  const Pp = Pj.map((p) => p.clone());
  const done = new Set();
  const visit = (j) => {
    const i = joints.indexOf(j);
    const par = parentOf.get(j);
    const pi = par ? joints.indexOf(par) : -1;
    if (pi >= 0) {
      Pp[i].copy(Pj[i]).sub(Pj[pi]).applyQuaternion(D[pi]).add(Pp[pi]);
      D[i].copy(D[pi]);
    }
    const nm = names[i];
    const al = ALIGN[nm];
    if (al) {
      const cur = Pj[idx[al[0]]].clone().sub(Pj[i]).applyQuaternion(D[i]).normalize();
      D[i].premultiply(new THREE.Quaternion().setFromUnitVectors(cur, oldDir(al[1], al[2])));
    } else if (HANDS[nm]) {
      // El: parmak yönü (bilek → orta parmak kökü) ve parmaklar arası eksen (işaret → serçe) eski elinkine
      const H = HANDS[nm];
      const s = H.s;
      const frame = (f, l) => {
        const x = f.clone().normalize();
        const y = l.clone().addScaledVector(x, -l.dot(x)).normalize();
        return new THREE.Matrix4().makeBasis(x, y, new THREE.Vector3().crossVectors(x, y));
      };
      const fNew = Pj[idx[H.mid]].clone().sub(Pj[i]).applyQuaternion(D[i]);
      const lNew = Pj[idx[H.idx]].clone().sub(Pj[idx[H.pinky]]).applyQuaternion(D[i]);
      const fOld = oldPos[`${s}HandMiddle1`].clone().sub(oldPos[`${s}Hand`]);
      const lOld = oldPos[`${s}HandIndex1`].clone().sub(oldPos[`${s}HandPinky1`]);
      const R = frame(fOld, lOld).multiply(frame(fNew, lNew).transpose());
      D[i].premultiply(new THREE.Quaternion().setFromRotationMatrix(R));
    }
    done.add(j);
    for (const c of j.listChildren()) if (joints.includes(c) && !done.has(c)) visit(c);
  };
  visit(joints[idx.rootJoint]);

  // Köşeler: Σ w · (Pp + D · (v − Pj)); normal ve teğet D ile döner
  const q = new THREE.Quaternion();
  const acc = new THREE.Vector3();
  const accN = new THREE.Vector3();
  const accT = new THREE.Vector3();
  for (const M of meshes) {
    for (let v = 0; v < M.n; v++) {
      const ji = M.JI.subarray(v * 4, v * 4 + 4);
      const wi = M.WI.subarray(v * 4, v * 4 + 4);
      acc.set(0, 0, 0);
      accN.set(0, 0, 0);
      accT.set(0, 0, 0);
      const x = tmp.fromArray(M.P, v * 3).clone();
      for (let k = 0; k < 4; k++) {
        const w = wi[k];
        if (!(w > 0)) continue;
        const j = ji[k];
        acc.addScaledVector(x.clone().sub(Pj[j]).applyQuaternion(D[j]).add(Pp[j]), w);
        accN.addScaledVector(new THREE.Vector3().fromArray(M.N, v * 3).applyQuaternion(D[j]), w);
        if (M.T) accT.addScaledVector(new THREE.Vector3().fromArray(M.T, v * 4).applyQuaternion(D[j]), w);
      }
      acc.multiplyScalar(scale).toArray(M.P, v * 3);
      accN.normalize().toArray(M.N, v * 3);
      if (M.T) accT.normalize().toArray(M.T, v * 4);
    }
  }
  q.identity();

  // 4) Çıktı: hedef iskeletin kopyası, kemik konumları yeni modelden
  const out = await io.read(join(root, SKELETON));
  const OR = out.getRoot();
  // Klipler oyunda soldier şablonundan. Örnekleyiciler ayrıca silinmeli, yoksa erişimcileri dosyaya yazılır
  for (const a of OR.listAnimations()) {
    for (const c of a.listChannels()) c.dispose();
    for (const sm of a.listSamplers()) sm.dispose();
    a.dispose();
  }
  const nodeBy = Object.fromEntries(OR.listNodes().map((n) => [n.getName(), n]));
  const oskin = OR.listSkins().find((sk) => sk.listJoints().length > 10);
  const ojoints = oskin.listJoints();
  const target = {};
  const at = (nm) => Pp[idx[nm]].clone().multiplyScalar(scale);
  target.Hips = at(B(1));
  target.Spine2 = at(B(3));
  target.Spine = target.Hips.clone().lerp(target.Spine2, 0.3);
  target.Spine1 = target.Hips.clone().lerp(target.Spine2, 0.65);
  target.Neck = at(B(4));
  target.Head = at(B(5));
  for (const S of SIDES) {
    const s = S.s;
    target[`${s}Shoulder`] = at(B(S.shoulder));
    target[`${s}Arm`] = at(B(S.arm));
    target[`${s}ForeArm`] = at(B(S.fore));
    target[`${s}Hand`] = at(B(S.hand));
    // Deride olmayan uç düğümler de (sol başparmak 3, serçe 3) yeni kemiğin yerine konur
    S.thumb.forEach((b, i) => oldPos[`${s}HandThumb${i + 1}`] && (target[`${s}HandThumb${i + 1}`] = at(B(b))));
    for (const [f, bones] of Object.entries(S.fingers)) bones.forEach((b, i) => oldPos[`${s}Hand${f}${i + 1}`] && (target[`${s}Hand${f}${i + 1}`] = at(B(b))));
    target[`${s}UpLeg`] = at(B(S.leg[0]));
    target[`${s}Leg`] = at(B(S.leg[1]));
    target[`${s}Foot`] = at(B(S.leg[2]));
    // Ayak ucu kemiği kaynakta yok (ağırlıksız): eski iskeletteki yeri bacak boyuyla ölçeklenir
    const k = target[`${s}Foot`].distanceTo(target[`${s}UpLeg`]) / oldPos[`${s}Foot`].distanceTo(oldPos[`${s}UpLeg`]);
    target[`${s}ToeBase`] = target[`${s}Foot`].clone().add(oldPos[`${s}ToeBase`].clone().sub(oldPos[`${s}Foot`]).multiplyScalar(k));
  }
  const setWorld = (n) => {
    const nm = n.getName();
    if (target[nm]) {
      const par = M4(parentOfOut.get(n).getWorldMatrix());
      n.setTranslation(target[nm].clone().applyMatrix4(par.invert()).toArray());
    }
    for (const c of n.listChildren()) setWorld(c);
  };
  const parentOfOut = new Map();
  for (const n of OR.listNodes()) for (const c of n.listChildren()) parentOfOut.set(c, n);
  setWorld(nodeBy.Hips);
  for (const j of ojoints) if (!target[j.getName()]) throw new Error(`${j.getName()} için konum yok`);
  const ibmArr = new Float32Array(ojoints.length * 16);
  ojoints.forEach((j, i) => M4(j.getWorldMatrix()).invert().toArray(ibmArr, i * 16));
  oskin.setInverseBindMatrices(out.createAccessor().setType('MAT4').setArray(ibmArr).setBuffer(OR.listBuffers()[0]));
  const ojIndex = Object.fromEntries(ojoints.map((j, i) => [j.getName(), i]));

  // Eski ağlar ve deriler gider; yeni ağlar sahne kökünde (glTF deri ağının düğüm dönüşünü yok sayar)
  for (const n of OR.listNodes()) if (n.getMesh()) {
    n.getMesh().dispose();
    if (n.getSkin() && n.getSkin() !== oskin) n.getSkin().dispose();
    n.dispose();
  }
  for (const m of OR.listMaterials()) m.dispose();
  const scene = OR.listScenes()[0];
  const buf = OR.listBuffers()[0];
  const texDir = `assets/characters/${id}`;
  const materials = {};
  const bodyMat = out.createMaterial(`${id}_body`).setMetallicFactor(1).setRoughnessFactor(1);
  const visorMat = out.createMaterial(`${id}_visor`).setBaseColorFactor([0.02, 0.02, 0.02, 1]).setMetallicFactor(0.3).setRoughnessFactor(0.25);
  for (const M of meshes) {
    if (M.small) continue;
    const sm = M.mat;
    materials[bodyMat.getName()] = {
      map: await writeJpeg(sm.getBaseColorTexture(), `${texDir}_diffuse.jpg`, 86),
      normalMap: await writeJpeg(sm.getNormalTexture(), `${texDir}_normal.jpg`, 90),
      ormMap: sm.getMetallicRoughnessTexture() ? await writeJpeg(sm.getMetallicRoughnessTexture(), `${texDir}_orm.jpg`, 88) : null,
    };
  }
  for (const M of meshes) {
    const prim = out.createPrimitive().setMaterial(M.small ? visorMat : bodyMat);
    const acc = (type, arr) => out.createAccessor().setType(type).setArray(arr).setBuffer(buf);
    prim.setAttribute('POSITION', acc('VEC3', M.P));
    prim.setAttribute('NORMAL', acc('VEC3', M.N));
    // Teğet yazılmaz: uzak model teğetsiz, ikisi aynı gölgelendiriciyi paylaşsın (normal haritası türev teğetle okunur)
    if (!M.small) prim.setAttribute('TEXCOORD_0', acc('VEC2', M.uv.getArray().slice()));
    // Ağırlıklar eski adlara: aynı kemiğe düşenler toplanır, en büyük dördü kalır
    const JJ = new Uint8Array(M.n * 4);
    const WW = new Float32Array(M.n * 4);
    for (let v = 0; v < M.n; v++) {
      const ji = M.JI.subarray(v * 4, v * 4 + 4);
      const wi = M.WI.subarray(v * 4, v * 4 + 4);
      const sum = new Map();
      for (let k = 0; k < 4; k++) {
        if (!(wi[k] > 0)) continue;
        const nm = MAP[names[ji[k]]];
        const oi = ojIndex[nm];
        if (oi === undefined) throw new Error(`${names[ji[k]]} → ${nm} eşlenemedi`);
        sum.set(oi, (sum.get(oi) || 0) + wi[k]);
      }
      const top = [...sum.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
      const tot = top.reduce((s, e) => s + e[1], 0) || 1;
      top.forEach(([oi, w], k) => ((JJ[v * 4 + k] = oi), (WW[v * 4 + k] = w / tot)));
    }
    prim.setAttribute('JOINTS_0', acc('VEC4', JJ));
    prim.setAttribute('WEIGHTS_0', acc('VEC4', WW));
    prim.setIndices(out.createAccessor().setType('SCALAR').setArray(new Uint32Array(M.idxs.getArray())).setBuffer(buf));
    const name = M.small ? `${id}_visor` : `${id}_body`;
    const node = out.createNode(name).setMesh(out.createMesh(name).addPrimitive(prim)).setSkin(oskin);
    scene.addChild(node);
  }
  await out.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: HI.ratio, error: HI.error }), prune({ keepAttributes: true }));
  const file = `${texDir}.glb`;
  // Yazılan dosya nicemlenir (KHR_mesh_quantization, three.js doğrudan okur); uzak model nicemlenmemiş
  // kopyadan türetilir ki sadeleştirme tam hassasiyetle yapılsın
  const hiBytes = await io.writeBinary(out);
  await out.transform(quantize(QUANT));
  await io.write(join(root, file), out);
  const tris = (d) => d.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((t, p) => t + p.getIndices().getCount() / 3, 0), 0);

  // Uzak model: aynı iskelet, aynı ağ adları
  // Kaynakta yüzey normalleri düz (her üçgenin köşeleri ayrı): normaller atılmazsa köşeler birleşmez,
  // sadeleştirici kenarları kilitler. Uzakta yumuşak normaller farkedilmez; normal haritası teğetsiz okunur
  const ld = await io.readBinary(hiBytes);
  for (const m of ld.getRoot().listMeshes()) for (const p of m.listPrimitives()) p.setAttribute('NORMAL', null).setAttribute('TANGENT', null);
  await ld.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: LOD.ratio, error: LOD.error }), prune({ keepAttributes: true }));
  for (const m of ld.getRoot().listMeshes()) for (const p of m.listPrimitives()) p.setAttribute('NORMAL', ld.createAccessor().setType('VEC3').setArray(smoothNormals(p)).setBuffer(ld.getRoot().listBuffers()[0]));
  await ld.transform(quantize(QUANT));
  // Ayrık parçalı (kayış, cep) çeşitlerde sadeleştirme yarıya inmiyor: uzak model kazandırmıyorsa yazılmaz
  const lodFile = `${texDir}_lod.glb`;
  const useLod = tris(ld) < tris(out) * 0.5;
  if (useLod) await io.write(join(root, lodFile), ld);
  else if (existsSync(join(root, lodFile))) unlinkSync(join(root, lodFile));

  // Klipler soldier şablonundan: kalça konum izi bu oranla ölçeklenir (yeni kalça yüksekliği / eski)
  const hipRatio = +(target.Hips.y / hipOld).toFixed(4);
  data[id] = {
    file,
    materials,
    clips: [],
    clipsFrom: 'soldier',
    hipRatio,
    natural: true,
    tris: Math.round(tris(out)),
    bytes: statSync(join(root, file)).size + Object.values(materials).flatMap((m) => Object.values(m)).filter(Boolean).reduce((s, f) => s + statSync(join(root, f)).size, 0),
    lod: useLod ? { file: lodFile, tris: Math.round(tris(ld)), bytes: statSync(join(root, lodFile)).size } : null,
    credit: { title: credit.title || '', author: credit.author || '', license: credit.license || '', source: credit.source || '' },
  };
  console.log(`${id}: ${data[id].tris} üçgen (uzak ${data[id].lod?.tris ?? 'yok'}), ${(data[id].bytes / 1024).toFixed(0)} KB, kalça oranı ${hipRatio}, boy ölçeği ${scale.toFixed(3)}`);
}
writeFileSync(dataFile, JSON.stringify(data, null, 2) + '\n');
console.log('sha256', createHash('sha256').update(readFileSync(join(repo, SOURCE))).digest('hex'));
