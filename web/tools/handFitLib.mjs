// Silah başına el oturtma (tools/fit-hands.mjs ve tests/hand-fit.test.mjs ortak kullanır). Avuç, kavranan parçanın
// gerçek yüzeyine oturur: WEAPON_AIM'deki left/right yalnız "nerede ölçülsün" ipucudur. Dikey parçalarda (kabza, ön
// tutamak) kesitin merkezleri iki yükseklikte ölçülür; eğimden işaret parmağı ekseni (index) çıkar, el kabzanın
// açısına göre döner.
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WEAPONS, WEAPON_ORDER, WEAPON_AIM, HAND_HOLDS } from '../src/config.js';
import ASSETS from '../src/weaponAssets.json' with { type: 'json' };
import { buildWeapon } from '../src/models.js';
import { gripQuaternion } from '../src/weaponAim.js';

// Avuç yüzeyinin el tabanından uzaklığı (fps-arms.glb: avuç merkezinde y ≈ −0,035; biraz bastırılmış tutuş)
export const PALM_GAP = 0.03;
// Dikey parçanın kesiti: ipucunun çevresinde aranır, ölçüm yükseklikleri ipucunun altında/üstünde
const SCAN = { span: 0.07, step: 0.002, rowStep: 0.004, reach: 0.08, minRows: 5, trim: 0.2, maxMiss: 0.02, maxDepth: 0.075,
  rake: { firing: [0.15, 0.5], vertical: [-0.15, 0.25] }, sideReach: 0.3, maxHalf: 0.045, stockHalf: 0.002, gripReach: 0.12, underReach: 0.4,
  crop: new THREE.Vector3(0.08, 0.16, 0.09) };

const loader = new GLTFLoader();
const ray = new THREE.Raycaster();
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();

export async function loadWeaponModel(id) {
  const d = WEAPONS[id];
  if (d.model !== 'glb') {
    const m = buildWeapon(id);
    return { root: m.root, muzzle: m.muzzle };
  }
  const a = ASSETS[d.asset || id];
  const bytes = readFileSync(new URL(`../${a.file}`, import.meta.url));
  const root = (await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
  return { root, muzzle: new THREE.Vector3().fromArray(a.points.muzzle || [0, 0.05, -0.6]) };
}

// Görünür, opak yüzeyler (namlu alevi, cam, işaret düzlemleri sayılmaz)
function solids(root) {
  const out = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (m?.transparent || /flash/i.test(o.name)) return;
    out.push(o);
  });
  return out;
}

