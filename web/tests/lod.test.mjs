// Sade modeller (src/lod.js): üçgen azaltma, öznitelik paylaşımı, nicemlenmiş konum ve gerçek silah modeli
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { simplifyGeometry, lodReady, lowPolyGun, triangleCount } from '../src/lod.js';
import { bakeStatic } from '../src/models.js';
import { LOD_MODELS, TREES } from '../src/config.js';
import { loadWeaponModel } from '../tools/handFitLib.mjs';

const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;

test('küre: üçgenler oranın altına iner, köşe dizileri paylaşılır, dizinler geçerli', async () => {
  await lodReady;
  const geo = new THREE.SphereGeometry(1, 64, 32);
  const lo = simplifyGeometry(geo, 0.2, 0.02);
  assert.ok(lo, 'sadeleşti');
  assert.ok(tris(lo) <= tris(geo) * 0.25, `${tris(geo)} → ${tris(lo)}`);
  assert.equal(lo.attributes.position, geo.attributes.position, 'konumlar kopyalanmaz');
  assert.equal(lo.attributes.uv, geo.attributes.uv, 'UV aynı');
  const max = Math.max(...lo.index.array);
  assert.ok(max < geo.attributes.position.count);
  assert.ok(Math.abs(lo.boundingSphere.radius - 1) < 0.05, 'boyut korunur');
});

test('dizinsiz ve nicemlenmiş (Int16) geometri de sadeleşir', async () => {
  await lodReady;
  const flat = new THREE.SphereGeometry(0.5, 48, 24).toNonIndexed();
  const lo = simplifyGeometry(flat, 0.25, 0.02);
  assert.ok(lo && tris(lo) < tris(flat) * 0.3, 'dizinsiz: önce köşeler kaynaşır');
  const q = new THREE.SphereGeometry(0.5, 48, 24);
  const p = q.attributes.position;
  const qa = new THREE.BufferAttribute(new Int16Array(p.count * 3), 3, true);
  for (let i = 0; i < p.count; i++) qa.setXYZ(i, p.getX(i), p.getY(i), p.getZ(i));
  q.setAttribute('position', qa);
  const lq = simplifyGeometry(q, 0.25, 0.02);
  assert.ok(lq && tris(lq) < tris(q) * 0.3, 'Int16 konumlar okunur');
});

test('azaltılamayacak geometri olduğu gibi kalır (null)', async () => {
  await lodReady;
  assert.equal(simplifyGeometry(new THREE.BoxGeometry(), 0.5, 0.001), null);
  assert.equal(simplifyGeometry(new THREE.SphereGeometry(1, 16, 8), 1, 0.01), null);
});

test('gerçek silah (AK-74M): üçte birin altına iner, boyu ve şekli korunur, şablon önbellekte', async () => {
  const load = async () => (await loadWeaponModel('ak74')).root;
  const full = await load();
  const n0 = triangleCount(full);
  const a = await lowPolyGun('ak74', load, bakeStatic);
  const b = await lowPolyGun('ak74', load, bakeStatic);
  const n1 = triangleCount(a);
  assert.ok(n1 < n0 * 0.4, `${n0} → ${n1} üçgen`);
  const box0 = new THREE.Box3().setFromObject(full);
  const box1 = new THREE.Box3().setFromObject(a);
  for (const k of ['min', 'max']) for (const ax of ['x', 'y', 'z']) assert.ok(Math.abs(box0[k][ax] - box1[k][ax]) < 0.01, `${k}.${ax} ${box0[k][ax]} ~ ${box1[k][ax]}`);
  // Kopyalar geometriyi paylaşır (asker ve yerdeki silah başına yeni bellek yok), sahne atılırken silinmez
  const ga = [];
  const gb = [];
  a.traverse((o) => o.isMesh && ga.push(o.geometry));
  b.traverse((o) => o.isMesh && gb.push(o.geometry));
  assert.deepEqual(ga, gb);
  assert.ok(ga.every((g) => g.userData.shared));
  assert.ok(a.userData.baked, 'yerdeki silah tekrar birleştirilmez');
  assert.ok(LOD_MODELS.gun.ratio < 1 && TREES.lodDist < TREES.shadowDist);
});
