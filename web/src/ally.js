// Dost askerler: oyuncunun mavi mangası (UE5'te AShooterAlly + AIController karşılığı).
// Oyuncuyu gevşek bir düzende izler. Silahlar serbest kalınca (bir düşman çatışmaya girdi, oyuncu ateş
// etti ya da manga vuruldu) düzen yerinin yakınında siper alır ve görünen en yakın düşmana kısa seriler
// atar. Sessiz ilerlerken ateş açmaz: oyuncunun gizliliğini bozmasın diye.
// Vurulan dost kalıcı ölmez; bir süre yaralı kalıp toparlanır. Böylece seviye dengesi dostların
// kaybına bağlanmaz. Düşmanlar dostları da hedef alır (enemy.js → foe); oyuncunun mermisi dostu yaralamaz.
import * as THREE from 'three';
import { ALLY } from './config.js';
import { createSoldier } from './soldier.js';
import { Health } from './health.js';
import { DEG, clamp, damp, dampAngle, angleDiff, dirToYaw, rand, randomInCone, pick } from './util.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _d = new THREE.Vector3();
const _hit = {};
const _ray = new THREE.Raycaster();
// Görünüm katmanına her karede aktarılan durum (bellek ayırmamak için tek nesne)
const ANIM = { pos: null, yaw: 0, vel: null, crouch: false, aimPitch: 0, stance: 'relaxed', reload: -1, throw: -1, dist: 0 };

const LINES = {
  contact: ['Temas! Düşman görüldü.', 'Hedef görüldü, ateş ediyorum!', 'İleride düşman var!'],
  reload: ['Şarjör değiştiriyorum!', 'Şarjör! Beni koruyun.'],
  kill: ['Düştü!', 'Bir düşman eksik.', 'Hedef etkisiz.'],
  down: ['Vuruldum! Biraz zaman lazım.', 'Yaralandım, yere düştüm!'],
  up: ['Toparlandım, devam ediyorum.', 'Tamam, yine çatışmadayım.'],
  friendly: ['Dikkat Kartal-1, bana ateş etme!', 'Dost ateşi! Nişanını kaldır!'],
};

export class Ally {
  constructor(game, index, pos, yaw) {
    this.game = game;
    this.index = index;
    this.name = ALLY.names[index] || `Kartal-${index + 2}`;
    this.isPlayer = false;
    this.model = createSoldier('ally', ALLY.colors);
    game.scene.add(this.model.root);
    this.pos = new THREE.Vector3().copy(pos);
    this.vel = new THREE.Vector3();
    this.state = { pos: this.pos, vel: this.vel, radius: 0.36, height: 1.8, grounded: true, gravity: 15, hitWall: false };
    this.health = new Health(ALLY.hp, 0);
    this.weapon = { mag: ALLY.magSize, cooldown: 0, burstLeft: 0, gapT: 0, reloadT: 0 };
    this.slotGoal = new THREE.Vector3();
    this.lastPos = new THREE.Vector3();
    this.pathGoal = new THREE.Vector3(Infinity, 0, 0);
    this.reset(pos, yaw);
  }

  reset(pos, yaw) {
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.health.reset();
    this.down = false;
    this.downT = 0;
    this.lastHurt = -100;
    this.target = null;
    this.targetVisible = false;
    this.lastSeenT = -100;
    this.reactT = 0;
    this.thinkT = Math.random() * ALLY.thinkInterval;
    this.cover = null;
    this.coverT = 0;
    this.path = null;
    this.pathIdx = 0;
    this.repathT = 0;
    this.slotT = 0;
    this.stuckT = 0;
    this.stuckN = 0;
    this.detour = null;
    this.detourUntil = 0;
    this.lastPos.copy(pos);
    this.run = false;
    this.crouch = false;
    this.aimPitch = 0;
    this.sayT = rand(2, 5);
    this.weapon.mag = ALLY.magSize;
    this.weapon.reloadT = 0;
    this.weapon.burstLeft = 0;
    this.model.reset(this.pos, yaw);
  }

