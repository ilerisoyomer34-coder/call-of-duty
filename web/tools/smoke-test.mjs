// Duman testi: derlenmiş oyunu başsız Chromium'da açar, menü → görev → poligon akışlarını
// sürer, hata olup olmadığını denetler ve ekran görüntüleri alır (tools/shots/).
// Kullanım: npm test   (önce derler)
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shots = join(root, 'tools/shots');
mkdirSync(shots, { recursive: true });
const THREE_VERSION = JSON.parse(readFileSync(join(root, 'node_modules/three/package.json'), 'utf8')).version;
const THREE_CDN = `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/build/three.module.min.js`;
const THREE_CDN2 = `https://unpkg.com/three@${THREE_VERSION}/build/three.module.min.js`;
const THREE_BODY = readFileSync(join(root, 'node_modules/three/build/three.module.min.js'), 'utf8');
const MIME = { '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg', '.png': 'image/png' };

const errors = [];
// SMOKE_ONLY=levels,maps gibi: yalnızca adı verilen bölümler koşar (hızlı yerel deneme için).
// Bölümler: visual, save, store, mission, levels, missions, squad, downed, commands, radio, balance, interact, maps, range, armor, loadout, artifact, mobile, pwa
const only = process.env.SMOKE_ONLY;
const run = (name) => !only || only.split(',').includes(name);
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

// opts.cdnFail: ['jsdelivr', 'unpkg'] → o CDN yanıt vermez (yedek yolu ve hata ekranı denenir)
async function openPage(kind, quality = 'low', opts = {}) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  // Yazılımsal GPU'da akış testleri düşük kalitede koşar; görsel kontrol için 'high'
  // Akış testleri tüm seviyeler açık başlar; seviye testi sıfırdan (yalnızca Seviye 1 açık) başlar
  const unlocked = opts.unlocked ?? 6;
  await page.addInitScript(([q, u]) => {
    try {
      localStorage.setItem('demirsafak.settings.v1', JSON.stringify({ quality: q }));
      localStorage.setItem('demirsafak.progress.v1', JSON.stringify({ unlocked: u, best: {} }));
    } catch {
      /* depolama yok */
    }
  }, [quality, unlocked]);
  page.on('pageerror', (e) => errors.push(`[${kind}] pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[${kind}] console: ${m.text()}`);
  });
  // Dış kaynaklar (Google Fonts) test ortamında engelli olabilir
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '', contentType: 'text/css' }));
  const fail = opts.cdnFail || [];
  const serveThree = (name) => (r) =>
    fail.includes(name)
      ? r.abort('connectionrefused')
      : r.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: THREE_BODY });
  await page.route(THREE_CDN, serveThree('jsdelivr'));
  await page.route(THREE_CDN2, serveThree('unpkg'));
  if (kind === 'artifact') {
    // Artifact gibi: sayfa bir https kökeninde, modeller ve dokular yanındaki assets/ dosyalarından
    const html = readFileSync(join(root, 'dist/artifact.html'), 'utf8');
    await page.route('https://artifact.test/**', (r) => {
      const path = new URL(r.request().url()).pathname;
      if (path === '/') return r.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><html><head><meta charset="utf-8"></head><body>${html}</body></html>` });
      // Yayındaki gibi: GLB'ler dist/artifact-assets altındaki base64 .txt, dokular web/assets'ten
      const rel = decodeURIComponent(path);
      const file = [join(root, 'dist/artifact-assets', rel), join(root, rel)].find((f) => existsSync(f));
      const ext = path.slice(path.lastIndexOf('.'));
      if (path.startsWith('/assets/') && file) return r.fulfill({ status: 200, contentType: ext === '.txt' ? 'text/plain' : MIME[ext] || 'application/octet-stream', body: readFileSync(file) });
      return r.fulfill({ status: 404, body: 'yok' });
    });
    await page.goto('https://artifact.test/');
  } else {
    await page.goto(pathToFileURL(join(root, 'dist/index.html')).href);
  }
  // Açılış tamamen bitsin (menü görünür olsa da gölgelendirici ön derlemesi sürüyor olabilir)
  if (!opts.noWait) await page.waitForFunction(() => window.__game && window.__game.state === 'menu' && document.getElementById('loading').hidden, null, { timeout: 60000 });
  return page;
}

const state = (page) => page.evaluate(() => window.__game.state);
// Yazılımsal render yavaş olabilir: gerçek süre yerine oyun zamanını bekle
async function waitGame(page, sec) {
  const t0 = await page.evaluate(() => window.__game.time);
  await page.waitForFunction((t) => window.__game.time >= t || !['playing', 'dying', 'menu'].includes(window.__game.state), t0 + sec, { timeout: 180000, polling: 50 });
}

// ---------------- Bağımsız sürüm: görev ----------------
if (run('visual')) {
console.log('Görsel kontrol (yüksek kalite)');

  const page = await openPage('standalone', 'high');
  await sleep(1500);
  await page.screenshot({ path: join(shots, '00-menu-high.png') });
  await page.click('#btnPlay');
  await page.click('#diffList .diff:nth-child(2)');
  await page.click('#levelList .lvl:nth-child(2)'); // Kızılkum köyü
  await page.click('#btnBriefNext');
  await page.click('#btnDeploy');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 30000 });
  await page.evaluate(() => {
    const g = window.__game;
    g.cheats.god = true;
    g.player.reset(new g.player.pos.constructor(-2, 0, 48), 0.3);
  });
  await waitGame(page, 0.6);
  await page.screenshot({ path: join(shots, '00-village-high.png') });
  check((await page.evaluate(() => window.__game.player.pitch)) === 0, 'Kilitlenmede kamera sıçramadı');
  // Yakın çekim: en yakın düşmanın 4 m önüne geç, yapay zekâ kapalı (asker modeli ve duruşu)
  await page.evaluate(() => {
    const g = window.__game;
    g.cheats.aiOff = true;
    const e = g.enemies.list.find((x) => x.alive && x.type === 'rifleman');
    const f = { x: -Math.sin(e.yaw), z: -Math.cos(e.yaw) };
    const p = new g.player.pos.constructor(e.pos.x + f.x * 4, e.pos.y, e.pos.z + f.z * 4);
    g.player.reset(p, Math.atan2(-(e.pos.x - p.x), -(e.pos.z - p.z)));
    g.player.pitch = -0.06;
  });
  await waitGame(page, 0.5);
  await page.screenshot({ path: join(shots, '00-soldier-high.png') });
  await page.close();
}

// ---------------- Kayıt ve kredi (save.js, economy.js) ----------------
if (run('save')) {
console.log('Kayıt ve kredi');

  const fresh = async (init) => {
    const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
    if (init) await ctx.addInitScript(init);
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '', contentType: 'text/css' }));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`[save] pageerror: ${e.message}`));
    await page.goto(pathToFileURL(join(root, 'dist/index.html')).href);
    await page.waitForFunction(() => window.__game && window.__game.state === 'menu' && document.getElementById('loading').hidden, null, { timeout: 60000 });
    return { ctx, page };
  };
  // Yeni oyuncu: 1.000 KR, kayıt sürümüyle yazıldı
  {
    const { ctx, page } = await fresh(() => localStorage.setItem('demirsafak.settings.v1', JSON.stringify({ quality: 'low' })));
    const r = await page.evaluate(() => ({ text: document.getElementById('menuCreditsVal').textContent, save: JSON.parse(localStorage.getItem('demirsafak.save') || 'null') }));
    check(r.text === '1.000 KR' && r.save?.version === 1 && r.save.credits === 1000, `Yeni kayıt: menüde "${r.text}", kayıt sürüm ${r.save?.version}`);
    // Harcama ve kazanç tek giriş noktasından: menü sayacı güncellenir, kayıt hemen yazılır
    const e = await page.evaluate(() => {
      const E = window.__game.economy;
      const ok = E.spend(800, 'test');
      const no = E.spend(5000, 'test');
      E.add(300, 'test');
      return { ok, no, text: document.getElementById('menuCreditsVal').textContent, saved: JSON.parse(localStorage.getItem('demirsafak.save')).credits, log: E.log.length };
    });
    check(e.ok && !e.no && e.text === '500 KR' && e.saved === 500 && e.log === 2, `Kredi harcandı/kazanıldı, yetersiz harcama reddedildi, kayıt anında yazıldı (${e.text})`);
    // Yeniden açılınca kredi korunur
    await page.reload();
    await page.waitForFunction(() => window.__game && window.__game.state === 'menu' && document.getElementById('loading').hidden, null, { timeout: 60000 });
    check((await page.evaluate(() => window.__game.economy.credits)) === 500, 'Sayfa yenilenince kredi korundu');
    await ctx.close();
  }
  // Eski sürüm kaydı: seviye, teçhizat ve ayarlar yeni kayda aktarılır, eski anahtarlar silinmez
  {
    const { ctx, page } = await fresh(() => {
      if (localStorage.getItem('demirsafak.save')) return;
      localStorage.setItem('demirsafak.settings.v1', JSON.stringify({ quality: 'low', sensitivity: 1.3 }));
      localStorage.setItem('demirsafak.progress.v1', JSON.stringify({ unlocked: 4, best: { 2: { score: 1800, time: 300, diff: 'hard' } } }));
      localStorage.setItem('demirsafak.loadout.v1', JSON.stringify({ primary: 'k8', secondary: 'd50' }));
    });
    const m = await page.evaluate(() => {
      const g = window.__game;
      return { unlocked: g.progress.unlocked, best: g.progress.best[2]?.score, primary: g.loadout.primary, secondary: g.loadout.secondary, sens: g.settings.sensitivity, credits: g.economy.credits, legacy: !!localStorage.getItem('demirsafak.progress.v1') };
    });
    check(m.unlocked === 4 && m.best === 1800 && m.primary === 'k8' && m.secondary === 'd50' && m.sens === 1.3 && m.credits === 1000 && m.legacy, `Eski kayıt yükseltildi: seviye ${m.unlocked}, teçhizat ${m.primary}/${m.secondary}, ayar korundu, yedek duruyor`);
    await ctx.close();
  }
}

// ---------------- Mağaza (store.js, storeScreen.js) ----------------
if (run('store')) {
console.log('Mağaza');

  // §12/1: yeni kayıt → 1.000 KR → Hafif Taktik Yelek al (200 KR kalır) → kuşan → görevde 50 ZP
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => {
    if (!localStorage.getItem('demirsafak.save')) localStorage.setItem('demirsafak.settings.v1', JSON.stringify({ quality: 'low' }));
  });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '', contentType: 'text/css' }));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[store] pageerror: ${e.message}`));
  await page.goto(pathToFileURL(join(root, 'dist/index.html')).href);
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu' && document.getElementById('loading').hidden, null, { timeout: 60000 });
  await page.click('#btnStore');
  await page.waitForSelector('#storeScreen:not([hidden])', { timeout: 5000 });
  const tabs = await page.$$eval('.stTabs .diff', (bs) => bs.map((b) => b.textContent));
  check(tabs.join(',') === 'Zırh,Kask,Sarf Malzemeleri,Tim Yükseltmeleri', `Mağaza sekmeleri: ${tabs.join(' · ')} (kilitli silah yok, Silahlar sekmesi gizli)`);
  await page.click('.stCard[data-id="armor_light"]');
  await page.click('#stBuy');
  const modal = await page.textContent('.stModalBox p');
  check(modal === 'Hafif Taktik Yelek — 800 KR. Onaylıyor musun?', `Onay penceresi: "${modal}"`);
  await page.click('#stConfirm');
  await page.waitForFunction(() => document.querySelector('#storeRoot .kr b').textContent === '200 KR', null, { timeout: 5000 }).catch(() => {});
  const after = await page.evaluate(() => ({
    credits: window.__game.economy.credits,
    chip: document.querySelector('#storeRoot .kr b').textContent,
    badge: document.querySelector('.stCard[data-id="armor_light"] .stBadge')?.textContent,
    saved: JSON.parse(localStorage.getItem('demirsafak.save')).inventory.armor,
  }));
  check(after.credits === 200 && after.chip === '200 KR' && after.badge === 'SAHİPSİN' && after.saved.includes('armor_light'), `Satın alındı: ${after.chip} kaldı, rozet ${after.badge}, kayda yazıldı`);
  await page.click('#stEquip');
  const eq = await page.evaluate(() => ({ badge: document.querySelector('.stCard[data-id="armor_light"] .stBadge')?.textContent, loadout: window.__game.save.data.loadout.armor }));
  check(eq.badge === 'KUŞANILDI' && eq.loadout === 'armor_light', 'Kuşanıldı (KUŞANILDI rozeti)');
  // Yetersiz kredi: düğme pasif, eksik miktarı yazar; karşılaştırma ▲/▼
  await page.click('.stCard[data-id="armor_plate"]');
  const plate = await page.evaluate(() => {
    const b = document.getElementById('stBuy');
    return { text: b.textContent, disabled: b.disabled, up: document.querySelectorAll('.stRow.up').length, down: document.querySelectorAll('.stRow.down').length };
  });
  check(plate.disabled && plate.text === '2.600 KR eksik' && plate.up >= 2 && plate.down === 1, `Yetersiz kredi: "${plate.text}", karşılaştırma ▲${plate.up} ▼${plate.down}`);
  await page.screenshot({ path: join(shots, '17-store.png') });
  // Geri → ana menüde bakiye; görevde zırh kuşanılı
  await page.click('#stBack');
  check((await page.textContent('#menuCreditsVal')) === '200 KR', 'Ana menüde bakiye 200 KR');
  await page.evaluate(() => window.__game.startMode('range', 'normal'));
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 60000 });
  check((await page.textContent('#arVal')) === '50', 'Görevde HUD 50 ZP gösteriyor (§12/1)');
  await ctx.close();

  // Telefon: mağaza yatay ekranda
  const mctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await mctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '', contentType: 'text/css' }));
  const mp = await mctx.newPage();
  mp.on('pageerror', (e) => errors.push(`[store-mobile] pageerror: ${e.message}`));
  await mp.goto(pathToFileURL(join(root, 'dist/index.html')).href);
  await mp.waitForFunction(() => window.__game && window.__game.state === 'menu' && document.getElementById('loading').hidden, null, { timeout: 60000 });
  await mp.tap('#btnStore');
  await mp.waitForSelector('#storeScreen:not([hidden])', { timeout: 5000 });
  await sleep(300);
  await mp.screenshot({ path: join(shots, '17b-store-mobile.png') });
  check(await mp.isVisible('.stCard[data-id="armor_light"]'), 'Telefonda mağaza kartları görünüyor');
  await mctx.close();
}

