// Oyun odası (S4–S6): bir maçın ağ tarafı. MatchSim'i sabit 64 Hz çalıştırır, istemci iletilerini işler, her
// iki tick'te bir alıcıya özel anlık görüntü (yerel oyuncunun uzlaştırma kaydı + diğerleri + o aralığın olayları),
// oyuncu listesi değişince S_ROSTER gönderir. Maç bitince sonucu yollar ve kapanır; boş oda kısa sürede kapanır.
// Zaman: oda açıldığından beri geçen ms (sunucu saati); tick k bu saatte k / 64 sn'de işlenir (istemci ClockSync).
import { performance } from 'node:perf_hooks';
import { TICK_RATE, PROTOCOL_VERSION, SNAPSHOT_RATE } from '../../shared/constants.js';
import { MSG, ERR, RF, PHASE, SIDE } from '../../shared/net/protocol.js';
import { Writer, encodeWelcome, encodeRoster, encodePong, encodeError, encodeMatchEnd, encodeSnapshot } from '../../shared/net/codec.js';
import { ONLINE } from '../../src/config.js';
import { MatchSim } from './sim.js';

const TICK_MS = 1000 / TICK_RATE;
const MAX_CATCHUP = 8; // bir uyanışta en çok bu kadar tick; daha gerideyse saat kaydırılır
const ROSTER_EVERY = 16; // değiştiyse en sık 4 Hz
const PENDING_MAX = 256; // yavaş istemcide biriken olay sınırı
export const EMPTY_CLOSE_MS = 30_000;
export const RESERVE_MS = 45_000; // eşleşip henüz bağlanmamış oyuncunun yeri bu kadar tutulur

export class Room {
  /**
   * @param {{ code, kind: 'sandbox'|'match', mode, rules, mapId, world, arena, secret, log?, now?, manual?, onClose? }} o
   *   manual: true → zamanlayıcı yok, testler tick()'i kendisi çağırır
   */
  constructor(o) {
    this.code = o.code;
    this.kind = o.kind;
    this.mode = o.mode;
    this.mapId = o.mapId;
    this.rules = o.rules;
    this.log = o.log || (() => {});
    this.now = o.now || (() => performance.now());
    this.onClose = o.onClose || (() => {});
    this.sim = new MatchSim({ world: o.world, arena: o.arena, rules: o.rules, mode: o.mode, secret: o.secret, matchId: o.code, seed: o.seed ?? 1 });
    this.t0 = this.now();
    this.conns = new Set();
    this.allowed = new Map(); // oyuncu → { side, party, until (rezervasyon), joined }
    this.slotOf = new Map(); // oyuncu → yuva
    this.writer = new Writer(2048);
    this.tickUs = 0;
    this.rosterSig = '';
    this.rosterTick = -100;
    this.emptySince = this.now();
    this.closed = false;
    this.ended = false;
    this.manual = !!o.manual;
    this.cutoffSec = o.cutoffSec ?? 60; // süresinin bu kadarından azı kalan maça yeni oyuncu girmez
    this.timer = null;
    this.sim.balanceBots();
    if (!this.manual) this.schedule();
  }

  serverTime() {
    return this.now() - this.t0;
  }

  // --- Zamanlama: sabit tick, kayma telafisi ---
  schedule() {
    if (this.closed) return;
    const next = (this.sim.tick + 1) * TICK_MS - this.serverTime();
    this.timer = setTimeout(() => this.loop(), Math.max(0, next));
  }

  loop() {
    if (this.closed) return;
    let target = Math.floor((this.serverTime() * TICK_RATE) / 1000);
    if (target - this.sim.tick > MAX_CATCHUP * 4) {
      // Çok geride (süreç durdu): saati kaydır, tick yağmuru olmasın
      this.t0 += (target - this.sim.tick - MAX_CATCHUP) * TICK_MS;
      target = this.sim.tick + MAX_CATCHUP;
    }
    let n = 0;
    while (this.sim.tick < target && n++ < MAX_CATCHUP && !this.closed) this.tick();
    this.schedule();
  }

