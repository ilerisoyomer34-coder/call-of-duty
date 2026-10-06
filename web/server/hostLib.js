// Ev sunucusu başlatıcısının (server/host.mjs) saf yardımcıları: tünel adresini yakalama, davet bağlantısı,
// bilgisayara özel ayar dosyası, sürüm ve güncelleme kararları, platforma göre cloudflared dosyası.
// Süreç başlatmaz, ağa çıkmaz (yalnız ensureHostEnv dosyaya yazar): tests/host.test.mjs doğrudan dener.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

// Oyunun yayımlandığı adres (GitHub Pages); davet bağlantısı buna ?sunucu= ekler
export const GAME_URL = 'https://ilerisoyomer34-coder.github.io/call-of-duty/';
export const INVITE_PARAM = 'sunucu';
// node:sqlite bayraksız 22.5'te geldi (sunucunun veritabanı)
export const MIN_NODE = [22, 5];
export const DEFAULT_PORT = 8790;
export const DEFAULT_SERVER_NAME = "Ömer'in sunucusu";

export function nodeVersionOk(version) {
  const [major, minor] = String(version).replace(/^v/, '').split('.').map(Number);
  return major > MIN_NODE[0] || (major === MIN_NODE[0] && minor >= MIN_NODE[1]);
}

// cloudflared hızlı tünelin adresi çıktıdaki bir satırda geçer. api.trycloudflare.com tünel isteğinin kendi
// adresidir (hata satırlarında görünür), oyuncu adresi değildir
const TUNNEL_RE = /https:\/\/([a-z0-9-]+)\.trycloudflare\.com/gi;
export function parseTunnelUrl(line) {
  for (const m of String(line).matchAll(TUNNEL_RE)) {
    if (m[1].toLowerCase() !== 'api') return `https://${m[1].toLowerCase()}.trycloudflare.com`;
  }
  return null;
}

// Paylaşılan bağlantı: oyunu açar, ?sunucu= ile sunucuyu kaydeder. Adres yalnız [a-z0-9-.:/] içerdiği için
// kodlanmadan yazılır (WhatsApp'ta okunaklı kalsın); oyun her iki biçimi de okur
export function inviteLink(serverUrl, game = GAME_URL) {
  return `${game}?${INVITE_PARAM}=${serverUrl}`;
}

export function parseEnv(text) {
  const out = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i <= 0) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

// Bu bilgisayara özel ayarlar (git'e girmez). İlk açılışta rastgele SERVER_SECRET ile oluşturulur; varsa dokunulmaz
export function ensureHostEnv(path, { random = () => randomBytes(32).toString('hex') } = {}) {
  if (existsSync(path)) return { created: false, env: parseEnv(readFileSync(path, 'utf8')) };
  const env = { SERVER_NAME: DEFAULT_SERVER_NAME, PORT: String(DEFAULT_PORT), SERVER_SECRET: random() };
  const text = [
    '# Demir Şafak ev sunucusu: bu bilgisayara özel ayarlar. Git\'e girmez; kimseyle paylaşma.',
    '# SERVER_NAME oyunda görünen sunucu adıdır, değiştirebilirsin. SERVER_SECRET\'e dokunma.',
    `SERVER_NAME=${env.SERVER_NAME}`,
    `PORT=${env.PORT}`,
    `SERVER_SECRET=${env.SERVER_SECRET}`,
    '',
  ].join('\n');
  writeFileSync(path, text, { mode: 0o600 });
  return { created: true, env };
}

// Kendiliğinden güncelleme yalnız dal gerideyse, maç yoksa ve elle değişiklik yapılmamışsa
export function shouldUpdate({ behind, rooms, dirty }) {
  return behind > 0 && rooms === 0 && !dirty;
}

// Cloudflare'in resmî sürüm dosyası (github.com/cloudflare/cloudflared/releases). Windows ARM için ayrı dosya yok:
// amd64 öykünmeyle çalışır. macOS dosyası sıkıştırılmış (tgz), içinden 'cloudflared' çıkar
export function cloudflaredAsset(platform, arch) {
  if (platform === 'win32') return { asset: arch === 'ia32' ? 'cloudflared-windows-386.exe' : 'cloudflared-windows-amd64.exe', file: 'cloudflared.exe', tgz: false };
  if (platform === 'darwin') return { asset: arch === 'arm64' ? 'cloudflared-darwin-arm64.tgz' : 'cloudflared-darwin-amd64.tgz', file: 'cloudflared', tgz: true };
  if (platform === 'linux') {
    const a = { arm64: 'arm64', arm: 'arm', ia32: '386' }[arch] || 'amd64';
    return { asset: `cloudflared-linux-${a}`, file: 'cloudflared', tgz: false };
  }
  return null;
}

export const cloudflaredUrl = (asset) => `https://github.com/cloudflare/cloudflared/releases/latest/download/${asset}`;

// Pencere açıkken bilgisayar uyumasın. Windows: SetThreadExecutionState (ES_CONTINUOUS | ES_SYSTEM_REQUIRED),
// betik tırnak sorunu yaşamasın diye -EncodedCommand (UTF-16LE base64) ile verilir
export function keepAwakeCommand(platform, pid) {
  if (platform === 'darwin') return { cmd: 'caffeinate', args: ['-is', '-w', String(pid)] };
  if (platform === 'win32') {
    const ps = [
      "$sig = '[DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint f);'",
      '$k = Add-Type -MemberDefinition $sig -Name Awake -Namespace DemirSafak -PassThru',
      `while (Get-Process -Id ${pid} -ErrorAction SilentlyContinue) { [void]$k::SetThreadExecutionState(0x80000001); Start-Sleep -Seconds 30 }`,
    ].join('; ');
    return { cmd: 'powershell', args: ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')] };
  }
  return null;
}

export function openCommand(platform, url) {
  if (platform === 'win32') return { cmd: 'rundll32', args: ['url.dll,FileProtocolHandler', url] };
  if (platform === 'darwin') return { cmd: 'open', args: [url] };
  return { cmd: 'xdg-open', args: [url] };
}

export function clipboardCommand(platform) {
  if (platform === 'win32') return { cmd: 'clip', args: [] };
  if (platform === 'darwin') return { cmd: 'pbcopy', args: [] };
  return { cmd: 'xclip', args: ['-selection', 'clipboard'] };
}
