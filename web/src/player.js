// Oyuncu karakteri (AShooterCharacter karşılığı): hareket, bakış, geri tepme telafisi,
// nişan alma, çömelme, eğilme, koşma, ayak sesleri, sağlık/yenilenme, kamera sarsıntısı ve etkileşim.
import * as THREE from 'three';
import { MOVEMENT as M, KIT, BALANCE, SIM } from './config.js';
import { TICK_DT } from '../shared/constants.js';
import { createPlayerState, resetPlayerState, createInputCmd, stepPlayer, SIM_EV, BTN } from '../shared/sim/movement.js';
import { updateInputCmd } from './inputCmd.js';
import { DEG, clamp, damp, lerp, smoothstep, yawToDir } from './util.js';
import { Health } from './health.js';
import { ArmorLoadout, computeArmorDamage, playerZoneMult, ARMOR_DATA } from './armor.js';
import { EV } from './events.js';
import { REVIVE, BleedOut, bleedOutFor } from './downed.js';

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _wish = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _hit = {};
const MAX_TICKS_PER_FRAME = SIM.maxTicksPerFrame;
const RENDER_SNAP_DIST = SIM.renderSnapDist;

export class Player {
  constructor(game) {
    this.game = game;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    // Hareket durumu paylaşılan simülasyonun biçiminde (shared/sim/movement.js); pos/vel aynı nesneler
    this.state = createPlayerState(M, this.pos, this.vel);
    this.cmd = createInputCmd();
    // Sabit adım: biriken süre ve çizim için önceki/aralanmış konum
    this.fixedStep = true;
    this.simAcc = 0;
    this.prevPos = new THREE.Vector3();
    this.renderPos = new THREE.Vector3();
    this.health = new Health(M.maxHealth);
    this.health.on('changed', (hp, max) => game.events.emit('health', hp, max));
    this.reset(new THREE.Vector3(0, 0, 0), 0);
  }

  reset(pos, yaw) {
    this.invulnerable = false;
    // Yere düşme süresi ölçümü ve hasar günlüğü (§10): tam candayken alınan ilk hasardan başlar
    this.ttdStart = -1;
    this.dmgLog = this.dmgLog || [];
    this.dmgLog.length = 0;
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    resetPlayerState(this.state, M);
    this.syncRender();
    this.cmd.buttons = 0;
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
    this.usingItem = false; // sarf malzemesi takılıyor (kit.js): silah iner, koşulamaz, nişan alınamaz
    // Yere düşme (Modül D): ölümcül hasarda ölmek yerine kan kaybı sayacıyla yerde kalır
    this.down = false;
    this.bleed = null;
    this.reviver = null; // canlandıran asker (ally.js her karede bildirir)
    this.reviveK = 0; // canlandırma ilerlemesi 0–1
    this.protectUntil = -1; // kalkıştan sonra kısa süre hasar azalır
    this.helpHoldT = 0;
    this.giveUpT = 0;
    this.calledHelpUntil = -1;
    this.helpReadyAt = 0;
    this.interactT = 0;
    this.horizSpeed = 0;
    this.groundSurface = 'sand';
    this.state.grounded = true;
    this.state.height = M.standHeight;
    this.health.reset();
    // Kuşanılan zırh (mağazadan, kayıtta) her görevin ve yeniden doğuşun başında tam dolu
    const L = this.game.save?.data.loadout;
    this.armor = new ArmorLoadout(L?.armor || null, L?.helmet || null);
    this.game.events.emit('armor', this.armor);
    this.hbTimer = 0;
    this.lookDX = 0;
    this.lookDY = 0;
    this.dmgWindow = [];
    this.breath = 1;
    this.breathTired = false;
    this.scopeAmp = 0;
  }

  get grounded() {
    return this.state.grounded;
  }

  // Hareket alanları simülasyon durumunda yaşar; eski adlar (silah, HUD, yapay zekâ okur) erişimciyle sürer
  get crouched() {
    return this.state.crouched;
  }
  set crouched(v) {
    this.state.crouched = v;
  }
  get crouchT() {
    return this.state.crouchT;
  }
  set crouchT(v) {
    this.state.crouchT = v;
  }
  get sprinting() {
    return this.state.sprinting;
  }
  set sprinting(v) {
    this.state.sprinting = v;
  }
  get sprintOut() {
    return this.state.sprintOut;
  }
  set sprintOut(v) {
    this.state.sprintOut = v;
  }
  get adsT() {
    return this.state.adsT;
  }
  set adsT(v) {
    this.state.adsT = v;
  }
  get horizSpeed() {
    return this.state.horizSpeed;
  }
  set horizSpeed(v) {
    this.state.horizSpeed = v;
  }
  get groundSurface() {
    return this.state.groundSurface;
  }
  set groundSurface(v) {
    this.state.groundSurface = v;
  }

