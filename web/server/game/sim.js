// Maç simülasyonu (S4–S6): sunucunun otoriter dünyası. Ağdan bağımsızdır (testler doğrudan sürer).
//   - Komut kuyruğu ve bütçe: her tick bir komut (birikirse iki), kredi en çok ONLINE.creditMax tick öne geçer
//     (hızlandırma hilesi kısıtlanır). Komut yoksa oyuncu o tick durur: tahminle sunucu aynı komutları işler.
//   - Hareket shared/sim/movement.js; modlar komut bitlerinden (applyCmdMods): istemci tahmini aynı sayıları kullanır.
//   - Atış: istemci atış anını ve yönünü bildirir; sunucu tempo, şarjör, şarjör değiştirme ve silah değiştirme
//     süresini doğrular, saçılmayı kendi tohumuyla (hash(gizli, maç, oyuncu, komut, atış)) üretir, vuruşu oyuncunun
//     gördüğü zamana geri sararak (gecikme telafisi, en çok ONLINE.maxRewindMs) kutularla hesaplar.
//   - Can, yenilenme, ölüm, doğuş (düşmandan uzak, görüş dışı), skor, evreler (geri sayım → maç → sonuç), botlar.
// Zaman yalnız tick sayacından; rastgelelik tohumlu (Math.random yok).
import { TICK_DT, TICK_RATE } from '../../shared/constants.js';
import { createPlayerState, resetPlayerState, stepPlayer, applyCmdMods, createInputCmd, BTN } from '../../shared/sim/movement.js';
import { createHitboxes, hitboxesFor, rayHitboxes } from '../../shared/sim/hitboxes.js';
import { Rng, hashSeed } from '../../shared/sim/rng.js';
import { createWeaponState, fireInterval, spreadDeg, recoverBloom, addBloom, recordShot, pelletDir } from '../../shared/sim/weapon.js';
import { lerp } from '../../shared/sim/math.js';
import { NavGrid } from '../../shared/sim/nav.js';
import { NEV, HIT_KIND, SURFACES, PHASE, SIDE, PF, WEAPON_MELEE, WEAPON_NONE, SLOT_NONE } from '../../shared/net/protocol.js';
import { WEAPONS, WEAPON_ORDER, MOVEMENT as M, ONLINE } from '../../src/config.js';
import BOTS from '../../src/data/bots.json' with { type: 'json' };
import { BotBrain } from './bot.js';

export const MAX_SLOTS = 16;
const HIST = ONLINE.historyTicks;
const SEC = (s) => Math.round(s * TICK_RATE);
// Mermiden geçen dost: taraf modunda aynı taraf vurulmaz (dost ateşi kapalı)
const ALLOWED = WEAPON_ORDER.filter((id) => WEAPONS[id] && WEAPONS[id].projectile !== 'rocket');

export const weaponIndex = (id) => {
  const i = WEAPON_ORDER.indexOf(id);
  return i < 0 ? WEAPON_NONE : i;
};

// İstemcinin bildirdiği teçhizat: yalnız mermi atan silahlar (roket ve el bombası çevrim içinde yok)
export function validLoadout(primary, secondary) {
  const p = ALLOWED.includes(primary) && WEAPONS[primary].category === 'primary' ? primary : ONLINE.defaultPrimary;
  const s = ALLOWED.includes(secondary) && WEAPONS[secondary].category === 'secondary' ? secondary : ONLINE.defaultSecondary;
  return [p, s];
}

// u16 komut sırası: a, b'den yeni mi (sarmayı hesaba katar)
export const seqNewer = (a, b) => {
  const d = (a - b) & 0xffff;
  return d !== 0 && d < 0x8000;
};

export function dirFromAngles(yaw, pitch, out) {
  const cp = Math.cos(pitch);
  out.x = -Math.sin(yaw) * cp;
  out.y = Math.sin(pitch);
  out.z = -Math.cos(yaw) * cp;
  return out;
}

export const eyeHeight = (s) => lerp(M.eyeStand, M.eyeCrouch, s.crouchT);

