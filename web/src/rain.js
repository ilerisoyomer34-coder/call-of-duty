// Yağmur çizgileri: kameranın çevresindeki kutuda düşen kısa çizgiler (LineSegments, tek çizim çağrısı, ışık eklemez).
// Damlalar dünya koordinatında tutulur; kutunun dışına çıkan ya da yere inen damla karşı kenardan/tepeden yeniden
// girer. Her karede yalnız aynı dizi yazılır (bellek ayrılmaz).
import * as THREE from 'three';
import { RAIN } from './config.js';
import { rand } from './util.js';

export function rainStreaks(scene, quality) {
  const n = Math.round(RAIN.count * (quality === 'low' ? RAIN.lowMult : 1));
  const R = RAIN.radius;
  const H = RAIN.height;
  const drops = new Float32Array(n * 4); // x, y, z, hız
  const pos = new Float32Array(n * 6);
  const geo = new THREE.BufferGeometry();
  const attr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', attr);
  const mat = new THREE.LineBasicMaterial({ color: RAIN.color, transparent: true, opacity: RAIN.opacity, depthWrite: false });
  const lines = new THREE.LineSegments(geo, mat);
  // Kutu kameraya bağlı: sınır kutusu hesaplanmaz, hep çizilir
  lines.frustumCulled = false;
  lines.castShadow = false;
  lines.receiveShadow = false;
  scene.add(lines);
  let ready = false;
  const [wx, wz] = RAIN.wind;
  const place = (i, c, top) => {
    drops[i * 4] = c.x + rand(-R, R);
    drops[i * 4 + 1] = top ? c.y + H * rand(0.5, 1) : c.y + rand(-H * 0.3, H);
    drops[i * 4 + 2] = c.z + rand(-R, R);
    drops[i * 4 + 3] = rand(RAIN.speed[0], RAIN.speed[1]);
  };
  // Kutuyu çevreleyen kenarlardan sarma: kamera yürüyünce yağmur seyrelmez
  const wrap = (v, c) => (v < c - R ? v + 2 * R : v > c + R ? v - 2 * R : v);
  return {
    rate: 0,
    spawn() {},
    tick(dt, c) {
      if (!ready) {
        for (let i = 0; i < n; i++) place(i, c, false);
        ready = true;
      }
      const L = RAIN.length;
      for (let i = 0; i < n; i++) {
        const k = i * 4;
        const v = drops[k + 3];
        let y = drops[k + 1] - v * dt;
        if (y < Math.max(0, c.y - H * 0.4)) {
          place(i, c, true);
          y = drops[k + 1];
        }
        const x = wrap(drops[k] + wx * dt, c.x);
        const z = wrap(drops[k + 2] + wz * dt, c.z);
        drops[k] = x;
        drops[k + 1] = y;
        drops[k + 2] = z;
        // Çizgi düşüş yönünde: alt uç damla, üst uç rüzgârın tersine ve yukarıda
        const j = i * 6;
        pos[j] = x;
        pos[j + 1] = y;
        pos[j + 2] = z;
        pos[j + 3] = x - (wx / v) * L;
        pos[j + 4] = y + L;
        pos[j + 5] = z - (wz / v) * L;
      }
      attr.needsUpdate = true;
    },
  };
}
