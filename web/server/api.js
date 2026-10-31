// REST uçları (çok oyunculu S2–S3). Gövde JSON, en çok LIMITS.bodyBytes; kimlik "Authorization: Bearer".
// Hatalar { error: kod } ile döner; istemci kodu Türkçe metne çevirir (src/net/social.js → ERRORS).
import { validateName } from '../shared/names.js';
import { LIMITS } from './limits.js';
import { makeIpOf } from './config.js';
import { AiError } from './ai.js';

const DEFAULT_SERVER_NAME = 'Demir Şafak sunucusu';
import { SIDE } from '../shared/net/protocol.js';

class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function readBody(req, max = LIMITS.bodyBytes) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > max) {
        // Kalanı okuyup at (bağlantı koparılırsa istemci yanıtı göremez), 413 dön
        req.removeAllListeners('data');
        req.resume();
        reject(new HttpError(413, 'too_large'));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!size) return resolve({});
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(v && typeof v === 'object' && !Array.isArray(v) ? v : {});
      } catch {
        reject(new HttpError(400, 'bad_json'));
      }
    });
    req.on('error', reject);
  });
}

const str = (v) => (typeof v === 'string' ? v : '');
// Günlüğe giden kullanıcı metni: satır sonu ve denetim karakterleri sahte günlük satırı üretmesin, uzunluk sınırlı
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029]', 'g');
export const logSafe = (v) => String(v ?? '').replace(CONTROL_CHARS, '?').slice(0, 80);

// Her yanıtta: JSON'u başka türde yorumlatma, çerçeveye koyma, adres sızdırma, sayfa olarak açılınca hiçbir şey
// yükleme. API yalnız JSON döndürür; bu başlıklar tarayıcıdan doğrudan açılan uçları da korur
export const SECURITY_HEADERS = Object.freeze({
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  'cross-origin-opener-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
});
// Şikâyet gerekçeleri: uygunsuz ad, taciz/hile (istemcide aynı kodlar → Türkçe metin)
export const REPORT_REASONS = ['name', 'abuse'];

// Gövdesi büyük olabilen uçlar (yapay zekâ telsizi oyun durumunu ve sohbet belleğini taşır)
const BODY_LIMITS = { '/api/ai/radio': LIMITS.aiBodyBytes };

