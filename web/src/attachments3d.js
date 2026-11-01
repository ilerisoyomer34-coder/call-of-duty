// Silah eklentilerinin görünümü (data/attachments.json → model/camo): birinci şahıs silah modeli (viewmodel.js) ve
// teçhizat ekranının önizlemesi (weaponIcons.js → WeaponPreview) aynı parçaları kurar. Silah uzayı: -Z namlu.
// Bağlanma noktaları modelin kendi kayıtlarından (rigFor / kodla kurulan modelin noktaları): namlu ucu, nişan
// noktası, sol elin kundak noktası, şarjör parçası. Parçalar kodla kurulur (az üçgen, ışık eklemez); geri alınabilir
// (restoreAttachments): eklenti değişince model yeniden yüklenmez. Optik modelleri opticModels.js'te; optiğin
// yüksekliği ve montaj ayakları silahın gövdesinden ölçülür (gövdeye girmez, boşlukta durmaz). Kamuflaj eklentilere de
// sürülür (kullanıcı isteği "onları da boyayalım"; lastik, vida ve cam hariç).
import * as THREE from 'three';
import { ATTACHMENTS, ATT_CATS } from '../shared/sim/mods.js';
import { SIGHT_TYPES } from './sights.js';
import { buildOpticModel, opticMaterials, revolve, rbox } from './opticModels.js';
import { OPTIC_FIT } from './config.js';

function materials() {
  return opticMaterials();
}

function cylX(g, r, h, x, y, z, mat, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);
  m.rotation.z = Math.PI / 2;
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

// Namlu ucu (köken namlu ağzı, eksen -Z) → uzunluk
//   can: susturucu: altıgen bağlantı bileziği, pahlı gövde, tırtıllı kavrama halkaları, ön kapakta çıkış deliği
//   brake: kompansatör: pahlı gövde, iki yanda üçer yarık, üstte iki gaz deliği
//   hider: alev gizleyici: bilezik + dört kanatlı kafes, ön halka
function buildMuzzle(g, spec, at) {
  const M = materials();
  const d = new THREE.Group();
  d.position.copy(at);
  const { r, len } = spec;
  if (spec.kind === 'can') {
    const hex = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r * 0.8, 0.018, 6), M.edge);
    hex.rotation.x = Math.PI / 2;
    hex.position.z = -0.009;
    d.add(hex);
    revolve(d, [[r * 0.8, 0.018], [r * 0.96, 0.021], [r, 0.026], [r, len - 0.01], [r * 0.96, len - 0.004], [r * 0.9, len], [r * 0.3, len], [r * 0.24, len - 0.004]], M.body, 0, 36);
    for (let i = 0; i < 4; i++) revolve(d, [[r * 1.012, 0.034 + i * 0.008], [r * 1.012, 0.038 + i * 0.008]], M.knurl, 0, 28);
    revolve(d, [[r * 1.006, len - 0.03], [r * 1.006, len - 0.026]], M.edge, 0, 36);
  } else if (spec.kind === 'brake') {
    revolve(d, [[r * 0.82, 0], [r * 0.96, 0.003], [r, 0.006], [r, len - 0.006], [r * 0.92, len - 0.002], [r * 0.8, len], [r * 0.32, len]], M.body, 0, 32);
    const dark = M.knurl;
    for (const s of [-1, 1]) for (const k of [0.3, 0.5, 0.7]) rbox(d, 0.004, r * 1.1, 0.0065, s * (r - 0.0012), 0, -len * k, dark, 0.0012);
    for (const k of [0.38, 0.62]) {
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.0028, 0.004, 12), dark);
      hole.position.set(0, r - 0.0012, -len * k);
      d.add(hole);
    }
  } else {
    revolve(d, [[r * 0.85, 0], [r * 1.0, 0.004], [r * 1.02, 0.016], [r * 0.96, 0.02]], M.body, 0, 28);
    // Kafes kanatları: dört yanda, öne doğru biraz açılan dar çubuklar
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      const p = new THREE.Group();
      p.rotation.z = a;
      rbox(p, 0.0045, 0.0032, len - 0.022, 0, r * 0.98, -0.02 - (len - 0.022) / 2, M.body, 0.001);
      d.add(p);
    }
    revolve(d, [[r * 1.04, len - 0.006], [r * 1.08, len - 0.004], [r * 1.08, len], [r * 0.86, len], [r * 0.86, len - 0.006]], M.body, 0, 28);
  }
  g.add(d);
  return len;
}

