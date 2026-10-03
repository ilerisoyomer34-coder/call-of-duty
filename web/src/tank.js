// Düşman tankı: siper arkasında sabit mevzi. Taret hedefe dönüş hızıyla döner; ana top mermisi roket
// altyapısıyla uçar (grenades.spawnRocket, sahibi 'enemy'), eş eksenli makineli anlık ışınla ateş eder.
// Zırh mermiyi durdurur (kıvılcım); hasarı roket ve C4 verir, el bombası az işler. Hedef seçimi düşman
// askeriyle aynı arayüzü kullanır: oyuncu ya da dost asker (pos, alive, chestPos, takeDamage).
import * as THREE from 'three';
import { TANK, C4, ALLY } from './config.js';
import { buildTank, buildC4 } from './models.js';
import { rand, clamp, angleDiff, dirToYaw, damp, randomInCone, rayCylinder, DEG } from './util.js';
import { enemyPen, playerZoneAt } from './armor.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _mz = new THREE.Vector3();
const _hit = {};
const FOE_PLAYER_BIAS = 1.3; // oyuncu, dosttan bu kat uzakta olsa bile hedef seçilir

export class Tank {
  constructor(game, def, idx) {
    this.game = game;
    this.def = def;
    this.id = `tank${idx}`;
    this.group = def.group || 'village';
    this.pos = def.pos.clone();
    this.yaw = def.yaw; // gövdenin baktığı yön
    const m = buildTank(TANK);
    this.model = m;
    m.root.position.copy(this.pos);
    m.root.rotation.y = this.yaw;
    game.scene.add(m.root);
    m.root.updateMatrixWorld(true);
    // Çarpıştırıcılar: dönük gövdenin eksen hizalı sınırı + taret. Mermi bunlarda durur (onShot: ipucu)
    const c = Math.abs(Math.cos(this.yaw));
    const s = Math.abs(Math.sin(this.yaw));
    const hx = (TANK.hullWidth / 2) * c + (TANK.hullLen / 2) * s;
    const hz = (TANK.hullWidth / 2) * s + (TANK.hullLen / 2) * c;
    this.box = { minx: this.pos.x - hx, maxx: this.pos.x + hx, minz: this.pos.z - hz, maxz: this.pos.z + hz, maxy: TANK.colliderH };
    const W = game.world;
    W.addCollider(this.box.minx, 0, this.box.minz, this.box.maxx, TANK.colliderH, this.box.maxz, 'metal', this);
    const tp = m.turret.getWorldPosition(new THREE.Vector3());
    const th = TANK.turretHalf;
    W.addCollider(tp.x - th, TANK.colliderH, tp.z - th, tp.x + th, TANK.turretColH, tp.z + th, 'metal', this);
    this.c4Spot = new THREE.Vector3(); // gövdede oyuncuya en yakın nokta (C4 buraya konur)
    this.lastKnown = new THREE.Vector3();
    this.reset(true);
  }

  // Başlangıç ya da kontrol noktasına dönüş: imha edilmediyse tam can, taret ileri, uyanık değil
  reset(full) {
    if (full) {
      this.hp = TANK.hp;
      this.destroyed = false;
      this.planted = false;
      this.fuse = 0;
      this.c4 = null;
      this.shotHint = 0;
    }
    if (this.destroyed) return;
    this.awake = false;
    this.foe = null;
    this.visible = false;
    this.lastSeen = -100;
    this.aimYaw = 0;
    this.aimPitch = 0;
    this.aimT = 0;
    this.reloadT = TANK.reload * 0.5;
    this.thinkT = rand(0, TANK.think);
    this.coaxLeft = 0;
    this.coaxGap = rand(TANK.coax.burstGap[0], TANK.coax.burstGap[1]);
    this.coaxCd = 0;
    this.recoil = 0;
    this.warned = false;
    this.setAim(0, 0);
  }

  get alive() {
    return !this.destroyed;
  }
  get worldYaw() {
    return this.yaw + this.aimYaw;
  }

  setAim(relYaw, pitch) {
    this.aimYaw = relYaw;
    this.aimPitch = pitch;
    this.model.turret.rotation.y = relYaw;
    this.model.gun.rotation.x = pitch;
  }

  sightPos(out) {
    this.model.turret.updateMatrixWorld(true);
    return this.model.turret.localToWorld(out.copy(this.model.points.sight));
  }

