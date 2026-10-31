// Rekabetçi mod (bomba kur / imha et, raunt, ekonomi) sunucu kuralları. MatchSim kuralda `comp: true` görünce kurar
// ve kancalarını çağırır (updatePhase, runCmd, kill, upkeep, spawn, removePlayer, snapshotFor). Değerler ve saf
// koşullar shared/sim/competitive.js (istemci aynı koşulla hareketi durdurur, aynı listeden satın alır).
//   Raunt: BUY (satın alma, hareket yok: PHASE.BUY) → LIVE (roundSec; bomba kurulunca sayaç timerSec'e döner) →
//     ROUND_END (postSec) → sonraki raunt. Raunt içinde ölen doğmaz; herkes raunt başında kendi tarafının
//     doğuşunda doğar. Hayatta kalan silahını ve kullanmadığı bombalarını korur, ölen ana silahını kaybeder.
//   Taraflar: oyuncunun tarafı (mavi/kırmızı) maç boyunca aynı, rolü değişir. İlk yarı kırmızı saldırır; half
//     rauntu bitince roller değişir, para ve silahlar başa döner. Saldıranlar arenanın kırmızı doğuşlarında, savunanlar
//     mavi doğuşlarında (bölgeler mavi tarafa yakın: tools/make-arenas.mjs).
//   Bitiş: saldıranların hepsi öldü (bomba kurulmadıysa) ya da süre doldu → savunan; savunanların hepsi öldü ya da
//     bomba patladı → saldıran; bomba imha edildi → savunan. toWin raundu alan maçı kazanır; max raundda berabere.
import { NEV, PHASE, SIDE, SLOT_NONE, WEAPON_NONE, WEAPON_MELEE, WEAPON_FRAG } from '../../shared/net/protocol.js';
import { TICK_DT } from '../../shared/constants.js';
import { modsFromIndices } from '../../shared/sim/mods.js';
import { COMP_RULES as C, ROUND_STATE, ROUND_REASON, BOMB, ACT, BUY_ITEMS, actionFor, actionTime, killReward, roundReward, clampMoney, bombDamage, siteAt } from '../../shared/sim/competitive.js';

const SEC = (s) => Math.round(s / TICK_DT);

export class CompRules {
  constructor(sim) {
    this.sim = sim;
    const o = sim.rules.compOverrides || {};
    // Testler süreleri kısaltabilir (rooms.js → COMP_BUY / COMP_ROUND / COMP_BOMB)
    this.R = { ...C.rounds, ...(o.rounds || {}) };
    this.B = { ...C.bomb, ...(o.bomb || {}) };
    this.round = 0;
    this.attackSide = SIDE.RED;
    this.state = ROUND_STATE.BUY;
    this.winner = SIDE.NONE;
    this.reason = ROUND_REASON.NONE;
    this.lossStreak = [0, 0];
    this.targetSite = 0; // saldıran botların bu rauntta gittiği bölge
    this.bomb = { state: BOMB.NONE, carrier: null, x: 0, y: 0, z: 0, site: -1, plantTick: 0 };
    this.pendingEnd = false;
    this.sites = sim.arena.sites || [];
  }

  get live() {
    return this.sim.phase === PHASE.LIVE && this.state === ROUND_STATE.LIVE;
  }

  // Oyuncuya rekabetçi alanları (addPlayer)
  initPlayer(p) {
    p.money = C.money.start;
    p.compPrimary = null; // satın alınan ana silah (yoksa yalnız tabanca)
    p.compMods = null;
    p.compNades = [0, 0];
    p.useT = 0;
    p.useKind = ACT.NONE;
  }

  // Elde olacak silahlar: [ana?, tabanca] (istemci aynı sırayı kurar: NEV.LOADOUT)
  armsIds(p) {
    return p.compPrimary ? [p.compPrimary, p.loadout[1]] : [p.loadout[1]];
  }

  armsMods(p) {
    return p.compPrimary ? [p.compMods, p.mods[1]] : [p.mods[1]];
  }

  // Doğuş: rol tarafının noktaları (saldıran kırmızı, savunan mavi)
  spawnList(p) {
    const S = this.sim.arena.spawns;
    return p.side === this.attackSide ? S.red : S.blue;
  }