// Silahın gövdesinin üst yüzü nişan noktasının önünde (t: öne uzaklık, m): optik ve ayakları gövdeye göre yerleşir.
// Gizli parçalar (silahın kendi optiği), şarjör, cam ve ışık noktaları sayılmaz. → topAt(t) (silah uzayında y) ya da null
function bodyTops(root, sight, len, skip) {
  const F = OPTIC_FIT;
  const n = Math.ceil((len + 0.03) / F.step) + 2;
  const tops = new Float32Array(n).fill(-Infinity);
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const M = new THREE.Matrix4();
  const v = new THREE.Vector3();
  let any = false;
  const shown = (o) => {
    for (let p = o; p && p !== root; p = p.parent) if (!p.visible) return false;
    return true;
  };
  root.traverse((o) => {
    if (!o.isMesh || skip.has(o) || !shown(o)) return;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!mat || mat.isMeshBasicMaterial || mat.transparent) return;
    M.multiplyMatrices(inv, o.matrixWorld);
    const P = o.geometry.attributes.position;
    const stride = Math.max(1, Math.ceil(P.count / 40000));
    for (let i = 0; i < P.count; i += stride) {
      v.fromBufferAttribute(P, i).applyMatrix4(M);
      if (Math.abs(v.x - sight.x) > F.halfW) continue;
      const t = sight.z - v.z;
      if (t < -0.01 || t > len + 0.02) continue;
      const k = Math.round((t + 0.01) / F.step);
      if (v.y > tops[k]) {
        tops[k] = v.y;
        any = true;
      }
    }
  });
  if (!any) return null;
  return (t) => {
    const k = Math.round((t + 0.01) / F.step);
    let y = -Infinity;
    for (let j = Math.max(0, k - 1); j <= Math.min(n - 1, k + 1); j++) y = Math.max(y, tops[j]);
    return y;
  };
}

// Optik: model (opticModels.js) nişan noktasına; yüksekliği gövdeye girmeyecek kadar (demir nişangâhta en az gez
// üstü), montaj ayakları gövdenin üst yüzüne dek. → kaldırma (m)
function buildOptic(g, att, a, skip) {
  const sight = SIGHT_TYPES[att.sight] || {};
  const spec = att.model;
  const o = buildOpticModel(spec, sight);
  const len = spec.len || 0.06;
  const topAt = bodyTops(a.root, a.sight, len, skip);
  let lift;
  if (topAt) {
    lift = -Infinity;
    for (let t = 0; t <= len; t += OPTIC_FIT.step) {
      const top = topAt(t);
      if (top > -Infinity) lift = Math.max(lift, top + OPTIC_FIT.clear + o.below(t) - a.sight.y);
    }
    if (lift === -Infinity) lift = a.ironSight ? spec.lift : 0;
    lift = a.ironSight ? Math.max(lift, OPTIC_FIT.minIronLift) : Math.max(lift, 0);
  } else lift = a.ironSight ? spec.lift : 0;
  const axisY = a.sight.y + lift;
  o.group.position.set(a.sight.x, axisY, a.sight.z);
  g.add(o.group);
  // Montaj ayakları: optiğin altından gövdenin üst yüzüne (biraz gömülü); yanda kelepçe vidası. İki halkalı optikte
  // halkalar tek parça montaj plakasıyla birleşir, ayaklar plakadan iner (ince ayak gibi durmasın)
  const M = materials();
  const z0 = a.sight.z - 0.004;
  let feet = o.feet.map((f) => ({ ...f, top: axisY + f.y }));
  if (feet.length > 1) {
    const top = Math.min(...feet.map((f) => f.top));
    const t0 = Math.min(...feet.map((f) => f.t - f.d / 2));
    const t1 = Math.max(...feet.map((f) => f.t + f.d / 2));
    rbox(g, OPTIC_FIT.plateW, OPTIC_FIT.plateH, t1 - t0, a.sight.x, top - OPTIC_FIT.plateH / 2, z0 - (t0 + t1) / 2, M.body, 0.0015);
    feet = feet.map((f) => ({ ...f, top: top - OPTIC_FIT.plateH + 0.001, w: OPTIC_FIT.plateW * 0.9 }));
  }
  for (const f of feet) {
    const under = topAt ? topAt(f.t) : -Infinity;
    const bottom = under > -Infinity ? Math.max(under - OPTIC_FIT.sink, f.top - OPTIC_FIT.maxFoot) : f.top - 0.006;
    const h = f.top - bottom;
    if (h < 0.0015) continue;
    const z = z0 - f.t;
    rbox(g, f.w, h, f.d, a.sight.x, bottom + h / 2, z, M.body, 0.0015);
    cylX(g, 0.0022, f.w + 0.006, a.sight.x, bottom + Math.min(h * 0.4, 0.006), z, M.screw, 10);
  }
  return lift;
}