  // Görüş: menzildeki, görülebilen en yakın hedef (oyuncu öncelikli). Uyanık değilse yalnız yakındakini fark eder
  perceive() {
    const g = this.game;
    const eye = this.sightPos(_v);
    if (!this.awake) {
      for (const e of g.enemies.list) {
        if (e.alive && e.group === this.group && e.aiState === 'combat') {
          this.awake = true;
          break;
        }
      }
    }
    const range = this.awake ? TANK.viewRange : TANK.wakeRange;
    let best = null;
    let bestScore = Infinity;
    const consider = (f, bias) => {
      if (!f.alive || f.down) return;
      const d = f.pos.distanceTo(this.pos);
      if (d > range || d * bias >= bestScore) return;
      if (!g.world.canSee(eye, f.chestPos(_v2))) return;
      best = f;
      bestScore = d * bias;
    };
    consider(g.player, 1 / FOE_PLAYER_BIAS);
    for (const a of g.allies.list) consider(a, 1);
    this.visible = !!best;
    if (best) {
      if (this.foe !== best) this.aimT = 0;
      this.foe = best;
      this.lastKnown.copy(best.pos);
      this.lastSeen = g.time;
      if (!this.awake) this.awake = true;
      if (!this.warned && best === g.player) {
        this.warned = true;
        g.events.emit('tankSpotted', this);
        g.allies.onTank?.(this);
      }
    }
  }

