// Çevrim içi arenalar (src/data/arenas.json): bütün haritalar oynanabilir mi? Doğuş ve bot noktaları boş zeminde,
// harita içinde, iki taraf yürüyerek birbirine ulaşır; görev haritalarının noktaları üreticiyle güncel; botlar her
// haritada doğar ve dolaşır. Harita değişince: node tools/export-collision.mjs && node tools/make-arenas.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CollisionWorld } from '../shared/sim/collision.js';
import { NavGrid } from '../shared/sim/nav.js';
import { MatchSim } from '../server/game/sim.js';
import { modeRules, MM } from '../server/game/rooms.js';
import { MAP_BUILDERS } from '../src/maps/index.js';
import { makeArena } from '../tools/make-arenas.mjs';
import ARENAS from '../src/data/arenas.json' with { type: 'json' };

const ids = Object.keys(ARENAS).filter((k) => k !== '_');
const worldOf = (id) => CollisionWorld.fromJSON(JSON.parse(readFileSync(new URL(`../shared/maps/${id}.collision.json`, import.meta.url), 'utf8')));

// Ayakta oyuncunun sığdığı yer: 0,3 m çevresinde zeminden baş hizasına kutu yok
function clear(W, x, z, r = 0.3) {
  for (const c of W.query(x - r, z - r, x + r, z + r)) {
    if (c.max.y < 0.02 || c.min.y > 1.9) continue;
    if (x + r > c.min.x && x - r < c.max.x && z + r > c.min.z && z - r < c.max.z) return false;
  }
  return true;
}

test('bütün görev haritaları çevrim içi arena ve hepsi maç sırasında (oylamada)', () => {
  for (const id of Object.keys(MAP_BUILDERS)) assert.ok(ARENAS[id], `${id} arena değil`);
  assert.deepEqual([...MM.maps].sort(), [...ids].sort(), 'modes.json → matchmaking.maps bütün arenaları içerir');
  assert.equal(new Set(MM.maps).size, MM.maps.length);
});

for (const id of ids) {
  test(`${id}: doğuş ve bot noktaları boş zeminde, taraflar birbirine yürüyerek ulaşır`, () => {
    const A = ARENAS[id];
    const W = worldOf(id);
    const B = W.bounds;
    const S = A.spawns;
    assert.ok(A.name && A.env, 'ad ve ortam');
    assert.ok(S.blue.length >= 8 && S.red.length >= 8 && S.ffa.length >= 8 && A.hotspots.length >= 8, 'yeterli nokta');
    for (const [x, z, yaw] of [...S.blue, ...S.red, ...S.ffa]) {
      assert.ok(x > B.minx && x < B.maxx && z > B.minz && z < B.maxz, `${x},${z} harita dışında`);
      assert.ok(clear(W, x, z), `doğuş ${x},${z} bir kutunun içinde`);
      assert.ok(Number.isFinite(yaw));
    }
    for (const [x, z] of A.hotspots) assert.ok(x > B.minx && x < B.maxx && z > B.minz && z < B.maxz, `bot noktası ${x},${z} harita dışında`);
    const nav = new NavGrid(W, 0.35);
    const p = (q) => ({ x: q[0], y: 0, z: q[1] });
    assert.ok(nav.findPath(p(S.blue[0]), p(S.red[0]), 200000), 'mavi → kırmızı yol');
    assert.ok(nav.findPath(p(S.ffa[0]), p(S.ffa[S.ffa.length - 1]), 200000), 'Ölüm Maçı doğuşları arası yol');
  });
}

test('görev haritalarının arena noktaları üreticiyle güncel (node tools/make-arenas.mjs)', () => {
  for (const id of Object.keys(MAP_BUILDERS)) assert.deepEqual(ARENAS[id], makeArena(id).arena, `${id} eski: node tools/make-arenas.mjs`);
});

for (const id of Object.keys(MAP_BUILDERS)) {
  test(`${id}: botlar takım ölüm maçında doğar ve dolaşır`, () => {
    const sim = new MatchSim({ world: worldOf(id), arena: ARENAS[id], rules: { ...modeRules('tdm'), warmup: 0 }, mode: 'tdm', seed: 3 });
    sim.balanceBots();
    const bots = sim.players.filter(Boolean);
    assert.equal(bots.length, 8);
    sim.step();
    const start = bots.map((b) => ({ x: b.state.pos.x, z: b.state.pos.z }));
    for (let i = 0; i < 64 * 6; i++) sim.step();
    const moved = bots.filter((b, i) => Math.hypot(b.state.pos.x - start[i].x, b.state.pos.z - start[i].z) > 3).length;
    assert.ok(moved >= 4, `${moved}/8 bot yürüdü`);
    for (const b of bots) assert.ok(b.state.pos.y > -1 && Number.isFinite(b.state.pos.x), 'harita dışına düşen yok');
  });
}
