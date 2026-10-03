// El bombaları ve patlamalar: sekme fiziği, fitil, alan hasarı (görüş hattı kontrollü), sarsıntı.
import * as THREE from 'three';
import { GRENADE, ALLY } from './config.js';
import { buildGrenade, buildSmokeGrenade, buildRocket } from './models.js';
import { clamp, rand, rayCylinder } from './util.js';
import { ARMOR_DATA } from './armor.js';
import { CONSUMABLES } from './loadout.js';

// Sis bombası ayarları (data/store.json → consumables.smoke)
const SMOKE = CONSUMABLES.get('smoke');

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const _hit = {};
const NEGZ = new THREE.Vector3(0, 0, -1);

export class GrenadeSystem {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.rockets = [];
  }

  // Roket: hafif yerçekimli hızlı cisim; dünyaya ya da düşmana çarpınca patlar
  spawnRocket(pos, dir, data, owner) {
    const mesh = buildRocket();
    mesh.position.copy(pos);
    mesh.quaternion.setFromUnitVectors(NEGZ, dir);
    this.game.scene.add(mesh);
    this.rockets.push({ mesh, pos: mesh.position, vel: dir.clone().multiplyScalar(data.rocketSpeed), data, owner, life: 6, age: 0 });
  }

  updateRockets(dt) {
    const g = this.game;
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.life -= dt;
      r.age += dt;
      r.vel.y -= 2.5 * dt;
      const len = r.vel.length() * dt;
      _d.copy(r.vel).normalize();
      let point = null;
      let enemyHit = null;
      if (r.life <= 0) point = r.pos.clone();
      else {
        const wh = g.world.raycast(r.pos, _d, len + 0.15, _hit);
        const maxT = wh ? wh.dist : len + 0.15;
        // Düşman mermisi (tank topu) düşman askerlerinin içinden geçer; oyuncuya ya da dost askere çarpar
        const eh = r.owner === 'enemy' ? null : g.enemies.raycast(r.pos, _d, maxT);
        const fh = r.owner === 'enemy' ? this.foeHit(r.pos, _d, maxT) : -1;
        if (eh) {
          point = eh.point.clone();
          enemyHit = eh;
        } else if (fh >= 0) point = r.pos.clone().addScaledVector(_d, fh);
        else if (wh) point = wh.point.clone().addScaledVector(wh.normal, 0.25);
      }
      if (point) {
        this.rockets.splice(i, 1);
        r.mesh.removeFromParent();
        if (enemyHit && r.owner === 'player') {
          const out = enemyHit.enemy.takeDamage(r.data.damage, { zone: enemyHit.zone, dir: _d.clone(), point, source: 'player', weapon: 'rpg' });
          if (out.killed) {
            g.events.emit('hitmarker', 'kill');
            g.audio.hitmarker('kill');
          }
        }
        g.explode(point, r.data.splashRadius, r.data.splashDamage, r.owner, 1.25);
        continue;
      }
      r.pos.addScaledVector(r.vel, dt);
      r.mesh.quaternion.setFromUnitVectors(NEGZ, _d);
      // Duman izi ve itki alevi
      const fx = g.effects;
      const tail = _v.copy(r.pos).addScaledVector(_d, 0.3);
      fx.add.spawn(tail.x, tail.y, tail.z, -_d.x * 4, -_d.y * 4, -_d.z * 4, 0.08, 0.35, 0.1, fx._c.setRGB(1, 0.7, 0.3), 1);
      for (let k = 0; k < 2; k++) {
        const s = rand(0.18, 0.28);
        fx.smoke.spawn(tail.x + rand(-0.05, 0.05), tail.y + rand(-0.05, 0.05), tail.z + rand(-0.05, 0.05), rand(-0.3, 0.3), rand(0.1, 0.5), rand(-0.3, 0.3), rand(1.2, 2.2), 0.25, 1.4, fx._c.setRGB(s * 3, s * 2.9, s * 2.7), 0.5, -0.15, 0.6);
      }
      if (r.age < 0.05) fx.flashLight(r.pos, 0xffa050, 30, 6, 0.06);
    }
  }

  // Işın oyuncunun ya da bir dostun vuruş silindirine çarpıyor mu? (en yakın uzaklık, yoksa -1)
  foeHit(o, d, maxT) {
    const g = this.game;
    let best = -1;
    const test = (f) => {
      if (!f.alive) return;
      const t = rayCylinder(o, d, f.pos.x, f.pos.z, 0.45, f.pos.y, f.pos.y + (f.state?.height || 1.8) + 0.05, best >= 0 ? best : maxT);
      if (t >= 0) best = t;
    };
    test(g.player);
    for (const a of g.allies.list) test(a);
    return best;
  }

  // kind: 'frag' (parça tesirli) | 'smoke' (sis: patlamaz, fitil bitince bulut açar)
  spawn(pos, vel, fuse, owner, kind = 'frag') {
    const mesh = kind === 'smoke' ? buildSmokeGrenade() : buildGrenade();
    mesh.position.copy(pos);
    mesh.traverse((o) => o.isMesh && (o.castShadow = true));
    this.game.scene.add(mesh);
    const g = { mesh, kind, pos: mesh.position, vel: vel.clone(), fuse, owner, spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, 0), rest: false, bounces: 0 };
    this.list.push(g);
    return g;
  }

  clear() {
    for (const g of this.list) g.mesh.removeFromParent();
    for (const r of this.rockets) r.mesh.removeFromParent();
    this.list = [];
    this.rockets = [];
    this.game.world.smokes.length = 0;
  }

  // Sis bulutu: yoğunluğu önce artar, süre sonunda azalır; görüş engeli world.smokes'tan okunur
  popSmoke(pos) {
    const W = this.game.world;
    W.smokes.push({ pos: new THREE.Vector3(pos.x, Math.max(pos.y, 0) + SMOKE.height, pos.z), base: pos.clone(), r: SMOKE.radius, density: 0, age: 0, emitT: 0 });
    this.game.audio.smokePop?.(pos);
  }

  updateSmokes(dt) {
    const list = this.game.world.smokes;
    const fx = this.game.effects;
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      s.age += dt;
      if (s.age >= SMOKE.duration) {
        list.splice(i, 1);
        continue;
      }
      const left = SMOKE.duration - s.age;
      s.density = Math.min(1, s.age / SMOKE.grow) * Math.min(1, left / SMOKE.fade);
      // Yerden kabaran gri bulut: ilk saniyelerde fışkırma, sonra bulutu ayakta tutan seyrek puflar
      s.emitT -= dt * SMOKE.puffsPerSec * (s.age < SMOKE.grow ? 2 : 1) * (left > SMOKE.fade ? 1 : 0.3);
      while (s.emitT < 0) {
        s.emitT += 1;
        const a = Math.random() * Math.PI * 2;
        const d = Math.sqrt(Math.random()) * s.r * 0.75 * Math.min(1, 0.35 + s.age / SMOKE.grow);
        const shade = rand(0.62, 0.78);
        fx.smoke.spawn(s.base.x + Math.cos(a) * d, s.base.y + rand(0.2, 1.4), s.base.z + Math.sin(a) * d, rand(-0.25, 0.25), rand(0.05, 0.3), rand(-0.25, 0.25), rand(3.5, 5), rand(1.6, 2.4), rand(3.4, 4.6), fx._c.setRGB(shade, shade, shade * 0.97), 0.55, -0.02, 0.3, rand(-0.3, 0.3), 0.5);
      }
    }
  }

  update(dt) {
    this.updateRockets(dt);
    if (this.game.world.smokes.length) this.updateSmokes(dt);
    const W = this.game.world;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const g = this.list[i];
      g.fuse -= dt;
      if (g.fuse <= 0) {
        this.list.splice(i, 1);
        g.mesh.removeFromParent();
        if (g.kind === 'smoke') this.popSmoke(g.pos);
        else this.game.explode(g.pos.clone().setY(g.pos.y + 0.1), GRENADE.radius, GRENADE.damage, g.owner, 1);
        continue;
      }
      if (g.rest) continue;
      g.vel.y -= 15 * dt;
      const step = g.vel.length() * dt;
      if (step > 1e-5) {
        _d.copy(g.vel).normalize();
        const h = W.raycast(g.pos, _d, step + 0.06, _hit);
        if (h) {
          // Yüzeye göre yansıt ve sönümle
          g.pos.copy(h.point).addScaledVector(h.normal, 0.07);
          const vn = g.vel.dot(h.normal);
          g.vel.addScaledVector(h.normal, -(1 + GRENADE.bounce) * vn);
          g.vel.multiplyScalar(0.6);
          g.bounces++;
          if (Math.abs(vn) > 1.5) this.game.audio.mech('bounce', g.pos);
          if (h.normal.y > 0.7 && g.vel.length() < 0.8) {
            g.rest = true;
            g.vel.set(0, 0, 0);
          }
        } else {
          g.pos.addScaledVector(g.vel, dt);
        }
      }
      g.mesh.rotation.x += g.spin.x * dt;
      g.mesh.rotation.y += g.spin.y * dt;
      if (g.pos.y < 0.05) {
        g.pos.y = 0.05;
        if (g.vel.y < 0) g.vel.y *= -0.3;
        g.vel.x *= 0.7;
        g.vel.z *= 0.7;
        if (g.vel.length() < 0.6) g.rest = true;
      }
    }
  }

  // HUD el bombası uyarısı için: oyuncuya yakın düşman bombaları
  dangerNear(pos, radius) {
    const out = [];
    for (const g of this.list) {
      if (g.owner === 'player' || g.owner === 'ally' || g.kind === 'smoke') continue;
      if (g.pos.distanceTo(pos) < radius) out.push(g);
    }
    return out;
  }
}

