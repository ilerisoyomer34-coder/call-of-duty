// Oyuncu silah sistemi: envanter, durum makinesi (idle/reload/equip/unequip/melee/throw),
// kare hızından bağımsız atış zamanlaması, hitscan (kamera merkezinden + namlu doğrulaması),
// sapma (bloom), geri tepme, cephane, ateş modları, el bombası ve bıçak.
import * as THREE from 'three';
import { WEAPONS, GRENADE, MELEE, SCORE } from './config.js';
import { DEG, clamp, rand } from './util.js';
import { Rng, inCone } from '../shared/sim/rng.js';
import { fireInterval, recoverBloom, spreadDeg, triggerShots, recordShot, addBloom, recoilKick, pelletDir } from '../shared/sim/weapon.js';
import { EV } from './events.js';
import { CONSUMABLES } from './loadout.js';

export class Weapon {
  constructor(id) {
    const d = WEAPONS[id];
    this.id = id;
    this.data = d;
    this.mag = d.magSize;
    this.reserve = d.reserveStart;
    this.modeIdx = 0;
    this.cooldown = 0;
    this.bloom = 0;
    this.shotIndex = 0;
    this.lastShot = -10;
    this.burstLeft = 0;
    this.pumpT = -1; // pompa animasyonu zamanlayıcısı
    this.slideLocked = false;
  }
  get mode() {
    return this.data.fireModes[this.modeIdx];
  }
  get interval() {
    return fireInterval(this.data);
  }
}

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _muz = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _hit = {};
const _hit2 = {};
const _kick = [0, 0];

export class PlayerWeapons {
  constructor(game) {
    this.game = game;
    this.owned = {};
    this.slots = [];
    this.currentId = null;
    this.state = 'idle';
    this.stateT = 0;
    this.pending = null;
    this.lastId = null;
    this.grenades = GRENADE.startCount;
    // Teçhizattan gelen (satın alınmış) el bombaları toplamın içindedir ve en son atılır: önce görevin verdiği
    // bombalar harcanır, satın alınanlar yalnız gerekince envanterden düşer (kit.js)
    this.kitFrags = 0;
    this.throwKind = 'frag'; // 'frag' | 'smoke'
    this.cookAction = 'grenade'; // pimi çekilen bombayı tutan tuş (el bombası ya da sarf yuvası)
    this.cookT = 0;
    this.meleeHitDone = false;
    this.reload = null; // { t, dur, empty, inserted, phase }
    this.fireBuffer = 0;
    this.time = 0;
    // Saçılma ve geri tepmenin rastgele payı tohumlu üreteçten (shared/sim/weapon.js; sunucu da aynısını kullanır)
    this.rng = new Rng(1);
    // Tempo kuralına verilen geri çağrılar bir kez kurulur (her kare kapanış ayırmasın)
    this.hasAmmo = () => this.current.mag > 0 || this.game.cheats.infiniteAmmo;
    this.fireOnce = () => this.fire();
  }

  reset(loadout) {
    // Tek oyunculuda tohum her görev başında yeni; çevrim içide sunucu verir
    this.rng.seed((Math.random() * 4294967296) >>> 0);
    this.owned = {};
    this.slots = (loadout.slots || Object.keys(loadout.weapons)).filter((id) => WEAPONS[id]);
    for (const [id, ammo] of Object.entries(loadout.weapons)) {
      if (!WEAPONS[id]) continue;
      const w = new Weapon(id);
      if (ammo) {
        w.mag = ammo.mag;
        w.reserve = ammo.reserve;
      }
      this.owned[id] = w;
    }
    this.grenades = (loadout.grenades ?? GRENADE.startCount) + this.kitFrags;
    this.currentId = loadout.current && this.owned[loadout.current] ? loadout.current : Object.keys(this.owned)[0];
    this.lastId = null;
    this.state = 'equipping';
    this.stateT = 0;
    this.reload = null;
    this.cookT = 0;
    this.game.events.emit('weapon', this.current);
    this.game.events.emit('ammo', this.current);
    this.game.events.emit('grenades', this.grenades);
  }

