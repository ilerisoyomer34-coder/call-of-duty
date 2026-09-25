// Oyuncu karakteri (AShooterCharacter karşılığı): hareket, bakış, geri tepme telafisi,
// nişan alma, çömelme, eğilme, koşma, ayak sesleri, sağlık/yenilenme, kamera sarsıntısı ve etkileşim.
import * as THREE from 'three';
import { MOVEMENT as M } from './config.js';
import { DEG, clamp, damp, lerp, smoothstep, yawToDir } from './util.js';
import { Health } from './health.js';

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _wish = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _hit = {};

export class Player {
  constructor(game) {
    this.game = game;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.state = { pos: this.pos, vel: this.vel, radius: M.radius, height: M.standHeight, grounded: true, gravity: M.gravity, hitWall: false, landSpeed: 0 };
    this.health = new Health(M.maxHealth);
    this.health.on('changed', (hp, max) => game.events.emit('health', hp, max));
    this.reset(new THREE.Vector3(0, 0, 0), 0);
  }

  reset(pos, yaw) {
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.recoil = { tp: 0, ty: 0, cp: 0, cy: 0, last: -10 };
    this.crouched = false;
    this.crouchT = 0;
    this.crouchToggle = false;
    this.sprinting = false;
    this.sprintToggle = false;
    this.sprintOut = 0;
    this.adsT = 0;
    this.adsToggle = false;
    this.lean = 0;
    this.trauma = 0;
    this.shakeT = Math.random() * 100;
    this.stepAcc = 0;
    this.stepPhase = 0;
    this.landDip = 0;
    this.landVel = 0;
    this.camY = pos.y + M.eyeStand;
    this.alive = true;
    this.deathT = 0;
    this.lastDamage = -100;
    this.time = 0;
    this.interactTarget = null;
    this.interacting = false;
    this.interactT = 0;
    this.horizSpeed = 0;
    this.groundSurface = 'sand';
    this.state.grounded = true;
    this.state.height = M.standHeight;
    this.health.reset();
    this.hbTimer = 0;
    this.lookDX = 0;
    this.lookDY = 0;
    this.dmgWindow = [];
  }

  get grounded() {
    return this.state.grounded;
  }

  get eyePos() {
    return _tmp.set(this.pos.x, this.camY, this.pos.z);
  }

