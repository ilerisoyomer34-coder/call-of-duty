// Odalar ve eşleştirme (S4–S6).
//   RoomManager: oda kodu (31 sembol, 6 karakter), harita çarpışma verisi önbelleği, açık maç arama.
//   Matchmaker: "Maç ara" kuyruğu. Takım (party) hep birlikte ve aynı tarafa konur. Önce yer olan süren maça
//     katılır (bot yerleri insana açılır: karışık oyuncular); yoksa searchSec bekler, bekleyen takımları bir maçta
//     toplar, eksik yerleri yapay zekâ doldurur. Sonuç takım üyelerine sosyal WebSocket'ten { t: 'match' } gider.
import { readFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { CollisionWorld } from '../../shared/sim/collision.js';
import { SIDE } from '../../shared/net/protocol.js';
import MODES from '../../src/data/modes.json' with { type: 'json' };
import ARENAS from '../../src/data/arenas.json' with { type: 'json' };
import { Room } from './room.js';

export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const MM = MODES.matchmaking;

export const modeRules = (id) => (id === 'sandbox' ? MODES.sandbox.rules : MODES.modes.find((m) => m.id === id && m.available)?.rules || null);

// Bir takımın sığabileceği en büyük boyut (taraf başına insan yeri)
export function partyCap(mode) {
  const r = modeRules(mode);
  if (!r) return 0;
  return r.sides === 2 ? Math.max(...r.humanSides.map((s) => r.perSide[s])) : r.max;
}

export class RoomManager {
  constructor({ log = () => {}, secret = 'dev', now, overrides = {} } = {}) {
    this.log = log;
    this.secret = secret;
    this.now = now;
    this.overrides = overrides; // testler: { warmup, timeLimit, ... } kurallara yazılır
    this.rooms = new Map();
    this.worlds = new Map();
    this.mapTurn = 0;
  }

  world(mapId) {
    let w = this.worlds.get(mapId);
    if (!w) {
      const file = JSON.parse(readFileSync(new URL(`../../shared/maps/${mapId}.collision.json`, import.meta.url), 'utf8'));
      w = CollisionWorld.fromJSON(file);
      this.worlds.set(mapId, w);
    }
    return w;
  }

  newCode() {
    for (;;) {
      let c = '';
      for (let i = 0; i < 6; i++) c += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      if (!this.rooms.has(c)) return c;
    }
  }

  create(kind, mode) {
    const rules = kind === 'sandbox' ? { ...modeRules('sandbox') } : { ...modeRules(mode), ...this.overrides };
    const mapId = MM.maps[this.mapTurn++ % MM.maps.length];
    const code = this.newCode();
    const room = new Room({
      code,
      kind,
      mode: kind === 'sandbox' ? 'sandbox' : mode,
      rules,
      mapId,
      world: this.world(mapId),
      arena: ARENAS[mapId],
      secret: this.secret,
      log: this.log,
      now: this.now,
      seed: randomInt(1 << 30),
      cutoffSec: MM.joinCutoffSec,
      onClose: (r) => this.rooms.delete(r.code),
    });
    this.rooms.set(code, room);
    this.log(`oda ${code} açıldı (${kind}, ${room.mode}, ${mapId})`);
    return room;
  }

  get(code) {
    return this.rooms.get(String(code || '').toUpperCase()) || null;
  }

  // Bu boyda takım için yeri olan süren maç (en çok insanı olan öne: karışık oyun)
  findOpen(mode, size) {
    let best = null;
    let bestHumans = -1;
    for (const r of this.rooms.values()) {
      if (r.kind !== 'match' || r.mode !== mode || !r.joinable) continue;
      if (r.sideFor(size) === -1) continue;
      const h = r.sim.humans().length;
      if (h > bestHumans) {
        best = r;
        bestHumans = h;
      }
    }
    return best;
  }

  closeAll() {
    for (const r of [...this.rooms.values()]) r.close('shutdown');
  }
}

export class Matchmaker {
  constructor({ rooms, hub, parties, log = () => {}, searchSec = MM.searchSec, now = () => Date.now() }) {
    this.rooms = rooms;
    this.hub = hub;
    this.parties = parties;
    this.log = log;
    this.searchSec = searchSec;
    this.now = now;
    this.tickets = []; // { id, leader, members, mode, since, party }
    this.timer = setInterval(() => this.tryMatch(), 1000);
    this.timer.unref?.();
  }

  ticketOf(id) {
    return this.tickets.find((t) => t.members.includes(id)) || null;
  }

  // "Maç ara": takım lideri (ya da takımsız oyuncu) bütün takımı kuyruğa sokar
  enqueue(playerId, mode) {
    if (!modeRules(mode) || mode === 'sandbox') return { error: 'bad_mode' };
    const party = this.parties.partyOf(playerId);
    if (party && party.leader !== playerId) return { error: 'not_leader' };
    const members = (party ? party.members : [playerId]).filter((m) => this.hub.isOnline(m));
    if (!members.includes(playerId)) members.unshift(playerId);
    if (members.length > partyCap(mode)) return { error: 'party_too_big' };
    for (const m of members) this.cancel(m, false);
    const t = { id: `q_${this.now()}_${playerId}`, leader: playerId, members, mode, since: this.now(), party: party ? party.id : '' };
    this.tickets.push(t);
    this.notify(t, { mode, since: t.since });
    this.tryMatch();
    return { ok: true, queue: { mode, since: t.since } };
  }

  cancel(playerId, tell = true) {
    const t = this.ticketOf(playerId);
    if (!t) return { ok: true };
    this.tickets = this.tickets.filter((x) => x !== t);
    if (tell) this.notify(t, null);
    return { ok: true };
  }

  notify(t, queue) {
    for (const m of t.members) this.hub.send(m, { t: 'queue', queue });
  }

  tryMatch() {
    const now = this.now();
    for (const t of [...this.tickets]) {
      if (!this.tickets.includes(t)) continue;
      // Kuyruktayken bağlantısı kopan üye çıkar
      t.members = t.members.filter((m) => this.hub.isOnline(m));
      if (!t.members.length) {
        this.tickets = this.tickets.filter((x) => x !== t);
        continue;
      }
      const open = this.rooms.findOpen(t.mode, t.members.length);
      if (open) {
        this.assign(t, open);
        continue;
      }
      const waiting = this.tickets.filter((x) => x.mode === t.mode);
      const humans = waiting.reduce((n, x) => n + x.members.length, 0);
      const full = partyCap(t.mode) * (modeRules(t.mode).sides === 2 ? modeRules(t.mode).humanSides.length : 1);
      if (now - t.since < this.searchSec * 1000 && humans < full) continue;
      // Yeni maç: bekleyen takımlardan sığanlar aynı maça (karışık), kalan yerler yapay zekâ
      const room = this.rooms.create('match', t.mode);
      for (const x of waiting) if (room.sideFor(x.members.length) !== -1) this.assign(x, room);
    }
  }

  assign(t, room) {
    const side = room.sideFor(t.members.length);
    room.reserve(t.members, t.party || t.leader, side === -1 ? SIDE.NONE : side);
    this.tickets = this.tickets.filter((x) => x !== t);
    for (const m of t.members) {
      this.hub.send(m, { t: 'queue', queue: null });
      this.hub.send(m, { t: 'match', match: { room: room.code, kind: 'match', mode: t.mode, map: room.mapId, side } });
    }
    this.log(`eşleşme: ${t.members.length} oyuncu → oda ${room.code} (${t.mode}, taraf ${side})`);
  }

  close() {
    clearInterval(this.timer);
  }
}
