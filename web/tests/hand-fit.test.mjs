// El oturtma (tools/fit-hands.mjs → src/data/handFit.json): dosya modellerle güncel olmalı; her silahın iki eli de
// ölçülmüş olmalı (ince ya da karmaşık tutamaklı birkaç silah WEAPON_AIM ipucuyla kalır, bilerek).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS, WEAPON_ORDER } from '../src/config.js';
import HAND_FIT from '../src/data/handFit.json' with { type: 'json' };
import { fitAll } from '../tools/handFitLib.mjs';

// Ölçülemeyip ipucuyla kalanlar: MG4 ve AWM'nin kabzası dipçiğe karışık (başparmak delikli), MP7'nin kabzası şarjörle
// bir (kabzadan derin), minigunun arka tutamağı ince tüp
const HINTED = new Set(['lmg/right', 'awm/right', 'minigun/right', 'mp7/right']);

const fit = await fitAll();

test('handFit.json modellerle güncel (değiştiyse: node tools/fit-hands.mjs)', () => {
  const values = Object.fromEntries(Object.entries(fit).map(([id, { notes, ...f }]) => [id, f]));
  assert.deepEqual(HAND_FIT, JSON.parse(JSON.stringify(values)));
});

test('her silahın iki eli de ölçülü, ipucuyla kalanlar bilinen liste', () => {
  for (const id of WEAPON_ORDER.filter((id) => !WEAPONS[id].melee)) {
    assert.ok(HAND_FIT[id], `${id}: el noktası yok`);
    for (const side of ['left', 'right']) {
      const hinted = fit[id].notes.some((n) => n.startsWith(`${side}:`) && /ipucu kaldı/.test(n));
      assert.equal(hinted, HINTED.has(`${id}/${side}`), `${id}/${side}: ${fit[id].notes.join('; ')}`);
    }
  }
});
