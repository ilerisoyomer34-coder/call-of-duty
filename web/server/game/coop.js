// Kampanya Co-op'u (kullanıcı isteği "çevrim içini baya geliştir" → Kampanya Co-op): takım (en çok 4 insan, eksikler
// Alfa Timi botları) bir seviyenin görevlerini sırayla yapar. Aşamalar src/data/coop.json (tools/make-coop.mjs,
// görev haritasının kendi verisinden): clear (grubu temizle), hold (hedefin dibinde E basılı: C4 / istihbarat),
// reach (noktaya var), defend (noktada süre boyunca dalgalara dayan). Düşmanlar sunucu botları: aşama başlayınca
// aşamanın yerinde doğar, evlerini korur (gördüğüne saldırır, kaybedince evine döner), yeniden doğmaz; aynı anda en
// çok ONLINE.coop.maxEnemies canlı (yuva sınırı), ölenin cesedi corpseSec sonra kalkar. İnsan ölürse rules.respawn sn
// sonra son toplanma noktasında doğar. Son aşama bitince görev tamam; süre dolarsa başarısız.
// MatchSim kuralda `coop: true` görünce kurar (kancalar: updatePhase → onLive, runCmd → onCmd, kill → onKill,
// pickSpawn → spawnPoint, step → update, balanceBots → balanceTeam, endMatch → onEnd, snapshotFor → meView).
// Saf koşul shared/sim/coop.js (istemci aynı koşulla hareketi durdurur).
import { NEV, PHASE, SIDE } from '../../shared/net/protocol.js';
import { TICK_DT } from '../../shared/constants.js';
import { COOP_LEVELS, COOP_STATE, holdTarget, ACT_HOLD } from '../../shared/sim/coop.js';
import { ONLINE } from '../../src/config.js';
import BOTS from '../../src/data/bots.json' with { type: 'json' };
import SQUAD from '../../src/data/squad.json' with { type: 'json' };

const SEC = (s) => Math.round(s / TICK_DT);
// Düşman türü → bot silahı (sunucu botları insan gibi aynı silahları kullanır)
const ENEMY_WEAPON = { rifleman: 'ak74', shotgunner: 'shotgun', heavy: 'lmg', sniper: 'sniper' };
const ENEMY_NAMES = ['Muhafız', 'Nöbetçi', 'Asker', 'Keskin', 'Ağır', 'Devriye'];

export class CoopRules {
  constructor(sim) {
    this.sim = sim;
    const id = String(sim.rules.level || 1);
    this.levelId = id;
    this.L = COOP_LEVELS[id] || COOP_LEVELS[Object.keys(COOP_LEVELS)[0]];
    this.C = ONLINE.coop;
    this.stage = -1;
    this.success = false;
    this.done = []; // hold hedeflerinin bitenleri (bit)
    this.queue = []; // doğmayı bekleyen düşmanlar [{ e, stage }]
    this.corpses = []; // { p, at } kaldırılacak düşman cesetleri
    this.rally = this.L.start.map(([x, z, yaw]) => [x, z, yaw]);
    this.defendEnd = 0;
    this.waveAt = 0;
    this.waveIdx = 0;
    this.seq = 0;
    this.lastLeft = -1;
    this.spawned = new Set(); // doğmuş aşama düşmanları ("aşama:x:z"): önden doğan sonraki aşamada yeniden sıraya girmez
  }

  // Biten aşama sayısı (skor çubuğu: biten / toplam)
  get stagesDone() {
    return this.success ? this.L.stages.length : Math.max(0, this.stage);
  }

  get stageDef() {
    return this.L.stages[this.stage] || null;
  }

  get live() {
    return this.sim.phase === PHASE.LIVE && this.stage >= 0 && !this.success;
  }

  initPlayer(p) {
    p.useT = 0;
    p.useKind = 0;
  }

  // Isınma bitti: takım başlangıçta, Alfa botları eksik yerleri doldurur, ilk aşama başlar (MatchSim.updatePhase'ten)
  onLive() {
    this.startStage(0);
    this.balanceTeam();
  }

  // Takım teamSize kişi: insan eksikse Alfa botu (tim adlarıyla), insan gelince bot çıkar (önce ölüler). Isınmada
  // yalnız insanlar (teçhizat paneli); oda kurulurken, oyuncu katılınca/ayrılınca ve maç başlarken çağrılır
  balanceTeam() {
    const sim = this.sim;
    if (this.stage < 0 || sim.phase === PHASE.ENDED) return;
    const team = sim.players.filter((p) => p && p.side === SIDE.BLUE);
    const humans = team.filter((p) => !p.bot).length;
    const alfa = team.filter((p) => p.bot && p.follow);
    const want = Math.max(0, this.C.teamSize - humans);
    const used = new Set(alfa.map((p) => p.name));
    const names = SQUAD.members.map((m) => m.name);
    for (let i = alfa.length; i < want; i++) {
      const name = names.find((n) => !used.has(n)) || names[i % names.length];
      used.add(name);
      const k = names.indexOf(name);
      const slot = sim.addPlayer({ bot: true, name, side: SIDE.BLUE, primary: BOTS.weapons[k % BOTS.weapons.length], secondary: BOTS.secondary });
      if (slot < 0) break;
      sim.players[slot].follow = true;
    }
    alfa.sort((a, b) => Number(a.alive) - Number(b.alive));
    for (let i = 0; i < alfa.length - want; i++) sim.removePlayer(alfa[i].slot);
  }

