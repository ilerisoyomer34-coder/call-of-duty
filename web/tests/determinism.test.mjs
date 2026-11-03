// Determinizm (belge §5.2/7): 10.000 komutluk tohumlu kayıt aynı sonucu verir. Tarayıcı karşılaştırması
// duman testinin "determinism" bölümünde (Chromium); burada Node içinde tekrar ve akla yatkınlık.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { replay } from '../shared/sim/replay.js';
import { buildMission } from '../src/level.js';
import { CollisionWorld } from '../shared/sim/collision.js';

const data = JSON.parse(readFileSync(new URL('../shared/maps/kizilkum.collision.json', import.meta.url), 'utf8'));
const start = buildMission(new CollisionWorld(), 'kizilkum').playerStart.pos;

test('10.000 komut: iki koşu bit düzeyinde aynı, oyuncu gerçekten hareket etti ve duvarlara çarptı', () => {
  const a = replay(data, start, 10000, 12345);
  const b = replay(data, start, 10000, 12345);
  assert.deepEqual(a, b);
  assert.equal(a.checkpoints.length, 10);
  assert.ok(a.dist > 200, `yol ${a.dist}`);
  assert.ok(a.jumps > 20, `zıplama ${a.jumps}`);
  assert.ok(a.wallHits > 50, `duvar ${a.wallHits}`);
  for (const v of [a.pos.x, a.pos.y, a.pos.z]) assert.ok(Number.isFinite(v));
  // Başka tohum başka yol
  assert.notDeepEqual(replay(data, start, 2000, 7).pos, replay(data, start, 2000, 8).pos);
});