if (run('mission')) {
console.log('Bağımsız sürüm (dist/index.html)');

  const page = await openPage('standalone');
  await sleep(1500);
  await page.screenshot({ path: join(shots, '01-menu.png') });
  check((await state(page)) === 'menu', 'Ana menü açıldı');

  await page.click('#btnPlay');
  await sleep(200);
  check(await page.isVisible('#diffScreen'), 'Seviye ekranı görünüyor');
  check((await page.$$('#levelList .lvl')).length === 6, 'Altı seviye listelendi');
  const cards = await page.evaluate(() => [...document.querySelectorAll('#levelList .lvl .m')].map((m) => m.textContent));
  check(/Kızılkum/.test(cards[0]) && /Liman/.test(cards[2]) && /Gece Rafinerisi/.test(cards[5]), 'Kartlarda harita adları (Kızılkum → Gece Rafinerisi)');
  check(/Komando/.test(cards[5]) && /5 makineli yuvası/.test(cards[5]) && !/makineli/.test(cards[0]), 'Son seviye: komando manga, 5 makineli yuvası; ilk seviyede yuva yok');
  // Operasyonun tamamı (altı hedef) Karlı Geçit'te
  await page.click('#diffList .diff:nth-child(2)');
  await page.click('#levelList .lvl:nth-child(5)');
  await page.click('#btnBriefNext');
  check(await page.isVisible('#loadoutScreen'), 'Teçhizat ekranı açıldı');
  // Teçhizat (Operasyon Güncellemesi §5.5): altı yuva, gerçek adlı kartlar, modelden çizilmiş görseller, 3D önizleme
  const lo = await page.evaluate(() => ({
    slots: [...document.querySelectorAll('#loadoutRoot .loSlot small')].map((s) => s.textContent),
    names: [...document.querySelectorAll('#loadoutRoot .loCard b')].map((b) => b.textContent),
    bars: document.querySelectorAll('#loadoutRoot .loCard[data-id="rifle"] .loBars i').length,
    info: document.querySelector('#loadoutRoot .loCard[data-id="rifle"] .loInfo')?.textContent,
    sniper: [...document.querySelectorAll('#loadoutRoot .loCard[data-id="sniper"] .stBadge')].map((b) => b.textContent),
    deploy: !document.getElementById('btnDeploy').disabled,
  }));
  check(lo.slots.length === 6 && lo.names.length === 10, `Teçhizatta 6 yuva, ana silah yuvasında 10 kart (${lo.slots.join(' · ')})`);
  check(['AKMS', 'Barrett M82A1', 'HK MG4', 'Colt M4A1'].every((n) => lo.names.includes(n)), `Silahlar gerçek adlarıyla (${lo.names.slice(0, 5).join(', ')}…)`);
  check(lo.bars === 6 && /7,62×39 mm · 30 mermi/.test(lo.info || ''), `Kartta altı istatistik çubuğu ve bilgi satırı (${lo.info})`);
  check(lo.sniper.includes('ÇATAL AYAK') && lo.sniper.includes('ZIRH DELİCİ'), `M82A1 rozetleri: ${lo.sniper.join(', ')}`);
  check(lo.deploy, 'GÖREVE BAŞLA etkin (ana silah seçili)');
  await page.waitForFunction(() => document.querySelectorAll('#loadoutRoot .loImg.ready').length >= 10, null, { timeout: 90000 }).catch(() => {});
  const icons = await page.evaluate(() => [...document.querySelectorAll('#loadoutRoot .loImg')].map((i) => ({ ready: i.classList.contains('ready'), w: i.naturalWidth, src: i.src.slice(0, 5) })));
  check(icons.filter((i) => i.ready && i.w === 512).length === 10, `Silah görselleri oyunun modellerinden çizildi (${icons.filter((i) => i.ready).length}/10, 512×256)`);
  // Önizleme dönüyor ve boş değil: iki ayrı anda tuvalde farklı, saydam olmayan pikseller
  const px = () =>
    page.evaluate(() => {
      const c = document.querySelector('#loadoutRoot canvas.loPreview');
      if (!c || !c.width) return null;
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      let sum = 0;
      for (let i = 3; i < d.length; i += 16) {
        if (d[i] === 0) continue;
        n++;
        sum += (d[i - 3] + d[i - 2] * 3) * (i % 997);
      }
      return { n, sum };
    });
  const px1 = await px();
  await sleep(1500);
  const px2 = await px();
  check(!!px1 && px1.n > 200 && px2 && px2.sum !== px1.sum, `Sağ panelde 3D önizleme çiziliyor ve dönüyor (${px1?.n} piksel)`);
  await page.click('#loadoutRoot .loCard[data-id="lmg"]');
  check((await page.textContent('#loadoutRoot .loDetail .stName')) === 'HK MG4' && (await page.evaluate(() => window.__game.loadout.primary)) === 'rifle', 'Tıklamak yalnız seçer (ayrıntı değişti, teçhizat aynı)');
  await page.dblclick('#loadoutRoot .loCard[data-id="lmg"]');
  check((await page.evaluate(() => window.__game.save.data.loadout.primary)) === 'lmg' && (await page.isVisible('#loadoutRoot .loCard[data-id="lmg"] .loCheck')), 'Çift tıklama kuşandı (✓) ve kayda yazıldı');
  await page.click('#loadoutRoot .loSlot[data-slot="secondary"]');
  check((await page.$$('#loadoutRoot .loCard')).length === 3, 'Yan silah yuvasında yalnız 3 yan silah');
  await page.click('#loadoutRoot .loSlot[data-slot="primary"]');
  await page.dblclick('#loadoutRoot .loCard[data-id="rifle"]');
  await page.screenshot({ path: join(shots, '01b-loadout.png') });
  await page.click('#btnDeploy');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 30000 });
  check(true, 'Görev başladı');
  check(await page.evaluate(() => document.getElementById('loading').hidden), 'Harita yükleme ekranı kapandı');
  check(await page.evaluate(() => window.__game.enemies.list.every((e) => !!e.model.bones && e.model.meshes.length > 10)), 'Düşmanlar iskeletli hazır modelle (vuruş kutuları bağlı)');
  await page.evaluate(() => {
    window.__game.input.lockFailed = true;
  });
  const info = await page.evaluate(() => {
    const g = window.__game;
    return {
      enemies: g.enemies.list.length,
      colliders: g.world.colliders.length,
      covers: g.nav.covers.length,
      weapon: g.weapons.current?.data.id,
      hudName: document.getElementById('wName').textContent,
      calls: g.renderer.info.render.calls,
    };
  });
  console.log('   ', JSON.stringify(info));
  check(info.enemies >= 25, `Düşmanlar yerleşti (${info.enemies})`);
  check(info.covers > 100, `Siper noktaları üretildi (${info.covers})`);
  check(info.weapon === 'rifle' && info.hudName === 'AKMS', `Başlangıç silahı ${info.hudName} (gerçek ad)`);
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

  // Karakola yaklaş (işaretçinin 24 m güneyi), düşmanlar fark etsin
  await page.evaluate(() => {
    const g = window.__game;
    const m = g.mission.data.obj.outpost.marker;
    g.player.reset(new g.player.pos.constructor(m.x, 0, m.z + 24), 0);
  });
  await waitGame(page, 1.0);
  const hpEarly = await page.evaluate(() => window.__game.player.health.hp);
  check(hpEarly > 0, `Çatışma bölgesinde ilk saniyede ölmedi (can ${Math.round(hpEarly)})`);
  // Karakolda makineli yuvası var: akışın geri kalanı ölümsüz sürer (hasar ölçümü ilk saniyeden)
  const taken = await page.evaluate(() => window.__game.stats.damageTaken);
  await page.evaluate(() => (window.__game.cheats.god = true));
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
  console.log(`    açıkta ilk 1 sn: alınan hasar ${Math.round(taken)}`);
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
    g.mission.defendT = g.mission.defendTime - 21;
  });
  await waitGame(page, 0.5);
  check(await page.evaluate(() => !!window.__game.mission.heli), 'Helikopter geldi');
  const heli = await page.evaluate(() => {
    const g = window.__game;
    const H = g.mission.heli;
    const r0 = H.rotor.rotation.y;
    const t0 = H.tail.rotation[H.tailAxis || 'x'];
    g.mission.updateHeli(0.05);
    let tris = 0;
    H.root.traverse((o) => {
      if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
    });
    return { prop: !!H.prop, spin: H.rotor.rotation.y !== r0 && H.tail.rotation[H.tailAxis || 'x'] !== t0, tris: Math.round(tris) };
  });
  check(heli.prop && heli.spin, `Helikopter hazır modelle (Sketchfab, ${heli.tris} üçgen), ana ve kuyruk pervanesi dönüyor`);
  await page.evaluate(() => {
    const g = window.__game;
    g.mission.heli.t = 19.9;
    g.mission.defendT = g.mission.defendTime + 1;
  });
  await waitGame(page, 0.4);
  await page.evaluate(() => {
    const g = window.__game;
    const h = g.mission.heli.root.position;
    g.player.reset(new g.player.pos.constructor(h.x + 3, 0, h.z + 3), 0);
  });
  await page.waitForFunction(() => !!window.__game.mission.takeoff || window.__game.state !== 'playing', null, { timeout: 60000 }).catch(() => {});
  await waitGame(page, 1.2);
  const cine = await page.evaluate(() => {
    const g = window.__game;
    const H = g.mission.heli;
    return { on: !!g.mission.takeoff, camInHeli: g.camera.position.distanceTo(H.root.position) < 7 /* kapının hemen dışı, gövde 11 m */, climb: H.root.position.y, hud: document.getElementById('hud').hidden, safe: g.player.invulnerable };
  });
  check(cine.on && cine.camInHeli && cine.hud && cine.safe, `Helikoptere binildi: kalkış sahnesi, kamera kabinde (yükseklik ${cine.climb.toFixed(1)} m)`);
  await page.screenshot({ path: join(shots, '05b-takeoff.png') });
  await page.evaluate(() => (window.__game.mission.takeoff.t = 6));
  await page.waitForFunction(() => window.__game.state === 'victory', null, { timeout: 60000 }).catch(() => {});
  check((await state(page)) === 'victory', 'Görev tamamlandı ekranı');
  // Geri sayım gerçek saatle işler: ekran görüntüsü sürerken sonraki bölüme geçmesin diye hemen beklet
  const hold = await page.evaluate(() => {
    const shown = !document.getElementById('victoryNext').hidden;
    document.getElementById('btnHold').click();
    return { shown, stopped: document.getElementById('btnHold').hidden };
  });
  check(hold.shown && hold.stopped, 'Bölüm kartında geri sayım vardı, "Beklet" durdurdu');
  await page.screenshot({ path: join(shots, '06-victory.png') });

  // Ölüm ve yeniden doğma
  await page.click('#btnAgain');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 30000 });
  await page.evaluate(() => {
    const P = window.__game.player;
    for (let i = 0; i < 12; i++) P.health.damage(20);
    P.die();
    // Yazılımsal GPU'da oyun saati yavaş: ölüm kamerasının 2,2 sn'sini doğrudan geç
    window.__game.deathT = 2.1;
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

// ---------------- Seviyeler ve dost manga ----------------
if (run('levels')) {
console.log('Seviyeler ve dost manga');

  const page = await openPage('standalone', 'low', { unlocked: 1 });
  await page.click('#btnPlay');
  await sleep(200);
  const locks = await page.evaluate(() => [...document.querySelectorAll('#levelList .lvl')].map((b) => b.disabled));
  check(locks[0] === false && locks.slice(1).every(Boolean), `Yalnızca Seviye 1 açık (${locks.map((l) => (l ? 'kilitli' : 'açık')).join(', ')})`);
  await page.screenshot({ path: join(shots, '01c-levels.png') });
  await page.click('#levelList .lvl:nth-child(1)');
  await page.click('#btnBriefNext');
  await page.click('#btnDeploy');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 30000 });
  await page.evaluate(() => {
    window.__game.input.lockFailed = true;
    window.__game.cheats.god = true;
  });
  const s1 = await page.evaluate(() => {
    const g = window.__game;
    return { level: g.level.id, allies: g.allies.list.length, enemies: g.enemies.list.length, skinned: g.allies.list.every((a) => !!a.model.bones) };
  });
  check(s1.level === 1 && s1.allies === 3 && s1.enemies === 6, `Seviye 1: 3 dost, 6 düşman (${s1.allies}/${s1.enemies})`);
  check(s1.skinned, 'Dostlar aynı iskeletli modelle geldi');
  // Dostlar oyuncuyu izler
  await page.keyboard.down('KeyW');
  await waitGame(page, 2.5);
  await page.keyboard.up('KeyW');
  await waitGame(page, 2);
  const follow = await page.evaluate(() => {
    const g = window.__game;
    return Math.max(...g.allies.list.map((a) => a.pos.distanceTo(g.player.pos)));
  });
  check(follow < 9, `Dostlar oyuncuyu izledi (en uzak ${follow.toFixed(1)} m)`);
  // Arkaya dön: mavi isim etiketleri görünsün; bir dosta ateş et, yaralanmamalı
  const aimAtAlly = () =>
    page.evaluate(() => {
      const g = window.__game;
      const a = g.allies.list[0];
      const P = g.player;
      P.yaw = Math.atan2(-(a.pos.x - P.pos.x), -(a.pos.z - P.pos.z));
      const o = P.headPos();
      const t = a.chestPos();
      P.pitch = Math.atan2(t.y - o.y, Math.hypot(t.x - o.x, t.z - o.z));
      return a.health.hp;
    });
  await aimAtAlly();
  await waitGame(page, 0.4);
  await page.waitForFunction(() => window.__game.weapons.state === 'idle', null, { timeout: 30000 });
  const hpBefore = await aimAtAlly();
  check(await page.evaluate(() => [...document.querySelectorAll('.atag')].some((e) => !e.hidden && /ALFA-\d|Alfa-\d/.test(e.textContent))), 'Dostların üstünde mavi isim etiketi');
  await page.screenshot({ path: join(shots, '09-allies.png') });
  // Dost yürürken tek mermi ıskalayabilir: dost dursun, en çok üç deneme
  await page.evaluate(() => window.__game.allies.list[0].vel.set(0, 0, 0));
  let ff = null;
  for (let k = 0; k < 3; k++) {
    await aimAtAlly();
    await page.mouse.down();
    await waitGame(page, 0.05);
    await page.mouse.up();
    await waitGame(page, 0.3);
    ff = await page.evaluate(() => ({ hp: window.__game.allies.list[0].health.hp, msg: document.getElementById('message').textContent }));
    if (/DOST/.test(ff.msg)) break;
    await page.waitForFunction(() => window.__game.weapons.state === 'idle', null, { timeout: 30000 });
  }
  check(ff.hp === hpBefore && /DOST/.test(ff.msg), `Dost ateşi: dost yaralanmadı, uyarı çıktı ("${ff.msg}")`);
  // Çatışma: dostlar düşmana ateş eder
  await page.evaluate(() => {
    const g = window.__game;
    const p = new g.player.pos.constructor(0, 0, 84);
    g.player.reset(p, 0);
    g.allies.regroup(p, 0);
    for (const e of g.enemies.list) {
      e.lastKnown.copy(p);
      e.lastSeen = g.time;
      e.enterCombat();
    }
  });
  await waitGame(page, 7);
  const fight = await page.evaluate(() => {
    const g = window.__game;
    return { shots: g.allies.shots, hurt: g.enemies.list.filter((e) => !e.alive || e.health.hp < e.health.max).length, targetedAlly: g.enemies.list.some((e) => e.foe && e.foe !== g.player) };
  });
  check(fight.shots > 0, `Dostlar düşmana ateş etti (${fight.shots} mermi, ${fight.hurt} düşman yaralı/etkisiz)`);
  await page.screenshot({ path: join(shots, '09b-squad-fight.png') });
  // Seviyeyi bitir: sonraki seviye açılır
  // Kontrol noktası temizlenince helikopter tahliyeye gelir; binince kalkış, sonra bölüm kartı
  await page.evaluate(() => window.__game.enemies.killAll());
  await page.waitForFunction(() => window.__game.mission.current?.id === 'extract' || window.__game.state !== 'playing', null, { timeout: 60000 }).catch(() => {});
  const ex = await page.evaluate(() => {
    const M = window.__game.mission;
    return { obj: M.current?.id, heli: !!M.heli, at: M.heli ? [M.heli.lz.x, M.heli.lz.z] : null };
  });
  check(ex.obj === 'extract' && ex.heli, `Seviye 1: bölge temizlenince helikopter tahliyeye geliyor (${ex.at})`);
  await page.evaluate(() => (window.__game.mission.heli.t = 19.9));
  await waitGame(page, 0.4);
  await page.evaluate(() => {
    const g = window.__game;
    const h = g.mission.heli.root.position;
    g.player.reset(new g.player.pos.constructor(h.x + 3, 0, h.z), 0);
  });
  await page.waitForFunction(() => !!window.__game.mission.takeoff, null, { timeout: 60000 }).catch(() => {});
  check(await page.evaluate(() => !!window.__game.mission.takeoff && window.__game.allies.list.every((a) => !a.model.root.visible)), 'Seviye 1: oyuncu ve manga helikoptere bindi, kalkış başladı');
  await page.evaluate(() => (window.__game.mission.takeoff.t = 6));
  await page.waitForFunction(() => window.__game.state === 'victory', null, { timeout: 60000 }).catch(() => {});
  const v = await page.evaluate(() => ({ state: window.__game.state, unlocked: window.__game.progress.unlocked, next: !document.getElementById('btnNext').hidden, title: document.getElementById('victoryTitle').textContent, count: !document.getElementById('victoryNext').hidden }));
  check(v.state === 'victory' && v.unlocked === 2 && v.next && v.count, `Seviye 1 bitti, Seviye 2 açıldı, geri sayım başladı (${v.title})`);
  await page.screenshot({ path: join(shots, '09c-level-clear.png') });
  // Düğmeye basmadan: geri sayım bitince sonraki bölüm kendiliğinden başlar
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 60000 });
  const s2 = await page.evaluate(() => ({ level: window.__game.level.id, allies: window.__game.allies.list.length, obj: window.__game.mission.current.id }));
  check(s2.level === 2 && s2.allies === 3 && s2.obj === 'aa', `Geri sayım bitti: Seviye 2 uçaksavar hedefiyle kendiliğinden başladı`);
  const lastErr = await page.evaluate(() => (window.__game.lastError ? String(window.__game.lastError.stack || window.__game.lastError) : null));
  check(!lastErr, `Döngüde istisna yok${lastErr ? `: ${lastErr}` : ''}`);
  await page.close();
}

// ---------------- Görevler, bonuslar, sonuç ekranı (Operasyon Güncellemesi F5) ----------------
if (run('missions')) {
console.log('Görevler ve bonuslar');

  const page = await openPage('standalone');
  await page.click('#btnPlay');
  await page.click('#diffList .diff:nth-child(2)');
  await page.click('#levelList .lvl:nth-child(1)');
  check(await page.isVisible('#briefScreen'), 'Seviye seçince brifing açıldı');
  const br = await page.evaluate(() => ({
    rows: [...document.querySelectorAll('#briefRoot .brRow b')].map((b) => b.textContent),
    kr: [...document.querySelectorAll('#briefRoot .brRow em')].map((e) => e.textContent),
    objs: document.querySelectorAll('#briefRoot .brObjs li').length,
    reward: document.querySelector('#briefRoot .brReward')?.textContent,
    stars: document.querySelector('#briefRoot .brStars')?.textContent,
  }));
  check(br.rows.join(',') === 'Keskin Göz,Dokunulmaz,Tutumlu' && br.kr.join(',') === '+200 KR,+500 KR,+200 KR' && br.objs === 2, `Brifing: ana hedef (${br.objs} adım), üç bonus ve ödülleri (${br.rows.join(', ')})`);
  check(/1\.000 KR/.test(br.reward || '') && br.stars === '☆☆☆', `Brifing ödülü ve yıldızlar (${br.reward} · ${br.stars})`);
  await page.screenshot({ path: join(shots, '19-briefing.png') });
  await page.click('#btnBriefNext');
  check(await page.isVisible('#loadoutScreen'), 'Brifingden teçhizata geçildi');
  await page.click('#btnDeploy');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 60000 });
  await page.evaluate(() => {
    window.__game.input.lockFailed = true;
    window.__game.cheats.god = true;
  });
  await waitGame(page, 0.6);
  const tr0 = await page.evaluate(() => ({ shown: !document.getElementById('tracker').hidden, rows: [...document.querySelectorAll('#tracker .trRow')].map((r) => r.textContent) }));
  check(tr0.shown && tr0.rows.length === 3 && /Keskin Göz0\/3/.test(tr0.rows[0]), `HUD görev takipçisi (${tr0.rows.join(' | ')})`);
  // Üç kafa vuruşu (gerçek öldürme yolu: takeDamage → onEnemyKilled → ENEMY_KILLED)
  const hh = await page.evaluate(() => {
    const g = window.__game;
    const V = g.player.pos.constructor;
    for (const e of g.enemies.list.filter((x) => x.alive).slice(0, 3)) e.takeDamage(9999, { zone: 'head', source: 'player', weapon: 'rifle', dir: new V(0, 0, -1) });
    return { st: g.run.tracker.state[0], toast: document.getElementById('bonusToast').textContent, row: document.querySelector('#tracker .trRow').className };
  });
  check(hh.st.done && hh.st.progress === 3 && /done/.test(hh.row), 'Keskin Göz 3/3: satır tamamlandı');
  check(/GÖREV TAMAMLANDI — Keskin Göz \+200 KR/.test(hh.toast), `Tamamlanma bildirimi ("${hh.toast}")`);
  await page.keyboard.press('KeyJ');
  await waitGame(page, 0.1);
  const col = await page.evaluate(() => document.getElementById('tracker').classList.contains('collapsed'));
  await page.keyboard.press('KeyJ');
  await waitGame(page, 0.1);
  check(col && !(await page.evaluate(() => document.getElementById('tracker').classList.contains('collapsed'))), 'J takipçiyi daraltıp açtı');
  await page.evaluate(() => window.__game.events.emit('ITEM_USED', { id: 'medkit' }));
  check(await page.evaluate(() => window.__game.run.tracker.state[2].failed && document.querySelectorAll('#tracker .trRow')[2].classList.contains('failed')), 'Sarf kullanınca "Tutumlu" bozuldu (gri)');
  await page.screenshot({ path: join(shots, '19b-tracker.png') });
  // Görev sonu: kredi dökümü, yıldızlar, kayıt
  const c0 = await page.evaluate(() => window.__game.economy.credits);
  await page.evaluate(() => window.__game.onMissionComplete());
  await page.waitForFunction((c) => /1\.700 KR/.test(document.querySelector('#victoryRewards .rwTotal b')?.textContent || ''), null, { timeout: 5000 }).catch(() => {});
  // Bölüm kartının geri sayımı gerçek saatle işler: yavaş makinede "Tekrar oyna"dan önce sonraki bölümü açmasın
  await page.evaluate(() => window.__game.menus.stopCountdown());
  const res = await page.evaluate(() => ({
    rows: [...document.querySelectorAll('#victoryRewards .rwRow')].map((r) => `${r.querySelector('.rwMark').textContent}${r.querySelector('.rwLabel').textContent}=${r.querySelector('b').textContent}`),
    total: document.querySelector('#victoryRewards .rwTotal b').textContent,
    stars: document.querySelector('#victoryRewards .rwStars').textContent,
    credits: window.__game.economy.credits,
    rec: window.__game.save.data.missions['1'],
  }));
  check(res.rows.join(' | ') === '✔Ana hedef=+1.000 KR | ✔Keskin Göz=+200 KR | ✔Dokunulmaz=+500 KR | ✖Tutumlu=—', `Sonuç dökümü (${res.rows.join(' | ')})`);
  check(res.total === '1.700 KR' && res.credits === c0 + 1700 && res.stars === '★★☆', `Toplam ${res.total}, kredi ${c0} → ${res.credits}, ${res.stars}`);
  check(res.rec?.completed && res.rec.stars === 2 && res.rec.bonusDone.join(',') === 'headhunter,untouchable', 'Sonuç kayda yazıldı (2 yıldız, tamamlanan bonuslar)');
  await page.screenshot({ path: join(shots, '19c-results.png') });
  // Tekrar: ana hedef %50, daha önce alınan bonus %25, ilk kez alınan tam
  await page.click('#btnAgain');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 60000 });
  await page.evaluate(() => {
    window.__game.input.lockFailed = true;
    window.__game.onMissionComplete();
    window.__game.menus.stopCountdown();
  });
  const again = await page.evaluate(() => ({ total: window.__game.save.data.econLog.at(-1)?.delta, rows: [...document.querySelectorAll('#victoryRewards .rwRow b')].map((b) => b.textContent) }));
  check(again.total === 500 + 125 + 200 && again.rows.join(',') === '+500 KR,—,+125 KR,+200 KR', `Tekrar oranları: ana %50, Dokunulmaz %25, Tutumlu ilk kez tam (${again.rows.join(', ')})`);
  // Yarıda bırak: bonus yok, öldürme başına teselli
  await page.click('#btnAgain');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 60000 });
  const c1 = await page.evaluate(() => {
    const g = window.__game;
    g.input.lockFailed = true;
    const V = g.player.pos.constructor;
    for (const e of g.enemies.list.filter((x) => x.alive).slice(0, 2)) e.takeDamage(9999, { zone: 'torso', source: 'player', weapon: 'rifle', dir: new V(0, 0, -1) });
    const c = g.economy.credits;
    g.pause();
    return c;
  });
  await page.click('#btnQuit');
  await page.waitForFunction(() => !document.getElementById('menuNotice').hidden, null, { timeout: 30000 }).catch(() => {});
  const q = await page.evaluate(() => ({ notice: document.getElementById('menuNotice').textContent, credits: window.__game.economy.credits, plays: window.__game.save.data.missions['1'].plays }));
  check(q.credits === c1 + 40 && /teselli ödülü \+40 KR/.test(q.notice) && q.plays === 3, `Yarıda bırakınca teselli: "${q.notice}"`);
  await page.click('#btnPlay');
  check(/★★☆/.test(await page.textContent('#levelList .lvl:nth-child(1)')), 'Seviye kartında kazanılan yıldızlar');
  // Konsol: tüm görevleri tamamla / sıfırla
  const con = await page.evaluate(() => {
    const g = window.__game;
    g.console.run('missions complete');
    const all = Object.values(g.save.data.missions).every((m) => m.stars === 3);
    g.console.run('missions reset');
    return { all, empty: Object.keys(g.save.data.missions).length === 0 };
  });
  check(con.all && con.empty, 'Konsol: missions complete (hepsi 3 yıldız) ve missions reset');
  await page.close();

  // Telefon: brifing ve sonuç ekranı yatayda sığıyor
  const mctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await mctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '', contentType: 'text/css' }));
  await mctx.addInitScript(() => {
    try {
      localStorage.setItem('demirsafak.settings.v1', JSON.stringify({ quality: 'low' }));
      localStorage.setItem('demirsafak.progress.v1', JSON.stringify({ unlocked: 6, best: {} }));
    } catch {
      /* depolama yok */
    }
  });
  const mp = await mctx.newPage();
  mp.on('pageerror', (e) => errors.push(`[missions-mobile] pageerror: ${e.message}`));
  await mp.goto(pathToFileURL(join(root, 'dist/index.html')).href);
  await mp.waitForFunction(() => window.__game && window.__game.state === 'menu' && document.getElementById('loading').hidden, null, { timeout: 60000 });
  await mp.tap('#btnPlay');
  await mp.tap('#diffList .diff:nth-child(2)');
  await mp.tap('#levelList .lvl:nth-child(3)');
  await sleep(300);
  await mp.screenshot({ path: join(shots, '19d-briefing-mobile.png') });
  const fitB = await mp.evaluate(() => ({ over: document.scrollingElement.scrollWidth - innerWidth, next: document.getElementById('btnBriefNext').getBoundingClientRect().bottom <= innerHeight + 1 }));
  check(fitB.over <= 1 && fitB.next, `Telefonda brifing sığıyor (taşma ${fitB.over} px, Teçhizat düğmesi görünür)`);
  await mctx.close();
}