// Alan hasarı uygulaması (Game.explode tarafından çağrılır)
export function applyRadialDamage(game, pos, radius, damage, owner) {
  const W = game.world;
  const P = game.player;
  const result = { kills: 0 };
  // Oyuncu
  if (P.alive) {
    const c = P.chestPos(_v);
    const d = c.distanceTo(pos);
    if (d < radius) {
      const los = W.lineOfSight(pos, c) || W.lineOfSight(pos, P.headPos(new THREE.Vector3()));
      const f = Math.pow(1 - d / radius, 1.4) * (los ? 1 : 0.2);
      // Oyuncunun kendi bombası daha az acıtır ama yine tehlikeli; manganın bombası oyuncuyu yaralamaz
      const mult = owner === 'player' ? 0.7 : game.difficulty.damageMult;
      // Patlama gövdeye gelir; parça tesiri zırhı kısmen deler
      if (f > 0.01 && owner !== 'ally') P.takeDamage(damage * f * mult, pos, { zone: 'torso', pen: ARMOR_DATA.explosivePen, source: 'explosion' });
    }
  }
  // Dost askerler: düşman patlamasından etkilenir, oyuncunun ve manganın patlamasından değil (dost ateşi kapalı)
  if (owner !== 'player' && owner !== 'ally') {
    for (const a of game.allies.list) {
      if (!a.alive) continue;
      const c = a.chestPos(_v);
      const d = c.distanceTo(pos);
      if (d > radius) continue;
      const f = Math.pow(1 - d / radius, 1.4) * (W.lineOfSight(pos, c) ? 1 : 0.2);
      if (f > 0.01) a.takeDamage(damage * f * ALLY.damageTaken, pos);
    }
  }
  let hitAny = false;
  for (const e of game.enemies.list) {
    if (!e.alive) continue;
    const c = e.chestPos(_v);
    const d = c.distanceTo(pos);
    if (d > radius) continue;
    const los = W.lineOfSight(pos, c);
    const f = Math.pow(1 - d / radius, 1.1) * (los ? 1 : 0.25);
    if (f < 0.01) continue;
    const dir = new THREE.Vector3().subVectors(c, pos).normalize();
    const src = owner === 'player' ? 'player' : owner === 'ally' ? 'ally' : 'env';
    const out = e.takeDamage(damage * f * (owner === 'player' ? 1.3 : 0.8), { zone: 'torso', dir, point: c.clone(), source: src, weapon: 'explosion' });
    if (out.killed && owner === 'player') result.kills++;
    if (owner === 'player') hitAny = true;
  }
  if (hitAny) {
    game.events.emit('hitmarker', result.kills ? 'kill' : 'hit');
    game.audio.hitmarker(result.kills ? 'kill' : 'hit');
  }
  // Zincirleme: yakındaki patlayıcı variller
  for (const b of game.barrels) {
    if (b.dead) continue;
    const d = b.pos.distanceTo(pos);
    if (d < radius * 0.8) b.onShot(200 * (1 - d / radius) + 10, pos);
  }
  const dist = P.pos.distanceTo(pos);
  P.shake(clamp(1.2 - dist / (radius * 3), 0, 1));
  return result;
}