  // --- Evreler ---
  // Isınma bitti ya da raunt sonu doldu (MatchSim.updatePhase)
  onPhaseEnd() {
    const sim = this.sim;
    if (sim.phase === PHASE.WARMUP) {
      sim.scores[0] = sim.scores[1] = 0;
      for (const p of sim.players) if (p) p.kills = p.deaths = p.score = 0;
      sim.emit({ k: NEV.ROUND, code: 1, value: 0 });
      this.startRound();
    } else if (sim.phase === PHASE.BUY) {
      this.state = ROUND_STATE.LIVE;
      sim.setPhase(PHASE.LIVE, SEC(this.R.roundSec));
      this.emitState();
    } else if (sim.phase === PHASE.LIVE) {
      // Süre doldu: bomba kuruluysa patlar, değilse savunan kazanır
      if (this.bomb.state === BOMB.PLANTED) this.explode();
      else this.endRound(this.defendSide, ROUND_REASON.TIME);
    } else if (sim.phase === PHASE.ROUND_END) {
      if (this.pendingEnd) sim.endMatch(1);
      else this.startRound();
    } else if (sim.phase === PHASE.ENDED) sim.finished = true;
  }

  get defendSide() {
    return this.attackSide === SIDE.RED ? SIDE.BLUE : SIDE.RED;
  }

  startRound() {
    const sim = this.sim;
    this.round++;
    // İkinci yarı: roller değişir, para ve silahlar başa döner
    const half = this.round === this.R.half + 1;
    if (half) this.attackSide = this.defendSide;
    // Hayatta kalan silahını ve atmadığı bombaları korur, ölen ana silahını kaybeder
    for (const p of sim.players) {
      if (!p) continue;
      if (p.alive) {
        p.compNades[0] = p.nadeCount[0];
        p.compNades[1] = p.nadeCount[1];
      } else {
        p.compPrimary = null;
        p.compMods = null;
        p.compNades[0] = p.compNades[1] = 0;
      }
    }
    if (this.round === 1 || half) {
      this.lossStreak[0] = this.lossStreak[1] = 0;
      for (const p of sim.players) {
        if (!p) continue;
        p.money = C.money.start;
        p.compPrimary = null;
        p.compMods = null;
        p.compNades[0] = p.compNades[1] = 0;
      }
    }
    this.state = ROUND_STATE.BUY;
    this.winner = SIDE.NONE;
    this.reason = ROUND_REASON.NONE;
    sim.nades.length = 0;
    sim.smokes.length = 0;
    this.targetSite = this.sites.length ? Math.floor(sim.rng.next() * this.sites.length) % this.sites.length : 0;
    sim.setPhase(PHASE.BUY, SEC(this.R.buySec));
    // Herkes kendi rol tarafının doğuşunda
    for (const p of sim.players) if (p && p.ready) sim.spawn(p);
    this.giveBomb();
    this.emitState();
  }

  // Bomba saldıran takımdan rastgele birine (tohumlu)
  giveBomb() {
    const sim = this.sim;
    const att = sim.players.filter((p) => p && p.alive && p.side === this.attackSide);
    const B = this.bomb;
    B.site = -1;
    if (!att.length) {
      B.state = BOMB.NONE;
      B.carrier = null;
    } else {
      B.state = BOMB.CARRIED;
      B.carrier = att[Math.floor(sim.rng.next() * att.length) % att.length];
      B.x = B.carrier.state.pos.x;
      B.y = B.carrier.state.pos.y;
      B.z = B.carrier.state.pos.z;
    }
    this.emitBomb();
  }

  endRound(winner, reason) {
    const sim = this.sim;
    if (this.state === ROUND_STATE.POST) return;
    this.state = ROUND_STATE.POST;
    this.winner = winner;
    this.reason = reason;
    if (winner !== SIDE.NONE) sim.scores[winner]++;
    const loser = winner === SIDE.RED ? SIDE.BLUE : SIDE.RED;
    if (winner !== SIDE.NONE) {
      this.lossStreak[winner] = 0;
      this.lossStreak[loser]++;
    }
    const planted = this.bomb.state === BOMB.PLANTED || this.bomb.state === BOMB.EXPLODED || this.bomb.state === BOMB.DEFUSED;
    for (const p of sim.players) {
      if (!p) continue;
      let add = roundReward(p.side === winner, this.lossStreak[p.side]);
      // Bomba kurulup kaybedilen raunt: saldıranlara ek
      if (p.side !== winner && p.side === this.attackSide && planted) add += C.money.plantedLoss;
      p.money = clampMoney(p.money + add);
      p.useT = 0;
      p.useKind = ACT.NONE;
    }
    // Maç bitti mi: toWin ya da son raunt (berabere)
    if (sim.scores[0] >= this.R.toWin || sim.scores[1] >= this.R.toWin || this.round >= this.R.max) this.pendingEnd = true;
    sim.setPhase(PHASE.ROUND_END, SEC(this.R.postSec));
    this.emitState();
  }

