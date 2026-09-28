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
// Bölümler: visual, mission, levels, interact, maps, range, artifact, mobile, pwa
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
  check(await page.isVisible('#loadoutScreen'), 'Teçhizat ekranı açıldı');
  check((await page.$$('#primaryList .gun')).length === 10 && (await page.$$('#secondaryList .gun')).length === 3, 'Teçhizatta 10 ana + 3 yan silah');
  const badges = await page.evaluate(() => [...document.querySelectorAll('#primaryList .gun .badge')].map((b) => b.textContent));
  check(badges.filter((b) => b === 'Sketchfab').length === 4, `Sketchfab silahları teçhizatta rozetli (${badges.join(', ')})`);
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
  check(await page.evaluate(() => [...document.querySelectorAll('.atag')].some((e) => !e.hidden && /KARTAL|Kartal/.test(e.textContent))), 'Dostların üstünde mavi isim etiketi');
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

// ---------------- Etkileşimler: pompalı, C4, istihbarat, ikmal ----------------
if (run('interact')) {
console.log('Etkileşimler');

  const page = await openPage('standalone');
  await page.click('#btnPlay');
  await page.click('#diffList .diff:nth-child(2)');
  await page.click('#levelList .lvl:nth-child(2)'); // Kızılkum: uçaksavarlar
  await page.click('#primaryList .gun[data-id="mar556"]');
  await page.click('#secondaryList .gun[data-id="d50"]');
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
  await page.reload();
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
