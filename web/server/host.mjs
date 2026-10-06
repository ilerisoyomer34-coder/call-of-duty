// Ev sunucusu bekçisi: bu bilgisayarı Demir Şafak'ın çevrim içi sunucusu yapar.
//  - Oyun sunucusunu (server/index.js) yalnız bu bilgisayara açık (127.0.0.1) başlatır, çökerse yeniden açar
//  - Cloudflare hızlı tüneliyle (hesapsız, ücretsiz) https adresi alır: oyun Pages'te https ile açıldığı için
//    tarayıcı yalnız güvenli sunucuya bağlanır; ev IP'si görünmez, modem ayarı gerekmez
//  - Davet bağlantısını ekrana yazar, panoya kopyalar, oyunu bu bağlantıyla açar
//  - 10 dakikada bir depoyu denetler; yeni sürüm varsa ve maç yoksa günceller (oyunla sunucu aynı sürümde kalsın)
//  - Pencere açıkken bilgisayarın uyumasını engeller
// Çalıştır: depo kökündeki Sunucuyu-Baslat (.bat / .command) ya da  cd web && node server/host.mjs
// Bayraklar: --no-tunnel (yalnız bu bilgisayar/yerel ağ), --no-browser, --no-update
import { spawn, execFile } from 'node:child_process';
import { existsSync, mkdirSync, chmodSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { nodeVersionOk, MIN_NODE, ensureHostEnv, parseTunnelUrl, inviteLink, shouldUpdate, cloudflaredAsset, cloudflaredUrl, keepAwakeCommand, openCommand, clipboardCommand, DEFAULT_PORT } from './hostLib.js';

const here = dirname(fileURLToPath(import.meta.url));
const webDir = join(here, '..');
const repoDir = join(webDir, '..');
const flags = new Set(process.argv.slice(2));
const NO_TUNNEL = flags.has('--no-tunnel');
const NO_BROWSER = flags.has('--no-browser') || NO_TUNNEL;
const NO_UPDATE = flags.has('--no-update');
// Güncelleme denetimi aralığı (HOST_UPDATE_SEC yalnız denemek için)
const UPDATE_EVERY_MS = (Number(process.env.HOST_UPDATE_SEC) || 10 * 60) * 1000;
const PUBLIC_CHECK_SEC = 60; // yeni tünel adresinin DNS'e yayılması birkaç saniye sürer
const run = promisify(execFile);

const B = (s) => `\x1b[1m${s}\x1b[0m`;
const say = (...a) => console.log('[sunucu]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let stopping = false;
const children = new Set();
function track(child) {
  children.add(child);
  child.on('exit', () => children.delete(child));
  return child;
}

function quit(code = 0) {
  if (stopping) return;
  stopping = true;
  say('Kapatılıyor… (sunucu ve tünel duruyor, davet bağlantısı geçersiz olur)');
  for (const c of children) c.kill();
  setTimeout(() => process.exit(code), 1500).unref();
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => quit(0));

async function health(base, timeoutMs = 4000) {
  try {
    const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

// --- Oyun sunucusu (alt süreç) ---
let server = null;
let serverStartedAt = 0;
let restartDelay = 1;
function startServer(env) {
  serverStartedAt = Date.now();
  server = track(spawn(process.execPath, ['--disable-warning=ExperimentalWarning', join(here, 'index.js')], { cwd: webDir, env, stdio: 'inherit' }));
  server.on('exit', (code) => {
    server = null;
    if (stopping) return;
    // Uzun süre çalıştıysa bekleme sıfırlanır; art arda çöküyorsa 30 sn'ye dek artar
    if (Date.now() - serverStartedAt > 60_000) restartDelay = 1;
    say(`Oyun sunucusu kapandı (çıkış ${code ?? '?'}); ${restartDelay} sn sonra yeniden açılıyor.`);
    setTimeout(() => !stopping && startServer(env), restartDelay * 1000);
    restartDelay = Math.min(30, restartDelay * 2);
  });
}

// --- cloudflared (Cloudflare'in resmî sürümünden, ilk açılışta bir kez indirilir) ---
async function ensureCloudflared() {
  // Kendi kurduğun cloudflared'i kullanmak için: CLOUDFLARED=/yol/cloudflared
  if (process.env.CLOUDFLARED) return process.env.CLOUDFLARED;
  const a = cloudflaredAsset(process.platform, process.arch);
  if (!a) throw new Error(`Bu işletim sistemi desteklenmiyor (${process.platform}).`);
  const binDir = join(here, 'bin');
  const bin = join(binDir, a.file);
  if (existsSync(bin)) return bin;
  mkdirSync(binDir, { recursive: true });
  say(`Tünel programı (cloudflared) indiriliyor: ${a.asset} …`);
  const res = await fetch(cloudflaredUrl(a.asset));
  if (!res.ok) throw new Error(`cloudflared indirilemedi (HTTP ${res.status}).`);
  const data = Buffer.from(await res.arrayBuffer());
  const tmp = join(binDir, `${a.asset}.part`);
  writeFileSync(tmp, data);
  if (a.tgz) {
    await run('tar', ['-xzf', tmp, '-C', binDir]);
    rmSync(tmp, { force: true });
  } else renameSync(tmp, bin);
  chmodSync(bin, 0o755);
  say(`İndirildi (${(data.length / 1048576).toFixed(1)} MB).`);
  return bin;
}

// --- Tünel: çıktıdan adresi yakala, dışarıdan eriş, daveti paylaş; düşerse yeniden aç (yeni adres) ---
let publicUrl = '';
let tunnelRetry = 0;
function startTunnel(bin, port) {
  const t = track(spawn(bin, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`], { cwd: webDir, stdio: ['ignore', 'pipe', 'pipe'] }));
  let found = false;
  let lastLine = '';
  const onData = (buf) => {
    for (const line of String(buf).split(/\r?\n/)) {
      if (!line.trim()) continue;
      const url = !found && parseTunnelUrl(line);
      if (url) {
        found = true;
        tunnelRetry = 0;
        publicUrl = url;
        announce(url);
      }
      // Bilgi satırları (INF) gizlenir; uyarı, hata ve öneksiz satırlar (ör. "provisioning failed") gösterilir
      if (!/\sINF\s/.test(line)) {
        lastLine = line.replace(/^\S+Z\s+/, '');
        process.stderr.write(`[tünel] ${lastLine}\n`);
      }
    }
  };
  t.stdout.on('data', onData);
  t.stderr.on('data', onData);
  t.on('error', (e) => (lastLine = e.message));
  t.on('exit', (code) => {
    if (stopping) return;
    const wasUp = found;
    publicUrl = '';
    const sec = wasUp ? 5 : Math.min(60, 5 * 2 ** tunnelRetry++);
    if (wasUp) say(`Tünel kapandı; ${sec} sn sonra yeniden açılıyor. ${B('Adres değişecek: yeni bağlantıyı yeniden paylaş.')}`);
    else say(`Tünel açılamadı (çıkış ${code ?? '?'}${lastLine ? `: ${lastLine}` : ''}); ${sec} sn sonra yeniden denenecek. İnternet bağlantını denetle.`);
    setTimeout(() => !stopping && startTunnel(bin, port), sec * 1000);
  });
}

async function announce(url) {
  say(`Tünel adresi alındı: ${url}`);
  let ok = null;
  for (let i = 0; i < PUBLIC_CHECK_SEC / 3 && !ok && !stopping; i++) {
    ok = await health(url, 3000);
    if (!ok) await sleep(3000);
  }
  if (stopping || publicUrl !== url) return;
  const link = inviteLink(url);
  const line = '═'.repeat(Math.min(100, link.length + 4));
  console.log(`\n${line}\n  ${B('SUNUCU AÇIK')}${ok ? ` · ${ok.name} · dışarıdan erişim: tamam` : ' · dışarıdan erişim henüz doğrulanamadı (birkaç sn sonra çalışır)'}\n`);
  console.log(`  Arkadaşlarına bu bağlantıyı gönder (WhatsApp vb.):\n\n  ${B(link)}\n`);
  const copied = copy(link);
  console.log(`  ${copied ? 'Bağlantı panoya kopyalandı. ' : ''}Oyunda: Çevrim içi → Sunucu bağlantısı alanına da yapıştırılabilir.`);
  console.log(`  Bu pencere açık kaldıkça sunucu çalışır. Kapatınca bağlantı geçersiz olur.\n${line}\n`);
  if (!NO_BROWSER) openUrl(link);
}

// Windows (clip) ve macOS (pbcopy) her kurulumda var; Linux'ta xclip olmayabilir → kopyalandı denmez
function copy(text) {
  const c = clipboardCommand(process.platform);
  try {
    const p = spawn(c.cmd, c.args, { stdio: ['pipe', 'ignore', 'ignore'] });
    p.on('error', () => {});
    p.stdin.on('error', () => {});
    p.stdin.end(text);
  } catch {
    return false;
  }
  return process.platform === 'win32' || process.platform === 'darwin';
}

function openUrl(url) {
  const c = openCommand(process.platform, url);
  try {
    const p = spawn(c.cmd, c.args, { stdio: 'ignore', detached: true });
    p.on('error', () => {});
    p.unref();
  } catch {
    /* tarayıcı açılamadı: bağlantı ekranda */
  }
}

function keepAwake() {
  const c = keepAwakeCommand(process.platform, process.pid);
  if (!c) return;
  try {
    const p = track(spawn(c.cmd, c.args, { stdio: 'ignore' }));
    p.on('error', () => {});
  } catch {
    /* uyku engeli yok: güç ayarlarından "uyku: asla" seçilebilir */
  }
}

// --- Kendiliğinden güncelleme: Pages'teki oyunla sunucu aynı sürümde kalsın (derleme özeti denetimi) ---
async function git(...args) {
  const { stdout } = await run('git', ['-C', repoDir, ...args], { timeout: 120_000 });
  return stdout.trim();
}

async function checkUpdate(localBase) {
  try {
    await git('fetch', '--quiet');
    const behind = Number(await git('rev-list', '--count', 'HEAD..@{u}'));
    if (!behind) return;
    const dirty = (await git('status', '--porcelain', '--untracked-files=no')) !== '';
    const h = await health(localBase);
    const rooms = h ? h.rooms : 0;
    if (!shouldUpdate({ behind, rooms, dirty })) {
      if (dirty) say('Yeni sürüm var ama depoda elle değişiklik var; güncelleme atlandı.');
      else say(`Yeni sürüm var; ${rooms} maç bitince güncellenecek.`);
      return;
    }
    const before = await git('rev-parse', 'HEAD');
    say(`Yeni sürüm bulundu (${behind} değişiklik); güncelleniyor…`);
    await git('pull', '--ff-only', '--quiet');
    const changed = await git('diff', '--name-only', before, 'HEAD');
    if (/(^|\n)web\/package(-lock)?\.json/.test(changed)) {
      say('Paketler güncelleniyor…');
      await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: webDir, timeout: 300_000, shell: process.platform === 'win32' });
    }
    say('Güncellendi; oyun sunucusu yeniden başlıyor (tünel adresi aynı kalır).');
    restartDelay = 1;
    server?.kill();
  } catch (e) {
    say(`Güncelleme denetlenemedi (${String(e.message || e).split('\n')[0]}); sonra yeniden denenecek.`);
  }
}

async function main() {
  console.log(B('\nDemir Şafak · ev sunucusu\n'));
  if (!nodeVersionOk(process.versions.node)) {
    say(`Node.js ${process.versions.node} eski: en az ${MIN_NODE.join('.')} gerekli. https://nodejs.org adresinden LTS sürümünü kur.`);
    process.exit(1);
  }
  const { created, env: hostEnv } = ensureHostEnv(join(here, 'host.env'));
  if (created) say('İlk açılış: bu bilgisayara özel ayar dosyası oluşturuldu (server/host.env, kimseyle paylaşma).');
  const port = Number(hostEnv.PORT) || DEFAULT_PORT;
  const env = {
    ...process.env,
    SERVER_NAME: hostEnv.SERVER_NAME || '',
    SERVER_SECRET: hostEnv.SERVER_SECRET || '',
    PORT: String(port),
    // Yalnız bu bilgisayardan erişilir; dışarıya tünel açar. Tünelde gerçek oyuncu IP'si Cloudflare'in başlığında
    HOST: NO_TUNNEL ? '0.0.0.0' : '127.0.0.1',
    TRUST_PROXY: NO_TUNNEL ? '' : '1',
    CLIENT_IP_HEADER: NO_TUNNEL ? '' : 'cf-connecting-ip',
  };
  const localBase = `http://127.0.0.1:${port}`;
  if (await health(localBase, 1500)) {
    say(`${port} portunda zaten bir sunucu çalışıyor. Önce açık olan sunucu penceresini kapat.`);
    process.exit(1);
  }
  startServer(env);
  let h = null;
  for (let i = 0; i < 30 && !h; i++) {
    await sleep(500);
    h = await health(localBase, 1000);
  }
  if (!h) say('Oyun sunucusu yanıt vermiyor; yukarıdaki hata satırlarına bak.');
  else say(`Oyun sunucusu çalışıyor: ${h.name} (port ${port}).`);
  keepAwake();
  if (NO_TUNNEL) {
    say(`Tünel kapalı (--no-tunnel). Aynı bilgisayardan: ${localBase} · yerel ağdan: http://<bu bilgisayarın IP'si>:${port}`);
  } else {
    try {
      startTunnel(await ensureCloudflared(), port);
    } catch (e) {
      say(`Tünel açılamadı: ${e.message}`);
      say('İnternet bağlantını denetle ve başlatıcıyı yeniden çalıştır.');
    }
  }
  if (!NO_UPDATE) {
    try {
      await git('rev-parse', '--abbrev-ref', '@{u}');
      setInterval(() => !stopping && checkUpdate(localBase), UPDATE_EVERY_MS).unref();
    } catch {
      say('Depo git ile klonlanmamış ya da dal izlenmiyor: kendiliğinden güncelleme kapalı.');
    }
  }
  say('Durdurmak için bu pencereyi kapat ya da Ctrl+C.');
}

main().catch((e) => {
  say(`Beklenmeyen hata: ${e.stack || e}`);
  quit(1);
});
