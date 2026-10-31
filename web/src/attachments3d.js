// Silah eklentilerinin görünümü (data/attachments.json → model/camo): birinci şahıs silah modeli (viewmodel.js) ve
// teçhizat ekranının önizlemesi (weaponIcons.js → WeaponPreview) aynı parçaları kurar. Silah uzayı: -Z namlu.
// Bağlanma noktaları modelin kendi kayıtlarından (rigFor / kodla kurulan modelin noktaları): namlu ucu, nişan
// noktası, sol elin kundak noktası, şarjör parçası. Parçalar kodla kurulur (az üçgen, ışık eklemez); geri alınabilir
// (restoreAttachments): eklenti değişince model yeniden yüklenmez.
import * as THREE from 'three';
import { ATTACHMENTS, ATT_CATS } from '../shared/sim/mods.js';
import { SIGHT_TYPES } from './sights.js';
import { housingMesh } from './reticles.js';

let mats = null;
function materials() {
  if (mats) return mats;
  mats = {
    body: new THREE.MeshStandardMaterial({ color: 0x1c1e20, roughness: 0.5, metalness: 0.55 }),
    polymer: new THREE.MeshStandardMaterial({ color: 0x202224, roughness: 0.78, metalness: 0.08 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x0b0c0d, roughness: 0.6, metalness: 0.3 }),
    tape: new THREE.MeshStandardMaterial({ color: 0x3b3a2c, roughness: 0.9, metalness: 0 }),
    lens: new THREE.MeshBasicMaterial({ color: 0xff3020, toneMapped: false }),
  };
  return mats;
}

function tube(g, r0, r1, len, z, mat, seg = 20) {
  const geo = new THREE.CylinderGeometry(r1, r0, len, seg);
  geo.rotateX(-Math.PI / 2); // eksen -Z: r0 arka, r1 ön
  const m = new THREE.Mesh(geo, mat);
  m.position.z = z - len / 2;
  g.add(m);
  return m;
}

function box(g, w, h, d, x, y, z, mat, rx = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.x = rx;
  g.add(m);
  return m;
}

// Namlu ucu: susturucu (uzun silindir), kompansatör (kısa, yan delikli), alev gizleyici (açılan uç). → uzunluk
function buildMuzzle(g, spec, at) {
  const M = materials();
  const d = new THREE.Group();
  d.position.copy(at);
  if (spec.kind === 'can') {
    tube(d, spec.r * 0.75, spec.r * 0.75, 0.012, 0, M.dark);
    tube(d, spec.r, spec.r, spec.len - 0.012, -0.012, M.body);
    tube(d, spec.r * 0.94, spec.r * 0.6, 0.006, -spec.len + 0.003, M.dark);
  } else if (spec.kind === 'brake') {
    tube(d, spec.r, spec.r, spec.len, 0, M.body);
    for (const s of [-1, 1]) for (const k of [0.3, 0.6]) box(d, 0.004, spec.r * 1.1, 0.008, s * spec.r * 0.85, 0, -spec.len * k, M.dark);
  } else {
    tube(d, spec.r * 0.9, spec.r * 1.25, spec.len, 0, M.body);
  }
  g.add(d);
  return spec.len;
}

// Optik: açık gövde (reticles.js → housingMesh; nişanda içinden bakılır) + ray kızağı. lift: nişan noktasının
// üstüne çıkılan yükseklik (demir nişangâhlı silahta optik gezin üstüne oturur)
function buildOptic(g, att, at, lift) {
  const spec = { ...SIGHT_TYPES[att.sight] };
  const h = { ...att.model };
  const o = housingMesh(h, spec);
  o.position.set(at.x, at.y + lift, at.z);
  g.add(o);
  const M = materials();
  const len = h.len || 0.06;
  const r = h.r || h.h / 2 || 0.016;
  const mountH = Math.max(0.006, lift + 0.004);
  box(g, 0.022, mountH, len * 0.7, at.x, at.y + lift - r - mountH / 2 + 0.002, at.z - len * 0.5, M.body);
  return o;
}

