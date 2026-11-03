// Saat eşitleme ve ağ benzetimi (shared/net/clock.js, netsim.js): sahte saatle Orta/Kötü profilde saat farkı
// hatası < 5 ms, sıra korunur, gecikme dağılımı profile uyar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ClockSync } from '../shared/net/clock.js';
import { NetSim, LOSS_SPIKE_MS } from '../shared/net/netsim.js';
import { memoryPair } from '../shared/net/transport.js';
import { mulberry32 } from '../shared/sim/rng.js';
import NETSIM from '../src/data/netsim.json' with { type: 'json' };

// Sahte dünya: istemci saati sunucudan `skew` ms geride; iletiler iki yönlü NetSim'den geçer
function world(profile, skew, seed = 1) {
  let t = 0; // gerçek zaman (ms)
  const rnd = mulberry32(seed);
  const clock = new ClockSync(() => t - skew);
  const toClient = new NetSim({ now: () => t, random: rnd, deliver: (m) => clock.onPong(m.clientTime, m.serverTime) });
  const toServer = new NetSim({ now: () => t, random: rnd, deliver: (m) => toClient.send({ clientTime: m.clientTime, serverTime: t }) });
  toClient.setProfile(profile);
  toServer.setProfile(profile);
  const step = (ms) => {
    for (let i = 0; i < ms; i++) {
      t++;
      if (clock.due()) toServer.send({ clientTime: t - skew });
      toServer.pump(t);
      toClient.pump(t);
    }
  };
  return { clock, step, now: () => t };
}

for (const key of ['lan', 'orta', 'kotu']) {
  test(`saat eşitleme: ${key} profilinde fark < 5 ms`, () => {
    const W = world(NETSIM.profiles[key], 123456.5, 11);
    W.step(12000);
    assert.ok(W.clock.synced);
    const err = Math.abs(W.clock.serverTimeNow() - W.now());
    assert.ok(err < 5, `hata ${err.toFixed(2)} ms`);
    // Ölçülen gidiş-dönüş profile yakın (kayıp sıçramaları medyanı bozmaz)
    const rtt = NETSIM.profiles[key].rtt;
    assert.ok(Math.abs(W.clock.rtt - rtt) < Math.max(4, rtt * 0.25), `rtt ${W.clock.rtt} ≈ ${rtt}`);
    // Tick tahmini saatle tutarlı
    assert.ok(Math.abs(W.clock.serverTickNow() - (W.now() * 64) / 1000) < 0.4);
  });
}

test('saat eşitleme: büyük sapma hemen düzeltilir', () => {
  const W = world(NETSIM.profiles.iyi, 0, 2);
  W.step(3000);
  W.clock.offset += 900; // istemci saati sıçradı (uyku, sekme)
  W.step(1500);
  assert.ok(Math.abs(W.clock.serverTimeNow() - W.now()) < 5);
  assert.ok(W.clock.resyncs >= 1);
});

test('ağ benzetimi: sıra korunur, gecikme ve kayıp sıçraması profile uyar', () => {
  let t = 0;
  const got = [];
  const sim = new NetSim({ now: () => t, random: mulberry32(5), deliver: (m) => got.push({ m, at: t }) });
  sim.setProfile(NETSIM.profiles.orta); // tek yön 50 ms ± 7,5, %0,5 kayıp; 64 Hz gönderim
  for (let i = 0; i < 2000; i++) {
    sim.send(i);
    t += 15;
    sim.pump(t);
  }
  t += 5000;
  sim.pump(t);
  assert.equal(got.length, 2000);
  for (let i = 0; i < got.length; i++) assert.equal(got[i].m, i, 'sıra');
  const delays = got.map((g, i) => g.at - i * 15);
  const sorted = [...delays].sort((a, b) => a - b);
  const median = sorted[1000];
  assert.ok(median >= 42 && median <= 70, `medyan ${median}`);
  assert.ok(sorted[0] >= 42, `en kısa ${sorted[0]}`);
  assert.ok(sim.spikes >= 3 && sim.spikes < 30, `sıçrama ${sim.spikes}`);
  // Kayıp: o ileti gidiş-dönüş + 200 ms gecikir, arkasındakiler sırayı bozmadan bekler (TCP)
  assert.ok(sorted[sorted.length - 1] >= 50 + LOSS_SPIKE_MS, 'kayıp gecikmesi görünür');
  // Profil yoksa anında teslim
  const direct = [];
  const s2 = new NetSim({ now: () => 0, random: Math.random, deliver: (m) => direct.push(m) });
  s2.send('a');
  assert.deepEqual(direct, ['a']);
});

test('bellek içi taşıma: iki uç, istatistik, kapanış', async () => {
  const [a, b] = memoryPair();
  const got = [];
  b.onmessage = (m) => got.push([...m]);
  let closed = 0;
  a.onclose = () => closed++;
  b.onclose = () => closed++;
  a.send(new Uint8Array([1, 2, 3]));
  a.send(new Uint8Array([4]));
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(got, [[1, 2, 3], [4]]);
  assert.equal(a.stats.bytesOut, 4);
  assert.equal(b.stats.msgsIn, 2);
  a.close();
  await Promise.resolve();
  assert.equal(closed, 2);
  b.send(new Uint8Array([9]));
  assert.equal(a.stats.msgsIn, 0);
});
