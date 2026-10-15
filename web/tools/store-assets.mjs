// Mağaza kayıtlarının görselleri (Docs/STORE_RELEASE.md): dist/app'ten (kurgusal silah adlı mağaza sürümü) çekilir,
// depo kökündeki store/ klasörüne yazılır.
//  store/google-play/icon-512.png                 Play simgesi (512×512)
//  store/google-play/feature-graphic.jpg          tanıtım görseli (1024×500)
//  store/google-play/screenshots/*.jpg            telefon ekran görüntüleri (1920×1080)
//  store/app-store/iphone-6.9/*.jpg               iPhone 6,9" (2868×1320, yatay)
//  store/app-store/ipad-13/*.jpg                  iPad 13" (2752×2064, yatay)
// Her ekran görüntüsünün üstünde kısa Türkçe başlık. Önce derleme gerekir (npm run build).
// Kullanım (web/ içinden):  node tools/store-assets.mjs [play|iphone|ipad|art ...]   (boş = hepsi)
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'dist/app');
const out = join(root, '../store');
const want = process.argv.slice(2);
const run = (k) => !want.length || want.includes(k);
if (!existsSync(join(site, 'index.html'))) throw new Error('Önce derle: npm run build (dist/app yok)');

// Ekran görüntüsü başlıkları (sahne sırasıyla). İddia gerçek olmalı: sayılar oyundan
const CAPTIONS = {
  lobby: ['RÜTBE AL, ÖDÜLÜ TOPLA', 'Günlük görevler · 7 günlük giriş ödülü · 15 rütbe'],
  mission: ['TİMİNLE CEPHEYE İN', '6 görev · 5 harita · Alfa Timi yanında savaşır'],
  wheel: ['TİMİNE EMİR VER', 'Komut çarkı, işaretleme ve sesli komut'],
  loadout: ['TEÇHİZATINI KUR', '18 silah · kendine özgü nişangâhlar · zırh'],
};

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg', '.png': 'image/png' };
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = join(site, path === '/' ? 'index.html' : path.slice(1));
  if (!file.startsWith(site) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404);
    return res.end();
  }
  // Başlık sayfası (about:blank) yazı tiplerini buradan alır: başka kökenden yazı tipi CORS ister
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'access-control-allow-origin': '*' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

// Oyunu aç: adlı oyuncu, yüksek kalite, ilerlemesi olan bir profil (lobide rütbe ve seviye dolu görünsün)
async function openGame({ width, height, scale, touch }) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, hasTouch: touch, isMobile: touch });
  await ctx.addInitScript(() => {
    localStorage.setItem('demirsafak.profile.v1', JSON.stringify({ name: 'Bozkurt' }));
    localStorage.setItem('demirsafak.settings.v1', JSON.stringify({ quality: 'high' }));
    localStorage.setItem('demirsafak.progress.v1', JSON.stringify({ unlocked: 6, best: {} }));
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('sayfa hatası:', e.message));
  await page.goto(`${origin}/`);
  await page.waitForFunction(() => window.__game?.state === 'menu' && document.getElementById('loading').hidden, null, { timeout: 180000, polling: 250 });
  await page.evaluate(async () => {
    await document.fonts.ready;
    const g = window.__game;
    // ~12. seviye (Üstçavuş), birkaç görev ilerlemiş
    g.progression.grantXp(16000, 'store');
    for (const c of g.progression.data.challenges.list.slice(0, 2)) c.progress = Math.max(c.progress, 2);
    g.menus.lobby.refresh();
  });
  return { ctx, page };
}

const waitGame = (page, sec) =>
  page.evaluate((s) => new Promise((res) => {
    const t0 = window.__game.time;
    const tick = () => (window.__game.time >= t0 + s ? res() : setTimeout(tick, 50));
    tick();
  }), sec);