// Ölçüm yalnız elin çevresinde: o kutuya değen üçgenler tek bir (dünya uzayında) mesh'e kopyalanır. Yüz binlerce
// üçgenli modellerde binlerce ışın böyle saniyeler sürer (yoksa dakikalar)
function crop(meshes, center, half) {
  const box = new THREE.Box3(center.clone().sub(half), center.clone().add(half));
  const out = [], tri = new THREE.Triangle(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (const m of meshes) {
    const pos = m.geometry.attributes.position, idx = m.geometry.index;
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i += 3) {
      const k = (j) => (idx ? idx.getX(i + j) : i + j);
      a.fromBufferAttribute(pos, k(0)).applyMatrix4(m.matrixWorld);
      b.fromBufferAttribute(pos, k(1)).applyMatrix4(m.matrixWorld);
      c.fromBufferAttribute(pos, k(2)).applyMatrix4(m.matrixWorld);
      tri.set(a, b, c);
      if (box.intersectsTriangle(tri)) out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.updateMatrixWorld(true);
  return { meshes: [mesh], tris: new Float32Array(out) };
}

function cast(meshes, origin, dir, far = 1) {
  ray.set(origin, dir);
  ray.far = far;
  return ray.intersectObjects(meshes, false)[0]?.point || null;
}

// Dikey parçanın (kabza, ön tutamak) y yüksekliğindeki kesiti: üçgenler y düzlemiyle kesilir, |x| < maxHalf içinde
// kalan parçaların z aralıkları birleştirilir; ipucuna en yakın kesintisiz dolu aralık parçanın kendisidir (öndeki
// şarjör ya da tetik korkuluğu ayrı aralık kalır). Kabzadan derin aralık (dipçiğe, gövdeye karışmış kesit) sayılmaz.
function sectionRun(tris, y, hintZ) {
  const spans = [];
  const pts = [];
  for (let i = 0; i < tris.length; i += 9) {
    pts.length = 0;
    for (const [u, v] of [[0, 3], [3, 6], [6, 0]]) {
      const ay = tris[i + u + 1], by = tris[i + v + 1];
      if ((ay - y) * (by - y) > 0 || ay === by) continue;
      const t = (y - ay) / (by - ay);
      pts.push(tris[i + u] + (tris[i + v] - tris[i + u]) * t, tris[i + u + 2] + (tris[i + v + 2] - tris[i + u + 2]) * t);
    }
    if (pts.length < 4) continue;
    // Kesit parçası [x0,z0]→[x1,z1]; |x| < maxHalf içindeki bölümü
    let [x0, z0, x1, z1] = pts;
    const clip = (xa, za, xb, zb) => {
      const lim = SCAN.maxHalf;
      if (Math.abs(xa) >= lim && Math.abs(xb) >= lim && Math.sign(xa) === Math.sign(xb)) return null;
      const at = (x) => za + ((zb - za) * (x - xa)) / (xb - xa || 1e-9);
      const zs = [za, zb].filter((_, k) => Math.abs([xa, xb][k]) < lim);
      for (const x of [-lim, lim]) if ((xa - x) * (xb - x) < 0) zs.push(at(x));
      return zs.length ? [Math.min(...zs), Math.max(...zs)] : null;
    };
    const span = clip(x0, z0, x1, z1);
    if (span && span[1] > hintZ - SCAN.span && span[0] < hintZ + SCAN.span) spans.push(span);
  }
  if (!spans.length) return null;
  spans.sort((a, b) => a[0] - b[0]);
  const runs = [];
  for (const [z0, z1] of spans) {
    const r = runs.at(-1);
    if (r && z0 <= r.z1 + SCAN.step) r.z1 = Math.max(r.z1, z1);
    else runs.push({ z0, z1 });
  }
  const dist = (r) => (hintZ < r.z0 ? r.z0 - hintZ : hintZ > r.z1 ? hintZ - r.z1 : 0);
  const r = runs.sort((a, b) => dist(a) - dist(b))[0];
  return dist(r) < SCAN.maxMiss && r.z1 - r.z0 <= SCAN.maxDepth ? { y, z: (r.z0 + r.z1) / 2 } : null;
}

// Kabzanın boyu: ipucu yüksekliğinden yukarı ve aşağı kesit sürdükçe; uçlar (tetik korkuluğu geçişi, kabza dibi)
// kırpılıp ortadaki kesitlerden doğru uydurulur → eğim (dz/dy) ve ipucu yüksekliğindeki merkez
function gripLine(tris, hint) {
  const at = (y) => sectionRun(tris, y, hint.z);
  const pts = [];
  for (const dir of [1, -1]) {
    for (let k = dir > 0 ? 0 : 1; k * SCAN.rowStep <= SCAN.reach; k++) {
      const p = at(hint.y + dir * k * SCAN.rowStep);
      if (!p) break;
      dir > 0 ? pts.unshift(p) : pts.push(p);
    }
  }
  if (pts.length < SCAN.minRows) return null;
  const cut = Math.floor(pts.length * SCAN.trim);
  const mid = pts.slice(cut, pts.length - cut);
  const my = mid.reduce((n, p) => n + p.y, 0) / mid.length, mz = mid.reduce((n, p) => n + p.z, 0) / mid.length;
  const slope = mid.reduce((n, p) => n + (p.y - my) * (p.z - mz), 0) / mid.reduce((n, p) => n + (p.y - my) ** 2, 0);
  return { slope, center: new THREE.Vector3(0, hint.y, mz + slope * (hint.y - my)) };
}

// Avuç merkezi: merkezden el sırtı yönünde dışarıdan içeri ışın, ilk yüzeyden avuç kalınlığı kadar geri
// Dikey kabzada ışın kısa tutulur: el sırtı yönü biraz eğik olduğundan uzaktan atılan ışın ince tutamağı (minigun) ıskalar
function palmOn(meshes, center, q, reach) {
  const back = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  const from = center.clone().addScaledVector(back, reach);
  const hit = cast(meshes, from, back.clone().negate(), reach + 0.1);
  return hit ? hit.addScaledVector(back, PALM_GAP) : null;
}

const round = (v) => v.toArray().map((x) => Math.round(x * 10000) / 10000);

// Bir silahın iki eli. Dönüş: { left, right, leftIndex?, rightIndex?, notes[] }
export function fitWeapon(id, model) {
  const a = WEAPON_AIM[id];
  const all = solids(model.root);
  const out = { notes: [] };
  for (const [side, key, holdName] of [[-1, 'left', a.hold], [1, 'right', a.trigger || 'firing']]) {
    const hint = new THREE.Vector3().fromArray(a[key]);
    const { meshes, tris } = crop(all, new THREE.Vector3(0, hint.y, hint.z), SCAN.crop);
    const hold = { ...HAND_HOLDS[holdName] };
    let center = null;
    if (holdName === 'vertical' || holdName === 'firing') {
      // Kabzanın eğimi (dz/dy < 0: yukarı doğru öne yatık) gerçek kabzalardaki aralığa sıkıştırılır; avuç kabzanın el
      // sırtı tarafındaki yüzünde, ipucu yüksekliğinde
      const line = gripLine(tris, hint);
      if (line) {
        const [lo, hi] = SCAN.rake[holdName];
        const rake = Math.min(hi, Math.max(lo, Math.atan(-line.slope)));
        hold.index = round(new THREE.Vector3(0, Math.cos(rake), -Math.sin(rake)));
        center = line.center;
      } else out.notes.push(`${key}: kesit bulunamadı`);
    } else if (holdName === 'under' || holdName === 'stock') {
      // Kundak/dipçik bileği: namlu ekseninde (dipçikte ipucunun yüksekliğinde) merkez, avuç alt-yan yüzde
      center = new THREE.Vector3(0, holdName === 'under' ? model.muzzle.y : hint.y, hint.z);
      if (holdName === 'stock') {
        // Dipçik bileği: avuç alt yüz hizasında, parmaklar alttan sarar; daha yukarıda el nişan hattına girer
        // (üstten ölçmek dürbüne/gövdeye çarpar)
        const bottom = cast(meshes, _o.set(0, hint.y - 0.3, hint.z), _d.set(0, 1, 0), 0.6);
        if (bottom) center.y = bottom.y + SCAN.stockHalf;
      }
    }
    // 'cup' (tabancada destek eli) sağ elin üstüne kapanır: silah yüzeyi değil, ipucu kullanılır
    const reach = holdName === 'vertical' || holdName === 'firing' ? SCAN.gripReach : SCAN.underReach;
    let palm = center ? palmOn(meshes, center, gripQuaternion(hold, side), reach) : null;
    if (!palm) {
      if (holdName !== 'cup') out.notes.push(`${key}: yüzey yok, ipucu kaldı`);
      palm = hint;
    }
    out[key] = round(palm);
    if (hold.index !== HAND_HOLDS[holdName].index) out[`${key}Index`] = hold.index;
  }
  return out;
}

export async function fitAll() {
  const fit = {};
  for (const id of WEAPON_ORDER) {
    if (WEAPONS[id].melee || !WEAPON_AIM[id].left) continue;
    fit[id] = fitWeapon(id, await loadWeaponModel(id));
  }
  return fit;
}