function createArm(id) {
  const d = WEAPONS[id];
  const w = createWeaponState(d);
  w.id = id;
  w.d = d;
  w.reserve = d.reserveStart;
  w.reload = null; // { t0, done } (şarjör) ya da { t0, shell: true }
  w.credit = 1;
  // En hızlı atış aralığı (seri modu dahil) ve kredi tavanı (seri bir basışta birkaç atış)
  w.interval = Math.min(fireInterval(d), d.burstRpm ? 60 / d.burstRpm : Infinity);
  w.creditCap = (d.burstCount || 1) + 1;
  return w;
}

function poseStore() {
  const a = [];
  for (let i = 0; i < HIST; i++) a.push({ tick: -1, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, height: M.standHeight, alive: false });
  return a;
}

export class MatchSim {
  /**
   * @param {{ world, arena, rules, mode, seed?, secret?, matchId? }} o
   *   world: CollisionWorld; arena: data/arenas.json girdisi (doğuşlar, gezinme noktaları); rules: modes.json kuralları
   */
  constructor(o) {
    this.world = o.world;
    this.arena = o.arena;
    this.rules = o.rules;
    this.mode = o.mode;
    this.tick = 0;
    this.players = new Array(MAX_SLOTS).fill(null);
    this.secretSeed = hashSeed(o.secret || 'dev', o.matchId || 'm');
    this.rng = new Rng(hashSeed(this.secretSeed, o.seed ?? 1));
    this.shotRng = new Rng(1);
    this.nav = null;
    this.events = [];
    this.scores = [0, 0];
    this.result = null; // { winner, reason }
    this.finished = false;
    this.botSeq = (this.rng.next() * BOTS.names.length) | 0;
    const R = this.rules;
    if (R.warmup > 0) this.setPhase(PHASE.WARMUP, SEC(R.warmup));
    else this.setPhase(PHASE.LIVE, R.timeLimit ? SEC(R.timeLimit) : Infinity);
    this._wh = {};
    this._hh = {};
    this._dir = { x: 0, y: 0, z: 0 };
    this._fwd = { x: 0, y: 0, z: 0 };
    this._eye = { x: 0, y: 0, z: 0 };
    this._pose = { pos: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, height: M.standHeight, phase: 0, speed: 0 };
    this._trace = { dist: 0, victim: null, zone: null, surface: null, point: { x: 0, y: 0, z: 0 } };
    this.idleCmd = createInputCmd();
  }

  get sided() {
    return this.rules.sides === 2;
  }

  setPhase(phase, ticks) {
    this.phase = phase;
    this.phaseEnd = this.tick + ticks;
  }

  get phaseLeft() {
    return Number.isFinite(this.phaseEnd) ? Math.max(0, (this.phaseEnd - this.tick) * TICK_DT) : 0;
  }

  // --- Oyuncular ---
  /** @returns {number} yuva ya da -1 (dolu) */
  addPlayer(info) {
    const slot = this.players.indexOf(null);
    if (slot < 0) return -1;
    const [primary, secondary] = validLoadout(info.primary, info.secondary);
    const p = {
      slot,
      uid: info.bot ? 100000 + slot : hashSeed(String(info.id || slot)),
      id: info.id || '',
      name: info.name,
      tag: info.tag || 0,
      side: this.sided ? info.side : SIDE.NONE,
      bot: !!info.bot,
      party: info.party || '',
      connected: !info.bot,
      ready: !!info.bot, // insan C_LOADED gönderince doğar
      state: createPlayerState(),
      alive: false,
      hp: 0,
      respawnAt: this.tick,
      protectUntil: 0,
      lastDamageTick: -1e9,
      queue: [],
      lastQueued: null,
      lastSeq: 0,
      credit: 1,
      cmdT: 0,
      bufDepth: 0,
      loadout: [primary, secondary],
      arms: null,
      meleeReadyT: 0,
      lastShotTick: -100,
      kills: 0,
      deaths: 0,
      score: 0,
      ping: 0,
      boxes: createHitboxes(),
      hist: poseStore(),
      brain: null,
    };
    p.arms = this.makeArms(p);
    if (p.bot) {
      if (!this.nav) this.nav = new NavGrid(this.world, 0.35, () => this.rng.next());
      p.brain = new BotBrain(this, p);
    }
    this.players[slot] = p;
    return slot;
  }

