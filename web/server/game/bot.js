// Sunucu botu (S6): eksik oyuncunun yerini alan yapay zekâ. İnsan oyuncu gibi her tick bir komut (InputCmd)
// üretir; hareket, atış doğrulaması ve isabet aynı yoldan geçer (sim.js), bot hile yapamaz.
//   - Algı: görüş açısı ve mesafesi içinde, duvar arkasında olmayan rakip; yakında ateş eden duyulur;
//     vurulunca saldırana döner.
//   - Tepki süresi, ilk nişanda sapma (zamanla oturur), dönüş hızı sınırı: beceri (rules.botSkill) belirler.
//   - Çatışmada yana kayar, uzaksa yaklaşır, çok yakınsa geri çekilir; seri atış + ara.
//   - Boşta gezinme noktalarına ya da rakiplerin bulunduğu bölgeye gider (yol: shared/sim/nav.js), takılırsa zıplar
//     ve yeni hedef seçer.
//   - Rekabetçi (sim.comp): raunt başında parasına göre silah ve bomba alır; saldırırken bombacı rauntun bölgesine
//     gidip kurar (E basılı, yerinde), diğerleri ona eşlik eder, yerdeki bombayı en yakını alır, kurulunca bombayı
//     korurlar; savunurken bölgelere dağılıp bekler, bomba kurulunca gidip imha eder. Çatışma her şeyin önünde.
//   - Kampanya Co-op'u (sim.coop): düşman evini (p.home: doğduğu yer ya da dalganın saldırdığı nokta) korur; gördüğünü
//     kovalar ama evinden ONLINE.coop.leash'ten öteye gitmez, evine yakın gelen oyuncunun bölgesine yürür, yoksa
//     evine döner. Alfa botu (p.follow) en yakın canlı insanın çevresinde kendi açısındaki yere yürür.
// Rastgelelik tohumlu (sim.secretSeed + yuva).
import { TICK_DT } from '../../shared/constants.js';
import { createInputCmd, BTN } from '../../shared/sim/movement.js';
import { Rng, hashSeed } from '../../shared/sim/rng.js';
import { lerp, clamp } from '../../shared/sim/math.js';
import BOTS from '../../src/data/bots.json' with { type: 'json' };
import { ONLINE } from '../../src/config.js';
import { createThrow } from '../../shared/sim/grenade.js';
import { BUY_ITEMS, BOMB, ACT, ROUND_STATE, COMP_RULES, actionFor } from '../../shared/sim/competitive.js';
import { PHASE } from '../../shared/net/protocol.js';
import { STREAKS, streakBits } from '../../shared/sim/streaks.js';

const DEG = Math.PI / 180;
// Co-op hedefi: yerinde bekle
const STAY = Object.freeze({ goal: null });

// El bombası nişanı: düz zeminde menzil → bakış eğimi tablosu (atışla aynı fizik, çarpışmasız); alçak yay seçilir
const NADE_TABLE = (() => {
  const N = ONLINE.nades;
  const out = [];
  for (let pitch = -0.2; pitch <= 0.9; pitch += 0.025) {
    const g = createThrow({ x: 0, y: 1.6, z: 0 }, 0, pitch, { x: 0, y: 0, z: 0 }, 0);
    let t = 0;
    while (t < 4 && !(g.vel.y < 0 && g.pos.y <= 0.1)) {
      g.vel.y -= N.gravity * TICK_DT;
      g.pos.x += g.vel.x * TICK_DT;
      g.pos.y += g.vel.y * TICK_DT;
      g.pos.z += g.vel.z * TICK_DT;
      t += TICK_DT;
    }
    out.push({ pitch, dist: Math.hypot(g.pos.x, g.pos.z) });
  }
  return out;
})();

function nadePitch(dist) {
  let best = NADE_TABLE[0];
  for (const e of NADE_TABLE) if (Math.abs(e.dist - dist) < Math.abs(best.dist - dist)) best = e;
  return best.pitch;
}
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const THINK_EVERY = 4; // algı her 4 tick'te (yuvaya göre kaydırılır)