  tick() {
    const a = performance.now();
    const sim = this.sim;
    sim.step();
    // Olaylar alıcılarına (anlık görüntüyle birlikte gider)
    for (const e of sim.events) {
      for (const c of this.conns) {
        if (c.slot < 0 || !c.loaded) continue;
        if ((e.to === -1 || e.to === c.slot) && e.except !== c.slot) {
          c.pending.push(e);
          if (c.pending.length > PENDING_MAX) c.pending.shift();
        }
      }
    }
    if (sim.tick % ONLINE.snapshotEvery === 0) this.sendSnapshots();
    if (sim.tick - this.rosterTick >= ROSTER_EVERY) this.sendRoster(false);
    if (sim.phase === PHASE.ENDED && !this.ended) this.onEnded();
    const us = (performance.now() - a) * 1000;
    this.tickUs += (us - this.tickUs) * 0.1;
    if (sim.finished) this.close('finished');
    else if (!this.hasHumans() && this.now() - this.emptySince > EMPTY_CLOSE_MS) this.close('empty');
  }

  hasHumans() {
    for (const c of this.conns) if (c.slot >= 0) return true;
    return false;
  }

  // --- Katılım ---
  // Eşleştirici/deneme odası yer ayırır: aynı takım (party) aynı tarafa
  reserve(ids, party, side = SIDE.NONE) {
    const until = this.now() + RESERVE_MS;
    for (const id of ids) this.allowed.set(id, { side, party, until, joined: false });
  }

  // Bekleyen ayrılmış yerler dahil insan yeri (taraf modunda o taraf için)
  freeFor(side) {
    const sim = this.sim;
    const t = this.now();
    let pending = 0;
    for (const a of this.allowed.values()) if (!a.joined && a.until > t && (!sim.sided || a.side === side)) pending++;
    return sim.humanRoom(side) - pending;
  }

  // Takım için uygun taraf (yer yoksa -1)
  sideFor(size) {
    const sim = this.sim;
    if (!sim.sided) return this.freeFor(SIDE.NONE) >= size ? SIDE.NONE : -1;
    let best = -1;
    let room = 0;
    for (const s of sim.rules.humanSides) {
      const f = this.freeFor(s);
      if (f >= size && f > room) {
        best = s;
        room = f;
      }
    }
    return best;
  }

  get joinable() {
    const sim = this.sim;
    if (this.closed || this.ended || sim.phase === PHASE.ENDED) return false;
    return !sim.rules.timeLimit || sim.phase !== PHASE.LIVE || sim.phaseLeft > this.cutoffSec;
  }

  /** @returns {number} hata kodu ya da 0 */
  canJoin(playerId) {
    if (this.closed) return ERR.ROOM_CLOSED;
    const a = this.allowed.get(playerId);
    if (!a) return ERR.NOT_MEMBER;
    if (!this.slotOf.has(playerId) && this.sim.players.indexOf(null) < 0) return ERR.ROOM_FULL;
    return 0;
  }

  // El sıkışma geçti: oyuncuyu simülasyona ekle (yeniden bağlanan aynı oyuncu eski bağlantının yerine geçer)
  join(conn, hello, player) {
    const sim = this.sim;
    const a = this.allowed.get(player.id);
    for (const c of this.conns) {
      if (c.playerId === player.id) {
        this.send(c, encodeError(this.writer, ERR.REPLACED, ''));
        this.detach(c, false);
        c.transport.close(4009, 'replaced');
      }
    }
    let slot = this.slotOf.get(player.id);
    if (slot === undefined || !sim.players[slot] || sim.players[slot].id !== player.id) {
      slot = sim.addPlayer({ id: player.id, name: player.name, tag: player.tag, side: a.side, party: a.party, primary: hello.primary, secondary: hello.secondary });
      if (slot < 0) return ERR.ROOM_FULL;
      this.slotOf.set(player.id, slot);
      sim.balanceBots();
    }
    a.joined = true;
    conn.slot = slot;
    conn.playerId = player.id;
    conn.pending = [];
    conn.loaded = false;
    conn.sentAt = new Map();
    this.conns.add(conn);
    const p = sim.players[slot];
    p.connected = true;
    this.send(
      conn,
      encodeWelcome(this.writer, {
        slot,
        tickRate: TICK_RATE,
        snapshotRate: SNAPSHOT_RATE,
        serverTick: sim.tick,
        serverTime: this.serverTime(),
        room: this.code,
        mode: this.kind === 'sandbox' ? 'sandbox' : this.mode,
        map: this.mapId,
        timeLimit: sim.rules.timeLimit || 0,
        scoreLimit: sim.rules.scoreLimit || 0,
        primary: p.loadout[0],
        secondary: p.loadout[1],
      })
    );
    this.sendRoster(true);
    this.log(`oda ${this.code}: ${player.name}#${player.tag} katıldı (yuva ${slot})`);
    return 0;
  }

