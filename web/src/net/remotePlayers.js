// Uzak oyuncular (S4–S6): sunucunun anlık görüntülerinden aralanan asker modelleri. Görüntü, sunucu saatinin
// ONLINE.interpMs gerisinde çizilir (iki görüntü arasında konum ve bakış aralanır; görüntü gecikirse en çok
// ONLINE.extrapolateMs hızla ileri tahmin edilir). Aynı taraftakiler mavi (dost) görünüm ve ad etiketi,
// rakipler düşman görünümü; rakibin adı yalnız nişangâh üstündeyken görünür.
import * as THREE from 'three';
import { createSoldier } from '../soldier.js';
import { ALLY, ENEMY_TYPES, ONLINE, WEAPONS, WEAPON_ORDER } from '../config.js';
import { PF, RF, SIDE } from '../../shared/net/protocol.js';
import { TICK_RATE } from '../../shared/constants.js';
import { clamp } from '../util.js';

const BUF = 48;
const TAG_RANGE = 60;
const _v = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const ANIM = { pos: null, yaw: 0, vel: null, crouch: false, aimPitch: 0, stance: 'ready', reload: -1, throw: -1, dist: 0, mount: null, hideGun: false };

const angleLerp = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

class Remote {
  constructor(game, slot) {
    this.game = game;
    this.slot = slot;
    this.buf = [];
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.crouchT = 0;
    this.flags = 0;
    this.weapon = 0;
    this.hp = 100;
    this.alive = false;
    this.friendly = null;
    this.model = null;
    this.death = { deathT: 0, fallDir: 1, fallSide: 0 };
    this.reloadT = -1;
    this.info = null;
    this.hasPose = false;
  }

  // Görünüm tarafa göre (dost mavi, rakip düşman üniforması); taraf değişirse model yeniden kurulur
  ensureModel(friendly) {
    if (this.model && this.friendly === friendly) return;
    this.dispose();
    this.friendly = friendly;
    this.model = friendly ? createSoldier('ally', ALLY.colors) : createSoldier('rifleman', ENEMY_TYPES.rifleman.colors);
    this.game.scene.add(this.model.root);
    this.model.root.visible = false;
  }

  push(tick, p) {
    const b = this.buf;
    if (b.length && tick <= b[b.length - 1].tick) return;
    const e = b.length >= BUF ? b.shift() : {};
    e.tick = tick;
    e.x = p.pos.x;
    e.y = p.pos.y;
    e.z = p.pos.z;
    e.vx = p.vel.x;
    e.vz = p.vel.z;
    e.yaw = p.yaw;
    e.pitch = p.pitch;
    e.crouchT = p.crouchT;
    e.flags = p.flags;
    e.weapon = p.weapon;
    e.hp = p.hp;
    b.push(e);
  }

  clear() {
    this.buf.length = 0;
    this.hasPose = false;
  }

  // Görüntü zamanı (tick, kesirli) için poz: iki görüntü arası aralanır; tampon bittiyse (görüntü gecikti)
  // son hızla kısa süre ileri tahmin edilir, sonra durur
  sample(t) {
    const b = this.buf;
    if (!b.length) return false;
    let i = b.length - 1;
    while (i > 0 && b[i].tick > t) i--;
    const a = b[i];
    const c = b[i + 1];
    let cur = a;
    if (c && t >= a.tick) {
      const k = (t - a.tick) / (c.tick - a.tick);
      this.pos.set(a.x + (c.x - a.x) * k, a.y + (c.y - a.y) * k, a.z + (c.z - a.z) * k);
      this.yaw = angleLerp(a.yaw, c.yaw, k);
      this.pitch = a.pitch + (c.pitch - a.pitch) * k;
      this.crouchT = a.crouchT + (c.crouchT - a.crouchT) * k;
      if (k >= 0.5) cur = c;
    } else {
      const ext = t > a.tick && a.flags & PF.ALIVE ? clamp((t - a.tick) / TICK_RATE, 0, ONLINE.extrapolateMs / 1000) : 0;
      this.pos.set(a.x + a.vx * ext, a.y, a.z + a.vz * ext);
      this.yaw = a.yaw;
      this.pitch = a.pitch;
      this.crouchT = a.crouchT;
    }
    this.vel.set(cur.vx, 0, cur.vz);
    this.flags = cur.flags;
    this.weapon = cur.weapon;
    this.hp = cur.hp;
    this.hasPose = true;
    return true;
  }

  dispose() {
    if (this.model) this.model.dispose();
    this.model = null;
  }
}

export class RemotePlayers {
  constructor(game) {
    this.game = game;
    this.map = new Map(); // yuva → Remote
    this.roster = new Map(); // yuva → { name, tag, side, flags, party, ... }
    this.mySlot = -1;
    this.mySide = SIDE.NONE;
    this.sided = false;
    this.tagPool = [];
    this.renderTick = 0;
  }

  get(slot) {
    let r = this.map.get(slot);
    if (!r) {
      r = new Remote(this.game, slot);
      this.map.set(slot, r);
    }
    return r;
  }

  isFriendly(slot) {
    if (!this.sided) return false;
    const info = this.roster.get(slot);
    return !!info && info.side === this.mySide;
  }

  setRoster(players, mySlot) {
    this.mySlot = mySlot;
    this.roster.clear();
    for (const p of players) this.roster.set(p.slot, p);
    const me = this.roster.get(mySlot);
    this.mySide = me ? me.side : SIDE.NONE;
    this.sided = this.mySide !== SIDE.NONE;
    // Listeden çıkan oyuncunun modeli kalkar
    for (const [slot, r] of this.map) {
      if (!this.roster.has(slot) || slot === mySlot) {
        r.dispose();
        this.map.delete(slot);
      }
    }
    for (const p of players) {
      if (p.slot === mySlot) continue;
      const r = this.get(p.slot);
      r.info = p;
      r.ensureModel(this.isFriendly(p.slot));
    }
  }