  snapshot() {
    const weapons = {};
    for (const [id, w] of Object.entries(this.owned)) weapons[id] = { mag: w.mag, reserve: w.reserve };
    return { weapons, slots: [...this.slots], grenades: Math.max(0, this.grenades - this.kitFrags), current: this.currentId };
  }

  // Görevde iki slot (ana + yan). Aynı türden bir silah alınınca eldeki düşer.
  // Dönüş: { dropped: {id, mag, reserve} | null, refilled: bool }
  pickUp(id, ammo = null) {
    const d = WEAPONS[id];
    const g = this.game;
    if (this.owned[id]) {
      const w = this.owned[id];
      w.reserve = Math.min(d.reserveMax, w.reserve + (ammo ? ammo.mag + ammo.reserve : d.magSize * 2));
      g.events.emit('ammo', this.current);
      return { dropped: null, refilled: true };
    }
    const w = new Weapon(id);
    if (ammo) {
      w.mag = ammo.mag;
      w.reserve = ammo.reserve;
    }
    let dropped = null;
    let idx = this.slots.findIndex((s) => WEAPONS[s].category === d.category);
    if (this.slots.length < 2 || idx < 0) {
      this.slots.push(id);
      idx = this.slots.length - 1;
    } else {
      const old = this.slots[idx];
      const ow = this.owned[old];
      dropped = { id: old, mag: ow.mag, reserve: ow.reserve };
      delete this.owned[old];
      this.slots[idx] = id;
    }
    this.owned[id] = w;
    this.cancelReload();
    if (dropped && dropped.id === this.currentId) {
      // Eldeki silah bırakıldı: yenisi doğrudan kuşanılır
      this.currentId = id;
      this.state = 'equipping';
      this.stateT = 0;
      g.audio.mech('equip');
      g.events.emit('weapon', this.current);
      g.events.emit('ammo', this.current);
    } else this.switchTo(id);
    g.events.emit('slots', this.slots);
    return { dropped, refilled: false };
  }

  get current() {
    return this.owned[this.currentId];
  }

  give(id, silent = false) {
    if (this.owned[id]) {
      const w = this.owned[id];
      w.reserve = Math.min(w.data.reserveMax, w.reserve + w.data.magSize * 2);
      this.game.events.emit('ammo', this.current);
      return false;
    }
    this.owned[id] = new Weapon(id);
    if (!this.slots.includes(id)) this.slots.push(id);
    if (!silent) this.switchTo(id);
    this.game.events.emit('slots', this.slots);
    return true;
  }

  addAmmo(fraction = 0.25) {
    let any = false;
    for (const w of Object.values(this.owned)) {
      // Roket gibi nadir cephane her torbadan çıkmaz
      const add = w.data.pickupChance !== undefined ? (Math.random() < w.data.pickupChance ? 1 : 0) : Math.ceil(w.data.reserveMax * fraction);
      if (w.reserve < w.data.reserveMax && add > 0) any = true;
      w.reserve = Math.min(w.data.reserveMax, w.reserve + add);
    }
    this.game.events.emit('ammo', this.current);
    return any;
  }

  refill() {
    for (const w of Object.values(this.owned)) {
      w.reserve = w.data.reserveMax;
    }
    this.grenades = GRENADE.maxCount + this.kitFrags;
    this.game.events.emit('ammo', this.current);
    this.game.events.emit('grenades', this.grenades);
  }

  addGrenade(n = 1) {
    const before = this.grenades;
    this.grenades = Math.min(GRENADE.maxCount + this.kitFrags, this.grenades + n);
    this.game.events.emit('grenades', this.grenades);
    return this.grenades > before;
  }

  get busy() {
    return this.state !== 'idle';
  }

  get canAds() {
    return this.state === 'idle' || this.state === 'reloading' && this.current.data.reloadType === 'shell';
  }