export function createApi({ store, hub, parties, limiter, config, log, rooms, matchmaker, ai = null }) {
  const ipOf = makeIpOf(config);
  const limit = (key, rule) => {
    if (!limiter.allow(key, rule.max, rule.windowMs)) throw new HttpError(429, 'rate_limited');
  };
  // Geçersiz belirteç IP başına sayılır: belirteç tahmini (kaba kuvvet) sınırdan sonra hiç denenmez
  const auth = (req) => {
    const failKey = `af:${ipOf(req)}`;
    if (limiter.count(failKey, LIMITS.authFail.windowMs) >= LIMITS.authFail.max) throw new HttpError(429, 'rate_limited');
    const h = String(req.headers.authorization || '');
    const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
    const p = token.length <= LIMITS.tokenMax ? store.playerByToken(token) : null;
    if (!p) {
      limiter.allow(failKey, Infinity, LIMITS.authFail.windowMs);
      throw new HttpError(401, 'unauthorized');
    }
    limit(`g:${p.id}`, LIMITS.general);
    return p;
  };
  const me = (p) => ({ id: p.id, name: p.name, tag: p.tag });
  const withStatus = (list) => list.map((x) => ({ ...x, status: hub.statusOf(x.id) }));
  const friendsOf = (id) => {
    const r = store.relations(id);
    return { friends: withStatus(r.friends), incoming: r.incoming, outgoing: r.outgoing, blocked: store.blocked(id) };
  };
  // İlişki değişince iki tarafa güncel listeler (açık sekmeler yeniden çizsin)
  const pushFriends = (...ids) => {
    for (const id of ids) hub.send(id, { t: 'friends', ...friendsOf(id) });
  };

  const routes = {
    'POST /api/session': async (req, body) => {
      limit(`s:${ipOf(req)}`, LIMITS.session);
      const v = validateName(str(body.name));
      if (!v.ok) throw new HttpError(400, `name_${v.error}`);
      const p = store.createPlayer(v.name);
      if (!p) throw new HttpError(409, 'name_full');
      return p;
    },
    'GET /api/me': async (req) => {
      const p = auth(req);
      return { ...me(p), party: parties.view(parties.partyOf(p.id)) };
    },
    'PATCH /api/me': async (req, body) => {
      const p = auth(req);
      limit(`r:${p.id}`, LIMITS.rename);
      const v = validateName(str(body.name));
      if (!v.ok) throw new HttpError(400, `name_${v.error}`);
      const r = store.rename(p.id, v.name);
      if (!r) throw new HttpError(409, 'name_full');
      for (const f of store.relations(p.id).friends) pushFriends(f.id);
      const party = parties.partyOf(p.id);
      if (party) parties.push(party);
      return r;
    },
    // Hesabı sil (App Store 5.1.1(v), Google Play hesap silme kuralı): kalıcıdır, geri alınamaz. Arkadaş listeleri
    // güncellenir; oyuncunun açık sekmeleri kapanır. Cihazdaki ilerleme (kayıt) sunucuda değil, ona dokunulmaz
    'DELETE /api/me': async (req) => {
      const p = auth(req);
      const r = store.relations(p.id);
      const others = [...r.friends, ...r.incoming, ...r.outgoing].map((x) => x.id);
      matchmaker.cancel(p.id);
      parties.forget(p.id);
      store.deletePlayer(p.id);
      hub.kick(p.id);
      pushFriends(...others);
      return { ok: true };
    },
    'GET /api/players': async (req, body, url) => {
      const p = auth(req);
      limit(`q:${p.id}`, LIMITS.search);
      const q = str(url.searchParams.get('q')).trim();
      if (q.replace('#', '').length < LIMITS.searchMin) throw new HttpError(400, 'query_short');
      return { players: store.search(p.id, q).map((x) => ({ ...x, status: hub.statusOf(x.id), relation: store.relation(p.id, x.id) })) };
    },
    'GET /api/friends': async (req) => friendsOf(auth(req).id),
    'POST /api/friends/request': async (req, body) => {
      const p = auth(req);
      limit(`f:${p.id}`, LIMITS.friendRequest);
      const to = str(body.id);
      if (to === p.id) throw new HttpError(400, 'self');
      const other = store.player(to);
      // Engelleşmiş oyuncu yokmuş gibi görünür (engellendiğini öğrenmesin)
      if (!other || store.isBlocked(p.id, to)) throw new HttpError(404, 'not_found');
      const rel = store.relation(p.id, to);
      if (rel === 'friend') throw new HttpError(409, 'already_friends');
      if (rel === 'outgoing') throw new HttpError(409, 'already_requested');
      if (store.friendCount(p.id) >= LIMITS.friendMax) throw new HttpError(409, 'friend_limit');
      if (rel === 'incoming') {
        // Karşı taraf zaten istek göndermiş: istek kabul sayılır
        store.accept(p.id, to);
        hub.send(to, { t: 'notification', n: store.notify(to, 'friend_accepted', p.id) });
        pushFriends(p.id, to);
        return { relation: 'friend' };
      }
      if (store.friendCount(to) >= LIMITS.friendMax) throw new HttpError(409, 'friend_limit');
      store.request(p.id, to);
      hub.send(to, { t: 'notification', n: store.notify(to, 'friend_request', p.id) });
      pushFriends(p.id, to);
      return { relation: 'outgoing' };
    },
    'POST /api/friends/respond': async (req, body) => {
      const p = auth(req);
      const from = str(body.id);
      if (store.relation(p.id, from) !== 'incoming') throw new HttpError(404, 'no_request');
      if (body.accept === true) {
        if (store.friendCount(p.id) >= LIMITS.friendMax) throw new HttpError(409, 'friend_limit');
        store.accept(p.id, from);
        hub.send(from, { t: 'notification', n: store.notify(from, 'friend_accepted', p.id) });
      } else {
        store.remove(p.id, from);
        hub.send(from, { t: 'friend_declined', by: me(p) });
      }
      pushFriends(p.id, from);
      return { relation: body.accept === true ? 'friend' : 'none' };
    },
    'POST /api/friends/remove': async (req, body) => {
      const p = auth(req);
      const other = str(body.id);
      if (store.relation(p.id, other) === 'none') throw new HttpError(404, 'not_found');
      store.remove(p.id, other);
      pushFriends(p.id, other);
      return { relation: 'none' };
    },
    // Engelle / engeli kaldır / bildir (App Store 1.2: kullanıcı içeriği olan uygulamada zorunlu). Engellemek
    // arkadaşlığı ve bekleyen isteği düşürür, takımdaysa ayrılır; şikâyet sunucu sahibine gider (server/moderate.mjs)
    'POST /api/block': async (req, body) => {
      const p = auth(req);
      limit(`b:${p.id}`, LIMITS.block);
      const other = str(body.id);
      if (other === p.id) throw new HttpError(400, 'self');
      if (!store.player(other)) throw new HttpError(404, 'not_found');
      store.block(p.id, other);
      const party = parties.partyOf(p.id);
      if (party && party.members.includes(other)) parties.leave(p.id);
      pushFriends(p.id, other);
      return { ok: true };
    },
    'POST /api/unblock': async (req, body) => {
      const p = auth(req);
      store.unblock(p.id, str(body.id));
      pushFriends(p.id);
      return { ok: true };
    },
    'POST /api/report': async (req, body) => {
      const p = auth(req);
      limit(`rp:${p.id}`, LIMITS.report);
      const other = str(body.id);
      const reason = str(body.reason);
      if (!REPORT_REASONS.includes(reason)) throw new HttpError(400, 'bad_reason');
      if (other === p.id) throw new HttpError(400, 'self');
      if (!store.report(p.id, other, reason)) throw new HttpError(404, 'not_found');
      log('şikâyet', reason, logSafe(other));
      return { ok: true };
    },
    'GET /api/notifications': async (req) => ({ notifications: store.notifications(auth(req).id) }),
    'POST /api/notifications/seen': async (req) => {
      store.markSeen(auth(req).id);
      return { ok: true };
    },
    'GET /api/party': async (req) => ({ party: parties.view(parties.partyOf(auth(req).id)) }),
    'POST /api/party/invite': async (req, body) => {
      const p = auth(req);
      limit(`i:${p.id}`, LIMITS.invite);
      const r = parties.invite(p.id, str(body.id));
      if (r.error) throw new HttpError(409, r.error);
      return r;
    },
    'POST /api/party/respond': async (req, body) => {
      const r = parties.respond(auth(req).id, str(body.inviteId), body.accept === true);
      if (r.error) throw new HttpError(409, r.error);
      return r;
    },
    'POST /api/party/leave': async (req) => parties.leave(auth(req).id),
    'POST /api/party/kick': async (req, body) => {
      const r = parties.kick(auth(req).id, str(body.id));
      if (r.error) throw new HttpError(409, r.error);
      return r;
    },
    'POST /api/party/mode': async (req, body) => {
      const r = parties.setMode(auth(req).id, str(body.mode));
      if (r.error) throw new HttpError(409, r.error);
      return r;
    },
    // Deneme odası: takım lideri (ya da takımsız oyuncu) açar, takımın çevrim içi üyeleri davetli
    'POST /api/party/sandbox': async (req) => {
      const p = auth(req);
      limit(`r:${p.id}`, LIMITS.room);
      const party = parties.partyOf(p.id);
      if (party && party.leader !== p.id) throw new HttpError(409, 'not_leader');
      const members = party ? party.members.filter((m) => m === p.id || hub.isOnline(m)) : [p.id];
      for (const m of members) matchmaker.cancel(m);
      const room = rooms.create('sandbox', 'sandbox');
      room.reserve(members, party ? party.id : '', SIDE.NONE);
      const match = { room: room.code, kind: 'sandbox', mode: 'sandbox', map: room.mapId, side: SIDE.NONE, by: me(p) };
      for (const m of members) if (m !== p.id) hub.send(m, { t: 'match', match });
      return { match };
    },
    'POST /api/match/queue': async (req, body) => {
      const p = auth(req);
      limit(`m:${p.id}`, LIMITS.room);
      const mode = str(body.mode) || parties.partyOf(p.id)?.mode || '';
      const r = matchmaker.enqueue(p.id, mode);
      if (r.error) throw new HttpError(409, r.error);
      return r;
    },
    'POST /api/match/cancel': async (req) => matchmaker.cancel(auth(req).id),
    // Yapay zekâlı telsiz (server/ai.js): oyuncunun cümlesi + oyun durumu → { speaker, reply, actions }. Her istek
    // sunucu sahibinin API hesabından harcadığı için oyuncu başına dakikalık/günlük ve sunucu geneli sınır var
    'POST /api/ai/radio': async (req, body) => {
      const p = auth(req);
      if (!ai?.available) throw new HttpError(503, 'ai_off');
      limit(`ai:${p.id}`, LIMITS.aiRadio);
      if (!limiter.allow(`aid:${p.id}`, LIMITS.aiDaily.max, LIMITS.aiDaily.windowMs)) throw new HttpError(429, 'ai_limit');
      if (!limiter.allow('ai:*', LIMITS.aiGlobal.max, LIMITS.aiGlobal.windowMs)) throw new HttpError(429, 'ai_busy');
      const text = str(body.text).trim();
      if (!text || text.length > LIMITS.aiTextMax) throw new HttpError(400, 'bad_text');
      const context = body.context && typeof body.context === 'object' && !Array.isArray(body.context) ? body.context : {};
      if (JSON.stringify(context).length > LIMITS.aiContextChars) throw new HttpError(413, 'too_large');
      try {
        return await ai.ask({ text, context, history: body.history });
      } catch (e) {
        if (e instanceof AiError) throw new HttpError(e.status, e.code);
        throw e;
      }
    },
    // serverId: veritabanıyla birlikte kalıcı; tünel adresi her açılışta değişse de oyun hesabı bu kimliğe bağlanır
    // ai: yapay zekâlı telsiz bu sunucuda açık mı (oyun telsizde ona göre sorar)
    // key/proof: sunucunun kimlik anahtarı ve ?c= meydan okumasının imzası (shared/net/serverProof.js); oyun belirteci
    // ancak imza doğrulanıp anahtar sabitlenmiş anahtarla tutarsa gönderir
    'GET /api/health': async (req, body, url) => ({
      ok: true,
      online: hub.sockets.size,
      rooms: rooms.rooms.size,
      serverId: store.serverId,
      name: config.serverName || DEFAULT_SERVER_NAME,
      ai: !!ai?.available,
      key: store.publicKey,
      proof: store.proveIdentity(url.searchParams.get('c')) || '',
    }),
  };

  const originOk = (origin) => {
    if (!origin) return true; // tarayıcı dışı (curl, testler)
    if (origin === 'null') return config.allowNullOrigin;
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
    // Mağaza uygulaması (Capacitor): Android https://localhost (yukarıda), iOS capacitor://localhost
    if (origin === 'capacitor://localhost') return true;
    return config.allowedOrigins.includes(origin);
  };

  async function handle(req, res) {
    const origin = req.headers.origin;
    const send = (status, obj) => {
      const h = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...SECURITY_HEADERS };
      if (origin && originOk(origin)) {
        h['access-control-allow-origin'] = origin;
        h.vary = 'Origin';
      }
      if (status === 429) h['retry-after'] = '60';
      res.writeHead(status, h);
      res.end(JSON.stringify(obj));
    };
    if (!originOk(origin)) return send(403, { error: 'origin' });
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': origin || '*',
        'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'access-control-allow-headers': 'authorization, content-type',
        'access-control-max-age': '600',
        vary: 'Origin',
        ...SECURITY_HEADERS,
      });
      return res.end();
    }
    // IP başına genel sınır (kimliksiz istek seli dahil): gövde okunmadan reddedilir
    if (!limiter.allow(`ip:${ipOf(req)}`, LIMITS.ipGeneral.max, LIMITS.ipGeneral.windowMs)) {
      req.resume();
      return send(429, { error: 'rate_limited' });
    }
    const url = new URL(req.url, 'http://x');
    const fn = routes[`${req.method} ${url.pathname}`];
    if (!fn) return send(404, { error: 'no_route' });
    try {
      const body = req.method === 'POST' || req.method === 'PATCH' ? await readBody(req, BODY_LIMITS[url.pathname]) : {};
      send(200, await fn(req, body, url));
    } catch (e) {
      if (e instanceof HttpError) send(e.status, { error: e.code });
      else {
        log('api hatası', req.method, logSafe(url.pathname), logSafe(e?.message));
        send(500, { error: 'server' });
      }
    }
  }

  return { handle, originOk, friendsOf };
}
