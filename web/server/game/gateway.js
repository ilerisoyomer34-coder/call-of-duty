// Oyun bağlantısı (/game, ikili WebSocket; belge §6.1, Ek B). İlk ileti C_HELLO 5 sn içinde gelmeli:
// protokol sürümü, derleme özeti, kimlik belirteci ve oda kodu denetlenir; geçerse oda oyuncuyu ekler.
// Sınırlar: ileti en çok 512 bayt, saniyede en çok 80 girdi paketi, 3 bozuk iletide atılma, IP başına
// en çok 4 bağlantı. Hata yalnız o bağlantıyı kapatır. NETSIM ortam değişkeni sunucu tarafı gecikme benzetir.
import { WebSocketServer } from 'ws';
import { PROTOCOL_VERSION } from '../../shared/constants.js';
import { MSG, ERR, LIMITS as PL } from '../../shared/net/protocol.js';
import { Writer, decodeClient, encodeError } from '../../shared/net/codec.js';
import { createStats } from '../../shared/net/transport.js';
import { NetSim } from '../../shared/net/netsim.js';
import NETSIM from '../../src/data/netsim.json' with { type: 'json' };

export const GAME_LIMITS = {
  helloMs: 5000,
  inputPerSec: 80,
  msgPerSec: 120,
  invalidMax: 3,
  perIp: 4,
};

export function createGameGateway({ store, rooms, buildHash, log = () => {}, netsim = '', ipOf = (req) => req.socket.remoteAddress || '?' }) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  const perIp = new Map();
  const writer = new Writer(256);
  const profile = NETSIM.profiles[netsim] || null;

  function handleUpgrade(req, socket, head) {
    const ip = ipOf(req);
    const n = perIp.get(ip) || 0;
    if (n >= GAME_LIMITS.perIp) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, ip));
  }

  function wrap(ws) {
    const stats = createStats();
    const t = {
      stats,
      onmessage: null,
      send(bytes) {
        if (ws.readyState !== 1) return;
        stats.bytesOut += bytes.length;
        stats.msgsOut++;
        ws.send(bytes, { binary: true });
      },
      close(code = 1000, reason = '') {
        try {
          ws.close(code, reason);
        } catch {
          ws.terminate();
        }
      },
    };
    if (!profile) return t;
    // Sunucu tarafı ağ benzetimi: giden ve gelen iletiler tek yön gecikmeyle
    const raw = t.send;
    const out = new NetSim({ now: () => performance.now(), random: Math.random, deliver: (b) => raw(b) });
    const inn = new NetSim({ now: () => performance.now(), random: Math.random, deliver: (b) => t.onmessage?.(b) });
    out.setProfile(profile);
    inn.setProfile(profile);
    const timer = setInterval(() => {
      out.pump();
      inn.pump();
    }, 2);
    t.send = (b) => out.send(b);
    t.receive = (b) => inn.send(b);
    t.stop = () => clearInterval(timer);
    return t;
  }

  function onConnection(ws, ip) {
    perIp.set(ip, (perIp.get(ip) || 0) + 1);
    const transport = wrap(ws);
    const conn = { transport, slot: -1, playerId: null, room: null, loaded: false, pending: [], invalid: 0 };
    let windowStart = Date.now();
    let inputs = 0;
    let msgs = 0;
    const fail = (code, detail = '') => {
      transport.send(encodeError(writer, code, detail));
      transport.close(4000 + code, 'error');
    };
    const hello = setTimeout(() => fail(ERR.TIMEOUT), GAME_LIMITS.helloMs);

    const handle = (bytes) => {
      const now = Date.now();
      if (now - windowStart > 1000) {
        windowStart = now;
        inputs = msgs = 0;
      }
      const m = decodeClient(bytes);
      if (!m) {
        if (++conn.invalid >= GAME_LIMITS.invalidMax) fail(ERR.BAD_MESSAGE);
        return;
      }
      if (++msgs > GAME_LIMITS.msgPerSec || (m.type === MSG.C_INPUT && ++inputs > GAME_LIMITS.inputPerSec)) {
        if (++conn.invalid >= GAME_LIMITS.invalidMax) fail(ERR.RATE_LIMIT);
        return;
      }
      if (!conn.room) {
        if (m.type !== MSG.C_HELLO) return fail(ERR.BAD_MESSAGE);
        clearTimeout(hello);
        if (m.protocolVersion !== PROTOCOL_VERSION) return fail(ERR.VERSION_MISMATCH, String(PROTOCOL_VERSION));
        if (buildHash && m.buildHash !== buildHash) return fail(ERR.BUILD_MISMATCH, buildHash);
        const player = store.playerByToken(m.token);
        if (!player) return fail(ERR.AUTH_FAILED);
        const room = rooms.get(m.room);
        if (!room) return fail(ERR.ROOM_NOT_FOUND);
        const err = room.canJoin(player.id);
        if (err) return fail(err);
        const e2 = room.join(conn, m, player);
        if (e2) return fail(e2);
        conn.room = room;
        return;
      }
      conn.room.onMessage(conn, m);
    };
    transport.onmessage = handle;
    ws.on('message', (data, isBinary) => {
      if (!isBinary) {
        if (++conn.invalid >= GAME_LIMITS.invalidMax) fail(ERR.BAD_MESSAGE);
        return;
      }
      const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      transport.stats.bytesIn += bytes.length;
      transport.stats.msgsIn++;
      if (bytes.length > PL.maxClientBytes) {
        if (++conn.invalid >= GAME_LIMITS.invalidMax) fail(ERR.BAD_MESSAGE);
        return;
      }
      if (transport.receive) transport.receive(new Uint8Array(bytes));
      else handle(bytes);
    });
    ws.on('close', () => {
      clearTimeout(hello);
      transport.stop?.();
      const n = (perIp.get(ip) || 1) - 1;
      if (n <= 0) perIp.delete(ip);
      else perIp.set(ip, n);
      if (conn.room) conn.room.leave(conn);
    });
    ws.on('error', () => {});
  }

  return {
    handleUpgrade,
    close() {
      for (const ws of wss.clients) ws.terminate();
      wss.close();
    },
  };
}