  switchTo(id) {
    if (!this.owned[id] || id === this.currentId && this.state !== 'unequipping') return;
    if (this.state === 'melee' || this.state === 'throwing' || this.state === 'cooking') return;
    this.cancelReload();
    this.pending = id;
    if (this.state === 'equipping' && this.stateT < 0.1) {
      // Çıkarılmadan önce hemen değiştir
      this.lastId = this.currentId;
      this.currentId = id;
      this.stateT = 0;
      this.game.events.emit('weapon', this.current);
      this.game.events.emit('ammo', this.current);
      return;
    }
    this.state = 'unequipping';
    this.stateT = 0;
  }

  cycle(dir) {
    const ids = this.slots.filter((i) => this.owned[i]);
    if (ids.length < 2) return;
    const cur = this.pending && this.state === 'unequipping' ? this.pending : this.currentId;
    const i = ids.indexOf(cur);
    this.switchTo(ids[(i + dir + ids.length) % ids.length]);
  }

  cancelReload() {
    if (this.state === 'reloading') {
      this.state = 'idle';
      this.reload = null;
      this.game.events.emit('reload', null);
    }
  }

  startReload() {
    const w = this.current;
    const d = w.data;
    if (this.state !== 'idle' || w.reserve <= 0) return;
    const cap = d.magSize + (d.chamber && w.mag > 0 ? 1 : 0);
    if (w.mag >= cap || (d.reloadType === 'shell' && w.mag >= d.magSize)) return;
    const empty = w.mag === 0;
    if (d.reloadType === 'shell') {
      this.reload = { type: 'shell', phase: 'start', t: 0, empty, shells: 0 };
    } else {
      this.reload = { type: 'mag', t: 0, dur: empty ? d.reloadEmpty : d.reloadTactical, empty, inserted: false, sfx: 0 };
    }
    this.state = 'reloading';
    this.stateT = 0;
    this.game.player.stopSprint();
    this.game.events.emit('reload', this.reload);
  }

  update(dt, input, canAct) {
    this.time += dt;
    const g = this.game;
    const P = g.player;
    const w = this.current;
    if (!w) return;
    const d = w.data;
    this.stateT += dt;
    w.cooldown -= dt;
    // Yerdeyken silah kullanılmaz (Modül D)
    if (P.down) canAct = false;
    if (w.pumpT >= 0) {
      w.pumpT += dt;
      if (w.pumpT > d.pumpDelay && !w.pumpSfx) {
        w.pumpSfx = true;
        g.audio.mech('pump');
        this.ejectShell(true);
      }
      if (w.pumpT > d.pumpDelay + 0.35) w.pumpT = -1;
    }
    // Sapma toparlanması
    recoverBloom(w, d, this.time, dt);
    if (this.fireBuffer > 0) this.fireBuffer -= dt;

    if (!canAct) {
      w.cooldown = Math.max(w.cooldown, 0);
      return;
    }

    // Silah değiştirme girdileri: 1-9 tuşları slot sırasına göre
    for (let i = 0; i < 9; i++) {
      if (input.pressed(`weapon${i + 1}`) && this.slots[i]) this.switchTo(this.slots[i]);
    }
    if (input.pressed('nextWeapon')) this.cycle(1);
    if (input.pressed('prevWeapon')) this.cycle(-1);
    if (input.pressed('swapWeapon')) {
      if (this.lastId && this.owned[this.lastId]) this.switchTo(this.lastId);
      else this.cycle(1);
    }

    switch (this.state) {
      case 'equipping':
        if (this.stateT >= d.equipTime) this.state = 'idle';
        break;
      case 'unequipping':
        if (this.stateT >= d.unequipTime * 0.8) {
          this.lastId = this.currentId;
          this.currentId = this.pending;
          this.pending = null;
          this.state = 'equipping';
          this.stateT = 0;
          g.audio.mech('equip');
          g.events.emit('weapon', this.current);
          g.events.emit('ammo', this.current);
        }
        return;
      case 'reloading':
        this.updateReload(dt, input);
        break;
      case 'melee':
        this.updateMelee();
        return;
      case 'cooking':
        this.cookT += dt;
        if (!input.isDown(this.cookAction) || this.cookT >= GRENADE.fuse - 0.05) this.releaseGrenade();
        return;
      case 'throwing':
        if (this.stateT >= 0.42) {
          this.state = 'equipping';
          this.stateT = d.equipTime * 0.4;
        }
        return;
      default:
        break;
    }

    if (input.pressed('melee') && (this.state === 'idle' || this.state === 'reloading' || this.state === 'equipping')) {
      this.cancelReload();
      this.state = 'melee';
      this.stateT = 0;
      this.meleeHitDone = false;
      P.stopSprint();
      g.audio.mech('melee');
      return;
    }
    if (input.pressed('grenade') && this.grenades > 0 && this.startThrow('frag', 'grenade')) return;
    if (input.pressed('reload')) this.startReload();
    if (input.pressed('fireMode') && d.fireModes.length > 1 && this.state === 'idle') {
      w.modeIdx = (w.modeIdx + 1) % d.fireModes.length;
      g.audio.mech('switch');
      g.events.emit('fireMode', w);
      g.events.emit('ammo', w);
    }

    this.updateFire(dt, input);
  }

