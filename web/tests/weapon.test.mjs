// Paylaşılan silah kuralları (shared/sim/weapon.js): tempo, sapma, desen, tohumlu yön
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS } from '../src/config.js';
import { Rng } from '../shared/sim/rng.js';
import { createWeaponState, triggerShots, spreadDeg, recoverBloom, recordShot, addBloom, recoilKick, pelletDir } from '../shared/sim/weapon.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const stand = { adsT: 0, horizSpeed: 0, crouched: false, grounded: true };

// dt adımlı tetik benzetimi: basılı (otomatik) ya da her adımda yeni basış
function simulate(id, mode, secs, dt = 1 / 60) {
  const d = WEAPONS[id];
  const w = createWeaponState(d);
  w.mag = 1e9;
  let shots = 0;
  for (let t = 0; t < secs - 1e-9; t += dt) {
    w.cooldown -= dt;
    if (w.cooldown < 0 && mode !== 'auto' && w.burstLeft === 0) w.cooldown = Math.max(w.cooldown, 0);
    shots += triggerShots(w, d, mode, true, true, () => true, () => w.mag--).shots;
  }
  return shots;
}

test('tempo: otomatik rpm tutar, seri atış burstCount kadar atar', () => {
  assert.equal(simulate('rifle', 'auto', 1), 12); // 720 rpm
  assert.equal(simulate('lmg', 'auto', 2), 30); // 900 rpm
  const d = WEAPONS.kr4;
  const w = createWeaponState(d);
  w.mag = 30;
  const r = triggerShots(w, d, 'burst', false, true, () => w.mag > 0, () => w.mag--);
  assert.ok(r.usedBuffer && r.shots === 1 && w.burstLeft === d.burstCount - 1);
  let n = 1;
  for (let i = 0; i < 120 && w.burstLeft > 0; i++) {
    w.cooldown -= 1 / 60;
    n += triggerShots(w, d, 'burst', false, false, () => w.mag > 0, () => w.mag--).shots;
  }
  assert.equal(n, d.burstCount);
  // Şarjör boşsa otomatik durur
  const e = createWeaponState(WEAPONS.smg);
  e.mag = 2;
  let fired = 0;
  for (let i = 0; i < 60; i++) {
    e.cooldown -= 1 / 60;
    fired += triggerShots(e, WEAPONS.smg, 'auto', true, false, () => e.mag > 0, () => e.mag--).shots;
  }
  assert.equal(fired, 2);
});

test('sapma: kalçadan, nişanda, harekette, havada, çömelikte', () => {
  const s = WEAPONS.rifle.spread;
  assert.ok(near(spreadDeg(s, 0, stand), s.hip));
  assert.ok(near(spreadDeg(s, 0, { ...stand, adsT: 1 }), s.hip * s.adsMult));
  assert.ok(spreadDeg(s, 0, { ...stand, horizSpeed: 4 }) > s.hip);
  assert.ok(spreadDeg(s, 0, { ...stand, grounded: false }) > spreadDeg(s, 0, stand));
  assert.ok(near(spreadDeg(s, 0, { ...stand, crouched: true }), s.hip * s.crouchMult));
  // Bloom birikir ve son atıştan sonra toparlanır
  const d = WEAPONS.rifle;
  const w = createWeaponState(d);
  for (let i = 0; i < 100; i++) addBloom(w, d);
  assert.equal(w.bloom, d.spread.max);
  w.lastShot = 0;
  recoverBloom(w, d, 0.05, 0.1);
  assert.equal(w.bloom, d.spread.max, 'gecikme dolmadan toparlanmaz');
  recoverBloom(w, d, 1, 0.1);
  assert.ok(near(w.bloom, Math.max(0, d.spread.max - d.spread.recovery * 0.1)));
});

test('geri tepme: desen sırası, ara verince başa döner, tohumla aynı', () => {
  const d = WEAPONS.rifle;
  const w = createWeaponState(d);
  assert.equal(recordShot(w, 0), 0);
  assert.equal(recordShot(w, 0.1), 1);
  assert.equal(recordShot(w, 1), 0);
  const a = recoilKick(d, 3, 0, false, new Rng(5), [0, 0]);
  const b = recoilKick(d, 3, 0, false, new Rng(5), [0, 0]);
  assert.deepEqual(a, b);
  // Rastgele pay olmadan desenin kendisi; çömelikte dikey %85
  const flat = { ...d, recoil: { ...d.recoil, random: 0 } };
  const [rx, ry] = d.recoil.pattern[2];
  assert.deepEqual(recoilKick(flat, 2, 0, false, new Rng(1)), [ry, rx]);
  assert.ok(near(recoilKick(flat, 2, 0, true, new Rng(1))[0], ry * 0.85));
  // Desen bitince son dört adım döner
  const L = d.recoil.pattern.length;
  assert.deepEqual(recoilKick(flat, L + 1, 0, false, new Rng(1)), recoilKick(flat, L - 4 + ((L + 1) % 4), 0, false, new Rng(1)));
});

test('mermi yönü tohumla tekrarlanır ve sapma konisinde kalır; saçma daha geniş', () => {
  const fwd = { x: 0, y: 0, z: -1 };
  const r1 = new Rng(77);
  const r2 = new Rng(77);
  const o1 = { x: 0, y: 0, z: 0 };
  const o2 = { x: 0, y: 0, z: 0 };
  const r3 = new Rng(78);
  const o3 = { x: 0, y: 0, z: 0 };
  let maxR = 0;
  let maxS = 0;
  for (let i = 0; i < 2000; i++) {
    pelletDir(fwd, WEAPONS.rifle, 2.6, r1, o1);
    pelletDir(fwd, WEAPONS.rifle, 2.6, r2, o2);
    assert.deepEqual(o1, o2);
    maxR = Math.max(maxR, Math.acos(-o1.z));
    pelletDir(fwd, WEAPONS.shotgun, 1.2, r3, o3);
    maxS = Math.max(maxS, Math.acos(-o3.z));
  }
  assert.ok(maxR <= 2.6 * (Math.PI / 180) + 1e-9);
  assert.ok(maxS > maxR);
});