// ---------------- Alfa Timi ve komut durum katmanı (Operasyon Güncellemesi F6) ----------------
if (run('squad')) {
console.log('Alfa Timi ve komutlar');

  const page = await openPage('standalone');
  // Tim Zırhı Sv. 1 satın alınmış: askerler +50 ZP ile başlar
  await page.evaluate(() => window.__game.save.update((d) => d.inventory.upgrades.push('squad_armor_1'), { now: true }));
  await page.evaluate(() => window.__game.startMode('mission', 'normal', 3));
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 60000 });
  await page.evaluate(() => {
    const g = window.__game;
    g.input.lockFailed = true;
    g.cheats.god = true;
  });
  await waitGame(page, 0.5);
  const id = await page.evaluate(() => {
    const g = window.__game;
    return {
      names: g.allies.list.map((a) => `${a.callsign} ${a.person} (${a.role})`),
      gun: g.allies.list.map((a) => a.C.magSize),
      armor: g.allies.list.map((a) => a.armor?.points || 0),
      roster: [...document.querySelectorAll('#squad .sq b')].map((b) => b.textContent),
      label: document.querySelector('#squad .sq em')?.textContent,
    };
  });
  check(id.names.join(', ') === 'Alfa-1 Demir (rifleman), Alfa-2 Kaya (medic), Alfa-3 Yıldız (gunner)', `Alfa Timi: ${id.names.join(', ')}`);
  check(id.gun.join(',') === '30,30,100', `Role göre silah: şarjör ${id.gun.join('/')} (makineli tüfekçide 100)`);
  check(id.armor.every((a) => a === 50), `Tim Zırhı Sv. 1: her askerde ${id.armor[0]} ZP`);
  check(id.roster.length === 3 && id.label === 'Takip', `HUD tim listesi (${id.roster.join(', ')} · ${id.label})`);
  // Zırh askerin canını korur
  const arm = await page.evaluate(() => {
    const a = window.__game.allies.list[0];
    const hp0 = a.health.hp;
    a.takeDamage(30, null, { zone: 'torso', pen: 0.3 });
    return { hp: hp0 - a.health.hp, ar: 50 - a.armor.points };
  });
  check(arm.hp < 30 && arm.ar > 0, `Tim Zırhı hasarı emdi (cana ${arm.hp.toFixed(1)}, zırha ${arm.ar.toFixed(1)})`);
  await page.screenshot({ path: join(shots, '20-squad-hud.png') });

  const ev = (name) => page.evaluate((n) => (window.__ev ||= {}, window.__ev[n] ||= [], window.__game.events.on(n, (e) => window.__ev[n].push({ id: e.commandId, by: e.by, reason: e.reason, who: e.addressees }))), name);
  for (const n of ['COMMAND_ISSUED', 'COMMAND_COMPLETED', 'COMMAND_FAILED']) await ev(n);
  // F4: Siper alın → tüm tim; onay repliği; sipere varınca tamamlanır
  await page.keyboard.press('F4');
  await waitGame(page, 0.1);
  const cov = await page.evaluate(() => {
    const g = window.__game;
    const issued = window.__ev.COMMAND_ISSUED.at(-1);
    const q = [...g.chat.lines.map((l) => l.el.textContent.replace(/^\[(.*?)\] /, '$1: ')), ...g.mission.radioQueue.map((r) => `${r.who}: ${r.text}`)];
    for (const a of g.allies.list) if (a.order.pos) a.pos.copy(a.order.pos);
    g.allies.update(0.05);
    return { issued, orders: g.allies.list.map((a) => a.order.id), q, done: window.__ev.COMMAND_COMPLETED.map((e) => e.id) };
  });
  check(cov.issued?.id === 'TAKE_COVER' && cov.issued.who.length === 3 && cov.orders.every((o) => o === 'TAKE_COVER'), `F4 "Siper alın": üç asker siper emrinde`);
  check(cov.q.some((l) => /^Komutan → Alfa Timi: Siper alın!/.test(l)) && cov.q.some((l) => /^Alfa-1 .*Demir: /.test(l)), `Telsizde komut ve Alfa-1'in onayı (${cov.q.slice(0, 2).join(' | ')})`);
  check(cov.done.includes('TAKE_COVER'), 'Sipere varınca komut tamamlandı');
  // Oraya git: ulaşılabilir nokta tamamlanır, ulaşılamayan "yol yok" ile başarısız olur
  const mv = await page.evaluate(() => {
    const g = window.__game;
    const P = g.player.pos;
    const ok = g.nav.randomPointNear(P.clone().add(new P.constructor(0, 0, -8)), 3);
    g.commands.issue('MOVE_TO', 'Alfa-1', { pos: ok, inputMethod: 'test' });
    const a = g.allies.list[0];
    const pos = a.order.pos?.clone();
    a.pos.copy(pos);
    g.allies.update(0.05);
    const done = window.__ev.COMMAND_COMPLETED.at(-1)?.id;
    const q = [...g.chat.lines.map((l) => l.el.textContent.replace(/^\[.*?\] /, '')), ...g.mission.radioQueue.map((r) => r.text)].at(-1);
    g.commands.issue('MOVE_TO', 'Alfa-3', { pos: new P.constructor(9999, 0, 9999), inputMethod: 'test' });
    return { done, q, failed: window.__ev.COMMAND_FAILED.at(-1), order: a.order.id, arrived: a.order.arrived, o3: g.allies.list[2].order.id };
  });
  check(mv.done === 'MOVE_TO' && mv.order === 'MOVE_TO' && mv.arrived && /Pozisyon|Yerim|Hazır/.test(mv.q || ''), `Oraya git: Alfa-1 vardı, bildirdi ("${mv.q}")`);
  check(mv.failed?.id === 'MOVE_TO' && mv.failed.reason === 'no-path' && mv.o3 !== 'MOVE_TO', `Ulaşılamayan nokta: "yol yok" ile başarısız, emir alınmadı (${JSON.stringify(mv.failed)}, ${mv.o3})`);
  // F5: Beni iyileştir → yalnız medik; 4 sn'de +40 can; ikinci istek bekleme süresinde
  await page.evaluate(() => (window.__game.player.health.hp = 50));
  await page.keyboard.press('F5');
  await waitGame(page, 0.1);
  const heal = await page.evaluate(() => {
    const g = window.__game;
    const issued = window.__ev.COMMAND_ISSUED.at(-1);
    const med = g.allies.list[1];
    const order = med.order.id;
    // Tedavi süresi ölçülür: düşmanlar dondurulur (vurulan medik kendini korumak için sipere kaçmasın); çatışmada
    // yere düşen asker varsa kaldırılır (medik önce yerdeki dosta koşar, bu doğru davranış ama burada ölçümü bozar)
    g.cheats.aiOff = true;
    for (const a of g.allies.list) if (a.down && !a.dead) a.reviveBy('test');
    med.reviving = null;
    med.health.hp = med.health.max;
    med.lastHurt = -99;
    med.selfCoverUntil = 0;
    med.pos.copy(g.player.pos).add(new g.player.pos.constructor(0.8, 0, 0));
    g.player.health.hp = 50;
    for (let i = 0; i < 45; i++) g.allies.update(0.1);
    const hp = g.player.health.hp;
    const st = { t: med.order.t, d: +med.pos.distanceTo(g.player.pos).toFixed(2), mhp: Math.round(med.health.hp), self: med.selfCoverUntil > g.time, rev: med.reviving?.callsign || null, down: g.allies.list.filter((a) => a.down).map((a) => a.callsign) };
    g.commands.issue('HEAL_PLAYER', 'all', { inputMethod: 'test' });
    g.cheats.aiOff = false;
    return { who: issued.who, order, hp, fail: window.__ev.COMMAND_FAILED.at(-1), back: med.order.id, st };
  });
  check(heal.who.join(',') === 'Alfa-2' && heal.order === 'HEAL_PLAYER', 'F5 "Beni iyileştir": yalnız medik (Alfa-2) gitti');
  check(heal.hp >= 89 && heal.back !== 'HEAL_PLAYER', `Medik 4 sn'de iyileştirdi (can 50 → ${Math.round(heal.hp)}), önceki emre döndü${heal.hp < 89 ? ` ${JSON.stringify(heal.st)}` : ''}`);
  check(heal.fail?.id === 'HEAL_PLAYER' && heal.fail.reason === 'cooldown', 'İkinci istek bekleme süresinde reddedildi');
  // F8 / F9: ateşi kes, serbest ateş
  await page.keyboard.press('F8');
  await waitGame(page, 0.1);
  const hf = await page.evaluate(() => window.__game.allies.list.map((a) => a.holdFire));
  await page.keyboard.press('F9');
  await waitGame(page, 0.1);
  const ff = await page.evaluate(() => window.__game.allies.list.map((a) => a.holdFire));
  check(hf.every(Boolean) && ff.every((x) => !x), 'F8 ateşi kes, F9 serbest ateş (tetik disiplini)');
  // Saldır: işaretli düşmana odak; düşünce "hedef etkisiz" ve tamamlandı
  const atk = await page.evaluate(() => {
    const g = window.__game;
    const e = g.enemies.list.find((x) => x.alive && !x.dummy);
    g.commands.issue('ATTACK', 'all', { target: e, inputMethod: 'test' });
    const focus = g.allies.list.every((a) => a.focus === e);
    e.takeDamage(9999, { zone: 'torso', source: 'ally', attacker: g.allies.list[0], weapon: 'allyRifle', dir: new g.player.pos.constructor(0, 0, -1) });
    g.allies.update(0.05);
    return { focus, done: window.__ev.COMMAND_COMPLETED.at(-1)?.id, cleared: g.allies.list.every((a) => !a.focus) };
  });
  check(atk.focus && atk.done === 'ATTACK' && atk.cleared, 'Saldır: tim işaretli düşmana odaklandı, düşünce komut tamamlandı');
  // Baskı ateşi (makineli tüfekçi): alandaki düşmanların isabeti düşer; o sırada öldürülen "baskı altında" sayılır
  const sup = await page.evaluate(() => {
    const g = window.__game;
    const e = g.enemies.list.find((x) => x.alive && !x.dummy);
    const gun = g.allies.list[2];
    gun.pos.copy(e.pos).add(new g.player.pos.constructor(14, 0, 0));
    g.commands.issue('SUPPRESS', 'Alfa-3', { pos: e.pos.clone(), inputMethod: 'test' });
    for (let i = 0; i < 30; i++) g.allies.update(0.05);
    const pen = g.allies.isSuppressing(e);
    let under = null;
    const off = g.events.on('ENEMY_KILLED', (k) => (under = k.underSuppression));
    e.takeDamage(9999, { zone: 'torso', source: 'player', weapon: 'rifle', dir: new g.player.pos.constructor(0, 0, -1) });
    off();
    return { pen, under, mag: gun.weapon.mag, label: [...document.querySelectorAll('#squad .sq em')].map((x) => x.textContent) };
  });
  check(sup.pen && sup.under === true, 'Baskı ateşi: alandaki düşman bastırıldı, öldürme "baskı altında" sayıldı');
  // Kendini koruma: can %25'in altında ve ateş altında → siper, telsiz
  const self = await page.evaluate(() => {
    const g = window.__game;
    const a = g.allies.list[0];
    a.order = { id: 'FOLLOW', cmd: null };
    a.health.hp = a.health.max * 0.15;
    a.lastHurt = g.time;
    a.selfCoverUntil = 0;
    g.allies.update(0.05);
    return { until: a.selfCoverUntil > g.time, q: [...g.chat.lines.map((l) => l.el.textContent), ...g.mission.radioQueue.map((r) => r.text)] };
  });
  check(self.until && self.q.some((t) => /siper/i.test(t)), 'Kendini koruma: ağır yaralı asker emirden önce sipere geçti');
  await page.screenshot({ path: join(shots, '20b-squad-orders.png') });
  const lastErr = await page.evaluate(() => (window.__game.lastError ? String(window.__game.lastError.stack || window.__game.lastError) : null));
  check(!lastErr, `Döngüde istisna yok${lastErr ? `: ${lastErr}` : ''}`);
  await page.close();
}

// ---------------- Yere düşme ve canlandırma (Operasyon Güncellemesi F7) ----------------
if (run('downed')) {
console.log('Yere düşme ve canlandırma');

  const page = await openPage('standalone');
  await page.evaluate(() => window.__game.startMode('mission', 'normal', 3));
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 60000 });
  await page.evaluate(() => {
    const g = window.__game;
    g.input.lockFailed = true;
    window.__ev = [];
    for (const n of ['PLAYER_DOWNED', 'PLAYER_REVIVED', 'ALLY_DOWNED', 'ALLY_REVIVED', 'ALLY_DIED']) g.events.on(n, (e) => window.__ev.push(`${n}:${e.by || e.allyId || e.downCount || ''}`));
    // Düşmanlar uzakta kalsın: ölçümler doğrudan çağrıyla yapılır
    for (const e of g.enemies.list) e.pos.y = -500;
  });
  await waitGame(page, 0.3);
  // 1) Ölümcül hasar: ölmez, yere düşer; sayaç 30 sn; ekran ve HUD
  const d1 = await page.evaluate(() => {
    const g = window.__game;
    const P = g.player;
    P.health.hp = 12;
    P.takeDamage(40, null, { zone: 'torso', pen: 1 });
    g.hud.update(0.016);
    return { down: P.down, alive: P.alive, total: P.bleed?.total, shown: !document.getElementById('downed').hidden, time: document.getElementById('dnTime').textContent, filter: document.getElementById('game').style.filter, ev: window.__ev.slice() };
  });
  check(d1.down && d1.alive && d1.total === 30 && d1.ev.includes('PLAYER_DOWNED:1'), `Ölümcül hasarda yere düştü (kan kaybı ${d1.total} sn)`);
  check(d1.shown && d1.time === '30' && /grayscale/.test(d1.filter), `Yerde ekranı: halka ve süre (${d1.time}), renkler soluyor (${d1.filter})`);
  // 2) Yerdeyken hasar süreden düşer; silah kullanılmaz
  const d2 = await page.evaluate(() => {
    const g = window.__game;
    const P = g.player;
    const l0 = P.bleed.left;
    P.takeDamage(20, null, { zone: 'torso' });
    g.viewmodel.update(0.016);
    return { drop: l0 - P.bleed.left, vm: g.viewmodel.holder.visible };
  });
  check(Math.abs(d2.drop - 5) < 0.01 && !d2.vm, `Yerdeyken 20 hasar süreden ${d2.drop.toFixed(2)} sn düşürdü, silah görünmüyor (${!d2.vm})`);
  // 3) Asker gelir ve canlandırır (medik 2 sn); kalkınca can %35
  const d3 = await page.evaluate(() => {
    const g = window.__game;
    const P = g.player;
    const med = g.allies.list[1];
    med.pos.copy(P.pos).add(new P.pos.constructor(1, 0, 0));
    for (const a of [g.allies.list[0], g.allies.list[2]]) a.pos.copy(P.pos).add(new P.pos.constructor(14, 0, 0));
    g.allies.rescueT = 0;
    g.allies.update(0.05);
    g.hud.update(0.016);
    const status = document.getElementById('dnStatus').textContent;
    const reviver = g.allies.rescue.reviver?.callsign;
    const scores = g.allies.list.map((a) => Math.round(a.assist?.score ?? -1));
    let paused = null;
    for (let i = 0; i < 40 && P.down; i++) {
      const l = P.bleed.left;
      g.allies.update(0.1);
      if (P.reviver && paused === null) paused = Math.abs(P.bleed.left - l) < 1e-9;
    }
    return { reviver, scores, status, up: !P.down, hp: Math.round(P.health.hp), ev: window.__ev.slice() };
  });
  check(d3.reviver === 'Alfa-2' && /Kaya/.test(d3.status), `En yüksek yardım puanlı asker seçildi: ${d3.reviver} (${d3.scores.join(' / ')}) · "${d3.status}"`);
  check(d3.up && d3.hp === 35 && d3.ev.includes('PLAYER_REVIVED:Alfa-2'), `Medik canlandırdı, %35 canla kalktı (${d3.hp})`);
  // 4) İkinci düşüş daha kısa (20 sn); pes et (X basılı 2 sn) → ölüm
  const d4 = await page.evaluate(() => {
    const g = window.__game;
    const P = g.player;
    P.health.hp = 5;
    P.protectUntil = -1;
    P.takeDamage(50, null, { zone: 'torso', pen: 1 });
    const total = P.bleed.total;
    const hold = { pressed: () => false, isDown: (a) => a === 'swapWeapon', consumeLook: () => ({ dx: 0, dy: 0 }), move: () => ({ x: 0, y: 0 }), touch: { active: false } };
    for (let i = 0; i < 25 && P.alive; i++) P.update(0.1, hold);
    return { total, dead: !P.alive };
  });
  check(d4.total === 20 && d4.dead, `İkinci düşüşte kan kaybı ${d4.total} sn; X basılı tutunca pes etti`);
  await page.evaluate(() => window.__game.respawn());
  await waitGame(page, 0.2);
  // 5) Adrenalin: yerdeyken kendini kaldırır, görev başına bir
  const d5 = await page.evaluate(() => {
    const g = window.__game;
    const P = g.player;
    g.save.update((d) => (d.inventory.consumables.adrenaline = 1), { now: true });
    g.kit.reset([{ id: 'adrenaline', count: 1 }]);
    P.health.hp = 5;
    P.takeDamage(50, null, { zone: 'torso', pen: 1 });
    const down = P.down;
    g.kit.use(0);
    return { down, up: !P.down, by: window.__ev.at(-1), inv: g.save.data.inventory.consumables.adrenaline };
  });
  check(d5.down && d5.up && d5.by === 'PLAYER_REVIVED:adrenaline' && d5.inv === 0, 'Adrenalin Şırıngası yerdeyken kaldırdı, envanterden düştü');
  // 6) Anında ölüm: tek seferde 150+ hasar
  const d6 = await page.evaluate(() => {
    const g = window.__game;
    const P = g.player;
    P.protectUntil = -1;
    P.health.hp = P.health.max;
    P.takeDamage(200, null, { zone: 'torso', pen: 1 });
    return { down: P.down, dead: !P.alive };
  });
  check(!d6.down && d6.dead, 'Tek seferde 150+ hasar: yere düşmeden ölüm');
  await page.evaluate(() => window.__game.respawn());
  await waitGame(page, 0.2);
  // 7) Asker yere düşer (Normal: 45 sn kan kaybı); oyuncu E basılı 3 sn kaldırır → Kardeşlik bonusu
  const d7 = await page.evaluate(() => {
    const g = window.__game;
    const P = g.player;
    const a = g.allies.list[0];
    a.takeDamage(9999, null, { zone: 'torso' });
    const bleed = a.bleed?.total;
    P.reset(a.pos.clone().add(new P.pos.constructor(0.4, 0, 0)), 0);
    P.pitch = -1.2;
    const hold = { pressed: (x) => x === 'interact', isDown: (x) => x === 'interact' };
    const f0 = new P.pos.constructor();
    g.camera.getWorldDirection(f0);
    const dbg = { en: a.reviveIa?.enabled(), found: g.findInteractable(P.eyePos.clone(), f0)?.id, alive: P.alive, pdown: P.down, ws: g.weapons.state, d: a.reviveIa?.pos.distanceTo(P.eyePos) };
    for (let i = 0; i < 40 && a.down; i++) {
      // Oyuncu yerdeki askere bakar (etkileşim yüzü dönük ister)
      g.camera.position.copy(P.eyePos);
      g.camera.lookAt(a.reviveIa.pos);
      g.camera.updateMatrixWorld();
      P.updateInteraction(0.1, hold);
      g.allies.update(0.05);
    }
    const bro = g.run.mission.bonus.findIndex((b) => b.id === 'brotherhood');
    return { bleed, up: !a.down, ev: window.__ev.slice(-3), given: g.save.data.stats.revivesGiven, bro: bro >= 0 ? g.run.tracker.state[bro].done : null, ia: !!a.reviveIa, inList: g.mission.interactables.includes(a.reviveIa), tgt: P.interactTarget?.id, it: P.interactT, dbg };
  });
  check(d7.bleed === 45 && d7.up && d7.ev.includes('ALLY_REVIVED:player'), `Asker yere düştü (kan kaybı ${d7.bleed} sn), oyuncu E basılı tutup kaldırdı (${JSON.stringify(d7)})`);
  check(d7.given >= 1 && d7.bro === true, `Canlandırma istatistiği ve "Kardeşlik" bonusu (${d7.given})`);
  // 8) Asker kan kaybından ölür; kontrol noktasında geri gelir
  const d8 = await page.evaluate(() => {
    const g = window.__game;
    const a = g.allies.list[2];
    a.takeDamage(9999, null, { zone: 'torso' });
    // Diğer askerler uzakta: yanına gelen olursa sayaç (doğru olarak) durur
    for (const o of g.allies.list) if (o !== a) o.pos.copy(a.pos).add(new a.pos.constructor(60, 0, 0));
    a.bleed.left = 0.05;
    for (let i = 0; i < 3; i++) g.allies.update(0.1);
    const dead = a.dead;
    g.mission.saveCheckpoint(g.mission.checkpoint?.idx ?? 0);
    return { dead, ev: window.__ev.includes('ALLY_DIED:Alfa-3'), back: !a.dead && !a.down, by: a.revivedBy?.callsign || a.revivedBy, left: a.bleed?.left, down: a.down };
  });
  check(d8.dead && d8.ev && d8.back, `Asker kan kaybından öldü (ALLY_DIED), kontrol noktasında geri geldi (${JSON.stringify(d8)})`);
  // 9) Kolay'da asker ölmez: kan kaybı sayacı yok, kendi kalkar
  const d9 = await page.evaluate(() => {
    const g = window.__game;
    const k = g.difficultyKey;
    g.difficultyKey = 'easy';
    const a = g.allies.list[1];
    a.takeDamage(9999, null, { zone: 'torso' });
    const r = { down: a.down, bleed: a.bleed };
    g.difficultyKey = k;
    a.reviveBy(null);
    return r;
  });
  check(d9.down && d9.bleed === null, 'Kolay: yere düşen asker kan kaybından ölmez (kendi kalkar)');
  await page.evaluate(() => {
    const g = window.__game;
    g.player.health.hp = 5;
    g.player.protectUntil = -1;
    g.player.takeDamage(50, null, { zone: 'torso', pen: 1 });
    g.hud.update(0.016);
  });
  await page.screenshot({ path: join(shots, '21-downed.png') });
  const lastErr = await page.evaluate(() => (window.__game.lastError ? String(window.__game.lastError.stack || window.__game.lastError) : null));
  check(!lastErr, `Döngüde istisna yok${lastErr ? `: ${lastErr}` : ''}`);
  await page.close();
}

