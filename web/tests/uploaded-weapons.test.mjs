import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { WEAPONS, WEAPON_ORDER } from '../src/config.js';
import META from '../src/data/weapons.json' with { type: 'json' };
import ASSETS from '../src/weaponAssets.json' with { type: 'json' };
import { weaponInfoLine } from '../src/weaponInfo.js';

const added = ['ak47', 'adar215', 'g95', 'mp7', 'stm556', 'm4super90', 'ar10t', 'ithaca37', 'uar10'];
const old = ['rifle', 'mar556', 'smg', 'shotgun', 'lmg', 'sniper', 'pistol', 'd50', 'rpg', 'k8', 'kr4', 'mk4', 'kt9', 'ak74', 'bren2', 'awm', 'minigun', 'pr10', 'knife'];
const webFile = file => new URL(`../${file}`, import.meta.url);

test('yeni silahlar katalogda seçilebilir; ağdaki eski silah kimlikleri kaymaz', () => {
  assert.deepEqual(WEAPON_ORDER.slice(0, old.length), old);
  assert.deepEqual(WEAPON_ORDER.slice(old.length), added);
  for (const id of added) {
    const w = WEAPONS[id];
    assert.equal(w.id, id);
    assert.equal(w.category, 'primary');
    assert.equal(w.model, 'glb');
    assert.equal(META[id].unlockCost, 0);
    assert.ok(weaponInfoLine(id).includes(String(w.magSize)));
    assert.ok(w.damage > 0 && w.rpm > 0 && w.reserveStart >= w.magSize);
  }
  assert.equal(WEAPONS.m4super90.pump, false);
  assert.equal(WEAPONS.ithaca37.pump, true);
});

for (const id of added) test(`${id}: gerçek GLB, hareketli parçalar, yön ve dokular pakette`, () => {
  const asset = ASSETS[WEAPONS[id].asset];
  const file = readFileSync(webFile(asset.file));
  assert.equal(file.toString('ascii', 0, 4), 'glTF');
  assert.equal(file.readUInt32LE(8), file.length);
  const json = JSON.parse(file.toString('utf8', 20, 20 + file.readUInt32LE(12)));
  assert.ok(json.meshes.length > 0);
  if (asset.materials) for (const mesh of json.meshes) for (const primitive of mesh.primitives) {
    const name = json.materials[primitive.material].name;
    if (asset.materials[name]?.map) assert.ok(primitive.attributes.TEXCOORD_0 !== undefined, `${name}: ayrı dosyadan bağlanan doku için UV kaybolmuş`);
  }
  assert.ok(asset.points.muzzle[2] < -0.2, 'namlu ileriye (-Z) bakmalı');
  assert.ok(Math.abs(asset.points.muzzle[2] - asset.bounds.min[2]) < 0.04, 'namlu noktası gerçek modelin ucunda');
  assert.ok(asset.length >= 0.6 && asset.length <= 1.1);
  for (const part of asset.parts) assert.ok(json.nodes.some(n => n.name === part), `${part} düğümü yok`);
  if (id === 'ithaca37') assert.ok(asset.parts.includes('pump'));
  if (WEAPONS[id].reloadType === 'mag') assert.ok(asset.parts.includes('mag'));
  for (const maps of Object.values(asset.materials || {})) for (const texture of Object.values(maps)) assert.ok(existsSync(webFile(texture)), `${texture} yok`);
  assert.match(asset.credit.license, /CC-BY-4\.0/);
  assert.ok(asset.credit.author && asset.credit.source);
});
