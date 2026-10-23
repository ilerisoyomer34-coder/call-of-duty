// Tek oyunculu davranışın referans ölçümü (çok oyunculu belge §4.5, Faz M1).
// Derlenmiş oyunu (dist/index.html) başsız Chromium'da poligonda açar; çizim kapalıyken oyun saatini
// doğrudan 1/60 sn adımlarla ilerletip hareket ve silah değerlerini ölçer.
// Kullanım:
//   node tools/baseline.mjs                 → Docs/baseline.json (+ Docs/BASELINE.md tablosu)
//   node tools/baseline.mjs --compare       → ölçer, baseline.json ile karşılaştırır; %2'yi aşan satırda çıkış 1
// Neden 1/60: tarayıcıdaki olağan kare süresi; sabit adımlı hareket (M1) bu kare süresiyle de aynı sonucu vermeli.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WEAPONS } from '../src/config.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const docs = join(root, '..', 'Docs');
const jsonPath = join(docs, 'baseline.json');
const mdPath = join(docs, 'BASELINE.md');
const compare = process.argv.includes('--compare');
// Karşılaştırmada izin verilen göreli fark; çok küçük değerlerde mutlak alt sınır (yuvarlama gürültüsü)
const TOL = 0.02;
const ABS = { m: 0.01, 's': 1 / 60 + 1e-6, 'm/s': 0.02, '°': 0.002, rpm: 1 };

// Fark sınırda mı: göreli %2 ya da birimin mutlak payı (abs: yalnız mutlak payla geçti)
function within(b, c, unit) {
  const d = Math.abs(c - b);
  const rel = d <= Math.abs(b) * TOL;
  const ok = rel || d <= (ABS[unit] ?? 1e-3);
  return { ok, abs: ok && !rel };
}

if (process.argv.includes('--md')) {
  // Ölçmeden: Docs/baseline.json ve baseline.after.json'dan tabloyu yeniden yazar
  const base = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const after = existsSync(join(docs, 'baseline.after.json')) ? JSON.parse(readFileSync(join(docs, 'baseline.after.json'), 'utf8')).values : null;
  writeMd(base, after);
  console.log(`Tablo yazıldı: ${mdPath}`);
  process.exit(0);
}

// Bıçak ve el bombası silah değil; roketatar tek atımlık (atış hızı ölçümü anlamsız) ama saçılması ölçülür
const weaponIds = Object.keys(WEAPONS).filter((id) => WEAPONS[id].category !== 'melee' && id !== 'knife');

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.addInitScript(() => {
  // Ölçüm tekrarlanabilir olsun: Math.random tohumlu (mulberry32)
  let a = 0x9e3779b9;
  Math.random = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  try {
    localStorage.setItem('demirsafak.settings.v1', JSON.stringify({ quality: 'low' }));
    localStorage.setItem('demirsafak.progress.v1', JSON.stringify({ unlocked: 6, best: {} }));
  } catch {
    /* depolama yok */
  }
});
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '', contentType: 'text/css' }));
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto(pathToFileURL(join(root, 'dist/index.html')).href);
await page.waitForFunction(() => window.__game && window.__game.state === 'menu' && document.getElementById('loading').hidden, null, { timeout: 120000 });
await page.evaluate(() => window.__game.startMode('range', 'normal'));
await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 120000 });

// Ortak düzenek: tüm ölçüm tek evaluate içinde, eşzamanlı (rAF araya giremez)
const SETUP = () => {
  const g = window.__game;
  const P = g.player;
  const I = g.input;
  const V = P.pos.constructor;
  g.renderFrame = () => {};
  I.lockFailed = true;
  g.cheats.god = true;
  g.cheats.infiniteAmmo = true;
  Object.assign(g.settings, { crouchMode: 'hold', sprintMode: 'hold', adsMode: 'hold' });
  const DT = 1 / 60;
  const step = (n = 1, each) => {
    for (let i = 0; i < n; i++) {
      g.updatePlaying(DT);
      I.endFrame();
      if (each) each(i);
    }
  };
  const hold = (...codes) => {
    I.down.clear();
    for (const c of codes) I.down.add(c);
  };
  const tap = (c) => {
    I.pressedCodes.add(c);
    I.down.add(c);
  };
  // Açık şerit: diz ve göğüs yüksekliğinde 45 m boyunca engelsiz, zemin düz
  let lane = null;
  for (let k = 0; k < 72 && !lane; k++) {
    const yaw = (k / 72) * Math.PI * 2;
    const d = new V(-Math.sin(yaw), 0, -Math.cos(yaw));
    for (const start of [P.pos.clone(), new V(0, 0, 0), new V(0, 0, 20), new V(0, 0, -20)]) {
      const ok = [0.3, 1.0, 1.7].every((h) => !g.world.raycast(start.clone().setY(h), d, 45));
      const side = new V(-d.z, 0, d.x);
      const wide = [-0.5, 0.5].every((o) => !g.world.raycast(start.clone().addScaledVector(side, o).setY(0.3), d, 45));
      if (ok && wide) {
        lane = { start, yaw };
        break;
      }
    }
  }
  if (!lane) throw new Error('Poligonda açık şerit bulunamadı');
  const place = () => {
    P.reset(lane.start.clone(), lane.yaw);
    P.vel.set(0, 0, 0);
    hold();
    step(10);
  };
  return { g, P, I, V, DT, step, hold, tap, place, lane };
};

