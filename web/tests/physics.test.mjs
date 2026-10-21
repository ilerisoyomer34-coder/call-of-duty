// Fizik motoru (src/physics.js, Rapier): statik dünya, düşen eşya, gerçek asker iskeletiyle ragdoll, patlama
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { CollisionWorld } from '../shared/sim/collision.js';
import { PhysicsSystem } from '../src/physics.js';
import { PHYSICS } from '../src/config.js';

const load = () => import('@dimforge/rapier3d-compat');

// soldier.glb'nin düğüm ağacı (yalnız dönüşümler): oyundaki iskeletin aynısı, mesh'siz
function soldierSkeleton() {
  const buf = readFileSync(new URL('../assets/characters/soldier.glb', import.meta.url));
  const json = JSON.parse(buf.toString('utf8', 20, 20 + buf.readUInt32LE(12)));
  const joints = new Set(json.skins[0].joints);
  const objs = json.nodes.map((n, i) => {
    const o = joints.has(i) ? new THREE.Bone() : new THREE.Object3D();
    o.name = n.name || '';
    if (n.translation) o.position.fromArray(n.translation);
    if (n.rotation) o.quaternion.fromArray(n.rotation);
    if (n.scale) o.scale.fromArray(n.scale);
    return o;
  });
  json.nodes.forEach((n, i) => (n.children || []).forEach((c) => objs[i].add(objs[c])));
  const root = new THREE.Object3D();
  for (const i of json.scenes[0].nodes) root.add(objs[i]);
  const bones = {};
  root.traverse((o) => {
    if (o.isBone) bones[o.name] = o;
  });
  root.updateMatrixWorld(true);
  return { root, bones };
}

const pos = (bone) => new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld);
const step = (ph, sec) => {
  for (let t = 0; t < sec; t += 1 / 30) ph.update(1 / 30);
};

test('motor yüklenir, harita kutuları statik dünya olur, sonradan eklenen/kaldırılan kutu izlenir', async () => {
  const cw = new CollisionWorld();
  cw.addCollider(-1, 0, -1, 1, 1, 1, 'concrete');
  const ph = new PhysicsSystem({});
  ph.setMap(cw); // motor yüklenmeden: harita hatırlanır
  assert.equal(ph.ready, false);
  assert.equal(await ph.init(load), true);
  assert.equal(ph.ready, true);
  assert.equal(ph.stats().statics, 1);
  // World kancası (istemcide World.addCollider/removeCollider çağırır)
  const c = cw.addCollider(5, 0, 5, 6, 2, 6, 'wood');
  cw.onColliderChange('add', c);
  assert.equal(ph.stats().statics, 2);
  cw.onColliderChange('remove', c);
  assert.equal(ph.stats().statics, 1);
  // Tankın her karede yeniden kurulan kutuları alınmaz
  cw.onColliderChange('add', cw.addCollider(8, 0, 8, 9, 2, 9, 'metal', { kind: 'tank' }));
  assert.equal(ph.stats().statics, 1);
  ph.clear();
  assert.equal(ph.ready, false);
});

test('düşen eşya kutunun üstünde durur, içinden geçmez; oturunca gövdesi kaldırılır', async () => {
  const cw = new CollisionWorld();
  cw.addCollider(-1, 0, -1, 1, 1, 1, 'concrete');
  const ph = new PhysicsSystem({});
  await ph.init(load);
  ph.setMap(cw);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.2));
  mesh.position.set(0, 2.5, 0);
  assert.equal(ph.addDebris(mesh, new THREE.Vector3(0, 0, 0)), true);
  step(ph, 4);
  assert.ok(mesh.position.y > 0.98 && mesh.position.y < 1.2, `kutunun üstünde (y ${mesh.position.y.toFixed(3)})`);
  step(ph, PHYSICS.debris.settleSec);
  assert.equal(ph.stats().debris, 0, 'oturan eşyanın gövdesi kalktı');
  ph.clear();
});