  updateFire(dt, input) {
    const g = this.game;
    const P = g.player;
    const w = this.current;
    const d = w.data;
    const pressed = input.pressed('fire');
    const held = input.isDown('fire');
    if (pressed) this.fireBuffer = 0.14; // yarı otomatikte tıklamayı kısa süre hatırla

    // Pompalıda ateş, reload'u yarıda keser
    if (this.state === 'reloading' && d.reloadType === 'shell' && (pressed || this.fireBuffer > 0) && w.mag > 0) {
      this.reload.phase = 'end';
      this.reload.t = 0;
      this.reload.interrupted = true;
    }
    if (this.state !== 'idle') {
      w.cooldown = Math.max(w.cooldown, 0);
      return;
    }
    if ((held || pressed) && P.sprinting) {
      P.stopSprint();
    }
    const blocked = P.sprintOut > 0 || P.sprinting || P.interacting || (w.pumpT >= 0 && w.pumpT < d.pumpDelay + 0.3);
    if (!held && w.burstLeft === 0) w.cooldown = Math.max(w.cooldown, 0);

    if (w.mag <= 0 && !g.cheats.infiniteAmmo) {
      if (pressed) {
        g.audio.mech('dry');
        if (w.reserve > 0) this.startReload();
        else {
          g.events.emit('noAmmo');
          if (w.slideLocked === false && d.slide) w.slideLocked = true;
        }
      }
      w.burstLeft = 0;
      return;
    }
    if (blocked) return;

    // Tempo (otomatik / tek / seri) paylaşılan kuralda; her atış fire()
    const r = triggerShots(w, d, w.mode, held, this.fireBuffer > 0, this.hasAmmo, this.fireOnce);
    if (r.usedBuffer) this.fireBuffer = 0;
  }

  // Anlık sapma (derece): kalçadan/ADS, hareket, çömelme, havada olma ve bloom
  currentSpread() {
    const w = this.current;
    if (!w) return 0;
    return spreadDeg(w.data.spread, w.bloom, this.game.player);
  }