const movement = await page.evaluate(([setupSrc]) => {
  const { P, I, DT, step, hold, tap, place } = new Function(`return (${setupSrc})()`)();
  const out = {};
  const hs = () => Math.hypot(P.vel.x, P.vel.z);
  // Hızlanma: 1,5 sn basılı; tepe hız son 0,3 sn ortalaması, %95'e çıkış süresi
  const accel = (label, codes, secs = 1.5) => {
    place();
    hold(...codes);
    const v = [];
    step(Math.round(secs / DT), () => v.push(hs()));
    const tail = v.slice(-Math.round(0.3 / DT));
    const top = tail.reduce((a, b) => a + b, 0) / tail.length;
    const i95 = v.findIndex((x) => x >= top * 0.95);
    out[`${label}.topSpeed`] = { v: top, unit: 'm/s' };
    out[`${label}.t95`] = { v: (i95 + 1) * DT, unit: 's' };
    return top;
  };
  accel('walk', ['KeyW']);
  // Durma mesafesi: yürürken bırak, hız 0,01'in altına inene dek
  {
    const p0 = P.pos.clone();
    hold();
    let n = 0;
    while (hs() > 0.01 && n < 120) {
      step(1);
      n++;
    }
    out['walk.stopDist'] = { v: Math.hypot(P.pos.x - p0.x, P.pos.z - p0.z), unit: 'm' };
    out['walk.stopTime'] = { v: n * DT, unit: 's' };
  }
  accel('sprint', ['KeyW', 'ShiftLeft']);
  accel('crouch', ['KeyW', 'KeyC']);
  accel('strafe', ['KeyD']);
  accel('back', ['KeyS']);
  accel('ads', ['KeyW', 'Mouse2']);
  // Zıplama: duruştan; tepe yükseklik ve havada kalma süresi
  {
    place();
    const y0 = P.pos.y;
    tap('Space');
    let peak = 0;
    let n = 0;
    step(1);
    hold();
    n++;
    while (!P.state.grounded && n < 180) {
      step(1);
      n++;
      peak = Math.max(peak, P.pos.y - y0);
    }
    out['jump.height'] = { v: peak, unit: 'm' };
    out['jump.airTime'] = { v: n * DT, unit: 's' };
  }
  // Koşarak zıplama: yatay mesafe
  {
    place();
    hold('KeyW', 'ShiftLeft');
    step(90);
    const p0 = P.pos.clone();
    tap('Space');
    step(1);
    let n = 1;
    while (!P.state.grounded && n < 180) {
      step(1);
      n++;
    }
    out['sprintJump.dist'] = { v: Math.hypot(P.pos.x - p0.x, P.pos.z - p0.z), unit: 'm' };
    hold();
  }
  // 1 sn yürüyüş mesafesi (duruştan)
  {
    place();
    const p0 = P.pos.clone();
    hold('KeyW');
    step(60);
    out['walk.dist1s'] = { v: Math.hypot(P.pos.x - p0.x, P.pos.z - p0.z), unit: 'm' };
    hold();
  }
  // Çömelme geçişi: boyun 1,15 m'ye %95 inmesi
  {
    place();
    hold('KeyC');
    let n = 0;
    while (P.state.height > 1.8 - (1.8 - 1.15) * 0.95 && n < 120) {
      step(1);
      n++;
    }
    out['crouchDown.t95'] = { v: n * DT, unit: 's' };
    hold();
  }
  return out;
}, [SETUP.toString()]);