  // --- Düşmanın gördüğü hedef arayüzü (Player ile aynı) ---
  get alive() {
    return !this.down;
  }
  get grounded() {
    return true;
  }
  get crouched() {
    return this.crouch;
  }
  get horizSpeed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }
  get sprinting() {
    return this.run && this.horizSpeed > 3.5;
  }
  headPos(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + (this.crouch ? 1.15 : 1.62), this.pos.z);
  }
  chestPos(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + (this.crouch ? 0.95 : 1.3), this.pos.z);
  }

  takeDamage(amount, fromPos = null) {
    if (this.down) return;
    const g = this.game;
    this.lastHurt = g.time;
    this.health.damage(amount);
    this.model.hit('torso');
    // Görmediği yerden vurulduysa o yöne döner
    if (fromPos && !this.targetVisible) this.threatYaw = dirToYaw(fromPos.x - this.pos.x, fromPos.z - this.pos.z);
    if (this.health.dead) {
      this.down = true;
      this.downT = ALLY.downTime;
      this.target = null;
      this.releaseCover();
      this.say('down', true);
      g.events.emit('allyDown', this);
    }
  }

  // Oyuncunun mermisi değdi: hasar yok, uyarı var
  onFriendlyFire() {
    this.say('friendly', true);
  }

  // Telsiz: her dost ve tüm manga için ayrı bekleme süresi (ekranı doldurmasın)
  say(kind, force = false) {
    const g = this.game;
    const M = g.allies;
    if (!force && (this.sayT > 0 || M.sayT > 0)) return;
    this.sayT = rand(7, 11);
    M.sayT = 3.5;
    g.mission?.radio(this.name, pick(LINES[kind]), 0, 'ally');
  }

  // Oyuncuya göre düzen yeri (sağa, geriye); yürünemiyorsa yakındaki boş nokta
  slotPos(out) {
    const g = this.game;
    const P = g.player;
    const [ox, oz] = ALLY.slots[this.index % ALLY.slots.length];
    const c = Math.cos(P.yaw);
    const s = Math.sin(P.yaw);
    out.set(P.pos.x + c * ox + s * oz, P.pos.y, P.pos.z - s * ox + c * oz);
    if (!g.nav.isWalkable(out.x, out.z)) {
      const alt = g.nav.randomPointNear(out, 3);
      out.copy(alt || P.pos);
    }
    return out;
  }

  update(dt) {
    const g = this.game;
    const P = g.player;
    this.sayT -= dt;
    if (this.down) {
      this.downT -= dt;
      this.vel.x = damp(this.vel.x, 0, 10, dt);
      this.vel.z = damp(this.vel.z, 0, 10, dt);
      this.crouch = true;
      if (this.downT <= 0) {
        this.down = false;
        this.health.hp = ALLY.hp * ALLY.reviveHp;
        this.say('up', true);
      }
      g.world.moveCharacter(this.state, dt, 0.45);
      this.animate(dt, 'relaxed');
      return;
    }
    if (g.time - this.lastHurt > ALLY.regenDelay) this.health.heal(ALLY.regenRate * dt);

    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT += ALLY.thinkInterval;
      this.perceive();
    }
    const weaponsFree = g.allies.weaponsFree || g.time - this.lastHurt < 6;

    // Hedef: çatışmada düzen yerinin yakınındaki siper, değilse düzen yeri
    this.slotT -= dt;
    if (this.slotT <= 0) {
      this.slotT = 0.4;
      this.slotPos(this.slotGoal);
    }
    let goal = this.slotGoal;
    if (weaponsFree && this.target) {
      this.coverT -= dt;
      if (this.coverT <= 0) {
        this.coverT = rand(2, 3.5);
        this.pickCover();
      }
      if (this.cover) goal = this.cover.pos;
    } else this.releaseCover();
    // Oyuncunun nişan hattındaysa kenara çekil
    if (this.inFireLane()) {
      const c = Math.cos(P.yaw);
      const s = Math.sin(P.yaw);
      const side = (this.pos.x - P.pos.x) * c - (this.pos.z - P.pos.z) * s >= 0 ? 1 : -1;
      _v.set(this.pos.x + c * 2.2 * side, this.pos.y, this.pos.z - s * 2.2 * side);
      if (g.nav.isWalkable(_v.x, _v.z)) goal = _v;
    }

    // Çok geride kaldıysa (ör. kontrol noktası, dar geçit) oyuncunun görmediği anda yanına al
    const dP = this.pos.distanceTo(P.pos);
    if (dP > ALLY.teleportDist && P.alive) {
      _d.subVectors(this.slotGoal, P.pos).normalize();
      const fx = -Math.sin(P.yaw);
      const fz = -Math.cos(P.yaw);
      if (_d.x * fx + _d.z * fz < 0.2) {
        this.pos.copy(this.slotGoal);
        this.path = null;
      }
    }

    let dist = Math.hypot(goal.x - this.pos.x, goal.z - this.pos.z);
    this.updateStuck(dt, dist);
    if (this.detour && g.time < this.detourUntil) {
      goal = this.detour;
      dist = Math.hypot(goal.x - this.pos.x, goal.z - this.pos.z);
    } else this.detour = null;
    this.crouch = false;
    if (dist > 0.9) {
      // Oyuncunun hızına uy: geride kalınca açığı kapatacak kadar hızlan
      const speed = clamp(P.horizSpeed * 1.1 + (dist - 1) * 0.35, ALLY.walk, ALLY.run);
      this.run = speed > ALLY.walk + 1;
      this.followPath(goal, dt, speed);
    } else {
      this.path = null;
      this.vel.x = damp(this.vel.x, 0, 8, dt);
      this.vel.z = damp(this.vel.z, 0, 8, dt);
      // Siperde şarjör değiştirirken çömel
      if (this.cover && this.weapon.reloadT > 0) this.crouch = true;
    }

    // Bakış: hedef → hareket yönü → oyuncunun baktığı yön
    let face;
    if (this.target && this.targetVisible) face = dirToYaw(this.target.pos.x - this.pos.x, this.target.pos.z - this.pos.z);
    else if (this.threatYaw != null && g.time - this.lastHurt < 3) face = this.threatYaw;
    else if (this.horizSpeed > 0.4) face = dirToYaw(this.vel.x, this.vel.z);
    else face = P.yaw;
    this.yaw = dampAngle(this.yaw, face, this.targetVisible ? 8 : 4, dt);

    this.updateWeapon(dt, weaponsFree);
    // Diğer dostlarla ve oyuncuyla iç içe girme
    for (const o of g.allies.list) {
      if (o === this) continue;
      const dx = this.pos.x - o.pos.x;
      const dz = this.pos.z - o.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 0.8 && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        this.vel.x += (dx / d) * (0.9 - d) * 5;
        this.vel.z += (dz / d) * (0.9 - d) * 5;
      }
    }
    g.world.moveCharacter(this.state, dt, 0.45);
    let stance = 'relaxed';
    if (this.target && weaponsFree) stance = this.targetVisible ? 'aim' : 'ready';
    else if (g.allies.alert) stance = 'ready';
    this.animate(dt, stance);
  }

  animate(dt, stance) {
    let aim = 0;
    if (this.target && this.targetVisible) {
      const e = this.headPos(_v);
      const h = this.target.chestPos(_v2);
      aim = Math.atan2(h.y - e.y, Math.hypot(h.x - e.x, h.z - e.z));
    }
    this.aimPitch = damp(this.aimPitch, clamp(aim, -0.7, 0.7), 8, dt);
    const W = this.weapon;
    ANIM.pos = this.pos;
    ANIM.yaw = this.yaw;
    ANIM.vel = this.vel;
    ANIM.crouch = this.crouch;
    ANIM.aimPitch = this.aimPitch;
    ANIM.stance = stance;
    ANIM.reload = W.reloadT > 0 ? 1 - W.reloadT / ALLY.reload : -1;
    ANIM.dist = this.pos.distanceTo(this.game.player.pos);
    this.model.animate(dt, ANIM);
  }

  // Takılma: engele sıkışan dost önce yakındaki boş bir noktaya sapar; yine ilerleyemezse oyuncunun
  // görmediği anda düzen yerine alınır (manga geride kalmasın)
  updateStuck(dt, dist) {
    const g = this.game;
    this.stuckT += dt;
    if (this.stuckT < ALLY.stuckCheck) return;
    const moved = Math.hypot(this.pos.x - this.lastPos.x, this.pos.z - this.lastPos.z);
    if (dist > 1.5 && moved < ALLY.stuckMove) {
      this.stuckN++;
      this.path = null;
      this.repathT = 0;
      if (this.stuckN >= 2 && !this.seenByPlayer()) {
        this.pos.copy(this.slotGoal);
        this.stuckN = 0;
      } else {
        const alt = g.nav.randomPointNear(this.pos, 2.5);
        if (alt) {
          this.detour = alt;
          this.detourUntil = g.time + 1;
        }
      }
    } else this.stuckN = 0;
    this.stuckT = 0;
    this.lastPos.copy(this.pos);
  }

  // Oyuncu bu dostu şu an görüyor mu (önünde ve arada engel yok)?
  seenByPlayer() {
    const g = this.game;
    const P = g.player;
    const dx = this.pos.x - P.pos.x;
    const dz = this.pos.z - P.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    if ((dx * -Math.sin(P.yaw) + dz * -Math.cos(P.yaw)) / d < 0.3) return false;
    return g.world.lineOfSight(P.headPos(_v2), this.chestPos(_v3));
  }

  // Görünen en yakın düşman (mevcut hedef önce sınanır; en fazla üç görüş testi)
  perceive() {
    const g = this.game;
    const eye = this.headPos(_v);
    let best = null;
    let bestD = ALLY.viewRange;
    let tests = 0;
    const T = this.target;
    if (T && T.alive && eye.distanceTo(T.pos) < ALLY.viewRange && g.world.lineOfSight(eye, T.chestPos(_v2))) {
      best = T;
      bestD = eye.distanceTo(T.pos) * 0.8; // hedef değiştirmek için belirgin biçimde daha yakın biri gerekir
      tests++;
    }
    for (const e of g.enemies.list) {
      if (!e.alive || e.dummy || e === T) continue;
      const d = eye.distanceTo(e.pos);
      if (d >= bestD) continue;
      if (tests >= 3) break;
      tests++;
      if (g.world.lineOfSight(eye, e.chestPos(_v2))) {
        best = e;
        bestD = d;
      }
    }
    if (best) {
      if (best !== this.target) {
        this.reactT = ALLY.reaction * rand(0.8, 1.3);
        if (!this.target && g.allies.weaponsFree) this.say('contact');
      }
      this.target = best;
      this.targetVisible = true;
      this.lastSeenT = g.time;
    } else {
      this.targetVisible = false;
      if (this.target && (!this.target.alive || g.time - this.lastSeenT > ALLY.loseTargetTime)) this.target = null;
    }
  }

  // Düzen yerinin yakınında, düşmana dönük ve saklanınca görünmeyen siper
  pickCover() {
    const g = this.game;
    const T = this.target;
    if (!T) return;
    const cands = g.nav.coversNear(this.slotGoal, 7);
    let best = null;
    let bestScore = -Infinity;
    let evals = 0;
    const head = T.eyePos(_v3);
    for (const c of cands) {
      if (c.taken && c.taken !== this) continue;
      const tx = T.pos.x - c.pos.x;
      const tz = T.pos.z - c.pos.z;
      const dT = Math.hypot(tx, tz);
      if (dT < 5 || (c.normal.x * tx + c.normal.z * tz) / dT < 0.3) continue;
      // Geriye çekilmesin: siper hedefe düzen yerinden daha uzak olmamalı
      if (dT > Math.hypot(T.pos.x - this.slotGoal.x, T.pos.z - this.slotGoal.z) + 1) continue;
      if (evals++ > 6) break;
      _v2.set(c.pos.x, 1.6, c.pos.z);
      if (!g.world.lineOfSight(_v2, head)) continue; // ayağa kalkınca hedefi görmeli
      const score = -c.pos.distanceTo(this.slotGoal) - c.pos.distanceTo(this.pos) * 0.3;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (best !== this.cover) {
      this.releaseCover();
      if (best) {
        this.cover = best;
        best.taken = this;
        this.path = null;
      }
    }
  }

  releaseCover() {
    if (this.cover && this.cover.taken === this) this.cover.taken = null;
    this.cover = null;
  }

  // Oyuncunun önünde, nişan konisinin içinde mi?
  inFireLane() {
    const P = this.game.player;
    const dx = this.pos.x - P.pos.x;
    const dz = this.pos.z - P.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 1 || d > 25) return false;
    const fx = -Math.sin(P.yaw);
    const fz = -Math.cos(P.yaw);
    return (dx * fx + dz * fz) / d > Math.cos(ALLY.fireLaneDeg * DEG);
  }

  followPath(goal, dt, speed) {
    const g = this.game;
    this.repathT -= dt;
    if (!this.path || (this.repathT <= 0 && this.pathGoal.distanceToSquared(goal) > 2.25)) {
      if (g.enemies.requestPath()) {
        this.path = g.nav.findPath(this.pos, goal);
        this.pathIdx = 0;
        this.pathGoal.copy(goal);
        this.repathT = 0.8;
      }
    }
    let wp = null;
    if (this.path && this.path.length) {
      wp = this.path[this.pathIdx];
      while (wp && Math.hypot(wp.x - this.pos.x, wp.z - this.pos.z) < 0.6) {
        this.pathIdx++;
        wp = this.path[this.pathIdx];
      }
      if (!wp) {
        // Yolun sonu ama hedef (oyuncu yürüdükçe) ilerlemiş: hemen yeni yol iste
        this.path = null;
        this.repathT = 0;
      }
    }
    // Yol yoksa (bütçe, yakın hedef) doğrudan yürü
    const t = wp || goal;
    const dx = t.x - this.pos.x;
    const dz = t.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    const s = d < 0.3 ? 0 : Math.min(speed, d * 4);
    this.vel.x = damp(this.vel.x, d > 1e-4 ? (dx / d) * s : 0, 8, dt);
    this.vel.z = damp(this.vel.z, d > 1e-4 ? (dz / d) * s : 0, 8, dt);
  }

  updateWeapon(dt, weaponsFree) {
    const g = this.game;
    const W = this.weapon;
    W.cooldown -= dt;
    this.reactT -= dt;
    if (W.reloadT > 0) {
      W.reloadT -= dt;
      if (W.reloadT <= 0) W.mag = ALLY.magSize;
      return;
    }
    if (W.mag <= 0) {
      W.reloadT = ALLY.reload;
      g.audio.mech('magOut', this.pos);
      if (this.target) this.say('reload');
      return;
    }
    const T = this.target;
    if (!weaponsFree || !T || !this.targetVisible || this.reactT > 0) {
      W.burstLeft = 0;
      return;
    }
    const facing = Math.abs(angleDiff(this.yaw, dirToYaw(T.pos.x - this.pos.x, T.pos.z - this.pos.z))) < 0.35;
    if (!facing) return;
    if (W.burstLeft <= 0) {
      W.gapT -= dt;
      if (W.gapT <= 0) {
        W.burstLeft = Math.round(rand(ALLY.burst[0], ALLY.burst[1]));
        W.gapT = rand(ALLY.burstGap[0], ALLY.burstGap[1]);
      }
    }
    let n = 0;
    while (W.burstLeft > 0 && W.cooldown <= 0 && W.mag > 0 && n < 3) {
      this.shoot(T);
      W.burstLeft--;
      W.mag--;
      W.cooldown += 60 / ALLY.rpm;
      n++;
    }
    if (W.cooldown < -0.2) W.cooldown = 0;
  }

  shoot(T) {
    const g = this.game;
    g.allies.shots++;
    const muzzle = this.model.muzzleWorld(_v).clone();
    const aim = Math.random() < 0.2 ? T.eyePos(_v2) : T.chestPos(_v2);
    const base = _d.subVectors(aim, muzzle);
    const dist = base.length();
    base.divideScalar(dist);
    const err = ALLY.aimDeg * (0.6 + dist / 40) * (this.horizSpeed > 1 ? 1.5 : 1);
    const dir = randomInCone(base, err * DEG, new THREE.Vector3(), 0.8);
    const wh = g.world.raycast(muzzle, dir, ALLY.range, _hit);
    const eh = g.enemies.raycast(muzzle, dir, wh ? wh.dist : ALLY.range);
    let end;
    if (eh && eh.enemy.alive) {
      const lvl = g.level?.allyDamage ?? 1;
      const dmg = ALLY.damage * (ALLY.zones[eh.zone] || 1) * lvl;
      const out = eh.enemy.takeDamage(dmg, { zone: eh.zone, dir, point: eh.point, source: 'ally', attacker: this, weapon: 'allyRifle' });
      g.effects.impact(eh.point, _v3.copy(dir).negate(), 'flesh', 0.5);
      if (out.killed) {
        g.events.emit('allyKill', this, eh.enemy);
        this.say('kill');
      }
      end = eh.point;
    } else if (wh) {
      if (muzzle.distanceTo(g.camera.position) < 90) g.effects.impact(wh.point, wh.normal, wh.surface, 0.5);
      if (wh.collider?.owner?.onShot) wh.collider.owner.onShot(ALLY.damage, wh.point);
      end = wh.point;
    } else end = _v3.copy(muzzle).addScaledVector(dir, 80);
    if (Math.random() < 0.5) g.effects.tracer(muzzle, end, 320, 0.018);
    if (muzzle.distanceTo(g.camera.position) < 80) {
      g.effects.enemyMuzzle(muzzle, dir);
      g.effects.flashLight(muzzle, 0xffc070, 14, 5, 0.04);
    }
    g.audio.gunshot('rifle2', muzzle);
    g.makeNoise(this.pos, ALLY.noise, 'gunshot');
    g.enemies.bulletNearMiss(muzzle, dir, eh ? eh.dist : wh ? wh.dist : ALLY.range, this);
    this.model.fire(0.8);
  }

  dispose() {
    this.releaseCover();
    this.model.dispose();
  }
}

