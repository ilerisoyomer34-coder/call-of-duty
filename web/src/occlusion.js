// Yalnız bakılan yer: duvar ya da kat arkasındaki asker çizilmez. Saf kurallar (tests/occlusion.test.mjs);
// ışınlar oyunun çarpışma dünyasında (yapay zekânın görüşüyle aynı duvarlar)
import { OCCLUSION } from './config.js';

const _pts = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }];

// Askerin görünürlük örnek noktaları: baş, göğüs, diz ve göğüs hizasında iki omuz (kameraya dik yönde).
// body: { x, y, z, eyeH, chestH, radius }. Dönüş: paylaşılan dizi (bellek ayırmaz)
export function bodySamples(cam, body) {
  const { x, y, z } = body;
  let px = z - cam.z;
  let pz = -(x - cam.x);
  const len = Math.hypot(px, pz) || 1;
  const off = body.radius * OCCLUSION.side;
  px = (px / len) * off;
  pz = (pz / len) * off;
  set(_pts[0], x, y + body.eyeH, z);
  set(_pts[1], x, y + body.chestH, z);
  set(_pts[2], x, y + OCCLUSION.knee, z);
  set(_pts[3], x + px, y + body.chestH, z + pz);
  set(_pts[4], x - px, y + body.chestH, z - pz);
  return _pts;
}

function set(p, x, y, z) {
  p.x = x;
  p.y = y;
  p.z = z;
}

// Kameradan noktalardan biri görünüyor mu (los(a, b): arada duvar yoksa true)
export function anyVisible(cam, points, los) {
  for (const p of points) if (los(cam, p)) return true;
  return false;
}

// Gizleme kararı: görünür olunca hemen çizilir; art arda OCCLUSION.hideAfter sn görünmezse gizlenir (köşede
// titremesin). st: { unseen, hidden }; elapsed: önceki yoklamadan bu yana geçen süre
export function occlusionStep(st, seen, elapsed) {
  if (seen) {
    st.unseen = 0;
    st.hidden = false;
  } else {
    st.unseen += elapsed;
    if (st.unseen >= OCCLUSION.hideAfter) st.hidden = true;
  }
  return st.hidden;
}

// Sonraki yoklamaya kalan süre: uzaktaki asker daha seyrek; askerler aynı karede toplanmasın diye ±%20
export function occlusionInterval(dist, jitter) {
  const base = dist > OCCLUSION.farDist ? OCCLUSION.farEvery : OCCLUSION.every;
  return base * (0.8 + 0.4 * jitter);
}