// Beceri 0–1 → [kolay, zor] aralığında değer
function skillOf(k) {
  const S = BOTS.skill;
  const at = (pair) => lerp(pair[0], pair[1], k);
  const range = (pairs) => [lerp(pairs[0][0], pairs[1][0], k), lerp(pairs[0][1], pairs[1][1], k)];
  return {
    reaction: at(S.reactionSec),
    aimError: at(S.aimErrorDeg) * DEG,
    settle: at(S.aimSettleSec),
    turn: at(S.turnDegPerSec) * DEG,
    cone: at(S.fireConeDeg) * DEG,
    burst: range(S.burst),
    pause: range(S.burstPauseSec),
    view: at(S.viewDist),
    fov: at(S.fovDeg) * DEG,
  };
}

export class BotBrain {
  constructor(sim, p) {
    this.rng = new Rng(hashSeed(sim.secretSeed, 0xb07, p.slot));
    this.k = skillOf(clamp(sim.rules.botSkill ?? 0.5, 0, 1));
    this.cmd = createInputCmd();
    this.cmd.slot = 0;
    this.cmd.fireMode = 0;
    this.cmd.viewTick = 0;
    this.cmd.shots = [];
    this.reset(p);
  }

  reset(p) {
    this.target = null;
    this.seenT = -1;
    this.lostT = 0;
    this.reaction = 0;
    this.errYaw = 0;
    this.errPitch = 0;
    this.yaw = p.state.yaw;
    this.pitch = 0;
    this.path = null;
    this.pathIdx = 0;
    this.goal = null;
    this.repathAt = 0;
    this.strafe = this.rng.sign();
    this.strafeUntil = 0;
    this.crouch = false;
    this.burstLeft = 0;
    this.pauseUntil = 0;
    this.fireAcc = 0;
    this.reloadUntil = 0;
    this.lastKnown = null;
    this.seekUntil = 0;
    this.stuckT = 0;
    this.jump = false;
    this.alertYaw = null;
  }

  onSpawn(sim, p) {
    this.reset(p);
    this.cg = null;
    this.coopGoal = null;
    if (sim.comp && sim.phase === PHASE.BUY) this.compBuy(sim, p);
  }

  // Rekabetçi satın alma: ana silahı yoksa paranın yettiği en pahalı tercihli silah (yoksa yettiği en pahalısı);
  // artan parayla el bombası ve sis. Bir sonraki raunda da biraz para bırakır (tasarruf: ilk raunt yalnız bomba)
  compBuy(sim, p) {
    const C = sim.comp;
    if (!p.compPrimary) {
      const keep = 200;
      const ok = BUY_ITEMS.map((it, i) => ({ it, i })).filter(({ it }) => it.kind === 'weapon' && it.price + keep <= p.money);
      const pref = ok.filter(({ it }) => BOTS.weapons.includes(it.id));
      const pick = (pref.length ? pref : ok).at(-1);
      if (pick) C.buy(p, pick.i, []);
    }
    for (const kind of ['frag', 'smoke']) {
      const i = BUY_ITEMS.findIndex((it) => it.kind === kind);
      if (p.money >= BUY_ITEMS[i].price + 400) C.buy(p, i, []);
    }
  }