function pushApart(a, p, r) {
  const dx = a.pos.x - p.x;
  const dz = a.pos.z - p.z;
  const d2 = dx * dx + dz * dz;
  if (d2 < r * r && d2 > 1e-6 && Math.abs(p.y - a.pos.y) < 1.5) {
    const d = Math.sqrt(d2);
    a.pos.x += (dx / d) * (r - d);
    a.pos.z += (dz / d) * (r - d);
  }
}

// Manga: doğurma, yeniden toplama, dost ateşi ışın testi, düşmanlara görünürlük
export class AllyManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.sayT = 0;
    this.shots = 0; // test ve istatistik için: mangadan çıkan mermi sayısı
    this.weaponsFree = false;
    this.alert = false;
    this._seen = { ally: null, dist: 0 };
  }

  spawnSquad(n, pos, yaw) {
    this.clear();
    const g = this.game;
    for (let i = 0; i < n; i++) {
      const [ox, oz] = ALLY.slots[i % ALLY.slots.length];
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      _v.set(pos.x + c * ox + s * oz, pos.y, pos.z - s * ox + c * oz);
      if (g.nav && !g.nav.isWalkable(_v.x, _v.z)) _v.copy(pos);
      this.list.push(new Ally(g, i, _v, yaw));
    }
  }

  // Kontrol noktasında ya da hedef atlanınca manga oyuncunun arkasında yeniden toplanır
  regroup(pos, yaw) {
    const g = this.game;
    this.list.forEach((a, i) => {
      const [ox, oz] = ALLY.slots[i % ALLY.slots.length];
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      _v.set(pos.x + c * ox + s * oz, pos.y, pos.z - s * ox + c * oz);
      if (!g.nav.isWalkable(_v.x, _v.z)) _v.copy(pos);
      a.reset(_v, yaw);
    });
  }

  clear() {
    for (const a of this.list) a.dispose();
    this.list = [];
  }

  update(dt) {
    const g = this.game;
    this.sayT -= dt;
    // Silahlar serbest: bir düşman çatışmada ya da oyuncu az önce ateş etti
    let combat = false;
    let alert = false;
    for (const e of g.enemies.list) {
      if (!e.alive || e.dummy) continue;
      if (e.aiState === 'combat') {
        combat = true;
        break;
      }
      if (e.aiState === 'investigate' || e.aiState === 'search') alert = true;
    }
    this.weaponsFree = combat || g.time - (g.lastPlayerShot ?? -100) < ALLY.fireFollow;
    this.alert = alert || this.weaponsFree;
    for (const a of this.list) a.update(dt);
    // Oyuncu ve düşmanlarla iç içe girme: dost kenara itilir (oyuncu itilmez, kontrol onda kalsın)
    const P = g.player;
    for (const a of this.list) {
      pushApart(a, P.pos, 0.75);
      for (const e of g.enemies.list) if (e.alive) pushApart(a, e.pos, 0.75);
    }
  }

  // Düşmanın görebileceği en yakın dost (yalnızca en yakın aday için görüş testi)
  visibleTo(enemy, eye, range, fovHalf, inCombat) {
    const g = this.game;
    let best = null;
    let bestD = range;
    for (const a of this.list) {
      if (a.down) continue;
      const d = eye.distanceTo(a.pos);
      if (d >= bestD) continue;
      const off = Math.abs(angleDiff(enemy.lookYaw, dirToYaw(a.pos.x - eye.x, a.pos.z - eye.z)));
      if (off > fovHalf && d > 3.5 && !(inCombat && d < 30)) continue;
      best = a;
      bestD = d;
    }
    if (!best) return null;
    if (!g.world.lineOfSight(eye, best.headPos(_v2)) && !g.world.lineOfSight(eye, best.chestPos(_v2))) return null;
    this._seen.ally = best;
    this._seen.dist = bestD;
    return this._seen;
  }

  // Oyuncu mermisi için: ışın bir dosta değiyor mu? {ally, dist, point}
  raycast(o, d, maxD) {
    let best = null;
    let bestD = maxD;
    for (const a of this.list) {
      _v.set(a.pos.x, a.pos.y + 1.0, a.pos.z).sub(o);
      const t = _v.dot(d);
      if (t < -1 || t > bestD + 1.5) continue;
      if (_v.lengthSq() - t * t > 1.8) continue;
      _ray.set(o, d);
      _ray.far = bestD;
      const hits = _ray.intersectObjects(a.model.meshes, false);
      if (hits.length && hits[0].distance < bestD) {
        bestD = hits[0].distance;
        best = { ally: a, dist: bestD, point: hits[0].point };
      }
    }
    return best;
  }
}