// Alt kundak: sol elin kundak noktasının önünde (el tutamağın içine girmesin)
function buildUnder(g, spec, at) {
  const M = materials();
  if (spec.kind === 'vgrip') {
    box(g, 0.024, 0.012, 0.05, at.x, at.y - 0.004, at.z - 0.1, M.body); // kızak
    box(g, 0.026, 0.078, 0.03, at.x, at.y - 0.05, at.z - 0.1, M.polymer);
    box(g, 0.03, 0.008, 0.034, at.x, at.y - 0.09, at.z - 0.1, M.dark);
  } else if (spec.kind === 'agrip') {
    box(g, 0.024, 0.012, 0.07, at.x, at.y - 0.004, at.z - 0.095, M.body);
    box(g, 0.024, 0.03, 0.07, at.x, at.y - 0.024, at.z - 0.1, M.polymer, -0.45);
  } else if (spec.kind === 'laser') {
    const x = at.x + 0.03;
    box(g, 0.018, 0.02, 0.055, x, at.y + 0.012, at.z - 0.11, M.polymer);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.004, 12), M.lens);
    lens.position.set(x, at.y + 0.016, at.z - 0.138);
    lens.rotation.y = Math.PI;
    g.add(lens);
  }
}

// Şarjörün köşeleri silah uzayında; üst bandın yüksekliği ve ekseni (alt uç − üst uç)
function magFrame(root, mag) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  let minY = Infinity;
  let maxY = -Infinity;
  const pts = [];
  const M = new THREE.Matrix4();
  mag.traverse((o) => {
    if (!o.isMesh) return;
    M.multiplyMatrices(inv, o.matrixWorld);
    const P = o.geometry.attributes.position;
    const step = Math.max(1, Math.floor(P.count / 600));
    for (let i = 0; i < P.count; i += step) {
      const p = new THREE.Vector3().fromBufferAttribute(P, i).applyMatrix4(M);
      pts.push(p);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  });
  if (pts.length < 4 || maxY - minY < 0.02) return null;
  const band = (maxY - minY) * 0.2;
  const top = new THREE.Vector3();
  const bot = new THREE.Vector3();
  let nt = 0;
  let nb = 0;
  for (const p of pts) {
    if (p.y >= maxY - band) {
      top.add(p);
      nt++;
    }
    if (p.y <= minY + band) {
      bot.add(p);
      nb++;
    }
  }
  top.divideScalar(nt);
  bot.divideScalar(nb);
  return { inv, top, axis: bot.sub(top), maxY, minY };
}

// Uzatılmış şarjör: şarjör ağları eksenleri boyunca üst ucundan uzatılır (geometri kopyası; asıl korunur)
function stretchMag(root, mag, k) {
  const F = magFrame(root, mag);
  if (!F) return;
  const len = F.axis.length();
  const ax = F.axis.clone().normalize();
  const M = new THREE.Matrix4();
  const Mi = new THREE.Matrix4();
  const v = new THREE.Vector3();
  mag.traverse((o) => {
    if (!o.isMesh) return;
    M.multiplyMatrices(F.inv, o.matrixWorld);
    Mi.copy(M).invert();
    o.userData.attGeo = o.userData.attGeo || o.geometry;
    const geo = o.userData.attGeo.clone();
    const P = geo.attributes.position;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(M);
      // Üst uçtan eksen boyunca uzaklık: üst uç yerinde, alt uç k kat uzakta
      const t = v.clone().sub(F.top).dot(ax);
      if (t > 0) v.addScaledVector(ax, t * (k - 1) * Math.min(1, t / (len * 0.25)));
      v.applyMatrix4(Mi);
      P.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    o.geometry = geo;
  });
}

