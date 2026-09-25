// Oyuncu silah sistemi: envanter, durum makinesi (idle/reload/equip/unequip/melee/throw),
// kare hızından bağımsız atış zamanlaması, hitscan (kamera merkezinden + namlu doğrulaması),
// sapma (bloom), geri tepme, cephane, ateş modları, el bombası ve bıçak.
import * as THREE from 'three';
import { WEAPONS, WEAPON_ORDER, GRENADE, MELEE, SCORE } from './config.js';
import { DEG, clamp, randomInCone, rand } from './util.js';

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
    return 60 / this.data.rpm;
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

export class PlayerWeapons {
  constructor(game) {
    this.game = game;
    this.owned = {};
    this.currentId = null;
    this.state = 'idle';
    this.stateT = 0;
    this.pending = null;
    this.lastId = null;
    this.grenades = GRENADE.startCount;
    this.cookT = 0;
    this.meleeHitDone = false;
    this.reload = null; // { t, dur, empty, inserted, phase }
    this.fireBuffer = 0;
    this.time = 0;
  }

  reset(loadout) {
    this.owned = {};
    for (const [id, ammo] of Object.entries(loadout.weapons)) {
      const w = new Weapon(id);
      if (ammo) {
        w.mag = ammo.mag;
        w.reserve = ammo.reserve;
      }
      this.owned[id] = w;
    }
    this.grenades = loadout.grenades ?? GRENADE.startCount;
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
    return { weapons, grenades: this.grenades, current: this.currentId };
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
    if (!silent) this.switchTo(id);
    return true;
  }

  addAmmo(fraction = 0.25) {
    let any = false;
    for (const w of Object.values(this.owned)) {
      const add = Math.ceil(w.data.reserveMax * fraction);
      if (w.reserve < w.data.reserveMax) any = true;
      w.reserve = Math.min(w.data.reserveMax, w.reserve + add);
    }
    this.game.events.emit('ammo', this.current);
    return any;
  }

  refill() {
    for (const w of Object.values(this.owned)) {
      w.reserve = w.data.reserveMax;
    }
    this.grenades = GRENADE.maxCount;
    this.game.events.emit('ammo', this.current);
    this.game.events.emit('grenades', this.grenades);
  }

  addGrenade(n = 1) {
    const before = this.grenades;
    this.grenades = Math.min(GRENADE.maxCount, this.grenades + n);
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
    const ids = WEAPON_ORDER.filter((i) => this.owned[i]);
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
    if (this.time - w.lastShot > 0.06) w.bloom = Math.max(0, w.bloom - d.spread.recovery * dt);
    if (this.fireBuffer > 0) this.fireBuffer -= dt;

    if (!canAct) {
      w.cooldown = Math.max(w.cooldown, 0);
      return;
    }

    // Silah değiştirme girdileri
    if (input.pressed('weapon1')) this.switchTo('rifle');
    if (input.pressed('weapon2')) this.switchTo('shotgun');
    if (input.pressed('weapon3')) this.switchTo('pistol');
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
        if (!input.isDown('grenade') || this.cookT >= GRENADE.fuse - 0.05) this.releaseGrenade();
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
    if (input.pressed('grenade') && this.grenades > 0 && (this.state === 'idle' || this.state === 'reloading')) {
      this.cancelReload();
      this.state = 'cooking';
      this.stateT = 0;
      this.cookT = 0;
      g.audio.mech('pin');
      P.stopSprint();
      return;
    }
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
    const blocked = P.sprintOut > 0 || P.sprinting || P.interacting || w.pumpT >= 0 && w.pumpT < d.pumpDelay + 0.3;
    if (!held && w.burstLeft === 0) w.cooldown = Math.max(w.cooldown, 0);

    if (w.mag <= 0 && !g.cheats.infiniteAmmo) {
      if (pressed) {
        g.audio.mech('dry');
        if (w.reserve > 0) this.startReload();
        else {
          g.events.emit('noAmmo');
          if (w.slideLocked === false && d.id === 'pistol') w.slideLocked = true;
        }
      }
      w.burstLeft = 0;
      return;
    }
    if (blocked) return;

    const mode = w.mode;
    let shots = 0;
    if (mode === 'auto') {
      while (held && w.cooldown <= 0 && (w.mag > 0 || g.cheats.infiniteAmmo) && shots < 4) {
        this.fire();
        w.cooldown += w.interval;
        shots++;
      }
    } else if (mode === 'semi') {
      if (this.fireBuffer > 0 && w.cooldown <= 0) {
        this.fireBuffer = 0;
        this.fire();
        w.cooldown = Math.max(w.cooldown, 0) + w.interval;
      }
    } else if (mode === 'burst') {
      if (this.fireBuffer > 0 && w.cooldown <= 0 && w.burstLeft === 0) {
        this.fireBuffer = 0;
        w.burstLeft = d.burstCount;
      }
      while (w.burstLeft > 0 && w.cooldown <= 0 && (w.mag > 0 || g.cheats.infiniteAmmo) && shots < 4) {
        this.fire();
        w.burstLeft--;
        w.cooldown += 60 / d.burstRpm;
        if (w.burstLeft === 0) w.cooldown += d.burstDelay;
        shots++;
      }
      if (w.mag <= 0) w.burstLeft = 0;
    }
  }