  update(dt) {
    const g = this.game;
    if (this.destroyed) return;
    this.updateC4(dt);
    if (this.destroyed) return;
    // C4 noktası: gövde kutusunda oyuncuya en yakın yer (etkileşim buradan ölçülür)
    const P = g.player.pos;
    this.c4Spot.set(clamp(P.x, this.box.minx, this.box.maxx), 1.1, clamp(P.z, this.box.minz, this.box.maxz));
    if (g.cheats.aiOff) return; // konsoldaki "yapay zekâyı dondur" tankı da durdurur
    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = TANK.think;
      this.perceive();
    }
    this.reloadT -= dt;
    // Nişan: görünen hedef, yoksa bir süre son bilinen yer; uyanık değilse gövde yönünde yavaş tarama
    const gun = this.model.gun;
    gun.updateMatrixWorld(true);
    const pivot = gun.getWorldPosition(_v);
    let aimAt = null;
    if (this.visible && this.foe?.alive) aimAt = this.foe.chestPos(_aim);
    else if (this.awake && g.time - this.lastSeen < TANK.forgetTime) aimAt = _aim.copy(this.lastKnown).setY(this.lastKnown.y + 1.1);
    let rel;
    let pitch = 0;
    if (aimAt) {
      rel = angleDiff(this.yaw, dirToYaw(aimAt.x - pivot.x, aimAt.z - pivot.z));
      pitch = clamp(Math.atan2(aimAt.y - pivot.y, Math.hypot(aimAt.x - pivot.x, aimAt.z - pivot.z)), TANK.pitchMin, TANK.pitchMax);
    } else rel = Math.sin(g.time * 0.15 + this.pos.x) * TANK.idleSweep;
    const step = TANK.turnRate * dt;
    let cur = this.aimYaw + clamp(angleDiff(this.aimYaw, rel), -step, step);
    cur = Math.atan2(Math.sin(cur), Math.cos(cur));
    this.setAim(cur, damp(this.aimPitch, pitch, 3, dt));
    // Geri tepme: top geri kayar, gövde hafifçe sallanır
    this.recoil = Math.max(0, this.recoil - dt * 2.2);
    gun.position.z = TANK.gunZ + this.recoil * 0.45;
    this.model.root.rotation.x = -this.recoil * 0.04;
    if (!this.visible || !this.foe?.alive) {
      this.aimT = 0;
      this.coaxLeft = 0;
      return;
    }
    const err = Math.abs(angleDiff(cur, rel));
    const dist = this.foe.pos.distanceTo(this.pos);
    // Ana top: hizalanıp bir an nişan aldıktan sonra; çok yakındaki hedefe namlu eğilemez
    if (err < TANK.fireAlign && dist > TANK.minGunRange) {
      this.aimT += dt;
      if (this.aimT >= TANK.aimTime && this.reloadT <= 0) this.fireMain();
    } else this.aimT = Math.max(0, this.aimT - dt);
    // Eş eksenli makineli: kaba hizada seri atış
    this.coaxCd -= dt;
    if (err < TANK.coaxAlign && dist < TANK.coax.range) this.updateCoax(dt);
    else this.coaxLeft = 0;
  }

  fireMain() {
    const g = this.game;
    const D = g.difficulty;
    this.reloadT = TANK.reload;
    this.aimT = 0;
    this.recoil = 1;
    const gun = this.model.gun;
    gun.updateMatrixWorld(true);
    const muzzle = gun.localToWorld(_mz.copy(this.model.points.muzzle));
    const target = this.foe.chestPos(_aim);
    const dist = muzzle.distanceTo(target);
    const base = _v2.subVectors(target, muzzle).normalize();
    // Uzak mermi yerçekimiyle düşer: biraz yukarı nişan
    base.y += (2.5 * dist) / (TANK.shell.rocketSpeed * TANK.shell.rocketSpeed) * 0.5;
    base.normalize();
    const errRad = (TANK.shell.errDeg + dist * TANK.shell.errPerM) * D.aimMult * DEG;
    const dir = randomInCone(base, errRad, _dir, 0.8);
    g.grenades.spawnRocket(muzzle, dir, TANK.shell, 'enemy');
    g.effects.explosion(muzzle, TANK.muzzleFx);
    g.effects.enemyMuzzle(muzzle, dir);
    g.audio.explosion(muzzle, 0.9);
    const d = muzzle.distanceTo(g.player.pos);
    if (d < 40) g.player.shake(clamp(1 - d / 40, 0.1, 0.6));
    g.events.emit('tankFire', this);
  }

  updateCoax(dt) {
    const K = TANK.coax;
    if (this.coaxLeft <= 0) {
      this.coaxGap -= dt;
      if (this.coaxGap > 0) return;
      this.coaxLeft = Math.round(rand(K.burst[0], K.burst[1]));
      this.coaxGap = rand(K.burstGap[0], K.burstGap[1]);
    }
    if (this.coaxCd > 0) return;
    this.coaxCd = 60 / K.rpm;
    this.coaxLeft--;
    this.fireCoax();
  }

  // Makineli mermisi: dünya ya da hedefin vuruş silindiri; izli mermi, vızıltı
  fireCoax() {
    const g = this.game;
    const D = g.difficulty;
    const K = TANK.coax;
    const F = this.foe;
    const P = g.player;
    const gun = this.model.gun;
    const muzzle = gun.localToWorld(_mz.copy(this.model.points.coax));
    const target = F.chestPos(_aim);
    const dist = muzzle.distanceTo(target);
    const base = _v2.subVectors(target, muzzle).normalize();
    let err = K.errDeg * D.aimMult * (0.6 + dist / 40);
    err *= 1 + clamp((F.horizSpeed || 0) / 4.5, 0, 1.5) * 0.8;
    const d = randomInCone(base, err * DEG, _dir, 0.8);
    const wh = g.world.raycast(muzzle, d, K.range, _hit);
    const maxT = wh ? wh.dist : K.range;
    const h = rayCylinder(muzzle, d, F.pos.x, F.pos.z, 0.38, F.pos.y, F.pos.y + (F.state?.height || 1.8) + 0.05, maxT);
    let end;
    if (h >= 0) {
      const zone = playerZoneAt(muzzle.y + d.y * h - F.pos.y, F.state?.height || 1.8);
      F.takeDamage(K.damage * D.damageMult * (F === P ? 1 : ALLY.damageTaken), this.pos, { zone, pen: enemyPen('coax'), source: 'tank' });
      end = _v.copy(muzzle).addScaledVector(d, h);
      g.effects.impact(end, _aim.copy(d).negate(), 'flesh', 0.3);
    } else {
      end = wh ? _v.copy(wh.point) : _v.copy(muzzle).addScaledVector(d, K.range);
      if (wh && muzzle.distanceTo(g.camera.position) < 90) g.effects.impact(wh.point, wh.normal, wh.surface, 0.7);
      // Oyuncunun başının yakınından geçti: vızıltı
      const head = P.headPos(_aim);
      const t = _v2.subVectors(head, muzzle).dot(d);
      if (t > 0 && t < maxT) {
        const miss = _v2.copy(muzzle).addScaledVector(d, t).distanceTo(head);
        if (miss < 1.6) {
          g.audio.whiz(0);
          g.events.emit('suppressed');
        }
      }
    }
    g.effects.tracer(muzzle, end, 380, 0.035);
    g.audio.gunshot('enemyLmg', muzzle);
    if (muzzle.distanceTo(g.camera.position) < 80) g.effects.enemyMuzzle(muzzle, d);
  }

  // Oyuncu mermisi zırha çarptı: hasar yok; birkaç atıştan sonra ipucu
  onShot() {
    if (this.destroyed) return;
    this.awake = true;
    this.shotHint++;
    if (this.shotHint === TANK.shotHintAfter) this.game.events.emit('message', 'MERMİ ZIRHI DELMEZ · ROKETATAR YA DA C4 KULLAN', 'warn');
  }

  // Patlama: gövde kutusuna uzaklığa göre hasar. Ağır patlayıcı (roket, C4) tam, hafif (el bombası, varil) az işler
  onExplosion(pos, radius, damage, owner) {
    if (this.destroyed || owner === 'enemy') return;
    const b = this.box;
    const dx = Math.max(b.minx - pos.x, 0, pos.x - b.maxx);
    const dz = Math.max(b.minz - pos.z, 0, pos.z - b.maxz);
    const dy = Math.max(0, pos.y - TANK.turretColH);
    const d = Math.hypot(dx, dy, dz);
    const reach = radius * TANK.splashReach;
    if (d > reach) return;
    const f = d <= TANK.hitRadius ? 1 : clamp(1 - (d - TANK.hitRadius) / Math.max(0.1, reach - TANK.hitRadius), 0, 1);
    const mult = damage >= TANK.explosiveHeavy ? TANK.heavyMult : TANK.lightMult;
    this.damage(damage * mult * f, owner);
  }

  damage(amount, owner) {
    const g = this.game;
    if (this.destroyed || amount <= 0) return;
    this.hp -= amount;
    this.awake = true;
    if (owner === 'player') {
      g.events.emit('hitmarker', this.hp <= 0 ? 'kill' : 'hit');
      g.audio.hitmarker(this.hp <= 0 ? 'kill' : 'hit');
    }
    if (this.hp <= 0) this.destroy();
    else if (owner === 'player') g.events.emit('message', `TANK HASAR ALDI · %${Math.round((this.hp / TANK.hp) * 100)}`, 'info');
  }

  plant() {
    const g = this.game;
    this.planted = true;
    this.fuse = C4.fuse;
    this.beepT = 0;
    const c = buildC4();
    c.root.position.copy(this.c4Spot).setY(TANK.c4Y);
    c.root.rotation.y = rand(0, 3);
    g.scene.add(c.root);
    this.c4 = c;
    g.events.emit('message', 'C4 YERLEŞTİRİLDİ — UZAKLAŞ!', 'warn');
    g.audio.beep(2200, 0.08, 0.3, this.pos);
  }

  updateC4(dt) {
    if (!this.planted) return;
    const g = this.game;
    this.fuse -= dt;
    this.beepT -= dt;
    if (this.beepT <= 0) {
      this.beepT = clamp(this.fuse / C4.fuse, 0.08, 1) * 0.7;
      g.audio.beep(2400, 0.05, 0.25, this.pos);
      if (this.c4) this.c4.light.visible = true;
    } else if (this.c4 && this.beepT < 0.05) this.c4.light.visible = false;
    if (this.fuse <= 0) {
      this.planted = false;
      const p = this.c4.root.position.clone();
      this.c4.root.removeFromParent();
      this.c4 = null;
      this.destroy();
      g.explode(p, C4.radius, C4.damage, 'player', 1.8);
    }
  }

  // İmha: büyük patlama, kararmış gövde, yana kaymış taret, uzun süre yanan ateş
  destroy() {
    const g = this.game;
    if (this.destroyed) return;
    this.destroyed = true;
    this.hp = 0;
    const m = this.model;
    for (const mesh of m.meshes) mesh.material = m.burnt;
    m.turret.rotation.z = 0.12;
    m.turret.rotation.y += rand(-0.5, 0.5);
    m.turret.position.y += 0.15;
    m.gun.rotation.x = -0.12;
    m.root.rotation.x = 0;
    const p = m.turret.getWorldPosition(new THREE.Vector3());
    g.explode(p.clone().setY(p.y + 0.5), TANK.wreckBlast.radius, TANK.wreckBlast.damage, 'player', 2.2);
    g.effects.addEmitter({
      rate: 26,
      life: 120,
      spawn: (fx) => {
        const c = fx._c.setRGB(1, rand(0.35, 0.6), 0.1);
        fx.add.spawn(p.x + rand(-1, 1), p.y + rand(0, 0.6), p.z + rand(-1, 1), rand(-0.3, 0.3), rand(1.5, 3.5), rand(-0.3, 0.3), rand(0.4, 0.9), 1.1, 0.35, c, 0.9, -1, 0.5);
        if (Math.random() < 0.5) {
          const gg = rand(0.06, 0.14);
          fx.smoke.spawn(p.x + rand(-0.6, 0.6), p.y + 1, p.z + rand(-0.6, 0.6), rand(0.2, 0.8), rand(2.5, 4), rand(-0.3, 0.3), rand(5, 8), 1.4, 6, fx._c.setRGB(gg, gg, gg), 0.65, -0.1, 0.1);
        }
      },
    });
    g.addScore(TANK.score, 'TANK İMHA EDİLDİ');
    g.stats.tanks = (g.stats.tanks || 0) + 1;
    g.events.emit('tankDestroyed', this);
    g.events.emit('message', 'TANK İMHA EDİLDİ', 'info');
  }
}