// Hızlı şarjör: bantlı ikinci şarjör yanda (aynı geometri; şarjörün çocuğu olduğu için onunla birlikte hareket eder)
function tapeMag(mag) {
  const twin = mag.clone(true);
  twin.position.set(0, 0, 0);
  twin.quaternion.identity();
  twin.scale.set(1, 1, 1);
  const holder = new THREE.Group();
  holder.position.x = 0.032;
  holder.add(twin);
  holder.traverse((o) => {
    o.userData.attPart = true;
  });
  mag.add(holder);
}

// Kamuflaj: silahın her malzemesi bir kez kopyalanır (asıl renk saklanır), renk çarpılır; altın metalik ve parlak
function paint(root, camo, skip) {
  root.traverse((o) => {
    if (!o.isMesh || skip.has(o)) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    const out = list.map((m) => {
      if (!m || !m.color) return m;
      const base = m.userData.camoBase || m;
      if (!camo) return base;
      const c = base.clone();
      c.userData.camoBase = base;
      c.color.copy(base.color).multiply(new THREE.Color(camo.tint[0], camo.tint[1], camo.tint[2]));
      if (camo.metal !== undefined && 'metalness' in c) c.metalness = camo.metal;
      if (camo.rough !== undefined && 'roughness' in c) c.roughness = camo.rough;
      return c;
    });
    o.material = Array.isArray(o.material) ? out : out[0];
  });
}

// Önceki eklentileri geri al: parçalar kaldırılır, şarjör geometrisi ve renkler eski haline, optik parçası görünür
export function restoreAttachments(a) {
  if (a.attGroup) {
    a.attGroup.removeFromParent();
    a.attGroup = null;
  }
  if (a.mag) {
    a.mag.traverse((o) => {
      if (o.isMesh && o.userData.attGeo) {
        o.geometry = o.userData.attGeo;
        delete o.userData.attGeo;
      }
    });
    for (const c of [...a.mag.children]) if (c.userData.attPart) c.removeFromParent();
  }
  if (a.optic) a.optic.visible = true;
  paint(a.root, null, new Set());
}

/**
 * Eklentileri kur. a: { root, muzzle, sight, leftHand, mag?, optic?, ironSight } (silah uzayında noktalar).
 * → { muzzleLen, optic: eklenti | null, sightLift }
 */
export function applyAttachments(a, mods) {
  restoreAttachments(a);
  const out = { muzzleLen: 0, optic: null, sightLift: 0 };
  if (!mods) return out;
  const g = new THREE.Group();
  g.name = 'attachments';
  for (const cat of ATT_CATS) {
    const id = mods[cat];
    const att = id && ATTACHMENTS[id];
    if (!att || !att.model) continue;
    const spec = att.model;
    if (cat === 'muzzle' && a.muzzle) out.muzzleLen = buildMuzzle(g, spec, a.muzzle);
    else if (cat === 'optic' && a.sight) {
      // Silahın kendi optiği gizlenir; demir nişangâhlı silahta optik gezin üstüne çıkar
      if (a.optic) a.optic.visible = false;
      out.sightLift = a.ironSight ? spec.lift : 0;
      buildOptic(g, att, a.sight, out.sightLift);
      out.optic = att;
    } else if (cat === 'underbarrel' && a.leftHand) buildUnder(g, spec, a.leftHand);
    else if (cat === 'magazine' && a.mag) {
      if (spec.kind === 'magstretch') stretchMag(a.root, a.mag, spec.k);
      else if (spec.kind === 'magtape') tapeMag(a.mag);
    }
  }
  a.root.add(g);
  a.attGroup = g;
  // Kamuflaj silahın gövdesine (eklenti parçaları siyah kalır)
  const camo = mods.camo && ATTACHMENTS[mods.camo]?.camo;
  if (camo) {
    const skip = new Set();
    g.traverse((o) => o.isMesh && skip.add(o));
    paint(a.root, camo, skip);
  }
  return out;
}