  headPos(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + (this.crouched ? M.eyeCrouch : M.eyeStand), this.pos.z);
  }

  chestPos(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + (this.crouched ? 0.8 : 1.25), this.pos.z);
  }

  addRecoil(pitchDeg, yawDeg) {
    const R = this.recoil;
    R.tp = Math.min(R.tp + pitchDeg * DEG, 14 * DEG);
    R.ty += yawDeg * DEG;
    R.last = this.time;
  }

  shake(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  stopSprint() {
    if (this.sprinting) this.sprintOut = M.sprintOutTime;
    this.sprinting = false;
    this.sprintToggle = false;
  }

  takeDamage(amount, fromPos = null) {
    const g = this.game;
    if (!this.alive || g.cheats.god) return;
    // Son 1 saniyede alınan hasar zorluk sınırını aşmasın: çapraz ateşte bile tepki süresi kalır
    const cap = g.difficulty.dpsCap || 60;
    this.dmgWindow = (this.dmgWindow || []).filter((d) => this.time - d.t < 1);
    const recent = this.dmgWindow.reduce((s, d) => s + d.a, 0);
    const allowed = Math.max(0, cap - recent);
    const scaled = amount <= allowed ? amount : allowed + (amount - allowed) * 0.1;
    this.dmgWindow.push({ t: this.time, a: scaled });
    const dealt = this.health.damage(scaled);
    this.lastDamage = this.time;
    g.stats.damageTaken += dealt;
    if (fromPos) {
      const ang = Math.atan2(fromPos.x - this.pos.x, fromPos.z - this.pos.z);
      g.events.emit('damageDir', ang);
    }
    g.audio.hurt();
    this.shake(clamp(amount / 60, 0.1, 0.5));
    // Hasar alınca nişan biraz sarsılır
    this.recoil.tp += (Math.random() - 0.3) * 1.2 * DEG;
    this.recoil.ty += (Math.random() - 0.5) * 1.2 * DEG;
    this.recoil.last = this.time;
    if (this.health.dead) this.die();
  }

  die() {
    this.alive = false;
    this.deathT = 0;
    this.interacting = false;
    this.game.onPlayerDeath();
  }

  update(dt, input) {
    const g = this.game;
    const S = g.settings;
    this.time += dt;
    const W = g.weapons;
    const w = W.current;

    if (!this.alive) {
      this.deathT += dt;
      this.vel.x = damp(this.vel.x, 0, 5, dt);
      this.vel.z = damp(this.vel.z, 0, 5, dt);
      g.world.moveCharacter(this.state, dt, M.stepHeight);
      this.trauma = damp(this.trauma, 0, 2, dt);
      return;
    }

    // --- Bakış ---
    const look = input.consumeLook();
    const wAds = w ? w.data.ads : { sensMult: 1 };
    const sensMul = lerp(1, S.adsSensitivity * wAds.sensMult * (this.fovCur / this.fovBase || 1), this.adsT);
    const k = 0.0022 * S.sensitivity * sensMul;
    this.lookDX = look.dx;
    this.lookDY = look.dy;
    this.yaw -= look.dx * k;
    let dPitch = -look.dy * k * (S.invertY ? -1 : 1);
    const R = this.recoil;
    // Oyuncu geri tepmeye karşı aşağı çekiyorsa önce birikmiş tepmeden düş
    if (dPitch < 0 && R.tp > 0) {
      const c = Math.min(R.tp, -dPitch);
      R.tp -= c;
      R.cp -= c;
      dPitch += c;
    }
    this.pitch = clamp(this.pitch + dPitch, -88 * DEG, 88 * DEG);
    const rec = w ? w.data.recoil : { recoveryDelay: 0.1, recovery: 8 };
    if (this.time - R.last > rec.recoveryDelay) {
      R.tp = damp(R.tp, 0, rec.recovery, dt);
      R.ty = damp(R.ty, 0, rec.recovery, dt);
    }
    R.cp = damp(R.cp, R.tp, 30, dt);
    R.cy = damp(R.cy, R.ty, 30, dt);

    // --- Durumlar: çömelme, koşma, nişan ---
    const mv = input.move();
    const moving = Math.abs(mv.x) + Math.abs(mv.y) > 0.1;
    if (S.crouchMode === 'toggle') {
      if (input.pressed('crouch')) this.crouchToggle = !this.crouchToggle;
    } else this.crouchToggle = input.isDown('crouch');
    let wantCrouch = this.crouchToggle;

    const sprintInput = S.sprintMode === 'toggle' ? (input.pressed('sprint') ? (this.sprintToggle = !this.sprintToggle) : this.sprintToggle) : input.isDown('sprint') || input.touch.sprint;
    const weaponBlocksSprint = W.state === 'melee' || W.state === 'cooking' || W.state === 'throwing';
    let wantSprint = sprintInput && mv.y > 0.35 && this.grounded && !weaponBlocksSprint && !this.interacting;
    if (S.adsMode === 'toggle') {
      if (input.pressed('ads')) this.adsToggle = !this.adsToggle;
    } else this.adsToggle = input.isDown('ads');
    const wantAds = this.adsToggle && W.canAds && !this.interacting;
    if (wantAds && input.pressed('ads')) wantSprint = false;
    if (wantAds && !this.sprinting) wantSprint = false;
    if (wantSprint && wantCrouch) {
      this.crouchToggle = false;
      wantCrouch = false;
    }
    if (wantSprint && !this.sprinting) {
      this.sprinting = true;
      W.cancelReload();
    } else if (!wantSprint && this.sprinting) {
      this.stopSprint();
    }
    if (!moving || mv.y < 0.2) {
      if (this.sprinting) this.stopSprint();
      this.sprintToggle = false;
    }
    if (this.sprintOut > 0) this.sprintOut -= dt;

    if (wantCrouch !== this.crouched) {
      if (wantCrouch) this.crouched = true;
      else if (g.world.canStand(this.pos, M.radius, M.crouchHeight, M.standHeight)) this.crouched = false;
      else this.crouchToggle = true;
    }
    this.crouchT = damp(this.crouchT, this.crouched ? 1 : 0, 12, dt);
    this.state.height = lerp(M.standHeight, M.crouchHeight, this.crouchT);

    const adsTime = w ? w.data.ads.time : 0.2;
    const adsTarget = wantAds && !this.sprinting ? 1 : 0;
    this.adsT = clamp(this.adsT + (adsTarget ? 1 : -1) * (dt / adsTime), 0, 1);

    // --- Hareket ---
    yawToDir(this.yaw, _fwd);
    _right.set(-_fwd.z, 0, _fwd.x);
    _wish.set(0, 0, 0).addScaledVector(_fwd, mv.y).addScaledVector(_right, mv.x);
    let maxSpeed = this.sprinting ? M.sprintSpeed : this.crouched ? M.crouchSpeed : M.walkSpeed;
    if (w) maxSpeed *= lerp(1, w.data.ads.moveMult, this.adsT);
    if (this.interacting) maxSpeed *= 0.2;
    if (this.grounded) {
      const tx = _wish.x * maxSpeed;
      const tz = _wish.z * maxSpeed;
      let dx = tx - this.vel.x;
      let dz = tz - this.vel.z;
      const dl = Math.hypot(dx, dz);
      const acc = (moving ? M.groundAccel : M.friction * 6) * dt;
      if (dl > acc) {
        dx *= acc / dl;
        dz *= acc / dl;
      }
      this.vel.x += dx;
      this.vel.z += dz;
      if (input.pressed('jump')) {
        if (this.crouched) {
          if (g.world.canStand(this.pos, M.radius, M.crouchHeight, M.standHeight)) {
            this.crouched = false;
            this.crouchToggle = false;
          }
        } else {
          this.vel.y = M.jumpVelocity;
          this.state.grounded = false;
          g.audio.footstep(this.groundSurface, 0.8);
        }
      }
    } else {
      this.vel.x += _wish.x * M.airAccel * dt;
      this.vel.z += _wish.z * M.airAccel * dt;
      const hs = Math.hypot(this.vel.x, this.vel.z);
      const cap = Math.max(maxSpeed, 0.1);
      if (hs > cap * 1.05) {
        this.vel.x *= (cap * 1.05) / hs;
        this.vel.z *= (cap * 1.05) / hs;
      }
    }
    const wasGrounded = this.grounded;
    this.state.landSpeed = 0;
    const steps = dt > 0.02 ? 2 : 1;
    let groundC = null;
    for (let i = 0; i < steps; i++) groundC = g.world.moveCharacter(this.state, dt / steps, M.stepHeight);
    this.groundSurface = groundC ? groundC.surface : 'sand';
    if (!wasGrounded && this.grounded && this.state.landSpeed > 2.5) {
      this.landVel -= Math.min(this.state.landSpeed, 10) * 0.18;
      g.audio.land(clamp(this.state.landSpeed / 8, 0.3, 1));
      g.makeNoise(this.pos, 10, 'footstep');
    }
    this.horizSpeed = Math.hypot(this.vel.x, this.vel.z);

    // Ayak sesleri
    if (this.grounded && this.horizSpeed > 0.6) {
      this.stepAcc += this.horizSpeed * dt;
      this.stepPhase += this.horizSpeed * dt * (Math.PI / (this.sprinting ? M.stepDistSprint : this.crouched ? M.stepDistCrouch : M.stepDistWalk)) * 2;
      const len = this.sprinting ? M.stepDistSprint : this.crouched ? M.stepDistCrouch : M.stepDistWalk;
      if (this.stepAcc >= len / 2) {
        this.stepAcc = 0;
        const inten = this.sprinting ? 1 : this.crouched ? 0.35 : 0.7;
        g.audio.footstep(this.groundSurface, inten);
        const r = this.sprinting ? M.noiseSprint : this.crouched ? M.noiseCrouch : M.noiseWalk;
        g.makeNoise(this.pos, r, 'footstep');
      }
    }

    // Eğilme (Q/E)
    let leanTarget = 0;
    if (!this.sprinting) {
      if (input.isDown('leanLeft')) leanTarget -= 1;
      if (input.isDown('leanRight')) leanTarget += 1;
    }
    if (leanTarget !== 0) {
      // Duvara doğru eğilmeyi sınırla
      _tmp.set(this.pos.x, this.pos.y + this.state.height - 0.2, this.pos.z);
      const dir = _right.clone().multiplyScalar(leanTarget);
      const h = g.world.raycast(_tmp, dir, M.leanOffset + 0.25, _hit);
      if (h) leanTarget *= clamp((h.dist - 0.25) / M.leanOffset, 0, 1);
    }
    this.lean = damp(this.lean, leanTarget, 10, dt);

    // Kamera yüksekliği (merdivenlerde yumuşatılır)
    const eyeH = lerp(M.eyeStand, M.eyeCrouch, this.crouchT);
    const targetY = this.pos.y + eyeH;
    this.camY = Math.abs(targetY - this.camY) > 1.5 ? targetY : damp(this.camY, targetY, 22, dt);
    // İniş çöküşü yayı
    this.landVel += (-this.landDip * 90 - this.landVel * 12) * dt;
    this.landDip += this.landVel * dt;

    // Sağlık yenilenmesi
    const regenDelay = g.difficulty.regenDelay ?? M.regenDelay;
    if (this.time - this.lastDamage > regenDelay && this.health.hp < this.health.max) {
      this.health.heal(M.regenRate * dt);
    }
    // Düşük canda kalp atışı
    if (this.health.ratio < 0.35) {
      this.hbTimer -= dt;
      if (this.hbTimer <= 0) {
        this.hbTimer = 0.9;
        g.audio.heartbeat();
      }
    }

    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.shakeT += dt;
    this.updateInteraction(dt, input);
  }

  updateInteraction(dt, input) {
    const g = this.game;
    const cam = g.camera;
    cam.getWorldDirection(_fwd);
    const target = g.findInteractable(this.eyePos.clone(), _fwd);
    if (target !== this.interactTarget) {
      this.interactTarget = target;
      this.interactT = 0;
      this.interacting = false;
      g.events.emit('interact', target, 0);
    }
    if (!target) return;
    // Çok kısa basışlar (tuş bir kare içinde bırakılırsa) da sayılsın
    if ((input.isDown('interact') || input.pressed('interact')) && g.weapons.state !== 'melee') {
      if (target.time <= 0) {
        if (input.pressed('interact')) {
          target.action();
          this.interactTarget = null;
          g.events.emit('interact', null, 0);
        }
        return;
      }
      this.interacting = true;
      this.stopSprint();
      this.interactT += dt;
      g.events.emit('interact', target, this.interactT / target.time);
      if (this.interactT >= target.time) {
        target.action();
        this.interacting = false;
        this.interactT = 0;
        this.interactTarget = null;
        g.events.emit('interact', null, 0);
      }
    } else if (this.interacting || this.interactT > 0) {
      this.interacting = false;
      this.interactT = 0;
      g.events.emit('interact', target, 0);
    }
  }

  // Kamera dönüşünü ve konumunu uygula; FOV'u hesapla.
  applyCamera(camera, dt) {
    const g = this.game;
    const S = g.settings;
    const w = g.weapons.current;
    // Yatay FOV ayarını dikeye çevir
    const aspect = Math.max(camera.aspect, 1.2);
    const hf = S.fov * DEG;
    const vBase = 2 * Math.atan(Math.tan(hf / 2) / aspect) / DEG;
    this.fovBase = vBase;
    const adsMult = w ? w.data.ads.fovMult : 1;
    const a = smoothstep(this.adsT);
    let target = vBase * lerp(1, adsMult, a);
    if (this.sprinting) target *= 1.06;
    this.fovCur = this.fovCur ? damp(this.fovCur, target, 14, dt) : target;
    if (Math.abs(camera.fov - this.fovCur) > 0.01) {
      camera.fov = this.fovCur;
      camera.updateProjectionMatrix();
    }
    // Sarsıntı
    const shakeMul = S.cameraShake ? 1 : 0.15;
    const s = this.trauma * this.trauma * shakeMul;
    const t = this.shakeT;
    const sp = s * 1.6 * DEG * (Math.sin(t * 37.1) + Math.sin(t * 23.7 + 1.3) * 0.5);
    const sy = s * 1.6 * DEG * (Math.sin(t * 31.3 + 2.1) + Math.sin(t * 19.1) * 0.5);
    const sr = s * 2.2 * DEG * Math.sin(t * 27.9 + 0.7);
    // Yürüme sallantısı
    let bobY = 0;
    let bobX = 0;
    if (S.headBob && this.grounded && this.alive) {
      const amp = clamp(this.horizSpeed / 6.5, 0, 1) * (1 - a * 0.85);
      bobY = Math.sin(this.stepPhase * 2) * 0.022 * amp;
      bobX = Math.cos(this.stepPhase) * 0.015 * amp;
    }
    yawToDir(this.yaw, _fwd);
    _right.set(-_fwd.z, 0, _fwd.x);
    const leanX = this.lean * M.leanOffset;
    let y = this.camY + bobY + this.landDip;
    let roll = -this.lean * M.leanRoll * DEG + sr;
    if (!this.alive) {
      // Ölüm kamerası: yana devril
      const k = smoothstep(clamp(this.deathT / 0.9, 0, 1));
      y = lerp(this.camY, this.pos.y + 0.35, k);
      roll += k * 1.1;
    }
    camera.position.set(this.pos.x + _right.x * (leanX + bobX), y, this.pos.z + _right.z * (leanX + bobX));
    camera.rotation.set(this.pitch + this.recoil.cp + sp, this.yaw + this.recoil.cy + sy, roll, 'YXZ');
    g.audio.setListener(camera.position.x, camera.position.y, camera.position.z, this.yaw);
  }
}
