// Tuş atamaları (Operasyon Güncellemesi §3/6): çakışma taraması, varsayılandan fark, kayıttan uygulama
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BINDINGS, DEFAULT_BINDINGS, applyBindingOverrides } from '../src/input.js';
import { conflictsOf, diffFromDefaults } from '../src/bindingsUi.js';

test('varsayılan atamalarda çakışma yok (izinli paylaşımlar hariç)', () => {
  applyBindingOverrides({});
  const clashes = [];
  for (const [a, codes] of Object.entries(BINDINGS)) {
    if (/^weapon[3-9]$/.test(a)) continue; // poligona özgü silah tuşları sarf yuvalarıyla bilerek ortak
    for (const c of codes) for (const o of conflictsOf(a, c)) if (!/^weapon[3-9]$/.test(o)) clashes.push(`${a}/${o}:${c}`);
  }
  assert.deepEqual(clashes, []);
});

test('F tuşları tim komutlarında; konsol ` ve F10', () => {
  assert.deepEqual(BINDINGS.console, ['Backquote', 'F10']);
  for (const [a, k] of [['cmdFollow', 'F1'], ['cmdHold', 'F2'], ['cmdSuppress', 'F3'], ['cmdCover', 'F4'], ['cmdHeal', 'F5'], ['cmdHoldFire', 'F8'], ['cmdFreeFire', 'F9']]) {
    assert.deepEqual(BINDINGS[a], [k], a);
  }
});

test('değişen atama kayda yalnız fark olarak yazılır ve geri uygulanır', () => {
  applyBindingOverrides({ reload: ['KeyY'] });
  assert.deepEqual(BINDINGS.reload, ['KeyY']);
  assert.deepEqual(diffFromDefaults(), { reload: ['KeyY'] });
  assert.deepEqual(conflictsOf('fire', 'KeyY'), ['reload']);
  applyBindingOverrides({ bilinmeyen: ['KeyK'], jump: 'bozuk' });
  assert.deepEqual(BINDINGS.jump, [...DEFAULT_BINDINGS.jump], 'bozuk değer yok sayılır');
  assert.deepEqual(diffFromDefaults(), {});
});
