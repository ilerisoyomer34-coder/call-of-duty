// REST uçları (çok oyunculu S2–S3). Gövde JSON, en çok LIMITS.bodyBytes; kimlik "Authorization: Bearer".
// Hatalar { error: kod } ile döner; istemci kodu Türkçe metne çevirir (src/net/social.js → ERRORS).
import { validateName } from '../shared/names.js';
import { LIMITS } from './limits.js';
import { makeIpOf } from './config.js';

const DEFAULT_SERVER_NAME = 'Demir Şafak sunucusu';
import { SIDE } from '../shared/net/protocol.js';

class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > LIMITS.bodyBytes) {
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

export function createApi({ store, hub, parties, limiter, config, log, rooms, matchmaker }) {
  const ipOf = makeIpOf(config);
  const limit = (key, rule) => {
    if (!limiter.allow(key, rule.max, rule.windowMs)) throw new HttpError(429, 'rate_limited');
  };
  const auth = (req) => {
    const h = String(req.headers.authorization || '');
    const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
    const p = store.playerByToken(token);
    if (!p) throw new HttpError(401, 'unauthorized');
    limit(`g:${p.id}`, LIMITS.general);
    return p;
  };
  const me = (p) => ({ id: p.id, name: p.name, tag: p.tag });
  const withStatus = (list) => list.map((x) => ({ ...x, status: hub.statusOf(x.id) }));
  const friendsOf = (id) => {
    const r = store.relations(id);
    return { friends: withStatus(r.friends), incoming: r.incoming, outgoing: r.outgoing };
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
      if (!other) throw new HttpError(404, 'not_found');
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
    // serverId: veritabanıyla birlikte kalıcı; tünel adresi her açılışta değişse de oyun hesabı bu kimliğe bağlanır
    'GET /api/health': async () => ({ ok: true, online: hub.sockets.size, rooms: rooms.rooms.size, serverId: store.serverId, name: config.serverName || DEFAULT_SERVER_NAME }),
  };

  const originOk = (origin) => {
    if (!origin) return true; // tarayıcı dışı (curl, testler)
    if (origin === 'null') return config.allowNullOrigin;
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
    return config.allowedOrigins.includes(origin);
  };

  async function handle(req, res) {
    const origin = req.headers.origin;
    const send = (status, obj) => {
      const h = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
      if (origin && originOk(origin)) {
        h['access-control-allow-origin'] = origin;
        h.vary = 'Origin';
      }
      res.writeHead(status, h);
      res.end(JSON.stringify(obj));
    };
    if (!originOk(origin)) return send(403, { error: 'origin' });
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': origin || '*',
        'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS',
        'access-control-allow-headers': 'authorization, content-type',
        'access-control-max-age': '600',
        vary: 'Origin',
      });
      return res.end();
    }
    const url = new URL(req.url, 'http://x');
    const fn = routes[`${req.method} ${url.pathname}`];
    if (!fn) return send(404, { error: 'no_route' });
    try {
      const body = req.method === 'POST' || req.method === 'PATCH' ? await readBody(req) : {};
      send(200, await fn(req, body, url));
    } catch (e) {
      if (e instanceof HttpError) send(e.status, { error: e.code });
      else {
        log('api hatası', req.method, url.pathname, e?.message);
        send(500, { error: 'server' });
      }
    }
  }

  return { handle, originOk, friendsOf };
}