  fire() {
    const g = this.game;
    const P = g.player;
    const w = this.current;
    const d = w.data;
    if (!g.cheats.infiniteAmmo) w.mag--;
    recordShot(w, this.time);
    g.lastPlayerShot = g.time; // oyun saatinde: düşman ve dost tepkileri bununla ölçülür
    if (d.pump) {
      w.pumpT = 0;
      w.pumpSfx = false;
    }
    if (d.slide && w.mag <= 0) w.slideLocked = true;
    const cam = g.camera;
    cam.getWorldPosition(_o);
    cam.getWorldDirection(_fwd);
    _right.set(1, 0, 0).applyQuaternion(cam.quaternion);
    _up.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const spread = this.currentSpread();
    // Namlu yaklaşık konumu (dünya): iz ve engel doğrulaması için
    const ads = P.adsT;
    _muz.copy(_o)
      .addScaledVector(_fwd, 0.55)
      .addScaledVector(_right, 0.12 * (1 - ads))
      .addScaledVector(_up, -0.08 * (1 - ads) - 0.03);
    if (d.projectile === 'rocket') {
      this.fireRocket(w, _muz, _fwd, _right, _up, spread);
      return;
    }
    const pellets = d.pellets;
    const tracerEvery = d.tracerEvery || 1;
    let anyHit = false;
    let kill = false;
    let headKill = false;
    let headHit = false;
    let armorHit = false;
    let armorBroken = false;
    for (let p = 0; p < pellets; p++) {
      pelletDir(_fwd, d, spread, this.rng, _d);
      const res = this.trace(_o, _d, d.range, _muz);
      if (res.enemy) {
        const dmg = d.damage * this.falloff(res.dist) * (d.zones[res.zone] || 1);
        const wasAlive = res.enemy.alive;
        const out = res.enemy.takeDamage(dmg, { zone: res.zone, dir: _d, point: res.point, source: 'player', weapon: d.id });
        if (wasAlive) {
          anyHit = true;
          if (out.killed) {
            kill = true;
            if (res.zone === 'head') headKill = true;
          } else if (res.zone === 'head') headHit = true;
          if (out.armorHit) armorHit = true;
          if (out.armorBroken) armorBroken = true;
        }
        // Zırha isabet: kıvılcım ve tok metal ses (belge §4.7); zırhsız yer: kan
        g.effects.impact(res.point, _tmp.copy(_d).negate(), out.armorHit ? 'metal' : 'flesh', pellets > 1 ? 0.5 : 1);
        if (p === 0) g.audio.impact(out.armorHit ? 'metal' : 'flesh', res.point);
        // Arkadaki duvara kan izi
        if (g.settings.blood && Math.random() < 0.6) {
          const b = g.world.raycast(res.point, _d, 2.5, _hit2);
          if (b) g.effects.bloodSplat(b.point, b.normal, rand(0.35, 0.7));
        }
        if (g.settings.damageNumbers || g.mode === 'range') g.hud.damageNumber(res.point, dmg, res.zone === 'head');
      } else if (res.ally) {
        // Zırha çarpan kıvılcım, hasar yok; dost uyarır
        g.effects.impact(res.point, _tmp.copy(_d).negate(), 'metal', 0.6);
        if (p === 0) {
          res.ally.onFriendlyFire();
          g.events.emit('friendlyFire', res.ally);
        }
      } else if (res.point) {
        g.effects.impact(res.point, res.normal, res.surface, pellets > 1 ? 0.4 : 1);
        if (p % 3 === 0) g.audio.impact(res.surface, res.point);
        if (res.collider?.owner?.onShot) res.collider.owner.onShot(d.damage, res.point);
      }
      // Mermi izi
      if ((w.shotIndex % tracerEvery === 0 && p === 0) || (pellets > 1 && p < 2)) {
        const end = res.point || _tmp.copy(_o).addScaledVector(_d, d.range);
        if (_muz.distanceTo(end) > 3) g.effects.tracer(_muz, end, 380, 0.012);
      }
      g.enemies.bulletNearMiss(_o, _d, res.dist);
    }
    g.stats.shots++;
    if (anyHit) {
      g.stats.hits++;
      // Zırhlı düşmana isabet mavi işaretle gösterilir; öldürme ve kafa vuruşu önceliklidir
      const kind = kill ? 'kill' : headHit ? 'head' : armorHit ? 'armor' : 'hit';
      g.events.emit('hitmarker', kind, headKill);
      g.audio.hitmarker(headKill || headHit ? 'head' : kind);
      if (armorBroken && !kill) g.events.emit('pickup', 'ZIRH KIRILDI');
    }
    // Bloom, geri tepme, görsel tepme, ses, ışık
    addBloom(w, d);
    recoilKick(d, w.shotIndex, ads, P.crouched, this.rng, _kick);
    P.addRecoil(_kick[0], _kick[1]);
    g.viewmodel.onFire(w);
    g.audio.gunshot(d.sound);
    g.effects.flashLight(_muz, 0xffb566, 12 + Math.random() * 6, 7, 0.05);
    g.effects.muzzleSmoke(_muz, _fwd);
    if (!d.pump) this.ejectShell(false);
    P.shake(d.recoil.shake);
    g.makeNoise(P.pos, d.noise, 'gunshot');
    g.events.emit('ammo', w);
    g.events.emit('fired', w);
  }