// Mağaza düzeni: üstte başlık şeridi (oyunun yazı tipleriyle), altında oyunun ekranı küçültülmüş. Başlık oyun
// arayüzünün üstüne binmez; çıktı cihazın tam piksel boyutundadır
async function compose(raw, key, device, file) {
  const [title, sub] = CAPTIONS[key];
  const { width, height, scale } = device;
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
  const band = Math.round(height * 0.17);
  const ih = height - band - Math.round(height * 0.035);
  const iw = Math.round((ih * width) / height);
  await page.setContent(`<!doctype html><html><head><link rel="stylesheet" href="${origin}/fonts/fonts.css"></head>
<body style="margin:0;width:${width}px;height:${height}px;overflow:hidden;background:radial-gradient(120% 90% at 50% 0%,#2a2116 0%,#0d1013 60%);color:#e9e1cf">
<div style="height:${band}px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
<div id="t" style="font:900 ${Math.round(band * 0.42)}px/1 'Big Shoulders Stencil Display',sans-serif;letter-spacing:.06em;color:#f0a33a"></div>
<div id="s" style="font:600 ${Math.round(band * 0.19)}px/1.1 'Barlow Condensed',sans-serif;letter-spacing:.08em;margin-top:${Math.round(band * 0.06)}px"></div></div>
<img src="data:image/jpeg;base64,${raw.toString('base64')}" style="display:block;margin:0 auto;width:${iw}px;height:${ih}px;border:1px solid rgba(240,163,58,.55);box-shadow:0 10px 40px rgba(0,0,0,.6)">
</body></html>`);
  await page.evaluate(([t, s]) => {
    document.getElementById('t').textContent = t;
    document.getElementById('s').textContent = s;
  }, [title, sub]);
  await page.evaluate(() => document.fonts.ready);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, await page.screenshot({ type: 'jpeg', quality: 90 }));
  await page.close();
  console.log(file.slice(out.length + 1));
}

// Dört sahne: lobi, görev, komut çarkı, teçhizat
async function scenes(device, dir) {
  const { ctx, page } = await openGame(device);
  const raw = () => page.screenshot({ type: 'jpeg', quality: 95 });
  await compose(await raw(), 'lobby', device, join(dir, '1-lobi.jpg'));
  // Teçhizat: keskin nişancı sekmesinde .338'lik tüfek seçili (sağda 3B önizleme ve dürbün)
  await page.evaluate(() => window.__game.menus.loadoutScreen.open('Teçhizat'));
  // Tıklama sayfanın içinden: yüksek kalitede kare saniyeler sürer, Playwright'ın tıklama sonrası beklemesi aşılırdı
  await page.evaluate(() => document.querySelector('#loadoutRoot .loClasses button[data-cls="sniper"]').click());
  await page.evaluate(() => document.querySelector('#loadoutRoot .loCard[data-id="awm"]').click());
  await page.waitForFunction(() => document.querySelectorAll('#loadoutRoot .loImg.ready').length >= 2, null, { timeout: 120000, polling: 250 }).catch(() => {});
  await page.waitForTimeout(1500);
  await compose(await raw(), 'loadout', device, join(dir, '4-techizat.jpg'));
  // Görev: Liman (Seviye 3), tim yanında; giriş kartı geçsin, bakış en yakın düşmana
  await page.evaluate(() => {
    const g = window.__game;
    g.menus.hideAll();
    g.startMode('mission', 'normal', 3);
  });
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 180000, polling: 250 });
  if (device.touch) await page.evaluate(() => window.__game.enableTouch());
  await waitGame(page, 4.5);
  await page.evaluate(() => {
    const g = window.__game;
    const o = g.camera.position;
    let best = null;
    let bd = 1e9;
    // Görüş hattı açık en yakın düşman (konteyner duvarına bakan kare olmasın)
    for (const e of g.enemies.list) {
      if (!e.alive || !g.world.lineOfSight(o, e.chestPos())) continue;
      const d = Math.hypot(e.pos.x - o.x, e.pos.z - o.z);
      if (d > 12 && d < bd) {
        bd = d;
        best = e;
      }
    }
    if (!best) return;
    const t = best.chestPos();
    g.player.yaw = Math.atan2(-(t.x - o.x), -(t.z - o.z));
    g.player.pitch = Math.atan2(t.y - o.y, Math.hypot(t.x - o.x, t.z - o.z));
  });
  await waitGame(page, 0.6);
  await compose(await raw(), 'mission', device, join(dir, '2-gorev.jpg'));
  // Komut çarkı açık (dokunmatik düzende)
  await page.evaluate((t) => window.__game.wheel.show(t), !!device.touch);
  await waitGame(page, 0.2);
  await compose(await raw(), 'wheel', device, join(dir, '3-komut-carki.jpg'));
  await ctx.close();
}

