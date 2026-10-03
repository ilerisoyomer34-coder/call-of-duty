// Pozdan vuruş kutuları (shared/sim/hitboxes.js): bölgeler, çömelme, dönmüş kutu, kapsül
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHitboxes, hitboxesFor, rayHitboxes, rayCapsule, rayYawBox, HITBOX } from '../shared/sim/hitboxes.js';

const boxes = createHitboxes();
const shoot = (y, x = 0, maxDist = 50) => rayHitboxes({ x, y, z: -10 }, { x: 0, y: 0, z: 1 }, maxDist, boxes);

test('ayakta: baş, göğüs, karın, bacak bölgeleri doğru yükseklikte', () => {
  hitboxesFor({ pos: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, height: 1.8 }, boxes);
  const head = shoot(1.65);
  assert.ok(head && head.zone === 'head' && head.playerZone === 'head');
  assert.ok(Math.abs(head.dist - (10 - 0.02 - HITBOX.headR)) < 1e-6, `baş mesafe ${head.dist}`);
  assert.equal(shoot(1.25).part, 'chest');
  assert.equal(shoot(0.95).part, 'stomach');
  const leg = shoot(0.4, 0.11);
  assert.ok(leg && leg.zone === 'limb' && leg.playerZone === 'leg');
  assert.equal(shoot(2.1), null, 'başın üstü boş');
  assert.equal(shoot(1.25, 0.6), null, 'yanından geçer');
});

test('çömelince baş iner; ayakta baş hizası boşa gider', () => {
  hitboxesFor({ pos: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, height: 1.15 }, boxes);
  assert.equal(shoot(1.65), null);
  assert.equal(shoot(1.02).zone, 'head');
});

test('kollar nişan yönünde: yaw 90° iken sağa uzanır', () => {
  hitboxesFor({ pos: { x: 0, y: 0, z: 0 }, yaw: -Math.PI / 2, pitch: 0, height: 1.8 }, boxes);
  // yaw -90° → ileri +X; eller x≈0,5'te
  const arm = boxes[3];
  assert.ok(arm.b.x > 0.4 && Math.abs(arm.a.y - 1.8 * HITBOX.shoulderY) < 1e-9);
  const r = rayHitboxes({ x: 0.45, y: 3, z: 0.09 }, { x: 0, y: -1, z: 0 }, 50, boxes);
  assert.ok(r && r.part === 'arm' && r.playerZone === 'torso');
});

test('kesişim yardımcıları', () => {
  // Kapsül gövdesi ve uç küresi
  assert.ok(Math.abs(rayCapsule({ x: -5, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 2, z: 0 }, 0.5) - 4.5) < 1e-9);
  assert.ok(Math.abs(rayCapsule({ x: 0, y: 5, z: 0 }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 2, z: 0 }, 0.5) - 2.5) < 1e-9);
  assert.equal(rayCapsule({ x: -5, y: 3, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 2, z: 0 }, 0.5), -1);
  // 90° dönmüş kutu: yerel x yarı boyu 1 → dünyada z ekseninde
  const half = { x: 1, y: 0.5, z: 0.2 };
  const c = { x: 0, y: 0, z: 0 };
  assert.ok(Math.abs(rayYawBox({ x: 0, y: 0, z: -5 }, { x: 0, y: 0, z: 1 }, c, half, Math.PI / 2) - 4) < 1e-9);
  assert.ok(Math.abs(rayYawBox({ x: -5, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, c, half, Math.PI / 2) - 4.8) < 1e-9);
  assert.ok(Math.abs(rayYawBox({ x: -5, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, c, half, 0) - 4) < 1e-9);
});
