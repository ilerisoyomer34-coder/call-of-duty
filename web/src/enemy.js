// Düşman yapay zekâsı (AShooterEnemy + AShooterAIController karşılığı).
// Durumlar: patrol/guard → suspicious → investigate → combat (siper, yan adım, hücum) → search → retreat.
// Algı: görme (açı, mesafe, görüş hattı, duruş), duyma (silah/adım), hasar.
// Adil isabet: mesafe, oyuncu hızı, ilk atış ıskası, zorluk; saldırı jetonu sistemiyle aynı anda sınırlı sayıda düşman ateş eder.
import * as THREE from 'three';
import { ENEMY_TYPES, ENEMY_WEAPONS, AI, SCORE, SOLDIER_ANIM } from './config.js';
import { createSoldier } from './soldier.js';
import { Health } from './health.js';
import { DEG, clamp, damp, dampAngle, angleDiff, dirToYaw, rand, randomInCone, pick, lerp } from './util.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _hit = {};
const _ray = new THREE.Raycaster();
const UP = new THREE.Vector3(0, 1, 0);

// Işın - dikey silindir kesişimi (oyuncu vuruş kutusu)
function rayCylinder(o, d, cx, cz, r, y0, y1, maxT) {
  const ox = o.x - cx;
  const oz = o.z - cz;
  const a = d.x * d.x + d.z * d.z;
  if (a < 1e-8) return -1;
  const b = 2 * (ox * d.x + oz * d.z);
  const c = ox * ox + oz * oz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc);
  let t = (-b - sq) / (2 * a);
  if (t < 0) t = (-b + sq) / (2 * a);
  if (t < 0 || t > maxT) return -1;
  const y = o.y + d.y * t;
  if (y < y0 || y > y1) return -1;
  return t;
}

let nextId = 1;

export class Enemy {
  constructor(game, spec) {
    this.game = game;
    this.id = spec.id || `e${nextId++}`;
    this.spec = spec;
    this.type = spec.type || 'rifleman';
    this.dummy = !!spec.dummy;
    const T = { ...ENEMY_TYPES[this.type === 'dummy' ? 'rifleman' : this.type] };
    if (this.dummy) T.colors = { uniform: 0xc86b2a, vest: 0x8a4a1c, helmet: 0xd9a126, skin: 0xb08a6a, band: 0xffffff };
    this.T = T;
    this.group = spec.group || null;
    this.model = createSoldier(this.type, T.colors);
    game.scene.add(this.model.root);
    this.pos = new THREE.Vector3().copy(spec.pos);
    this.vel = new THREE.Vector3();
    this.yaw = spec.yaw || 0;
    this.state = { pos: this.pos, vel: this.vel, radius: 0.38, height: 1.8, grounded: true, gravity: 15, hitWall: false };
    const W = ENEMY_WEAPONS[T.weapon];
    this.W = W;
    this.health = new Health(T.hp, this.type === 'heavy' ? 80 : 0);
    this.weapon = { mag: W.magSize, cooldown: 0, burstLeft: 0, gapT: rand(0.2, 0.6), reloadT: 0, charge: 0 };
    this.anim = { aimPitch: 0, deathT: 0, fallDir: 1, fallSide: 0 };
    this.reset();
    if (this.type === 'sniper') this.createLaser();
  }

  reset() {
    const s = this.spec;
    this.pos.copy(s.pos);
    this.vel.set(0, 0, 0);
    this.yaw = s.yaw || 0;
    this.health.reset();
    this.alive = true;
    this.dead = false;
    this.aiState = s.rush ? 'combat' : s.patrol && s.patrol.length > 1 ? 'patrol' : 'guard';
    this.awareness = s.rush ? 1 : 0;
    this.lastKnown = new THREE.Vector3().copy(s.rush ? s.rushTarget || s.pos : s.pos);
    this.lastSeen = s.rush ? this.game.time : -100;
    this.visible = false;
    this.visibleT = 0;
    this.reactionT = 0;
    this.path = null;
    this.pathIdx = 0;
    this.pathGoal = new THREE.Vector3(Infinity, 0, 0);
    this.repathT = 0;
    this.moveTarget = null;
    this.run = false;
    this.patrolIdx = 0;
    this.waitT = rand(0, 2);
    this.cover = null;
    this.coverPhase = 'move';
    this.coverT = 0;
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.strafeT = 0;
    this.thinkT = Math.random() * AI.thinkInterval;
    this.grenadeT = rand(4, AI.grenadeCooldown);
    this.hasToken = false;
    this.searchLeft = 0;
    this.suspT = 0;
    this.retreated = false;
    this.alertT = 0;
    this.stuckT = 0;
    this.lastPos = this.pos.clone();
    this.lastFired = -100;
    this.alertIconT = 0;
    this.crouch = false;
    this.lookYaw = this.yaw;
    this.guardYaw = this.yaw;
    this.weapon.mag = this.W.magSize;
    this.weapon.reloadT = 0;
    this.weapon.burstLeft = 0;
    this.weapon.charge = 0;
    this.anim.deathT = 0;
    this.anim.aimPitch = 0;
    this.throwAnim = null;
    this.bloodPool = false;
    this.model.reset(this.pos, this.yaw);
    this.respawnT = 0;
    if (this.laser) this.laser.visible = false;
    if (this.glint) this.glint.visible = false;
  }

  get stationary() {
    return !!(this.spec.stationary || this.T.stationary);
  }

  eyePos(out = new THREE.Vector3()) {
    const s = this.model.root.scale.y;
    return out.set(this.pos.x, this.pos.y + (this.crouch ? 1.15 : 1.62) * s, this.pos.z);
  }