  onSnapshot(s) {
    for (const p of s.players) {
      if (p.slot === this.mySlot || !this.roster.has(p.slot)) continue;
      this.get(p.slot).push(s.tick, p);
    }
  }

  onSpawn(slot, pos, yaw) {
    const r = this.map.get(slot);
    if (!r) return;
    r.clear();
    r.alive = true;
    r.pos.set(pos.x, pos.y, pos.z);
    r.yaw = yaw;
    if (r.model) r.model.reset(r.pos, yaw);
  }

  onKilled(slot, fromPos) {
    const r = this.map.get(slot);
    if (!r || !r.model) return;
    r.alive = false;
    const D = r.death;
    D.deathT = 0;
    // Atıştan uzağa devrilir
    let dir = null;
    if (fromPos) {
      _v.set(r.pos.x - fromPos.x, 0, r.pos.z - fromPos.z).normalize();
      dir = _v;
      const fwdX = -Math.sin(r.yaw);
      const fwdZ = -Math.cos(r.yaw);
      D.fallDir = _v.x * fwdX + _v.z * fwdZ >= 0 ? 1 : -1;
    } else D.fallDir = 1;
    D.fallSide = (Math.random() - 0.5) * 0.6;
    r.model.die({ dir }, this.game);
  }

  // Ateş eden uzak oyuncu: namlu konumu (iz başlangıcı), görsel tepme
  muzzleOf(slot, out) {
    const r = this.map.get(slot);
    if (!r || !r.model || !r.model.root.visible) return null;
    r.model.fire(0.6);
    return r.model.muzzleWorld(out);
  }

  posOf(slot) {
    const r = this.map.get(slot);
    return r && r.hasPose ? r.pos : null;
  }

  update(dt, renderTick) {
    this.renderTick = renderTick;
    const cam = this.game.camera.position;
    for (const r of this.map.values()) {
      if (!r.model) continue;
      const had = r.sample(renderTick);
      const aliveNow = !!(r.flags & PF.ALIVE);
      if (!had) {
        r.model.root.visible = false;
        continue;
      }
      if (aliveNow && !r.alive) {
        // Doğuşu kaçırdık (bağlanınca): modeli o konuma kur
        r.alive = true;
        r.model.reset(r.pos, r.yaw);
      }
      if (!r.alive) {
        r.death.deathT += dt;
        if (r.death.deathT < 3) r.model.updateDeath(dt, r.death, r.pos, r.yaw);
        else r.model.hide();
        continue;
      }
      r.model.root.visible = true;
      if (r.flags & PF.RELOADING) r.reloadT = r.reloadT < 0 ? 0 : Math.min(0.99, r.reloadT + dt / 2.2);
      else r.reloadT = -1;
      ANIM.pos = r.pos;
      ANIM.yaw = r.yaw;
      ANIM.vel = r.vel;
      ANIM.crouch = !!(r.flags & PF.CROUCHED);
      ANIM.aimPitch = clamp(r.pitch, -0.7, 0.7);
      ANIM.stance = r.flags & (PF.ADS | PF.FIRING) ? 'aim' : r.flags & PF.SPRINTING ? 'relaxed' : 'ready';
      ANIM.reload = r.reloadT;
      ANIM.dist = r.pos.distanceTo(cam);
      r.model.animate(dt, ANIM);
    }
  }

  // Ad etiketleri: dostlar her zaman, rakip yalnız nişangâhtayken ve görünürken
  updateTags(hud, width, height) {
    const g = this.game;
    const P = g.player;
    g.camera.getWorldDirection(_fwd);
    let at = 0;
    for (const r of this.map.values()) {
      if (!r.model || !r.alive || !r.hasPose || !r.info) continue;
      const d = r.pos.distanceTo(P.pos);
      if (d > TAG_RANGE) continue;
      const friendly = this.isFriendly(r.slot);
      _v.set(r.pos.x, r.pos.y + (r.flags & PF.CROUCHED ? 1.6 : 2.05), r.pos.z);
      if (!friendly) {
        const dir = _v.clone().sub(g.camera.position);
        const len = dir.length();
        if (dir.dot(_fwd) / len < Math.cos(0.07)) continue;
        if (!g.world.lineOfSight(g.camera.position, _v)) continue;
      }
      const s = hud.project(_v, {});
      if (s.behind || s.x < 0 || s.x > width || s.y < 0 || s.y > height) continue;
      let el = this.tagPool[at];
      if (!el) {
        el = document.createElement('div');
        el.innerHTML = '<span></span><i></i>';
        hud.el.icons.appendChild(el);
        this.tagPool.push(el);
      }
      at++;
      el.hidden = false;
      el.className = `atag net${friendly ? '' : ' foe'}${r.info.flags & RF.BOT ? ' bot' : ''}`;
      const txt = r.info.flags & RF.BOT ? `${r.info.name} · YZ` : r.info.name;
      if (el.firstChild.textContent !== txt) el.firstChild.textContent = txt;
      el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
      el.style.opacity = String(clamp(1.2 - d / TAG_RANGE, 0.45, 1));
    }
    for (let i = at; i < this.tagPool.length; i++) this.tagPool[i].hidden = true;
  }

  weaponOf(slot) {
    const r = this.map.get(slot);
    const id = r ? WEAPON_ORDER[r.weapon] : null;
    return id && WEAPONS[id] ? WEAPONS[id] : WEAPONS.rifle;
  }

  dispose() {
    for (const r of this.map.values()) r.dispose();
    this.map.clear();
    for (const el of this.tagPool) el.remove();
    this.tagPool = [];
  }
}

