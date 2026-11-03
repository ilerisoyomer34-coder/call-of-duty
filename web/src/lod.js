// Sade modeller: uzaktaki ağaç gövdesi, tim askerinin elindeki ve yerde duran silah. Tam modelden türetilir; köşe
// dizileri aynı kalır, yalnız üçgen listesi meshoptimizer ile kısalır (doku, UV ve malzeme değişmez).
// Birinci şahıs görünümü tam modeli kullanmaya devam eder.
import * as THREE from 'three';
import { MeshoptSimplifier } from 'meshoptimizer/meshopt_simplifier.module.js';
import { LOD_MODELS } from './config.js';

// Sadeleştirici WebAssembly ile gelir (dosya içinde gömülü); hazır olana dek (ya da hiç) tam model kullanılır
let ready = false;
export const lodReady = MeshoptSimplifier.ready.then(
  () => (ready = true),
  () => false
);

export function lodAvailable() {
  return ready;
}

// geo: dizinli ya da dizinsiz BufferGeometry. ratio: hedef üçgen oranı, error: modelin boyuna göre en büyük hata.
// Dönüş: yeni geometri (öznitelikler paylaşılır, yalnız dizin yeni) ya da azaltılamıyorsa null.
// Sert yüzeyli modellerde keskin kenar ve doku dikişlerinde aynı noktada birden çok köşe var (normali/UV'si farklı;
// AK-74M'de 54 bin köşe, 13 bin nokta): sadeleştirici dikişte kenar daraltmadığı için model hiç azalmıyordu.
// Daraltma yalnız konumlara göre yapılır; sonra her üçgen köşesine o noktadaki köşelerden normali yüze en yakın
// olanı seçilir (gölgelendirme ve doku köşenin kendi yüzünden gelir)
export function simplifyGeometry(geo, ratio, error, minTris = 0) {
  if (!ready) return null;
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const n = pos.count;
  const index = geo.index ? geo.index.array : null;
  const count = index ? index.length : n;
  const target = Math.max(minTris, Math.floor((count / 3) * ratio)) * 3;
  if (target >= count) return null;
  // Aynı konumdaki köşeler tek noktada (nicemlenmiş Int16 konumlar da okunur: sadeleştirici Float32 ister)
  const weld = new Uint32Array(n);
  const groups = [];
  const coords = [];
  const seen = new Map();
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const key = `${x},${y},${z}`;
    let w = seen.get(key);
    if (w === undefined) {
      w = groups.length;
      seen.set(key, w);
      groups.push([i]);
      coords.push(x, y, z);
    } else groups[w].push(i);
    weld[i] = w;
  }
  const points = new Float32Array(coords);
  const tris = new Uint32Array(count);
  for (let t = 0; t < count; t++) tris[t] = weld[index ? index[t] : t];
  const [out] = MeshoptSimplifier.simplify(tris, points, 3, target, error);
  if (!out.length || out.length >= count * 0.95) return null;
  const idx = n > 65535 ? new Uint32Array(out.length) : new Uint16Array(out.length);
  for (let t = 0; t < out.length; t += 3) {
    const a = out[t] * 3;
    const b = out[t + 1] * 3;
    const c = out[t + 2] * 3;
    const ux = points[b] - points[a];
    const uy = points[b + 1] - points[a + 1];
    const uz = points[b + 2] - points[a + 2];
    const vx = points[c] - points[a];
    const vy = points[c + 1] - points[a + 1];
    const vz = points[c + 2] - points[a + 2];
    const fx = uy * vz - uz * vy;
    const fy = uz * vx - ux * vz;
    const fz = ux * vy - uy * vx;
    for (let k = 0; k < 3; k++) {
      const group = groups[out[t + k]];
      let best = group[0];
      if (nor && group.length > 1) {
        let bestDot = -Infinity;
        for (const v of group) {
          const d = nor.getX(v) * fx + nor.getY(v) * fy + nor.getZ(v) * fz;
          if (d > bestDot) {
            bestDot = d;
            best = v;
          }
        }
      }
      idx[t + k] = best;
    }
  }
  const g = new THREE.BufferGeometry();
  for (const k in geo.attributes) g.setAttribute(k, geo.attributes[k]);
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  g.userData.shared = true; // sahne atılırken silinmesin (şablon önbellekte)
  return g;
}

// Üçgen sayısı (dizinli/dizinsiz)
export function triangleCount(root) {
  let n = 0;
  root.traverse((o) => {
    if (o.isMesh) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
  });
  return n;
}

// Üçüncü şahıs silah: parçalar malzeme başına birleşir (bake: models.js → bakeStatic), her parça sadeleşir.
// Aynı silah için şablon bir kez kurulur; her çağrı geometrisi paylaşılan bir kopya döndürür
const guns = new Map();
export function lowPolyGun(assetId, load, bake) {
  if (!guns.has(assetId)) {
    guns.set(
      assetId,
      Promise.all([load(assetId), lodReady]).then(([scene]) => {
        const root = bake(scene);
        root.userData.baked = true;
        const L = LOD_MODELS.gun;
        // Üst sınır bütün silah için: parçalar üçgen payına göre aynı oranla küçülür
        const ratio = Math.min(L.ratio, L.maxTris / Math.max(1, triangleCount(root)));
        root.traverse((o) => {
          if (!o.isMesh) return;
          const tris = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
          const g = simplifyGeometry(o.geometry, ratio, L.error, Math.min(tris, L.minTris));
          if (g) o.geometry = g;
          else o.geometry.userData.shared = true;
        });
        return root;
      })
    );
  }
  return guns.get(assetId).then((t) => t.clone(true));
}