const weapons = await page.evaluate(([setupSrc, ids]) => {
  const { g, P, I, DT, step, hold, place } = new Function(`return (${setupSrc})()`)();
  const W = g.weapons;
  const out = {};
  const DEG = 180 / Math.PI;
  for (const id of ids) {
    place();
    W.give(id, true);
    W.switchTo(id);
    step(120);
    const w = W.current;
    if (!w || w.id !== id) continue;
    const d = w.data;
    // Geri tepmenin rastgele payı ölçümde kapalı: desen kendisi karşılaştırılır
    const rnd = d.recoil.random;
    d.recoil.random = 0;
    w.modeIdx = 0;
    w.bloom = 0;
    w.mag = d.magSize;
    out[`${id}.spread.hip0`] = { v: W.currentSpread(), unit: '°' };
    // ADS saçılması: nişana tam girilmiş
    hold('Mouse2');
    step(Math.ceil((d.ads.time * 2) / DT));
    out[`${id}.spread.ads0`] = { v: W.currentSpread(), unit: '°' };
    hold();
    step(Math.ceil((d.ads.time * 2) / DT));
    // Atış hızı ve sprey: 2 sn basılı (yarı otomatikte her kare yeni basış); atış sayısı 'fired' olayından
    let shots = 0;
    const spreadAt = {};
    const recoilAt = {};
    const onFired = () => {
      shots++;
      if (shots === 10 || shots === 30) {
        spreadAt[shots] = W.currentSpread();
        recoilAt[shots] = { p: P.recoil.tp * DEG, y: P.recoil.ty * DEG };
      }
    };
    g.events.on('fired', onFired);
    P.recoil.tp = P.recoil.ty = 0;
    const auto = w.mode === 'auto';
    const secs = 2;
    step(Math.round(secs / DT), () => {
      if (auto) I.down.add('Mouse0');
      else if (!I.down.has('Mouse0')) {
        I.pressedCodes.add('Mouse0');
        I.down.add('Mouse0');
      } else I.down.delete('Mouse0');
    });
    hold();
    g.events.off('fired', onFired);
    if (d.projectile !== 'rocket') out[`${id}.rpm`] = { v: (shots / secs) * 60, unit: 'rpm' };
    if (spreadAt[10] !== undefined) out[`${id}.spread.after10`] = { v: spreadAt[10], unit: '°' };
    if (spreadAt[30] !== undefined) out[`${id}.spread.after30`] = { v: spreadAt[30], unit: '°' };
    if (recoilAt[10]) {
      out[`${id}.recoil.pitch10`] = { v: recoilAt[10].p, unit: '°' };
      out[`${id}.recoil.yaw10`] = { v: recoilAt[10].y, unit: '°' };
    }
    // Toparlanma: bıraktıktan 0,5 sn sonra kalan tepme
    step(30);
    // Roketin tepmesine patlama sarsıntısı karışır (isabet noktası rastgele): yalnız mermili silahlar
    if (d.projectile !== 'rocket') out[`${id}.recoil.after05`] = { v: P.recoil.tp * DEG, unit: '°' };
    d.recoil.random = rnd;
  }
  return out;
}, [SETUP.toString(), weaponIds]);

await browser.close();
if (pageErrors.length) {
  console.error('Sayfa hataları:', pageErrors.slice(0, 5));
  process.exit(1);
}

const result = { ...movement, ...weapons };
function fmt(x, unit) {
  return unit === 'rpm' ? x.toFixed(0) : x.toFixed(3);
}