  // Maç bitti (MatchSim.endMatch): görev tamamsa takım kazanır; değilse (süre doldu) görev başarısız
  onEnd() {
    if (!this.success) this.emit(COOP_STATE.FAILED);
    return this.success ? SIDE.BLUE : SIDE.RED;
  }

  startStage(i) {
    const sim = this.sim;
    this.stage = i;
    this.done.length = 0;
    const st = this.stageDef;
    // Aşamanın düşmanları sıraya (sonraki aşamanınkiler de önden: ilerideki mevzi boş durmasın)
    for (const e of st.enemies) this.queue.push({ e, stage: i });
    const next = this.L.stages[i + 1];
    if (next && st.type !== 'defend') for (const e of next.enemies) this.queue.push({ e, stage: i + 1 });
    // Aynı düşman iki kez sıraya girmesin (önden eklenenler)
    const seen = new Set();
    this.queue = this.queue.filter((q) => {
      const k = `${q.stage}:${q.e[0]}:${q.e[1]}`;
      if (seen.has(k) || this.spawned.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (st.type === 'defend') {
      this.defendEnd = sim.tick + SEC(st.sec);
      this.waveAt = sim.tick;
      this.waveIdx = 0;
    }
    this.emit(COOP_STATE.ACTIVE);
  }

  // Aşama bitti: toplanma noktası oraya taşınır, sonraki aşama ya da görev tamam
  finishStage() {
    const sim = this.sim;
    const st = this.stageDef;
    this.emit(COOP_STATE.DONE);
    // Ölen insanlar aşamanın yerinde doğsun (ileri atılan takım geriye yürümesin)
    const [x, z] = st.pos;
    this.rally = [0, 1, 2, 3, 4, 5].map((k) => [x + Math.cos(k * 1.05) * 2.5, z + Math.sin(k * 1.05) * 2.5, 0]);
    if (st.final) {
      this.success = true;
      this.emit(COOP_STATE.COMPLETE);
      sim.endMatch(1);
      return;
    }
    this.startStage(this.stage + 1);
  }

  // --- Her tick ---
  update() {
    const sim = this.sim;
    // Cesetler kalkar (yuva boşalır)
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const c = this.corpses[i];
      if (sim.tick < c.at) continue;
      this.corpses.splice(i, 1);
      if (sim.players[c.p.slot] === c.p) sim.removePlayer(c.p.slot);
    }
    if (!this.live) return;
    this.retireStale();
    this.spawnQueued();
    const st = this.stageDef;
    if (st.type === 'defend') this.updateDefend(st);
    if (this.stageComplete(st)) this.finishStage();
  }

  // Yuva ve sınır elverdikçe sıradaki düşmanlar doğar; bir yuva hep boş kalır (katılan insan Alfa botunun yerini
  // almadan önce eklenir)
  spawnQueued() {
    const sim = this.sim;
    let alive = 0;
    let free = 0;
    for (const p of sim.players) {
      if (!p) free++;
      else if (p.coopEnemy && p.alive) alive++;
    }
    while (this.queue.length && alive < this.C.maxEnemies && free > 1) {
      free--;
      const { e, stage, home } = this.queue.shift();
      if (this.addEnemy(e, stage, home)) alive++;
      else break;
    }
  }

  // Sınır doluyken sırada bu aşamanın düşmanı varsa geride kalmış (önceki aşamanın, hiçbir insana yakın olmayan)
  // bir düşman kalkar: uzaktaki eski muhafızlar yeni aşamanın düşmanlarını bekletmesin
  retireStale() {
    const sim = this.sim;
    if (!(sim.tick % 32 === 0) || !this.queue.some((q) => q.stage === this.stage)) return;
    let alive = 0;
    for (const p of sim.players) if (p && p.coopEnemy && p.alive) alive++;
    if (alive < this.C.maxEnemies) return;
    for (const p of sim.players) {
      if (!p || !p.coopEnemy || !p.alive || p.stage >= this.stage) continue;
      const near = sim.players.some((q) => q && !q.bot && q.alive && Math.hypot(q.state.pos.x - p.state.pos.x, q.state.pos.z - p.state.pos.z) < this.C.retireDist);
      if (near) continue;
      sim.removePlayer(p.slot);
      return;
    }
  }

  addEnemy(e, stage, home = null) {
    const sim = this.sim;
    const [x, z, yaw, type] = e;
    const name = `${ENEMY_NAMES[this.seq++ % ENEMY_NAMES.length]}`;
    const slot = sim.addPlayer({ bot: true, name, side: SIDE.RED, primary: ENEMY_WEAPON[type] || 'ak74', secondary: BOTS.secondary });
    if (slot < 0) return false;
    const p = sim.players[slot];
    p.coopEnemy = true;
    p.stage = stage;
    p.spawnAt = [x, z, yaw];
    p.home = home || { x, z };
    if (!home) this.spawned.add(`${stage}:${x}:${z}`);
    sim.setReady(slot);
    sim.spawn(p);
    return true;
  }

  updateDefend(st) {
    const sim = this.sim;
    const elapsed = (sim.tick - this.waveAt) * TICK_DT;
    while (this.waveIdx < st.waves.length && elapsed >= st.waves[this.waveIdx].t) {
      // Dalga birimleri iniş bölgesine saldırır (evleri savunulan nokta)
      for (const u of st.waves[this.waveIdx].units) this.queue.push({ e: u, stage: this.stage, home: { x: st.pos[0], z: st.pos[1] } });
      this.waveIdx++;
    }
    // Kalan süre saniyede bir (arayüzün sayacı)
    const l = this.left();
    if (l !== this.lastLeft) {
      this.lastLeft = l;
      this.emit(COOP_STATE.ACTIVE);
    }
  }

  stageComplete(st) {
    const sim = this.sim;
    if (st.type === 'clear') {
      if (this.queue.some((q) => q.stage === this.stage)) return false;
      return !sim.players.some((p) => p && p.coopEnemy && p.alive && p.stage === this.stage);
    }
    if (st.type === 'hold') return st.targets.every((_, k) => this.done[k]);
    if (st.type === 'reach') return sim.players.some((p) => p && !p.bot && p.alive && Math.hypot(p.state.pos.x - st.pos[0], p.state.pos.z - st.pos[1]) <= st.r);
    if (st.type === 'defend') return sim.tick >= this.defendEnd;
    return false;
  }

  // --- Komut: hold aşamasında hedefin dibinde E basılı (yerinde) ---
  onCmd(p, cmd, use) {
    const st = this.stageDef;
    const k = use && this.live && !p.bot ? holdTarget(st, this.done, p.state.pos.x, p.state.pos.z, p.state.grounded) : -1;
    if (k < 0 || p.state.horizSpeed > this.C.holdMaxSpeed || k !== p.holdK) {
      p.useT = 0;
      p.useKind = k < 0 ? 0 : ACT_HOLD;
      p.holdK = k;
      if (k < 0 || p.state.horizSpeed > this.C.holdMaxSpeed) return;
    }
    p.useT += TICK_DT;
    if (p.useT < st.holdSec) return;
    p.useT = 0;
    p.useKind = 0;
    this.done[k] = true;
    p.score += 100;
    this.emit(COOP_STATE.ACTIVE);
  }

  // --- MatchSim kancaları ---
  onKill(victim) {
    victim.useT = 0;
    victim.useKind = 0;
    if (victim.coopEnemy) {
      victim.respawnAt = Infinity;
      this.corpses.push({ p: victim, at: this.sim.tick + SEC(ONLINE.corpseSec) });
      if (this.live) this.emit(COOP_STATE.ACTIVE);
    }
  }

  spawnPoint(p) {
    if (p.spawnAt) return p.spawnAt;
    const list = this.rally;
    // Üst üste doğmasın: o anda canlı takım arkadaşından en uzak toplanma noktası
    const sim = this.sim;
    let best = list[0];
    let bd = -1;
    for (const s of list) {
      let near = 99;
      for (const q of sim.players) if (q && q !== p && q.alive && q.side === p.side) near = Math.min(near, Math.hypot(q.state.pos.x - s[0], q.state.pos.z - s[1]));
      if (near > bd) {
        bd = near;
        best = s;
      }
    }
    return best;
  }

  // Aşamada kalan (clear: düşman, hold: hedef)
  left() {
    const st = this.stageDef;
    if (!st) return 0;
    if (st.type === 'clear') return this.queue.filter((q) => q.stage === this.stage).length + this.sim.players.filter((p) => p && p.coopEnemy && p.alive && p.stage === this.stage).length;
    if (st.type === 'hold') return st.targets.filter((_, k) => !this.done[k]).length;
    if (st.type === 'defend') return Math.max(0, Math.ceil((this.defendEnd - this.sim.tick) * TICK_DT));
    return 0;
  }

  emit(state, to = -1) {
    const sim = this.sim;
    let mask = 0;
    this.done.forEach((d, k) => d && (mask |= 1 << k));
    const e = { k: NEV.COOP, stage: Math.max(0, this.stage), state, left: Math.min(255, this.left()), mask };
    if (sim.inTick) sim.emit(e, to);
    else sim.lateEvents.push({ ...e, to, except: -1 });
  }

  sendStateTo(slot) {
    if (this.stage >= 0) this.emit(this.success ? COOP_STATE.COMPLETE : COOP_STATE.ACTIVE, slot);
  }

  meView(p) {
    const st = this.stageDef;
    return { act: p.useKind || 0, actProgress: p.useKind && st?.holdSec ? Math.min(1, p.useT / st.holdSec) : 0 };
  }
}
