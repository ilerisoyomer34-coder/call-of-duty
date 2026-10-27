// Akıcılık (src/framePacing.js): kare hızı sınırı ve uyarlanır dünya çözünürlüğü
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FrameLimiter, DynamicResolution, resolveFpsCap, targetFrameMs } from '../src/framePacing.js';
import { FRAME } from '../src/config.js';

const D = FRAME.dynamicRes;
// Bir pencere boyunca sabit kare süresi
const windowOf = (dr, ms, target = 1000 / 60) => {
  let changed = false;
  for (let t = 0; t < D.windowMs; t += ms) changed = dr.sample(ms, target) || changed;
  return changed;
};

test('sınır ayarı: otomatik dokunmatikte 60, masaüstünde sınırsız; sayı ya da 0', () => {
  assert.equal(resolveFpsCap('auto', true, FRAME), FRAME.touchCap);
  assert.equal(resolveFpsCap('auto', false, FRAME), 0);
  assert.equal(resolveFpsCap('30', false, FRAME), 30);
  assert.equal(resolveFpsCap('0', true, FRAME), 0);
  assert.equal(resolveFpsCap('bozuk', true, FRAME), 0);
  assert.equal(Math.round(targetFrameMs(0, FRAME)), 17);
  assert.equal(Math.round(targetFrameMs(30, FRAME)), 33);
  assert.equal(Math.round(targetFrameMs(240, FRAME)), 8);
});

test('kare sınırı: 120 Hz ve 144 Hz ekranda ortalama 60 kare, 60 Hz ekranda 30 sınırı', () => {
  const count = (hz, cap, secs = 4) => {
    const L = new FrameLimiter(FRAME);
    let n = 0;
    for (let i = 0; i < secs * hz; i++) if (L.ready((i * 1000) / hz, cap)) n++;
    return n / secs;
  };
  assert.ok(Math.abs(count(120, 60) - 60) <= 1, `120 Hz → ${count(120, 60)}`);
  assert.ok(Math.abs(count(144, 60) - 60) <= 1.5, `144 Hz → ${count(144, 60)}`);
  assert.ok(Math.abs(count(60, 30) - 30) <= 1, `60 Hz/30 → ${count(60, 30)}`);
  assert.equal(count(60, 0), 60, 'sınırsızda her kare');
  // Uzun takılmadan sonra biriken kareler arka arkaya çizilmez
  const L = new FrameLimiter(FRAME);
  L.ready(0, 60);
  assert.equal(L.ready(1000, 60), true);
  assert.equal(L.ready(1004, 60), false);
});

test('uyarlanır çözünürlük: hedef aşılınca küçülür, alt sınırda durur', () => {
  const dr = new DynamicResolution(D);
  let steps = 0;
  // Küçültme her seferinde kare süresini düşürüyormuş gibi (ekran kartı darboğazı): süre ölçekle orantılı
  for (let i = 0; i < 20; i++) {
    const ms = 30 * dr.scale * dr.scale;
    if (windowOf(dr, ms)) steps++;
  }
  assert.ok(steps > 0 && dr.scale < 1, `ölçek ${dr.scale}`);
  assert.ok(dr.scale >= D.min - 1e-9);
});

test('uyarlanır çözünürlük: küçültme işe yaramazsa (işlemci darboğazı) geri alınır ve bir süre denenmez', () => {
  const dr = new DynamicResolution(D);
  assert.equal(windowOf(dr, 25), true, 'ilk pencere küçültür');
  const small = dr.scale;
  assert.ok(small < 1);
  assert.equal(windowOf(dr, 25), true, 'kare süresi aynı: geri al');
  assert.equal(dr.scale, 1);
  for (let i = 0; i < D.cpuBoundWindows - 1; i++) assert.equal(windowOf(dr, 25), false, `${i}. pencerede yeniden denenmez`);
});

test('uyarlanır çözünürlük: rahatlayınca kademeyle büyür; büyütme hedefi bozarsa geri alınır, denemeler seyrekleşir', () => {
  const dr = new DynamicResolution(D);
  dr.scale = 0.7;
  // Ekran senkronunda kare süresi hedefte (16,7 ms): hedefi tutan pencereler birikince büyütür
  let changed = false;
  for (let i = 0; i < D.upAfterWindows; i++) changed = windowOf(dr, 16.7) || changed;
  assert.equal(changed, true);
  const tried = dr.scale;
  assert.ok(tried > 0.7);
  // Büyütmeden sonra hedef bozuldu: geri dön
  assert.equal(windowOf(dr, 22), true);
  assert.ok(Math.abs(dr.scale - 0.7) < 1e-9);
  // Sonraki deneme daha geç
  let n = 0;
  while (!windowOf(dr, 16.7) && n < 100) n++;
  assert.ok(n + 1 >= D.upAfterWindows * 2, `ikinci deneme ${n + 1}. pencerede`);
});

test('uyarlanır çözünürlük: takılmalar ve geçersiz süreler sayılmaz', () => {
  const dr = new DynamicResolution(D);
  for (let i = 0; i < 50; i++) assert.equal(dr.sample(D.hitchMs + 50, 16.7), false);
  assert.equal(dr.sample(0, 16.7), false);
  assert.equal(dr.sample(Number.NaN, 16.7), false);
  assert.equal(dr.scale, 1);
});