// ---------------- Etkileşimler: pompalı, C4, istihbarat, ikmal ----------------
// ---------------- Komut çarkı, bağlamsal işaret, tuş atama (Operasyon Güncellemesi F8) ----------------
if (run('commands')) {
console.log('Komut çarkı, işaret ve tuş atama');

  const page = await openPage('standalone');
  // Kontroller ekranı: yuvaya tıkla → tuşa bas → atanır; çakışan tuş öbür eylemden alınır; varsayılana dönüş
  await page.click('#btnControls');
  await page.click('.kbind[data-action="reload"][data-slot="0"]');
  const wait = await page.evaluate(() => document.querySelector('.kbind.wait')?.dataset.action);
  await page.keyboard.press('KeyY');
  const kb1 = await page.evaluate(() => {
    return { reload: [...document.querySelectorAll('.kbind[data-action="reload"]')].map((b) => b.textContent), saved: window.__game.save.data.settings.bindings, note: document.getElementById('keyNote').textContent };
  });
  check(wait === 'reload' && kb1.reload[0] === 'Y' && JSON.stringify(kb1.saved) === '{"reload":["KeyY"]}', `Şarjör tuşu R → Y (kayıtta yalnız fark: ${JSON.stringify(kb1.saved)})`);
  await page.click('.kbind[data-action="reload"][data-slot="0"]');
  await page.keyboard.press('KeyT');
  const kb2 = await page.evaluate(() => ({ wheel: document.querySelector('.kbind[data-action="wheel"][data-slot="0"]').textContent, note: document.getElementById('keyNote').textContent, warn: document.getElementById('keyNote').classList.contains('warn') }));
  check(kb2.wheel === '—' && /önce Komut çarkı/.test(kb2.note) && kb2.warn, `Çakışma: T komut çarkından alındı, uyarı ("${kb2.note}")`);
  // Başka yere sol tık bekleyen yuvayı iptal eder (sol tık atanmaz)
  await page.click('.kbind[data-action="jump"][data-slot="0"]');
  await page.click('#controlsScreen h2');
  const kb3 = await page.evaluate(() => ({ jump: document.querySelector('.kbind[data-action="jump"][data-slot="0"]').textContent, waiting: !!document.querySelector('.kbind.wait') }));
  check(kb3.jump === 'Boşluk' && !kb3.waiting, 'Başka yere tıklamak bekleyen yuvayı iptal etti');
  await page.screenshot({ path: join(shots, '22-controls-bind.png') });
  await page.click('#btnKeysReset');
  const kb4 = await page.evaluate(() => ({ saved: window.__game.save.data.settings.bindings, wheel: document.querySelector('.kbind[data-action="wheel"][data-slot="0"]').textContent, reload: document.querySelector('.kbind[data-action="reload"][data-slot="0"]').textContent }));
  check(JSON.stringify(kb4.saved) === '{}' && kb4.wheel === 'T' && kb4.reload === 'R', 'Varsayılan tuşlar geri geldi (T çark, R şarjör)');
  await page.click('#controlsScreen [data-back]');

  await page.evaluate(() => window.__game.startMode('mission', 'normal', 3));
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 60000 });
  await page.evaluate(() => {
    const g = window.__game;
    g.input.lockFailed = true;
    g.cheats.god = true;
    g.cheats.aiOff = true;
    window.__ev = [];
    g.events.on('COMMAND_ISSUED', (e) => window.__ev.push({ id: e.commandId, who: e.addressees, m: e.inputMethod, src: e.sourceText }));
  });
  await waitGame(page, 0.4);
  // T basılı: çark açılır, oyun %30'a yavaşlar; dilim seçmeden bırakınca komut verilmez
  await page.keyboard.down('KeyT');
  await page.waitForFunction(() => window.__game.wheel.open, null, { timeout: 30000 }).catch(() => {});
  const w1 = await page.evaluate(() => ({ open: window.__game.wheel.open, shown: !document.getElementById('wheel').hidden, slow: window.__game.wheel.slow, n: document.querySelectorAll('#wheel .wSlice').length, addr: document.querySelector('#wheel .wAddr').textContent }));
  await page.screenshot({ path: join(shots, '22b-wheel.png') });
  await page.keyboard.up('KeyT');
  await page.waitForFunction(() => !window.__game.wheel.open, null, { timeout: 30000 }).catch(() => {});
  check(w1.open && w1.shown && w1.n === 8 && Math.abs(w1.slow - 0.3) < 1e-6 && w1.addr === 'TÜM TİM', `T basılı: 8 dilimli çark, oyun hızı ×${w1.slow}, muhatap ${w1.addr}`);
  check(await page.evaluate(() => !window.__game.wheel.open && !window.__ev.length), 'Dilim seçmeden bırakınca komut verilmedi');
  // Fare yönü dilimi seçer (sağ → Oraya git), 2 muhatabı Alfa-1 yapar, bırakınca o askere verilir; askerin başında simge
  const w2 = await page.evaluate(() => {
    const g = window.__game;
    const P = g.player;
    const a1 = g.allies.list[0];
    // Alfa-1 oyuncunun 6 m önünde: etiketi ekranda görünsün
    a1.pos.set(P.pos.x - Math.sin(P.yaw) * 6, P.pos.y, P.pos.z - Math.cos(P.yaw) * 6);
    const fake = (look, pressed, down) => ({ pressed: (a) => pressed.includes(a), isDown: (a) => down.includes(a), consumeLook: () => look, touch: { active: false } });
    g.wheel.show(false);
    g.wheel.update(0.016, fake({ dx: 45, dy: 4 }, ['weapon2'], ['wheel']));
    const sel = g.wheel.sel;
    const addr = document.querySelector('#wheel .wAddr').textContent;
    const lit = document.querySelector('#wheel .wSlice.on text')?.textContent;
    // Nişangâh oyuncunun 5 m önündeki yürünebilir bir noktada (komut noktası nişangâhtan alınır)
    const V = P.pos.constructor;
    const tgt = g.nav.randomPointNear(P.pos.clone().add(new V(-Math.sin(P.yaw) * 5, 0, -Math.cos(P.yaw) * 5)), 2);
    const eye = P.pos.clone().add(new V(0, 1.6, 0));
    g.camera.position.copy(eye);
    g.camera.lookAt(tgt.x, 0, tgt.z);
    g.camera.updateMatrixWorld();
    g.wheel.update(0.016, fake({ dx: 0, dy: 0 }, [], []));
    return { sel, addr, lit, open: g.wheel.open, ev: window.__ev.at(-1), order: a1.order.id, others: g.allies.list.slice(1).map((a) => a.order.id) };
  });
  check(w2.sel === 2 && w2.addr === 'ALFA-1' && /Oraya/.test(w2.lit || ''), `Fare sağa: "Oraya git" dilimi yandı, 2 → ${w2.addr}`);
  check(!w2.open && w2.ev?.id === 'MOVE_TO' && w2.ev.m === 'wheel' && w2.ev.who.join() === 'Alfa-1' && w2.order === 'MOVE_TO' && w2.others.every((o) => o !== 'MOVE_TO'), `Bırakınca komut yalnız Alfa-1'e gitti (${JSON.stringify(w2.ev)})`);
  await waitGame(page, 0.3);
  const tag = await page.evaluate(() => [...document.querySelectorAll('.atag b')].filter((b) => !b.hidden).map((b) => b.textContent));
  check(tag.some((t) => /➤ Oraya git/.test(t)), `Komutu alan askerin başında simge (${tag.join(', ')})`);
  // Ayar: çark yavaşlatması kapalı → tam hız
  const slow1 = await page.evaluate(() => {
    const g = window.__game;
    g.settings.wheelSlowMo = 1;
    g.wheel.show(false);
    const s = g.wheel.slow;
    g.wheel.close(false);
    g.settings.wheelSlowMo = 0.3;
    return s;
  });
  check(slow1 === 1, 'Ayar: çarkta yavaşlatma kapatılabiliyor');

  // Z: düşmana bakınca saldır (kırmızı elmas), zemine bakınca git (halka), iki hızlı basış iptal → takip
  const pg = await page.evaluate(() => {
    const g = window.__game;
    const V = g.player.pos.constructor;
    g.ping.lastT = -10;
    // Görüş hattı açık bir noktadan düşmanın göğsüne bak
    const e = g.enemies.list.find((x) => x.alive && !x.dummy);
    const chest = e.pos.clone().add(new V(0, 1.2, 0));
    let eye = null;
    for (let k = 0; k < 16 && !eye; k++) {
      const a = (k / 16) * Math.PI * 2;
      const c = chest.clone().add(new V(Math.sin(a) * 6, 0.4, Math.cos(a) * 6));
      if (g.world.lineOfSight(c, chest)) eye = c;
    }
    g.camera.position.copy(eye);
    g.camera.lookAt(chest);
    g.camera.updateMatrixWorld();
    // Seçili muhatap çarkta Alfa-1 yapılmıştı: işaret testleri tüm time
    g.wheel.addr = 0;
    g.wheel.renderAddr();
    const kind1 = g.ping.press();
    const atk = window.__ev.at(-1);
    const focus = g.allies.list.every((a) => a.focus === e);
    g.ping.update(0.016);
    const diamond = g.ping.diamond.visible && g.ping.diamond.position.distanceTo(e.pos) < 3;
    // Zemin: oyuncunun gözünden 6 m ileriye, yere
    g.ping.lastT = -10;
    const P = g.player;
    const eye2 = P.pos.clone().add(new V(0, 1.6, 0));
    const tgt = g.nav.randomPointNear(P.pos.clone().add(new V(-Math.sin(P.yaw) * 5, 0, -Math.cos(P.yaw) * 5)), 2);
    g.camera.position.copy(eye2);
    g.camera.lookAt(tgt.x, 0, tgt.z);
    g.camera.updateMatrixWorld();
    const kind2 = g.ping.press();
    const mv = window.__ev.at(-1);
    const ring = g.ping.ring.visible;
    // Hemen ikinci basış: iptal → aynı muhataplar takibe
    const kind3 = g.ping.press();
    const cancel = window.__ev.at(-1);
    return { kind1, atk, focus, diamond, kind2, mv, ring, kind3, cancel, ringAfter: g.ping.ring.visible, orders: g.allies.list.map((a) => a.order.id) };
  });
  check(pg.kind1 === 'enemy' && pg.atk?.id === 'ATTACK' && pg.atk.m === 'ping' && pg.focus && pg.diamond, 'Z düşmanda: tim saldırıya geçti, düşmanın üstünde kırmızı elmas');
  check((pg.kind2 === 'ground' && pg.mv?.id === 'MOVE_TO') || (pg.kind2 === 'room' && pg.mv?.id === 'CLEAR_AREA'), `Z zeminde: ${pg.kind2} → ${pg.mv?.id}, yerde halka (${pg.ring})`);
  check(pg.ring, 'Oraya git noktasında halka görünüyor');
  check(pg.kind3 === undefined && pg.cancel?.id === 'FOLLOW' && !pg.ringAfter && pg.orders.every((o) => o === 'FOLLOW'), 'İki hızlı Z: işaret iptal, tim takibe döndü');
  // Z yaralı askerde: en yakın sağlam asker gidip kaldırır
  const rv = await page.evaluate(() => {
    const g = window.__game;
    const V = g.player.pos.constructor;
    g.ping.lastT = -10;
    const [a1, a2, a3] = g.allies.list;
    const P = g.player;
    const fwd = new V(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
    a1.pos.copy(g.nav.randomPointNear(P.pos.clone().addScaledVector(fwd, 5), 2));
    a1.takeDamage(9999, null, { zone: 'torso' });
    a2.pos.copy(g.nav.randomPointNear(a1.pos, 3));
    a3.pos.copy(g.nav.randomPointNear(P.pos.clone().addScaledVector(fwd, -15), 3));
    const eye = P.pos.clone().add(new V(0, 1.6, 0));
    g.camera.position.copy(eye);
    g.camera.lookAt(a1.pos.clone().add(new V(0, 0.3, 0)));
    g.camera.updateMatrixWorld();
    const kind = g.ping.press();
    const ev = window.__ev.at(-1);
    return { down: a1.down, kind, ev, helper: a2.reviving === a1, far: a3.reviving === a1 };
  });
  check(rv.down && rv.kind === 'downed' && rv.ev?.id === 'MOVE_TO' && rv.ev.who.join() === 'Alfa-2' && rv.helper && !rv.far, `Z yaralı askerde: en yakın asker (Alfa-2) kaldırmaya gitti (${rv.ev?.src})`);
  await page.screenshot({ path: join(shots, '22c-ping.png') });
  const lastErr = await page.evaluate(() => (window.__game.lastError ? String(window.__game.lastError.stack || window.__game.lastError) : null));
  check(!lastErr, `Döngüde istisna yok${lastErr ? `: ${lastErr}` : ''}`);
  await page.close();

  // Telefon: TELSİZ düğmesi çarkı açar, dilime dokununca komut; İŞARET düğmesi; paneller üst üste binmez
  const mctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await mctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '', contentType: 'text/css' }));
  await mctx.addInitScript(() => {
    try {
      localStorage.setItem('demirsafak.settings.v1', JSON.stringify({ quality: 'low' }));
      localStorage.setItem('demirsafak.progress.v1', JSON.stringify({ unlocked: 6, best: {} }));
    } catch {
      /* depolama yok */
    }
  });
  const mp = await mctx.newPage();
  mp.on('pageerror', (e) => errors.push(`[commands-mobile] pageerror: ${e.message}`));
  await mp.goto(pathToFileURL(join(root, 'dist/index.html')).href);
  await mp.waitForFunction(() => window.__game && window.__game.state === 'menu' && document.getElementById('loading').hidden, null, { timeout: 60000 });
  await mp.evaluate(() => window.__game.startMode('mission', 'normal', 3));
  await mp.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 60000 });
  await mp.evaluate(() => {
    const g = window.__game;
    g.cheats.god = true;
    window.__ev = [];
    g.events.on('COMMAND_ISSUED', (e) => window.__ev.push({ id: e.commandId, who: e.addressees, m: e.inputMethod }));
    g.events.on('COMMAND_FAILED', (e) => window.__ev.push({ id: e.commandId, who: e.addressees, m: e.inputMethod, failed: e.reason }));
  });
  await waitGame(mp, 0.6);
  const lay = await mp.evaluate(() => {
    const r = (id) => document.getElementById(id).getBoundingClientRect();
    const hit = (a, b) => a.width && b.width && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
    const ids = ['objective', 'health', 'ammo', 'squad', 'tracker'].filter((id) => !document.getElementById(id).hidden);
    const over = [];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) if (hit(r(ids[i]), r(ids[j]))) over.push(`${ids[i]}/${ids[j]}`);
    const btn = ['tbWheel', 'tbPing'].map((id) => document.getElementById(id)).map((b) => getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().bottom <= innerHeight);
    return { ids, over, btn, tr: r('tracker').bottom, h: innerHeight };
  });
  check(lay.over.length === 0 && lay.ids.length >= 4 && lay.tr <= lay.h, `Telefonda HUD panelleri üst üste binmiyor (${lay.ids.join(', ')}${lay.over.length ? ` · çakışan: ${lay.over.join(', ')}` : ''})`);
  check(lay.btn.every(Boolean), 'Telefonda TELSİZ ve İŞARET düğmeleri görünüyor');
  await mp.screenshot({ path: join(shots, '22d-mobile-squad.png') });
  await mp.tap('#tbWheel');
  await mp.waitForFunction(() => window.__game.wheel.open, null, { timeout: 30000 }).catch(() => {});
  const mw = await mp.evaluate(() => ({ open: window.__game.wheel.open, touch: document.getElementById('wheel').classList.contains('touch') }));
  await mp.screenshot({ path: join(shots, '22e-mobile-wheel.png') });
  // Ortaya dokun: muhatap değişir; "Siper al" dilimine dokun: komut verilir
  await mp.tap('#wheel .wCenter');
  const addr = await mp.evaluate(() => document.querySelector('#wheel .wAddr').textContent);
  const box = await mp.evaluate(() => {
    const p = document.querySelector('#wheel .wSlice path[data-cmd="TAKE_COVER"]').getBoundingClientRect();
    return { x: p.left + p.width / 2, y: p.top + p.height / 2 };
  });
  await mp.touchscreen.tap(box.x, box.y);
  await waitGame(mp, 0.1);
  const mw2 = await mp.evaluate(() => ({ open: window.__game.wheel.open, ev: window.__ev.at(-1) }));
  check(mw.open && mw.touch && addr === 'ALFA-1' && !mw2.open && mw2.ev?.id === 'TAKE_COVER' && mw2.ev.m === 'wheel' && mw2.ev.who.join() === 'Alfa-1', `Dokunmatik çark: ortaya dokunuş muhatabı ${addr} yaptı, dilim komutu verdi (${JSON.stringify(mw2.ev)})`);
  await mp.tap('#tbPing');
  await waitGame(mp, 0.1);
  // Yeni komut önceki çark komutunu geçersiz kılar (o komut "replaced" ile düşer): işaretten çıkanı ara
  const mpg = await mp.evaluate(() => window.__ev.filter((e) => e.m === 'ping').at(-1));
  check(mpg?.m === 'ping', `İŞARET düğmesi bağlamsal komut verdi (${mpg?.id})`);
  await mctx.close();
}

