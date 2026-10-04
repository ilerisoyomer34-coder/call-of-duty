// Dışa aktarılan çarpışma dosyaları (shared/maps/*.collision.json) haritanın kendisiyle güncel mi?
// Harita değişince: node tools/export-collision.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CollisionWorld, collisionHash } from '../shared/sim/collision.js';
import { buildMission } from '../src/level.js';
import { MAP_BUILDERS, ARENA_BUILDERS } from '../src/maps/index.js';

for (const id of [...Object.keys(MAP_BUILDERS), ...Object.keys(ARENA_BUILDERS)]) {
  test(`${id}: çarpışma dosyası güncel ve yüklenince aynı dünyayı kurar`, () => {
    const file = JSON.parse(readFileSync(new URL(`../shared/maps/${id}.collision.json`, import.meta.url), 'utf8'));
    const W = new CollisionWorld();
    if (ARENA_BUILDERS[id]) ARENA_BUILDERS[id](W);
    else buildMission(W, id);
    const now = W.toJSON(id);
    assert.equal(file.hash, now.hash, `${id} eski: node tools/export-collision.mjs`);
    assert.equal(collisionHash(file), file.hash, 'dosyanın özeti içeriğiyle uyumlu');
    // Sunucunun kuracağı dünya: aynı kutular, aynı ışın sonuçları (0,1 mm yuvarlama payıyla)
    const S = CollisionWorld.fromJSON(file);
    assert.equal(S.colliders.length, now.boxes.length);
    assert.deepEqual(S.bounds, W.bounds);
    let hits = 0;
    for (let i = 0; i < 200; i++) {
      const a = (i / 200) * Math.PI * 2;
      const o = { x: Math.sin(i * 1.7) * 30, y: 1.2, z: Math.cos(i * 1.3) * 60 };
      const d = { x: Math.cos(a), y: -0.02, z: Math.sin(a) };
      const l = Math.hypot(d.x, d.y, d.z);
      d.x /= l;
      d.y /= l;
      d.z /= l;
      const h1 = W.raycast(o, d, 120);
      const h2 = S.raycast(o, d, 120);
      assert.equal(!!h1, !!h2);
      if (h1) {
        hits++;
        assert.ok(Math.abs(h1.dist - h2.dist) < 1e-3, `ışın ${i}: ${h1.dist} ≠ ${h2.dist}`);
        assert.equal(h1.surface, h2.surface);
      }
    }
    assert.ok(hits > 50);
  });
}
