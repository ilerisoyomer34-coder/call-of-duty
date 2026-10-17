// Paylaşılan çarpışma dünyası (shared/sim/collision.js): ışın, kayma, basamak, tavan, kalkma, dışa aktarma
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CollisionWorld } from '../shared/sim/collision.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const char = (x, y, z) => ({ pos: { x, y, z }, vel: { x: 0, y: 0, z: 0 }, radius: 0.35, height: 1.8, grounded: true, gravity: 15, hitWall: false, landSpeed: 0 });

test('ışın: kutuya ve zemine çarpar, normal ve yüzey doğru', () => {
  const w = new CollisionWorld();
  w.addCollider(5, 0, -1, 6, 2, 1, 'metal');
  const h = w.raycast({ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, 50);
  assert.ok(h && near(h.dist, 5));
  assert.deepEqual([h.normal.x, h.normal.y, h.normal.z], [-1, 0, 0]);
  assert.equal(h.surface, 'metal');
  assert.equal(h.collider, w.colliders[0]);
  // Aşağı bakan ışın zemine (y=0)
  const g = w.raycast({ x: -3, y: 2, z: 0 }, { x: 0, y: -1, z: 0 }, 50);
  assert.ok(g && near(g.dist, 2) && g.collider === null && g.normal.y === 1);
  // Menzil dışı
  assert.equal(w.raycast({ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, 4), null);
  // Görüş hattı
  assert.equal(w.lineOfSight({ x: 0, y: 1, z: 0 }, { x: 10, y: 1, z: 0 }), false);
  assert.equal(w.lineOfSight({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 10 }), true);
});

test('ışın: hücre sınırlarını aşan uzun ışın uzaktaki kutuyu bulur', () => {
  const w = new CollisionWorld();
  w.addCollider(40, 0, 30, 42, 3, 32, 'concrete');
  const d = { x: 41, y: 0, z: 31 };
  const l = Math.hypot(d.x, d.z);
  const h = w.raycast({ x: 0, y: 1.5, z: 0 }, { x: d.x / l, y: 0, z: d.z / l }, 100);
  assert.ok(h && h.dist > 45 && h.dist < l);
});

test('karakter duvara kayar: dik bileşen sıfırlanır, teğet sürer', () => {
  const w = new CollisionWorld();
  w.addCollider(1, 0, -10, 2, 3, 10, 'concrete');
  const st = char(0.5, 0, 0);
  st.vel.x = 4;
  st.vel.z = 3;
  let hit = false;
  for (let i = 0; i < 64; i++) {
    w.moveCharacter(st, 1 / 64, 0.45);
    hit ||= st.hitWall;
  }
  assert.ok(st.pos.x <= 1 - 0.35 + 1e-9, `x ${st.pos.x}`);
  assert.ok(hit);
  assert.ok(st.pos.z > 2.5, `z ${st.pos.z}`);
  assert.ok(near(st.vel.x, 0));
});

test('basamak çıkılır, yüksek kutu çıkılmaz; tavan zıplamayı keser', () => {
  const w = new CollisionWorld();
  w.addCollider(1, 0, -2, 3, 0.4, 2, 'wood'); // basamak (0,4 m < 0,45)
  w.addCollider(5, 0, -2, 7, 1.0, 2, 'concrete'); // engel
  const st = char(0, 0, 0);
  st.vel.x = 3;
  for (let i = 0; i < 64; i++) w.moveCharacter(st, 1 / 64, 0.45);
  assert.ok(near(st.pos.y, 0.4) && st.grounded, `y ${st.pos.y}`);
  for (let i = 0; i < 128; i++) {
    st.vel.x = 3;
    w.moveCharacter(st, 1 / 64, 0.45);
  }
  assert.ok(st.pos.x < 5, `engelde durdu ${st.pos.x}`);

  const c = new CollisionWorld();
  c.addCollider(-2, 2.2, -2, 2, 3, 2, 'concrete'); // tavan 2,2 m
  const j = char(0, 0, 0);
  j.vel.y = 4.8;
  j.grounded = false;
  let top = 0;
  for (let i = 0; i < 64; i++) {
    c.moveCharacter(j, 1 / 64, 0.45);
    top = Math.max(top, j.pos.y);
  }
  assert.ok(top <= 2.2 - 1.8 + 1e-9, `tavan ${top}`);
  assert.ok(j.grounded && j.pos.y === 0);
});

test('canStand ve pointInside', () => {
  const w = new CollisionWorld();
  w.addCollider(-1, 1.4, -1, 1, 2, 1, 'concrete');
  assert.equal(w.canStand({ x: 0, y: 0, z: 0 }, 0.35, 1.15, 1.8), false);
  assert.equal(w.canStand({ x: 3, y: 0, z: 0 }, 0.35, 1.15, 1.8), true);
  assert.equal(w.pointInside({ x: 0, y: 1.5, z: 0 }), w.colliders[0]);
  assert.equal(w.pointInside({ x: 0, y: 1, z: 0 }), null);
});

test('sınırlar karakteri tutar; toJSON/fromJSON aynı dünyayı kurar', () => {
  const w = new CollisionWorld();
  w.bounds = { minx: -5, maxx: 5, minz: -5, maxz: 5 };
  w.floorSurface = 'snow';
  w.roads.push({ minx: -1, maxx: 1, minz: -5, maxz: 5 });
  w.addBoxCollider(2, 1, 2, 2, 2, 1, 'wood', Math.PI / 4);
  w.addCollider(0, 0, 0, 1, 1, 1, 'metal', { dynamic: true }); // sahipli: dışa aktarılmaz
  const st = char(4.5, 0, 0);
  st.vel.x = 10;
  w.moveCharacter(st, 0.5, 0.45);
  assert.ok(near(st.pos.x, 5 - 0.35));
  const data = w.toJSON('deneme');
  assert.equal(data.boxes.length, 1);
  assert.match(data.hash, /^[0-9a-f]{8}$/);
  const r = CollisionWorld.fromJSON(JSON.parse(JSON.stringify(data)));
  assert.equal(r.colliders.length, 1);
  assert.equal(r.groundSurface(0, 0), 'sand');
  assert.equal(r.groundSurface(3, 0), 'snow');
  assert.equal(r.toJSON('deneme').hash, data.hash);
  const o = { x: -4, y: 1, z: 2 };
  const d = { x: 1, y: 0, z: 0 };
  assert.ok(near(w.raycast(o, d, 20).dist, r.raycast(o, d, 20).dist, 1e-4));
});
