// Oyuncu hareketinin saf adım fonksiyonu (belge §5.1). İstemci tahmini, sunucu ve tek oyunculu aynı kodu çalıştırır.
// Global duruma, sahneye, sese dokunmaz; yalnız durumu günceller ve olay bitlerini döndürür (ses, gürültü,
// silahın şarjör iptali gibi yan etkileri çağıran yapar). Kare hızından bağımsızdır: dt her zaman TICK_DT.
import { MOVEMENT } from '../../src/config.js';
import { QUANT } from '../constants.js';
import { clamp, lerp, damp, quantize } from './math.js';

// InputCmd.buttons bitleri. JUMP bir basıştır (komut başına bir kez); diğerleri istenen durumdur
// (aç/kapa ayarı istemcinin girdi katmanında çözülür, sunucu ayar bilmez).
export const BTN = {
  JUMP: 1,
  CROUCH: 2,
  SPRINT: 4,
  ADS: 8,
  FIRE: 16,
  RELOAD: 32,
  USE: 64,
  LEAN_L: 128,
  LEAN_R: 256,
  MELEE: 512,
  // Çevrim içi: istemcinin silah durumundan gelen kısıtlar (yakın dövüş/şarjör sırasında koşu ve nişan yok).
  // Hareket modlarını sunucu bunlardan doldurur (applyCmdMods): tahmin ile sunucu aynı değerleri kullanır
  NO_SPRINT: 1024,
  NO_ADS: 2048,
};

// stepPlayer'ın döndürdüğü olay bitleri
export const SIM_EV = {
  JUMP: 1, // zıpladı (ayak sesi)
  LAND: 2, // sert iniş; hız state.landSpeed
  SPRINT_START: 4, // koşu başladı (şarjör değiştirme iptal)
  SPRINT_STOP: 8, // koşu bitti (aç/kapa koşu sıfırlanır)
  UNCROUCH: 16, // koşu ya da zıplama çömelmeyi bitirdi (aç/kapa çömelme sıfırlanır)
  CROUCH_BLOCKED: 32, // üstte engel: kalkamadı (aç/kapa çömelme açık kalır)
};

// Hareket durumunu etkileyen dış değerler (silah, zırh, eylem). Sahibi her tick'ten önce doldurur;
// sunucu aynı alanları kendi silah/zırh durumundan doldurur.
export function defaultMods() {
  return {
    mobility: 1, // silahın hareket çarpanı (kalçadan)
    adsMoveMult: 1, // nişandayken hareket çarpanı
    adsTime: 0.2, // nişana girme süresi (sn)
    armorSpeed: 1, // zırhın hız çarpanı (nişan süresine de işler)
    actionMult: 1, // etkileşim (0,2) ya da sarf kullanımı
    sprintBlocked: false, // yakın dövüş, bomba, etkileşim, sarf
    noSprint: false, // ağır zırh
    adsAllowed: true, // silah nişan alabiliyor ve eller boş
  };
}

// Çevrim içi hareket modları: komut bitleri + kuşanılan silahın verisi. İstemci tahmini ve sunucu aynı
// fonksiyonu çağırır (zırh, etkileşim, sarf malzemesi çevrim içinde yok)
export function applyCmdMods(md, buttons, d) {
  md.mobility = d ? d.mobility || 1 : 1;
  md.adsMoveMult = d ? d.ads.moveMult : 1;
  md.adsTime = d ? d.ads.time : 0.2;
  md.armorSpeed = 1;
  md.actionMult = 1;
  md.sprintBlocked = (buttons & BTN.NO_SPRINT) !== 0;
  md.noSprint = false;
  md.adsAllowed = (buttons & BTN.NO_ADS) === 0;
  return md;
}

/** @typedef {{ seq: number, moveX: number, moveY: number, yaw: number, pitch: number, buttons: number }} InputCmd */

export function createInputCmd() {
  return { seq: 0, moveX: 0, moveY: 0, yaw: 0, pitch: 0, buttons: 0 };
}

