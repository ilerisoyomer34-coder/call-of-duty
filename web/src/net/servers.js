// Sunucu bağlantısı (ev sunucusu, Cloudflare hızlı tüneli): oyuncunun yapıştırdığı metinden sunucu adresi ve
// sunucu başına oyun hesabı. Tünel adresi sunucu her açıldığında değişir, sunucunun veritabanı aynı kalır: hesap
// adrese değil sunucunun kalıcı kimliğine (/api/health → serverId) bağlanır. Saf: tests/servers.test.mjs.
// Kimlik kanıtı (Docs/SECURITY_TR.md §2): sunucu rastgele meydan okumayı kendi anahtarıyla imzalar; anahtar hesaba
// sabitlenir. Belirteç yalnız kanıtlanmış ve sabitlenmiş anahtarla tutan sunucuya gider (tests/security.test.mjs)
import { proofMessage } from '../../shared/net/serverProof.js';

// Davet bağlantısının parametresi (server/hostLib.js → INVITE_PARAM); ?server= geliştirme ve test içindir
export const INVITE_PARAM = 'sunucu';

export const SERVER_INPUT_ERRORS = {
  empty: 'Önce sunucu bağlantısını yapıştır',
  invalid: 'Bu bir sunucu bağlantısı değil',
  insecure: 'Sunucu adresi https:// ile başlamalı',
  gameLink: 'Bu oyunun kendi adresi; sunucu sahibinin gönderdiği bağlantıyı yapıştır',
};

// Şifresiz (http) bağlantıya yalnız bu bilgisayar ve yerel ağ için izin verilir (https sayfası zaten engeller)
const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/;

// Davet bağlantısının tamamı (…/call-of-duty/?sunucu=https://x.trycloudflare.com), yalnız adres ya da şemasız
// adres kabul edilir → { ok, url } | { ok: false, error }
export function parseServerInput(text, depth = 0) {
  let s = String(text ?? '').trim();
  if (!s) return { ok: false, error: 'empty' };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  let u;
  try {
    u = new URL(s);
  } catch {
    return { ok: false, error: 'invalid' };
  }
  const inner = u.searchParams.get(INVITE_PARAM) || u.searchParams.get('server');
  if (inner && depth === 0) return parseServerInput(inner, 1);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && LOCAL_HOST.test(u.hostname))) return { ok: false, error: u.protocol === 'http:' ? 'insecure' : 'invalid' };
  if (u.username || u.password || (!u.hostname.includes('.') && !LOCAL_HOST.test(u.hostname))) return { ok: false, error: 'invalid' };
  if (/(^|\.)github\.io$/i.test(u.hostname)) return { ok: false, error: 'gameLink' };
  const path = u.pathname.replace(/\/+$/, '');
  return { ok: true, url: `${u.protocol}//${u.host}${path}` };
}

export const serverInputError = (code) => SERVER_INPUT_ERRORS[code] || SERVER_INPUT_ERRORS.invalid;