  makeArms(p) {
    return { weapons: p.loadout.map(createArm), slot: 0, readyT: 0 };
  }

  removePlayer(slot) {
    const p = this.players[slot];
    if (!p) return;
    // İstemciler ayrılanı oyuncu listesinden (S_ROSTER) öğrenir
    this.players[slot] = null;
  }

  setReady(slot) {
    const p = this.players[slot];
    if (p && !p.ready) {
      p.ready = true;
      p.respawnAt = this.tick;
    }
  }

  humans() {
    return this.players.filter((p) => p && !p.bot);
  }

  countSide(side, bot) {
    return this.players.filter((p) => p && p.side === side && p.bot === bot).length;
  }

  // Taraf modunda insanlar için boş yer: { side, free } (bot yerleri insana açılır)
  humanRoom(side) {
    const R = this.rules;
    if (!this.sided) return (R.max || MAX_SLOTS) - this.humans().length;
    if (!R.humanSides.includes(side)) return 0;
    return R.perSide[side] - this.countSide(side, false);
  }

  // Eksik oyuncuyu yapay zekâyla doldur, insan gelince bot çıkar (bots: 'fill')
  balanceBots() {
    const R = this.rules;
    if (R.bots !== 'fill' || this.phase === PHASE.ENDED) return;
    const want = this.sided ? R.perSide.map((n, s) => Math.max(0, n - this.countSide(s, false))) : [Math.max(0, (R.max || 0) - this.humans().length)];
    for (let s = 0; s < want.length; s++) {
      const side = this.sided ? s : SIDE.NONE;
      const bots = this.players.filter((p) => p && p.bot && p.side === side);
      for (let i = bots.length; i < want[s]; i++) this.addBot(side);
      // Fazla botlar: önce ölüler
      bots.sort((a, b) => Number(a.alive) - Number(b.alive));
      for (let i = 0; i < bots.length - want[s]; i++) this.removePlayer(bots[i].slot);
    }
  }

  addBot(side) {
    const name = BOTS.names[this.botSeq++ % BOTS.names.length];
    const primary = this.rng.pick(BOTS.weapons);
    return this.addPlayer({ bot: true, name, side, primary, secondary: BOTS.secondary });
  }

  // Ağdan gelen komutlar (en eskiden yeniye): tekrar gelenler (yedeklilik) atlanır
  queueCmds(slot, cmds) {
    const p = this.players[slot];
    if (!p) return;
    for (const c of cmds) {
      if (p.lastQueued !== null && !seqNewer(c.seq, p.lastQueued)) continue;
      p.lastQueued = c.seq;
      p.queue.push(c);
    }
    while (p.queue.length > ONLINE.queueMax) p.queue.shift();
  }

  emit(e, to = -1, except = -1) {
    e.to = to;
    e.except = except;
    this.events.push(e);
  }

  // --- Tick ---
  step() {
    this.tick++;
    this.events.length = 0;
    this.updatePhase();
    for (const p of this.players) {
      if (p && p.bot && p.brain) p.queue.push(p.brain.think(this, p));
    }
    for (const p of this.players) if (p) this.processQueue(p);
    for (const p of this.players) if (p) this.upkeep(p);
    for (const p of this.players) if (p) this.record(p);
  }

  updatePhase() {
    const R = this.rules;
    if (this.tick < this.phaseEnd) return;
    if (this.phase === PHASE.WARMUP) {
      this.setPhase(PHASE.LIVE, R.timeLimit ? SEC(R.timeLimit) : Infinity);
      this.scores[0] = this.scores[1] = 0;
      for (const p of this.players) {
        if (!p) continue;
        p.kills = p.deaths = p.score = 0;
        if (p.ready) this.spawn(p);
      }
      this.emit({ k: NEV.ROUND, code: 1, value: 0 });
    } else if (this.phase === PHASE.LIVE) this.endMatch(2);
    else if (this.phase === PHASE.ENDED) this.finished = true;
  }

