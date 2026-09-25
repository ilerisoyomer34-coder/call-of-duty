// Oyunun tüm ayar değerleri (UE5'teki Data Asset'lerin karşılığı).
// Silah hissini, hareketi ve yapay zekâyı buradan ayarla; kodda sihirli sayı yok.
// Açılar derece, mesafeler metre, süreler saniye.

export const MOVEMENT = {
  walkSpeed: 4.0,
  sprintSpeed: 6.5,
  crouchSpeed: 2.0,
  groundAccel: 55,
  airAccel: 8,
  friction: 10,
  jumpVelocity: 4.8,
  gravity: 15,
  standHeight: 1.8,
  crouchHeight: 1.15,
  eyeStand: 1.65,
  eyeCrouch: 1.02,
  radius: 0.35,
  stepHeight: 0.45,
  leanOffset: 0.38,
  leanRoll: 9,
  sprintOutTime: 0.18, // koşudan çıkıp ateş edebilmek için geçen süre
  maxHealth: 100,
  regenDelay: 4.5,
  regenRate: 28,
  // Yapay zekânın duyacağı ayak sesi yarıçapları
  noiseSprint: 16,
  noiseWalk: 7,
  noiseCrouch: 1.5,
  stepDistWalk: 1.9,
  stepDistSprint: 2.5,
  stepDistCrouch: 1.4,
};

// Silah veri varlıkları. fireModes: 'auto' | 'burst' | 'semi'.
export const WEAPONS = {
  rifle: {
    id: 'rifle',
    name: 'AR-7 Vanguard',
    kind: 'Taarruz Tüfeği',
    slot: 1,
    fireModes: ['auto', 'burst', 'semi'],
    rpm: 720,
    burstCount: 3,
    burstRpm: 900,
    burstDelay: 0.28,
    pellets: 1,
    range: 260,
    damage: 30,
    falloff: { start: 30, end: 75, min: 0.65 },
    zones: { head: 2.4, torso: 1.0, limb: 0.8 },
    magSize: 30,
    reserveMax: 240,
    reserveStart: 150,
    reloadType: 'mag',
    reloadTactical: 1.9,
    reloadEmpty: 2.35,
    ammoInsertAt: 0.62, // reload'un bu oranında cephane şarjöre geçer
    chamber: true,
    spread: { hip: 2.6, perShot: 0.32, max: 6, recovery: 9, adsMult: 0.1, crouchMult: 0.8, moveMult: 1.7, airMult: 3.0 },
    recoil: {
      // Her atışın (yatay, dikey) derece tepmesi. Desen sonunda son 4'lü döngüye girer.
      pattern: [
        [0.0, 0.9], [0.1, 0.85], [-0.1, 0.8], [0.2, 0.75], [0.25, 0.7], [0.1, 0.65],
        [-0.25, 0.6], [-0.35, 0.55], [-0.2, 0.5], [0.15, 0.5], [0.35, 0.45], [0.3, 0.45],
      ],
      random: 0.18,
      adsMult: 0.72,
      recoveryDelay: 0.09,
      recovery: 9,
      kick: 0.9,
      kickRot: 1.0,
      shake: 0.11,
    },
    ads: { fovMult: 0.72, time: 0.2, moveMult: 0.7, sensMult: 0.8, vmFov: 38 },
    equipTime: 0.45,
    unequipTime: 0.3,
    hip: { pos: [0.16, -0.17, -0.38] },
    adsDist: 0.27,
    sound: 'rifle',
    noise: 70,
  },
  shotgun: {
    id: 'shotgun',
    name: 'SG-12 Breaker',
    kind: 'Pompalı',
    slot: 2,
    fireModes: ['semi'],
    rpm: 70,
    pellets: 9,
    pelletSpread: 4.2,
    range: 60,
    damage: 17,
    falloff: { start: 7, end: 24, min: 0.18 },
    zones: { head: 1.6, torso: 1.0, limb: 0.85 },
    magSize: 7,
    reserveMax: 42,
    reserveStart: 21,
    reloadType: 'shell',
    reloadStart: 0.38,
    reloadPerShell: 0.5,
    reloadEnd: 0.42,
    chamber: false,
    pumpDelay: 0.16,
    spread: { hip: 1.2, perShot: 0.8, max: 3.5, recovery: 5, adsMult: 0.6, crouchMult: 0.9, moveMult: 1.2, airMult: 1.8 },
    recoil: {
      pattern: [[0.0, 4.2], [0.4, 3.9]],
      random: 0.5,
      adsMult: 0.85,
      recoveryDelay: 0.14,
      recovery: 6,
      kick: 2.4,
      kickRot: 2.6,
      shake: 0.42,
    },
    ads: { fovMult: 0.85, time: 0.24, moveMult: 0.72, sensMult: 0.85, vmFov: 42 },
    equipTime: 0.55,
    unequipTime: 0.35,
    hip: { pos: [0.16, -0.18, -0.36] },
    adsDist: 0.22,
    sound: 'shotgun',
    noise: 80,
  },
  pistol: {
    id: 'pistol',
    name: 'P-9 Sentinel',
    kind: 'Tabanca',
    slot: 3,
    fireModes: ['semi'],
    rpm: 450,
    pellets: 1,
    range: 120,
    damage: 34,
    falloff: { start: 14, end: 40, min: 0.55 },
    zones: { head: 2.2, torso: 1.0, limb: 0.8 },
    magSize: 12,
    reserveMax: 96,
    reserveStart: 48,
    reloadType: 'mag',
    reloadTactical: 1.35,
    reloadEmpty: 1.7,
    ammoInsertAt: 0.6,
    chamber: true,
    spread: { hip: 1.8, perShot: 0.9, max: 5, recovery: 10, adsMult: 0.15, crouchMult: 0.85, moveMult: 1.4, airMult: 2.5 },
    recoil: {
      pattern: [[0.0, 1.7], [0.15, 1.6], [-0.15, 1.5]],
      random: 0.35,
      adsMult: 0.8,
      recoveryDelay: 0.06,
      recovery: 11,
      kick: 1.3,
      kickRot: 1.6,
      shake: 0.16,
    },
    ads: { fovMult: 0.86, time: 0.14, moveMult: 0.85, sensMult: 0.85, vmFov: 44 },
    equipTime: 0.32,
    unequipTime: 0.22,
    hip: { pos: [0.14, -0.15, -0.33] },
    adsDist: 0.26,
    sound: 'pistol',
    noise: 55,
  },
};