  chestPos(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + (this.crouch ? 0.95 : 1.3), this.pos.z);
  }

  muzzlePos(out = new THREE.Vector3()) {
    return this.model.muzzleWorld(out);
  }

  // --- Hasar ---
  takeDamage(amount, info) {
    if (!this.alive) return { killed: false, headshot: false };
    const g = this.game;
    const dealt = this.health.damage(amount);
    void dealt;
    this.model.hit(info.zone);
    if (info.source === 'player') {
      // Vurulan düşman ateşin nereden geldiğini bilir
      this.lastKnown.copy(g.player.pos);
      this.lastSeen = g.time;
      if (this.aiState !== 'combat') this.enterCombat(true);
      this.awareness = 1;
      this.weapon.cooldown += 0.2; // sendeleme
      if (this.dummy) this.aiState = 'guard';
    }
    if (this.health.dead) {
      this.die(info);
      return { killed: true, headshot: info.zone === 'head' };
    }
    return { killed: false, headshot: false };
  }

  die(info) {
    const g = this.game;
    this.alive = false;
    this.dead = true;
    this.aiState = 'dead';
    this.anim.deathT = 0;
    this.throwAnim = null; // yarım kalan atış: bomba çıkmaz
    this.hasToken = false;
    if (this.cover) this.cover.taken = null;
    this.cover = null;
    if (this.laser) this.laser.visible = false;
    if (this.glint) this.glint.visible = false;
    // Düşme yönü: merminin geldiği yöne göre
    const back = _v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const d = info.dir || back;
    this.anim.fallDir = d.dot(back) >= 0 ? 1 : -1;
    this.anim.fallSide = rand(-0.35, 0.35);
    this.vel.set((info.dir?.x || 0) * 1.5, 0, (info.dir?.z || 0) * 1.5);
    // Görünüm: iskeletli askerde silah elden düşer, kutu askerde kafa vuruşunda kask fırlar
    this.model.die({ ...info, dir: d }, g);
    if (!this.dummy) g.onEnemyKilled(this, info);
    else {
      this.respawnT = 3;
      g.onDummyKilled?.(this);
    }
  }

  enterCombat(fromDamage = false) {
    const g = this.game;
    const was = this.aiState;
    this.aiState = 'combat';
    this.awareness = 1;
    this.reactionT = g.difficulty.reaction * (fromDamage ? 0.6 : 1) * rand(0.8, 1.25);
    this.alertIconT = 2;
    this.cover = null;
    this.coverPhase = 'move';
    this.path = null;
    if (was !== 'combat') {
      g.enemies.alertNearby(this);
      g.events.emit('enemyAlert', this);
    }
  }

  // --- Güncelleme ---
  update(dt) {
    const g = this.game;
    if (!this.alive) {
      this.updateDeath(dt);
      return;
    }
    const P = g.player;
    const distToPlayer = this.pos.distanceTo(P.pos);
    const active = distToPlayer < AI.activeRadius || this.aiState === 'combat';
    if (active && !g.cheats.aiOff && !this.dummy) {
      this.thinkT -= dt;
      if (this.thinkT <= 0) {
        const tdt = AI.thinkInterval - this.thinkT;
        this.thinkT += AI.thinkInterval;
        this.perceive(tdt);
        this.think(tdt);
      }
      this.act(dt);
      this.updateThrow(dt);
    } else if (this.dummy && this.spec.patrol) {
      this.patrolMove(dt, false);
    } else {
      // Uyuyan (uzak) ya da dondurulmuş düşman son hızıyla kaymasın
      this.vel.x = 0;
      this.vel.z = 0;
    }
    this.moveBody(dt);
    if (distToPlayer < 110) this.animate(dt, distToPlayer);
    this.alertIconT = Math.max(0, this.alertIconT - dt);
    if (this.alertT > 0) {
      this.alertT -= dt;
      if (this.alertT <= 0 && this.aiState !== 'combat' && this.alertTarget) {
        this.lastKnown.copy(this.alertTarget);
        this.aiState = 'investigate';
        this.run = true;
        this.path = null;
        this.awareness = Math.max(this.awareness, 0.8);
      }
    }
  }

  perceive(dt) {
    const g = this.game;
    const P = g.player;
    const D = g.difficulty;
    if (!P.alive) {
      this.visible = false;
      return;
    }
    const eye = this.eyePos(_v);
    const head = P.headPos(_v2);
    const toP = _v3.subVectors(head, eye);
    const dist = toP.length();
    const inCombat = this.aiState === 'combat';
    const range = this.T.viewRange * D.perception * (inCombat ? 1.4 : 1);
    let visible = false;
    if (dist < range) {
      const yawTo = dirToYaw(toP.x, toP.z);
      const off = Math.abs(angleDiff(this.lookYaw, yawTo));
      const fovHalf = (this.T.fov * DEG) / 2;
      if (off < fovHalf || dist < 3.5 || (inCombat && dist < 30)) {
        visible = g.world.lineOfSight(eye, head) || g.world.lineOfSight(eye, P.chestPos(_v3));
      }
    }
    this.visible = visible;
    if (visible) {
      this.visibleT += dt;
      if (!inCombat) {
        const df = Math.pow(clamp(1 - dist / range, 0, 1), 0.6);
        let rate = 1.5 * D.awarenessRate * (0.25 + df * 2.2);
        if (P.crouched) rate *= 0.5;
        const sp = P.horizSpeed;
        if (P.sprinting) rate *= 1.8;
        else if (sp > 1) rate *= 1.25;
        else rate *= 0.7;
        if (g.time - g.weapons.current?.lastShot < 0.5) rate *= 3; // silah ateşi göz alıcı
        if (dist < 6) rate *= 3;
        this.awareness = Math.min(1, this.awareness + rate * dt);
        if (this.awareness > 0.35) {
          this.lastKnown.copy(P.pos);
          if (this.aiState === 'patrol' || this.aiState === 'guard') {
            this.aiState = 'suspicious';
            this.suspT = 0;
          }
        }
        if (this.awareness >= 1) {
          this.lastKnown.copy(P.pos);
          this.lastSeen = g.time;
          this.enterCombat();
        }
      } else {
        this.lastKnown.copy(P.pos);
        this.lastSeen = g.time;
      }
    } else {
      this.visibleT = 0;
      if (!inCombat && this.aiState !== 'investigate' && this.aiState !== 'search') {
        this.awareness = Math.max(0, this.awareness - AI.suspicionDecay * dt);
      }
    }
  }

  think(dt) {
    const g = this.game;
    const P = g.player;
    switch (this.aiState) {
      case 'guard':
      case 'patrol':
        break;
      case 'suspicious':
        this.suspT += dt;
        if (this.awareness < 0.2 && this.suspT > 2) {
          this.aiState = this.spec.patrol?.length > 1 ? 'patrol' : 'guard';
        } else if (this.suspT > 1.6 && this.awareness > 0.45) {
          this.aiState = 'investigate';
          this.run = false;
          this.path = null;
          this.suspT = 0;
        }
        break;
      case 'investigate':
        this.suspT += dt;
        if (this.stationary) {
          if (this.suspT > AI.investigateTime) this.aiState = 'guard';
        } else if (this.pos.distanceTo(this.lastKnown) < 2 || this.suspT > AI.investigateTime * 2) {
          this.aiState = 'search';
          this.searchLeft = 2;
          this.moveTarget = null;
          this.waitT = rand(1.5, 3);
        }
        break;
      case 'search':
        if (!this.moveTarget || this.pos.distanceTo(this.moveTarget) < 1.2) {
          this.waitT -= dt;
          if (this.waitT <= 0) {
            if (this.searchLeft-- <= 0 && this.spec.rush) {
              // Takviye/dalga birlikleri oyuncuyu avlamaya devam eder
              this.lastKnown.copy(g.player.pos);
              this.aiState = 'investigate';
              this.run = true;
              this.suspT = 0;
              this.path = null;
            } else if (this.searchLeft < 0) {
              this.aiState = this.spec.patrol?.length > 1 ? 'patrol' : 'guard';
              this.awareness = 0.3;
              if (!this.spec.patrol) {
                this.spec.patrolReturn = true;
              }
            } else {
              this.moveTarget = g.nav.randomPointNear(this.lastKnown, 8) || this.lastKnown.clone();
              this.waitT = rand(1.2, 2.5);
              this.path = null;
            }
          }
        }
        break;
      case 'combat':
        this.thinkCombat(dt);
        break;
      default:
        break;
    }
    void P;
  }

  thinkCombat(dt) {
    const g = this.game;
    const P = g.player;
    if (!P.alive) {
      if (g.time - this.lastSeen > 3) {
        this.aiState = 'search';
        this.searchLeft = 1;
      }
      return;
    }
    if (this.reactionT > 0) this.reactionT -= dt;
    const since = g.time - this.lastSeen;
    const dist = this.pos.distanceTo(P.pos);
    // Görüş kaybı uzun sürerse ara
    if (!this.visible && since > AI.loseTargetTime + (this.T.usesCover ? 3 : 0)) {
      if (this.stationary) return;
      if (this.cover) this.cover.taken = null;
      this.cover = null;
      this.aiState = 'search';
      this.moveTarget = this.lastKnown.clone();
      this.searchLeft = 2;
      this.waitT = 0.5;
      this.path = null;
      return;
    }
    // El bombası: oyuncu siperde saklanıyorsa
    this.grenadeT -= dt;
    if (
      g.difficulty.grenades && !this.visible && since > 1.2 && since < 8 && this.grenadeT <= 0 &&
      g.enemies.grenadeReady() && !this.stationary
    ) {
      const dl = this.pos.distanceTo(this.lastKnown);
      if (dl > 7 && dl < 28 && Math.random() < 0.35) {
        this.throwGrenade(this.lastKnown);
        this.grenadeT = AI.grenadeCooldown * rand(0.8, 1.4);
        g.enemies.usedGrenade();
      } else this.grenadeT = rand(1, 3);
    }
    if (this.stationary) return;
    // Düşük canda geri çekil
    if (!this.retreated && this.health.ratio < 0.3 && Math.random() < 0.5 && this.T.usesCover) {
      this.retreated = true;
      const c = this.findCover(true);
      if (c) this.takeCover(c);
    }
    const T = this.T;
    if (T.rushes) {
      // Hücumcu: oyuncuya koş, yakında yan adım at
      if (dist > T.prefDist[1] || !this.visible) {
        this.moveTarget = this.visible ? P.pos.clone() : this.lastKnown.clone();
        this.run = true;
      } else {
        this.moveTarget = null;
      }
      return;
    }
    if (T.usesCover) {
      // Siper: yoksa ya da açığa çıktıysa yeni siper bul
      if (this.cover) {
        const compromised = this.coverPhase === 'hide' && this.visible && g.world.lineOfSight(this.eyePos(_v), P.headPos(_v2)) && this.crouch;
        const tooClose = this.cover.pos.distanceTo(P.pos) < 5;
        if (compromised || tooClose) {
          this.cover.taken = null;
          this.cover = null;
        }
      }
      if (!this.cover) {
        this.coverSearchT = (this.coverSearchT || 0) - dt;
        if (this.coverSearchT <= 0) {
          this.coverSearchT = rand(1.5, 3);
          const c = this.findCover(false);
          if (c) this.takeCover(c);
        }
      }
      if (!this.cover) {
        // Açıkta: tercih edilen mesafeyi koru
        if (dist > T.prefDist[1] || !this.visible) {
          this.moveTarget = this.lastKnown.clone();
          this.run = true;
        } else if (dist < T.prefDist[0]) {
          _v.subVectors(this.pos, P.pos).setY(0).normalize().multiplyScalar(6).add(this.pos);
          this.moveTarget = g.nav.isWalkable(_v.x, _v.z) ? _v.clone() : null;
          this.run = false;
        } else this.moveTarget = null;
      }
      return;
    }
    // Ağır makineli: yavaşça ilerle, orta mesafede dur
    if (dist > T.prefDist[1] || !this.visible) {
      this.moveTarget = this.lastKnown.clone();
      this.run = false;
    } else this.moveTarget = null;
  }

  findCover(retreat) {
    const g = this.game;
    const P = g.player;
    const target = this.lastKnown;
    const cands = g.nav.coversNear(this.pos, AI.coverSearchRadius + (retreat ? 8 : 0));
    cands.sort((a, b) => a.pos.distanceToSquared(this.pos) - b.pos.distanceToSquared(this.pos));
    let best = null;
    let bestScore = -Infinity;
    let evals = 0;
    const pref = (this.T.prefDist[0] + this.T.prefDist[1]) / 2;
    const headP = P.headPos(_v3).clone();
    for (const c of cands) {
      if (c.taken && c.taken !== this) continue;
      if (evals > 10) break;
      const toPx = target.x - c.pos.x;
      const toPz = target.z - c.pos.z;
      const dP = Math.hypot(toPx, toPz);
      if (dP < 6 || dP > 45) continue;
      if ((c.normal.x * toPx + c.normal.z * toPz) / dP < 0.3) continue;
      if (retreat && dP < this.pos.distanceTo(target)) continue;
      evals++;
      _v.set(c.pos.x, 1.0, c.pos.z);
      if (g.world.lineOfSight(_v, headP)) continue; // saklanınca görülmemeli
      _v.set(c.pos.x, 1.62, c.pos.z);
      const peekUp = g.world.lineOfSight(_v, headP);
      let peek = peekUp ? 'up' : null;
      if (!peek) {
        for (const side of [-1, 1]) {
          _v2.set(-c.normal.z * side, 0, c.normal.x * side).multiplyScalar(1.0).add(c.pos);
          _v2.y = 1.62;
          if (g.nav.isWalkable(_v2.x, _v2.z) && g.world.lineOfSight(_v2, headP)) {
            peek = side;
            break;
          }
        }
      }
      if (!peek) continue;
      let score = -c.pos.distanceTo(this.pos) * 1.2 - Math.abs(dP - pref) * 0.4 + (peek === 'up' ? 3 : 0);
      for (const e of g.enemies.list) if (e !== this && e.alive && e.pos.distanceToSquared(c.pos) < 4) score -= 8;
      if (score > bestScore) {
        bestScore = score;
        best = { point: c, peek };
      }
    }
    return best;
  }

  takeCover(c) {
    if (this.cover) this.cover.taken = null;
    this.cover = c.point;
    this.cover.taken = this;
    this.coverPeek = c.peek;
    this.coverPhase = 'move';
    this.coverT = 0;
    this.moveTarget = c.point.pos.clone();
    this.run = true;
    this.path = null;
  }

  // Her kare: hareket hedefi, bakış, ateş
  act(dt) {
    const g = this.game;
    const P = g.player;
    let faceYaw = null;
    let wantShoot = false;
    this.crouch = false;
    switch (this.aiState) {
      case 'guard': {
        if (this.spec.patrolReturn && this.pos.distanceTo(this.spec.pos) > 1.5) {
          this.moveTarget = this.spec.pos.clone();
          this.run = false;
        } else {
          this.moveTarget = null;
          this.spec.patrolReturn = false;
          // Etrafa bakın
          faceYaw = this.guardYaw + Math.sin(g.time * 0.35 + this.pos.x) * 0.6;
        }
        break;
      }
      case 'patrol':
        this.patrolMove(dt, false);
        break;
      case 'suspicious':
        this.moveTarget = null;
        faceYaw = dirToYaw(this.lastKnown.x - this.pos.x, this.lastKnown.z - this.pos.z);
        break;
      case 'investigate':
        if (!this.stationary) {
          this.moveTarget = this.lastKnown.clone();
        } else faceYaw = dirToYaw(this.lastKnown.x - this.pos.x, this.lastKnown.z - this.pos.z);
        break;
      case 'search':
        if (this.moveTarget && this.pos.distanceTo(this.moveTarget) < 1.2) {
          faceYaw = this.yaw + Math.sin(g.time * 1.3) * 0.9;
        }
        break;
      case 'combat': {
        const toYaw = dirToYaw(this.lastKnown.x - this.pos.x, this.lastKnown.z - this.pos.z);
        if (this.visible) faceYaw = dirToYaw(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
        else faceYaw = toYaw;
        if (this.cover && this.moveTarget && this.pos.distanceTo(this.cover.pos) < 0.9) {
          // Siperde: saklan/göz at döngüsü
          this.moveTarget = null;
          this.coverPhase = this.coverPhase === 'move' ? 'hide' : this.coverPhase;
          this.coverT = rand(0.8, 1.6);
        }
        if (this.cover && !this.moveTarget && this.coverPhase !== 'move') {
          this.coverT -= dt;
          if (this.coverPhase === 'hide') {
            this.crouch = true;
            if (this.coverT <= 0 && this.weapon.reloadT <= 0) {
              this.coverPhase = 'peek';
              this.coverT = rand(1.6, 3.2);
            }
          } else if (this.coverPhase === 'peek') {
            if (this.coverPeek !== 'up') {
              _v.set(-this.cover.normal.z * this.coverPeek, 0, this.cover.normal.x * this.coverPeek).add(this.cover.pos);
              this.peekTarget = _v.clone();
            } else this.peekTarget = null;
            if (this.coverT <= 0 || this.weapon.mag <= 0) {
              this.coverPhase = 'hide';
              this.coverT = rand(1.0, 2.2) / (g.difficulty.aimMult < 1 ? 1.4 : 1);
              this.peekTarget = null;
            }
          }
        }
        if (this.cover && this.coverPhase === 'peek' && this.peekTarget) {
          this.steerDirect(this.peekTarget, dt, 1.6);
        } else if (this.cover && this.coverPhase === 'hide' && !this.moveTarget) {
          this.steerDirect(this.cover.pos, dt, 1.6);
        }
        // Açıkta ve yakın: yan adım at
        if (!this.cover && !this.moveTarget && this.visible && !this.stationary) {
          this.strafeT -= dt;
          if (this.strafeT <= 0) {
            this.strafeT = rand(0.8, 2);
            this.strafeDir *= Math.random() < 0.6 ? -1 : 1;
          }
          const fy = faceYaw;
          _v.set(Math.cos(fy) * this.strafeDir, 0, -Math.sin(fy) * this.strafeDir).multiplyScalar(1.5).add(this.pos);
          if (g.nav.isWalkable(_v.x, _v.z)) this.steerDirect(_v, dt, this.T.walk * 1.2);
          if (this.type === 'rifleman' && Math.random() < 0.002) this.crouch = !this.crouch;
        }
        wantShoot = this.visible && this.reactionT <= 0 && (!this.cover || this.coverPhase === 'peek' || this.coverPhase === 'move' && !this.run);
        if (this.type === 'shotgunner') wantShoot = this.visible && this.reactionT <= 0 && this.pos.distanceTo(P.pos) < this.W.range;
        break;
      }
      default:
        break;
    }
    if (this.moveTarget) this.followPath(dt);
    else if (this.aiState !== 'combat' || (!this.cover && !this.visible)) {
      this.vel.x = damp(this.vel.x, 0, 8, dt);
      this.vel.z = damp(this.vel.z, 0, 8, dt);
    }
    // Bakış yönü
    let target = faceYaw;
    if (target === null) {
      const sp = Math.hypot(this.vel.x, this.vel.z);
      target = sp > 0.3 ? dirToYaw(this.vel.x, this.vel.z) : this.yaw;
    }
    const turn = this.aiState === 'combat' ? 7 : 3;
    this.yaw = dampAngle(this.yaw, target, turn, dt);
    this.lookYaw = this.yaw;
    this.updateWeapon(dt, wantShoot);
  }

  patrolMove(dt, run) {
    const pts = this.spec.patrol;
    if (!pts || pts.length < 2) return;
    const tgt = pts[this.patrolIdx];
    if (this.pos.distanceTo(tgt) < 0.8) {
      this.moveTarget = null;
      this.waitT -= dt;
      if (this.waitT <= 0) {
        this.patrolIdx = (this.patrolIdx + 1) % pts.length;
        this.waitT = rand(1.5, 4);
      }
      this.vel.x = damp(this.vel.x, 0, 8, dt);
      this.vel.z = damp(this.vel.z, 0, 8, dt);
    } else {
      this.moveTarget = tgt;
      this.run = run;
      if (this.dummy) this.steerDirect(tgt, dt, this.T.walk);
      else this.followPath(dt);
    }
  }

  followPath(dt) {
    const g = this.game;
    if (this.stationary) {
      this.moveTarget = null;
      return;
    }
    const goal = this.moveTarget;
    this.repathT -= dt;
    if (!this.path || (this.repathT <= 0 && this.pathGoal.distanceToSquared(goal) > 4)) {
      if (g.enemies.requestPath()) {
        this.path = g.nav.findPath(this.pos, goal);
        this.pathIdx = 0;
        this.pathGoal.copy(goal);
        this.repathT = 1.0;
      }
    }
    if (!this.path || !this.path.length) {
      this.vel.x = damp(this.vel.x, 0, 8, dt);
      this.vel.z = damp(this.vel.z, 0, 8, dt);
      return;
    }
    let wp = this.path[this.pathIdx];
    while (wp && Math.hypot(wp.x - this.pos.x, wp.z - this.pos.z) < 0.6) {
      this.pathIdx++;
      wp = this.path[this.pathIdx];
    }
    if (!wp) {
      this.path = null;
      this.moveTarget = null;
      return;
    }
    const speed = this.run ? this.T.run : this.T.walk;
    this.steerDirect(wp, dt, this.crouch ? speed * 0.5 : speed);
    // Takılma tespiti
    this.stuckT += dt;
    if (this.stuckT > 1.5) {
      if (this.pos.distanceTo(this.lastPos) < 0.3) {
        this.path = null;
        this.repathT = 0;
        const alt = g.nav.randomPointNear(this.pos, 4);
        if (alt) this.moveTarget = alt;
      }
      this.stuckT = 0;
      this.lastPos.copy(this.pos);
    }
  }

  steerDirect(target, dt, speed) {
    const dx = target.x - this.pos.x;
    const dz = target.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    const s = d < 0.3 ? 0 : Math.min(speed, d * 4);
    const tx = d > 1e-4 ? (dx / d) * s : 0;
    const tz = d > 1e-4 ? (dz / d) * s : 0;
    this.vel.x = damp(this.vel.x, tx, 8, dt);
    this.vel.z = damp(this.vel.z, tz, 8, dt);
  }

  moveBody(dt) {
    const g = this.game;
    if (this.stationary && !this.dummy) {
      this.vel.set(0, 0, 0);
      return;
    }
    // Ayrışma: diğer düşmanlarla iç içe girme
    for (const o of g.enemies.list) {
      if (o === this || !o.alive) continue;
      const dx = this.pos.x - o.pos.x;
      const dz = this.pos.z - o.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 0.64 && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        this.vel.x += (dx / d) * (0.8 - d) * 6;
        this.vel.z += (dz / d) * (0.8 - d) * 6;
      }
    }
    if (this.spec.elevated) {
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      return;
    }
    g.world.moveCharacter(this.state, dt, 0.45);
  }

  // --- Silah ---
  updateWeapon(dt, wantShoot) {
    const g = this.game;
    const Wp = this.weapon;
    const W = this.W;
    Wp.cooldown -= dt;
    if (Wp.reloadT > 0) {
      Wp.reloadT -= dt;
      if (this.cover) this.crouch = true;
      if (Wp.reloadT <= 0) Wp.mag = W.magSize;
      return;
    }
    if (Wp.mag <= 0) {
      Wp.reloadT = W.reload;
      g.audio.mech('magOut', this.pos);
      return;
    }
    if (this.type === 'sniper') {
      this.updateSniper(dt, wantShoot);
      return;
    }
    const facing = Math.abs(angleDiff(this.yaw, dirToYaw(g.player.pos.x - this.pos.x, g.player.pos.z - this.pos.z))) < 0.4;
    // Jeton yoksa yalnızca seyrek bastırma ateşi
    const allowed = this.hasToken || Math.random() < 0.15 * dt;
    if (!wantShoot || !facing) {
      Wp.burstLeft = 0;
      return;
    }
    if (Wp.burstLeft <= 0) {
      Wp.gapT -= dt;
      if (Wp.gapT <= 0 && (allowed || this.hasToken)) {
        Wp.burstLeft = Math.round(rand(W.burst[0], W.burst[1]));
        Wp.gapT = rand(W.burstGap[0], W.burstGap[1]);
        Wp.suppress = !this.hasToken;
      }
    }
    let n = 0;
    while (Wp.burstLeft > 0 && Wp.cooldown <= 0 && Wp.mag > 0 && n < 3) {
      this.shoot(Wp.suppress);
      Wp.burstLeft--;
      Wp.mag--;
      Wp.cooldown += 60 / W.rpm;
      n++;
    }
    if (Wp.cooldown < -0.2) Wp.cooldown = 0;
  }

  updateSniper(dt, wantShoot) {
    const g = this.game;
    const Wp = this.weapon;
    const P = g.player;
    if (!this.aimPoint) this.aimPoint = new THREE.Vector3();
    if (wantShoot && Wp.cooldown <= 0) {
      if (Wp.charge === 0) this.aimPoint.copy(P.chestPos(_v));
      Wp.charge += dt;
      // Lazer oyuncuyu gecikmeli takip eder: hareket eden oyuncu kaçabilir
      this.aimPoint.lerp(P.chestPos(_v), 1 - Math.exp(-2.6 * dt));
      this.showLaser(true);
      if (Wp.charge >= this.W.charge) {
        this.shoot(false, this.aimPoint);
        Wp.mag--;
        Wp.charge = 0;
        Wp.cooldown = rand(this.W.burstGap[0], this.W.burstGap[1]);
        this.showLaser(false);
      }
    } else {
      Wp.charge = Math.max(0, Wp.charge - dt * 2);
      if (Wp.charge === 0) this.showLaser(false);
    }
  }

  createLaser() {
    const g = this.game;
    const geo = new THREE.CylinderGeometry(0.012, 0.012, 1, 4, 1, true);
    geo.rotateX(Math.PI / 2);
    geo.translate(0, 0, -0.5);
    this.laser = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.laser.visible = false;
    this.laser.frustumCulled = false;
    g.scene.add(this.laser);
    this.glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.textures.flash, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true }));
    this.glint.visible = false;
    g.scene.add(this.glint);
  }

  showLaser(on) {
    if (!this.laser) return;
    this.laser.visible = on;
    this.glint.visible = on;
    if (!on) return;
    const g = this.game;
    const m = this.muzzlePos(_v);
    const d = _v2.subVectors(this.aimPoint, m);
    const len = d.length();
    this.laser.position.copy(m);
    this.laser.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), d.divideScalar(len));
    this.laser.scale.set(1, 1, len);
    this.laser.material.opacity = 0.35 + 0.3 * Math.sin(g.time * 30) * Math.sin(g.time * 30);
    this.glint.position.copy(m);
    const dist = m.distanceTo(g.camera.position);
    const s = dist * 0.03 * (0.8 + Math.random() * 0.4) * (0.4 + this.weapon.charge / this.W.charge);
    this.glint.scale.set(s, s, 1);
  }

  shoot(suppress, forcedAim = null) {
    const g = this.game;
    const P = g.player;
    const D = g.difficulty;
    const W = this.W;
    const muzzle = this.muzzlePos(_v).clone();
    const target = forcedAim ? forcedAim.clone() : P.chestPos(_v2).clone();
    if (!forcedAim && Math.random() < (D.aimMult < 1 ? 0.18 : 0.08)) target.y += 0.35;
    const dist = muzzle.distanceTo(target);
    const base = _dir.subVectors(target, muzzle).normalize().clone();
    // Hata açısı (derece)
    let err = this.T.aimBase * D.aimMult * (0.55 + dist / 32);
    err *= 1 + clamp(P.horizSpeed / 4.5, 0, 1.5) * 0.9;
    if (P.crouched) err *= 1.15;
    if (!P.grounded) err *= 1.3;
    const windup = Math.max(0, 1 - this.visibleT / AI.acquireWindup);
    err += AI.firstShotsMissBonus * windup * D.aimMult;
    if (suppress) err += 2.5;
    if (Math.hypot(this.vel.x, this.vel.z) > 1) err += 1.2;
    if (this.type === 'sniper') err = this.T.aimBase * D.aimMult;
    const pellets = W.pellets;
    let hitPlayer = false;
    const head = P.headPos(_v3).clone();
    for (let i = 0; i < pellets; i++) {
      const d = randomInCone(base, (err + (W.spreadDeg || 0)) * DEG, new THREE.Vector3(), 0.8);
      const wh = g.world.raycast(muzzle, d, W.range, _hit);
      const maxT = wh ? wh.dist : W.range;
      const h = P.alive ? rayCylinder(muzzle, d, P.pos.x, P.pos.z, 0.38, P.pos.y, P.pos.y + P.state.height + 0.05, maxT) : -1;
      if (h >= 0) {
        hitPlayer = true;
        const fall = dist < 25 ? 1 : lerp(1, 0.6, clamp((dist - 25) / 40, 0, 1));
        P.takeDamage(W.damage * D.damageMult * fall, this.pos);
        g.effects.impact(_v.copy(muzzle).addScaledVector(d, h), _v2.copy(d).negate(), 'flesh', 0.3);
      } else {
        const endT = maxT;
        if (wh && muzzle.distanceTo(g.camera.position) < 90) {
          g.effects.impact(wh.point, wh.normal, wh.surface, 0.7);
          if (wh.point.distanceTo(P.pos) < 20) g.audio.impact(wh.surface, wh.point);
        }
        // Yakından geçen mermi: vızıltı
        const toHead = _v.subVectors(head, muzzle);
        const t = toHead.dot(d);
        if (t > 0 && t < endT) {
          const closest = _v2.copy(muzzle).addScaledVector(d, t);
          const miss = closest.distanceTo(head);
          if (miss < 1.6 && i === 0) {
            const right = _v.set(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
            const pan = clamp(_v3.subVectors(closest, head).dot(right) / 1.6, -1, 1);
            g.audio.whiz(pan);
            P.shake(0.06);
            g.events.emit('suppressed');
          }
        }
      }
      if (i === 0 && (Math.random() < 0.4 || this.type === 'sniper')) {
        const end = hitPlayer ? head.clone().add(new THREE.Vector3(rand(-0.3, 0.3), -0.3, rand(-0.3, 0.3))) : wh ? wh.point.clone() : _v.copy(muzzle).addScaledVector(d, 80).clone();
        g.effects.tracer(muzzle, end, 300, 0.02);
      }
    }
    void hitPlayer;
    g.audio.gunshot(W.sound, muzzle);
    if (muzzle.distanceTo(g.camera.position) < 80) {
      g.effects.enemyMuzzle(muzzle, base);
      g.effects.flashLight(muzzle, 0xffb060, 18, 6, 0.05);
    }
    this.lastFired = g.time;
    this.model.fire(this.type === 'sniper' ? 1.5 : 1);
  }

  // Atış hareketi başlar; bomba kol öne savrulduğunda (releaseGrenade) çıkar
  throwGrenade(target) {
    if (this.throwAnim) return;
    this.throwAnim = { t: 0, target: target.clone(), released: false };
    this.game.events.emit('radio', `${this.T.name}: El bombası!`, 'enemy');
  }

  updateThrow(dt) {
    const T = this.throwAnim;
    if (!T) return;
    T.t += dt;
    if (!T.released && T.t >= SOLDIER_ANIM.throwRelease) {
      T.released = true;
      this.releaseGrenade(T.target);
    }
    if (T.t >= SOLDIER_ANIM.throwTime) this.throwAnim = null;
  }

  releaseGrenade(target) {
    const g = this.game;
    const from = this.eyePos(new THREE.Vector3());
    from.y += 0.2;
    const tgt = target.clone().add(new THREE.Vector3(rand(-2, 2), 0, rand(-2, 2)));
    const dist = from.distanceTo(tgt);
    const t = clamp(dist / 14, 0.8, 1.7);
    const grav = 15;
    const vel = new THREE.Vector3((tgt.x - from.x) / t, (tgt.y - from.y) / t + 0.5 * grav * t, (tgt.z - from.z) / t);
    g.grenades.spawn(from, vel, rand(2.6, 3.4), 'enemy');
  }

  // --- Animasyon ---
  // Yapay zekâ durumunu görünüm katmanının anlayacağı duruşa çevirir (nişan / hazır / rahat)
  animate(dt, dist) {
    const g = this.game;
    const A = this.anim;
    let aim = 0;
    let stance = 'relaxed';
    if (this.aiState === 'combat') {
      const sinceShot = g.time - this.lastFired;
      const sprinting = this.run && Math.hypot(this.vel.x, this.vel.z) > 3;
      // Koşarken silah göğüste taşınır; ama ateş ettiği an omuza gelir
      stance = ((this.visible || sinceShot < 1.5) && !sprinting) || sinceShot < 0.4 ? 'aim' : 'ready';
      if (this.visible) {
        const P = g.player;
        const e = this.eyePos(_v);
        const h = P.chestPos(_v2);
        aim = Math.atan2(h.y - e.y, Math.hypot(h.x - e.x, h.z - e.z));
      }
    } else if (this.aiState !== 'patrol' && this.aiState !== 'guard') stance = 'ready';
    if (this.dummy || this.throwAnim) stance = 'ready';
    A.aimPitch = damp(A.aimPitch, clamp(aim, -0.7, 0.7), 8, dt);
    const W = this.weapon;
    ANIM_STATE.pos = this.pos;
    ANIM_STATE.yaw = this.yaw;
    ANIM_STATE.vel = this.vel;
    ANIM_STATE.crouch = this.crouch;
    ANIM_STATE.aimPitch = A.aimPitch;
    ANIM_STATE.stance = stance;
    ANIM_STATE.reload = W.reloadT > 0 ? 1 - W.reloadT / this.W.reload : -1;
    ANIM_STATE.dist = dist;
    ANIM_STATE.throw = this.throwAnim ? this.throwAnim.t / SOLDIER_ANIM.throwTime : -1;
    this.model.animate(dt, ANIM_STATE);
  }

  updateDeath(dt) {
    const g = this.game;
    const A = this.anim;
    if (A.deathT > 3 && this.dummy && this.respawnT > 0) {
      this.respawnT -= dt;
      if (this.respawnT <= 0) this.reset();
      return;
    }
    if (A.deathT > 2.5) return;
    A.deathT += dt;
    if (A.deathT < 0.8) {
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      this.vel.multiplyScalar(Math.max(0, 1 - 4 * dt));
    }
    this.model.updateDeath(dt, A, this.pos, this.yaw);
    if (A.deathT >= 0.75 && !this.bloodPool) {
      this.bloodPool = true;
      if (g.settings.blood && !this.dummy) {
        _v.set(this.pos.x - Math.sin(this.yaw) * A.fallDir * 0.9, this.pos.y + 0.02, this.pos.z - Math.cos(this.yaw) * A.fallDir * 0.9);
        g.effects.bloodSplat(_v, UP, 1.3);
      }
    }
  }
}