  // Çizim konumu simülasyona eşitlenir (ışınlanma, yeniden doğuş, yerde/ölü iken kare adımlı hareket)
  syncRender() {
    this.simAcc = 0;
    // Yerde/ölüyken basılan zıplama kalkınca tetiklenmesin
    this.cmd.buttons &= ~BTN.JUMP;
    this.prevPos.copy(this.pos);
    this.renderPos.copy(this.pos);
  }

  // Simülasyon olaylarının yan etkileri: ses, yapay zekâ gürültüsü, şarjör iptali, aç/kapa düğmeleri
  onSimEvents(ev, cmd) {
    if (!ev) return;
    const g = this.game;
    if (ev & SIM_EV.SPRINT_START) g.weapons.cancelReload();
    if (ev & SIM_EV.SPRINT_STOP) this.sprintToggle = false;
    if (ev & SIM_EV.UNCROUCH) {
      this.crouchToggle = false;
      cmd.buttons &= ~BTN.CROUCH;
    }
    if (ev & SIM_EV.CROUCH_BLOCKED) this.crouchToggle = true;
    if (ev & SIM_EV.JUMP) g.audio.footstep(this.groundSurface, 0.8);
    if (ev & SIM_EV.LAND) {
      const ls = this.state.landSpeed;
      this.landVel -= Math.min(ls, 10) * 0.18;
      g.audio.land(clamp(ls / 8, 0.3, 1));
      g.makeNoise(this.pos, 10, 'footstep');
    }
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

  // hit: { zone: 'head'|'torso'|'leg', pen: zırh delme, source } — verilmezse gövde, varsayılan delme
  takeDamage(amount, fromPos = null, hit = null) {
    const g = this.game;
    if (!this.alive || g.cheats.god || this.invulnerable) return; // kalkış sahnesinde helikopterin içinde
    // Bölge çarpanı, sonra zırh (belge §4.5): zırh emdiği kadar aşınır, kalan cana gider
    const zone = hit?.zone || 'torso';
    const raw = amount * playerZoneMult(zone);
    // Yerdeyken alınan her hasar puanı kan kaybı süresinden düşer (§7.3)
    if (this.down) {
      g.audio.hurt();
      if (this.bleed.damage(raw)) this.die();
      return;
    }
    // Kalkıştan sonra kısa süre hasar azalır (§7.5)
    if (this.time < this.protectUntil) amount *= 1 - REVIVE.postReviveDamageReduction;
    const piece = this.armor.pieceFor(zone);
    const res = computeArmorDamage(raw, hit?.pen ?? ARMOR_DATA.defaultPen, piece);
    if (res.absorbed > 0) {
      g.audio.armorHit(piece.def.slot);
      g.events.emit('armor', this.armor, true);
    }
    g.events.emit(EV.DAMAGE_TAKEN, { target: this, targetType: 'player', rawDamage: raw, absorbed: res.absorbed, healthDamage: res.healthDamage, hitZone: zone });
    if (res.broken) {
      g.audio.armorBreak();
      g.events.emit('message', piece.def.slot === 'helmet' ? 'KASK KIRILDI' : 'ZIRH KIRILDI', 'warn');
      g.events.emit(EV.ARMOR_BROKEN, { target: this, targetType: 'player', piece: piece.id, by: hit?.source || 'enemy' });
    }
    amount = res.healthDamage;
    // Tek seferde çok büyük hasar (patlamanın merkezi, tank topu): yere düşme yok, doğrudan ölüm (§7.7).
    // Saniyelik hasar tavanından önce bakılır; yoksa tavan büyük vuruşu yumuşatıp ölümü önlerdi.
    if (amount >= REVIVE.instantDeathThreshold && g.mode === 'mission') {
      this.health.damage(this.health.hp);
      this.die();
      return;
    }
    // Son 1 saniyede alınan hasar zorluk sınırını aşmasın: çapraz ateşte bile tepki süresi kalır
    const cap = g.difficulty.dpsCap || 60;
    this.dmgWindow = (this.dmgWindow || []).filter((d) => this.time - d.t < 1);
    const recent = this.dmgWindow.reduce((s, d) => s + d.a, 0);
    const allowed = Math.max(0, cap - recent);
    const scaled = amount <= allowed ? amount : allowed + (amount - allowed) * 0.1;
    this.dmgWindow.push({ t: this.time, a: scaled });
    const dealt = this.health.damage(scaled);
    this.lastDamage = this.time;
    if (this.ttdStart < 0 && dealt > 0) this.ttdStart = this.time;
    this.logDamage(hit, fromPos, raw, res.absorbed, dealt);
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
    if (this.health.dead) {
      // Tek seferde büyük hasar (patlamanın merkezi) ya da görev dışı: doğrudan ölüm
      if (raw >= REVIVE.instantDeathThreshold || g.mode !== 'mission') this.die();
      else this.goDown();
    }
  }

  // Hasar günlüğü (konsol "dmgpanel"): kaynak, mesafe, ham hasar → zırhın emdiği → cana geçen
  logDamage(hit, fromPos, raw, absorbed, dealt) {
    const L = this.dmgLog || (this.dmgLog = []);
    if (L.length >= BALANCE.dmgLogSize) L.shift();
    L.push({ t: this.time, src: hit?.source || 'bilinmiyor', dist: fromPos ? Math.round(fromPos.distanceTo(this.pos)) : null, raw, absorbed, dealt, hp: this.health.hp });
  }

  // Yere düşme süresi: tam candan ilk hasar ile düşüş/ölüm arası (can tekrar dolunca sayaç sıfırlanır)
  recordTtd() {
    if (this.ttdStart < 0) return;
    this.game.stats.ttd?.push(Math.round((this.time - this.ttdStart) * 100) / 100);
    this.ttdStart = -1;
  }

  // Yere düş: kan kaybı sayacı görevdeki kaçıncı düşüş olduğuna ve zorluğa göre
  goDown() {
    const g = this.game;
    this.recordTtd();
    this.down = true;
    g.stats.downs = (g.stats.downs || 0) + 1;
    this.bleed = new BleedOut(bleedOutFor(g.stats.downs, g.difficultyKey));
    this.reviver = null;
    this.reviveK = 0;
    this.helpHoldT = 0;
    this.giveUpT = 0;
    this.interacting = false;
    this.usingItem = false;
    this.adsToggle = false;
    this.stopSprint();
    this.crouched = true;
    // Elde pimi çekilmiş bomba ya da yarım şarjör değişimi kalmasın
    const W = g.weapons;
    W.cancelReload();
    if (W.state === 'cooking' || W.state === 'throwing') {
      W.state = 'idle';
      W.cookT = 0;
    }
    g.save?.update((d) => (d.stats.timesDowned = (d.stats.timesDowned || 0) + 1));
    g.events.emit(EV.PLAYER_DOWNED, { downCount: g.stats.downs, bleedSec: this.bleed.total });
    g.events.emit('message', 'YERE DÜŞTÜN', 'warn');
  }

  // Kalk: canlandıran asker ya da adrenalin; can %35, kısa süre hasar azalır
  revive(by) {
    const g = this.game;
    if (!this.down) return;
    this.down = false;
    this.bleed = null;
    this.reviver = null;
    this.reviveK = 0;
    this.health.hp = 0.001;
    this.health.heal(this.health.max * REVIVE.reviveHealthPct);
    this.lastDamage = this.time;
    this.protectUntil = this.time + REVIVE.postReviveProtectionSec;
    this.crouchToggle = false;
    g.audio.setMuffle(0);
    g.events.emit(EV.PLAYER_REVIVED, { by });
  }

  // Yerdeyken: sürünme, etrafa bakma, yardım çağırma (E basılı), pes etme (X basılı); silah yok
  updateDowned(dt, input) {
    const g = this.game;
    const S = g.settings;
    const look = input.consumeLook();
    const k = 0.0022 * S.sensitivity;
    this.yaw -= look.dx * k;
    this.pitch = clamp(this.pitch - look.dy * k * (S.invertY ? -1 : 1), -60 * DEG, 60 * DEG);
    const mv = input.move();
    yawToDir(this.yaw, _fwd);
    _right.set(-_fwd.z, 0, _fwd.x);
    _wish.set(0, 0, 0).addScaledVector(_fwd, mv.y).addScaledVector(_right, mv.x);
    if (_wish.lengthSq() > 1) _wish.normalize();
    // Canlandırılırken kıpırdamaz
    const speed = this.reviver ? 0 : REVIVE.crawlSpeed;
    this.vel.x = damp(this.vel.x, _wish.x * speed, 8, dt);
    this.vel.z = damp(this.vel.z, _wish.z * speed, 8, dt);
    this.state.height = M.crouchHeight;
    this.crouchT = 1;
    g.world.moveCharacter(this.state, dt, M.stepHeight);
    this.syncRender();
    this.horizSpeed = Math.hypot(this.vel.x, this.vel.z);
    this.camY = damp(this.camY, this.pos.y + REVIVE.downedEyeHeight, 8, dt);
    this.adsT = 0;
    this.lean = damp(this.lean, 0, 10, dt);
    // Sayaç: canlandırılırken durur
    if (this.bleed.tick(dt, !!this.reviver)) {
      this.die();
      return;
    }
    // Yardım çağır: E basılı 0,5 sn → telsiz, askerlerin yardım puanı artar; 8 sn bekleme
    if (input.isDown('interact') && this.time >= this.helpReadyAt) {
      this.helpHoldT += dt;
      if (this.helpHoldT >= REVIVE.helpCallHoldSec) {
        this.helpHoldT = 0;
        this.helpReadyAt = this.time + REVIVE.helpCallCooldownSec;
        this.calledHelpUntil = this.time + REVIVE.helpCallCooldownSec;
        g.mission?.radio('Komutan', 'Yardım lazım! Yerdeyim!', 0, 'player');
        g.events.emit('helpCalled');
      }
    } else this.helpHoldT = 0;
    // Pes et: X basılı 2 sn → son kontrol noktasından devam
    if (input.isDown('swapWeapon')) {
      this.giveUpT += dt;
      if (this.giveUpT >= REVIVE.giveUpHoldSec) {
        this.die();
        return;
      }
    } else this.giveUpT = 0;
    // Ses: kalp atışı sayaç azaldıkça hızlanır, ortam boğuklaşır
    const f = this.bleed.frac;
    g.audio.setMuffle(0.55 + (1 - f) * 0.45, REVIVE.muffleHz);
    this.hbTimer -= dt;
    if (this.hbTimer <= 0) {
      const [slow, fast] = REVIVE.heartbeatSec;
      this.hbTimer = fast + (slow - fast) * f;
      g.audio.heartbeat();
    }
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.shakeT += dt;
  }

  die() {
    this.recordTtd();
    this.alive = false;
    this.deathT = 0;
    this.interacting = false;
    this.down = false;
    this.reviver = null;
    this.game.audio.setMuffle(0);
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
      this.syncRender();
      this.trauma = damp(this.trauma, 0, 2, dt);
      return;
    }
    if (this.down) {
      this.updateDowned(dt, input);
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

    // --- Hareket: girdi → komut → sabit adımlı paylaşılan simülasyon (shared/sim/movement.js) ---
    // Aç/kapa ayarları komutta çözülür; silah, zırh ve eylem hareketi mods ile etkiler (sunucu da aynısını doldurur)
    const cmd = updateInputCmd(this.cmd, input, S, this);
    const md = this.state.mods;
    md.mobility = w ? w.data.mobility || 1 : 1;
    md.adsMoveMult = w ? w.data.ads.moveMult : 1;
    md.adsTime = w ? w.data.ads.time : 0.2;
    md.armorSpeed = this.armor.speedMult;
    md.actionMult = this.interacting ? 0.2 : this.usingItem ? KIT.useMoveMult : 1;
    md.sprintBlocked = W.state === 'melee' || W.state === 'cooking' || W.state === 'throwing' || this.interacting || this.usingItem;
    md.noSprint = this.armor.noSprint; // Ağır Saldırı Zırhı'nda koşu kapalı
    md.adsAllowed = W.canAds && !this.interacting && !this.usingItem;
    let alpha = 1;
    if (this.fixedStep) {
      // Sabit 64 Hz: kare süresi biriktirilir, her tick aynı dt ile ilerler (çok oyunculu tahminle aynı sonuç).
      // Üst sınır: çok uzun karede (sekme geri gelince) tick yağmuru olmasın
      this.simAcc = Math.min(this.simAcc + dt, TICK_DT * MAX_TICKS_PER_FRAME);
      while (this.simAcc >= TICK_DT) {
        this.prevPos.copy(this.pos);
        this.onSimEvents(stepPlayer(this.state, cmd, g.world, TICK_DT, M, true), cmd);
        cmd.buttons &= ~BTN.JUMP;
        this.simAcc -= TICK_DT;
      }
      alpha = this.simAcc / TICK_DT;
    } else {
      // Eski yol (konsol cl_fixedstep 0): kare süresiyle tek adım, nicemleme yok
      this.prevPos.copy(this.pos);
      this.onSimEvents(stepPlayer(this.state, cmd, g.world, dt, M, false), cmd);
      cmd.buttons &= ~BTN.JUMP;
    }
    // Çizim konumu iki tick arasında aralanır (ekran tazeleme hızı 64 Hz'in katı değil); ışınlanmada atlanır
    if (this.prevPos.distanceToSquared(this.pos) > RENDER_SNAP_DIST * RENDER_SNAP_DIST) this.prevPos.copy(this.pos);
    this.renderPos.lerpVectors(this.prevPos, this.pos, alpha);

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
    yawToDir(this.yaw, _fwd);
    _right.set(-_fwd.z, 0, _fwd.x);
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
    this.lean = damp(this.lean, leanTarget, 10 * this.armor.speedMult, dt);

    // Kamera yüksekliği (merdivenlerde yumuşatılır)
    const eyeH = lerp(M.eyeStand, M.eyeCrouch, this.crouchT);
    const targetY = this.renderPos.y + eyeH;
    this.camY = Math.abs(targetY - this.camY) > 1.5 ? targetY : damp(this.camY, targetY, 22, dt);
    // İniş çöküşü yayı
    this.landVel += (-this.landDip * 90 - this.landVel * 12) * dt;
    this.landDip += this.landVel * dt;

    // Sağlık yenilenmesi
    const regenDelay = g.difficulty.regenDelay ?? M.regenDelay;
    if (this.time - this.lastDamage > regenDelay && this.health.hp < this.health.max) {
      this.health.heal(M.regenRate * dt);
      if (this.health.hp >= this.health.max) this.ttdStart = -1;
    }
    // Düşük canda kalp atışı
    if (this.health.ratio < 0.35) {
      this.hbTimer -= dt;
      if (this.hbTimer <= 0) {
        this.hbTimer = 0.9;
        g.audio.heartbeat();
      }
    }

    this.updateScope(dt, input, w);
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.shakeT += dt;
    this.updateInteraction(dt, input);
  }

  // Dürbünde nefes salınımı: Shift ile birkaç saniye sabitlenir, sonra nefes nefese kalır
  updateScope(dt, input, w) {
    const scoped = !!(w && w.data.scope) && this.adsT > 0.6;
    this.scopeT = (this.scopeT || 0) + dt;
    if (this.breath === undefined) this.breath = 1;
    const wantHold = scoped && input.isDown('holdBreath') && this.breath > 0 && !this.breathTired;
    this.holdingBreath = wantHold;
    if (wantHold) this.breath = Math.max(0, this.breath - dt / 4);
    else this.breath = Math.min(1, this.breath + dt / 3);
    if (this.breath <= 0) this.breathTired = true;
    if (this.breathTired && this.breath > 0.6) this.breathTired = false;
    let amp = scoped ? 0.55 : 0;
    if (this.crouched) amp *= 0.6;
    amp *= 1 + clamp(this.horizSpeed / 2, 0, 2);
    if (wantHold) amp *= 0.06;
    else if (this.breathTired) amp *= 1.8;
    this.scopeAmp = damp(this.scopeAmp || 0, amp, 6, dt);
    const t = this.scopeT;
    this.scopeSwayP = (Math.sin(t * 1.1) * 0.8 + Math.sin(t * 2.3 + 1.3) * 0.35) * this.scopeAmp * DEG;
    this.scopeSwayY = (Math.cos(t * 0.8) * 0.9 + Math.sin(t * 1.9 + 0.4) * 0.3) * this.scopeAmp * DEG;
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
    const rp = this.renderPos;
    let y = this.camY + bobY + this.landDip;
    let roll = -this.lean * M.leanRoll * DEG + sr;
    if (this.down) roll += REVIVE.downedRollDeg * DEG; // yerde: kamera yere yakın, hafif yan yatık
    if (!this.alive) {
      // Ölüm kamerası: yana devril
      const k = smoothstep(clamp(this.deathT / 0.9, 0, 1));
      y = lerp(this.camY, rp.y + 0.35, k);
      roll += k * 1.1;
    }
    camera.position.set(rp.x + _right.x * (leanX + bobX), y, rp.z + _right.z * (leanX + bobX));
    camera.rotation.set(this.pitch + this.recoil.cp + sp + (this.scopeSwayP || 0), this.yaw + this.recoil.cy + sy + (this.scopeSwayY || 0), roll, 'YXZ');
    g.audio.setListener(camera.position.x, camera.position.y, camera.position.z, this.yaw);
  }
}