  // Roket: mermi yerine uçan cisim; arkaya geri alev ve duman
  fireRocket(w, muzzle, fwd, right, up, spread) {
    const g = this.game;
    const P = g.player;
    const d = w.data;
    // Nişangahın gösterdiği noktayı bul, roketi namludan oraya yönelt (namlu kameranın yanında)
    const aimDir = inCone(fwd, spread * DEG, new THREE.Vector3(), 1.3, this.rng);
    const cam = g.camera.getWorldPosition(new THREE.Vector3());
    const wh = g.world.raycast(cam, aimDir, d.range, _hit);
    const eh = g.enemies.raycast(cam, aimDir, wh ? wh.dist : d.range);
    const aimPoint = eh ? eh.point : wh ? wh.point : cam.clone().addScaledVector(aimDir, d.range);
    const start = muzzle.clone().addScaledVector(fwd, 0.2);
    const dir = aimPoint.clone().sub(start);
    if (dir.dot(fwd) < 0.2 || dir.lengthSq() < 1) dir.copy(aimDir);
    dir.normalize();
    g.grenades.spawnRocket(start, dir, d, 'player');
    g.stats.shots++;
    const back = _tmp.copy(fwd).negate();
    const rear = g.camera.position.clone().addScaledVector(back, 0.6).addScaledVector(right, 0.15);
    for (let i = 0; i < 10; i++) {
      g.effects.smoke.spawn(rear.x, rear.y, rear.z, back.x * rand(3, 7) + rand(-1, 1), rand(-0.5, 1.2), back.z * rand(3, 7) + rand(-1, 1), rand(0.8, 1.6), 0.4, 2.4, g.effects.color(0xb8b0a0), 0.5, -0.2, 1.8);
    }
    g.effects.flashLight(rear, 0xffa050, 40, 8, 0.12);
    const pat = d.recoil.pattern[0];
    P.addRecoil(pat[1] + this.rng.range(-0.3, 0.3), this.rng.range(-0.6, 0.6));
    g.viewmodel.onFire(w);
    g.audio.gunshot(d.sound);
    P.shake(d.recoil.shake);
    g.makeNoise(P.pos, d.noise, 'gunshot');
    g.events.emit('ammo', w);
    g.events.emit('fired', w);
  }

  ejectShell(fromPump) {
    const g = this.game;
    const cam = g.camera;
    _right.set(1, 0, 0).applyQuaternion(cam.quaternion);
    _up.set(0, 1, 0).applyQuaternion(cam.quaternion);
    cam.getWorldPosition(_tmp);
    cam.getWorldDirection(_fwd);
    const ads = g.player.adsT;
    _tmp.addScaledVector(_fwd, 0.35).addScaledVector(_right, 0.1 * (1 - ads) + 0.03).addScaledVector(_up, -0.06);
    g.effects.ejectShell(_tmp, _right, _up, g.player.pos.y, true);
    void fromPump;
  }

  falloff(dist) {
    const f = this.current.data.falloff;
    if (dist <= f.start) return 1;
    if (dist >= f.end) return f.min;
    return 1 + ((dist - f.start) / (f.end - f.start)) * (f.min - 1);
  }