// Davet bağlantısı (oyunun kendi adresi + ?sunucu=adres): "Bağlantıyı kopyala" bunu verir
export function inviteUrl(serverUrl, gameUrl) {
  const base = String(gameUrl).split(/[?#]/)[0];
  return `${base}?${INVITE_PARAM}=${serverUrl}`;
}

// Profilde etkin hesap (id/tag/token + sabitlenmiş anahtar key) profile.server kimlikli sunucuya aittir; öbür
// sunucuların hesapları profile.servers[serverId]'de bekler. Başka sunucuya geçince etkin hesap saklanır, o sunucununki
// (yoksa boş) yüklenir; her alan açıkça yazılır ki önceki sunucunun anahtarı ya da belirteci yenisine geçmesin.
// Kimliği bilinmeyen eski hesap (sunucu kimliği gelmeden önceki kayıt) ilk bağlanılan sunucuya ait sayılır:
// yanlışsa sunucu 401 döner, hesap sıfırlanıp yeniden alınır. → değişti mi
export function selectIdentity(profile, serverId) {
  if (!serverId || profile.server === serverId) return false;
  if (!isObj(profile.servers)) profile.servers = {};
  if (!profile.server && profile.token) {
    profile.server = serverId;
    profile.servers[serverId] = pick(profile);
    return true;
  }
  if (profile.server && (profile.token || profile.key)) profile.servers[profile.server] = pick(profile);
  profile.server = serverId;
  const next = isObj(profile.servers[serverId]) ? profile.servers[serverId] : {};
  profile.id = next.id ?? null;
  profile.tag = next.tag ?? null;
  profile.token = next.token ?? null;
  profile.key = next.key ?? null;
  return true;
}

// Kimliği kanıtlanan sunucunun anahtarı etkin hesaba ve sunucunun kaydına yazılır (ilk görüşte güven)
export function pinIdentity(profile, key) {
  profile.key = key || null;
  if (!profile.server) return;
  if (!isObj(profile.servers)) profile.servers = {};
  profile.servers[profile.server] = pick(profile);
}

// Bu sunucu kimliği için sabitlenmiş anahtar (yoksa null)
export function pinnedKey(profile, serverId) {
  if (profile.server === serverId && profile.key) return profile.key;
  const rec = isObj(profile.servers) ? profile.servers[serverId] : null;
  return (isObj(rec) && rec.key) || null;
}

// 'ok': imza geçerli ve anahtar sabitlenmiş anahtarla aynı (ya da ilk görüş) · 'mismatch': imza geçerli ama başka
// anahtar (aynı kimliği taklit eden sunucu) · 'unverified': imza yok ya da geçersiz (eski sürüm, sahte, yeniden oynatma)
export function identityVerdict(profile, info, verified) {
  if (!info?.serverId || !info.key || !verified) return 'unverified';
  const pinned = pinnedKey(profile, info.serverId);
  return pinned && pinned !== info.key ? 'mismatch' : 'ok';
}

// Yeni hesap alındı ya da sunucu ad/etiketi değiştirdi: sunucunun kaydı da güncellenir
export function rememberIdentity(profile) {
  if (!profile.server) return;
  if (!isObj(profile.servers)) profile.servers = {};
  profile.servers[profile.server] = pick(profile);
}

// Sunucu hesabı tanımadı (veritabanı sıfırlandı) ya da hesap silindi: yalnız bu sunucunun hesabı silinir. Sabitlenmiş
// anahtar kalır: aynı kimliği başka anahtarla söyleyen sunucu yine tanınsın
export function forgetIdentity(profile) {
  Object.assign(profile, { id: null, tag: null, token: null });
  if (!profile.server || !isObj(profile.servers)) return;
  if (profile.key) profile.servers[profile.server] = pick(profile);
  else delete profile.servers[profile.server];
}

function pick(p) {
  return { id: p.id ?? null, tag: p.tag ?? null, token: p.token ?? null, key: p.key ?? null };
}

function isObj(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

// Sunucudan gelen dizgi alanı: beklenmeyen tür ya da aşırı uzunluk boş sayılır
const field = (v, max) => (typeof v === 'string' && v.length <= max ? v : '');

// Sunucunun durumu (/api/health): açık mı, adı, kaç oyuncu bağlı, kalıcı kimliği; challenge verilirse kimlik anahtarı
// ve imza. Kapalıysa null
export async function probeServer(url, { timeoutMs = 4000, fetchImpl = globalThis.fetch, challenge = '' } = {}) {
  try {
    const q = challenge ? `?c=${encodeURIComponent(challenge)}` : '';
    const res = await fetchImpl(`${url}/api/health${q}`, { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
    if (!res.ok) return null;
    const h = await res.json();
    if (!h || h.ok !== true) return null;
    return {
      name: typeof h.name === 'string' ? h.name.slice(0, 40) : '',
      online: Number(h.online) || 0,
      serverId: field(h.serverId, 64),
      ai: h.ai === true,
      key: field(h.key, 256),
      proof: field(h.proof, 256),
    };
  } catch {
    return null;
  }
}

// Kimlik kanıtı için tek kullanımlık meydan okuma (18 rastgele bayt, base64url): eski imza yeniden oynatılamaz
export function randomChallenge() {
  const b = new Uint8Array(18);
  globalThis.crypto.getRandomValues(b);
  return toB64u(b);
}

// Sunucunun imzası bu meydan okuma ve kendi söylediği anahtar için geçerli mi (WebCrypto ECDSA P-256 / SHA-256).
// Anahtarın doğru sunucuya ait olduğunu identityVerdict sabitlenmiş anahtarla karşılaştırarak söyler
export async function verifyServerProof(info, challenge, subtle = globalThis.crypto?.subtle) {
  if (!subtle || !info?.serverId || !info.key || !info.proof || !challenge) return false;
  try {
    const key = await subtle.importKey('spki', fromB64u(info.key), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, fromB64u(info.proof), new TextEncoder().encode(proofMessage(info.serverId, challenge)));
  } catch {
    return false;
  }
}

function toB64u(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64u(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
