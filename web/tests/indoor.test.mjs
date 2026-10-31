// İç mekân göz uyumu (src/indoor.js) ve Belediye binasının iç mekân kutusu
import test from 'node:test';
import assert from 'node:assert/strict';
import { interiorAt, approach, indoorMultipliers } from '../src/indoor.js';
import { INDOOR } from '../src/config.js';
import { CollisionWorld } from '../shared/sim/collision.js';
import { build, HALL, HALL_FLOORS } from '../src/maps/municipality.js';

test('kutu içi: sınırlar dahil, dışarısı null', () => {
  const boxes = [{ minx: -1, maxx: 1, miny: 0, maxy: 3, minz: -1, maxz: 1 }];
  assert.equal(interiorAt({ x: 0, y: 1.6, z: 0 }, boxes), boxes[0]);
  assert.equal(interiorAt({ x: 1, y: 3, z: -1 }, boxes), boxes[0]);
  assert.equal(interiorAt({ x: 1.01, y: 1.6, z: 0 }, boxes), null);
  assert.equal(interiorAt({ x: 0, y: 3.5, z: 0 }, boxes), null, 'çatının üstü dışarı');
  assert.equal(interiorAt({ x: 0, y: 1, z: 0 }, undefined), null, 'kutusu olmayan harita');
});

test('uyum: kare hızından bağımsız üstel yaklaşım', () => {
  const a = approach(0, 1, INDOOR.inRate, 0.5);
  let b = 0;
  for (let i = 0; i < 30; i++) b = approach(b, 1, INDOOR.inRate, 0.5 / 30);
  assert.ok(Math.abs(a - b) < 1e-9, 'tek adım = 30 küçük adım');
  assert.ok(a > 0.5 && a < 1, `yarım saniyede büyük kısmı (${a.toFixed(2)})`);
  assert.equal(approach(0.4, 1, 3, 0), 0.4, 'sıfır adım değiştirmez');
});

test('çarpanlar: dışarıda 1, içeride INDOOR ya da kutunun kendi değeri', () => {
  assert.deepEqual(indoorMultipliers(0, null), { exposure: 1, hemi: 1 });
  assert.deepEqual(indoorMultipliers(1, null), { exposure: INDOOR.exposure, hemi: INDOOR.hemi });
  assert.deepEqual(indoorMultipliers(1, { exposure: 2, hemi: 3 }), { exposure: 2, hemi: 3 });
  const half = indoorMultipliers(0.5, null);
  assert.ok(half.exposure > 1 && half.exposure < INDOOR.exposure);
  assert.ok(INDOOR.exposure > 1 && INDOOR.hemi >= 1, 'içeride daha aydınlık');
});

test('Belediye: üç katın içi iç mekân, meydan ve başlangıç dışarı', () => {
  const data = build(new CollisionWorld());
  assert.ok(Array.isArray(data.interiors) && data.interiors.length > 0);
  for (const y of HALL_FLOORS) {
    for (const [dx, dz] of [[-3, 3], [3, -3], [0, 0]]) {
      assert.ok(interiorAt({ x: HALL.x + dx, y: y + 1.6, z: HALL.z + dz }, data.interiors), `kat ${y} (${dx},${dz}) içeride`);
    }
  }
  // Son kattaki kontrol noktası (karşı saldırı) içeride
  const cp = data.checkpoints[3].pos;
  assert.ok(interiorAt({ x: cp.x, y: cp.y + 1.6, z: cp.z }, data.interiors));
  assert.equal(interiorAt({ x: 0, y: 1.6, z: 10 }, data.interiors), null, 'meydan dışarıda');
  const s = data.playerStart.pos;
  assert.equal(interiorAt({ x: s.x, y: s.y + 1.6, z: s.z }, data.interiors), null, 'başlangıç dışarıda');
});
