// Dost ateşi: oyuncunun mermisi, bıçağı ve patlayıcısı Alfa askerini yaralar (src/friendlyFire.js, ally.js, grenades.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { allyZoneAt, friendlyBulletDamage, friendlyBlastDamage, shouldComplain } from '../src/friendlyFire.js';
import { FRIENDLY_FIRE, ALLY } from '../src/config.js';
import { ARMOR_DATA } from '../src/armor.js';
import { Health } from '../src/health.js';
import { Emitter } from '../src/util.js';
import SQUAD from '../src/data/squad.json' with { type: 'json' };

// Gerçek oyun kodu; yalnız görsel model fabrikaları DOM gerektirmeyen sahtelerle değiştirilir (ally-grenade.test.mjs gibi)
async function load(entry, stubs) {
  const out = await build({
    entryPoints: [fileURLToPath(new URL(entry, import.meta.url))],
    bundle: true, write: false, format: 'esm', platform: 'node',
    plugins: [{ name: 'headless', setup(b) {
      for (const [file, code] of Object.entries(stubs)) {
        b.onResolve({ filter: new RegExp(`${file.replace('.', '\\.')}$`) }, () => ({ path: file, namespace: 'headless' }));
      }
      b.onLoad({ filter: /.*/, namespace: 'headless' }, (a) => ({ contents: stubs[a.path] }));
      b.onResolve({ filter: /^three$/ }, () => ({ path: import.meta.resolve('three'), external: true }));
    } }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
}
const { Ally } = await load('../src/ally.js', { 'soldier.js': 'export function createSoldier() { throw new Error("testte yok"); }' });
const { applyRadialDamage } = await load('../src/grenades.js', { 'models.js': 'export const buildGrenade = () => null, buildSmokeGrenade = () => null, buildRocket = () => null;' });

test('bölge: isabetin askerin ayağından yüksekliği (oyuncuyla aynı kural), çömelmiş askerde boy kısalır', () => {
  const a = { pos: { y: 2 }, state: { height: 1.8 } };
  assert.equal(allyZoneAt(2 + 1.7, a), 'head');
  assert.equal(allyZoneAt(2 + 1.2, a), 'torso');
  assert.equal(allyZoneAt(2 + 0.3, a), 'leg');
  assert.equal(allyZoneAt(2 + 1.2, { pos: { y: 2 }, state: { height: 1.3 } }), 'head');
  assert.equal(allyZoneAt(1.2, { pos: { y: 0 } }), 'torso', 'durumu yoksa 1,8 m boy');
});

test('mermi: silah hasarı × silahın bölge çarpanı (bacak = limb) × dost çarpanı; patlayıcı oyuncunun kendi oranıyla', () => {
  const zones = { head: 2, torso: 1, limb: 0.7 };
  assert.equal(friendlyBulletDamage(30, 'head', zones), 60 * FRIENDLY_FIRE.bulletMult);
  assert.equal(friendlyBulletDamage(30, 'leg', zones), 30 * 0.7 * FRIENDLY_FIRE.bulletMult);
  assert.equal(friendlyBulletDamage(30, 'torso', null), 30 * FRIENDLY_FIRE.bulletMult, 'bıçak: bölge çarpanı yok');
  assert.equal(friendlyBlastDamage(100), 100 * FRIENDLY_FIRE.explosiveMult);
  assert.ok(FRIENDLY_FIRE.bulletMult > 0 && FRIENDLY_FIRE.explosiveMult > 0, 'dost ateşi açık');
});

test('uyarı: otomatik ateşte her mermide değil, en sık complainSec aralıkla', () => {
  assert.equal(shouldComplain(-100, 0), true);
  assert.equal(shouldComplain(10, 10 + FRIENDLY_FIRE.complainSec / 2), false);
  assert.equal(shouldComplain(10, 10 + FRIENDLY_FIRE.complainSec), true);
});

function allyFixture(hp = 140) {
  const said = [];
  const g = { time: 20, events: new Emitter(), player: { reviver: null }, difficultyKey: 'normal', mission: null, effects: { bloodPool() {} } };
  g.allies = { list: [], rescueT: 0, kindAt: new Map(), sayT: 0 };
  const a = Object.assign(Object.create(Ally.prototype), {
    game: g, member: SQUAD.members[0], callsign: SQUAD.members[0].callsign,
    pos: new THREE.Vector3(), health: new Health(hp), armor: null, down: false, rescueT: 0, complainAt: -100,
    targetVisible: true, model: { hit() {} }, S: { downTime: 10 }, order: { id: 'FOLLOW', cmd: null },
    say: (kind) => said.push(kind), sayLine: () => {}, registerReviveInteract() {}, releaseCover() {},
  });
  g.allies.list.push(a);
  return { g, a, said };
}

test('asker: oyuncunun mermisi canı düşürür, "vuruldum" yerine dost ateşi uyarısı; yere düşürürse olay oyuncuyu gösterir', () => {
  const { g, a, said } = allyFixture();
  const out = a.takeDamage(45, new THREE.Vector3(0, 0, 5), { zone: 'torso', pen: 0.3, source: 'player' });
  assert.deepEqual(out, { armorHit: false, downed: false });
  assert.equal(a.health.hp, 95);
  assert.ok(!said.includes('hit'), 'dost ateşinde "vuruldum" satırı yok');
  a.onFriendlyFire();
  a.onFriendlyFire();
  assert.deepEqual(said, ['friendly'], 'üst üste mermide tek uyarı');
  g.time += FRIENDLY_FIRE.complainSec;
  a.onFriendlyFire();
  assert.equal(said.filter((k) => k === 'friendly').length, 2);
  let downedBy = null;
  g.events.on('ALLY_DOWNED', (e) => (downedBy = e.by));
  assert.equal(a.takeDamage(200, null, { zone: 'head', source: 'player' }).downed, true);
  assert.equal(downedBy, 'player');
  assert.equal(a.takeDamage(10, null, { source: 'player' }), null, 'yerdeki asker ayrıca yaralanmaz');
});

test('asker: Tim Zırhı dost mermisini de silahın delmesiyle emer; bacak vuruşu doğrudan cana', () => {
  const { a } = allyFixture();
  a.armor = { points: 50, absorb: 0.5 };
  const out = a.takeDamage(40, null, { zone: 'torso', pen: 0, source: 'player' });
  assert.equal(out.armorHit, true);
  assert.ok(a.health.hp > 100, `zırh emdi (can ${a.health.hp})`);
  const leg = a.takeDamage(20, null, { zone: 'leg', pen: 0, source: 'player' });
  assert.equal(leg.armorHit, false);
});

function blastFixture() {
  const hits = [];
  const ally = {
    alive: true, pos: new THREE.Vector3(2, 0, 0), warned: 0,
    chestPos: (out) => out.set(2, 1.3, 0),
    takeDamage(dmg, from, hit) { hits.push({ dmg, hit }); return { armorHit: false, downed: false }; },
    onFriendlyFire() { this.warned++; },
  };
  const g = {
    world: { lineOfSight: () => true },
    player: { alive: false, pos: new THREE.Vector3(30, 0, 0), shake() {} },
    allies: { list: [ally] }, enemies: { list: [] }, barrels: [],
    events: new Emitter(), audio: { hitmarker() {} }, stats: { friendlyDamage: 0 },
  };
  return { g, ally, hits };
}

test('patlama: oyuncunun bombası dostu yaralar (dost çarpanı, patlama delmesi), manganınki yaralamaz, düşmanınki eskisi gibi', () => {
  const pos = new THREE.Vector3(0, 1.3, 0);
  const f = Math.pow(1 - 2 / 6, 1.4);
  let fx = blastFixture();
  let warned = 0;
  fx.g.events.on('friendlyFire', () => warned++);
  applyRadialDamage(fx.g, pos, 6, 100, 'player');
  assert.equal(fx.hits.length, 1);
  assert.ok(Math.abs(fx.hits[0].dmg - 100 * f * FRIENDLY_FIRE.explosiveMult) < 1e-9);
  assert.equal(fx.hits[0].hit.pen, ARMOR_DATA.explosivePen);
  assert.equal(fx.hits[0].hit.source, 'player');
  assert.ok(fx.g.stats.friendlyDamage > 0 && fx.ally.warned === 1 && warned === 1, 'asker uyardı, HUD olayı çıktı');

  fx = blastFixture();
  applyRadialDamage(fx.g, pos, 6, 100, 'ally');
  assert.equal(fx.hits.length, 0, 'manganın bombası dostu yaralamaz');

  fx = blastFixture();
  applyRadialDamage(fx.g, pos, 6, 100, 'enemy');
  assert.equal(fx.hits.length, 1);
  assert.ok(Math.abs(fx.hits[0].dmg - 100 * f * ALLY.damageTaken) < 1e-9);
  assert.equal(fx.ally.warned, 0, 'düşman patlamasında dost ateşi uyarısı yok');
});
