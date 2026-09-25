// El bombaları ve patlamalar: sekme fiziği, fitil, alan hasarı (görüş hattı kontrollü), sarsıntı.
import * as THREE from 'three';
import { GRENADE } from './config.js';
import { buildGrenade } from './models.js';
import { clamp } from './util.js';

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const _hit = {};

export class GrenadeSystem {
  constructor(game) {
    this.game = game;
    this.list = [];
  }

  spawn(pos, vel, fuse, owner) {
    const mesh = buildGrenade();
    mesh.position.copy(pos);
    mesh.traverse((o) => o.isMesh && (o.castShadow = true));
    this.game.scene.add(mesh);
    const g = { mesh, pos: mesh.position, vel: vel.clone(), fuse, owner, spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, 0), rest: false, bounces: 0 };
    this.list.push(g);
    return g;
  }

  clear() {
    for (const g of this.list) g.mesh.removeFromParent();
    this.list = [];
  }

  update(dt) {
    const W = this.game.world;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const g = this.list[i];
      g.fuse -= dt;
      if (g.fuse <= 0) {
        this.list.splice(i, 1);
        g.mesh.removeFromParent();
        this.game.explode(g.pos.clone().setY(g.pos.y + 0.1), GRENADE.radius, GRENADE.damage, g.owner, 1);
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
      if (g.owner === 'player') continue;
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
      // Oyuncunun kendi bombası daha az acıtır ama yine tehlikeli
      const mult = owner === 'player' ? 0.7 : game.difficulty.damageMult;
      if (f > 0.01) P.takeDamage(damage * f * mult, pos);
    }
  }
  for (const e of game.enemies.list) {
    if (!e.alive) continue;
    const c = e.chestPos(_v);
    const d = c.distanceTo(pos);
    if (d > radius) continue;
    const los = W.lineOfSight(pos, c);
    const f = Math.pow(1 - d / radius, 1.1) * (los ? 1 : 0.25);
    if (f < 0.01) continue;
    const dir = new THREE.Vector3().subVectors(c, pos).normalize();
    const out = e.takeDamage(damage * f * (owner === 'player' ? 1.3 : 0.8), { zone: 'torso', dir, point: c.clone(), source: owner === 'player' ? 'player' : 'env', weapon: 'explosion' });
    if (out.killed && owner === 'player') result.kills++;
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