  // Kameradan ışın; düşman, dünya ve namlu engeli kontrolü.
  trace(o, d, range, muzzle) {
    const g = this.game;
    const r = { point: null, normal: null, surface: 'concrete', dist: range, enemy: null, ally: null, zone: null, collider: null };
    const wh = g.world.raycast(o, d, range, _hit);
    let maxD = wh ? wh.dist : range;
    const eh = g.enemies.raycast(o, d, maxD);
    // Dost asker mermiyi durdurur ama yaralanmaz (dost ateşi kapalı)
    const ah = g.allies.raycast(o, d, eh ? eh.dist : maxD);
    if (ah) {
      r.ally = ah.ally;
      r.point = ah.point;
      r.dist = ah.dist;
      maxD = ah.dist;
    } else if (eh?.armor) {
      // Mevzi kalkanı: metal kıvılcım, hasar yok
      r.point = eh.point.clone();
      r.normal = eh.normal;
      r.surface = 'metal';
      r.dist = eh.dist;
      maxD = eh.dist;
    } else if (eh) {
      r.enemy = eh.enemy;
      r.zone = eh.zone;
      r.point = eh.point;
      r.dist = eh.dist;
      maxD = eh.dist;
    } else if (wh) {
      r.point = wh.point.clone();
      r.normal = wh.normal.clone();
      r.surface = wh.surface;
      r.dist = wh.dist;
      r.collider = wh.collider;
    }
    // Namlu ile hedef arasında engel var mı? (köşeden duvar içinden vurmayı engeller)
    if (r.point && maxD > 1.2) {
      _tmp.subVectors(r.point, muzzle);
      const len = _tmp.length();
      _tmp.divideScalar(len);
      const block = g.world.raycast(muzzle, _tmp, len - 0.15, _hit2);
      if (block) {
        r.enemy = null;
        r.ally = null;
        r.zone = null;
        r.point = block.point.clone();
        r.normal = block.normal.clone();
        r.surface = block.surface;
        r.collider = block.collider;
        r.dist = o.distanceTo(block.point);
      }
    }
    return r;
  }

  updateReload(dt, input) {
    const g = this.game;
    const P = g.player;
    const w = this.current;
    const d = w.data;
    const R = this.reload;
    if (!R) {
      this.state = 'idle';
      return;
    }
    // Koşmak reload'u iptal eder (master prompt §6.2)
    if (P.sprinting) {
      this.cancelReload();
      return;
    }
    R.t += dt;
    if (R.type === 'mag') {
      const k = R.t / R.dur;
      if (R.sfx === 0 && k > 0.12) {
        R.sfx = 1;
        g.audio.mech('magOut');
      }
      if (!R.inserted && k >= d.ammoInsertAt) {
        R.inserted = true;
        const cap = d.magSize + (d.chamber && w.mag > 0 ? 1 : 0);
        const take = Math.min(cap - w.mag, w.reserve);
        w.mag += take;
        w.reserve -= take;
        w.slideLocked = false;
        g.audio.mech('magIn');
        g.events.emit('ammo', w);
      }
      if (R.empty && R.sfx === 1 && k > 0.8) {
        R.sfx = 2;
        g.audio.mech('bolt');
      }
      if (R.t >= R.dur) {
        this.state = 'idle';
        this.reload = null;
        g.events.emit('reload', null);
      }
    } else {
      // Fişek fişek doldurma
      if (R.phase === 'start') {
        if (R.t >= d.reloadStart) {
          R.phase = 'loop';
          R.t = 0;
        }
      } else if (R.phase === 'loop') {
        if (R.t >= d.reloadPerShell) {
          R.t = 0;
          if (w.reserve > 0 && w.mag < d.magSize) {
            w.mag++;
            w.reserve--;
            R.shells++;
            g.audio.mech('shell');
            g.events.emit('ammo', w);
          }
          if (w.mag >= d.magSize || w.reserve <= 0) {
            R.phase = 'end';
            R.t = 0;
          }
        }
      } else if (R.phase === 'end') {
        if (R.t === dt && R.empty && !R.interrupted) {
          /* pompa sesi aşağıda */
        }
        if (!R.pumped && R.empty && R.t > d.reloadEnd * 0.3) {
          R.pumped = true;
          g.audio.mech('pump');
        }
        if (R.t >= (R.interrupted ? 0.12 : d.reloadEnd)) {
          this.state = 'idle';
          this.reload = null;
          g.events.emit('reload', null);
        }
      }
    }
  }