// Görünüm katmanına her karede aktarılan durum (bellek ayırmamak için tek nesne)
const ANIM_STATE = { pos: null, yaw: 0, vel: null, crouch: false, aimPitch: 0, stance: 'relaxed', reload: -1, throw: -1, dist: 0 };

// Düşman yöneticisi: listeler, ışın testi, gürültü ve alarm yayılımı, saldırı jetonları.
export class EnemyManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.pathBudget = 0;
    this.grenadeGlobalT = 0;
    this.tokenT = 0;
  }

  spawn(spec) {
    const e = new Enemy(this.game, spec);
    this.list.push(e);
    return e;
  }

  clear() {
    for (const e of this.list) {
      e.model.dispose();
      if (e.laser) e.laser.removeFromParent();
      if (e.glint) e.glint.removeFromParent();
    }
    this.list = [];
  }

  get alive() {
    return this.list.filter((e) => e.alive && !e.dummy);
  }

  aliveInGroup(group) {
    let n = 0;
    for (const e of this.list) if (e.alive && e.group === group) n++;
    return n;
  }

  requestPath() {
    if (this.pathBudget <= 0) return false;
    this.pathBudget--;
    return true;
  }

  grenadeReady() {
    return this.grenadeGlobalT <= 0;
  }

  usedGrenade() {
    this.grenadeGlobalT = AI.globalGrenadeCooldown;
  }

  update(dt) {
    this.pathBudget = 3;
    this.grenadeGlobalT -= dt;
    // Saldırı jetonları: en yakın N görünür düşman ateş eder
    this.tokenT -= dt;
    if (this.tokenT <= 0) {
      this.tokenT = 0.5;
      const P = this.game.player;
      const cands = this.list.filter((e) => e.alive && e.aiState === 'combat' && e.visible && e.type !== 'sniper');
      cands.sort((a, b) => a.pos.distanceToSquared(P.pos) - b.pos.distanceToSquared(P.pos));
      const max = this.game.difficulty.maxAttackers;
      for (let i = 0; i < cands.length; i++) cands[i].hasToken = i < max;
      for (const e of this.list) if (!cands.includes(e)) e.hasToken = false;
    }
    for (const e of this.list) e.update(dt);
    // Oyuncu ile düşmanlar iç içe girmesin
    const P = this.game.player;
    for (const e of this.list) {
      if (!e.alive) continue;
      const dx = P.pos.x - e.pos.x;
      const dz = P.pos.z - e.pos.z;
      const d2 = dx * dx + dz * dz;
      const r = 0.72;
      if (d2 < r * r && d2 > 1e-6 && Math.abs(P.pos.y - e.pos.y) < 1.5) {
        const d = Math.sqrt(d2);
        const push = (r - d) * 0.5;
        P.pos.x += (dx / d) * push;
        P.pos.z += (dz / d) * push;
        if (!e.stationary) {
          e.pos.x -= (dx / d) * push;
          e.pos.z -= (dz / d) * push;
        }
      }
    }
  }

  // Oyuncu mermisi için ışın testi: {enemy, zone, dist, point}
  raycast(o, d, maxD) {
    let best = null;
    let bestD = maxD;
    for (const e of this.list) {
      if (!e.alive) continue;
      _v.set(e.pos.x, e.pos.y + 1.0, e.pos.z).sub(o);
      const t = _v.dot(d);
      if (t < -1 || t > bestD + 1.5) continue;
      const perp2 = _v.lengthSq() - t * t;
      if (perp2 > 1.8) continue;
      _ray.set(o, d);
      _ray.far = bestD;
      const hits = _ray.intersectObjects(e.model.meshes, false);
      if (hits.length && hits[0].distance < bestD) {
        bestD = hits[0].distance;
        best = { enemy: e, zone: hits[0].object.userData.zone || 'torso', dist: hits[0].distance, point: hits[0].point };
      }
    }
    return best;
  }

  meleeTarget(o, fwd, range) {
    let best = null;
    let bestD = range;
    for (const e of this.list) {
      if (!e.alive) continue;
      const c = e.chestPos(_v).sub(o);
      const dist = c.length();
      if (dist > range + 0.3) continue;
      c.divideScalar(dist);
      if (c.dot(fwd) < 0.6) continue;
      if (dist < bestD + 0.3) {
        best = e;
        bestD = dist;
      }
    }
    return best;
  }

  // Oyuncunun mermisi bir düşmanın yakınından geçtiyse fark eder
  bulletNearMiss(o, d, dist) {
    const g = this.game;
    for (const e of this.list) {
      if (!e.alive || e.aiState === 'combat' || e.dummy) continue;
      _v.copy(e.eyePos(_v2)).sub(o);
      const t = _v.dot(d);
      if (t < 0 || t > dist + 2) continue;
      if (_v.lengthSq() - t * t < 6) {
        e.lastKnown.copy(g.player.pos);
        e.lastSeen = g.time;
        e.enterCombat();
      }
    }
  }

  onNoise(pos, radius, type) {
    const g = this.game;
    for (const e of this.list) {
      if (!e.alive || e.dummy) continue;
      const d = e.pos.distanceTo(pos);
      const r = radius * (type === 'gunshot' ? AI.gunshotHearing : 1) * g.difficulty.perception;
      if (d > r) continue;
      if (e.aiState === 'combat') {
        if (!e.visible) {
          e.lastKnown.copy(pos);
        }
        continue;
      }
      if (type === 'gunshot' || type === 'explosion') {
        const close = d < r * 0.35;
        e.lastKnown.copy(pos).add(_v.set(rand(-1, 1), 0, rand(-1, 1)).multiplyScalar(d * 0.08));
        if (close) {
          e.lastSeen = g.time - 1;
          e.enterCombat();
        } else {
          e.awareness = Math.max(e.awareness, 0.75);
          e.aiState = 'investigate';
          e.run = true;
          e.suspT = 0;
          e.path = null;
          e.alertIconT = 1.5;
        }
      } else {
        // Ayak sesi: şüphelen
        e.awareness = Math.min(0.9, e.awareness + 0.4);
        e.lastKnown.copy(pos);
        if (e.aiState === 'patrol' || e.aiState === 'guard') {
          e.aiState = 'suspicious';
          e.suspT = 0;
        }
      }
    }
  }

  alertNearby(src) {
    for (const e of this.list) {
      if (e === src || !e.alive || e.aiState === 'combat' || e.dummy) continue;
      const d = e.pos.distanceTo(src.pos);
      if (d > AI.alertRadius) continue;
      if (d > 12 && !this.game.world.lineOfSight(e.eyePos(_v), src.eyePos(_v2))) continue;
      e.alertTarget = src.lastKnown.clone().add(new THREE.Vector3(rand(-3, 3), 0, rand(-3, 3)));
      e.alertT = rand(0.4, 1.2);
    }
  }

  killAll() {
    for (const e of this.list) {
      if (e.alive && !e.dummy) {
        e.health.hp = 1;
        e.takeDamage(999, { zone: 'torso', dir: new THREE.Vector3(0, 0, 1), source: 'cheat' });
      }
    }
  }

  // Yakındaki düşmanların sayısı (HUD/müzik için)
  inCombatCount() {
    let n = 0;
    for (const e of this.list) if (e.alive && e.aiState === 'combat') n++;
    return n;
  }
}

export { SCORE, pick };