export const WEAPON_ORDER = ['rifle', 'shotgun', 'pistol'];

export const GRENADE = {
  fuse: 3.2,
  throwSpeed: 17,
  upBoost: 4.5,
  radius: 7.5,
  damage: 170,
  maxCount: 4,
  startCount: 3,
  bounce: 0.35,
  cookable: true,
};

export const MELEE = { range: 2.1, damage: 140, cooldown: 0.75, hitTime: 0.14 };

export const C4 = { plantTime: 2.2, fuse: 5.0, radius: 9, damage: 400 };

// Düşman silahları: oyuncuyla aynı veri düzeni, ek olarak seri atış ayarları.
export const ENEMY_WEAPONS = {
  rifle: { rpm: 560, damage: 11, magSize: 30, reload: 2.4, burst: [3, 5], burstGap: [0.5, 1.1], pellets: 1, range: 90, sound: 'enemyRifle', noise: 60 },
  shotgun: { rpm: 80, damage: 9, magSize: 6, reload: 2.8, burst: [1, 1], burstGap: [0.7, 1.0], pellets: 7, spreadDeg: 5, range: 22, sound: 'enemyShotgun', noise: 70 },
  lmg: { rpm: 700, damage: 11, magSize: 80, reload: 4.2, burst: [8, 16], burstGap: [0.5, 1.0], pellets: 1, range: 90, sound: 'enemyLmg', noise: 70 },
  sniper: { rpm: 30, damage: 72, magSize: 5, reload: 3.2, burst: [1, 1], burstGap: [2.2, 3.0], pellets: 1, range: 160, sound: 'sniper', noise: 90, charge: 1.3 },
};