// ---------------- Telsiz kutusu, yazılı ve sesli komut (Operasyon Güncellemesi F9) ----------------
if (run('radio')) {
console.log('Telsiz kutusu ve yazılı komut');

  const page = await openPage('standalone');
  await page.evaluate(() => window.__game.startMode('mission', 'normal', 3));
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 60000 });
  await page.evaluate(() => {
    const g = window.__game;
    g.input.lockFailed = true;
    g.cheats.god = true;
    g.cheats.aiOff = true;
    g.player.health.hp = 60;
    window.__ev = [];
    for (const n of ['COMMAND_ISSUED', 'COMMAND_FAILED']) g.events.on(n, (e) => window.__ev.push({ n, id: e.commandId, who: e.addressees, m: e.inputMethod, src: e.sourceText }));
  });
  await waitGame(page, 0.4);
  const log = () => page.evaluate(() => window.__game.chat.lines.map((l) => l.el.textContent));
  // Enter: sohbet satırı açılır, yazı alanı odakta, oyun yavaşlar; "Kaya beni iyileştir" → medike komut + onay
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game.chat.open, null, { timeout: 30000 }).catch(() => {});
  const o1 = await page.evaluate(() => ({ open: window.__game.chat.open, focus: document.activeElement?.id, slow: window.__game.settings.chatSlowMo, form: !document.querySelector('#radioLog .rlForm').hidden }));
  check(o1.open && o1.focus === 'chatInput' && o1.form && o1.slow === 0.3, `Enter telsiz satırını açtı (odak ${o1.focus}, yazarken oyun ×${o1.slow})`);
  await page.keyboard.type('Kaya beni iyileştir');
  await page.screenshot({ path: join(shots, '23-chat-open.png') });
  await page.keyboard.press('Enter');
  // Onay, komutanın sözünden 0,8 sn sonra (önünde hazır bekleyen satır varsa onlardan sonra) gelir
  await waitGame(page, 4);
  const h1 = await page.evaluate(() => ({ ev: window.__ev.find((e) => e.n === 'COMMAND_ISSUED' && e.m === 'text'), open: window.__game.chat.open, lines: window.__game.chat.lines.map((l) => l.el.textContent) }));
  const pi = h1.lines.findIndex((l) => l === '[Komutan → Alfa-2] Kaya beni iyileştir');
  const ci = h1.lines.findIndex((l, i) => i > pi && /^\[Alfa-2 .*Kaya\] (Geliyorum, dayan!|Medik yolda!|Seni toparlıyorum, kıpırdama!)$/.test(l));
  check(h1.ev?.id === 'HEAL_PLAYER' && h1.ev.who.join() === 'Alfa-2' && !h1.open, `"Kaya beni iyileştir" → HEAL_PLAYER, Alfa-2 (${JSON.stringify(h1.ev)})`);
  check(pi >= 0 && ci > pi, `Telsiz kutusunda iki satır: komut ve onay (${pi >= 0 ? h1.lines.slice(pi, ci + 1).join(' | ') : h1.lines.slice(-3).join(' | ')})`);
  // Anlaşılmayan cümle: asker sorar, üç öneri çıkar, satır açık kalır; öneriye tıklayınca komut verilir
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game.chat.open, null, { timeout: 30000 }).catch(() => {});
  await page.keyboard.type('pizza ısmarlayın');
  await page.keyboard.press('Enter');
  await waitGame(page, 1.5);
  const u1 = await page.evaluate(() => ({ open: window.__game.chat.open, sugg: [...document.querySelectorAll('#radioLog .rlSugg button')].map((b) => b.textContent), shown: !document.querySelector('#radioLog .rlSugg').hidden, lines: window.__game.chat.lines.map((l) => l.el.textContent).slice(-4) }));
  check(u1.open && u1.shown && u1.sugg.join(',') === 'Siper alın,Takip edin,Pozisyonu koruyun' && u1.lines.some((l) => /Anlaşılmadı komutanım/.test(l)), `"pizza ısmarlayın": asker sordu, öneriler (${u1.sugg.join(', ')}), satır açık`);
  await page.screenshot({ path: join(shots, '23b-chat-unknown.png') });
  await page.click('#radioLog .rlSugg button');
  const u2 = await page.evaluate(() => ({ open: window.__game.chat.open, ev: window.__ev.filter((e) => e.n === 'COMMAND_ISSUED').at(-1) }));
  check(!u2.open && u2.ev?.id === 'TAKE_COVER' && u2.ev.m === 'text' && u2.ev.who.length === 3, 'Öneriye tıklamak "Siper alın" komutunu tüm time verdi');
  // Birden fazla muhatap ve nişangâh noktası
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game.chat.open, null, { timeout: 30000 }).catch(() => {});
  await page.keyboard.type('Demir ve Yıldız oraya gidin');
  await page.keyboard.press('Enter');
  const mv = await page.evaluate(() => window.__ev.filter((e) => e.n === 'COMMAND_ISSUED').at(-1));
  check(mv?.id === 'MOVE_TO' && [...mv.who].sort().join() === 'Alfa-1,Alfa-3', `"Demir ve Yıldız oraya gidin" → MOVE_TO, ${mv?.who?.join(' + ')}`);
  // Esc yalnız satırı kapatır, oyunu duraklatmaz
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game.chat.open, null, { timeout: 30000 }).catch(() => {});
  await page.keyboard.press('Escape');
  const esc = await page.evaluate(() => ({ open: window.__game.chat.open, state: window.__game.state }));
  check(!esc.open && esc.state === 'playing', 'Esc telsiz satırını kapattı, oyun duraklamadı');
  // Spam kuralları: aynı tür replik 10 sn'de bir; acil replik (el bombası) beklemeye takılmaz, kuyruğun önüne geçer
  const sp = await page.evaluate(() => {
    const g = window.__game;
    const M = g.allies;
    const [a1, a2, a3] = M.list;
    const Q = g.mission.radioQueue;
    Q.length = 0;
    M.kindAt.clear();
    a1.sayT = a2.sayT = a3.sayT = 0;
    M.sayT = 0;
    a1.say('reload');
    a2.sayT = 0;
    M.sayT = 0;
    a2.say('reload');
    const reloads = Q.length;
    g.mission.radio('YUVA', 'Rutin rapor', 0);
    a3.sayT = 5;
    M.sayT = 5;
    a3.say('incoming');
    return { reloads, first: Q[0]?.text, urgent: Q[0]?.urgent, who: Q[0]?.who };
  });
  check(sp.reloads === 1, 'Aynı tür replik 10 sn içinde tekrarlanmadı');
  check(sp.urgent && /bomba/i.test(sp.first || '') && /Alfa-3/.test(sp.who || ''), `Acil replik kuyruğun önünde ("${sp.first}")`);
  // Solma: 8 sn'den eski satırlar kapalıyken gizli; açınca tüm geçmiş görünür
  const fd = await page.evaluate(() => {
    const c = window.__game.chat;
    c.time += 9;
    c.layout();
    const closed = c.lines.filter((l) => !l.el.hidden).length;
    c.openChat();
    const opened = c.lines.filter((l) => !l.el.hidden).length;
    c.closeChat();
    return { closed, opened, n: c.lines.length };
  });
  check(fd.closed === 0 && fd.opened === fd.n && fd.n >= 6, `Eski satırlar soldu (${fd.closed} görünür); açınca ${fd.opened}/${fd.n} satır`);
  // Seslendirme (ayar): askere göre perde; konuşan asker vurgulanır. Ortadaki altyazı yalnız karargâh satırında
  const tts = await page.evaluate(() => {
    const g = window.__game;
    const a1 = g.allies.list[0];
    const said = [];
    if (window.speechSynthesis) window.speechSynthesis.speak = (u) => said.push({ t: u.text, l: u.lang, p: u.pitch });
    g.settings.tts = false;
    g.events.emit('radio', `${a1.radioLabel}: Sessiz satır`, 'squad');
    g.settings.tts = true;
    g.events.emit('radio', `${a1.radioLabel}: Sesli satır`, 'squad');
    g.settings.tts = false;
    const sub0 = document.getElementById('radio').textContent;
    g.hud.radio('Alfa-1: tim satırı', 'squad');
    const sub1 = document.getElementById('radio').textContent;
    g.hud.radio('YUVA: karargâh satırı', 'YUVA');
    const sub2 = document.getElementById('radio').textContent;
    return { said, has: !!window.speechSynthesis, talk: a1.talkUntil > performance.now() - 2000, sub: sub0 === sub1 && /karargâh/.test(sub2) };
  });
  check(!tts.has || (tts.said.length === 1 && tts.said[0].t === 'Sesli satır' && tts.said[0].l === 'tr-TR' && Math.abs(tts.said[0].p - 0.85) < 1e-3), `Seslendirme ayarla açılıp kapanıyor (${JSON.stringify(tts.said)})`);
  check(tts.talk && tts.sub, 'Konuşan asker vurgulandı; tim satırı ortadaki altyazıya çıkmadı, karargâh satırı çıktı');
  // Sesli komut: destek yoksa ayar satırı ve düğme görünmez
  const vc = await page.evaluate(() => {
    const g = window.__game;
    const sup = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    g.menus.fillSettings();
    return { sup, row: !document.getElementById('sVoiceCmd').closest('.set').hidden, body: document.body.classList.contains('voicecmd'), on: g.settings.voiceCommands };
  });
  check(vc.row === vc.sup && vc.body === (vc.sup && vc.on), `Sesli komut desteği ${vc.sup ? 'var' : 'yok'}: ayar satırı ${vc.row ? 'görünür' : 'gizli'}, MİKROFON ${vc.body ? 'açık' : 'kapalı'}`);
  // Sesli komut metni yazılıyla aynı ayrıştırıcıdan geçer (tanıma sonucu taklit edilir)
  const vtext = await page.evaluate(() => {
    const g = window.__game;
    g.chat.submit('herkes siper alsın', 'voice');
    return window.__ev.filter((e) => e.n === 'COMMAND_ISSUED').at(-1);
  });
  check(vtext?.id === 'TAKE_COVER' && vtext.m === 'voice' && /🎤/.test(vtext.src), `Sesli komut: "${vtext?.src}" → ${vtext?.id}`);
  const lastErr = await page.evaluate(() => (window.__game.lastError ? String(window.__game.lastError.stack || window.__game.lastError) : null));
  check(!lastErr, `Döngüde istisna yok${lastErr ? `: ${lastErr}` : ''}`);
  await page.close();

  // Telefon: SOHBET düğmesi satırı üstte açar, yazılan komut verilir; telsiz kutusu panellere ve düğmelere binmez
  const mctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await mctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '', contentType: 'text/css' }));
  await mctx.addInitScript(() => {
    try {
      localStorage.setItem('demirsafak.settings.v1', JSON.stringify({ quality: 'low' }));
      localStorage.setItem('demirsafak.progress.v1', JSON.stringify({ unlocked: 6, best: {} }));
    } catch {
      /* depolama yok */
    }
  });
  const mp = await mctx.newPage();
  mp.on('pageerror', (e) => errors.push(`[radio-mobile] pageerror: ${e.message}`));
  await mp.goto(pathToFileURL(join(root, 'dist/index.html')).href);
  await mp.waitForFunction(() => window.__game && window.__game.state === 'menu' && document.getElementById('loading').hidden, null, { timeout: 60000 });
  await mp.evaluate(() => window.__game.startMode('mission', 'normal', 3));
  await mp.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 60000 });
  await mp.evaluate(() => {
    const g = window.__game;
    g.cheats.god = true;
    window.__ev = [];
    g.events.on('COMMAND_ISSUED', (e) => window.__ev.push({ id: e.commandId, who: e.addressees, m: e.inputMethod }));
    for (let i = 0; i < 3; i++) g.events.emit('radio', `YUVA: Deneme satırı ${i + 1}, telsiz kutusu yerleşimi`, 'system');
  });
  await waitGame(mp, 0.6);
  const ml = await mp.evaluate(() => {
    const r = (el) => el.getBoundingClientRect();
    const hit = (a, b) => a.width && b.width && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
    const box = r(document.querySelector('#radioLog .rlList'));
    const others = ['objective', 'health', 'ammo', 'squad', 'tracker', 'tbSwap', 'tbCrouch', 'tbItem1', 'tbItem2'].map((id) => document.getElementById(id)).filter((el) => el && !el.hidden && getComputedStyle(el).display !== 'none');
    return { over: others.filter((el) => hit(box, r(el))).map((el) => el.id), box: { l: Math.round(box.left), r: Math.round(box.right), t: Math.round(box.top), b: Math.round(box.bottom) }, chat: getComputedStyle(document.getElementById('tbChat')).display !== 'none' };
  });
  check(ml.over.length === 0 && ml.box.b <= 390 && ml.chat, `Telefonda telsiz kutusu boşlukta (${JSON.stringify(ml.box)}${ml.over.length ? ` · çakışan: ${ml.over.join(', ')}` : ''}), SOHBET düğmesi var`);
  await mp.screenshot({ path: join(shots, '23c-mobile-radio.png') });
  await mp.tap('#tbChat');
  await mp.waitForFunction(() => window.__game.chat.open, null, { timeout: 30000 }).catch(() => {});
  const mo = await mp.evaluate(() => ({ open: window.__game.chat.open, focus: document.activeElement?.id, top: document.querySelector('#radioLog .rlForm').getBoundingClientRect().bottom }));
  check(mo.open && mo.focus === 'chatInput' && mo.top < 390 / 2, `SOHBET satırı ekranın üst yarısında açıldı (alt kenar ${Math.round(mo.top)} px), yazı alanı odakta`);
  await mp.keyboard.type('alfa 3 baskı ateşi aç');
  await mp.screenshot({ path: join(shots, '23d-mobile-chat.png') });
  await mp.keyboard.press('Enter');
  const me = await mp.evaluate(() => ({ ev: window.__ev.at(-1), open: window.__game.chat.open }));
  check(me.ev?.id === 'SUPPRESS' && me.ev.who.join() === 'Alfa-3' && me.ev.m === 'text' && !me.open, `Telefonda yazılı komut: "alfa 3 baskı ateşi aç" → ${me.ev?.id} ${me.ev?.who?.join()}`);
  await mctx.close();
}

// ---------------- Denge ve kabul senaryoları (Operasyon Güncellemesi F10, §10 ve §12) ----------------
if (run('balance')) {
console.log('Denge (yere düşme süresi) ve kabul senaryoları');

  const page = await openPage('standalone');
  // Asker zorluğu, Hafif Taktik Yelek; Seviye 4'ün ayar çarpanları ×1 (zorluk tablosunun kendisi ölçülür)
  await page.evaluate(() => window.__game.save.update((d) => {
    if (!d.inventory.armor.includes('armor_light')) d.inventory.armor.push('armor_light');
    d.loadout.armor = 'armor_light';
  }, { now: true }));
  await page.evaluate(() => window.__game.startMode('mission', 'normal', 4));
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 60000 });
  // Ölçüm düzeneği: tim yok, el bombası yok; seçilen tüfekçiler oyuncudan 25 m'de, görüş hattında; çizim kapalı,
  // oyun saati doğrudan adımlanır (yazılımsal GPU'da kare beklemek çok yavaş)
  const bal = await page.evaluate(() => {
    const g = window.__game;
    const P = g.player;
    const V = P.pos.constructor;
    g.input.lockFailed = true;
    g.allies.clear();
    g.difficulty = { ...g.difficulty, grenades: false };
    const eye = () => P.pos.clone().add(new V(0, 1.6, 0));
    const rifle = g.enemies.list.filter((e) => e.alive && e.type === 'rifleman' && !e.mount);
    const spots = [];
    for (let k = 0; k < 32 && spots.length < 2; k++) {
      const a = (k / 32) * Math.PI * 2;
      const p = P.pos.clone().add(new V(Math.sin(a) * 25, 0, Math.cos(a) * 25));
      if (!g.nav.isWalkable(p.x, p.z) || !g.world.lineOfSight(eye(), p.clone().add(new V(0, 1.3, 0)))) continue;
      if (spots.length && spots[0].distanceTo(p) < 6) continue;
      spots.push(p);
    }
    const rf = g.renderFrame;
    g.renderFrame = () => {};
    const place = (n) => {
      const use = rifle.slice(0, n);
      for (const e of g.enemies.list) {
        if (use.includes(e)) continue;
        e.dummy = true;
        e.pos.set(9000, 0, 9000);
      }
      use.forEach((e, i) => {
        e.dummy = false;
        e.pos.copy(spots[i] || spots[0]);
        e.path = null;
        e.visibleT = 0;
      });
      return use;
    };
    // İlk atış ve oturmuş atış isabeti (25 m): düşmanın atışı doğrudan çağrılır, oyuncuya isabet sayılır
    const e0 = place(1)[0];
    g.updatePlaying(0.02);
    e0.pos.copy(spots[0]);
    const tk = P.takeDamage;
    let hits = 0;
    P.takeDamage = () => hits++;
    const N = 200;
    for (let i = 0; i < N; i++) {
      e0.visibleT = 0;
      e0.foe = P;
      e0.shoot(false);
    }
    const first = hits / N;
    hits = 0;
    for (let i = 0; i < N; i++) {
      e0.visibleT = 5;
      e0.foe = P;
      e0.shoot(false);
    }
    const settled = hits / N;
    P.takeDamage = tk;
    const trial = (n, cap) => {
      place(n);
      P.down = false;
      P.bleed = null;
      P.alive = true;
      P.health.hp = P.health.max;
      P.armor.refill();
      P.ttdStart = -1;
      P.lastDamage = -99;
      g.state = 'playing';
      const before = g.stats.ttd.length;
      let t = 0;
      while (t < cap && !P.down && P.alive) {
        g.updatePlaying(0.05);
        t += 0.05;
      }
      return g.stats.ttd.length > before ? g.stats.ttd.at(-1) : null;
    };
    const one = [trial(1, 20), trial(1, 20)];
    const two = [trial(2, 30), trial(2, 30), trial(2, 30)];
    g.renderFrame = rf;
    // Ölçüm bitti: oyuncu ayağa, düşmanlar uzakta
    P.down = false;
    P.bleed = null;
    P.alive = true;
    P.health.hp = P.health.max;
    g.state = 'playing';
    for (const e of g.enemies.list) e.dummy = true;
    return { spots: spots.length, first, settled, one, two, armor: P.armor.body?.def.id, mult: g.difficulty.damageMult, log: P.dmgLog.length };
  });
  check(bal.spots === 2 && bal.armor === 'armor_light' && bal.mult === 0.85, `Ölçüm düzeneği: Asker (hasar ×${bal.mult}), ${bal.armor}, 25 m'de görüş hattı`);
  check(bal.first < bal.settled, `Düşman ilk atışlarda daha çok ıskalar: ilk atış %${Math.round(bal.first * 100)}, oturmuş %${Math.round(bal.settled * 100)} (25 m)`);
  check(bal.one.every((t) => t === null || t >= 4), `Tek düşmana karşı yere düşme ≥ 4 sn (${bal.one.map((t) => (t === null ? '20 sn\'de düşmedi' : `${t} sn`)).join(', ')})`);
  check(bal.two.every((t) => t === null || t >= 2.5), `İki düşmana karşı yere düşme ≥ 2,5 sn (${bal.two.map((t) => (t === null ? '30 sn\'de düşmedi' : `${t} sn`)).join(', ')})`);
  // Hasar paneli (konsol "dmgpanel"): son 10 sn'deki isabetler ve yere düşme süresi
  await page.evaluate(() => {
    const g = window.__game;
    g.console.run('dmgpanel');
    const P = g.player;
    // Son 10 sn'de bir isabet olsun: kasklı ve kasksız kafa vuruşu (§12/3) günlükte yan yana
    // (saniyelik hasar tavanı ikinci vuruşu kırpmasın: pencere ve can her vuruştan önce sıfırlanır)
    const hit = () => {
      P.dmgWindow = [];
      P.health.hp = P.health.max;
      P.takeDamage(30, P.pos.clone().add(new P.pos.constructor(0, 0, -20)), { zone: 'head', pen: 0.3, source: 'rifleman' });
    };
    g.console.run('armor armor_light helmet_kevlar');
    hit();
    g.console.run('armor armor_light none');
    hit();
    window.__hb = P.dmgLog.slice(-2).map((d) => d.dealt);
    // Bir yere düşme örneği: tam candan art arda isabet (süre ölçümü ilk isabetten başlar)
    P.health.hp = P.health.max;
    P.ttdStart = -1;
    for (let i = 0; i < 12 && !P.down; i++) {
      P.dmgWindow = [];
      P.time += 0.4;
      P.takeDamage(30, null, { zone: 'torso', pen: 1, source: 'rifleman' });
    }
    P.revive('test');
  });
  await waitGame(page, 0.4);
  const dp = await page.evaluate(() => {
    const [helm, bare] = window.__hb;
    return { shown: !document.getElementById('dmgPanel')?.hidden, text: document.getElementById('dmgPanel')?.textContent || '', helm, bare };
  });
  check(dp.shown && /HASAR · son 10 sn/.test(dp.text) && /Tüfekçi/.test(dp.text) && /Yere düşme: son/.test(dp.text), 'Hasar paneli: isabetler, kaynak, mesafe ve yere düşme süresi');
  check(dp.helm < dp.bare, `§12/3 Kasklı/kasksız kafa vuruşu hasar günlüğünde (cana ${dp.helm?.toFixed(1)} / ${dp.bare?.toFixed(1)})`);
  await page.screenshot({ path: join(shots, '24-dmgpanel.png') });
  // Görev sonu: yere düşme süreleri kayda yazılır
  const tt = await page.evaluate(() => {
    const g = window.__game;
    g.console.run('dmgpanel');
    g.onMissionComplete();
    g.menus.stopCountdown();
    return { avg: g.save.data.stats.ttdAvg, n: (g.save.data.stats.ttdSamples || []).length };
  });
  check(tt.avg > 0 && tt.n >= 1, `Görev sonunda ortalama yere düşme süresi kayda yazıldı (${tt.avg} sn, ${tt.n} örnek)`);
  await page.close();

  // Kabul senaryoları §12/4–7 ve 11: tim ve yere düşme
  const pg = await openPage('standalone');
  await pg.evaluate(() => window.__game.startMode('mission', 'normal', 3));
  await pg.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 60000 });
  await pg.evaluate(() => {
    const g = window.__game;
    g.input.lockFailed = true;
    g.cheats.aiOff = true;
  });
  await waitGame(pg, 0.3);
  // §12/11 Performans: 3 asker + 10 uyanık düşman + efektlerle oyun mantığı karesi (çizim hariç, yazılımsal GPU'da
  // çizim ölçülemez): ortalama ms
  const perf = await pg.evaluate(() => {
    const g = window.__game;
    g.cheats.aiOff = false;
    g.cheats.god = true;
    const P = g.player;
    const V = P.pos.constructor;
    const live = g.enemies.list.filter((e) => e.alive && !e.mount).slice(0, 10);
    live.forEach((e, i) => {
      const p = g.nav.randomPointNear(P.pos.clone().add(new V(Math.sin(i) * 30, 0, Math.cos(i) * 30)), 6);
      if (p) e.pos.copy(p);
      e.awareness = 1;
    });
    for (let i = 0; i < 6; i++) g.effects.impact(P.pos.clone().add(new V(i, 1, -5)), new V(0, 1, 0), 'dust', 1);
    const rf = g.renderFrame;
    g.renderFrame = () => {};
    for (let i = 0; i < 20; i++) g.updatePlaying(1 / 60);
    const t0 = performance.now();
    const n = 120;
    for (let i = 0; i < n; i++) g.updatePlaying(1 / 60);
    const ms = (performance.now() - t0) / n;
    g.renderFrame = rf;
    g.cheats.god = false;
    g.cheats.aiOff = true;
    // Sonraki senaryolarda tehdit sayılmasınlar
    for (const e of live) {
      e.dummy = true;
      e.pos.set(9000, 0, 9000);
    }
    return { ms, allies: g.allies.list.length, enemies: live.length, awake: live.filter((e) => e.alive).length };
  });
  check(perf.allies === 3 && perf.enemies === 10 && perf.ms < 8, `§12/11 Performans: 3 asker + 10 düşman, oyun mantığı ${perf.ms.toFixed(2)} ms/kare (çizim hariç; 60 FPS bütçesi 16,7 ms)`);
  // §12/4 Açıkta, 3 düşmanın görüş hattında yere düşme: askerler "ulaşamıyorum" der ve bastırır; tehdit
  // azalınca medik gelip kaldırır
  const s4 = await pg.evaluate(() => {
    const g = window.__game;
    const P = g.player;
    const V = P.pos.constructor;
    g.mission.radioQueue.length = 0;
    const head = P.pos.clone().add(new V(0, 1.6, 0));
    const foes = [];
    for (const e of g.enemies.list) {
      if (foes.length >= 3) break;
      if (!e.alive || e.mount) continue;
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2 + foes.length;
        const p = P.pos.clone().add(new V(Math.sin(a) * 14, 0, Math.cos(a) * 14));
        if (!g.nav.isWalkable(p.x, p.z) || !g.world.lineOfSight(p.clone().add(new V(0, 1.6, 0)), head)) continue;
        e.pos.copy(p);
        e.dummy = false;
        foes.push(e);
        break;
      }
    }
    const [a1, med, a3] = g.allies.list;
    med.pos.copy(g.nav.randomPointNear(P.pos.clone().add(new V(0, 0, 15)), 2) || P.pos);
    a1.pos.copy(g.nav.randomPointNear(P.pos.clone().add(new V(15, 0, 0)), 2) || P.pos);
    a3.pos.copy(g.nav.randomPointNear(P.pos.clone().add(new V(-15, 0, 0)), 2) || P.pos);
    P.health.hp = 5;
    P.dmgWindow = [];
    P.protectUntil = 0;
    P.takeDamage(40, null, { zone: 'torso', pen: 1 });
    g.allies.rescueT = 0;
    g.allies.cannotSayT = 0;
    g.allies.update(0.05);
    const decision = g.allies.rescue.decision;
    const suppressing = g.allies.list.filter((a) => a.suppress && a !== g.allies.rescue.reviver).length;
    const said = [...g.chat.lines.map((l) => l.el.textContent), ...g.mission.radioQueue.map((r) => r.text)].join(' | ');
    // Tehdit kalkar: düşmanlar etkisiz
    for (const e of foes) e.takeDamage(9999, { zone: 'torso', source: 'cheat', dir: new V(0, 0, 1) });
    g.allies.rescueT = 0;
    g.allies.update(0.05);
    const reviver = g.allies.rescue.reviver;
    let up = false;
    for (let i = 0; i < 300 && P.down; i++) g.allies.update(0.05);
    up = !P.down;
    return { threats: foes.length, down: true, decision, suppressing, said, reviver: reviver?.callsign, role: reviver?.role, up };
  });
  check(s4.threats === 3 && s4.decision !== 'direct' && s4.suppressing >= 2 && /ulaşamıyorum|temizlememiz|sıcak/.test(s4.said), `§12/4 Üç düşmanın görüşünde: karar "${s4.decision}", ${s4.suppressing} asker bastırıyor, telsiz: "${(s4.said.match(/[^|]*(ulaşamıyorum|temizlememiz|sıcak)[^|]*/) || [''])[0].trim()}"`);
  check(s4.reviver === 'Alfa-2' && s4.up, `Tehdit kalkınca medik (${s4.reviver}) gelip kaldırdı`);
  // §12/5 Canlandırıcıya 30 hasar: işlem kesilir, kan kaybı sayacı sıfırlanmaz, kaldığı yerden sürer
  const s5 = await pg.evaluate(() => {
    const g = window.__game;
    const P = g.player;
    const V = P.pos.constructor;
    P.health.hp = 5;
    P.dmgWindow = [];
    P.protectUntil = 0;
    P.takeDamage(40, null, { zone: 'torso', pen: 1 });
    P.bleed.tick(1.5); // asker gelene kadar sayaç işlemiş olsun
    const med = g.allies.list[1];
    med.pos.copy(P.pos).add(new V(0.9, 0, 0));
    g.allies.rescueT = 0;
    // Medik yanına çömelip canlandırmaya başlasın (yarıda kesilecek)
    for (let i = 0; i < 40 && !(P.reviver === med && med.rescueT > 0.4); i++) g.allies.update(0.05);
    const reviving = P.reviver === med && med.rescueT > 0;
    const left = P.bleed.left;
    med.takeDamage(30, null, { zone: 'leg' });
    const cut = med.rescueT === 0 && P.reviver !== med;
    const kept = Math.abs(P.bleed.left - left) < 1e-9 && left < P.bleed.total;
    // Sayaç işlemeye devam eder (canlandıran yokken)
    P.bleed.tick(0.5, !!P.reviver);
    const resumed = P.bleed.left < left;
    // Yeniden canlandırma bitsin
    for (let i = 0; i < 300 && P.down; i++) g.allies.update(0.05);
    return { reviving, cut, kept, resumed, up: !P.down, left: +left.toFixed(2) };
  });
  check(s5.reviving && s5.cut && s5.kept && s5.resumed && s5.up, `§12/5 Canlandırıcıya 30 hasar: işlem kesildi, sayaç ${s5.left} sn'den sürdü, sonra yine kaldırıldı${s5.reviving && s5.cut && s5.kept && s5.resumed && s5.up ? '' : ` ${JSON.stringify(s5)}`}`);
  // §12/6 Aynı görevde 3. düşüş: sayaç 12 sn
  const s6 = await pg.evaluate(() => {
    const g = window.__game;
    const P = g.player;
    const downs = g.stats.downs;
    P.health.hp = 5;
    P.dmgWindow = [];
    P.protectUntil = 0;
    P.takeDamage(40, null, { zone: 'torso', pen: 1 });
    const total = P.bleed.total;
    P.revive('test');
    return { n: g.stats.downs, total, before: downs };
  });
  check(s6.n === 3 && s6.total === 12, `§12/6 ${s6.n}. düşüşte kan kaybı ${s6.total} sn`);
  // §12/7 Tüm tim yerdeyken oyuncu düşer: sayaç dolunca ölüm ve son kontrol noktasından devam
  const s7 = await pg.evaluate(() => {
    const g = window.__game;
    const P = g.player;
    for (const a of g.allies.list) a.takeDamage(9999, null, { zone: 'torso' });
    const allDown = g.allies.list.every((a) => a.down);
    P.health.hp = 5;
    P.dmgWindow = [];
    P.protectUntil = 0;
    P.takeDamage(40, null, { zone: 'torso', pen: 1 });
    g.allies.rescueT = 0;
    g.allies.update(0.05);
    const nobody = !g.allies.rescue.reviver;
    P.bleed.left = 0.05;
    const fake = { pressed: () => false, isDown: () => false, released: () => false, consumeLook: () => ({ dx: 0, dy: 0 }), move: () => ({ x: 0, y: 0 }), touch: { active: false, sprint: false } };
    for (let i = 0; i < 5 && P.alive; i++) P.update(0.05, fake);
    return { allDown, nobody, dead: !P.alive, state: g.state, cp: g.mission.checkpoint?.idx };
  });
  await pg.waitForFunction(() => window.__game.state === 'dead', null, { timeout: 120000 }).catch(() => {});
  const s7b = await pg.evaluate(() => {
    const g = window.__game;
    const shown = !document.getElementById('deathScreen').hidden;
    g.respawn();
    return { shown, alive: g.player.alive, down: g.player.down, state: g.state, allies: g.allies.list.filter((a) => !a.down).length };
  });
  check(s7.allDown && s7.nobody && s7.dead && s7b.shown && s7b.alive && !s7b.down && s7b.state === 'playing', `§12/7 Tüm tim yerdeyken sayaç doldu: ölüm ekranı, kontrol noktası ${s7.cp}'dan devam (ayakta ${s7b.allies} asker)`);
  const lastErr = await pg.evaluate(() => (window.__game.lastError ? String(window.__game.lastError.stack || window.__game.lastError) : null));
  check(!lastErr, `Döngüde istisna yok${lastErr ? `: ${lastErr}` : ''}`);
  await pg.close();
}

