// Paylaşılan hareket adımı (shared/sim/movement.js): hızlar config ile, zıplama fiziği, olaylar, nicemleme, tekrar
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOVEMENT as M } from '../src/config.js';
import { TICK_DT, QUANT } from '../shared/constants.js';
import { CollisionWorld } from '../shared/sim/collision.js';
import { createPlayerState, createInputCmd, stepPlayer, clonePlayerState, BTN, SIM_EV } from '../shared/sim/movement.js';

const run = (s, cmd, world, ticks) => {
  let ev = 0;
  for (let i = 0; i < ticks; i++) {
    ev |= stepPlayer(s, cmd, world, TICK_DT);
    cmd.buttons &= ~BTN.JUMP;
  }
  return ev;
};
const near = (a, b, eps) => Math.abs(a - b) <= eps;

test('yürüme, koşu, çömelme ve geri tepe hızları config değerleri', () => {
  const w = new CollisionWorld();
  for (const [buttons, moveY, speed] of [
    [0, 1, M.walkSpeed],
    [BTN.SPRINT, 1, M.sprintSpeed],
    [BTN.CROUCH, 1, M.crouchSpeed],
    [0, -1, M.walkSpeed],
  ]) {
    const s = createPlayerState();
    const cmd = createInputCmd();
    cmd.moveY = moveY;
    cmd.buttons = buttons;
    run(s, cmd, w, TICK_DT ** -1);
    assert.ok(near(s.horizSpeed, speed, QUANT.vel * 2), `${buttons}: ${s.horizSpeed} ≠ ${speed}`);
    // yaw=0 → ileri -Z
    assert.ok(moveY > 0 ? s.pos.z < 0 : s.pos.z > 0);
  }
});

test('zıplama: tepe yükseklik ayrık Euler tahminiyle, iniş olayı ve zemine dönüş', () => {
  const w = new CollisionWorld();
  const s = createPlayerState();
  const cmd = createInputCmd();
  cmd.buttons = BTN.JUMP;
  let ev = stepPlayer(s, cmd, w, TICK_DT);
  cmd.buttons = 0;
  assert.ok(ev & SIM_EV.JUMP);
  let peak = s.pos.y;
  let n = 1;
  while (!s.grounded && n < 200) {
    ev |= stepPlayer(s, cmd, w, TICK_DT);
    peak = Math.max(peak, s.pos.y);
    n++;
  }
  const v = M.jumpVelocity;
  const expect = (v * v) / (2 * M.gravity) - (v * TICK_DT) / 2;
  assert.ok(near(peak, expect, 0.01), `tepe ${peak} beklenen ~${expect}`);
  assert.ok(s.grounded && s.pos.y === 0);
  assert.ok(ev & SIM_EV.LAND, 'iniş olayı');
  assert.ok(near(n * TICK_DT, (2 * v) / M.gravity, 0.05), `havada ${n * TICK_DT} sn`);
});

test('koşu kuralları: nişana basmak keser, geri giderken koşulmaz, ağır zırhta koşu yok', () => {
  const w = new CollisionWorld();
  const s = createPlayerState();
  const cmd = createInputCmd();
  cmd.moveY = 1;
  cmd.buttons = BTN.SPRINT;
  assert.ok(run(s, cmd, w, 5) & SIM_EV.SPRINT_START);
  assert.ok(s.sprinting);
  cmd.buttons = BTN.SPRINT | BTN.ADS;
  assert.ok(run(s, cmd, w, 1) & SIM_EV.SPRINT_STOP);
  assert.ok(!s.sprinting && s.sprintOut > 0);
  run(s, cmd, w, 40);
  assert.ok(s.adsT === 1, `nişan ${s.adsT}`);
  // Geri
  const b = createPlayerState();
  const c2 = createInputCmd();
  c2.moveY = -1;
  c2.buttons = BTN.SPRINT;
  run(b, c2, w, 10);
  assert.ok(!b.sprinting);
  // Ağır zırh
  const h = createPlayerState();
  h.mods.noSprint = true;
  const c3 = createInputCmd();
  c3.moveY = 1;
  c3.buttons = BTN.SPRINT;
  run(h, c3, w, 10);
  assert.ok(!h.sprinting);
  // Koşarken çömelme isteği: koşu kazanır, çömelme düşer
  const k = createPlayerState();
  const c4 = createInputCmd();
  c4.moveY = 1;
  c4.buttons = BTN.SPRINT | BTN.CROUCH;
  assert.ok(run(k, c4, w, 1) & SIM_EV.UNCROUCH);
  assert.ok(k.sprinting && !k.crouched);
});

test('alçak tavan altında kalkılamaz; çömelme boyu ayarlanır', () => {
  const w = new CollisionWorld();
  w.addCollider(-2, 1.4, -2, 2, 3, 2, 'concrete');
  // Tavanın altına çömelmiş girilmiş (ayakta boy tavana girerdi)
  const s = createPlayerState();
  s.crouched = true;
  s.crouchT = 1;
  s.height = M.crouchHeight;
  const cmd = createInputCmd();
  cmd.buttons = BTN.CROUCH;
  run(s, cmd, w, 64);
  assert.ok(s.crouched && near(s.height, M.crouchHeight, 0.01) && s.pos.x === 0);
  cmd.buttons = 0;
  assert.ok(run(s, cmd, w, 2) & SIM_EV.CROUCH_BLOCKED);
  assert.ok(s.crouched);
});

test('tick sonu nicemleme ve aynı girdiyle aynı sonuç', () => {
  const w = new CollisionWorld();
  w.addCollider(3, 0, -10, 4, 2, 10, 'concrete');
  const mk = () => {
    const s = createPlayerState();
    const cmd = createInputCmd();
    for (let i = 0; i < 400; i++) {
      cmd.yaw = Math.sin(i * 0.05) * 2;
      cmd.moveX = ((i >> 4) % 3) - 1;
      cmd.moveY = 1;
      cmd.buttons = (i % 50 === 0 ? BTN.JUMP : 0) | (i % 120 > 90 ? BTN.CROUCH : 0) | (i % 200 < 60 ? BTN.SPRINT : 0);
      stepPlayer(s, cmd, w, TICK_DT);
    }
    return s;
  };
  const a = mk();
  const b = mk();
  assert.deepEqual(clonePlayerState(a), clonePlayerState(b));
  for (const v of [a.pos.x, a.pos.y, a.pos.z]) assert.equal(Math.round(v / QUANT.pos) * QUANT.pos, v);
  for (const v of [a.vel.x, a.vel.y, a.vel.z]) assert.equal(Math.round(v / QUANT.vel) * QUANT.vel, v);
});