  // reason: 1 skor sınırı, 2 süre, 3 oyuncu kalmadı
  endMatch(reason) {
    if (this.phase === PHASE.ENDED) return;
    let winner = SIDE.NONE;
    if (this.sided) winner = this.scores[0] > this.scores[1] ? 0 : this.scores[1] > this.scores[0] ? 1 : SIDE.NONE;
    else {
      const best = this.ranking()[0];
      winner = best ? best.slot : SLOT_NONE;
    }
    this.result = { winner, reason };
    this.setPhase(PHASE.ENDED, SEC(ONLINE.endScreenSec));
    this.emit({ k: NEV.ROUND, code: 2, value: reason });
  }

  ranking() {
    return this.players.filter(Boolean).sort((a, b) => b.kills - a.kills || b.score - a.score || a.deaths - b.deaths);
  }

  processQueue(p) {
    p.credit = Math.min(ONLINE.creditMax, p.credit + 1);
    p.bufDepth = p.queue.length;
    let budget = p.queue.length > 3 ? 2 : 1;
    while (budget > 0 && p.credit >= 1 && p.queue.length) {
      this.runCmd(p, p.queue.shift());
      p.credit--;
      budget--;
    }
  }

  // Geri sayım ve maç sonunda hareket ve atış yok (istemci de aynı kuralı uygular: frozen)
  get frozen() {
    return this.phase !== PHASE.LIVE;
  }

  runCmd(p, cmd) {
    p.lastSeq = cmd.seq;
    p.cmdT += TICK_DT;
    if (!p.alive) return;
    const frozen = this.frozen;
    if (frozen) {
      cmd.moveX = cmd.moveY = 0;
      // İstemcinin kısıt bitleri kalır: modlar tahminle aynı dolsun
      cmd.buttons &= BTN.CROUCH | BTN.ADS | BTN.NO_ADS | BTN.NO_SPRINT;
      cmd.shots.length = 0;
    }
    const a = p.arms;
    // Silah değiştirme: istemcide eski silah iner, yenisi kalkar; o süre atış yok
    if (cmd.slot !== a.slot && a.weapons[cmd.slot]) {
      const from = a.weapons[a.slot];
      from.reload = null;
      const to = a.weapons[cmd.slot];
      a.readyT = p.cmdT + (from.d.unequipTime * 0.8 + to.d.equipTime) * ONLINE.switchTolerance;
      a.slot = cmd.slot;
    }
    const w = a.weapons[a.slot];
    // Atış kredisi ve sapma toparlanması komut saatiyle (oyuncunun kendi zamanı)
    for (const x of a.weapons) x.credit = Math.min(x.creditCap, x.credit + TICK_DT / x.interval);
    recoverBloom(w, w.d, p.cmdT, TICK_DT);
    if (cmd.buttons & BTN.RELOAD) this.startReload(p, w);
    // Atışlar hareketten önce: istemci atışı önceki tick'in sonundaki konumdan yaptı
    for (let i = 0; i < cmd.shots.length; i++) this.fire(p, cmd, i);
    if (cmd.buttons & BTN.MELEE && !frozen) this.melee(p, cmd);
    applyCmdMods(p.state.mods, cmd.buttons, a.weapons[cmd.slot]?.d || w.d);
    stepPlayer(p.state, cmd, this.world, TICK_DT);
  }

  startReload(p, w) {
    const d = w.d;
    if (w.reload || w.reserve <= 0) return;
    const cap = d.magSize + (d.chamber && w.mag > 0 ? 1 : 0);
    if (w.mag >= cap) return;
    const tol = ONLINE.reloadTolerance;
    if (d.reloadType === 'shell') w.reload = { t0: p.cmdT, shell: true };
    else w.reload = { t0: p.cmdT, done: p.cmdT + (w.mag === 0 ? d.reloadEmpty : d.reloadTactical) * tol, cap };
    this.emit({ k: NEV.RELOAD, slot: p.slot }, -1, p.slot);
  }