  // Anlık sapma (derece): kalçadan/ADS, hareket, çömelme, havada olma ve bloom
  currentSpread() {
    const g = this.game;
    const P = g.player;
    const w = this.current;
    if (!w) return 0;
    const s = w.data.spread;
    let base = s.hip;
    const ads = P.adsT;
    const speed = P.horizSpeed;
    let mult = 1;
    if (P.crouched) mult *= s.crouchMult;
    mult *= 1 + clamp(speed / 4, 0, 1.4) * (s.moveMult - 1);
    if (!P.grounded) mult *= s.airMult;
    const hipSpread = (base + w.bloom) * mult;
    const adsSpread = (base * s.adsMult + w.bloom * 0.45) * (P.grounded ? 1 : s.airMult * 0.6) * (1 + clamp(speed / 4, 0, 1.4) * (s.moveMult - 1) * 0.6);
    return hipSpread + (adsSpread - hipSpread) * ads;
  }

  fire() {
    const g = this.game;
    const P = g.player;
    const w = this.current;
    const d = w.data;
    if (!g.cheats.infiniteAmmo) w.mag--;
    w.shotIndex = this.time - w.lastShot > 0.35 ? 0 : w.shotIndex + 1;
    w.lastShot = this.time;
    if (d.id === 'shotgun') {
      w.pumpT = 0;
      w.pumpSfx = false;
    }
    if (d.id === 'pistol' && w.mag <= 0) w.slideLocked = true;
    const cam = g.camera;
    cam.getWorldPosition(_o);
    cam.getWorldDirection(_fwd);
    _right.set(1, 0, 0).applyQuaternion(cam.quaternion);
    _up.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const spreadDeg = this.currentSpread();
    // Namlu yaklaşık konumu (dünya): iz ve engel doğrulaması için
    const ads = P.adsT;
    _muz.copy(_o)
      .addScaledVector(_fwd, 0.55)
      .addScaledVector(_right, 0.12 * (1 - ads))
      .addScaledVector(_up, -0.08 * (1 - ads) - 0.03);
    const pellets = d.pellets;
    const tracerEvery = d.id === 'rifle' ? 2 : 1;
    let anyHit = false;
    let kill = false;
    let headKill = false;
    let headHit = false;
    for (let p = 0; p < pellets; p++) {
      if (pellets > 1) randomInCone(_fwd, (d.pelletSpread + spreadDeg * 0.35) * DEG, _d, 0.8);
      else randomInCone(_fwd, spreadDeg * DEG, _d, 1.3);
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
        }
        g.effects.impact(res.point, _tmp.copy(_d).negate(), 'flesh', pellets > 1 ? 0.5 : 1);
        if (p === 0) g.audio.impact('flesh', res.point);
        // Arkadaki duvara kan izi
        if (g.settings.blood && Math.random() < 0.6) {
          const b = g.world.raycast(res.point, _d, 2.5, _hit2);
          if (b) g.effects.bloodSplat(b.point, b.normal, rand(0.35, 0.7));
        }
        if (g.settings.damageNumbers || g.mode === 'range') g.hud.damageNumber(res.point, dmg, res.zone === 'head');
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
      const kind = kill ? 'kill' : headHit ? 'head' : 'hit';
      g.events.emit('hitmarker', kind, headKill);
      g.audio.hitmarker(headKill || headHit ? 'head' : kind);
    }
    // Bloom, geri tepme, görsel tepme, ses, ışık
    w.bloom = Math.min(d.spread.max, w.bloom + d.spread.perShot);
    const pat = d.recoil.pattern;
    const idx = w.shotIndex < pat.length ? w.shotIndex : pat.length - 4 + (w.shotIndex % 4);
    const [rx, ry] = pat[Math.max(0, idx)];
    const rm = 1 + (d.recoil.adsMult - 1) * ads;
    const rnd = d.recoil.random;
    P.addRecoil((ry + rand(-rnd, rnd) * 0.5) * rm * (P.crouched ? 0.85 : 1), (rx + rand(-rnd, rnd)) * rm);
    g.viewmodel.onFire(w);
    g.audio.gunshot(d.sound);
    g.effects.flashLight(_muz, 0xffb566, 12 + Math.random() * 6, 7, 0.05);
    g.effects.muzzleSmoke(_muz, _fwd);
    if (d.id !== 'shotgun') this.ejectShell(false);
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
    const r = { point: null, normal: null, surface: 'concrete', dist: range, enemy: null, zone: null, collider: null };
    const wh = g.world.raycast(o, d, range, _hit);
    let maxD = wh ? wh.dist : range;
    const eh = g.enemies.raycast(o, d, maxD);
    if (eh) {
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
    g.grenades.spawn(_o, vel, GRENADE.fuse - this.cookT, 'player');
    this.grenades--;
    g.events.emit('grenades', this.grenades);
    this.state = 'throwing';
    this.stateT = 0;
    this.cookT = 0;
    g.stats.grenades++;
  }
}