  // Rekabetçi hedefi: { goal } yürünecek yer ya da { use: true } yerinde E basılı (kur / imha et). Hedef nesnesi aynı
  // yer için aynı kalır (yol her tick yeniden aranmasın)
  compObjective(sim, p) {
    const C = sim.comp;
    if (C.state !== ROUND_STATE.LIVE) return null;
    const B = C.bomb;
    const st = p.state;
    const me = { slot: p.slot, side: p.side, alive: p.alive, x: st.pos.x, z: st.pos.z, grounded: st.grounded };
    const act = actionFor(me, { live: true, attackSide: C.attackSide, bomb: { state: B.state, carrier: B.carrier ? B.carrier.slot : 255, x: B.x, z: B.z }, sites: C.sites });
    // Kurma bölgenin ortasına yakın (kenarda kurulan bomba kolay imha edilir), imha bombanın dibinde
    if (act === ACT.DEFUSE) return { use: true };
    const site = C.sites[C.targetSite];
    if (act === ACT.PLANT && site && Math.hypot(st.pos.x - site[0], st.pos.z - site[1]) < site[2] * 0.6) return { use: true };
    // Yuvaya göre sabit dağılma (her bot başka yerde beklesin)
    const ang = p.slot * 2.39996;
    const off = (r) => ({ x: Math.cos(ang) * r, z: Math.sin(ang) * r });
    let g;
    if (p.side === C.attackSide) {
      if (B.state === BOMB.CARRIED && B.carrier === p) g = { x: site[0], z: site[1] };
      else if (B.state === BOMB.DROPPED) {
        // Yerdeki bombaya en yakın saldıran gider, diğerleri bölgeye
        let near = null;
        let nd = Infinity;
        for (const q of sim.players) {
          if (!q || !q.alive || q.side !== C.attackSide) continue;
          const d = Math.hypot(q.state.pos.x - B.x, q.state.pos.z - B.z);
          if (d < nd) {
            nd = d;
            near = q;
          }
        }
        if (near === p) g = { x: B.x, z: B.z };
      } else if (B.state === BOMB.PLANTED) {
        const o = off(6);
        g = { x: B.x + o.x, z: B.z + o.z };
      }
      if (!g && site) {
        const o = off(site[2] + 3);
        g = { x: site[0] + o.x, z: site[1] + o.z };
      }
    } else if (B.state === BOMB.PLANTED) {
      g = { x: B.x, z: B.z };
    } else {
      // Savunma: yuvanın çift/tekliğine göre bölge, çevresinde bekleme yeri
      const s2 = C.sites[p.slot % C.sites.length];
      if (s2) {
        const o = off(s2[2] + 2);
        g = { x: s2[0] + o.x, z: s2[1] + o.z };
      }
    }
    if (!g) return null;
    if (!this.cg || Math.abs(this.cg.x - g.x) > 0.5 || Math.abs(this.cg.z - g.z) > 0.5) this.cg = g;
    return { goal: this.cg };
  }

  // Kampanya Co-op'u hedefi: { goal, sprint? }; goal null: yerinde bekle (gezinmeye düşmez: muhafız evini bırakmaz).
  // Hedef nesnesi aynı yer için aynı kalır (yol her tick yeniden aranmasın)
  coopObjective(sim, p) {
    const C = ONLINE.coop;
    const st = p.state;
    const t = this.now;
    if (p.follow) {
      // En yakın canlı insan; çevresinde yuvaya göre dağılmış yer (üst üste yürümesinler)
      let lead = null;
      let ld = Infinity;
      for (const q of sim.players) {
        if (!q || q.bot || !q.alive || q.side !== p.side) continue;
        const d = Math.hypot(q.state.pos.x - st.pos.x, q.state.pos.z - st.pos.z);
        if (d < ld) {
          ld = d;
          lead = q;
        }
      }
      if (!lead) {
        const s = sim.coop.stageDef;
        return { goal: s ? this.keepGoal(s.pos[0], s.pos[1], 4) : null };
      }
      if (ld < C.followNear) return STAY;
      const a = (p.slot * 2.4) % (Math.PI * 2);
      return { goal: this.keepGoal(lead.state.pos.x + Math.cos(a) * C.followDist, lead.state.pos.z + Math.sin(a) * C.followDist, 2), sprint: C.followNear * 2 };
    }
    if (!p.home) return STAY;
    const h = p.home;
    // Az önce gördüğü rakibin son yeri (evinin yakınındaysa)
    if (this.lastKnown && t < this.seekUntil && Math.hypot(this.lastKnown.x - h.x, this.lastKnown.z - h.z) < C.leash) return { goal: this.lastKnown };
    // Evine yakın gelen insan: bölgesine yürür (kesin yer değil)
    for (const q of sim.players) {
      if (!q || !q.alive || q.side === p.side) continue;
      if (Math.hypot(q.state.pos.x - h.x, q.state.pos.z - h.z) < C.aggro) return { goal: this.keepGoal(q.state.pos.x, q.state.pos.z, 6) };
    }
    if (Math.hypot(st.pos.x - h.x, st.pos.z - h.z) < C.homeNear) return STAY;
    return { goal: this.keepGoal(h.x, h.z, 1) };
  }