  // Şarjör değiştirme bitti mi? Fişek fişek doldurmada o ana dek giren fişekler sayılır (atış kesintiye uğratır)
  settleReload(w, t) {
    const R = w.reload;
    if (!R) return;
    const d = w.d;
    const tol = ONLINE.reloadTolerance;
    if (R.shell) {
      const n = Math.floor((t - R.t0 - d.reloadStart * tol) / (d.reloadPerShell * tol));
      const take = Math.max(0, Math.min(n, d.magSize - w.mag, w.reserve));
      w.mag += take;
      w.reserve -= take;
    } else if (t >= R.done) {
      const take = Math.min(R.cap - w.mag, w.reserve);
      w.mag += take;
      w.reserve -= take;
    }
    w.reload = null;
  }

  fire(p, cmd, i) {
    const a = p.arms;
    const w = a.weapons[a.slot];
    const d = w.d;
    const t = p.cmdT;
    if (t < a.readyT || this.frozen) return false;
    this.settleReload(w, t);
    if (w.credit < ONLINE.fireTolerance || w.mag <= 0) return false;
    w.credit -= 1;
    w.mag--;
    p.protectUntil = 0; // ateş eden doğuş korumasını kaybeder
    p.lastShotTick = this.tick;
    recordShot(w, t);
    const st = p.state;
    const spread = spreadDeg(d.spread, w.bloom, st);
    this.shotRng.seed(hashSeed(this.secretSeed, p.uid, cmd.seq, i));
    const eye = this._eye;
    eye.x = st.pos.x;
    eye.y = st.pos.y + eyeHeight(st);
    eye.z = st.pos.z;
    const shot = cmd.shots[i];
    dirFromAngles(shot.yaw, shot.pitch, this._fwd);
    const rewind = p.bot ? null : cmd.viewTick;
    // Saçmalı silahta taneler aynı kurbana toplanır (tek isabet olayı)
    let hits = null;
    let first = null;
    for (let k = 0; k < d.pellets; k++) {
      pelletDir(this._fwd, d, spread, this.shotRng, this._dir);
      const r = this.trace(p, eye, this._dir, d.range, rewind);
      if (k === 0) first = { end: { ...r.point }, hit: r.victim ? HIT_KIND.FLESH : r.surface ? HIT_KIND.WORLD : HIT_KIND.NONE, surface: Math.max(0, SURFACES.indexOf(r.victim ? 'flesh' : r.surface || 'concrete')) };
      if (r.victim) {
        const dmg = d.damage * falloff(d, r.dist) * (d.zones[r.zone] || 1);
        hits = hits || new Map();
        const h = hits.get(r.victim) || { dmg: 0, head: false, point: { ...r.point } };
        h.dmg += dmg;
        if (r.zone === 'head') h.head = true;
        hits.set(r.victim, h);
      }
    }
    addBloom(w, d);
    this.emit({ k: NEV.SHOT, slot: p.slot, weapon: weaponIndex(w.id), end: first.end, hit: first.hit, surface: first.surface }, -1, p.slot);
    if (hits) for (const [victim, h] of hits) this.damage(victim, p, h.dmg, weaponIndex(w.id), h.head, h.point);
    return true;
  }