if (run('interact')) {
console.log('Etkileşimler');

  const page = await openPage('standalone');
  await page.click('#btnPlay');
  await page.click('#diffList .diff:nth-child(2)');
  await page.click('#levelList .lvl:nth-child(2)'); // Kızılkum: uçaksavarlar
  await page.click('#btnBriefNext');
  await page.dblclick('#loadoutRoot .loCard[data-id="mar556"]');
  await page.click('#loadoutRoot .loSlot[data-slot="secondary"]');
  await page.dblclick('#loadoutRoot .loCard[data-id="d50"]');
  await page.click('#btnDeploy');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 30000 });
  check((await page.evaluate(() => window.__game.weapons.slots.join(','))) === 'mar556,d50', 'Seçilen teçhizatla başladı (MAR-556 + D-50)');
  const tp = (x, z, yaw) =>
    page.evaluate(([x, z, yaw]) => {
      const g = window.__game;
      g.player.reset(new g.player.pos.constructor(x, 0, z), yaw);
    }, [x, z, yaw]);
  const quiet = () =>
    page.evaluate(() => {
      const g = window.__game;
      g.cheats.god = true;
      g.cheats.aiOff = true;
      g.input.lockFailed = true;
    });
  await quiet();
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
  const swap = await page.evaluate(() => {
    const g = window.__game;
    return { slots: g.weapons.slots.join(','), dropped: g.mission.pickups3.some((p) => p.id === 'mar556' && !p.taken) };
  });
  check(swap.slots === 'shotgun,d50' && swap.dropped, `Pompalı ana silahın yerine geçti, MAR-556 yere düştü (${swap.slots})`);
  // M82'yi evdeki masadan al
  await tp(-16.5, 39.1, Math.PI);
  await waitGame(page, 0.3);
  await page.keyboard.press('KeyF');
  await waitGame(page, 0.3);
  check((await page.evaluate(() => window.__game.weapons.slots[0])) === 'sniper', 'MR-82 masadan alındı');
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
  await page.waitForFunction(() => window.__game.mission.current?.id === 'extract', null, { timeout: 60000 }).catch(() => {});
  check(await page.evaluate(() => window.__game.mission.current?.id === 'extract' && !!window.__game.mission.heli), 'İki top da patlayınca tahliye hedefi başladı, helikopter yolda');
  // İstihbarat: Yıkık Şehir'deki belediye binası
  await page.evaluate(() => window.__game.startMode('mission', 'normal', 4));
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 60000 });
  await quiet();
  await page.evaluate(() => window.__game.debugSkipTo(2));
  check((await page.evaluate(() => window.__game.mission.current.id)) === 'intel', 'Yıkık Şehir: hedef istihbarat');
  const lap = await page.evaluate(() => { const p = window.__game.mission.data.laptop.pos; return [p.x, p.z]; });
  await tp(lap[0], lap[1] + 1.2, 0);
  await waitGame(page, 0.3);
  await hold(3);
  check((await page.evaluate(() => window.__game.mission.current.id)) === 'lz', 'İstihbarat alındı, iniş bölgesi hedefi');
  check((await page.evaluate(() => window.__game.enemies.list.filter((e) => e.group === 'reinf').length)) === 5, 'Takviye birlikler geldi');
  const lastErr = await page.evaluate(() => (window.__game.lastError ? String(window.__game.lastError.stack || window.__game.lastError) : null));
  check(!lastErr, `Döngüde istisna yok${lastErr ? `: ${lastErr}` : ''}`);
  await page.close();
}

// ---------------- Haritalar, ağır makineli mevziler, manga kademeleri ----------------
if (run('maps')) {
console.log('Haritalar, mevziler ve manga kademeleri');

  const page = await openPage('standalone');
  const start = async (id) => {
    await page.evaluate((k) => window.__game.startMode('mission', 'normal', k), id);
    await page.waitForFunction(() => window.__game.state === 'playing' || window.__game.state === 'error', null, { timeout: 90000 });
    await page.evaluate(() => (window.__game.input.lockFailed = true));
  };
  const expect = { 1: ['kizilkum', 0, 'Er'], 2: ['kizilkum', 0, 'Onbaşı'], 3: ['harbor', 2, 'Çavuş'], 4: ['ruins', 3, 'Çavuş'], 5: ['pass', 4, 'Uzman Çavuş'], 6: ['refinery', 5, 'Komando'] };
  for (const id of [1, 2, 3, 4, 5, 6]) {
    await start(id);
    const r = await page.evaluate(() => {
      const g = window.__game;
      const D = g.mission.data;
      const issues = [];
      const walk = (p) => g.nav.isWalkable(p.x, p.z);
      const reach = (a, b, label) => {
        const p = g.nav.findPath(a, b, 400000);
        const end = p && p.length ? p[p.length - 1] : null;
        if (!end || Math.hypot(end.x - b.x, end.z - b.z) > 3) issues.push(label);
      };
      for (const e of g.enemies.list) if (!e.spec.elevated && !e.mount && !walk(e.pos)) issues.push(`düşman ${e.id}`);
      const s = D.playerStart.pos;
      D.checkpoints.forEach((c, i) => reach(s, c.pos, `cp${i}`));
      for (const a of D.aaGuns || []) reach(s, a.pos.clone().add({ x: 0, y: 0, z: 2.2 }), a.id);
      if (D.laptop) reach(s, D.laptop.pos.clone().setY(0).add({ x: 0, y: 0, z: 1.2 }), 'istihbarat');
      reach(s, D.lz, 'iniş');
      for (const [k, x] of Object.entries(D.extract || {})) reach(s, x.pos, `tahliye-${k}`);
      for (const t of g.mission.tanks) {
        // Tank gövdesinin çevresi yürünebilir olmalı (C4 için yanına varılır)
        const side = new g.player.pos.constructor(t.box.maxx + 1.2, 0, t.pos.z);
        if (!walk(side)) reach(s, side, `${t.id}-yanı`);
      }
      return {
        tanks: g.mission.tanks.length,
        state: g.state, map: g.level.map, gunners: g.enemies.list.filter((e) => e.type === 'gunner' && e.mount).length,
        rank: g.allies.list[0]?.S.rank, tag: g.allies.list[0]?.rankName, issues, fog: g.scene.fog.color.getHexString(),
      };
    });
    const [map, hmg, rank] = expect[id];
    check(r.state === 'playing' && r.map === map, `Seviye ${id}: ${map} haritası açıldı`);
    check(r.gunners === hmg, `Seviye ${id}: ${hmg} ağır makineli mevzi (${r.gunners})`);
    check(r.rank === rank, `Seviye ${id}: manga kademesi ${rank} (etiket "${r.tag}")`);
    const tanks = { 4: 1, 5: 2, 6: 2 }[id] || 0;
    check(r.tanks === tanks, `Seviye ${id}: ${tanks} tank (${r.tanks})`);
    check(r.issues.length === 0, `Seviye ${id}: başlangıçtan tüm hedeflere yol var, düşmanlar yürünebilir yerde${r.issues.length ? ` (${r.issues.join(', ')})` : ''}`);
    if (id >= 3) {
      await waitGame(page, 1.0);
      await page.screenshot({ path: join(shots, `14-map-${map}.png`) });
    }
  }
  // Gece haritası daha az görür (algı çarpanı)
  const seeing = await page.evaluate(() => window.__game.difficulty.perception);
  check(seeing < 1, `Gece rafinerisinde düşman algısı kısık (${seeing.toFixed(2)})`);
  // Düşman güncellemesinin maliyeti (en kalabalık harita: 34 düşman, 5 mevzi)
  const cost = await page.evaluate(() => {
    const g = window.__game;
    const t = [];
    for (let i = 0; i < 40; i++) {
      const t0 = performance.now();
      g.enemies.update(1 / 60);
      t.push(performance.now() - t0);
    }
    t.sort((a, b) => a - b);
    return t[20];
  });
  console.log(`    düşman güncellemesi (medyan): ${cost.toFixed(2)} ms`);
  check(cost < 6, `Düşman güncellemesi makul (${cost.toFixed(2)} ms)`);

  // --- Ağır makineli mevzi (Liman, kapıdaki yuva) ---
  await start(3);
  await page.evaluate(() => {
    const g = window.__game;
    g.allies.clear(); // manga bastırmasın: mevziyi yalnız dene
    const n = g.mission.nests[0];
    g.player.reset(n.pos.clone().add({ x: 6, y: 0, z: 18 }), 0);
    const e = n.gunner;
    e.foe = g.player;
    e.lastKnown.copy(g.player.pos);
    e.lastSeen = g.time;
    e.enterCombat();
  });
  await waitGame(page, 3);
  const inArc = await page.evaluate(() => {
    const g = window.__game;
    const n = g.mission.nests[0];
    // Ölçüm alındı: oyuncu burada ölürse sonraki beklemeler oyun süresi geçmeden döner
    g.cheats.god = true;
    return { shots: n.gunner.shotCount, hp: g.player.health.hp, aim: n.aimYaw, warned: n.warned, msg: document.getElementById('message').textContent, alive: g.player.alive };
  });
  check(inArc.alive, 'Oyuncu ölçüm sırasında hayatta');
  check(inArc.shots > 5 && inArc.hp < 100, `Mevzi yay içindeki oyuncuya ateş etti (${inArc.shots} mermi, can ${Math.round(inArc.hp)})`);
  check(Math.abs(inArc.aim - 0.32) < 0.05, `Silah hedefe döndü (${inArc.aim.toFixed(2)} rad)`);
  check(inArc.warned && /MAKİNELİ/.test(inArc.msg), `HUD uyarısı: "${inArc.msg}"`);
  await page.screenshot({ path: join(shots, '15-hmg-fire.png') });
  const shield = await page.evaluate(() => {
    const g = window.__game;
    const n = g.mission.nests[0];
    const e = n.gunner;
    const V3 = g.camera.position.constructor;
    const front = n.pivot(new V3()).add(new V3(-Math.sin(n.worldYaw) * 12, 0.1, -Math.cos(n.worldYaw) * 12));
    const chest = e.chestPos(new V3());
    const a = g.weapons.trace(front, chest.clone().sub(front).normalize(), 100, front);
    // Arkadan (yay dışı): nişancı açıkta
    const back = e.pos.clone().add(new V3(Math.sin(n.worldYaw) * 8, 1.3, Math.cos(n.worldYaw) * 8));
    const b = g.weapons.trace(back, chest.clone().sub(back).normalize(), 100, back);
    return { front: a.enemy ? 'nişancı' : a.surface, back: b.enemy ? 'nişancı' : b.surface };
  });
  check(shield.front === 'metal' && shield.back === 'nişancı', `Kalkan önden gelen mermiyi durdurdu, arkadan vurulur (${shield.front} / ${shield.back})`);
  // Yay dışına geç: ateş kesilir, bir süre sonra nişancı iner ve tüfekle devam eder
  await page.evaluate(() => {
    const g = window.__game;
    g.cheats.god = true;
    const n = g.mission.nests[0];
    g.player.reset(n.pos.clone().add({ x: -14, y: 0, z: -1 }), -Math.PI / 2);
  });
  await waitGame(page, 1.5);
  const s0 = await page.evaluate(() => window.__game.mission.nests[0].gunner.shotCount);
  await waitGame(page, 2.5);
  const s1 = await page.evaluate(() => window.__game.mission.nests[0].gunner.shotCount);
  check(s1 === s0, `Yay dışındaki oyuncuya ateş edemedi (${s0} → ${s1})`);
  await waitGame(page, 6);
  const dis = await page.evaluate(() => { const e = window.__game.mission.nests[0].gunner; return { mount: !!e.mount, w: e.W.sound, cover: e.T.usesCover }; });
  check(!dis.mount && dis.w === 'enemyRifle' && dis.cover, 'Uzun süre yay dışında kalınca nişancı silahı bıraktı (tüfek + siper)');
  // Bastırma: yakından geçen mermiler eğdirir
  const sup = await page.evaluate(() => {
    const g = window.__game;
    const n = g.mission.nests[1];
    const e = n.gunner;
    const V3 = g.camera.position.constructor;
    const mounted = !!e.mount;
    e.foe = g.player;
    e.enterCombat();
    if (!mounted) return -1;
    const o = n.pivot(new V3()).add(new V3(-Math.sin(n.worldYaw) * 20, 0.4, -Math.cos(n.worldYaw) * 20));
    for (let i = 0; i < 6; i++) {
      const d = e.eyePos(new V3()).add(new V3(0.8, 0.2, 0)).sub(o).normalize();
      g.enemies.bulletNearMiss(o, d, 30);
    }
    return e.suppressT;
  });
  await waitGame(page, 0.3);
  const ducked = await page.evaluate(() => window.__game.mission.nests[1].gunner.crouch);
  check(sup > 2 && ducked, `Yakından geçen mermiler nişancıyı bastırdı, kalkanın arkasına eğildi (${sup < 0 ? 'nişancı silahı bırakmıştı' : `${sup.toFixed(1)} s`})`);
  // El bombası mevziyi susturur; kontrol noktasına dönünce (öncesinde susturulmamışsa) yeniden çalışır
  const sil = await page.evaluate(() => {
    const g = window.__game;
    const n = g.mission.nests[1];
    const p = n.pivot(n.pos.clone());
    p.y = 0.3;
    p.x += 1.5;
    g.explode(p, 6, 150, 'player');
    const out = { wrecked: n.wrecked, mount: !!n.gunner.mount };
    g.mission.restoreCheckpoint();
    out.restored = !n.wrecked && (!n.gunner.alive || !!n.gunner.mount);
    return out;
  });
  check(sil.wrecked && !sil.mount, 'El bombası makineliyi susturdu, nişancı silahtan ayrıldı');
  check(sil.restored, 'Kontrol noktasına dönünce mevzi yeniden kuruldu');

  // --- Manga kademeleri: Er'e karşı Komando isabeti (25 m, açıkta duran düşman) ---
  const shotsToKill = async (id, spot) => {
    await start(id);
    return page.evaluate((spot) => {
      const g = window.__game;
      const V3 = g.camera.position.constructor;
      g.cheats.aiOff = true;
      g.cheats.god = true;
      const p = new V3(spot[0], 0, spot[1]);
      g.player.reset(p, 0);
      const a = g.allies.list[0];
      a.reset(p.clone().add(new V3(2, 0, 1)), 0);
      const e = g.enemies.spawn({ id: 'tgt', type: 'rifleman', pos: p.clone().add(new V3(1, 0, -25)), yaw: 0 });
      e.model.root.updateMatrixWorld(true);
      let total = 0;
      for (let t = 0; t < 20; t++) {
        e.reset();
        e.model.root.updateMatrixWorld(true);
        let n = 0;
        while (e.alive && n < 300) {
          a.shoot(e);
          n++;
        }
        total += n;
      }
      return { rank: a.S.rank, mean: total / 20 };
    }, spot);
  };
  const t1 = await shotsToKill(1, [-45, 100]);
  const t5 = await shotsToKill(6, [-50, 92]);
  console.log(`    25 m'de düşürmek için ortalama atış: ${t1.rank} ${t1.mean.toFixed(1)}, ${t5.rank} ${t5.mean.toFixed(1)}`);
  check(t5.mean < t1.mean * 0.6, `Komando mangası Er'den belirgin isabetli (${t5.mean.toFixed(1)} < ${t1.mean.toFixed(1)} atış)`);
  // Çavuş: bastırma ateşi ve ayıltma (Liman)
  await start(3);
  await page.evaluate(() => {
    const g = window.__game;
    const n = g.mission.nests[0];
    const V3 = g.camera.position.constructor;
    g.cheats.god = true;
    g.player.reset(n.pos.clone().add(new V3(-16, 0, 14)), 0);
    g.allies.regroup(g.player.pos, 0);
    const e = n.gunner;
    e.foe = g.player;
    e.enterCombat();
    g.lastPlayerShot = g.time;
  });
  await waitGame(page, 5);
  const supp = await page.evaluate(() => {
    const g = window.__game;
    const e = g.mission.nests[0].gunner;
    return g.allies.list.filter((a) => a.target === e).length;
  });
  check(supp >= 2, `Çavuş mangası makineli nişancısını bastırma ateşine aldı (${supp}/3 dost)`);
  const down = await page.evaluate(() => {
    const g = window.__game;
    const a = g.allies.list[1];
    a.takeDamage(9999, null);
    return a.downT;
  });
  await waitGame(page, 5);
  const rev = await page.evaluate(() => { const a = window.__game.allies.list[1]; return { down: a.down, t: a.downT }; });
  check(!rev.down, `Yaralı dost arkadaşı tarafından ayıltıldı (bekleme ${down} s, 5 s içinde kalktı)`);
  // Komando: mevziyi kanattan vurma
  await start(6);
  const fl = await page.evaluate(() => {
    const g = window.__game;
    const n = g.mission.nests[0];
    g.allies.onHmgFire(n);
    const f = g.allies.flanker;
    return f ? { name: f.name, out: !n.inArc(Math.atan2(-(f.flankGoal.x - n.pos.x), -(f.flankGoal.z - n.pos.z))) } : null;
  });
  check(!!fl && fl.out, `Komando mevziyi yandan vurmak için yayın dışına dolandı (${fl?.name})`);

  // Uçaksavar nişancısı: taret oyuncuya döner, parça tesirli mermiyle ateş eder; nişancı ölünce top susar
  await start(2);
  const aa = await page.evaluate(() => {
    const g = window.__game;
    const V = g.player.pos.constructor;
    g.cheats.god = false;
    g.cheats.aiOff = false; // önceki denemeler yapay zekâyı dondurmuş olabilir
    g.allies.clear();
    for (const e of g.enemies.list) if (!e.mount) e.alive = false;
    const a = g.mission.aa[0];
    const e = a.gunner;
    let at = null;
    for (let k = 0; k < 64 && !at; k++) {
      for (const d of [30, 36, 26]) {
        const p = new V(a.pos.x + Math.sin(k * 0.1) * d, 0, a.pos.z + Math.cos(k * 0.1) * d);
        if (g.nav.isWalkable(p.x, p.z) && g.world.lineOfSight(p.clone().setY(1.5), e.eyePos(new V()))) {
          at = p;
          break;
        }
      }
    }
    if (!at) return { gunner: e?.type, noSpot: true };
    g.player.reset(at, 0);
    e.foe = g.player;
    e.lastKnown.copy(at);
    e.lastSeen = g.time;
    e.enterCombat();
    const s0 = e.shotCount;
    const hp0 = g.player.health.hp;
    let bursts = 0;
    const fb = e.flakBurst.bind(e);
    e.flakBurst = (p) => {
      bursts++;
      fb(p);
    };
    for (let i = 0; i < 450 && g.player.alive; i++) {
      g.time += 1 / 30;
      g.enemies.update(1 / 30);
      g.mission.update(1 / 30);
    }
    const res = { gunner: e.type, fired: e.shotCount - s0, bursts, dmg: Math.round(hp0 - g.player.health.hp), warned: a.warned };
    g.cheats.god = true;
    e.takeDamage(999, { zone: 'head', dir: new V(0, 0, 1), source: 'cheat' });
    g.mission.aa[1].destroyed = true; // öbür topun göğe ateşi sayımı karıştırmasın
    let tr = 0;
    const ot = g.effects.tracer;
    g.effects.tracer = function (...x) {
      tr++;
      return ot.apply(this, x);
    };
    for (let i = 0; i < 240; i++) {
      g.time += 1 / 30;
      g.enemies.update(1 / 30);
      g.mission.update(1 / 30);
    }
    g.effects.tracer = ot;
    res.after = tr;
    return res;
  });
  check(aa.gunner === 'aaGunner' && aa.fired >= 5 && aa.dmg > 0, `Uçaksavar oyuncuya döndü ve ateş etti (${aa.fired} mermi, ${aa.bursts} parça patlaması, hasar ${aa.dmg})`);
  check(aa.warned, 'Uçaksavar ilk atışta HUD uyarısı verdi');
  check(aa.after === 0, `Nişancı ölünce uçaksavar sustu (${aa.after} izli mermi)`);

  // Tank: top ve eş eksenli makineliyle ateş eder; mermi zırhı delmez, el bombası az, roket ve C4 imha eder
  await start(4);
  const tk = await page.evaluate(() => {
    const g = window.__game;
    const V = g.player.pos.constructor;
    g.cheats.god = false;
    g.cheats.aiOff = false;
    g.allies.clear();
    for (const e of g.enemies.list) e.alive = false;
    const t = g.mission.tanks[0];
    let at = null;
    for (let k = 0; k < 64 && !at; k++) {
      const p = new V(t.pos.x - Math.sin(t.yaw + k * 0.1) * 35, 0, t.pos.z - Math.cos(t.yaw + k * 0.1) * 35);
      if (g.nav.isWalkable(p.x, p.z) && g.world.lineOfSight(t.sightPos(new V()), p.clone().setY(1.3))) at = p;
    }
    if (!at) return { noSpot: true };
    g.player.reset(at, 0);
    let shells = 0;
    const off = g.events.on('tankFire', () => shells++);
    let coax = 0;
    const oc = t.fireCoax.bind(t);
    t.fireCoax = () => {
      coax++;
      oc();
    };
    const hp0 = g.player.health.hp;
    for (let i = 0; i < 400 && g.player.alive; i++) {
      g.time += 1 / 30;
      g.mission.update(1 / 30);
      g.grenades.updateRockets(1 / 30);
    }
    off();
    const res = { shells, coax, dmg: Math.round(hp0 - g.player.health.hp), warned: t.warned };
    g.cheats.god = true;
    const from = new V(t.box.maxx + 4, 1.0, t.pos.z);
    const hp1 = t.hp;
    const tr = g.weapons.trace(from, new V(-1, 0, 0), 50, from);
    t.onShot();
    res.bullet = tr.collider?.owner === t ? tr.surface : 'kaçtı';
    res.bulletDmg = hp1 - t.hp;
    g.explode(new V(t.box.maxx + 2, 0.3, t.pos.z), 7.5, 170, 'player');
    res.grenade = Math.round(hp1 - t.hp);
    // Gerçek roket: dünyaya (tank gövdesine) çarpıp patlar
    const hp2 = t.hp;
    g.grenades.spawnRocket(new V(t.box.maxx + 3, 1.1, t.pos.z), new V(-1, 0, 0), { rocketSpeed: 55, damage: 280, splashRadius: 6.5, splashDamage: 230 }, 'player');
    for (let i = 0; i < 40 && g.grenades.rockets.length; i++) g.grenades.updateRockets(1 / 30);
    res.rocket = Math.round(hp2 - t.hp);
    let n = 1;
    while (!t.destroyed && n < 6) {
      g.explode(new V(t.box.maxx + 0.25, 1.2, t.pos.z), 6.5, 230, 'player', 1.25);
      n++;
    }
    res.rockets = n;
    res.destroyed = t.destroyed;
    return res;
  });
  check(!tk.noSpot && tk.shells >= 1 && tk.coax > 5 && tk.dmg > 0, `Tank oyuncuya top ve makineliyle ateş etti (${tk.shells} top, ${tk.coax} makineli, hasar ${tk.dmg})`);
  check(tk.warned, 'Tank görününce uyarı verdi');
  check(tk.bullet === 'metal' && tk.bulletDmg === 0, `Mermi tank zırhında kıvılcım çıkardı, hasar vermedi (${tk.bullet})`);
  check(tk.grenade > 0 && tk.grenade < 100 && tk.rocket > 250, `El bombası az (${tk.grenade}), roket çok (${tk.rocket}) hasar verdi`);
  check(tk.destroyed && tk.rockets === 3, `Tank üç roketle imha edildi (${tk.rockets})`);
  await start(5);
  const c4 = await page.evaluate(() => {
    const g = window.__game;
    const V = g.player.pos.constructor;
    g.cheats.god = true;
    g.cheats.aiOff = true;
    const t = g.mission.tanks[0];
    g.player.reset(new V(t.box.maxx + 0.8, 0, t.pos.z), Math.PI / 2);
    g.mission.update(1 / 30);
    const it = g.mission.findInteractable(g.player.pos.clone().setY(1.6), new V(-1, 0, 0));
    const id = it?.id;
    it?.action();
    for (let i = 0; i < 200; i++) {
      g.time += 1 / 30;
      g.mission.update(1 / 30);
    }
    return { id, destroyed: t.destroyed };
  });
  check(c4.id === 'tank0' && c4.destroyed, `Tanka C4 yerleştirildi ve tank imha edildi (${c4.id})`);

  // Uzaktaki asker: 110 m ötede de her karede yerini ve yönünü günceller (donmaz)
  const far = await page.evaluate(() => {
    const g = window.__game;
    const V = g.player.pos.constructor;
    const e = g.enemies.list.find((x) => x.alive && !x.mount && !x.spec.elevated);
    g.player.reset(e.pos.clone().add(new V(0, 0, 115)), 0);
    let worst = 0;
    for (let i = 0; i < 12; i++) {
      e.pos.x += 0.12;
      g.time += 1 / 30;
      g.enemies.update(1 / 30);
      worst = Math.max(worst, Math.hypot(e.model.root.position.x - e.pos.x, e.model.root.position.z - e.pos.z));
    }
    return { dist: Math.round(e.pos.distanceTo(g.player.pos)), worst, blob: !!e.model.blob?.visible };
  });
  check(far.worst < 0.05 && far.blob, `${far.dist} m ötedeki asker her karede yer değiştirdi (sapma ${far.worst.toFixed(3)} m), ayak gölgesi var`);
  const lastErr = await page.evaluate(() => (window.__game.lastError ? String(window.__game.lastError.stack || window.__game.lastError) : null));
  check(!lastErr, `Döngüde istisna yok${lastErr ? `: ${lastErr}` : ''}`);
  await page.close();
}