test('ragdoll: gerçek iskelet yığılır, zeminin içine girmez, eklemler kopmaz, sonra donar', async () => {
  const ph = new PhysicsSystem({});
  await ph.init(load);
  ph.setMap(new CollisionWorld());
  const model = soldierSkeleton();
  const B = model.bones;
  const parts = PHYSICS.ragdoll.parts.filter((p) => p.parent);
  const parentBone = (p) => B[PHYSICS.ragdoll.parts.find((q) => q.id === p.parent).bone];
  const before = parts.map((p) => pos(B[p.bone]).distanceTo(pos(parentBone(p))));
  const hipsY = pos(B.Hips).y;
  assert.ok(hipsY > 0.8, `ayakta (kalça ${hipsY.toFixed(2)} m)`);
  const rag = ph.ragdoll(model, { dir: new THREE.Vector3(0, 0, -1), zone: 'torso', damage: 35 });
  assert.ok(rag && model.ragdoll === rag, 'ragdoll kuruldu');
  assert.equal(rag.parts.length, PHYSICS.ragdoll.parts.length);
  step(ph, 2.5);
  model.root.updateMatrixWorld(true);
  const after = parts.map((p) => pos(B[p.bone]).distanceTo(pos(parentBone(p))));
  parts.forEach((p, i) => assert.ok(Math.abs(after[i] - before[i]) < 0.06, `${p.id}: eklem boyu korunur (${before[i].toFixed(3)} → ${after[i].toFixed(3)})`));
  const y = pos(B.Hips).y;
  assert.ok(y < 0.45, `yığıldı (kalça ${y.toFixed(2)} m)`);
  for (const name of ['Head', 'Hips', 'LeftHand', 'RightHand', 'LeftFoot', 'RightFoot', 'Spine2']) {
    assert.ok(pos(B[name]).y > -0.06, `${name} zeminin üstünde (${pos(B[name]).y.toFixed(3)})`);
  }
  // Mermi yönünde (−z) devrildi
  assert.ok(pos(B.Head).z < 0.2, `vuruş yönüne düştü (baş z ${pos(B.Head).z.toFixed(2)})`);
  step(ph, PHYSICS.ragdoll.maxSec);
  assert.equal(ph.stats().ragdolls, 0, 'dondu');
  assert.ok(rag.frozen && !rag.parts.length);
  const frozenHead = pos(B.Head);
  step(ph, 1);
  assert.ok(pos(B.Head).distanceTo(frozenHead) < 1e-6, 'donmuş poz değişmez');
  ph.release(model);
  assert.equal(model.ragdoll, null);
  ph.clear();
});

test('patlama yakındaki gövdeleri savurur; sınırı aşan ragdoll en eskiden dondurulur', async () => {
  const ph = new PhysicsSystem({});
  await ph.init(load);
  ph.setMap(new CollisionWorld());
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3));
  mesh.position.set(1, 0.15, 0);
  ph.addDebris(mesh, new THREE.Vector3(), new THREE.Vector3());
  step(ph, 0.5);
  ph.blast(new THREE.Vector3(0, 0, 0), 4);
  step(ph, 0.25);
  assert.ok(mesh.position.x > 1.5 && mesh.position.y > 0.3, `savruldu (${mesh.position.x.toFixed(2)}, ${mesh.position.y.toFixed(2)})`);
  const models = [];
  for (let i = 0; i < PHYSICS.limits.ragdolls + 2; i++) {
    const m = soldierSkeleton();
    m.root.position.x = i * 3;
    m.root.updateMatrixWorld(true);
    ph.ragdoll(m, {});
    models.push(m);
  }
  assert.equal(ph.stats().ragdolls, PHYSICS.limits.ragdolls);
  assert.ok(models[0].ragdoll.frozen && models[1].ragdoll.frozen && !models.at(-1).ragdoll.frozen);
  ph.clear();
  assert.ok(models.every((m) => m.ragdoll.frozen), 'harita kapanınca hepsi donar');
});

test('motor yüklenemezse oyun eski yollarla sürer', async () => {
  const ph = new PhysicsSystem({});
  assert.equal(await ph.init(() => Promise.reject(new Error('WebAssembly yasak'))), false);
  ph.setMap(new CollisionWorld());
  assert.equal(ph.ready, false);
  assert.equal(ph.addDebris(new THREE.Mesh(new THREE.BoxGeometry()), new THREE.Vector3()), false);
  assert.equal(ph.ragdoll(soldierSkeleton(), {}), null);
  ph.update(0.1);
  ph.blast(new THREE.Vector3(), 3);
});