// Oyuncu durumu. pos/vel verilirse onlar kullanılır (istemcide THREE.Vector3; dışarıdaki referanslar korunur).
export function createPlayerState(M = MOVEMENT, pos = null, vel = null) {
  return {
    pos: pos || { x: 0, y: 0, z: 0 },
    vel: vel || { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    radius: M.radius,
    height: M.standHeight,
    gravity: M.gravity,
    grounded: true,
    hitWall: false,
    landSpeed: 0,
    crouched: false,
    crouchT: 0,
    sprinting: false,
    sprintOut: 0,
    adsT: 0,
    horizSpeed: 0,
    groundSurface: 'sand',
    buttons: 0, // önceki tick'in düğmeleri (nişan basış kenarı için)
    mods: defaultMods(),
  };
}

// Durumu başlangıca döndürür (yeniden doğuş, görev başı)
export function resetPlayerState(s, M = MOVEMENT) {
  s.vel.x = s.vel.y = s.vel.z = 0;
  s.height = M.standHeight;
  s.grounded = true;
  s.hitWall = false;
  s.landSpeed = 0;
  s.crouched = false;
  s.crouchT = 0;
  s.sprinting = false;
  s.sprintOut = 0;
  s.adsT = 0;
  s.horizSpeed = 0;
  s.buttons = 0;
  return s;
}

// Tahmin geçmişi ve sunucu anlık görüntüsü için kopya (mods hariç: her tick yeniden doldurulur)
export function clonePlayerState(s, out = null) {
  const o = out || createPlayerState();
  o.pos.x = s.pos.x;
  o.pos.y = s.pos.y;
  o.pos.z = s.pos.z;
  o.vel.x = s.vel.x;
  o.vel.y = s.vel.y;
  o.vel.z = s.vel.z;
  for (const k of ['yaw', 'pitch', 'radius', 'height', 'gravity', 'grounded', 'hitWall', 'landSpeed', 'crouched', 'crouchT', 'sprinting', 'sprintOut', 'adsT', 'horizSpeed', 'groundSurface', 'buttons']) o[k] = s[k];
  return o;
}

// Koşu biter: kısa süre ateş edilemez (sprintOut). Silah ateşi ve etkileşim de bunu çağırır.
export function stopSprint(s, M = MOVEMENT) {
  if (s.sprinting) s.sprintOut = M.sprintOutTime;
  s.sprinting = false;
}

// Tick sonu nicemleme (belge §5.2/3)
export function quantizePlayerState(s) {
  s.pos.x = quantize(s.pos.x, QUANT.pos);
  s.pos.y = quantize(s.pos.y, QUANT.pos);
  s.pos.z = quantize(s.pos.z, QUANT.pos);
  s.vel.x = quantize(s.vel.x, QUANT.vel);
  s.vel.y = quantize(s.vel.y, QUANT.vel);
  s.vel.z = quantize(s.vel.z, QUANT.vel);
  s.crouchT = quantize(s.crouchT, QUANT.frac);
  s.adsT = quantize(s.adsT, QUANT.frac);
}

/**
 * Bir tick: duruş, koşu/nişan, ivme/sürtünme, zıplama/yerçekimi, çarpışma, nicemleme.
 * @param {ReturnType<typeof createPlayerState>} s durum (yerinde güncellenir)
 * @param {InputCmd} cmd bu tick'in girdisi
 * @param {import('./collision.js').CollisionWorld} world
 * @param {number} dt saniye (sabit TICK_DT; eski yol için kare süresi de olur)
 * @param {object} [M] MOVEMENT ayarları
 * @param {boolean} [quant] tick sonu nicemleme (yalnız sabit adımda)
 * @returns {number} SIM_EV bitleri
 */
export function stepPlayer(s, cmd, world, dt, M = MOVEMENT, quant = true) {
  let ev = 0;
  const md = s.mods;
  const b = cmd.buttons;
  const mx = cmd.moveX;
  const my = cmd.moveY;
  s.yaw = cmd.yaw;
  s.pitch = cmd.pitch;
  const moving = Math.abs(mx) + Math.abs(my) > 0.1;

  // --- Duruş: koşu, nişan, çömelme ---
  let wantCrouch = (b & BTN.CROUCH) !== 0;
  let wantSprint = (b & BTN.SPRINT) !== 0 && my > 0.35 && s.grounded && !md.sprintBlocked && !md.noSprint;
  const wantAds = (b & BTN.ADS) !== 0 && md.adsAllowed;
  // Basış kenarı düğmenin kendisinden (nişan sonradan izinli hâle gelirse koşu kesilmez)
  const adsPressed = wantAds && (s.buttons & BTN.ADS) === 0;
  // Nişana basmak koşuyu keser; nişan basılıyken koşu başlamaz (koşarken basılı tutulan nişan koşuyu kesmez)
  if (adsPressed) wantSprint = false;
  if (wantAds && !s.sprinting) wantSprint = false;
  if (wantSprint && wantCrouch) {
    wantCrouch = false;
    ev |= SIM_EV.UNCROUCH;
  }
  if (wantSprint && !s.sprinting) {
    s.sprinting = true;
    ev |= SIM_EV.SPRINT_START;
  } else if (!wantSprint && s.sprinting) {
    stopSprint(s, M);
    ev |= SIM_EV.SPRINT_STOP;
  }
  if (!moving || my < 0.2) {
    if (s.sprinting) {
      stopSprint(s, M);
      ev |= SIM_EV.SPRINT_STOP;
    }
  }
  if (s.sprintOut > 0) s.sprintOut -= dt;

  if (wantCrouch !== s.crouched) {
    if (wantCrouch) s.crouched = true;
    else if (world.canStand(s.pos, M.radius, M.crouchHeight, M.standHeight)) s.crouched = false;
    else ev |= SIM_EV.CROUCH_BLOCKED;
  }
  s.crouchT = damp(s.crouchT, s.crouched ? 1 : 0, 12, dt);
  s.height = lerp(M.standHeight, M.crouchHeight, s.crouchT);

  const adsTarget = wantAds && !s.sprinting ? 1 : 0;
  // Zırhın hız cezası nişan alma süresine de işler
  s.adsT = clamp(s.adsT + (adsTarget ? 1 : -1) * (dt / (md.adsTime / md.armorSpeed)), 0, 1);

  // --- Hareket ---
  // yaw=0 → -Z; sağ = (-ileri.z, 0, ileri.x)
  const fx = -Math.sin(s.yaw);
  const fz = -Math.cos(s.yaw);
  let wx = fx * my + -fz * mx;
  let wz = fz * my + fx * mx;
  // Nicemlenmiş analog girdi (i8) çaprazda 1'i hafifçe aşabilir: hız tavanı aşılmasın
  const wl = wx * wx + wz * wz;
  if (wl > 1) {
    const k = 1 / Math.sqrt(wl);
    wx *= k;
    wz *= k;
  }
  let maxSpeed = s.sprinting ? M.sprintSpeed : s.crouched ? M.crouchSpeed : M.walkSpeed;
  maxSpeed *= lerp(md.mobility, md.adsMoveMult, s.adsT);
  maxSpeed *= md.armorSpeed; // zırhın hız cezası (belge §4.7)
  maxSpeed *= md.actionMult;
  const v = s.vel;
  if (s.grounded) {
    let dx = wx * maxSpeed - v.x;
    let dz = wz * maxSpeed - v.z;
    const dl = Math.hypot(dx, dz);
    const acc = (moving ? M.groundAccel : M.friction * 6) * dt;
    if (dl > acc) {
      dx *= acc / dl;
      dz *= acc / dl;
    }
    v.x += dx;
    v.z += dz;
    if (b & BTN.JUMP) {
      if (s.crouched) {
        if (world.canStand(s.pos, M.radius, M.crouchHeight, M.standHeight)) {
          s.crouched = false;
          ev |= SIM_EV.UNCROUCH;
        }
      } else {
        v.y = M.jumpVelocity;
        s.grounded = false;
        ev |= SIM_EV.JUMP;
      }
    }
  } else {
    v.x += wx * M.airAccel * dt;
    v.z += wz * M.airAccel * dt;
    const hs = Math.hypot(v.x, v.z);
    const cap = Math.max(maxSpeed, 0.1);
    if (hs > cap * 1.05) {
      v.x *= (cap * 1.05) / hs;
      v.z *= (cap * 1.05) / hs;
    }
  }
  const wasGrounded = s.grounded;
  s.landSpeed = 0;
  // Uzun karede (eski değişken adım yolu) iki alt adım: tünelleme ve iniş hatası olmasın
  const steps = dt > 0.02 ? 2 : 1;
  let groundC = null;
  for (let i = 0; i < steps; i++) groundC = world.moveCharacter(s, dt / steps, M.stepHeight);
  s.groundSurface = groundC ? groundC.surface : world.floorSurface || 'sand';
  if (!wasGrounded && s.grounded && s.landSpeed > 2.5) ev |= SIM_EV.LAND;
  if (quant) quantizePlayerState(s);
  s.horizSpeed = Math.hypot(v.x, v.z);
  s.buttons = b;
  return ev;
}
