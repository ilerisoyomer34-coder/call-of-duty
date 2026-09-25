// Duman testi: derlenmiş oyunu başsız Chromium'da açar, menü → görev → poligon akışlarını
// sürer, hata olup olmadığını denetler ve ekran görüntüleri alır (tools/shots/).
// Kullanım: npm test   (önce derler)
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shots = join(root, 'tools/shots');
mkdirSync(shots, { recursive: true });
const THREE_VERSION = JSON.parse(readFileSync(join(root, 'node_modules/three/package.json'), 'utf8')).version;
const THREE_CDN = `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/build/three.module.min.js`;

const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
function check(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failed++;
    console.log(`  ✗ ${msg}`);
  }
}

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});

async function openPage(kind, quality = 'low') {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  // Yazılımsal GPU'da akış testleri düşük kalitede koşar; görsel kontrol için 'high'
  await page.addInitScript((q) => {
    try {
      localStorage.setItem('demirsafak.settings.v1', JSON.stringify({ quality: q }));
    } catch {
      /* depolama yok */
    }
  }, quality);
  page.on('pageerror', (e) => errors.push(`[${kind}] pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[${kind}] console: ${m.text()}`);
  });
  // Dış kaynaklar (Google Fonts) test ortamında engelli olabilir
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '', contentType: 'text/css' }));
  await page.route(THREE_CDN, (r) =>
    r.fulfill({ status: 200, contentType: 'text/javascript', body: readFileSync(join(root, 'node_modules/three/build/three.module.min.js'), 'utf8') })
  );
  if (kind === 'artifact') {
    const html = readFileSync(join(root, 'dist/artifact.html'), 'utf8');
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`);
  } else {
    await page.goto(pathToFileURL(join(root, 'dist/index.html')).href);
  }
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 30000 });
  return page;
}

const state = (page) => page.evaluate(() => window.__game.state);
// Yazılımsal render yavaş olabilir: gerçek süre yerine oyun zamanını bekle
async function waitGame(page, sec) {
  const t0 = await page.evaluate(() => window.__game.time);
  await page.waitForFunction((t) => window.__game.time >= t || !['playing', 'dying', 'menu'].includes(window.__game.state), t0 + sec, { timeout: 180000, polling: 50 });
}

// ---------------- Bağımsız sürüm: görev ----------------
console.log('Görsel kontrol (yüksek kalite)');
{
  const page = await openPage('standalone', 'high');
  await sleep(1500);
  await page.screenshot({ path: join(shots, '00-menu-high.png') });
  await page.click('#btnPlay');
  await page.click('#diffList .diff:nth-child(2)');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 30000 });
  await page.evaluate(() => {
    const g = window.__game;
    g.cheats.god = true;
    g.player.reset(new g.player.pos.constructor(-2, 0, 48), 0.3);
  });
  await waitGame(page, 0.6);
  await page.screenshot({ path: join(shots, '00-village-high.png') });
  check((await page.evaluate(() => window.__game.player.pitch)) === 0, 'Kilitlenmede kamera sıçramadı');
  await page.close();
}

console.log('Bağımsız sürüm (dist/index.html)');
{
  const page = await openPage('standalone');
  await sleep(1500);
  await page.screenshot({ path: join(shots, '01-menu.png') });
  check((await state(page)) === 'menu', 'Ana menü açıldı');

  await page.click('#btnPlay');
  await sleep(200);
  check(await page.isVisible('#diffScreen'), 'Zorluk ekranı görünüyor');
  await page.click('#diffList .diff:nth-child(2)');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 30000 });
  check(true, 'Görev başladı');
  await page.evaluate(() => {
    window.__game.input.lockFailed = true;
  });
  const info = await page.evaluate(() => {
    const g = window.__game;
    return {
      enemies: g.enemies.list.length,
      colliders: g.world.colliders.length,
      covers: g.nav.covers.length,
      weapon: g.weapons.current?.data.name,
      calls: g.renderer.info.render.calls,
    };
  });
  console.log('   ', JSON.stringify(info));
  check(info.enemies >= 25, `Düşmanlar yerleşti (${info.enemies})`);
  check(info.covers > 100, `Siper noktaları üretildi (${info.covers})`);
  check(info.weapon === 'AR-7 Vanguard', 'Başlangıç silahı AR-7');
  await sleep(1500);
  await page.screenshot({ path: join(shots, '02-start.png') });

  // Yürü ve ateş et
  const p0 = await page.evaluate(() => window.__game.player.pos.z);
  await page.keyboard.down('KeyW');
  await waitGame(page, 1.2);
  await page.keyboard.up('KeyW');
  const p1 = await page.evaluate(() => window.__game.player.pos.z);
  check(p1 < p0 - 2, `W ile ileri yürüdü (${(p0 - p1).toFixed(1)} m)`);
  const mag0 = await page.evaluate(() => window.__game.weapons.current.mag);
  await page.mouse.move(640, 360);
  await page.mouse.down();
  await waitGame(page, 0.4);
  await page.mouse.up();
  const mag1 = await page.evaluate(() => window.__game.weapons.current.mag);
  check(mag1 < mag0, `Otomatik ateş cephane harcadı (${mag0} → ${mag1})`);
  await page.keyboard.press('KeyR');
  await waitGame(page, 2.6);
  const mag2 = await page.evaluate(() => window.__game.weapons.current.mag);
  check(mag2 >= 30, `Reload şarjörü doldurdu (${mag2})`);

  // Kontrol noktasına yaklaş, düşmanlar fark etsin
  await page.evaluate(() => {
    const g = window.__game;
    g.player.reset(new g.player.pos.constructor(0, 0, 84), 0);
  });
  await waitGame(page, 1.0);
  const hpEarly = await page.evaluate(() => window.__game.player.health.hp);
  check(hpEarly > 0, `Çatışma bölgesinde ilk saniyede ölmedi (can ${Math.round(hpEarly)})`);
  await page.mouse.down({ button: 'right' });
  await waitGame(page, 0.4);
  await page.screenshot({ path: join(shots, '03-ads-outpost.png') });
  await page.mouse.down();
  await waitGame(page, 0.25);
  await page.mouse.up();
  await page.mouse.up({ button: 'right' });
  await waitGame(page, 2.5);
  const combat = await page.evaluate(() => window.__game.enemies.list.filter((e) => e.aiState === 'combat').length);
  check(combat > 0, `Silah sesi düşmanları alarma geçirdi (${combat} çatışmada)`);
  const taken = await page.evaluate(() => window.__game.stats.damageTaken);
  await page.evaluate(() => (window.__game.cheats.god = true));
  console.log(`    açıkta ~3.5 sn: alınan hasar ${Math.round(taken)}`);
  await waitGame(page, 2);
  await page.screenshot({ path: join(shots, '04-firefight.png') });
  const shotsFired = await page.evaluate(() => window.__game.enemies.list.filter((e) => e.lastFired > 0).length);
  check(shotsFired > 0, `Düşmanlar karşılık verdi (${shotsFired} ateş eden)`);

  // Düşmanı vur: en yakın düşmana dön ve ateş et
  const killResult = await page.evaluate(async () => {
    const g = window.__game;
    g.cheats.god = true;
    const e = g.enemies.list.filter((x) => x.alive && x.group === 'outpost').sort((a, b) => a.pos.distanceTo(g.player.pos) - b.pos.distanceTo(g.player.pos))[0];
    if (!e) return 'yok';
    const before = e.health.hp;
    const o = g.camera.position.clone();
    const target = e.chestPos();
    const dir = target.clone().sub(o).normalize();
    const hit = g.weapons.trace(o, dir, 200, o.clone().addScaledVector(dir, 0.5));
    return { before, hitEnemy: !!hit.enemy, zone: hit.zone };
  });
  console.log('   ', JSON.stringify(killResult));

  // Görev hedeflerini atlayarak tüm akışı çalıştır
  for (const n of [2, 3, 4, 5]) {
    await page.evaluate((k) => window.__game.debugSkipTo(k), n);
    await waitGame(page, 0.5);
    const cur = await page.evaluate(() => window.__game.mission.current.id);
    check(!!cur, `Hedef ${n}: ${cur}`);
  }
  await page.screenshot({ path: join(shots, '05-lz.png') });
  // Savunma: helikopteri hızlandır
  await page.evaluate(() => {
    const g = window.__game;
    g.mission.defendT = g.mission.data.defendTime - 21;
  });
  await waitGame(page, 0.5);
  check(await page.evaluate(() => !!window.__game.mission.heli), 'Helikopter geldi');
  await page.evaluate(() => {
    const g = window.__game;
    g.mission.heli.t = 19.9;
    g.mission.defendT = g.mission.data.defendTime + 1;
  });
  await waitGame(page, 0.4);
  await page.evaluate(() => {
    const g = window.__game;
    const h = g.mission.heli.root.position;
    g.player.reset(new g.player.pos.constructor(h.x + 3, 0, h.z + 3), 0);
  });
  await page.waitForFunction(() => window.__game.state === 'victory', null, { timeout: 60000 }).catch(() => {});
  check((await state(page)) === 'victory', 'Görev tamamlandı ekranı');
  await page.screenshot({ path: join(shots, '06-victory.png') });

  // Ölüm ve yeniden doğma
  await page.click('#btnAgain');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 30000 });
  await page.evaluate(() => {
    const P = window.__game.player;
    for (let i = 0; i < 12; i++) P.health.damage(20);
    P.die();
  });
  await page.waitForFunction(() => window.__game.state === 'dead', null, { timeout: 60000 }).catch(() => {});
  check((await state(page)) === 'dead', 'Ölüm ekranı açıldı');
  await page.screenshot({ path: join(shots, '07-death.png') });
  await page.click('#btnRespawn');
  await waitGame(page, 0.3);
  check((await state(page)) === 'playing' && (await page.evaluate(() => window.__game.player.alive)), 'Kontrol noktasından yeniden doğdu');
  const lastErr = await page.evaluate(() => (window.__game.lastError ? String(window.__game.lastError.stack || window.__game.lastError) : null));
  check(!lastErr, `Döngüde istisna yok${lastErr ? `: ${lastErr}` : ''}`);
  await page.close();
}

// ---------------- Etkileşimler: pompalı, C4, istihbarat, ikmal ----------------
console.log('Etkileşimler');
{
  const page = await openPage('standalone');
  await page.click('#btnPlay');
  await page.click('#diffList .diff:nth-child(2)');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 30000 });
  const tp = (x, z, yaw) =>
    page.evaluate(([x, z, yaw]) => {
      const g = window.__game;
      g.player.reset(new g.player.pos.constructor(x, 0, z), yaw);
    }, [x, z, yaw]);
  await page.evaluate(() => {
    const g = window.__game;
    g.cheats.god = true;
    g.cheats.aiOff = true;
    g.input.lockFailed = true;
  });
  const hold = async (sec) => {
    await page.keyboard.down('KeyF');
    await waitGame(page, sec);
    await page.keyboard.up('KeyF');
  };
  await tp(-10, 61.3, Math.PI);
  await waitGame(page, 0.3);
  await page.keyboard.press('KeyF');
  await waitGame(page, 0.3);
  check(await page.evaluate(() => !!window.__game.weapons.owned.shotgun), 'Pompalı yerden alındı');
  await page.evaluate(() => window.__game.debugSkipTo(2));
  for (const [x, z, id] of [[-41, 25.2, 'aa1'], [40.5, 15.2, 'aa2']]) {
    await tp(x, z, 0);
    await waitGame(page, 0.3);
    await hold(2.5);
    const planted = await page.evaluate((i) => window.__game.mission.aa.find((a) => a.id === i).planted, id);
    check(planted, `${id}: C4 yerleştirildi`);
    await tp(x, z + 25, 0);
    await waitGame(page, 5.5);
    check(await page.evaluate((i) => window.__game.mission.aa.find((a) => a.id === i).destroyed, id), `${id}: patladı`);
  }
  check((await page.evaluate(() => window.__game.mission.current.id)) === 'intel', 'Hedef istihbarata geçti');
  await tp(-7, -51.2, 0);
  await waitGame(page, 0.3);
  await hold(3);
  check((await page.evaluate(() => window.__game.mission.current.id)) === 'lz', 'İstihbarat alındı, iniş bölgesi hedefi');
  check((await page.evaluate(() => window.__game.enemies.list.filter((e) => e.group === 'reinf').length)) === 5, 'Takviye birlikler geldi');
  await page.evaluate(() => {
    const w = window.__game.weapons.current;
    w.reserve = 0;
  });
  await tp(8.6, 62.9, Math.PI);
  await waitGame(page, 0.3);
  await page.keyboard.press('KeyF');
  await waitGame(page, 0.2);
  check(await page.evaluate(() => { const w = window.__game.weapons.current; return w.reserve === w.data.reserveMax; }), 'İkmal sandığı cephaneyi doldurdu');
  await page.screenshot({ path: join(shots, '13-interact.png') });
  const lastErr = await page.evaluate(() => (window.__game.lastError ? String(window.__game.lastError.stack || window.__game.lastError) : null));
  check(!lastErr, `Döngüde istisna yok${lastErr ? `: ${lastErr}` : ''}`);
  await page.close();
}

// ---------------- Atış poligonu ----------------
console.log('Atış poligonu');
{
  const page = await openPage('standalone');
  await page.click('#btnRange');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 30000 });
  await page.evaluate(() => (window.__game.input.lockFailed = true));
  await waitGame(page, 0.8);
  const r = await page.evaluate(() => {
    const g = window.__game;
    const d = g.enemies.list[1];
    const o = g.camera.position.clone();
    const target = d.model.head.getWorldPosition(new o.constructor());
    target.y += 0.12;
    g.player.yaw = Math.atan2(-(target.x - o.x), -(target.z - o.z));
    const flat = Math.hypot(target.x - o.x, target.z - o.z);
    g.player.pitch = Math.atan2(target.y - o.y, flat);
    return { dummies: g.enemies.list.length, owned: Object.keys(g.weapons.owned) };
  });
  check(r.dummies === 10, `Mankenler yerleşti (${r.dummies})`);
  check(r.owned.length === 3, `Poligonda üç silah (${r.owned.join(', ')})`);
  await waitGame(page, 0.1);
  await page.mouse.down({ button: 'right' });
  await waitGame(page, 0.35);
  await page.mouse.down();
  await waitGame(page, 0.05);
  await page.mouse.up();
  await waitGame(page, 0.3);
  await page.screenshot({ path: join(shots, '08-range-ads.png') });
  await page.mouse.up({ button: 'right' });
  const hitInfo = await page.evaluate(() => ({ hits: window.__game.stats.hits, shots: window.__game.stats.shots }));
  check(hitInfo.hits > 0, `Mankene isabet (${hitInfo.hits}/${hitInfo.shots})`);
  await page.keyboard.press('Digit2');
  await waitGame(page, 1.0);
  check((await page.evaluate(() => window.__game.weapons.currentId)) === 'shotgun', 'Pompalıya geçildi');
  await page.mouse.down();
  await waitGame(page, 0.05);
  await page.mouse.up();
  await waitGame(page, 0.1);
  await page.screenshot({ path: join(shots, '09-range-shotgun.png') });
  await waitGame(page, 0.6);
  await page.keyboard.down('KeyG');
  await waitGame(page, 0.3);
  await page.keyboard.up('KeyG');
  await waitGame(page, 0.3);
  check((await page.evaluate(() => window.__game.stats.grenades)) === 1, 'El bombası atıldı');
  await waitGame(page, 3.2);
  await page.screenshot({ path: join(shots, '10-range-grenade.png') });
  const lastErr = await page.evaluate(() => (window.__game.lastError ? String(window.__game.lastError.stack || window.__game.lastError) : null));
  check(!lastErr, `Döngüde istisna yok${lastErr ? `: ${lastErr}` : ''}`);
  await page.close();
}

// ---------------- Artifact sürümü ----------------
console.log('Artifact sürümü (dist/artifact.html)');
{
  const page = await openPage('artifact');
  await sleep(800);
  check((await state(page)) === 'menu', 'CDN three.js ile menü açıldı');
  await page.close();
}

// Dokunmatik düzen (telefon)
console.log('Telefon görünümü');
{
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[mobile] pageerror: ${e.message}`));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '', contentType: 'text/css' }));
  await page.goto(pathToFileURL(join(root, 'dist/index.html')).href);
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 30000 });
  await sleep(800);
  await page.screenshot({ path: join(shots, '11-mobile-menu.png') });
  await page.tap('#btnRange');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 30000 });
  await sleep(1200);
  check(await page.isVisible('#tbFire'), 'Dokunmatik kontroller görünüyor');
  await page.screenshot({ path: join(shots, '12-mobile-play.png') });
  await ctx.close();
}

await browser.close();
const real = errors.filter((e) => !/favicon|ERR_FILE_NOT_FOUND|net::/.test(e));
check(real.length === 0, `Konsolda hata yok${real.length ? `:\n    ${real.slice(0, 10).join('\n    ')}` : ''}`);
console.log(failed ? `\n${failed} kontrol başarısız.` : '\nTüm kontroller geçti.');
process.exit(failed ? 1 : 0);
