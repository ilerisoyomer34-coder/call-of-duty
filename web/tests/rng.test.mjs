// Tohumlu rastgelelik ve koni örneklemesi (shared/sim/rng.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng, mulberry32, hashSeed, inCone } from '../shared/sim/rng.js';

test('aynı tohum aynı diziyi verir, farklı tohum farklı', () => {
  const a = new Rng(42);
  const b = new Rng(42);
  const c = new Rng(43);
  const sa = Array.from({ length: 100 }, () => a.next());
  const sb = Array.from({ length: 100 }, () => b.next());
  const sc = Array.from({ length: 100 }, () => c.next());
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  // Yeniden tohumlama baştan başlatır
  a.seed(42);
  assert.equal(a.next(), sa[0]);
});

test('mulberry32 [0, 1) aralığında ve düzgün dağılımlı', () => {
  const r = mulberry32(7);
  const bins = new Array(10).fill(0);
  const N = 100000;
  for (let i = 0; i < N; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1);
    bins[Math.floor(v * 10)]++;
  }
  for (const n of bins) assert.ok(Math.abs(n - N / 10) < N / 10 * 0.05, `kutu ${n}`);
});

test('hashSeed belirlenimci, parçaların sırası ve değeri önemli', () => {
  assert.equal(hashSeed(1, 2, 3), hashSeed(1, 2, 3));
  assert.notEqual(hashSeed(1, 2, 3), hashSeed(3, 2, 1));
  assert.notEqual(hashSeed('gizli', 5, 9), hashSeed('gizli', 5, 10));
  assert.ok(Number.isInteger(hashSeed('x')) && hashSeed('x') >= 0);
});

test('inCone: yarım açı içinde, birim uzunlukta, sıfır açıda yön aynen', () => {
  const rng = new Rng(9);
  const dir = { x: 0, y: 0, z: -1 };
  const out = { x: 0, y: 0, z: 0 };
  const half = 3 * (Math.PI / 180);
  let maxAng = 0;
  for (let i = 0; i < 5000; i++) {
    inCone(dir, half, out, 1.3, rng);
    assert.ok(Math.abs(Math.hypot(out.x, out.y, out.z) - 1) < 1e-9);
    maxAng = Math.max(maxAng, Math.acos(Math.min(1, -out.z)));
  }
  assert.ok(maxAng <= half + 1e-9 && maxAng > half * 0.9, `en büyük açı ${maxAng}`);
  inCone(dir, 0, out, 1, rng);
  assert.deepEqual(out, dir);
  // Dik yukarı bakışta da tanımlı
  inCone({ x: 0, y: 1, z: 0 }, half, out, 1, rng);
  assert.ok(out.y > Math.cos(half) - 1e-9);
});
