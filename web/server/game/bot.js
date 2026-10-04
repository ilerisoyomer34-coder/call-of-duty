// Sunucu botu (S6): eksik oyuncunun yerini alan yapay zekâ. İnsan oyuncu gibi her tick bir komut (InputCmd)
// üretir; hareket, atış doğrulaması ve isabet aynı yoldan geçer (sim.js), bot hile yapamaz.
//   - Algı: görüş açısı ve mesafesi içinde, duvar arkasında olmayan rakip; yakında ateş eden duyulur;
//     vurulunca saldırana döner.
//   - Tepki süresi, ilk nişanda sapma (zamanla oturur), dönüş hızı sınırı: beceri (rules.botSkill) belirler.
//   - Çatışmada yana kayar, uzaksa yaklaşır, çok yakınsa geri çekilir; seri atış + ara.
//   - Boşta gezinme noktalarına ya da rakiplerin bulunduğu bölgeye gider (yol: shared/sim/nav.js), takılırsa zıplar
//     ve yeni hedef seçer.
// Rastgelelik tohumlu (sim.secretSeed + yuva).
import { TICK_DT } from '../../shared/constants.js';
import { createInputCmd, BTN } from '../../shared/sim/movement.js';
import { Rng, hashSeed } from '../../shared/sim/rng.js';
import { lerp, clamp } from '../../shared/sim/math.js';
import BOTS from '../../src/data/bots.json' with { type: 'json' };

const DEG = Math.PI / 180;
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
    } else if (!engaged && w.mag < w.d.magSize * 0.35 && w.reserve > 0 && !w.reload && t > this.reloadUntil) {
      c.buttons |= BTN.RELOAD;
      this.reloadUntil = t + (w.d.reloadEmpty || 2.5);
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
      if (fwd > 0 && this.followPath(sim, p, { x: tgt.state.pos.x, z: tgt.state.pos.z }, t)) {
        dirX = this.moveDir.x;
        dirZ = this.moveDir.z;
        fwd = 0;
      }
      dirX += fx * fwd + -fz * this.strafe * 0.8;
      dirZ += fz * fwd + fx * this.strafe * 0.8;
      if (this.crouch) c.buttons |= BTN.CROUCH;
    } else {
      // Boşta: hedef noktaya yürü (gerekirse koş)
      if (!this.goal || t > this.seekUntil + 30) this.pickGoal(sim, p, t);
      if (this.followPath(sim, p, this.goal, t)) {
        dirX = this.moveDir.x;
        dirZ = this.moveDir.z;
        sprint = this.remaining > 8;
      } else this.goal = null;
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
      if (!sim.world.lineOfSight(eye, head)) continue;
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