// Alt kundak: kundağın alt yüzüne (modelin köşelerinden ölçülür), sol elin önüne (el tutamağın içine girmesin).
// at: { x, z: kundak ekseni ve tutamağın yeri, bottom: kundağın alt yüzü, side: sağ yüz, mid: eksen yüksekliği }
//   vgrip: parmak yuvalı dikey tutamak (dönel profil), kızak kelepçesi ve vidası
//   agrip: açılı tutamak (yandan kama profili, pahlı)
//   laser: köşeleri yuvarlak gövde, iki mercek (görünür lazer kırmızı, kızılötesi koyu), arkada basma düğmesi
function buildUnder(g, spec, at) {
  const M = materials();
  const y = at.bottom;
  if (spec.kind === 'vgrip') {
    rbox(g, 0.024, 0.014, 0.05, at.x, y - 0.004, at.z, M.body, 0.002); // kızak (kundağa biraz gömülü)
    cylX(g, 0.0022, 0.03, at.x, y - 0.006, at.z + 0.012, M.screw);
    const prof = [[0.0, -0.0], [0.011, -0.0], [0.0125, -0.006], [0.012, -0.018], [0.0136, -0.027], [0.0118, -0.036], [0.0136, -0.045], [0.0118, -0.054], [0.0134, -0.063], [0.0142, -0.072], [0.0142, -0.077], [0.011, -0.08], [0.0, -0.08]];
    const geo = new THREE.LatheGeometry(prof.map(([r, h]) => new THREE.Vector2(r, h)), 24);
    const grip = new THREE.Mesh(geo, M.polymer);
    grip.position.set(at.x, y - 0.011, at.z);
    g.add(grip);
  } else if (spec.kind === 'agrip') {
    rbox(g, 0.024, 0.012, 0.072, at.x, y - 0.004, at.z, M.body, 0.002);
    const sh = new THREE.Shape();
    sh.moveTo(0.036, 0);
    sh.lineTo(-0.036, 0);
    sh.lineTo(-0.036, -0.016);
    sh.quadraticCurveTo(-0.034, -0.03, -0.022, -0.031);
    sh.lineTo(0.03, -0.007);
    sh.lineTo(0.036, 0);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.0018, bevelSegments: 2, curveSegments: 6 });
    geo.translate(0, 0, -0.01);
    geo.rotateY(Math.PI / 2);
    const m = new THREE.Mesh(geo, M.polymer);
    m.position.set(at.x, y - 0.009, at.z);
    g.add(m);
  } else if (spec.kind === 'laser') {
    const x = at.side + 0.0095;
    rbox(g, 0.019, 0.022, 0.056, x, at.mid, at.z, M.polymer, 0.004);
    rbox(g, 0.008, 0.014, 0.04, x - 0.009, at.mid, at.z, M.body, 0.0015); // kızak kelepçesi
    const red = new THREE.Mesh(new THREE.CircleGeometry(0.0038, 14), M.emitter);
    red.position.set(x, at.mid + 0.0045, at.z - 0.0285);
    red.rotation.y = Math.PI;
    g.add(red);
    const ir = new THREE.Mesh(new THREE.CircleGeometry(0.0034, 14), M.knurl);
    ir.position.set(x, at.mid - 0.0045, at.z - 0.0285);
    ir.rotation.y = Math.PI;
    g.add(ir);
    rbox(g, 0.012, 0.012, 0.004, x, at.mid, at.z + 0.029, M.rubber, 0.002); // basma düğmesi
  }
}

// Kundağın bu z'deki kesiti: alt yüz, sağ yüz (modelin köşeleri; şarjör ve eklentiler hariç)
function foreSection(root, z, x0, mag) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const M = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const ys = [];
  const xs = [];
  const skip = new Set();
  mag?.traverse((o) => skip.add(o));
  root.traverse((o) => {
    if (!o.isMesh || skip.has(o) || o.userData.attPart || o.parent?.name === 'attachments') return;
    M.multiplyMatrices(inv, o.matrixWorld);
    const P = o.geometry.attributes.position;
    const step = Math.max(1, Math.floor(P.count / 4000));
    for (let i = 0; i < P.count; i += step) {
      v.fromBufferAttribute(P, i).applyMatrix4(M);
      if (Math.abs(v.z - z) > 0.03 || Math.abs(v.x - x0) > 0.05) continue;
      ys.push(v.y);
      xs.push(v.x);
    }
  });
  if (ys.length < 8) return null;
  ys.sort((a, b) => a - b);
  xs.sort((a, b) => a - b);
  const q = (arr, k) => arr[Math.min(arr.length - 1, Math.floor(arr.length * k))];
  // Uç köşeler (askı halkası, vida) yüzeyi aşağı çekmesin: alt yüzün %10 yüzdeliği
  return { bottom: q(ys, 0.1), top: q(ys, 0.97), side: q(xs, 0.97) };
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
    // Sıkıştırılmış (normalize tamsayı) konumlar düz sayıya açılır: yoksa uzatılan köşeler kırpılıp şarjör bozuluyordu
    const src = geo.attributes.position;
    const f = new Float32Array(src.count * 3);
    for (let i = 0; i < src.count; i++) {
      f[i * 3] = src.getX(i);
      f[i * 3 + 1] = src.getY(i);
      f[i * 3 + 2] = src.getZ(i);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(f, 3));
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

