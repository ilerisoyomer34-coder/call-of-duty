// Sunucu bağlantısı (ev sunucusu, Cloudflare hızlı tüneli): oyuncunun yapıştırdığı metinden sunucu adresi ve
// sunucu başına oyun hesabı. Tünel adresi sunucu her açıldığında değişir, sunucunun veritabanı aynı kalır: hesap
// adrese değil sunucunun kalıcı kimliğine (/api/health → serverId) bağlanır. Saf: tests/servers.test.mjs.

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

// Profilde etkin hesap (id/tag/token) profile.server kimlikli sunucuya aittir; öbür sunucuların hesapları
// profile.servers[serverId]'de bekler. Başka sunucuya geçince etkin hesap saklanır, o sunucununki (yoksa boş) yüklenir.
// Kimliği bilinmeyen eski hesap (sunucu kimliği gelmeden önceki kayıt) ilk bağlanılan sunucuya ait sayılır:
// yanlışsa sunucu 401 döner, hesap sıfırlanıp yeniden alınır. → değişti mi
export function selectIdentity(profile, serverId) {
  if (!serverId || profile.server === serverId) return false;
  if (!isObj(profile.servers)) profile.servers = {};
  if (!profile.server) {
    profile.server = serverId;
    if (profile.token) {
      profile.servers[serverId] = pick(profile);
      return true;
    }
  } else if (profile.token) profile.servers[profile.server] = pick(profile);
  profile.server = serverId;
  Object.assign(profile, profile.servers[serverId] || { id: null, tag: null, token: null });
  return true;
}

// Yeni hesap alındı ya da sunucu ad/etiketi değiştirdi: sunucunun kaydı da güncellenir
export function rememberIdentity(profile) {
  if (!profile.server) return;
  if (!isObj(profile.servers)) profile.servers = {};
  profile.servers[profile.server] = pick(profile);
}

// Sunucu hesabı tanımadı (veritabanı sıfırlandı): yalnız bu sunucunun hesabı silinir
export function forgetIdentity(profile) {
  if (profile.server && isObj(profile.servers)) delete profile.servers[profile.server];
  Object.assign(profile, { id: null, tag: null, token: null });
}

function pick(p) {
  return { id: p.id ?? null, tag: p.tag ?? null, token: p.token ?? null };
}

function isObj(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

// Sunucunun durumu (/api/health): açık mı, adı, kaç oyuncu bağlı, kalıcı kimliği. Kapalıysa null
export async function probeServer(url, { timeoutMs = 4000, fetchImpl = globalThis.fetch } = {}) {
  try {
    const res = await fetchImpl(`${url}/api/health`, { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
    if (!res.ok) return null;
    const h = await res.json();
    if (!h || h.ok !== true) return null;
    return { name: typeof h.name === 'string' ? h.name.slice(0, 40) : '', online: Number(h.online) || 0, serverId: typeof h.serverId === 'string' ? h.serverId : '' };
  } catch {
    return null;
  }
}