// Docs/BASELINE.md: ölçüm tablosu; karşılaştırmadan sonra "M1 sonrası" ve fark sütunlarıyla
function writeMd(base, after) {
  const L = [];
  L.push('# BASELINE — tek oyunculu referans ölçümleri');
  L.push('');
  L.push('Çok oyunculu güncelleme (Faz M1) hareket, çarpışma ve silah kodunu paylaşılan simülasyona (`web/shared/sim/`) taşıdı.');
  L.push('Bu tablo, taşımadan önceki tek oyunculu davranışı ve taşımadan sonraki ölçümü karşılaştırır. Kabul ölçütü: her satırda fark ≤ %2.');
  L.push('Zaman ölçümleri kare çözünürlüğündedir (1/60 sn): hareket artık 1/64 sn tick ile ilerlediği için bir eşiğin hangi karede aşıldığı bir kare kayabilir; bu yüzden zamanda bir kare, mesafede 1 cm, hızda 0,02 m/s mutlak pay vardır (çok küçük değerlerde yüzde yanıltıcı).');
  L.push('');
  L.push('- Ölçüm aracı: `cd web && node tools/baseline.mjs` (ölç ve kaydet), `node tools/baseline.mjs --compare` (karşılaştır).');
  L.push('- Yöntem: poligonda açık bir şerit; çizim kapalı, oyun saati 1/60 sn adımlarla doğrudan ilerletilir; girdi tuş durumuyla verilir. `Math.random` tohumludur, geri tepmenin rastgele payı ölçümde kapalıdır (desenin kendisi karşılaştırılır).');
  L.push(`- Referans commit: \`${base.commit}\`.`);
  L.push('- Bot davranışı M1\'de değişmedi (düşman/dost kodu taşınmadı); bu yüzden ölçülmedi.');
  L.push('- Yarı otomatik silahlarda "rpm" her iki karede bir basışla ölçülen en yüksek tempodur (1/60 sn kare süresine bağlı).');
  L.push('');
  L.push(after ? '| Ölçüt | Birim | Önce | M1 sonrası | Fark | Durum |' : '| Ölçüt | Birim | Değer |');
  L.push(after ? '|---|---|---:|---:|---:|---|' : '|---|---|---:|');
  let bad = 0;
  for (const [k, { v, unit }] of Object.entries(base.values)) {
    if (!after) {
      L.push(`| ${k} | ${unit} | ${fmt(v, unit)} |`);
      continue;
    }
    const c = after[k]?.v;
    const r = c === undefined ? null : within(v, c, unit);
    if (!r?.ok) bad++;
    // Zamanda fark kare cinsinden de yazılır: yüzde, birkaç karelik değerlerde yanıltıcı
    let diff = c === undefined ? '—' : v ? `${(((c - v) / Math.abs(v)) * 100).toFixed(2)} %` : c === v ? '0' : `${(c - v).toFixed(3)}`;
    if (c !== undefined && unit === 's' && c !== v) diff += ` (${c > v ? '+' : '−'}${Math.round(Math.abs(c - v) * 60)} kare)`;
    const st = !r ? '✗ ölçülemedi' : !r.ok ? '✗' : r.abs ? '✓ mutlak pay' : '✓';
    L.push(`| ${k} | ${unit} | ${fmt(v, unit)} | ${c === undefined ? '—' : fmt(c, unit)} | ${diff} | ${st} |`);
  }
  if (after) {
    L.push('');
    L.push(bad ? `**Sonuç:** ${bad} ölçüm sınırı aştı.` : `**Sonuç:** ${Object.keys(base.values).length} ölçümün tamamı sınır içinde.`);
  }
  writeFileSync(mdPath, L.join('\n') + '\n');
}

if (!compare) {
  const commit = (() => {
    try {
      const head = readFileSync(join(root, '..', '.git', 'HEAD'), 'utf8').trim();
      const ref = head.startsWith('ref: ') ? readFileSync(join(root, '..', '.git', head.slice(5)), 'utf8').trim() : head;
      return ref.slice(0, 7);
    } catch {
      return '?';
    }
  })();
  const data = { commit, dt: '1/60', values: result };
  writeFileSync(jsonPath, JSON.stringify(data, null, 2) + '\n');
  writeMd(data, null);
  console.log(`${Object.keys(result).length} ölçüm → ${jsonPath} (commit ${commit})`);
  for (const [k, { v, unit }] of Object.entries(result)) console.log(`  ${k.padEnd(28)} ${fmt(v, unit)} ${unit}`);
  process.exit(0);
}

// Karşılaştırma
if (!existsSync(jsonPath)) {
  console.error('Docs/baseline.json yok: önce karşılaştırmasız çalıştır');
  process.exit(1);
}
const base = JSON.parse(readFileSync(jsonPath, 'utf8'));
let bad = 0;
for (const [k, { v: b, unit }] of Object.entries(base.values)) {
  const cur = result[k];
  if (!cur) {
    bad++;
    console.log(`  ✗ ${k}: ölçülemedi`);
    continue;
  }
  const { ok } = within(b, cur.v, unit);
  if (!ok) bad++;
  console.log(`  ${ok ? '✓' : '✗'} ${k.padEnd(28)} ${fmt(b, unit)} → ${fmt(cur.v, unit)} ${unit}${b ? ` (${(((cur.v - b) / Math.abs(b)) * 100).toFixed(2)} %)` : ''}`);
}
writeFileSync(join(docs, 'baseline.after.json'), JSON.stringify({ dt: '1/60', values: result }, null, 2) + '\n');
writeMd(base, result);
console.log(bad ? `${bad} ölçüm %${TOL * 100}'den fazla saptı` : `Tüm ölçümler BASELINE ile %${TOL * 100} içinde`);
process.exit(bad ? 1 : 0);
