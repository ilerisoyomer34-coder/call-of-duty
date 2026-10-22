// Sinematik telsiz görüntüsü (src/commsCam.js): kimin çekileceği ve satırın ekranda kalma süresi
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMMS_CAM } from '../src/config.js';
import { speakerShot, lineSeconds } from '../src/commsShot.js';

test('konuşana göre çekim: asker canlı, karargâh/pilot/düşman stüdyoda, sistem satırı çekilmez', () => {
  const ally = { member: { callsign: 'Alfa-2' } };
  assert.equal(speakerShot('Alfa-2 Çavuş', 'ally', ally), 'ally');
  assert.equal(speakerShot('YUVA', 'system', null), 'hq');
  assert.equal(speakerShot('Karargâh', 'system', null), 'hq');
  assert.equal(speakerShot('PİLOT', 'system', null), 'pilot');
  assert.equal(speakerShot('Tüfekçi', 'enemy', null), 'enemy');
  assert.equal(speakerShot('Tüfekçi', 'warn', null), 'enemy');
  for (const who of ['TELSİZ', 'POLİGON', 'İPUCU']) assert.equal(speakerShot(who, 'system', null), null, who);
  for (const shot of ['hq', 'pilot', 'enemy']) assert.ok(COMMS_CAM.studio[shot] && COMMS_CAM.labels[shot].name, shot);
});

test('satır süresi okuma hızına göre, alt ve üst sınırlı', () => {
  assert.equal(lineSeconds(''), COMMS_CAM.minSec);
  assert.ok(Math.abs(lineSeconds('Tamam') - (COMMS_CAM.minSec + 5 * COMMS_CAM.perChar)) < 1e-9);
  assert.equal(lineSeconds('x'.repeat(1000)), COMMS_CAM.maxSec);
  const mid = lineSeconds('x'.repeat(60));
  assert.ok(mid > COMMS_CAM.minSec && mid < COMMS_CAM.maxSec);
});