  // Reload ilerlemesi (vizyon modeli animasyonu için): {type, k, phase}
  reloadInfo() {
    const R = this.reload;
    if (!R) return null;
    const d = this.current.data;
    if (R.type === 'mag') return { type: 'mag', k: R.t / R.dur, empty: R.empty, insertAt: d.ammoInsertAt };
    const dur = R.phase === 'start' ? d.reloadStart : R.phase === 'loop' ? d.reloadPerShell : d.reloadEnd;
    return { type: 'shell', phase: R.phase, k: clamp(R.t / dur, 0, 1), empty: R.empty };
  }

  updateMelee() {
    const g = this.game;
    if (!this.meleeHitDone && this.stateT >= MELEE.hitTime) {
      this.meleeHitDone = true;
      const cam = g.camera;
      cam.getWorldPosition(_o);
      cam.getWorldDirection(_fwd);
      const target = g.enemies.meleeTarget(_o, _fwd, MELEE.range);
      if (target) {
        const out = target.takeDamage(MELEE.damage, { zone: 'torso', dir: _fwd, point: target.chestPos(), source: 'player', weapon: 'melee' });
        g.effects.impact(target.chestPos(), _tmp.copy(_fwd).negate(), 'flesh', 1.5);
        g.audio.impact('flesh', target.chestPos());
        g.events.emit('hitmarker', out.killed ? 'kill' : 'hit');
        g.audio.hitmarker(out.killed ? 'kill' : 'hit');
        g.player.shake(0.2);
        if (out.killed) g.addScore(SCORE.melee, 'BIÇAK');
      } else {
        const wh = g.world.raycast(_o, _fwd, MELEE.range * 0.8, _hit);
        if (wh) {
          g.effects.impact(wh.point, wh.normal, wh.surface, 0.6, false);
          g.audio.impact(wh.surface, wh.point);
          g.player.shake(0.12);
        }
      }
    }
    if (this.stateT >= MELEE.cooldown * 0.75) {
      this.state = 'idle';
    }
  }

  // Pimi çek: kind 'frag' el bombası, 'smoke' sis bombası; action bırakılınca atılır (basılı tutulan tuş)
  startThrow(kind, action) {
    if (this.state !== 'idle' && this.state !== 'reloading') return false;
    if (kind === 'frag' && this.grenades <= 0) return false;
    this.cancelReload();
    this.state = 'cooking';
    this.stateT = 0;
    this.cookT = 0;
    this.throwKind = kind;
    this.cookAction = action;
    this.game.audio.mech('pin');
    this.game.player.stopSprint();
    return true;
  }

  releaseGrenade() {
    const g = this.game;
    const cam = g.camera;
    cam.getWorldPosition(_o);
    cam.getWorldDirection(_fwd);
    _right.set(1, 0, 0).applyQuaternion(cam.quaternion);
    _o.addScaledVector(_fwd, 0.4).addScaledVector(_right, -0.15);
    const vel = _fwd.clone().multiplyScalar(GRENADE.throwSpeed);
    vel.y += GRENADE.upBoost;
    vel.x += g.player.vel.x * 0.6;
    vel.z += g.player.vel.z * 0.6;
    if (this.throwKind === 'smoke') {
      // Sis bombası pişirilmez: fitili yere düştükten sonra açılacak kadar
      g.grenades.spawn(_o, vel, CONSUMABLES.get('smoke').fuse, 'player', 'smoke');
      g.events.emit(EV.ITEM_USED, { id: 'smoke' });
    } else {
      g.grenades.spawn(_o, vel, GRENADE.fuse - this.cookT, 'player');
      if (this.grenades <= this.kitFrags) {
        this.kitFrags--;
        g.events.emit(EV.ITEM_USED, { id: 'frag' });
      }
      this.grenades--;
      g.events.emit('grenades', this.grenades);
    }
    // throwKind atış bitene kadar kalır (görünüm modeli elde doğru bombayı gösterir); sonraki pim yeniden kurar
    this.cookAction = 'grenade';
    this.state = 'throwing';
    this.stateT = 0;
    this.cookT = 0;
    g.stats.grenades++;
  }
}