export const ENEMY_TYPES = {
  rifleman: {
    name: 'Tüfekçi', hp: 100, weapon: 'rifle', walk: 1.7, run: 4.2, viewRange: 58, fov: 120,
    prefDist: [10, 26], usesCover: true, rushes: false, aimBase: 2.9, headMult: 2.4,
    colors: { uniform: 0x6b5f45, vest: 0x3c3a2e, helmet: 0x4b4a3a, skin: 0xa77b5b, band: 0x8e2b23 },
  },
  shotgunner: {
    name: 'Saldırgan', hp: 120, weapon: 'shotgun', walk: 1.8, run: 4.9, viewRange: 45, fov: 120,
    prefDist: [2, 7], usesCover: false, rushes: true, aimBase: 3.0, headMult: 2.2,
    colors: { uniform: 0x3e4a3a, vest: 0x2a2c26, helmet: 0x2f332c, skin: 0x8f6a4f, band: 0x8e2b23 },
  },
  heavy: {
    name: 'Ağır Makineli', hp: 320, weapon: 'lmg', walk: 1.3, run: 2.6, viewRange: 60, fov: 110,
    prefDist: [12, 30], usesCover: false, rushes: false, aimBase: 3.2, headMult: 1.6,
    colors: { uniform: 0x2d2f2a, vest: 0x1d1e1b, helmet: 0x222420, skin: 0x9c7456, band: 0x8e2b23 },
    scale: 1.12,
  },
  sniper: {
    name: 'Keskin Nişancı', hp: 80, weapon: 'sniper', walk: 1.5, run: 3.8, viewRange: 120, fov: 70,
    prefDist: [30, 120], usesCover: false, rushes: false, aimBase: 0.35, headMult: 2.4, stationary: true,
    colors: { uniform: 0x7a6a4c, vest: 0x5b513d, helmet: 0x6a5d44, skin: 0xa77b5b, band: 0x8e2b23 },
  },
};

// Zorluk ayarları (DA_Difficulty karşılığı).
export const DIFFICULTY = {
  easy: {
    label: 'Acemi', desc: 'Düşmanlar yavaş fark eder, az isabet ettirir.',
    reaction: 0.95, aimMult: 1.7, damageMult: 0.55, perception: 0.8, awarenessRate: 0.65,
    maxAttackers: 1, grenades: false, regenDelay: 3.5, dpsCap: 32,
  },
  normal: {
    label: 'Asker', desc: 'Dengeli çatışma. İlk oynayış için önerilir.',
    reaction: 0.62, aimMult: 1.0, damageMult: 1.0, perception: 1.0, awarenessRate: 1.0,
    maxAttackers: 2, grenades: true, regenDelay: 4.5, dpsCap: 40,
  },
  hard: {
    label: 'Gazi', desc: 'Hızlı tepki, sert isabet, bol el bombası.',
    reaction: 0.38, aimMult: 0.72, damageMult: 1.45, perception: 1.15, awarenessRate: 1.45,
    maxAttackers: 3, grenades: true, regenDelay: 5.5, dpsCap: 75,
  },
};

export const AI = {
  thinkInterval: 0.1, // algı güncelleme aralığı
  activeRadius: 95, // bu mesafenin ötesindeki düşmanlar uyur
  alertRadius: 28, // alarm veren düşmanın uyandırdığı yarıçap
  gunshotHearing: 1.0, // silah sesi duyma çarpanı
  suspicionDecay: 0.12,
  investigateTime: 7,
  loseTargetTime: 4,
  grenadeCooldown: 14,
  globalGrenadeCooldown: 7,
  coverSearchRadius: 16,
  firstShotsMissBonus: 3.0, // derece; ilk atışlar oyuncuyu uyarmak için daha çok ıskalar
  acquireWindup: 1.6, // bu süre boyunca isabet kademeli artar
};

export const SCORE = { kill: 100, headshot: 50, melee: 75, objective: 250 };

export const SURFACES = {
  sand: { impact: 'dust', color: 0xc8a878, step: 'sand' },
  concrete: { impact: 'dust', color: 0x9a978f, step: 'concrete' },
  metal: { impact: 'sparks', color: 0x6d7275, step: 'metal' },
  wood: { impact: 'splinter', color: 0x8b6a45, step: 'wood' },
  sandbag: { impact: 'dust', color: 0xa89470, step: 'sand' },
  flesh: { impact: 'blood', color: 0x7a1010, step: 'sand' },
  rock: { impact: 'dust', color: 0x8a7a66, step: 'concrete' },
};