  // Işın: dünya, sonra rakiplerin (geri sarılmış) vuruş kutuları
  trace(shooter, o, dir, range, rewind) {
    const out = this._trace;
    const wh = this.world.raycast(o, dir, range, this._wh);
    let best = wh ? wh.dist : range;
    let victim = null;
    let zone = null;
    for (const q of this.players) {
      if (!q || q === shooter || !q.alive || this.friendly(q, shooter)) continue;
      const pose = this.poseAt(q, rewind);
      if (!pose) continue;
      // Kaba eleme: ışının oyuncu eksenine en yakın noktası 1,5 m'den uzaksa kutulara bakma
      const px = pose.pos.x - o.x;
      const pz = pose.pos.z - o.z;
      const along = px * dir.x + pz * dir.z;
      const hl = Math.hypot(dir.x, dir.z) || 1e-6;
      const tAlong = along / (hl * hl);
      if (tAlong < -1.5 || tAlong > best + 1.5) continue;
      const cx = o.x + dir.x * tAlong - pose.pos.x;
      const cz = o.z + dir.z * tAlong - pose.pos.z;
      if (cx * cx + cz * cz > 2.25) continue;
      hitboxesFor(pose, q.boxes);
      const h = rayHitboxes(o, dir, best, q.boxes, this._hh);
      if (h) {
        best = h.dist;
        victim = q;
        zone = h.zone;
      }
    }
    out.dist = best;
    out.victim = victim;
    out.zone = zone;
    out.surface = victim ? 'flesh' : wh && wh.dist <= best + 1e-6 ? wh.surface : null;
    out.point.x = o.x + dir.x * best;
    out.point.y = o.y + dir.y * best;
    out.point.z = o.z + dir.z * best;
    return out;
  }

  friendly(a, b) {
    return this.sided && a.side === b.side;
  }

  // Gecikme telafisi: oyuncunun gördüğü sunucu zamanına (tick, kesirli) geri sarılmış poz. rewind null → şimdi
  poseAt(q, rewind) {
    const pose = this._pose;
    const st = q.state;
    let src = null;
    if (rewind !== null && rewind !== undefined) {
      const t = Math.min(this.tick - 1, Math.max(this.tick - (ONLINE.maxRewindMs / 1000) * TICK_RATE, rewind));
      const t0 = Math.floor(t);
      const f = t - t0;
      const a = q.hist[((t0 % HIST) + HIST) % HIST];
      if (a.tick === t0) {
        if (!a.alive) return null;
        const b = q.hist[(((t0 + 1) % HIST) + HIST) % HIST];
        const k = b.tick === t0 + 1 && b.alive ? f : 0;
        pose.pos.x = a.x + (b.x - a.x) * k;
        pose.pos.y = a.y + (b.y - a.y) * k;
        pose.pos.z = a.z + (b.z - a.z) * k;
        let dy = b.yaw - a.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        pose.yaw = a.yaw + dy * k;
        pose.pitch = a.pitch + (b.pitch - a.pitch) * k;
        pose.height = a.height + (b.height - a.height) * k;
        src = a;
      }
    }
    if (!src) {
      pose.pos.x = st.pos.x;
      pose.pos.y = st.pos.y;
      pose.pos.z = st.pos.z;
      pose.yaw = st.yaw;
      pose.pitch = st.pitch;
      pose.height = st.height;
    }
    return pose;
  }

  record(p) {
    const h = p.hist[this.tick % HIST];
    const st = p.state;
    h.tick = this.tick;
    h.x = st.pos.x;
    h.y = st.pos.y;
    h.z = st.pos.z;
    h.yaw = st.yaw;
    h.pitch = st.pitch;
    h.height = st.height;
    h.alive = p.alive;
  }