  // --- Her tick (MatchSim.step, komutlardan sonra) ---
  update() {
    if (!this.live) return;
    const sim = this.sim;
    const B = this.bomb;
    if (B.state === BOMB.CARRIED && B.carrier) {
      const st = B.carrier.state;
      B.x = st.pos.x;
      B.y = st.pos.y;
      B.z = st.pos.z;
    } else if (B.state === BOMB.DROPPED) {
      // Yerdeki bombayı yanından geçen saldıran alır
      for (const p of sim.players) {
        if (!p || !p.alive || p.side !== this.attackSide) continue;
        if (Math.hypot(p.state.pos.x - B.x, p.state.pos.z - B.z) <= this.B.pickupDist && Math.abs(p.state.pos.y - B.y) < 1.5) {
          B.state = BOMB.CARRIED;
          B.carrier = p;
          this.emitBomb();
          break;
        }
      }
    }
    this.checkElimination();
  }

  checkElimination() {
    if (!this.live || this.exploding) return;
    const sim = this.sim;
    let att = 0;
    let def = 0;
    for (const p of sim.players) {
      if (!p || !p.alive) continue;
      if (p.side === this.attackSide) att++;
      else def++;
    }
    if (def === 0) this.endRound(this.attackSide, ROUND_REASON.ELIM);
    else if (att === 0 && this.bomb.state !== BOMB.PLANTED) this.endRound(this.defendSide, ROUND_REASON.ELIM);
  }

  // --- Komut (MatchSim.runCmd): E basılıyken kurma / imha ilerler; koşul bozulursa ya da hızlanırsa başa döner ---
  onCmd(p, cmd, use) {
    const st = p.state;
    const B = this.bomb;
    const act = use
      ? actionFor(
          { slot: p.slot, side: p.side, alive: p.alive, x: st.pos.x, z: st.pos.z, grounded: st.grounded },
          { live: this.live, attackSide: this.attackSide, bomb: { state: B.state, carrier: B.carrier ? B.carrier.slot : SLOT_NONE, x: B.x, z: B.z }, sites: this.sites }
        )
      : ACT.NONE;
    if (act === ACT.NONE || act !== p.useKind || st.horizSpeed > this.B.maxSpeed) {
      p.useT = 0;
      p.useKind = act;
      if (act === ACT.NONE || st.horizSpeed > this.B.maxSpeed) return;
    }
    p.useT += TICK_DT;
    if (p.useT < this.actTime(act)) return;
    p.useT = 0;
    p.useKind = ACT.NONE;
    if (act === ACT.PLANT) this.plant(p);
    else this.defuse(p);
  }

  actTime(act) {
    return act === ACT.PLANT ? this.B.plantSec : act === ACT.DEFUSE ? this.B.defuseSec : actionTime(act);
  }

  plant(p) {
    const sim = this.sim;
    const B = this.bomb;
    const st = p.state;
    B.state = BOMB.PLANTED;
    B.carrier = null;
    B.x = st.pos.x;
    B.y = st.pos.y;
    B.z = st.pos.z;
    B.site = siteAt(this.sites, st.pos.x, st.pos.z);
    B.plantTick = sim.tick;
    p.money = clampMoney(p.money + C.money.plant);
    p.score += 50;
    // Sayaç bomba süresine döner (arayüzdeki süre artık bombanın)
    sim.setPhase(PHASE.LIVE, SEC(this.B.timerSec));
    this.emitBomb(p.slot);
  }

  defuse(p) {
    const B = this.bomb;
    B.state = BOMB.DEFUSED;
    p.money = clampMoney(p.money + C.money.defuse);
    p.score += 50;
    this.emitBomb(p.slot);
    this.endRound(this.defendSide, ROUND_REASON.DEFUSE);
  }

