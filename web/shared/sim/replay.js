// Determinizm denemesi (belge §5.2/7): tohumlu girdi kaydını çarpışma dünyasında stepPlayer ile oynatır.
// Aynı kayıt Node'da ve tarayıcıda (Playwright) koşturulur; son konum farkı ≤ 1 mm olmalı.
import { Rng } from './rng.js';
import { CollisionWorld } from './collision.js';
import { createPlayerState, createInputCmd, stepPlayer, BTN } from './movement.js';
import { TICK_DT, QUANT } from '../constants.js';

// Gerçekçi girdi: 20–120 tick'lik bölümler; yön, koşu, çömelme, nişan, ara sıra zıplama, sürekli dönüş.
// Değerler ağdaki gibi nicemli: hareket i8, yaw u16, pitch i16.
export function makeCommands(n, seed) {
  const rng = new Rng(seed);
  const cmds = [];
  let yaw = 0;
  let left = 0;
  let mx = 0;
  let my = 0;
  let turn = 0;
  let hold = 0;
  for (let i = 0; i < n; i++) {
    if (left <= 0) {
      left = 20 + rng.int(100);
      const k = rng.int(6);
      mx = k === 0 ? 0 : rng.pick([-1, -0.5, 0, 0.5, 1]);
      my = k === 0 ? 0 : rng.pick([-1, 0, 0.7, 1, 1]);
      turn = rng.range(-0.04, 0.04);
      hold = (rng.next() < 0.35 ? BTN.SPRINT : 0) | (rng.next() < 0.15 ? BTN.CROUCH : 0) | (rng.next() < 0.2 ? BTN.ADS : 0);
    }
    left--;
    yaw += turn;
    const yq = Math.round(((yaw % (Math.PI * 2)) / (Math.PI * 2)) * QUANT.yawSteps) & 0xffff;
    cmds.push({
      seq: i,
      moveX: Math.round(mx * QUANT.move) / QUANT.move,
      moveY: Math.round(my * QUANT.move) / QUANT.move,
      yaw: (yq / QUANT.yawSteps) * Math.PI * 2,
      pitch: 0,
      buttons: hold | (rng.next() < 0.01 ? BTN.JUMP : 0),
    });
  }
  return cmds;
}

// Konum özeti: nicemli değerler tamsayıya çevrilip karıştırılır (motorlar arası bit farkı yoksa aynı)
function mix(h, v) {
  h ^= v | 0;
  return Math.imul(h, 0x01000193) >>> 0;
}

/**
 * @param {object} collision shared/maps/<harita>.collision.json içeriği
 * @param {{x,y,z}} start başlangıç (ayak)
 * @returns {{ pos: {x,y,z}, vel: {x,y,z}, checkpoints: string[], jumps: number, wallHits: number, dist: number }}
 */
export function replay(collision, start, n = 10000, seed = 12345) {
  const world = CollisionWorld.fromJSON(collision);
  const s = createPlayerState();
  s.pos.x = start.x;
  s.pos.y = start.y;
  s.pos.z = start.z;
  const cmds = makeCommands(n, seed);
  const checkpoints = [];
  let h = 0x811c9dc5;
  let jumps = 0;
  let wallHits = 0;
  let dist = 0;
  for (let i = 0; i < n; i++) {
    const px = s.pos.x;
    const pz = s.pos.z;
    const ev = stepPlayer(s, cmds[i], world, TICK_DT);
    if (ev & 1) jumps++;
    if (s.hitWall) wallHits++;
    dist += Math.hypot(s.pos.x - px, s.pos.z - pz);
    h = mix(h, Math.round(s.pos.x / QUANT.pos));
    h = mix(h, Math.round(s.pos.y / QUANT.pos));
    h = mix(h, Math.round(s.pos.z / QUANT.pos));
    if ((i + 1) % 1000 === 0) checkpoints.push(h.toString(16).padStart(8, '0'));
  }
  return { pos: { ...s.pos }, vel: { ...s.vel }, checkpoints, jumps, wallHits, dist };
}

// createInputCmd yeniden dışa aktarılır: tarayıcı paketi yalnız bu modülü yükler
export { createInputCmd };