// ---------------- Atış poligonu ----------------
if (run('range')) {
console.log('Atış poligonu');

  const page = await openPage('standalone');
  await page.click('#btnRange');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 30000 });
  await page.evaluate(() => (window.__game.input.lockFailed = true));
  await waitGame(page, 0.8);
  const r = await page.evaluate(() => {
    const g = window.__game;
    const d = g.enemies.list[1];
    const o = g.camera.position.clone();
    const target = (d.model.bones?.Head || d.model.head).getWorldPosition(new o.constructor());
    target.y += 0.12;
    g.player.yaw = Math.atan2(-(target.x - o.x), -(target.z - o.z));
    const flat = Math.hypot(target.x - o.x, target.z - o.z);
    g.player.pitch = Math.atan2(target.y - o.y, flat);
    return { dummies: g.enemies.list.length, owned: Object.keys(g.weapons.owned) };
  });
  check(r.dummies === 10, `Mankenler yerleşti (${r.dummies})`);
  check(r.owned.length === 13, `Poligonda on üç silah (${r.owned.join(', ')})`);
  await page.waitForFunction(() => ['mar556', 'lmg', 'sniper', 'd50'].every((id) => window.__game.viewmodel.models[id].glb), null, { timeout: 30000 }).catch(() => {});
  check(await page.evaluate(() => ['mar556', 'lmg', 'sniper', 'd50'].every((id) => window.__game.viewmodel.models[id].glb)), 'Blender modelleri (MAR-556, MG-43, MR-82, D-50) yüklendi');
  // Sketchfab silahları: model, parçalar (şarjör, nişangah gövdesi) ve ayrı JPEG dokular
  await page.waitForFunction(() => ['k8', 'kr4', 'mk4', 'kt9'].every((id) => window.__game.viewmodel.models[id].glb), null, { timeout: 60000 }).catch(() => {});
  const sk = await page.evaluate(() => {
    const V = window.__game.viewmodel.models;
    const textured = (id) => {
      let n = 0;
      V[id].root.traverse((o) => {
        if (o.isMesh && o.material.map && o.material.map.image && !o.material.transparent) n++; // namlu alevi (saydam) hariç
      });
      return n;
    };
    return {
      glb: ['k8', 'kr4', 'mk4', 'kt9'].every((id) => V[id].glb),
      parts: { k8: Object.keys(V.k8.parts).sort().join('+'), mk4: Object.keys(V.mk4.parts).join('+'), kt9: Object.keys(V.kt9.parts).join('+') },
      tex: { mk4: textured('mk4'), kt9: textured('kt9') },
    };
  });
  check(sk.glb && sk.parts.k8 === 'charging+mag' && sk.parts.mk4 === 'optic' && sk.parts.kt9 === 'mag', `Sketchfab silahları yüklendi, parçalar ayrı (${JSON.stringify(sk.parts)})`);
  check(sk.tex.mk4 > 0 && sk.tex.kt9 > 0, `Sketchfab silah dokuları ayrı dosyadan bağlandı (${JSON.stringify(sk.tex)})`);
  // Bıçak (Sketchfab): V ile yakın dövüşte sol elde dokulu bıçak savrulur
  await page.waitForFunction(() => !!window.__game.viewmodel.knife, null, { timeout: 30000 }).catch(() => {});
  await page.keyboard.press('KeyV');
  const knifeSeen = await page
    .waitForFunction(() => window.__game.weapons.state === 'melee' && window.__game.viewmodel.knife?.visible, null, { timeout: 20000, polling: 16 })
    .then(() => true, () => false);
  const kn = await page.evaluate(() => {
    let tex = 0;
    window.__game.viewmodel.knife?.traverse((o) => {
      if (o.isMesh && o.material.map?.image && o.material.normalMap?.image) tex++;
    });
    return { loaded: !!window.__game.viewmodel.knife, tex };
  });
  check(kn.loaded && knifeSeen && kn.tex > 0, `Bıçak modeli yakın dövüşte sol elde görünüyor (dokulu parça: ${kn.tex})`);
  await page.screenshot({ path: join(shots, '08c-knife.png') });
  await page.waitForFunction(() => window.__game.weapons.state !== 'melee', null, { timeout: 20000 }).catch(() => {});
  check(await page.evaluate(() => !window.__game.viewmodel.knife?.visible), 'Bıçak vuruştan sonra gizlendi');
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
  // Her silahı seç ve bir kez ateş et
  const fired = [];
  for (let i = 1; i <= 9; i++) {
    await page.keyboard.press(`Digit${i}`);
    // Ağır silahlarda bırakma + kuşanma 1,2 sn'yi bulur
    await page.waitForFunction((k) => {
      const W = window.__game.weapons;
      return W.currentId === W.slots[k - 1] && W.state === 'idle';
    }, i, { timeout: 120000, polling: 50 });
    await waitGame(page, 0.3);
    const before = await page.evaluate(() => window.__game.stats.shots);
    await page.mouse.down();
    await waitGame(page, 0.05);
    await page.mouse.up();
    await waitGame(page, 0.1);
    const id = await page.evaluate(() => window.__game.weapons.currentId);
    if ((await page.evaluate(() => window.__game.stats.shots)) > before) fired.push(id);
  }
  // 10.–13. silah (Sketchfab): 1-9 tuşlarının ötesinde, doğrudan geçiş
  for (const id of ['k8', 'kr4', 'mk4', 'kt9']) {
    await page.evaluate((w) => window.__game.weapons.switchTo(w), id);
    await page.waitForFunction((w) => window.__game.weapons.currentId === w && window.__game.weapons.state === 'idle', id, { timeout: 120000, polling: 50 });
    await waitGame(page, 0.3);
    const before = await page.evaluate(() => window.__game.stats.shots);
    await page.mouse.down();
    await waitGame(page, 0.05);
    await page.mouse.up();
    await waitGame(page, 0.1);
    if ((await page.evaluate(() => window.__game.stats.shots)) > before) fired.push(id);
  }
  check(fired.length === 13, `On üç silahın hepsi ateş etti (${fired.join(', ')})`);
  // Dürbün kaplaması
  await page.keyboard.press('Digit6');
  await waitGame(page, 1.0);
  await page.mouse.down({ button: 'right' });
  await waitGame(page, 0.6);
  check(await page.isVisible('#scope'), 'MR-82 dürbün kaplaması görünüyor');
  await page.screenshot({ path: join(shots, '08b-scope.png') });
  await page.mouse.up({ button: 'right' });
  // Roket: 25 m'deki mankene
  // Sabit süre yerine durum bekle: MR-82'den geçiş 1,1 sn sürer, kuşanma bitmeden şarjör değişmez
  await page.keyboard.press('Digit9');
  await page.waitForFunction(() => {
    const W = window.__game.weapons;
    return W.currentId === 'rpg' && W.state === 'idle';
  }, null, { timeout: 120000, polling: 50 });
  if ((await page.evaluate(() => window.__game.weapons.current.mag)) === 0) {
    await page.keyboard.press('KeyR');
    await page.waitForFunction(() => {
      const W = window.__game.weapons;
      return W.current.mag === 1 && W.state === 'idle';
    }, null, { timeout: 180000, polling: 50 });
  }
  await page.mouse.move(480, 270);
  await waitGame(page, 0.2);
  const rk = await page.evaluate(() => {
    const g = window.__game;
    const d = g.enemies.list[3];
    const o = g.camera.position;
    g.player.yaw = Math.atan2(-(d.pos.x - o.x), -(d.pos.z - o.z));
    g.player.pitch = Math.atan2(d.pos.y + 1.0 - o.y, Math.hypot(d.pos.x - o.x, d.pos.z - o.z));
    return g.enemies.list.indexOf(d);
  });
  await waitGame(page, 0.1);
  const ex0 = await page.evaluate(() => window.__game.stats.explosions);
  await page.mouse.down();
  await waitGame(page, 0.05);
  await page.mouse.up();
  // Patlamayı bekle (roket ~0,6 sn uçar; en fazla 4 sn oyun zamanı)
  const t0 = await page.evaluate(() => window.__game.time);
  await page.waitForFunction(([ex0, t0]) => window.__game.stats.explosions > ex0 || window.__game.time > t0 + 4, [ex0, t0], { timeout: 180000, polling: 50 });
  const rres = await page.evaluate(([k, ex0]) => {
    const g = window.__game;
    return { exploded: g.stats.explosions > ex0, mag: g.weapons.current.mag, target: !g.enemies.list[k].alive, anyDown: g.enemies.list.some((e) => !e.alive) };
  }, [rk, ex0]);
  check(rres.exploded && rres.anyDown, `Roket patladı ve manken düştü (patlama: ${rres.exploded}, şarjör: ${rres.mag}, hedef: ${rres.target ? 'vuruldu' : 'yoldaki mankene çarptı'})`);
  await page.screenshot({ path: join(shots, '09b-rocket.png') });
  await page.keyboard.press('Digit4');
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

// ---------------- Zırh (armor.js, Modül A) ----------------
if (run('armor')) {
console.log('Zırh');

  const page = await openPage('standalone');
  // Konsoldan kuşan (mağaza F3'te): Hafif Taktik Yelek + Kevlar Kask
  await page.evaluate(() => window.__game.console.run('armor armor_light helmet_kevlar'));
  await page.evaluate(() => window.__game.startMode('range', 'normal'));
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 60000 });
  await page.evaluate(() => (window.__game.input.lockFailed = true));
  await waitGame(page, 0.3);
  const a0 = await page.evaluate(() => ({ shown: !document.getElementById('armorRow').hidden, val: document.getElementById('arVal').textContent, helm: !document.getElementById('helmIcon').hidden }));
  check(a0.shown && a0.val === '50' && a0.helm, `HUD'da zırh çubuğu ve kask simgesi (ZP ${a0.val})`);
  await page.screenshot({ path: join(shots, '16-armor-hud.png') });
  // §12/2: Hafif Taktik Yelek'li oyuncuya AKM (36, delme 0,35) ile tek gövde vuruşu → can 72,19, zırh 41,81
  const s2 = await page.evaluate(() => {
    const g = window.__game;
    const P = g.player;
    const log = [];
    const off = g.events.on('DAMAGE_TAKEN', (e) => log.push(e));
    P.takeDamage(36, null, { zone: 'torso', pen: 0.35 });
    const r = { hp: P.health.hp, armor: P.armor.body.points, val: document.getElementById('arVal').textContent };
    // §12/3: aynı silahla kasklı ve kasksız kafa vuruşu farkı hasar günlüğünde
    P.health.hp = 100;
    P.dmgWindow = [];
    P.takeDamage(20, null, { zone: 'head', pen: 0.35 });
    const withHelmet = log.at(-1).healthDamage;
    P.armor.helmet = null;
    P.health.hp = 100;
    P.dmgWindow = [];
    P.takeDamage(20, null, { zone: 'head', pen: 0.35 });
    const noHelmet = log.at(-1).healthDamage;
    off();
    return { ...r, withHelmet, noHelmet };
  });
  check(Math.abs(s2.hp - 72.19) < 1e-6 && Math.abs(s2.armor - 41.81) < 1e-6 && s2.val === '42', `Belge §12/2: tek gövde vuruşu → can ${s2.hp.toFixed(2)}, zırh ${s2.armor.toFixed(2)}`);
  check(s2.withHelmet < s2.noHelmet, `Kask kafa vuruşunu azalttı (kasklı ${s2.withHelmet.toFixed(1)}, kasksız ${s2.noHelmet.toFixed(1)})`);
  // Zırh kırılınca uyarı ve kırık görünüm
  const br = await page.evaluate(() => {
    const P = window.__game.player;
    P.health.hp = 100000;
    for (let i = 0; i < 12 && P.armor.body.points > 0; i++) {
      P.dmgWindow = [];
      P.takeDamage(30, null, { zone: 'torso', pen: 0 });
    }
    return { pts: P.armor.body.points, msg: document.getElementById('message').textContent, broken: document.getElementById('armorRow').classList.contains('broken') };
  });
  check(br.pts <= 0 && br.msg === 'ZIRH KIRILDI' && br.broken, `Zırh kırıldı: "${br.msg}"`);
  // Ağır Saldırı Zırhı: hız cezası ve koşu kapalı
  const sp = await page.evaluate(() => {
    const g = window.__game;
    g.player.health.hp = 100;
    g.console.run('armor armor_assault none');
    return { mult: g.player.armor.speedMult, noSprint: g.player.armor.noSprint };
  });
  await page.keyboard.down('KeyW');
  await page.keyboard.down('ShiftLeft');
  await waitGame(page, 0.4);
  const sprintHeavy = await page.evaluate(() => window.__game.player.sprinting);
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.up('KeyW');
  check(Math.abs(sp.mult - 0.78) < 1e-9 && sp.noSprint && !sprintHeavy, `Ağır Saldırı Zırhı: hız ×${sp.mult.toFixed(2)}, koşamıyor`);
  // Düşman zırhı: ağır asker her zaman zırhlı; tüfek mermisini emer, mavi isabet işareti
  const en = await page.evaluate(() => {
    const g = window.__game;
    g.console.run('armor none none');
    g.cheats.aiOff = true;
    g.console.run('spawn 1 heavy');
    const e = g.enemies.list.find((x) => x.type === 'heavy' && x.alive);
    const before = e.armor?.body?.points;
    const out = e.takeDamage(30, { zone: 'torso', dir: new e.pos.constructor(0, 0, 1), source: 'player', weapon: 'rifle' });
    g.events.emit('hitmarker', 'armor');
    return { armored: !!e.armor?.body && !!e.armor?.helmet, before, after: e.armor?.body?.points, hit: out.armorHit, blue: document.getElementById('hitmarker').classList.contains('armor'), hp: e.health.hp };
  });
  check(en.armored && en.hit && en.after < en.before && en.hp > 70, `Ağır düşman zırhlı: zırh ${en.before} → ${en.after?.toFixed(1)}, can ${en.hp.toFixed(1)}`);
  check(en.blue, 'Zırhlı hedefe isabet işareti mavi');
  await page.close();
}

