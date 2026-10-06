// Demir Şafak çevrim içi sunucusu (çok oyunculu S2–S6; belge §15.1 geliştirme düzeni: tek süreç).
// HTTP (REST), sosyal WebSocket (/ws, JSON) ve oyun WebSocket'i (/game, ikili codec, 64 Hz oda) aynı portta.
// Çalıştır: cd web && npm run server   (ayarlar: server/.env.example)
import { createServer as createHttp } from 'node:http';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { loadConfig, makeIpOf } from './config.js';
import { Store } from './db.js';
import { Hub } from './hub.js';
import { PartyManager } from './party.js';
import { RateLimiter } from './ratelimit.js';
import { LIMITS } from './limits.js';
import { createApi } from './api.js';
import { RoomManager, Matchmaker, MM } from './game/rooms.js';
import { createGameGateway } from './game/gateway.js';
import { computeBuildHash } from './game/buildhash.js';

export async function startServer(overrides = {}) {
  const config = { ...loadConfig(), ...overrides };
  const log = config.quiet ? () => {} : (...a) => console.log(new Date().toISOString(), ...a);
  const store = new Store(config.dbPath);
  store.expireRequests();
  const hub = new Hub(store);
  const parties = new PartyManager(store, hub);
  const limiter = new RateLimiter();
  // Oyun odaları ve eşleştirme. Kural kısaltmaları yalnız testler için (MATCH_WARMUP, MATCH_TIME)
  const ruleOverrides = {};
  if (config.warmupSec !== null && config.warmupSec !== undefined) ruleOverrides.warmup = config.warmupSec;
  if (config.timeLimitSec) ruleOverrides.timeLimit = config.timeLimitSec;
  const rooms = new RoomManager({ log, secret: config.serverSecret || randomBytes(16).toString('hex'), overrides: ruleOverrides });
  const matchmaker = new Matchmaker({ rooms, hub, parties, log, searchSec: config.searchSec ?? MM.searchSec });
  const buildHash = config.buildCheck ? computeBuildHash() : '';
  const api = createApi({ store, hub, parties, limiter, config, log, rooms, matchmaker });
  const http = createHttp((req, res) => api.handle(req, res));
  const wss = new WebSocketServer({ noServer: true, maxPayload: LIMITS.wsPayloadBytes });
  const ipOf = makeIpOf(config);
  const game = createGameGateway({ store, rooms, buildHash, log, netsim: config.netsim, ipOf });

  http.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://x');
    if (!api.originOk(req.headers.origin)) {
      socket.destroy();
      return;
    }
    if (url.pathname === '/ws') wss.handleUpgrade(req, socket, head, (ws) => onSocket(ws));
    else if (url.pathname === '/game') game.handleUpgrade(req, socket, head);
    else socket.destroy();
  });

  // Bağlantı: ilk ileti { t: 'hello', token } olmalı; sonra durum ve canlılık iletileri
  function onSocket(ws) {
    let id = null;
    let count = 0;
    let windowStart = Date.now();
    const hello = setTimeout(() => ws.close(4000, 'hello'), LIMITS.helloTimeoutMs);
    ws.on('message', (data) => {
      const now = Date.now();
      if (now - windowStart > 1000) {
        windowStart = now;
        count = 0;
      }
      if (++count > LIMITS.wsMsgPerSec) return ws.close(4008, 'rate');
      let msg;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return ws.close(4002, 'bad');
      }
      if (!msg || typeof msg.t !== 'string') return ws.close(4002, 'bad');
      if (!id) {
        if (msg.t !== 'hello') return ws.close(4001, 'hello');
        const p = store.playerByToken(typeof msg.token === 'string' ? msg.token : '');
        if (!p) {
          ws.send(JSON.stringify({ t: 'error', error: 'unauthorized' }));
          return ws.close(4001, 'unauthorized');
        }
        clearTimeout(hello);
        id = p.id;
        hub.attach(ws, id);
        if (msg.status) hub.setStatus(id, msg.status);
        const q = matchmaker.ticketOf(id);
        ws.send(JSON.stringify({ t: 'welcome', me: { id: p.id, name: p.name, tag: p.tag }, ...api.friendsOf(id), party: parties.view(parties.partyOf(id)), notifications: store.notifications(id), queue: q ? { mode: q.mode, since: q.since } : null }));
        return;
      }
      if (msg.t === 'status') hub.setStatus(id, msg.status);
      else if (msg.t === 'ping') ws.send(JSON.stringify({ t: 'pong', at: msg.at }));
    });
    ws.on('close', () => {
      clearTimeout(hello);
      if (id) hub.detach(ws, id);
    });
    ws.on('error', () => {});
  }

  const sweep = setInterval(() => {
    limiter.sweep(3_600_000);
    store.expireRequests();
  }, 60_000);
  sweep.unref();

  await new Promise((resolve) => http.listen(config.port, config.host, resolve));
  const port = http.address().port;
  log(`Demir Şafak sunucusu dinliyor: http://${config.host}:${port} (derleme ${buildHash || 'denetimsiz'})`);
  return {
    port,
    store,
    hub,
    parties,
    rooms,
    matchmaker,
    buildHash,
    async close() {
      clearInterval(sweep);
      matchmaker.close();
      rooms.closeAll();
      game.close();
      parties.closeAll();
      hub.closeAll();
      wss.close();
      await new Promise((r) => http.close(r));
      store.close();
    },
  };
}

// Doğrudan çalıştırıldıysa başlat
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const s = await startServer();
  const stop = async () => {
    await s.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