  // Aynı yere yakın hedefte eski nesne kalır (followPath yeni nesnede yolu yeniden arar)
  keepGoal(x, z, tol) {
    const g = this.coopGoal;
    if (g && Math.hypot(g.x - x, g.z - z) < tol) return g;
    this.coopGoal = { x, z };
    return this.coopGoal;
  }

  onDamaged(attacker) {
    if (this.target) return;
    // Vurulduğu yöne döner ve oraya gider
    this.lastKnown = { x: attacker.state.pos.x, z: attacker.state.pos.z };
    this.alertYaw = Math.atan2(-(attacker.state.pos.x - this.px), -(attacker.state.pos.z - this.pz));
    this.seekUntil = this.now + BOTS.seekSec;
    this.goal = null;
  }

  think(sim, p) {
    const c = this.cmd;
    c.seq = (c.seq + 1) & 0xffff;
    c.buttons = 0;
    c.moveX = c.moveY = 0;
    c.shots.length = 0;
    c.viewTick = sim.tick;
    const t = sim.tick * TICK_DT;
    this.now = t;
    const st = p.state;
    this.px = st.pos.x;
    this.pz = st.pos.z;
    if (!p.alive) return c;
    const K = this.k;
    if ((sim.tick + p.slot) % THINK_EVERY === 0) this.perceive(sim, p, t);
    const tgt = this.target;
    const engaged = tgt && tgt.alive && this.seenT >= 0;
    // --- Nişan ---
    let wantYaw = this.yaw;
    let wantPitch = 0;
    let dist = 0;
    if (engaged) {
      const tp = tgt.state.pos;
      const aimY = tp.y + tgt.state.height * (this.headAim ? 0.9 : 0.7);
      const eyeY = st.pos.y + lerp(1.65, 1.02, st.crouchT);
      const dx = tp.x - st.pos.x;
      const dz = tp.z - st.pos.z;
      dist = Math.hypot(dx, dz);
      wantYaw = Math.atan2(-dx, -dz);
      wantPitch = Math.atan2(aimY - eyeY, dist);
      this.reaction -= TICK_DT;
      // Sapma zamanla oturur
      const decay = Math.exp(-TICK_DT / Math.max(0.05, K.settle / 3));
      this.errYaw *= decay;
      this.errPitch *= decay;
    } else if (this.alertYaw !== null) {
      wantYaw = this.alertYaw;
    } else if (this.moveDir) {
      wantYaw = Math.atan2(-this.moveDir.x, -this.moveDir.z);
    }
    const maxTurn = K.turn * TICK_DT * (engaged ? 1 : 0.6);
    const dy = wrap(wantYaw + (engaged ? this.errYaw : 0) - this.yaw);
    this.yaw = wrap(this.yaw + clamp(dy, -maxTurn, maxTurn));
    const dp = wantPitch + (engaged ? this.errPitch : 0) - this.pitch;
    this.pitch = clamp(this.pitch + clamp(dp, -maxTurn, maxTurn), -1.2, 1.2);
    if (this.alertYaw !== null && Math.abs(wrap(this.alertYaw - this.yaw)) < 0.1) this.alertYaw = null;
    c.yaw = this.yaw;
    c.pitch = this.pitch;

    // --- Atış ---
    const a = p.arms;
    const w = a.weapons[a.slot];
    if (engaged && this.reaction <= 0 && !sim.frozen) {
      const off = Math.hypot(wrap(wantYaw - this.yaw), wantPitch - this.pitch);
      const cone = K.cone * clamp(12 / Math.max(dist, 1), 0.6, 2);
      if (w.mag <= 0) {
        if (t > this.reloadUntil && w.reserve > 0 && !w.reload) {
          c.buttons |= BTN.RELOAD;
          this.reloadUntil = t + (w.d.reloadType === 'shell' ? w.d.reloadStart + w.d.reloadPerShell * w.d.magSize : w.d.reloadEmpty) + 0.1;
        }
      } else if (t >= this.reloadUntil && t >= this.pauseUntil && off < cone) {
        const interval = Math.max(w.interval, w.d.fireModes[0] === 'semi' ? 0.22 : 0);
        this.fireAcc += TICK_DT;
        if (this.burstLeft <= 0) this.burstLeft = Math.round(this.rng.range(K.burst[0], K.burst[1]));
        while (this.fireAcc >= interval && this.burstLeft > 0 && c.shots.length < 2 && w.mag - c.shots.length > 0) {
          this.fireAcc -= interval;
          c.shots.push({ yaw: this.yaw, pitch: this.pitch });
          this.burstLeft--;
        }
        if (this.burstLeft <= 0) {
          this.pauseUntil = t + this.rng.range(K.pause[0], K.pause[1]);
          this.fireAcc = 0;
        }
      } else this.fireAcc = Math.min(this.fireAcc, w.interval);
      // El bombası: uygun mesafedeki rakibe ara sıra (bu tick'in bakışı atış eğimi; iç nişan durumu bozulmaz)
      if (p.nadeCount[0] > 0 && t >= (this.nadeAt || 0) && dist >= BOTS.nadeDist[0] && dist <= BOTS.nadeDist[1] && this.rng.next() < BOTS.nadeChancePerSec * TICK_DT) {
        c.yaw = wantYaw + this.errYaw * 0.5;
        c.pitch = nadePitch(dist) + this.rng.range(-0.03, 0.03);
        c.shots.length = 0;
        c.buttons |= BTN.THROW_FRAG;
        this.nadeAt = t + BOTS.nadeCooldownSec;
      }
    } else if (!engaged && w.mag < w.d.magSize * 0.35 && w.reserve > 0 && !w.reload && t > this.reloadUntil) {
      c.buttons |= BTN.RELOAD;
      this.reloadUntil = t + (w.d.reloadEmpty || 2.5);
    }

    // --- Seri ödülü: hazır olanın en güçlüsü; hedef gördüğü ya da bildiği rakip (yoksa rastgele bir rakibin yeri) ---
    if (p.streakReady && sim.streaksOn && !sim.frozen && t >= (this.streakAt || 0) && !c.shots.length && !(c.buttons & (BTN.THROW_FRAG | BTN.THROW_SMOKE))) {
      this.useStreak(sim, p, c, tgt && tgt.alive ? tgt.state.pos : this.lastKnown);
      this.streakAt = t + BOTS.streakDelaySec;
    }

    // --- Hareket ---
    let dirX = 0;
    let dirZ = 0;
    let sprint = false;
    if (engaged) {
      if (t > this.strafeUntil) {
        this.strafe = this.rng.sign();
        this.strafeUntil = t + this.rng.range(BOTS.strafeSec[0], BOTS.strafeSec[1]);
        this.crouch = dist > 14 && this.rng.next() < BOTS.crouchChance;
      }
      // Yana kayma (bakış yönüne dik), uzaksa yaklaşma, çok yakınsa geri çekilme
      const fx = -Math.sin(this.yaw);
      const fz = -Math.cos(this.yaw);
      let fwd = dist > BOTS.engageMaxDist ? 1 : dist < BOTS.tooCloseDist ? -0.7 : 0;
      // Co-op düşmanı evinden uzaklaşmaz (gördüğüne oradan ateş eder)
      if (fwd > 0 && p.home && Math.hypot(st.pos.x - p.home.x, st.pos.z - p.home.z) > ONLINE.coop.leash) fwd = 0;
      if (fwd > 0 && this.followPath(sim, p, { x: tgt.state.pos.x, z: tgt.state.pos.z }, t)) {
        dirX = this.moveDir.x;
        dirZ = this.moveDir.z;
        fwd = 0;
      }
      dirX += fx * fwd + -fz * this.strafe * 0.8;
      dirZ += fz * fwd + fx * this.strafe * 0.8;
      if (this.crouch) c.buttons |= BTN.CROUCH;
    } else {
      // Rekabetçide / Co-op'ta görev hedefi (kurma/imha yerinde E basılı; Co-op'ta goal null: yerinde bekle); yoksa
      // boşta: hedef noktaya yürü (gerekirse koş)
      const obj = sim.frozen ? null : sim.comp ? this.compObjective(sim, p) : sim.coop ? this.coopObjective(sim, p) : null;
      if (obj && obj.use) c.buttons |= BTN.USE;
      else if (obj) {
        if (obj.goal && this.followPath(sim, p, obj.goal, t)) {
          dirX = this.moveDir.x;
          dirZ = this.moveDir.z;
          sprint = this.remaining > (obj.sprint ?? 8);
        }
      } else {
        if (!this.goal || t > this.seekUntil + 30) this.pickGoal(sim, p, t);
        if (this.followPath(sim, p, this.goal, t)) {
          dirX = this.moveDir.x;
          dirZ = this.moveDir.z;
          sprint = this.remaining > 8;
        } else this.goal = null;
      }
    }
    const len = Math.hypot(dirX, dirZ);
    if (len > 0.05) {
      dirX /= len;
      dirZ /= len;
      // Dünya yönü → komutun yerel ekseni (stepPlayer'ın tersi)
      const fx = -Math.sin(this.yaw);
      const fz = -Math.cos(this.yaw);
      c.moveY = clamp(dirX * fx + dirZ * fz, -1, 1);
      c.moveX = clamp(dirX * -fz + dirZ * fx, -1, 1);
      if (sprint && c.moveY > 0.7) c.buttons |= BTN.SPRINT;
      // Takılma: itiyor ama ilerlemiyorsa zıpla, sonra yeni hedef
      if (st.horizSpeed < 0.4 && st.grounded) {
        this.stuckT += TICK_DT;
        if (this.stuckT > BOTS.stuckSec) {
          c.buttons |= BTN.JUMP;
          this.stuckT = 0;
          this.goal = null;
          this.path = null;
        }
      } else this.stuckT = 0;
    }
    if (engaged && c.moveY > 0.35) c.moveY = 0.35; // çatışmada koşmaz
    return c;
  }