if (run('play')) await scenes({ width: 960, height: 540, scale: 2, touch: true }, join(out, 'google-play/screenshots'));
if (run('iphone')) await scenes({ width: 956, height: 440, scale: 3, touch: true }, join(out, 'app-store/iphone-6.9'));
if (run('ipad')) await scenes({ width: 1376, height: 1032, scale: 2, touch: true }, join(out, 'app-store/ipad-13'));

if (run('art')) {
  // Play simgesi: tam kare (Play köşeleri kendisi yuvarlar), PWA simgesinin çizimiyle
  const svg = readFileSync(join(root, 'src/pwa/icon.svg'), 'utf8').replace(/(<rect id="bg"[^>]*?) rx="\d+"/, '$1');
  const ip = await browser.newPage({ viewport: { width: 512, height: 512 } });
  await ip.setContent(`<!doctype html><body style="margin:0">${svg.replace('<svg ', '<svg width="512" height="512" ')}</body>`);
  mkdirSync(join(out, 'google-play'), { recursive: true });
  writeFileSync(join(out, 'google-play/icon-512.png'), await ip.screenshot({ clip: { x: 0, y: 0, width: 512, height: 512 } }));
  console.log('google-play/icon-512.png');
  await ip.close();
  // Tanıtım görseli (1024×500): lobi sahnesi (arayüz gizli, operatör sağda) + oyun adı ve tek cümle
  const { ctx, page } = await openGame({ width: 1024, height: 500, scale: 1, touch: false });
  await page.evaluate(() => {
    document.getElementById('menu').style.visibility = 'hidden';
    const c = document.createElement('div');
    c.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;justify-content:center;padding:0 0 0 64px;background:linear-gradient(90deg,rgba(8,10,12,.94) 0%,rgba(8,10,12,.75) 38%,rgba(8,10,12,0) 62%);color:#e9e1cf';
    c.innerHTML = '';
    const e = document.createElement('div');
    e.textContent = 'TAKTİK SAVAŞ · ALFA TİMİ';
    e.style.cssText = "font:700 20px/1 'Barlow Condensed',sans-serif;letter-spacing:.3em;color:#a59f92";
    const t = document.createElement('div');
    t.innerHTML = 'DEMİR<br><span style="color:#f0a33a">ŞAFAK</span>';
    t.style.cssText = "font:900 118px/.86 'Big Shoulders Stencil Display',sans-serif;letter-spacing:.03em;margin-top:14px";
    const s = document.createElement('div');
    s.textContent = 'Timini yönet. Cepheyi tut. Şafakla dön.';
    s.style.cssText = "font:600 26px/1.2 'Barlow Condensed',sans-serif;letter-spacing:.06em;margin-top:18px";
    c.append(e, t, s);
    document.body.appendChild(c);
  });
  await waitGame(page, 0.3);
  writeFileSync(join(out, 'google-play/feature-graphic.jpg'), await page.screenshot({ type: 'jpeg', quality: 92 }));
  console.log('google-play/feature-graphic.jpg');
  await ctx.close();
}

await browser.close();
server.close();