  onMessage(conn, m) {
    const sim = this.sim;
    switch (m.type) {
      case MSG.C_INPUT: {
        if (!conn.loaded) return;
        sim.queueCmds(conn.slot, m.cmds);
        // Gidiş-dönüş: onaylanan anlık görüntünün gönderilme anından
        const at = conn.sentAt.get(m.ackTick);
        if (at !== undefined) {
          const rtt = this.now() - at;
          const p = sim.players[conn.slot];
          if (p) p.ping = p.ping ? p.ping + (rtt - p.ping) * 0.2 : rtt;
          conn.sentAt.delete(m.ackTick);
        }
        break;
      }
      case MSG.C_PING:
        this.send(conn, encodePong(this.writer, m.clientTime, this.serverTime(), sim.tick));
        break;
      case MSG.C_LOADED:
        if (!conn.loaded) {
          conn.loaded = true;
          sim.setReady(conn.slot);
        }
        break;
      case MSG.C_LEAVE:
        this.leave(conn);
        conn.transport.close(1000, 'leave');
        break;
      default:
        break;
    }
  }

  // Bağlantı koptu ya da oyuncu ayrıldı: maçta yeri yapay zekâya kalır (yeniden bağlanırsa yeni yuva)
  leave(conn) {
    this.detach(conn, true);
  }

  detach(conn, remove) {
    if (!this.conns.delete(conn)) return;
    const sim = this.sim;
    if (remove && conn.slot >= 0) {
      const p = sim.players[conn.slot];
      if (p && p.id === conn.playerId) {
        sim.removePlayer(conn.slot);
        this.slotOf.delete(conn.playerId);
        sim.balanceBots();
      }
      this.log(`oda ${this.code}: ${conn.playerId} ayrıldı`);
    }
    conn.slot = -1;
    if (!this.hasHumans()) this.emptySince = this.now();
    this.sendRoster(true);
  }

  // --- Gönderim ---
  send(conn, bytes) {
    try {
      conn.transport.send(bytes);
    } catch {
      /* kapanmakta olan bağlantı */
    }
  }

  sendSnapshots() {
    const sim = this.sim;
    const t = this.now();
    for (const c of this.conns) {
      if (!c.loaded || c.slot < 0) continue;
      const s = sim.snapshotFor(c.slot);
      s.tickUs = this.tickUs;
      s.events = c.pending;
      this.send(c, encodeSnapshot(this.writer, s));
      c.pending = [];
      c.sentAt.set(sim.tick, t);
      if (c.sentAt.size > 64) c.sentAt.delete(c.sentAt.keys().next().value);
    }
  }

  rosterView() {
    const sim = this.sim;
    const out = [];
    for (const p of sim.players) {
      if (!p) continue;
      out.push({ slot: p.slot, id: p.id, name: p.name, tag: p.tag, side: p.side, flags: (p.bot ? RF.BOT : 0) | (p.connected || p.bot ? RF.CONNECTED : 0), kills: p.kills, deaths: p.deaths, score: p.score, ping: p.bot ? 0 : p.ping, party: p.party });
    }
    return out;
  }

  sendRoster(force) {
    const view = this.rosterView();
    // Ping küçük oynamaları göndermeyi tetiklemesin (10 ms adım)
    const sig = view.map((p) => `${p.slot}:${p.id}:${p.side}:${p.kills}:${p.deaths}:${p.score}:${Math.round(p.ping / 10)}:${p.flags}`).join('|');
    if (!force && sig === this.rosterSig) return;
    this.rosterSig = sig;
    this.rosterTick = this.sim.tick;
    const bytes = encodeRoster(this.writer, view);
    for (const c of this.conns) if (c.slot >= 0) this.send(c, bytes);
  }

  onEnded() {
    this.ended = true;
    const r = this.sim.result;
    this.sendRoster(true);
    const bytes = encodeMatchEnd(this.writer, { winner: r.winner, reason: r.reason, scoreA: this.sim.scores[0], scoreB: this.sim.scores[1] });
    for (const c of this.conns) if (c.slot >= 0) this.send(c, bytes);
    this.log(`oda ${this.code}: maç bitti (kazanan ${r.winner}, neden ${r.reason})`);
  }

  close(reason = 'closed') {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.timer);
    for (const c of [...this.conns]) {
      if (reason !== 'finished') this.send(c, encodeError(this.writer, ERR.ROOM_CLOSED, reason));
      c.transport.close(1000, reason);
    }
    this.conns.clear();
    this.log(`oda ${this.code} kapandı (${reason})`);
    this.onClose(this, reason);
  }
}

export { PROTOCOL_VERSION };