  // Seri ödülünü bu tick'in komutuyla kullan: bakış hedefin zeminine (istemci de nişangâhla aynı yolu izler)
  useStreak(sim, p, c, known) {
    let i = -1;
    for (let k = STREAKS.length - 1; k >= 0; k--) if (p.streakReady & (1 << k)) {
      i = k;
      break;
    }
    if (i < 0) return;
    let aim = known;
    if (!aim && STREAKS[i].range) {
      const foes = sim.players.filter((q) => q && q.alive && q !== p && !sim.friendly(q, p));
      if (!foes.length) return;
      aim = this.rng.pick(foes).state.pos;
    }
    if (aim) {
      const st = p.state;
      const dx = aim.x - st.pos.x;
      const dz = aim.z - st.pos.z;
      const d = Math.max(1, Math.hypot(dx, dz));
      if (STREAKS[i].range && d > STREAKS[i].range * 0.9) return;
      c.yaw = Math.atan2(-dx, -dz);
      c.pitch = Math.atan2(-lerp(1.65, 1.02, st.crouchT), d);
    }
    c.buttons |= streakBits(i);
  }

  // Görünür rakip: görüş açısı ve mesafesi içinde, duvar arkasında değil; yakında ateş eden duyulur
  perceive(sim, p, t) {
    const K = this.k;
    const st = p.state;
    const eye = { x: st.pos.x, y: st.pos.y + lerp(1.65, 1.02, st.crouchT), z: st.pos.z };
    const head = { x: 0, y: 0, z: 0 };
    let best = null;
    let bestD = Infinity;
    for (const q of sim.players) {
      if (!q || q === p || !q.alive || sim.friendly(q, p)) continue;
      const qp = q.state.pos;
      const dx = qp.x - st.pos.x;
      const dz = qp.z - st.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > K.view || d >= bestD) continue;
      const ang = Math.abs(wrap(Math.atan2(-dx, -dz) - this.yaw));
      const heard = d < BOTS.hearDist && sim.tick - q.lastShotTick < 64;
      if (ang > K.fov / 2 && !heard && d > 4 && q !== this.target) continue;
      head.x = qp.x;
      head.y = qp.y + q.state.height * 0.85;
      head.z = qp.z;
      // Sis bulutunun ardındaki rakip görülmez (sim.canSee)
      if (!sim.canSee(eye, head)) continue;
      best = q;
      bestD = d;
    }
    if (best) {
      if (best !== this.target || this.seenT < 0) {
        // Yeni hedef: tepki süresi ve ilk nişan sapması
        this.reaction = K.reaction + this.rng.range(0, 0.15);
        const e = K.aimError * clamp(bestD / 15, 0.6, 1.6);
        this.errYaw = this.rng.range(-e, e);
        this.errPitch = this.rng.range(-e * 0.5, e * 0.5);
        this.headAim = this.rng.next() < 0.2;
        this.burstLeft = 0;
      }
      this.target = best;
      this.seenT = t;
      this.lostT = 0;
      this.alertYaw = null;
      this.lastKnown = { x: best.state.pos.x, z: best.state.pos.z };
    } else if (this.target) {
      this.lostT += TICK_DT * THINK_EVERY;
      if (this.lostT > 0.6 || !this.target.alive) {
        if (this.target.alive) {
          this.lastKnown = { x: this.target.state.pos.x, z: this.target.state.pos.z };
          this.seekUntil = t + BOTS.seekSec;
          this.goal = this.lastKnown;
          this.path = null;
        }
        this.target = null;
        this.seenT = -1;
        this.crouch = false;
      }
    }
  }

  pickGoal(sim, p, t) {
    const st = p.state;
    if (this.lastKnown && t < this.seekUntil) {
      this.goal = this.lastKnown;
    } else if (this.rng.next() < 0.6) {
      // Avlan: rastgele bir rakibin bölgesine (kesin konum değil)
      const foes = sim.players.filter((q) => q && q.alive && q !== p && !sim.friendly(q, p));
      if (foes.length) {
        const f = this.rng.pick(foes);
        this.goal = { x: f.state.pos.x + this.rng.range(-6, 6), z: f.state.pos.z + this.rng.range(-6, 6) };
      }
    }
    if (!this.goal) {
      const hs = sim.arena.hotspots;
      let pick = this.rng.pick(hs);
      for (let i = 0; i < 3 && Math.hypot(pick[0] - st.pos.x, pick[1] - st.pos.z) < 8; i++) pick = this.rng.pick(hs);
      this.goal = { x: pick[0], z: pick[1] };
    }
    this.path = null;
    this.lastKnown = null;
  }

  // Yolu izle: bu tick'in yürüme yönü this.moveDir'e yazılır. Hedefe vardıysa false
  followPath(sim, p, goal, t) {
    const st = p.state;
    if (!goal) return false;
    if (Math.hypot(goal.x - st.pos.x, goal.z - st.pos.z) < 1.2) {
      this.path = null;
      return false;
    }
    if (!this.path || t > this.repathAt || this.pathGoal !== goal) {
      this.path = sim.nav.findPath(st.pos, { x: goal.x, y: 0, z: goal.z }, 6000);
      this.pathIdx = 0;
      this.pathGoal = goal;
      this.repathAt = t + BOTS.repathSec + this.rng.range(0, 0.4);
      if (!this.path || !this.path.length) {
        this.path = null;
        return false;
      }
    }
    let wp = this.path[this.pathIdx];
    while (wp && Math.hypot(wp.x - st.pos.x, wp.z - st.pos.z) < 0.8 && this.pathIdx < this.path.length - 1) wp = this.path[++this.pathIdx];
    if (!wp) return false;
    const dx = wp.x - st.pos.x;
    const dz = wp.z - st.pos.z;
    const l = Math.hypot(dx, dz) || 1;
    this.moveDir = this.moveDir || { x: 0, z: 0 };
    this.moveDir.x = dx / l;
    this.moveDir.z = dz / l;
    let rem = l;
    for (let i = this.pathIdx + 1; i < this.path.length; i++) rem += Math.hypot(this.path[i].x - this.path[i - 1].x, this.path[i].z - this.path[i - 1].z);
    this.remaining = rem;
    return true;
  }
}