// Kamuflaj: silahın ve eklentilerin malzemeleri bir kez kopyalanır (asıl saklanır, aynı malzemenin kopyası paylaşılır),
// düz renk sürülür; altın metalik ve parlak. Lastik, vida (userData.noCamo), cam ve ışıklı parçalar boyanmaz
function paint(root, camo) {
  const made = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    const out = list.map((m) => {
      if (!m || !m.color) return m;
      const base = m.userData.camoBase || m;
      if (!camo) return base;
      if (base.transparent || base.isMeshBasicMaterial || base.userData.noCamo) return base;
      let c = made.get(base);
      if (!c) {
        c = base.clone();
        c.userData = { ...base.userData, camoBase: base };
        // Boya kaplama: renk dokusu yerine düz renk (koyu dokuyla çarpınca renk görünmüyordu); yüzey ayrıntısı
        // normal ve pürüz dokularından kalır
        c.map = null;
        c.color.setRGB(camo.color[0], camo.color[1], camo.color[2]);
        if (camo.metal !== undefined && 'metalness' in c) c.metalness = camo.metal;
        if (camo.rough !== undefined && 'roughness' in c) c.roughness = camo.rough;
        made.set(base, c);
      }
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
  paint(a.root, null);
}

/**
 * Eklentileri kur. a: { root, muzzle, sight, fore (kundak noktası), palmZ?, mag?, optic?, ironSight, scopedBase }
 * (silah uzayında). scopedBase: silahın kendi dürbünü var ve ayrı parça değil (dürbün eklentisi yalnız işareti ve
 * büyütmeyi değiştirir, model eklenmez).
 * → { muzzleLen, optic: eklenti | null, sightLift }
 */
export function applyAttachments(a, mods) {
  restoreAttachments(a);
  const out = { muzzleLen: 0, optic: null, sightLift: 0 };
  if (!mods) return out;
  const g = new THREE.Group();
  g.name = 'attachments';
  // Ölçümde sayılmayanlar: şarjör (uzatılmış şarjör sonra değişir)
  const skip = new Set();
  a.mag?.traverse((o) => skip.add(o));
  for (const cat of ATT_CATS) {
    const id = mods[cat];
    const att = id && ATTACHMENTS[id];
    if (!att || !att.model) continue;
    const spec = att.model;
    if (cat === 'muzzle' && a.muzzle) out.muzzleLen = buildMuzzle(g, spec, a.muzzle);
    else if (cat === 'optic' && a.sight) {
      out.optic = att;
      // Kendi dürbünü gövdenin parçası olan silah: yalnız işaret ve büyütme
      if (a.scopedBase && !a.optic) continue;
      // Silahın kendi optiği gizlenir; yükseklik gövdeden ölçülür
      if (a.optic) a.optic.visible = false;
      out.sightLift = buildOptic(g, att, a, skip);
    } else if (cat === 'underbarrel' && a.fore) {
      // Kundak noktasının (ve sol avucun) önü; kesit modelden
      const z = Math.min(a.fore.z, a.palmZ ?? a.fore.z) - (spec.kind === 'laser' ? 0.06 : 0.075);
      const sec = foreSection(a.root, z, a.fore.x, a.mag);
      if (sec) buildUnder(g, spec, { x: a.fore.x, z, bottom: sec.bottom, side: sec.side, mid: (sec.bottom + sec.top) / 2 });
    } else if (cat === 'magazine' && a.mag) {
      if (spec.kind === 'magstretch') stretchMag(a.root, a.mag, spec.k);
      else if (spec.kind === 'magtape') tapeMag(a.mag);
    }
  }
  a.root.add(g);
  a.attGroup = g;
  // Kamuflaj silaha ve eklentilerine
  const camo = mods.camo && ATTACHMENTS[mods.camo]?.camo;
  if (camo) paint(a.root, camo);
  return out;
}