  melee(p, cmd) {
    const MEL = ONLINE.melee;
    if (p.cmdT < p.meleeReadyT) return;
    p.meleeReadyT = p.cmdT + MEL.cooldown * ONLINE.fireTolerance;
    p.protectUntil = 0;
    const st = p.state;
    const eye = this._eye;
    eye.x = st.pos.x;
    eye.y = st.pos.y + eyeHeight(st);
    eye.z = st.pos.z;
    dirFromAngles(cmd.yaw, cmd.pitch, this._fwd);
    const cosCone = Math.cos((MEL.coneDeg * Math.PI) / 180);
    let best = null;
    let bestD = Infinity;
    const chest = { x: 0, y: 0, z: 0 };
    for (const q of this.players) {
      if (!q || q === p || !q.alive || this.friendly(q, p)) continue;
      const pose = this.poseAt(q, p.bot ? null : cmd.viewTick);
      if (!pose) continue;
      chest.x = pose.pos.x;
      chest.y = pose.pos.y + pose.height * 0.68;
      chest.z = pose.pos.z;
      const dx = chest.x - eye.x;
      const dy = chest.y - eye.y;
      const dz = chest.z - eye.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > MEL.range + 0.4 || dist >= bestD) continue;
      const cos = (dx * this._fwd.x + dy * this._fwd.y + dz * this._fwd.z) / (dist || 1);
      if (cos < cosCone && dist > 0.8) continue;
      if (!this.world.lineOfSight(eye, chest)) continue;
      best = q;
      bestD = dist;
    }
    this.emit({ k: NEV.MELEE, slot: p.slot }, -1, p.slot);
    if (best) this.damage(best, p, MEL.damage, WEAPON_MELEE, false, { x: best.state.pos.x, y: best.state.pos.y + 1.2, z: best.state.pos.z });
  }

  damage(victim, attacker, amount, weapon, head, point) {
    if (!victim.alive || this.frozen) return;
    const prot = this.tick < victim.protectUntil;
    const dealt = prot ? 0 : Math.min(victim.hp, amount);
    const killed = !prot && victim.hp - amount <= 0;
    // Atana isabet işareti (koruma altındaysa hasarsız işaret)
    this.emit({ k: NEV.HIT, victim: victim.slot, dmg: dealt, flags: (head ? 1 : 0) | (killed ? 2 : 0) | (prot ? 4 : 0), point }, attacker.slot);
    if (prot) return;
    victim.hp -= amount;
    victim.lastDamageTick = this.tick;
    this.emit({ k: NEV.DAMAGE, attacker: attacker.slot, dmg: dealt, from: { x: attacker.state.pos.x, y: 0, z: attacker.state.pos.z } }, victim.slot);
    victim.brain?.onDamaged(attacker);
    if (killed) this.kill(victim, attacker, weapon, head);
  }

  kill(victim, killer, weapon, head) {
    victim.alive = false;
    victim.hp = 0;
    victim.deaths++;
    victim.respawnAt = this.tick + SEC(this.rules.respawn);
    if (killer && killer !== victim) {
      killer.kills++;
      killer.score += 100 + (head ? 25 : 0);
      if (this.sided) this.scores[killer.side]++;
    }
    this.emit({ k: NEV.KILL, killer: killer ? killer.slot : SLOT_NONE, victim: victim.slot, weapon, flags: head ? 1 : 0 });
    const lim = this.rules.scoreLimit;
    if (lim && this.phase === PHASE.LIVE) {
      if (this.sided ? Math.max(...this.scores) >= lim : killer && killer.kills >= lim) this.endMatch(1);
    }
  }

  upkeep(p) {
    if (!p.alive) {
      if (p.ready && this.tick >= p.respawnAt && this.phase !== PHASE.ENDED) this.spawn(p);
      return;
    }
    if ((this.tick - p.lastDamageTick) * TICK_DT > ONLINE.regenDelay && p.hp < ONLINE.hp) p.hp = Math.min(ONLINE.hp, p.hp + ONLINE.regenRate * TICK_DT);
    // Harita dışına düşen (olmaması gerekir) yeniden doğar
    if (p.state.pos.y < -20) this.kill(p, null, WEAPON_NONE, false);
  }

  spawn(p) {
    const [x, z, yaw] = this.pickSpawn(p);
    const st = p.state;
    resetPlayerState(st);
    st.pos.x = x;
    st.pos.y = 0;
    st.pos.z = z;
    st.yaw = yaw;
    st.pitch = 0;
    p.alive = true;
    p.hp = ONLINE.hp;
    p.protectUntil = this.tick + SEC(ONLINE.protectSec);
    p.lastDamageTick = -1e9;
    p.arms = this.makeArms(p);
    p.meleeReadyT = 0;
    // Geçmiş yeni konumdan başlar: ölümden önceki pozlara ateş edilemez
    for (const h of p.hist) h.alive = false;
    this.emit({ k: NEV.SPAWN, slot: p.slot, pos: { x, y: 0, z }, yaw });
    p.brain?.onSpawn(this, p);
  }

  // Doğuş: kendi tarafının (ya da herkesin) noktalarından düşmana en uzak ve görüş dışında olanlardan biri
  pickSpawn(p) {
    const S = this.arena.spawns;
    const list = this.sided ? (p.side === 0 ? S.blue : S.red) : S.ffa;
    const foes = this.players.filter((q) => q && q !== p && q.alive && !this.friendly(q, p));
    const mates = this.players.filter((q) => q && q !== p && q.alive);
    const eyeA = { x: 0, y: 1.6, z: 0 };
    const eyeB = { x: 0, y: 1.6, z: 0 };
    const scored = list.map((s) => {
      let near = 60;
      let seen = 0;
      for (const f of foes) {
        const d = Math.hypot(f.state.pos.x - s[0], f.state.pos.z - s[1]);
        near = Math.min(near, d);
        eyeA.x = s[0];
        eyeA.z = s[1];
        eyeB.x = f.state.pos.x;
        eyeB.z = f.state.pos.z;
        if (d < 50 && this.world.lineOfSight(eyeA, eyeB)) seen++;
      }
      // Üst üste doğmasın
      let crowd = 0;
      for (const m of mates) if (Math.hypot(m.state.pos.x - s[0], m.state.pos.z - s[1]) < 1.5) crowd++;
      return { s, v: near - seen * 25 - crowd * 40 + this.rng.next() * 6 };
    });
    scored.sort((a, b) => b.v - a.v);
    return scored[0].s;
  }

  // --- Ağ görünümleri ---
  snapshotFor(slot) {
    const me = this.players[slot];
    const sided = this.sided;
    let scoreA = this.scores[0];
    let scoreB = this.scores[1];
    if (!sided) {
      // Herkes kendine: kendi öldürme sayın ve en iyi rakibinki
      scoreA = me ? me.kills : 0;
      scoreB = 0;
      for (const q of this.players) if (q && q !== me) scoreB = Math.max(scoreB, q.kills);
    }
    const players = [];
    for (const q of this.players) {
      if (!q || q === me) continue;
      const st = q.state;
      const w = q.arms.weapons[q.arms.slot];
      let flags = 0;
      if (q.alive) flags |= PF.ALIVE;
      if (st.grounded) flags |= PF.GROUNDED;
      if (st.crouched) flags |= PF.CROUCHED;
      if (st.sprinting) flags |= PF.SPRINTING;
      if (st.adsT > 0.5) flags |= PF.ADS;
      if (w.reload) flags |= PF.RELOADING;
      if (this.tick < q.protectUntil) flags |= PF.PROTECTED;
      if (this.tick - q.lastShotTick < 8) flags |= PF.FIRING;
      players.push({ slot: q.slot, flags, pos: st.pos, vel: st.vel, yaw: st.yaw, pitch: st.pitch, crouchT: st.crouchT, hp: q.hp, weapon: weaponIndex(w.id) });
    }
    return {
      tick: this.tick,
      ackSeq: me ? me.lastSeq : 0,
      bufDepth: me ? me.bufDepth : 0,
      tickUs: 0,
      phase: this.phase,
      phaseLeft: this.phaseLeft,
      scoreA,
      scoreB,
      me: me ? { alive: me.alive, protect: this.tick < me.protectUntil, hp: me.hp, respawnIn: me.alive ? 0 : Math.max(0, (me.respawnAt - this.tick) * TICK_DT), state: me.alive ? me.state : null } : { alive: false, hp: 0, respawnIn: 0, state: null },
      players,
      events: [],
    };
  }
}

export function falloff(d, dist) {
  const f = d.falloff;
  if (dist <= f.start) return 1;
  if (dist >= f.end) return f.min;
  return 1 + ((dist - f.start) / (f.end - f.start)) * (f.min - 1);
}