  explode() {
    const sim = this.sim;
    const B = this.bomb;
    B.state = BOMB.EXPLODED;
    this.emitBomb();
    // Patlamada ölen saldıran yok etme sayılıp raundu savunana vermesin
    this.exploding = true;
    // Büyük patlama: yarıçap içindeki herkes (duvar kesmez), öldürme kimseye yazılmaz
    for (const q of sim.players) {
      if (!q || !q.alive) continue;
      const d = Math.hypot(q.state.pos.x - B.x, q.state.pos.y - B.y, q.state.pos.z - B.z);
      const dmg = bombDamage(d);
      if (dmg > 0) sim.damage(q, null, dmg, WEAPON_NONE, false, { x: q.state.pos.x, y: q.state.pos.y + 1, z: q.state.pos.z }, { x: B.x, y: B.y, z: B.z });
    }
    this.exploding = false;
    this.endRound(this.attackSide, ROUND_REASON.BOMB);
  }

  // --- MatchSim kancaları ---
  // Öldürme: para, bomba yere düşer, raunt bitti mi
  onKill(victim, killer, weapon) {
    const B = this.bomb;
    victim.useT = 0;
    victim.useKind = ACT.NONE;
    if (B.state === BOMB.CARRIED && B.carrier === victim) this.dropBomb(victim);
    if (killer && killer !== victim && killer.side !== victim.side) {
      const how = weapon === WEAPON_MELEE ? 'melee' : weapon === WEAPON_FRAG ? 'frag' : '';
      const id = killer.arms.weapons[killer.arms.slot]?.id;
      killer.money = clampMoney(killer.money + killReward(id, how));
    }
    this.checkElimination();
  }

  dropBomb(p) {
    const B = this.bomb;
    B.state = BOMB.DROPPED;
    B.carrier = null;
    B.x = p.state.pos.x;
    B.y = Math.max(0, p.state.pos.y);
    B.z = p.state.pos.z;
    this.emitBomb(p.slot);
  }

  onRemove(p) {
    if (this.bomb.state === BOMB.CARRIED && this.bomb.carrier === p) this.dropBomb(p);
  }

  // Raunt içinde doğuş yok; ısınmada ya da satın alma evresinde gelen (yeni katılan) hemen doğar
  canSpawn() {
    return this.sim.phase === PHASE.BUY || this.sim.phase === PHASE.WARMUP;
  }

  // --- Satın alma (C_BUY): yalnız satın alma evresinde, canlıyken ---
  buy(p, index, mods) {
    const sim = this.sim;
    const it = BUY_ITEMS[index];
    if (!it || !p || !p.alive || sim.phase !== PHASE.BUY) return false;
    if (p.money < it.price) return false;
    if (it.kind === 'weapon') {
      if (p.compPrimary === it.id) return false;
      p.compPrimary = it.id;
      p.compMods = modsFromIndices(it.id, mods);
    } else {
      const k = it.kind === 'frag' ? 0 : 1;
      if (p.compNades[k] >= C.nades[it.kind]) return false;
      p.compNades[k]++;
    }
    p.money -= it.price;
    sim.equipComp(p, it.kind === 'weapon' ? 0 : -1);
    return true;
  }

  // --- Ağ ---
  // Tick içinde olay bu tick'in sırasına (raunt durumu doğuştan önce gelsin), ileti işlenirken sonraki tick'e
  push(e, to) {
    const sim = this.sim;
    if (sim.inTick) sim.emit(e, to);
    else {
      e.to = to;
      e.except = -1;
      sim.lateEvents.push(e);
    }
  }

  emitState(to = -1) {
    this.push({ k: NEV.ROUND_STATE, round: this.round, state: this.state, attackSide: this.attackSide, winner: this.winner, reason: this.reason }, to);
  }

  emitBomb(actor = SLOT_NONE, to = -1) {
    const B = this.bomb;
    this.push({ k: NEV.BOMB, state: B.state, slot: B.carrier ? B.carrier.slot : actor, site: B.site < 0 ? 255 : B.site, pos: { x: B.x, y: B.y, z: B.z } }, to);
  }

  // Yeni katılana bütün durum
  sendStateTo(slot) {
    this.emitState(slot);
    this.emitBomb(SLOT_NONE, slot);
  }

  // Anlık görüntünün yerel alanı
  meView(p) {
    return { money: p.money, act: p.useKind, actProgress: p.useKind ? Math.min(1, p.useT / this.actTime(p.useKind)) : 0 };
  }
}
