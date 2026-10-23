// Nişangâh kataloğu (data/sights.json): her silahın çözülen bir nişangâhı var, türler ve çizimler tutarlı
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sightFor, isScoped, canAim, hasReticle, sightLabel, SIGHT_TYPES, SIGHT_KINDS } from '../src/sights.js';
import { RETICLE_NAMES, SCOPE_RETICLES, scopeSvg } from '../src/reticles.js';
import { WEAPONS, WEAPON_ORDER } from '../src/config.js';
import SIGHTS from '../src/data/sights.json' with { type: 'json' };

const isPoint = (p) => Array.isArray(p) && p.length === 3 && p.every((v) => Number.isFinite(v));

test('her tür geçerli: tür çeşidi, işaret çizimi, renk ve boy', () => {
  for (const [id, t] of Object.entries(SIGHT_TYPES)) {
    assert.ok(SIGHT_KINDS.includes(t.kind), `${id}: bilinmeyen kind ${t.kind}`);
    assert.ok(t.name, `${id}: ad yok`);
    if (t.kind === 'reflex' || t.kind === 'prism') {
      assert.ok(RETICLE_NAMES.includes(t.reticle), `${id}: çizimi olmayan işaret ${t.reticle}`);
      assert.match(t.color, /^#[0-9a-f]{6}$/i, `${id}: renk`);
      assert.ok(t.size > 0 && t.size < 0.5, `${id}: boy ekranın küçük bir oranı olmalı`);
    }
    if (t.kind === 'scope') assert.ok(SCOPE_RETICLES.includes(t.reticle), `${id}: dürbün işareti ${t.reticle}`);
  }
});

test('katalogdaki her silah var, her silahın nişangâhı çözülür', () => {
  for (const id of Object.keys(SIGHTS.weapons)) assert.ok(WEAPONS[id], `katalogda olmayan silah: ${id}`);
  for (const id of WEAPON_ORDER) {
    const s = sightFor(id);
    assert.ok(SIGHT_TYPES[s.id], `${id}: tür`);
    assert.equal(sightFor(id), s, 'önbellekten aynı nesne (her karede bellek ayırmaz)');
    if (s.housing) {
      assert.ok(['tube', 'acog', 'box'].includes(s.housing.shape), `${id}: gövde biçimi`);
      assert.ok(s.housing.len > 0 && s.housing.len < 0.3, `${id}: gövde boyu`);
      if (s.housing.shape === 'box') assert.ok(s.housing.w > 0 && s.housing.h > 0, `${id}: pencere`);
      else assert.ok(s.housing.r > 0 && s.housing.r < 0.05, `${id}: tüp yarıçapı`);
    }
    for (const p of s.glow) assert.ok(isPoint(p), `${id}: parıltı noktası`);
    if (s.glow.length) assert.ok(s.glowColor, `${id}: parıltı noktası olan tür renk vermeli`);
  }
});

test('nişangâhlar birbirinden farklı: kolimatörlü silahlarda işaret ya da renk tekrar etmez', () => {
  const seen = new Map();
  for (const id of WEAPON_ORDER) {
    if (!hasReticle(id) && !isScoped(id)) continue;
    const s = sightFor(id);
    const key = `${s.reticle}|${s.color}`;
    assert.ok(!seen.has(key), `${id} ile ${seen.get(key)} aynı işareti kullanıyor`);
    seen.set(key, id);
  }
  assert.ok(seen.size >= 6, 'en az altı ayrı işaret');
});

test('dürbünlü, nişan alınamayan ve etiketler', () => {
  assert.ok(isScoped('sniper') && isScoped('kt9'));
  assert.ok(!isScoped('rifle') && !isScoped('mk4'));
  assert.ok(canAim('rifle'));
  assert.ok(hasReticle('mk4') && !hasReticle('k8'));
  assert.equal(sightLabel('lmg'), 'Taktik dürbün 3×');
  assert.equal(sightFor('yok-boyle-silah').id, 'iron', 'katalogda olmayan silah demir nişangâhlı');
});

test('dürbün işaretleri SVG üretir, aydınlatmalı olanlarda vurgu rengi var', () => {
  for (const [id, t] of Object.entries(SIGHT_TYPES)) {
    if (t.kind !== 'scope') continue;
    const svg = scopeSvg(t);
    assert.match(svg, /<(line|rect|polygon|circle)/, `${id}: çizim yok`);
    if (t.accent) assert.ok(svg.includes(t.accent), `${id}: vurgu rengi kullanılmadı`);
  }
});
