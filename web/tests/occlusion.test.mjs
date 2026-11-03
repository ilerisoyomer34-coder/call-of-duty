// Duvar arkası gizlemesi (src/occlusion.js): örnek noktaları, görünürlük kararı ve çarpışma dünyasıyla ışın
import test from 'node:test';
import assert from 'node:assert/strict';
import { bodySamples, anyVisible, occlusionStep, occlusionInterval } from '../src/occlusion.js';
import { OCCLUSION } from '../src/config.js';
import { CollisionWorld } from '../shared/sim/collision.js';

const body = (x, z, y = 0) => ({ x, y, z, eyeH: 1.62, chestH: 1.3, radius: 0.38 });

test('örnek noktaları: baş, göğüs, diz ve kameraya dik iki omuz', () => {
  const cam = { x: 0, y: 1.6, z: 10 };
  const pts = bodySamples(cam, body(0, 0));
  assert.equal(pts.length, 5);
  assert.deepEqual(pts.slice(0, 3).map((p) => p.y), [1.62, 1.3, OCCLUSION.knee]);
  // Kamera +z'de: omuzlar x ekseninde, yarıçapın OCCLUSION.side katı uzakta
  const off = 0.38 * OCCLUSION.side;
  assert.ok(Math.abs(Math.abs(pts[3].x) - off) < 1e-9 && Math.abs(pts[3].z) < 1e-9);
  assert.ok(Math.abs(pts[3].x + pts[4].x) < 1e-9 && pts[3].y === 1.3);
});

test('karar: görününce hemen çizilir, art arda görünmeyince gecikmeyle gizlenir', () => {
  const st = { unseen: 0, hidden: false };
  assert.equal(occlusionStep(st, false, OCCLUSION.hideAfter / 2), false, 'kısa kesintide gizlenmez');
  assert.equal(occlusionStep(st, false, OCCLUSION.hideAfter / 2), true, 'süre dolunca gizlenir');
  assert.equal(occlusionStep(st, true, 0.01), false, 'görünür olunca hemen geri gelir');
  assert.equal(st.unseen, 0);
});

test('yoklama aralığı: uzaktaki asker daha seyrek, ±%20 dağılım', () => {
  const near = occlusionInterval(5, 0.5);
  const far = occlusionInterval(OCCLUSION.farDist + 10, 0.5);
  assert.ok(far > near);
  assert.ok(occlusionInterval(5, 0) >= OCCLUSION.every * 0.8 - 1e-9 && occlusionInterval(5, 1) <= OCCLUSION.every * 1.2 + 1e-9);
});

test('çarpışma dünyası: duvar arkası görünmez, alçak siperin üstünden baş görünür, kenardan omuz görünür', () => {
  const W = new CollisionWorld();
  W.block(0, 0, 5, 6, 3, 0.3, 'concrete', 'concrete'); // 3 m duvar (x −3…3, z = 5)
  W.block(10, 0, 5, 4, 1, 0.3, 'concrete', 'concrete'); // 1 m siper (x 8…12)
  const los = (a, b) => W.lineOfSight(a, b);
  const cam = { x: 0, y: 1.6, z: 10 };
  assert.equal(anyVisible(cam, bodySamples(cam, body(0, 0)), los), false, 'duvarın arkasındaki asker gizli');
  const cam2 = { x: 10, y: 1.6, z: 10 };
  assert.equal(anyVisible(cam2, bodySamples(cam2, body(10, 0)), los), true, 'siperin üstünden başı görünür');
  // Duvarın kenarından taşan asker (kameradan bakınca): göğsü duvarın arkasında, bir omzu görünür
  const cam3 = { x: 0, y: 1.6, z: 10 };
  const b = body(5.7, 0);
  const pts = bodySamples(cam3, b);
  assert.equal(los(cam3, pts[1]), false, 'göğsü duvarın arkasında');
  assert.equal(anyVisible(cam3, pts, los), true, 'omzu görünüyor: çizilir');
});