// ---------------- Teçhizat ve sarf malzemeleri (Operasyon Güncellemesi F4) ----------------
if (run('loadout')) {
console.log('Teçhizat ve sarf malzemeleri');

  const page = await openPage('standalone');
  // Envanter: 2 ilk yardım, 3 plaka, 1 sis, Hafif Taktik Yelek
  await page.evaluate(() => {
    const g = window.__game;
    g.save.update((d) => {
      Object.assign(d.inventory.consumables, { medkit: 2, plate_pack: 3, smoke: 1 });
      d.inventory.armor.push('armor_light');
      d.loadout.armor = 'armor_light';
    }, { now: true });
  });
  await page.click('#btnPlay');
  await page.click('#diffList .diff:nth-child(2)');
  await page.click('#levelList .lvl:nth-child(1)');
  await page.click('#btnBriefNext');
  await page.click('#loadoutRoot .loSlot[data-slot="slot0"]');
  const cons = await page.evaluate(() => [...document.querySelectorAll('#loadoutRoot .loCard')].map((c) => `${c.dataset.id}:${c.className.includes('shop') ? 'shop' : 'ok'}`));
  check(cons.includes('medkit:ok') && cons.includes('adrenaline:shop') && cons[0] === 'none:ok', `Sarf yuvası: envanterdekiler seçilebilir, olmayanlar mağazada (${cons.join(' ')})`);
  await page.dblclick('#loadoutRoot .loCard[data-id="medkit"]');
  await page.click('#loadoutRoot .loSlot[data-slot="slot1"]');
  await page.dblclick('#loadoutRoot .loCard[data-id="plate_pack"]');
  check((await page.evaluate(() => window.__game.save.data.loadout.slots.join(','))) === 'medkit,plate_pack', 'Sarf yuvaları kayda yazıldı (medkit, plate_pack)');
  check(/İlk Yardım Kiti ×2/.test(await page.textContent('#loadoutRoot .loSlot[data-slot="slot0"] b')), 'Yuva satırında taşınan adet (×2)');
  await page.screenshot({ path: join(shots, '18-loadout-kit.png') });
  // Gerçek ad ayarı kapalı → kurgusal adlar (kart, ayrıntı); açınca geri gelir
  const fict = await page.evaluate(() => {
    const g = window.__game;
    g.settings.realNames = false;
    g.applySettings();
    g.menus.loadoutScreen.slot = { id: 'primary', label: 'Ana silah', kind: 'weapon' };
    g.menus.loadoutScreen.render();
    const names = [...document.querySelectorAll('#loadoutRoot .loCard b')].map((b) => b.textContent);
    g.settings.realNames = true;
    g.applySettings();
    g.menus.loadoutScreen.render();
    return { names, back: document.querySelector('#loadoutRoot .loCard[data-id="sniper"] b').textContent };
  });
  check(fict.names.includes('AR-7 Vanguard') && fict.names.includes('MR-82 Marret') && fict.back === 'Barrett M82A1', `realNames kapalıyken kurgusal adlar (${fict.names.slice(0, 3).join(', ')}), açınca gerçek`);
  await page.click('#btnDeploy');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 60000 });
  await page.evaluate(() => (window.__game.input.lockFailed = true));
  const hud = await page.evaluate(() => ({ shown: !document.getElementById('kit').hidden, slots: [...document.querySelectorAll('#kit .kslot:not([hidden]) b')].map((b) => b.textContent), keys: [...document.querySelectorAll('#kit .kslot kbd')].map((k) => k.textContent) }));
  check(hud.shown && hud.slots.join(',') === '×2,×3' && hud.keys.join(',') === '3,4', `HUD'da sarf yuvaları (${hud.keys.join('/')} → ${hud.slots.join(' ')})`);
  // Süreli kullanım: oyun saati yazılımsal GPU'da yavaş, süre doğrudan ilerletilir
  const use = await page.evaluate(() => {
    const g = window.__game;
    const P = g.player;
    const idle = { pressed: () => false, isDown: () => false };
    const fire = { pressed: (a) => a === 'fire', isDown: () => false };
    P.health.hp = 40;
    g.kit.use(0);
    const started = !!g.kit.using && P.usingItem;
    g.kit.update(1, fire, true); // ateş → iptal, harcanmaz
    const cancelled = !g.kit.using && P.health.hp === 40 && g.save.data.inventory.consumables.medkit === 2;
    g.kit.use(0);
    g.kit.update(3.05, idle, true);
    const healed = P.health.hp;
    P.armor.body.points = 10;
    g.kit.use(1);
    g.kit.update(2.05, idle, true);
    const full = { pts: P.armor.body.points, msg: document.getElementById('message').textContent };
    P.health.hp = P.health.max;
    g.kit.use(0); // can dolu → başlamaz
    return { started, cancelled, healed, full, notStarted: !g.kit.using, inv: { ...g.save.data.inventory.consumables }, hud: [...document.querySelectorAll('#kit .kslot b')].map((b) => b.textContent).join(',') };
  });
  check(use.started && use.cancelled, 'İlk yardım başladı (silah indi); ateş edince iptal oldu, harcanmadı');
  check(use.healed === 90 && use.inv.medkit === 1, `İlk Yardım Kiti 3 sn'de +50 can (40 → ${use.healed}), envanterde ${use.inv.medkit} kaldı`);
  check(use.full.pts === 50 && use.inv.plate_pack === 2, `Zırh Plakası +50 ZP, azamide durdu (10 → ${use.full.pts}), envanterde ${use.inv.plate_pack}`);
  check(use.notStarted && use.hud === '×1,×2', `Can doluyken kit kullanılmaz; HUD adetleri güncel (${use.hud})`);
  // Tuşla kullanım (3)
  await page.evaluate(() => (window.__game.player.health.hp = 50));
  await page.keyboard.press('Digit3');
  await waitGame(page, 0.05);
  check(await page.evaluate(() => !!window.__game.kit.using), '3 tuşu sarf yuvası 1’i kullandı');
  // Sis bombası: görüşü keser, mermi/patlama yolunu kesmez
  const smoke = await page.evaluate(() => {
    const g = window.__game;
    const V = g.player.pos.constructor;
    const at = g.player.pos.clone().add(new V(0, 0, -8));
    g.grenades.spawn(at.clone().setY(0.2), new V(0, 0, 0), 0.01, 'player', 'smoke');
    g.grenades.update(0.05);
    const opened = g.world.smokes.length;
    g.grenades.update(2.5);
    const a = at.clone().add(new V(0, 1.5, 7));
    const b = at.clone().add(new V(0, 1.5, -7));
    const r = { opened, density: g.world.smokes[0]?.density, see: g.world.canSee(a, b), los: g.world.lineOfSight(a, b) };
    for (let i = 0; i < 20; i++) g.grenades.update(1);
    r.gone = g.world.smokes.length === 0 && g.world.canSee(a, b) === r.los;
    return r;
  });
  check(smoke.opened === 1 && smoke.density === 1 && !smoke.see && smoke.los, `Sis bulutu görüşü kesti (yoğunluk ${smoke.density}), duvar hattı açık`);
  check(smoke.gone, '15 sn sonra sis dağıldı, görüş geri geldi');
  await page.screenshot({ path: join(shots, '18b-kit-hud.png') });
  await page.close();

  // Telefon (yatay): teçhizat ekranı sığıyor, görevde sarf düğmesi dokununca çalışıyor
  const mctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await mctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '', contentType: 'text/css' }));
  await mctx.addInitScript(() => {
    try {
      localStorage.setItem('demirsafak.settings.v1', JSON.stringify({ quality: 'low' }));
      localStorage.setItem('demirsafak.progress.v1', JSON.stringify({ unlocked: 6, best: {} }));
    } catch {
      /* depolama yok */
    }
  });
  const mp = await mctx.newPage();
  mp.on('pageerror', (e) => errors.push(`[loadout-mobile] pageerror: ${e.message}`));
  await mp.goto(pathToFileURL(join(root, 'dist/index.html')).href);
  await mp.waitForFunction(() => window.__game && window.__game.state === 'menu' && document.getElementById('loading').hidden, null, { timeout: 60000 });
  await mp.evaluate(() => {
    const g = window.__game;
    g.save.update((d) => {
      d.inventory.consumables.medkit = 2;
      d.loadout.slots = ['medkit', null];
    }, { now: true });
  });
  await mp.tap('#btnPlay');
  await mp.tap('#diffList .diff:nth-child(2)');
  await mp.tap('#levelList .lvl:nth-child(1)');
  await mp.tap('#btnBriefNext');
  await mp.waitForFunction(() => document.querySelectorAll('#loadoutRoot .loImg.ready').length >= 6, null, { timeout: 60000 }).catch(() => {});
  await sleep(400);
  await mp.screenshot({ path: join(shots, '18c-loadout-mobile.png') });
  const fit = await mp.evaluate(() => {
    const b = document.getElementById('btnDeploy').getBoundingClientRect();
    const d = document.querySelector('#loadoutRoot .loDetail').getBoundingClientRect();
    // Ayrıntı paneli kartların yanında (aşağı kaymadan görünür), en az bir kart sırası tam görünür
    return { over: document.scrollingElement.scrollWidth - innerWidth, deploy: b.bottom <= innerHeight + 1 && b.right <= innerWidth + 1, detail: d.width > 180 && d.right <= innerWidth + 1 && d.top < innerHeight / 2 };
  });
  check(fit.over <= 1 && fit.detail, `Telefonda teçhizat ekranı yatayda sığıyor (taşma ${fit.over} px, ayrıntı paneli görünür)`);
  await mp.tap('#btnDeploy');
  await mp.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 60000 });
  const tb = await mp.evaluate(() => ({ one: !document.getElementById('tbItem1').hidden, two: !document.getElementById('tbItem2').hidden, n: document.querySelector('#tbItem1 b')?.textContent }));
  check(tb.one && !tb.two && tb.n === '2', `Dokunmatikte dolu yuvanın düğmesi var, boşun yok (adet ${tb.n})`);
  await mp.evaluate(() => (window.__game.player.health.hp = 40));
  await mp.tap('#tbItem1');
  await mp.waitForFunction(() => !!window.__game.kit.using, null, { timeout: 15000 }).catch(() => {});
  check(await mp.evaluate(() => !!window.__game.kit.using), 'Sarf düğmesine dokununca ilk yardım başladı');
  await mp.screenshot({ path: join(shots, '18d-kit-touch.png') });
  await mctx.close();
}

// ---------------- Artifact sürümü ----------------
if (run('artifact')) {
console.log('Artifact sürümü (dist/artifact.html)');

  const page = await openPage('artifact');
  await sleep(800);
  check((await state(page)) === 'menu', 'CDN three.js ile menü açıldı');
  check(await page.evaluate(() => document.getElementById('loading').hidden), 'Yükleme ekranı kapandı');
  // Menü arka planı görev haritasıdır: hazır helikopter yan dosyadan indiyse sahnenin altında bekler
  const hp = await page.evaluate(() => ({ prop: !!window.__game.mission.heliSpare?.prop, credit: document.querySelector('#propCredits p')?.textContent || '' }));
  check(hp.prop && /CC-BY-4\.0/.test(hp.credit), `Helikopter modeli yan dosyadan yüklendi, atfı emeği geçenlerde ("${hp.credit.slice(0, 48)}…")`);
  await page.evaluate(() => window.__game.startMode('range', 'normal'));
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 60000 });
  check(await page.evaluate(() => window.__game.enemies.list.length > 0 && window.__game.enemies.list.every((e) => !!e.model.bones)), 'Asker modeli yan dosyadan yüklendi (iskeletli)');
  await page.waitForFunction(() => window.__game.viewmodel.models.kt9?.glb, null, { timeout: 60000 }).catch(() => {});
  const wt = await page.evaluate(() => {
    let n = 0;
    window.__game.viewmodel.models.kt9?.root.traverse((o) => {
      if (o.isMesh && o.material.map?.image && !o.material.transparent) n++;
    });
    return n;
  });
  check(wt > 0, `Sketchfab silahı ve dokuları yan dosyalardan yüklendi (KT-9, ${wt} dokulu parça)`);
  check(await page.evaluate(async () => window.__game.pwa === null && (await navigator.serviceWorker.getRegistrations()).length === 0), 'Artifact sürümü hizmet çalışanı kaydetmiyor (PWA yalnız dist/pwa)');
  await page.close();
}
if (run('artifact')) {
  // jsDelivr yanıt vermezse unpkg'den açılmalı
  const page = await openPage('artifact', 'low', { cdnFail: ['jsdelivr'] });
  check((await state(page)) === 'menu', 'jsDelivr kapalıyken unpkg yedeğiyle açıldı');
  await page.close();
}
if (run('artifact')) {
  // İki CDN de yoksa yükleme ekranı nedenini yazmalı (sonsuza dek asılı kalmamalı)
  const before = errors.length;
  const page = await openPage('artifact', 'low', { cdnFail: ['jsdelivr', 'unpkg'], noWait: true });
  await page.waitForSelector('#ldErr:not([hidden])', { timeout: 30000 });
  const msg = await page.textContent('#ldErrTitle');
  check(/indirilemedi/.test(msg), `Grafik kütüphanesi inmezse hata ekranı çıktı ("${msg}")`);
  check(await page.isVisible('#ldRetry'), 'Hata ekranında "Tekrar dene" düğmesi var');
  await page.screenshot({ path: join(shots, '10-load-error.png') });
  errors.length = before; // bu sayfadaki beklenen hatalar sayılmaz
  await page.close();
}

// Dokunmatik düzen (telefon)
if (run('mobile')) {
console.log('Telefon görünümü');

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
  // Dünya ölçekli hedefe, eller ve silah tuvale tam cihaz çözünürlüğünde çizilir
  const pr = await page.evaluate(() => ({ canvas: window.__game.renderer.getPixelRatio(), world: window.__game.worldPR, rt: !!window.__game.worldRT, q: window.__game.renderQuality }));
  check(pr.canvas === 2 && pr.world < pr.canvas && pr.rt, `Telefonda eller/silah tam çözünürlükte (${pr.canvas}×), dünya ölçekli (${pr.world.toFixed(2)}×, ${pr.q})`);
  await page.screenshot({ path: join(shots, '12-mobile-play.png') });
  // NİŞAN dokunmatikte aç/kapa: bir dokunuşla nişanda kalır (parmak kalksa da), ikincisiyle çıkar
  const adsState = () => page.evaluate(() => ({ on: window.__game.player.adsToggle, t: window.__game.player.adsT, lit: document.getElementById('tbAds').classList.contains('latched') }));
  await page.tap('#tbAds');
  await waitGame(page, 0.6);
  const a1 = await adsState();
  check(a1.on && a1.lit && a1.t > 0.9, `NİŞAN'a bir dokunuş: parmak kalktı, nişanda kalıyor (adsT ${a1.t.toFixed(2)}, düğme yanık)`);
  await page.screenshot({ path: join(shots, '12b-mobile-ads.png') });
  await page.tap('#tbAds');
  await waitGame(page, 0.6);
  const a2 = await adsState();
  check(!a2.on && !a2.lit && a2.t < 0.1, `İkinci dokunuş nişandan çıkardı (adsT ${a2.t.toFixed(2)}, düğme söndü)`);
  await ctx.close();
}

// ---------------- PWA sürümü (dist/pwa, GitHub Pages) ----------------
if (run('pwa')) {
console.log('PWA sürümü (dist/pwa)');

  // GitHub Pages gibi: gh-pages dalının kökü (dist/pwa) depo adının alt yolunda sunulur (…/call-of-duty/).
  // sw.js'e eklenen bayt (swExtra) tarayıcıya yeni sürüm gibi görünür (güncelleme akışı denemesi)
  const site = join(root, 'dist/pwa');
  const BASE = '/call-of-duty/';
  const swFile = join(site, 'sw.js');
  let swExtra = '';
  const PMIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', ...MIME };
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.startsWith(BASE) ? join(site, path.slice(BASE.length)) : '';
    if (file && path.endsWith('/')) file = join(file, 'index.html');
    if (!file || !file.startsWith(site) || !existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404);
      return res.end('yok');
    }
    let body = readFileSync(file);
    if (file === swFile && swExtra) body = Buffer.concat([body, Buffer.from(swExtra)]);
    res.writeHead(200, { 'content-type': PMIME[extname(file)] || 'application/octet-stream', 'cache-control': 'max-age=600' });
    res.end(body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const swList = JSON.parse(readFileSync(swFile, 'utf8').match(/const FILES = (\[.*?\]);/)[1]);

  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('demirsafak.settings.v1', JSON.stringify({ quality: 'low' }));
    } catch {
      /* depolama yok */
    }
  });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '', contentType: 'text/css' }));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[pwa] pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[pwa] console: ${m.text()}`);
  });
  const menuReady = () => page.waitForFunction(() => window.__game && window.__game.state === 'menu' && document.getElementById('loading').hidden, null, { timeout: 90000 });

  // gh-pages kökü: Jekyll kapalı, oyun doğrudan sitenin kökünde açılır
  check(existsSync(join(site, '.nojekyll')) && !swList.includes('.nojekyll'), 'dist/pwa/.nojekyll var (Pages dosyaları olduğu gibi sunar), önbellek listesinde değil');
  await page.goto(`${origin}${BASE}`);
  await menuReady();

  const man = await page.evaluate(async () => {
    const href = document.querySelector('link[rel="manifest"]').href;
    const m = await (await fetch(href)).json();
    const sizes = [];
    for (const i of m.icons) {
      const img = new Image();
      img.src = new URL(i.src, href).href;
      await img.decode().catch(() => {});
      sizes.push({ want: i.sizes, got: `${img.naturalWidth}x${img.naturalHeight}`, purpose: i.purpose });
    }
    return { name: m.name, display: m.display, orientation: m.orientation, start: new URL(m.start_url, href).pathname, lang: m.lang, sizes };
  });
  check(man.name === 'Demir Şafak' && man.display === 'fullscreen' && man.orientation === 'landscape' && man.lang === 'tr', `Manifest: ${man.name}, ${man.display}, ${man.orientation}`);
  check(man.start === BASE, `Başlangıç adresi sitenin kökü (${man.start})`);
  check(man.sizes.length >= 3 && man.sizes.every((s) => s.want === s.got) && man.sizes.some((s) => s.purpose === 'maskable'), `Simgeler doğru boyutta (${man.sizes.map((s) => `${s.got} ${s.purpose}`).join(', ')})`);

  // Hizmet çalışanı: açılış bitince kaydolur, tüm oyun dosyalarını önbelleğe alır ve sayfayı devralır
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 90000 });
  const sw = await page.evaluate(async () => {
    const keys = (await caches.keys()).filter((k) => k.startsWith('demirsafak-') && !k.endsWith('-fonts'));
    const n = keys.length ? (await (await caches.open(keys[0])).keys()).length : 0;
    const glb = performance.getEntriesByType('resource').filter((e) => /assets\/.*\.glb$/.test(e.name)).length;
    return { keys, n, glb, status: document.getElementById('pwaStatusText').textContent, state: window.__game.pwa?.state };
  });
  check(sw.keys.length === 1 && sw.n === swList.length, `Hizmet çalışanı ${sw.n}/${swList.length} dosyayı önbelleğe aldı (${sw.keys[0] || 'önbellek yok'})`);
  check(sw.glb >= 8, `Modeller gömülü değil, dosyadan indi (${sw.glb} GLB isteği)`);
  check(sw.state === 'ready' && /Çevrimdışı/.test(sw.status), `Menüde durum satırı: "${sw.status}"`);
  const cdp = await ctx.newCDPSession(page);
  const inst = await cdp.send('Page.getInstallabilityErrors').catch((e) => ({ installabilityErrors: [{ errorId: e.message }] }));
  check(inst.installabilityErrors.length === 0, `Tarayıcıya göre yüklenebilir${inst.installabilityErrors.length ? ` (${inst.installabilityErrors.map((e) => e.errorId).join(', ')})` : ''}`);

  // Yükleme düğmesi: tarayıcının yükleme istemi gelince görünür, basınca istemi açar
  check(!(await page.isVisible('#btnInstall')), 'Yükleme istemi yokken "Uygulama olarak yükle" gizli');
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt', { cancelable: true });
    window.__prompted = 0;
    e.prompt = () => {
      window.__prompted++;
      return Promise.resolve();
    };
    e.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(e);
  });
  check(await page.isVisible('#btnInstall'), 'Yükleme istemi gelince "Uygulama olarak yükle" göründü');
  await sleep(400);
  await page.screenshot({ path: join(shots, '13-pwa-menu.png') });
  await page.tap('#btnInstall');
  await page.waitForFunction(() => window.__prompted === 1, null, { timeout: 5000 }).catch(() => {});
  await sleep(200);
  check((await page.evaluate(() => window.__prompted)) === 1 && !(await page.isVisible('#btnInstall')), 'Düğme yükleme istemini açtı, kabulden sonra gizlendi');

  // Çevrimdışı: ağ kesikken sayfa önbellekten açılır, modeller ve dokular yine yüklenir
  await ctx.setOffline(true);
  // Yükleme isteminden hemen sonra yeniden yükleme ara sıra "ERR_ABORTED" ile kesiliyor (sayfa o anda başka bir
  // gezinmede); yükleme yine tamamlanır, beklenir
  await page.reload().catch(async (e) => {
    if (!/ERR_ABORTED|detached/.test(e.message)) throw e;
    await page.waitForLoadState('load');
  });
  await menuReady();
  const off = await page.evaluate(() => ({ status: document.getElementById('pwaStatusText').textContent, heli: !!window.__game.mission.heliSpare?.prop }));
  check(/Çevrimdışısın/.test(off.status) && off.heli, `Çevrimdışı açıldı: menü, helikopter modeli, "${off.status}"`);
  await page.evaluate(() => window.__game.startMode('range', 'normal'));
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 90000 });
  await page.waitForFunction(() => window.__game.viewmodel.models.kt9?.glb, null, { timeout: 60000 }).catch(() => {});
  const offW = await page.evaluate(() => {
    let n = 0;
    window.__game.viewmodel.models.kt9?.root.traverse((o) => {
      if (o.isMesh && o.material.map?.image) n++;
    });
    return { n, soldiers: window.__game.enemies.list.length > 0 && window.__game.enemies.list.every((e) => !!e.model.bones) };
  });
  check(offW.n > 0 && offW.soldiers, `Çevrimdışı poligon: asker modeli ve Sketchfab silah dokuları önbellekten (${offW.n} dokulu parça)`);
  await page.evaluate(() => window.__game.toMenu());
  await menuReady();

  // Güncelleme: sunucuda yeni sw.js → "Yeni sürüm hazır · Güncelle" → basınca sayfa yeni sürümle açılır
  await ctx.setOffline(false);
  swExtra = `\n// deneme ${Date.now()}\n`;
  await page.evaluate(() => window.__game.pwa.registration.update());
  await page.waitForSelector('#btnPwaUpdate:not([hidden])', { timeout: 90000 }).catch(() => {});
  const upd = await page.evaluate(() => ({ state: window.__game.pwa.state, text: document.getElementById('pwaStatusText').textContent }));
  check(upd.state === 'update', `Yeni sürüm bildirildi ("${upd.text}")`);
  await page.evaluate(() => (window.__oldPage = true));
  const nav = page.waitForEvent('framenavigated', { timeout: 60000 }).catch(() => null);
  await page.click('#btnPwaUpdate').catch(() => {});
  await nav;
  await menuReady();
  const after = await page.evaluate(async () => ({ old: !!window.__oldPage, waiting: !!(await navigator.serviceWorker.getRegistration())?.waiting, state: window.__game.pwa.state }));
  check(!after.old && !after.waiting && after.state === 'ready', `"Güncelle" sayfayı yeni sürümle yeniden açtı (${after.state})`);

  await ctx.close();
  server.close();
}

await browser.close();
const real = errors.filter((e) => !/favicon|ERR_FILE_NOT_FOUND|net::/.test(e));
check(real.length === 0, `Konsolda hata yok${real.length ? `:\n    ${real.slice(0, 10).join('\n    ')}` : ''}`);
console.log(failed ? `\n${failed} kontrol başarısız.` : '\nTüm kontroller geçti.');
process.exit(failed ? 1 : 0);
