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
  regenDelay: 6,
  regenRate: 18, // can/s; zırh, ilk yardım kiti ve canlandırma gelince yavaşlatıldı (28 → 18, Operasyon Güncellemesi kararı)
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
    category: 'primary',
    tracerEvery: 2,
    flashSize: 0.14,
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
    category: 'primary',
    pump: true,
    flashSize: 0.2,
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
    adsDist: 0.28,
    sound: 'shotgun',
    noise: 80,
  },
  pistol: {
    id: 'pistol',
    name: 'P-9 Sentinel',
    kind: 'Tabanca',
    category: 'secondary',
    slide: true,
    flashSize: 0.1,
    fireModes: ['semi'],
    rpm: 450,
    pellets: 1,
    range: 120,
    damage: 34,
    falloff: { start: 14, end: 40, min: 0.55 },
    zones: { head: 2.2, torso: 1.0, limb: 0.8 },
    magSize: 17, // Glock 17: 17'lik şarjör (gerçek adla tutarlı)
    reserveMax: 102,
    reserveStart: 51,
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
    adsDist: 0.36,
    sound: 'pistol',
    noise: 55,
  },

  // --- Blender'dan içe aktarılan modeller (SourceAssets/Weapons) ---
  mar556: {
    id: 'mar556',
    name: 'MAR-556',
    kind: 'Taarruz Tüfeği',
    category: 'primary',
    model: 'glb',
    reticle: 'dot',
    fireModes: ['auto', 'semi'],
    rpm: 800,
    pellets: 1,
    range: 260,
    damage: 26,
    falloff: { start: 35, end: 80, min: 0.7 },
    zones: { head: 2.4, torso: 1.0, limb: 0.8 },
    magSize: 30,
    reserveMax: 240,
    reserveStart: 150,
    reloadType: 'mag',
    reloadTactical: 2.0,
    reloadEmpty: 2.5,
    ammoInsertAt: 0.6,
    chamber: true,
    spread: { hip: 2.8, perShot: 0.28, max: 6, recovery: 10, adsMult: 0.08, crouchMult: 0.8, moveMult: 1.7, airMult: 3.0 },
    recoil: {
      pattern: [
        [0.0, 0.8], [-0.15, 0.78], [0.2, 0.74], [0.3, 0.7], [-0.1, 0.66], [-0.3, 0.62],
        [0.15, 0.58], [0.35, 0.55], [0.1, 0.52], [-0.3, 0.5], [-0.2, 0.48], [0.25, 0.46],
      ],
      random: 0.2,
      adsMult: 0.7,
      recoveryDelay: 0.08,
      recovery: 10,
      kick: 0.85,
      kickRot: 0.95,
      shake: 0.1,
    },
    ads: { fovMult: 0.7, time: 0.22, moveMult: 0.7, sensMult: 0.8, vmFov: 36 },
    equipTime: 0.5,
    unequipTime: 0.32,
    hip: { pos: [0.15, -0.165, -0.34] },
    adsDist: 0.2,
    sound: 'rifle2',
    noise: 70,
    adsRing: { r: 0.016, len: 0.05 },
    tracerEvery: 2,
    flashSize: 0.14,
  },
  lmg: {
    id: 'lmg',
    name: 'MG-43',
    kind: 'Hafif Makineli Tüfek',
    category: 'primary',
    model: 'glb',
    asset: 'mg43',
    reticle: 'dot',
    fireModes: ['auto'],
    rpm: 900,
    pellets: 1,
    range: 280,
    damage: 29,
    falloff: { start: 40, end: 90, min: 0.7 },
    zones: { head: 2.2, torso: 1.0, limb: 0.8 },
    magSize: 100,
    reserveMax: 300,
    reserveStart: 200,
    reloadType: 'mag',
    reloadTactical: 4.6,
    reloadEmpty: 5.4,
    ammoInsertAt: 0.62,
    chamber: false,
    spread: { hip: 4.0, perShot: 0.22, max: 7.5, recovery: 6, adsMult: 0.14, crouchMult: 0.7, moveMult: 1.9, airMult: 3.0 },
    recoil: {
      pattern: [
        [0.0, 0.62], [0.2, 0.6], [0.3, 0.56], [0.1, 0.52], [-0.2, 0.5], [-0.35, 0.48],
        [-0.15, 0.46], [0.2, 0.45], [0.35, 0.44], [0.1, 0.44], [-0.25, 0.43], [-0.3, 0.43],
      ],
      random: 0.3,
      adsMult: 0.65,
      recoveryDelay: 0.1,
      recovery: 7,
      kick: 1.0,
      kickRot: 1.1,
      shake: 0.13,
    },
    ads: { fovMult: 0.72, time: 0.36, moveMult: 0.55, sensMult: 0.75, vmFov: 40 },
    mobility: 0.86,
    equipTime: 0.8,
    unequipTime: 0.5,
    hip: { pos: [0.16, -0.2, -0.36] },
    adsDist: 0.2,
    sound: 'lmg',
    noise: 80,
    adsRing: { r: 0.022, len: 0.12 },
    tracerEvery: 2,
    flashSize: 0.17,
  },
  sniper: {
    id: 'sniper',
    name: 'MR-82 Marret',
    kind: 'Keskin Nişancı .50',
    category: 'primary',
    model: 'glb',
    asset: 'm82',
    scope: true,
    fireModes: ['semi'],
    rpm: 70,
    pellets: 1,
    range: 450,
    damage: 145,
    falloff: { start: 80, end: 220, min: 0.85 },
    zones: { head: 3.0, torso: 1.0, limb: 0.9 },
    magSize: 10,
    reserveMax: 40,
    reserveStart: 20,
    reloadType: 'mag',
    reloadTactical: 3.2,
    reloadEmpty: 3.9,
    ammoInsertAt: 0.6,
    chamber: true,
    spread: { hip: 7, perShot: 3, max: 9, recovery: 4, adsMult: 0.0, crouchMult: 0.8, moveMult: 1.4, airMult: 3.0 },
    recoil: {
      pattern: [[0.0, 5.5], [0.4, 5.0]],
      random: 0.8,
      adsMult: 0.8,
      recoveryDelay: 0.15,
      recovery: 5,
      kick: 3.0,
      kickRot: 3.5,
      shake: 0.55,
    },
    ads: { fovMult: 0.16, time: 0.4, moveMult: 0.5, sensMult: 1.1, vmFov: 40 },
    mobility: 0.85,
    equipTime: 0.8,
    unequipTime: 0.5,
    hip: { pos: [0.16, -0.2, -0.36] },
    adsDist: 0.16,
    sound: 'bmg50',
    noise: 110,
    tracerEvery: 1,
    flashSize: 0.28,
  },
  d50: {
    id: 'd50',
    name: 'D-50 Kartal',
    kind: 'Ağır Tabanca .50',
    category: 'secondary',
    model: 'glb',
    slide: true,
    fireModes: ['semi'],
    rpm: 160,
    pellets: 1,
    range: 150,
    damage: 62,
    falloff: { start: 20, end: 50, min: 0.6 },
    zones: { head: 2.4, torso: 1.0, limb: 0.8 },
    magSize: 7,
    reserveMax: 42,
    reserveStart: 28,
    reloadType: 'mag',
    reloadTactical: 1.6,
    reloadEmpty: 2.0,
    ammoInsertAt: 0.6,
    chamber: true,
    spread: { hip: 2.4, perShot: 1.8, max: 6, recovery: 7, adsMult: 0.12, crouchMult: 0.85, moveMult: 1.4, airMult: 2.5 },
    recoil: {
      pattern: [[0.0, 3.4], [0.3, 3.2], [-0.3, 3.0]],
      random: 0.6,
      adsMult: 0.85,
      recoveryDelay: 0.08,
      recovery: 8,
      kick: 2.2,
      kickRot: 2.8,
      shake: 0.3,
    },
    ads: { fovMult: 0.84, time: 0.18, moveMult: 0.82, sensMult: 0.85, vmFov: 44 },
    equipTime: 0.4,
    unequipTime: 0.25,
    hip: { pos: [0.13, -0.15, -0.34] },
    adsDist: 0.42,
    envIntensity: 0.5,
    sound: 'magnum',
    noise: 70,
    flashSize: 0.13,
  },
  // --- Yeni prosedürel silahlar ---
  smg: {
    id: 'smg',
    name: 'SMG-9 Akrep',
    kind: 'Hafif Makineli',
    category: 'primary',
    reticle: 'dot',
    fireModes: ['auto', 'semi'],
    rpm: 950,
    pellets: 1,
    range: 160,
    damage: 20,
    falloff: { start: 12, end: 32, min: 0.55 },
    zones: { head: 2.0, torso: 1.0, limb: 0.85 },
    magSize: 32,
    reserveMax: 256,
    reserveStart: 160,
    reloadType: 'mag',
    reloadTactical: 1.7,
    reloadEmpty: 2.1,
    ammoInsertAt: 0.58,
    chamber: true,
    spread: { hip: 2.0, perShot: 0.35, max: 5, recovery: 12, adsMult: 0.18, crouchMult: 0.85, moveMult: 1.25, airMult: 2.2 },
    recoil: {
      pattern: [
        [0.0, 0.55], [0.2, 0.5], [-0.2, 0.5], [0.25, 0.46], [-0.25, 0.44], [0.3, 0.42],
        [-0.3, 0.4], [0.2, 0.4], [-0.2, 0.38], [0.25, 0.38], [-0.25, 0.36], [0.2, 0.36],
      ],
      random: 0.3,
      adsMult: 0.75,
      recoveryDelay: 0.07,
      recovery: 11,
      kick: 0.7,
      kickRot: 0.8,
      shake: 0.08,
    },
    ads: { fovMult: 0.8, time: 0.14, moveMult: 0.85, sensMult: 0.85, vmFov: 44 },
    mobility: 1.06,
    equipTime: 0.35,
    unequipTime: 0.22,
    hip: { pos: [0.15, -0.16, -0.34] },
    adsDist: 0.22,
    sound: 'smg',
    noise: 55,
    tracerEvery: 3,
    flashSize: 0.11,
  },
  rpg: {
    id: 'rpg',
    name: 'RK-7 Yıldırım',
    kind: 'Roketatar',
    category: 'secondary',
    projectile: 'rocket',
    fireModes: ['semi'],
    rpm: 60,
    pellets: 1,
    range: 300,
    damage: 280,
    splashRadius: 6.5,
    splashDamage: 230,
    rocketSpeed: 55,
    falloff: { start: 999, end: 1000, min: 1 },
    zones: { head: 1, torso: 1, limb: 1 },
    magSize: 1,
    reserveMax: 4,
    reserveStart: 3,
    pickupChance: 0.3,
    reloadType: 'mag',
    reloadTactical: 2.8,
    reloadEmpty: 2.8,
    ammoInsertAt: 0.6,
    chamber: false,
    spread: { hip: 3, perShot: 0, max: 3, recovery: 5, adsMult: 0.1, crouchMult: 0.8, moveMult: 1.3, airMult: 2 },
    recoil: {
      pattern: [[0.0, 3.5]],
      random: 0.5,
      adsMult: 0.8,
      recoveryDelay: 0.15,
      recovery: 5,
      kick: 3.2,
      kickRot: 2.0,
      shake: 0.5,
    },
    ads: { fovMult: 0.78, time: 0.35, moveMult: 0.6, sensMult: 0.8, vmFov: 44 },
    mobility: 0.9,
    equipTime: 0.7,
    unequipTime: 0.4,
    hip: { pos: [0.2, -0.2, -0.3] },
    adsDist: 0.28,
    sound: 'rocket',
    noise: 90,
    flashSize: 0.3,
  },
  // --- Sketchfab silahları (CC BY 4.0; adlar kurgusal, dokulardaki gerçek marka yazıları silindi) ---
  // Uzun namlulu taarruz tüfeği: demir nişangah, en yüksek mermi hasarı, biraz ağır
  k8: {
    id: 'k8',
    name: 'K8 Bozkurt',
    kind: 'Taarruz Tüfeği',
    category: 'primary',
    model: 'glb',
    source: 'sketchfab',
    fireModes: ['auto', 'semi'],
    rpm: 700,
    pellets: 1,
    range: 300,
    damage: 32,
    falloff: { start: 40, end: 90, min: 0.72 },
    zones: { head: 2.4, torso: 1.0, limb: 0.8 },
    magSize: 30,
    reserveMax: 240,
    reserveStart: 150,
    reloadType: 'mag',
    reloadTactical: 2.1,
    reloadEmpty: 2.6,
    ammoInsertAt: 0.6,
    chamber: true,
    spread: { hip: 2.9, perShot: 0.3, max: 6, recovery: 9, adsMult: 0.08, crouchMult: 0.8, moveMult: 1.8, airMult: 3.0 },
    recoil: {
      pattern: [
        [0.0, 0.95], [0.12, 0.9], [-0.12, 0.85], [0.22, 0.8], [0.28, 0.74], [0.1, 0.7],
        [-0.28, 0.64], [-0.36, 0.6], [-0.2, 0.55], [0.18, 0.52], [0.36, 0.5], [0.3, 0.48],
      ],
      random: 0.18,
      adsMult: 0.7,
      recoveryDelay: 0.09,
      recovery: 9,
      kick: 0.95,
      kickRot: 1.05,
      shake: 0.12,
    },
    ads: { fovMult: 0.7, time: 0.24, moveMult: 0.68, sensMult: 0.78, vmFov: 36 },
    mobility: 0.95,
    equipTime: 0.5,
    unequipTime: 0.32,
    hip: { pos: [0.15, -0.165, -0.34] },
    adsDist: 0.2,
    sound: 'rifle2',
    noise: 72,
    tracerEvery: 2,
    flashSize: 0.14,
  },
  // Karabina: taşıma kulbundaki arpacıkla nişan, üçlü seri atış, hafif ve çevik
  kr4: {
    id: 'kr4',
    name: 'KR-4 Atmaca',
    kind: 'Karabina',
    category: 'primary',
    model: 'glb',
    source: 'sketchfab',
    fireModes: ['burst', 'auto', 'semi'],
    rpm: 800,
    burstCount: 3,
    burstRpm: 950,
    burstDelay: 0.25,
    pellets: 1,
    range: 240,
    damage: 27,
    falloff: { start: 30, end: 70, min: 0.65 },
    zones: { head: 2.4, torso: 1.0, limb: 0.8 },
    magSize: 30,
    reserveMax: 240,
    reserveStart: 150,
    reloadType: 'mag',
    reloadTactical: 1.8,
    reloadEmpty: 2.25,
    ammoInsertAt: 0.6,
    chamber: true,
    spread: { hip: 2.5, perShot: 0.3, max: 6, recovery: 10, adsMult: 0.1, crouchMult: 0.8, moveMult: 1.6, airMult: 3.0 },
    recoil: {
      pattern: [
        [0.0, 0.8], [-0.12, 0.76], [0.18, 0.72], [0.28, 0.68], [-0.1, 0.64], [-0.28, 0.6],
        [0.14, 0.56], [0.32, 0.53], [0.08, 0.5], [-0.28, 0.48], [-0.18, 0.46], [0.22, 0.44],
      ],
      random: 0.18,
      adsMult: 0.7,
      recoveryDelay: 0.08,
      recovery: 10,
      kick: 0.85,
      kickRot: 0.95,
      shake: 0.1,
    },
    ads: { fovMult: 0.74, time: 0.19, moveMult: 0.74, sensMult: 0.82, vmFov: 36 },
    mobility: 1.04,
    equipTime: 0.42,
    unequipTime: 0.28,
    hip: { pos: [0.15, -0.165, -0.34] },
    adsDist: 0.18,
    sound: 'rifle',
    noise: 68,
    tracerEvery: 2,
    flashSize: 0.13,
  },
  // Holografik nişangahlı karabina: ön tutamak geri tepmeyi azaltır, nişan hızlı
  mk4: {
    id: 'mk4',
    name: 'MK-4 Doğan',
    kind: 'Karabina · Holografik',
    category: 'primary',
    model: 'glb',
    source: 'sketchfab',
    reticle: 'dot',
    fireModes: ['auto', 'semi'],
    rpm: 820,
    pellets: 1,
    range: 250,
    damage: 26,
    falloff: { start: 32, end: 75, min: 0.68 },
    zones: { head: 2.4, torso: 1.0, limb: 0.8 },
    magSize: 30,
    reserveMax: 240,
    reserveStart: 150,
    reloadType: 'mag',
    reloadTactical: 1.9,
    reloadEmpty: 2.4,
    ammoInsertAt: 0.6,
    chamber: true,
    spread: { hip: 2.6, perShot: 0.26, max: 5.5, recovery: 10, adsMult: 0.07, crouchMult: 0.8, moveMult: 1.6, airMult: 3.0 },
    recoil: {
      pattern: [
        [0.0, 0.72], [-0.1, 0.7], [0.15, 0.66], [0.24, 0.62], [-0.08, 0.58], [-0.24, 0.55],
        [0.12, 0.52], [0.28, 0.5], [0.08, 0.47], [-0.24, 0.45], [-0.16, 0.43], [0.2, 0.42],
      ],
      random: 0.16,
      adsMult: 0.62,
      recoveryDelay: 0.08,
      recovery: 11,
      kick: 0.8,
      kickRot: 0.9,
      shake: 0.09,
    },
    ads: { fovMult: 0.68, time: 0.2, moveMult: 0.72, sensMult: 0.8, vmFov: 36 },
    equipTime: 0.45,
    unequipTime: 0.3,
    hip: { pos: [0.15, -0.17, -0.34] },
    adsDist: 0.2,
    sound: 'rifle2',
    noise: 70,
    // Holografik nişangah gövdesi (optic) nişan alırken gizlenir, yerine açık tüp çizilir
    adsRing: { r: 0.02, len: 0.05 },
    tracerEvery: 2,
    flashSize: 0.13,
  },
  // Taktik nişancı tüfeği: büyütmeli dürbün, yarı otomatik, uzak menzil
  kt9: {
    id: 'kt9',
    name: 'KT-9 Kaplan',
    kind: 'Taktik Nişancı Tüfeği',
    category: 'primary',
    model: 'glb',
    source: 'sketchfab',
    scope: true,
    fireModes: ['semi'],
    rpm: 360,
    pellets: 1,
    range: 380,
    damage: 58,
    falloff: { start: 60, end: 160, min: 0.8 },
    zones: { head: 2.6, torso: 1.0, limb: 0.85 },
    magSize: 20,
    reserveMax: 120,
    reserveStart: 80,
    reloadType: 'mag',
    reloadTactical: 2.3,
    reloadEmpty: 2.9,
    ammoInsertAt: 0.6,
    chamber: true,
    spread: { hip: 4.5, perShot: 1.2, max: 7, recovery: 6, adsMult: 0.02, crouchMult: 0.8, moveMult: 1.6, airMult: 3.0 },
    recoil: {
      pattern: [[0.0, 2.2], [0.25, 2.0], [-0.2, 2.0]],
      random: 0.4,
      adsMult: 0.75,
      recoveryDelay: 0.1,
      recovery: 7,
      kick: 1.8,
      kickRot: 2.0,
      shake: 0.3,
    },
    ads: { fovMult: 0.3, time: 0.3, moveMult: 0.6, sensMult: 0.9, vmFov: 38 },
    mobility: 0.9,
    equipTime: 0.6,
    unequipTime: 0.38,
    hip: { pos: [0.16, -0.18, -0.34] },
    adsDist: 0.2,
    sound: 'rifle2',
    noise: 85,
    tracerEvery: 1,
    flashSize: 0.18,
  },
};

// Tuş sırası: 1-9 (poligonda hepsi, görevde ana + yan silah)
// Sketchfab silahları sonda: poligonda 1-9 tuşları eski dizilişte kalır, yenilere tekerlekle geçilir
export const WEAPON_ORDER = ['rifle', 'mar556', 'smg', 'shotgun', 'lmg', 'sniper', 'pistol', 'd50', 'rpg', 'k8', 'kr4', 'mk4', 'kt9'];
export const DEFAULT_LOADOUT = { primary: 'rifle', secondary: 'pistol' };

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

// Görevde sarf malzemesi kullanımı (değerler data/store.json → consumables; burada yalnız his ayarı)
export const KIT = {
  useMoveMult: 0.55, // plaka/ilk yardım takılırken yürüme hızı çarpanı
};

export const MELEE = { range: 2.1, damage: 140, cooldown: 0.75, hitTime: 0.14 };

export const C4 = { plantTime: 2.2, fuse: 5.0, radius: 9, damage: 400 };

// Düşman silahları: oyuncuyla aynı veri düzeni, ek olarak seri atış ayarları.
export const ENEMY_WEAPONS = {
  rifle: { rpm: 560, damage: 11, magSize: 30, reload: 2.4, burst: [3, 5], burstGap: [0.5, 1.1], pellets: 1, range: 90, sound: 'enemyRifle', noise: 60 },
  shotgun: { rpm: 80, damage: 9, magSize: 6, reload: 2.8, burst: [1, 1], burstGap: [0.7, 1.0], pellets: 7, spreadDeg: 5, range: 22, sound: 'enemyShotgun', noise: 70 },
  lmg: { rpm: 700, damage: 11, magSize: 80, reload: 4.2, burst: [8, 16], burstGap: [0.5, 1.0], pellets: 1, range: 90, sound: 'enemyLmg', noise: 70 },
  sniper: { rpm: 30, damage: 72, magSize: 5, reload: 3.2, burst: [1, 1], burstGap: [2.2, 3.0], pellets: 1, range: 160, sound: 'sniper', noise: 90, charge: 1.3 },
  // Uçaksavar: ağır ve yavaş atış; mermi hedefin yakınında patlar (flak: yakınlık, yarıçap, parça hasarı)
  flak: { rpm: 200, damage: 10, magSize: 40, reload: 4.5, burst: [3, 6], burstGap: [1.1, 1.9], pellets: 1, range: 160, sound: 'bmg50', noise: 130, tracerEvery: 1, flak: { proximity: 3.0, radius: 4.0, damage: 26, fx: 0.3 } },
  // Mevzi makinelisi: uzun seriler, ağır mermi. Oyuncuya verdiği hasarı zorluktaki dpsCap sınırlar
  hmg: { rpm: 450, damage: 15, magSize: 100, reload: 5.5, burst: [9, 18], burstGap: [0.7, 1.3], pellets: 1, range: 150, sound: 'enemyHmg', noise: 110, tracerEvery: 3 },
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
  // Ağır makineli mevzi nişancısı: silahın başında durur (mounted). Silah susarsa ya da hedef uzun süre
  // atış yayının dışında kalırsa iner ve yedek tüfekle siper kullanan bir tüfekçi gibi savaşır (dismount)
  aaGunner: {
    name: 'Uçaksavar Nişancısı', hp: 130, weapon: 'flak', walk: 1.6, run: 4.0, viewRange: 110, fov: 220,
    prefDist: [10, 26], usesCover: false, rushes: false, aimBase: 2.2, headMult: 2.4, mounted: true, fallbackWeapon: 'rifle',
    colors: { uniform: 0x4a4436, vest: 0x2a2820, helmet: 0x33302a, skin: 0x9c7456, band: 0x8e2b23 },
  },
  gunner: {
    name: 'Mevzi Makinelisi', hp: 150, weapon: 'hmg', walk: 1.6, run: 4.0, viewRange: 75, fov: 150,
    prefDist: [10, 26], usesCover: false, rushes: false, aimBase: 2.4, headMult: 2.4, mounted: true, fallbackWeapon: 'rifle',
    colors: { uniform: 0x4a4436, vest: 0x2a2820, helmet: 0x33302a, skin: 0x9c7456, band: 0x8e2b23 },
  },
};

// Ağır makineli mevzi (sehpalı silah + kum torbası halkası). Mevzi yalnızca önündeki yayı tarayabilir:
// yandan ya da arkadan dolanmak, el bombası/roket ya da bastırma ateşi altında yanaşmak karşı hamledir.
export const HMG = {
  arcDeg: 65, // silah merkez yönünden bu kadar sağa/sola döner
  turnRate: 1.1, // silahın dönüş hızı (rad/s): yana kaçan hedefe yetişmesi zaman alır
  pivotH: 1.18, // silah ekseninin yerden yüksekliği
  gunnerBack: 0.95, // nişancı silah ekseninin bu kadar arkasında durur
  gripBack: 0.62, // tutamakların eksenden geriye uzaklığı (nişancının elleri buraya)
  shield: { w: 0.9, h: 0.55, y: 0.98, ahead: 0.42 }, // kalkan plakası (taban yüksekliği y, eksenin önünde)
  suppressPerRound: 0.55, // yakından geçen her mermi bastırma süresine eklenir (s)
  suppressMax: 4.5,
  suppressNear: 2.2, // mermi başa bu kadar yakın geçerse bastırır (m)
  suppressAimDeg: 2.4, // bastırılmışken ek isabet hatası
  duckAt: 1.6, // bastırma bu süreyi aşınca kalkanın arkasına eğilir, ateş keser
  duckTime: 1.4, // eğilme süresi; sonra en az upTime boyunca kalkıp (dağınık) ateş eder: sürekli
  upTime: 2.4, //   bastırma makineliyi susturmaz, yalnızca ateş penceresini daraltır
  sweepDeg: 14, // hedefi göremezken son bilinen noktayı tarama genliği
  sweepTime: 3.5, // hedef kaybolduktan sonra bu süre taramaya devam eder
  dismountDelay: 7, // görünen hedef bu süre yay dışında ve yakında kalırsa (kuşatılma) nişancı iner
  dismountRange: 35, // uzaktaki hedef yay dışında kalsa bile nişancı yerini bırakmaz
  silenceRadius: 3.4, // patlayıcı bu yarıçapta patlarsa silah susar
  silenceDamage: 90, // susturan patlamanın en az hasarı (el bombası yeter)
  warnRange: 70, // oyuncu bu mesafedeyken ilk seri "AĞIR MAKİNELİ" uyarısı verir
  pitchMin: -0.35, // namlu eğimi sınırları (rad)
  pitchMax: 0.3,
};

// Uçaksavar topu nişancısı (düzenek arayüzü HMG ile ortak; eksik alanlar HMG'den gelmez, hepsi burada)
export const AA_GUN = {
  turnRate: 0.85, // taret dönüş hızı (rad/s): hızlı koşan oyuncuya yetişemez
  pivotH: 1.8, // namlu ekseni yüksekliği
  seatBack: 1.05, // nişancı taretin bu kadar arkasında, platformda durur
  seatY: 0.5,
  pitchMin: -0.2,
  pitchMax: 1.2,
  idlePitch: 0.7, // göğe ateş ederken namlu açısı
  duckAt: 2.4, // bastırılınca eğilir (kalkanı yok: daha geç eğilir, çabuk kalkar)
  duckTime: 1.0,
  upTime: 3.0,
  sweepDeg: 8,
  sweepTime: 2.5,
  dismountDelay: Infinity, // taret tam döndüğü için yay dışı yok: nişancı yerini bırakmaz
  dismountRange: 0,
  warnRange: 110,
  restPitch: 0.3, // çatışmada hedef görünmezken namlu açısı
  idleDrop: -0.1, // başında kimse kalmayınca namlunun indiği açı
  skyFireRange: 170, // oyuncu bu kadar yakınsa top göğe ateş eder (uzaktan yerini belli eder)
  baseH: 0.45, // platform çarpıştırıcısı: adım yüksekliğini aşmasın, üstüne çıkılabilsin
  bodyHalf: 0.85, // taret gövdesi çarpıştırıcısı (yarı genişlik, yükseklik)
  bodyH: 1.9,
  barrelX: 0.35, // namlu uçları: guns grubunda (±x, 0, -len)
  barrelLen: 3.4,
  gripX: 0.28, // kumanda kolları: taret uzayında
  gripY: 1.05,
  gripZ: 0.5,
  animPitchMin: -0.15, // nişancının gövde eğimi sınırı (namlu göğe dönükken arkaya yatmasın)
  animPitchMax: 0.2,
};

// Helikopterle tahliye (mission.js): geliş, biniş, kalkış sahnesi, sonraki bölüme otomatik geçiş
export const EXTRACT = {
  approach: 20, // helikopterin gelip konma süresi (s)
  boardRadius: 6.5,
  takeoff: 6.5, // kalkış sahnesi süresi; bitince bölüm kartı
  climb: 34, // kalkışta çıkılan yükseklik
  speed: 26, // hızlanınca ileri hız (m/s)
  accelTime: 2.5,
  seat: [0.4, 2.05, 0.7], // kamera: kabinin içi, sağ kapının önü (helikopter uzayı)
  look: [1, -0.5, 0.6], // kameranın bakış yönü: kapıdan dışarı, aşağı ve geriye (geride kalan savaş alanına)
  nextDelay: 6, // bölüm kartında sonraki bölüme geçiş geri sayımı (s)
};

// Düşman tankı (tank.js). Zırhı mermi delmez; roket 3 isabette, C4 tek başına imha eder
export const TANK = {
  hp: 1000,
  // Model ölçüleri (models.js → buildTank): gövde, taret ve top ekseni
  hullLen: 6.8,
  hullWidth: 3.4,
  turretY: 1.62,
  turretZ: 0.2,
  gunY: 0.42,
  gunZ: -1.1,
  barrelLen: 4.6,
  coaxX: 0.42,
  // Çarpıştırıcılar: gövde kutusu ve taret kutusu (yarı genişlik)
  colliderH: 1.75,
  turretHalf: 1.5,
  turretColH: 2.55,
  // Algı: uyanıkken görüş menzili; uyanmadan önce yalnız bu yakınlıktaki hedefi fark eder
  viewRange: 95,
  wakeRange: 55,
  think: 0.2,
  forgetTime: 6, // hedef gözden kaybolunca son bilinen yere bu kadar nişanlı kalır
  turnRate: 0.45, // taret dönüşü (rad/s): koşan oyuncu yandan dolanabilsin
  idleSweep: 0.5,
  pitchMin: -0.12,
  pitchMax: 0.3,
  // Ana top: hizalanınca aimTime bekler (oyuncuya kaçma payı), sonra ateş; dolum süresi
  fireAlign: 0.05,
  aimTime: 1.4,
  reload: 6.5,
  minGunRange: 7,
  shell: { rocketSpeed: 110, damage: 0, splashRadius: 5.5, splashDamage: 120, errDeg: 0.8, errPerM: 0.012 },
  muzzleFx: 0.35,
  // Eş eksenli makineli
  coaxAlign: 0.2,
  coax: { rpm: 450, damage: 8, burst: [6, 12], burstGap: [0.8, 1.4], range: 80, errDeg: 2.2 },
  // Patlama hasarı: gövde kutusuna uzaklık hitRadius'tan azsa tam; menzil patlama yarıçapının splashReach katı
  hitRadius: 1.2,
  splashReach: 0.6,
  explosiveHeavy: 200, // bu hasarın üstü ağır patlayıcı (roket 230, C4 400); altı hafif (el bombası 170)
  heavyMult: 1.5,
  lightMult: 0.2,
  c4Radius: 1.6, // C4 etkileşimi: gövdenin oyuncuya en yakın noktasından
  c4Y: 1.0,
  shotHintAfter: 6, // bu kadar mermi zırha çarpınca ipucu
  wreckBlast: { radius: 7, damage: 160 },
  score: 750,
};

// İskeletli asker (hazır model + prosedürel katmanlar). Değerler Soldier.glb klipleri ölçülerek bulundu:
// yürüyüşte yerdeki ayak 1,65 m/s, koşuda 4,2 m/s geri kayıyor → bir tam adım döngüsü 1,70 / 2,94 m.
export const SOLDIER_ANIM = {
  walkStride: 1.7, // m / döngü
  runStride: 2.94,
  runBlend: [1.9, 3.6], // bu hız aralığında yürüyüşten koşuya geçilir (m/s)
  moveBlend: [0.12, 0.7], // durmaktan yürümeye
  hipTurnMax: 70 * Math.PI / 180, // alt gövde bu kadar dönebilir; kalanını üst gövde tamamlar
  turnStep: 0.35, // yerinde dönerken bacakların attığı adım (m / rad): dönüş hızı adım hızına çevrilir
  turnStepMax: 1.1, // yerinde dönüş adımının üst sınırı (m/s)
  backwardEnter: 115 * Math.PI / 180, // hareket bakıştan bu kadar saparsa geri geri yürür
  backwardExit: 75 * Math.PI / 180,
  crouchDrop: 0.42, // çömelirken kalçanın inişi (m)
  aimSpeed: 7, // nişan duruşuna geçiş hızı
  spinePitchShare: 0.45, // nişan eğiminin gövdeye düşen payı (kalanı kollar ve silah)
  recoilKick: 0.045, // atışta silahın omuza geri tepmesi (m)
  recoilPitch: 2.5, // geri tepmede namlunun kalkması (rad / m)
  aimHeadTilt: 0.14, // nişanda baş dipçiğe eğilir (rad)
  reloadTilt: { pitch: -0.4, roll: 0.55, yaw: 0.2 }, // şarjör değişiminde silahın yatışı (rad)
  runCarry: { yaw: 0.55, pitch: 0.35, side: -0.1 }, // koşarken silah göğse çaprazlanır (rad, m)
  throwTime: 0.8, // el bombası atma hareketi (s)
  throwRelease: 0.42, // bomba bu anda elden çıkar (kol öne savrulurken)
  aimBlade: 0.4, // nişanda gövde sağa döner (rad): sol omuz öne gelir, destek eli kundağa yetişir
  // Kavrama: parmak eklemlerinin bükülmesi (rad). Sağ işaret parmağı tetikte, daha düz
  gripCurl: {
    Right: { Index: [0.45, 0.5, 0.3], Middle: [1.15, 1.3, 0.8], Ring: [1.2, 1.3, 0.8], Pinky: [1.25, 1.2, 0.8] },
    Left: { Index: [0.8, 0.9, 0.5], Middle: [0.9, 1.0, 0.6], Ring: [0.95, 1.0, 0.6], Pinky: [1.0, 1.0, 0.6] },
  },
  // Uzaktaki askerin pozu daha seyrek güncellenir ama hiçbir mesafede donmaz; kök konumu her karede
  // güncellenir (yoksa uzakta asker kayar ya da yerinde durup sonra sıçrar)
  lodNear: 20, // bu mesafeye kadar her kare (m)
  lodFar: 45,
  lodVeryFar: 90,
  lodRates: [1 / 30, 1 / 15, 1 / 8], // yakın-orta / uzak / çok uzak güncelleme aralığı (s)
  blobFrom: 38, // gölge haritasının menzili dışında askerin altına yumuşak ayak gölgesi (m)
  blobOpacity: 0.42,
  envIntensity: 0.45, // ortam yansıması: gölgede ve uzakta asker simsiyah bir siluete dönmesin
  // Silah duruşları (omuz eklemine göre, gövde uzayında): stok konumu ve silah açıları
  stances: {
    aim: { stock: [-0.09, -0.03, 0.0], pitch: 0, yaw: 0.02, roll: 0 },
    ready: { stock: [-0.07, -0.13, -0.02], pitch: -0.62, yaw: 0.42, roll: 0.25 },
    relaxed: { stock: [-0.06, -0.19, -0.04], pitch: -0.95, yaw: 0.62, roll: 0.35 },
  },
};

// Düşman türlerine göre görünüm: dokuyu renkle çarparak birlik farkı, ağır makineli daha iri
export const SOLDIER_LOOKS = {
  rifleman: { tint: 0xffffff, visor: 0x1a1d20 },
  shotgunner: { tint: 0xa9b38c, visor: 0x14181a },
  heavy: { tint: 0x6d7073, visor: 0x3a0d08 },
  sniper: { tint: 0xe2d2ae, visor: 0x1a2a2a },
  dummy: { tint: 0xff9a4d, visor: 0x222222 },
  // Dost manga: belirgin mavi. Doku ten rengi olduğundan çarpan 1'in üstüne çıkar (mavi kanal güçlendirilir),
  // hafif mavi ışıma gölgede de rengi korur
  ally: { tint: [0.5, 0.85, 1.95], visor: 0x0c2a55, glow: 0x0a1c3c },
  // Komando kademesi: koyu lacivert, parlak vizör (seçkin birlik)
  allyElite: { tint: [0.34, 0.5, 1.45], visor: 0x2a6adf, glow: 0x081436 },
  gunner: { tint: 0x9a927e, visor: 0x2a1208 },
  aaGunner: { tint: 0x9a927e, visor: 0x2a1208 },
};

// Dost asker (oyuncunun mangası). Kalıcı ölmez: yaralanınca bir süre yerde kalıp toparlanır,
// böylece seviye dengesi "dostlar öldü, seviye imkânsızlaştı" durumuna düşmez.
// Can, yaralı kalma süresi, tepki, isabet, hasar ve seri arası kademeye göre değişir: ALLY_TIERS
export const ALLY = {
  names: ['Kartal-2', 'Kartal-3', 'Kartal-4'],
  regenDelay: 6, // hasar almadan bu kadar süre geçince can dolmaya başlar (s)
  regenRate: 18, // can / s
  reviveHp: 0.55, // toparlanınca canın oranı
  damageTaken: 0.6, // düşman mermisinin dosta etkisi (oyuncuya göre)
  walk: 2.2,
  run: 4.6,
  viewRange: 60,
  thinkInterval: 0.15,
  loseTargetTime: 2.5,
  zones: { head: 2.2, torso: 1, limb: 0.75 },
  rpm: 560,
  burst: [3, 5],
  magSize: 30,
  reload: 2.5,
  range: 120,
  noise: 55, // silah sesi duyulma yarıçapı (m)
  fireFollow: 4, // oyuncu ateş ettikten sonra bu süre manga da serbestçe ateş eder (s)
  // Oyuncuya göre düzen yerleri: [sağa (m), geriye (m)]
  slots: [[-2.4, 2.4], [2.6, 2.8], [-0.4, 4.6]],
  teleportDist: 45, // oyuncudan bu kadar geride kalan dost, görünmeden yanına alınır
  stuckCheck: 0.8, // takılma denetimi aralığı (s)
  stuckMove: 0.3, // bu sürede bundan az ilerleyen dost takılmış sayılır (m)
  fireLaneDeg: 12, // oyuncunun nişan hattındaki dost kenara çekilir
  stealth: 0.6, // düşmanın dostu fark etme hızı çarpanı: manga oyuncunun arkasında, dikkat çekmemeye çalışır
  colors: { uniform: 0x3d5a8a, vest: 0x243650, helmet: 0x2f4b78, skin: 0xa77b5b, band: 0x4aa3ff },
  // Kademe taktiklerinin ayarları (hangi taktiğin açık olduğu ALLY_TIERS'ta)
  peek: { hide: [0.9, 1.6], show: [1.4, 2.4] }, // siperde saklanma / ateş için çıkma süreleri
  callout: { cooldown: 9, markTime: 4 }, // düşman bildirme: telsiz + HUD işareti süresi
  suppress: { range: 90, burst: [6, 10], gap: [0.35, 0.6], aimDeg: 3.5 }, // mevziye bastırma ateşi
  revive: { range: 28, time: 2.4 }, // yerdeki dosta koşup ayıltma
  // el bombası: clusterRadius içinde en az "cluster" düşman, bir mevzi ya da hiddenRange içinde siperde saklanan hedef
  grenade: { cooldown: 16, range: [9, 28], safe: 8, cluster: 2, clusterRadius: 6, hiddenRange: 20 },
  bound: { step: [7, 11], cover: 1.4 }, // sıçramalı ilerleme: ileri atılma mesafesi, örtme süresi
  flank: { dist: 11, time: 18 }, // mevzinin yanına dolanma: yan mesafe, en uzun süre
};

// Manga kademeleri: seviye ilerledikçe dostlar profesyonelleşir (LEVELS → allyTier).
// reaction: hedefi görünce ilk atışa kadar (s), aimDeg: temel isabet hatası (derece), downTime: yaralı
// kalma süresi (s); tactics açık taktiklerdir (ally.js)
export const ALLY_TIERS = {
  1: { rank: 'Er', short: 'Er', aimDeg: 2.2, reaction: 0.45, damage: 17, hp: 140, downTime: 12, burstGap: [0.45, 0.9], tactics: [] },
  2: { rank: 'Onbaşı', short: 'Onb.', aimDeg: 1.8, reaction: 0.36, damage: 19, hp: 155, downTime: 10, burstGap: [0.4, 0.8], tactics: ['peek', 'callout'] },
  3: { rank: 'Çavuş', short: 'Çvş.', aimDeg: 1.45, reaction: 0.3, damage: 20, hp: 170, downTime: 9, burstGap: [0.35, 0.7], tactics: ['peek', 'callout', 'suppress', 'revive'] },
  4: { rank: 'Uzman Çavuş', short: 'Uzm.', aimDeg: 1.15, reaction: 0.24, damage: 22, hp: 185, downTime: 7.5, burstGap: [0.3, 0.6], tactics: ['peek', 'callout', 'suppress', 'revive', 'grenade', 'bound'] },
  5: { rank: 'Komando', short: 'Kom.', aimDeg: 0.9, reaction: 0.18, damage: 24, hp: 200, downTime: 6, burstGap: [0.25, 0.5], tactics: ['peek', 'callout', 'suppress', 'revive', 'grenade', 'bound', 'flank'], elite: true },
};
export const TACTIC_LABELS = {
  peek: 'siperden eğilip ateş', callout: 'düşman bildirme', suppress: 'bastırma ateşi', revive: 'yaralıyı ayıltma',
  grenade: 'el bombası', bound: 'sıçramalı ilerleme', flank: 'mevziyi kanattan vurma',
};

// Harita ortamları. Işık SAYISI sabit (hemi + güneş/ay); yalnızca renk ve şiddet değişir, shader yeniden
// derlenmez. sky: gökyüzü gölgelendiricisi (glow: güneş halesi, disc: güneş/ay diski, band: ufuk bandı,
// stars: gece yıldızları), fog: [yakın, uzak] (renk ufuktan), view: silah görünümü sahnesinin ışıkları,
// reflect: silah metalleri için yansıma gökyüzü, perception: gece/kar görüşü (düşman algısı çarpanı)
export const MAPS = {
  kizilkum: {
    name: 'Kızılkum Vadisi', desc: 'Çöl vadisi, şafak',
    env: {
      sky: { zenith: 0x3d6a9a, horizon: 0xd8a987, ground: 0xb89878, glow: [1.0, 0.62, 0.32], disc: [1.0, 0.85, 0.6], band: [0.35, 0.16, 0.06], stars: 0 },
      fog: [70, 460], sunDir: [0.82, 0.3, -0.22], sun: [0xffcf9c, 2.9], hemi: [0xb4c8e0, 0x8a6f4d, 1.15], exposure: 1.05,
      reflect: [0x4a78a8, 0xe0b595, 0x9a7a58], view: [0xd6e0ec, 0x7a6650, 1.5, 0xffd9b0, 2.2],
      dust: 0xcbb08a, ambient: { wind: 420, gain: 0.16, distant: 1 }, perception: 1, weather: null,
    },
  },
  harbor: {
    name: 'Liman', desc: 'Konteyner limanı, gün batımı',
    env: {
      sky: { zenith: 0x34457a, horizon: 0xf0925a, ground: 0x5a4a4c, glow: [1.0, 0.45, 0.18], disc: [1.0, 0.7, 0.4], band: [0.5, 0.18, 0.05], stars: 0 },
      fog: [60, 420], sunDir: [-0.93, 0.13, 0.34], sun: [0xff9a5c, 2.7], hemi: [0x8a92c0, 0x6a4a3a, 1.05], exposure: 1.0,
      reflect: [0x3e5088, 0xf0a070, 0x5a4a4c], view: [0xb8bde0, 0x6a4a3a, 1.35, 0xffb080, 2.1],
      dust: 0xa89078, ambient: { wind: 300, gain: 0.2, distant: 0.7, sea: true }, perception: 1, weather: null,
    },
  },
  ruins: {
    name: 'Yıkık Şehir', desc: 'Savaşta yıkılmış şehir, kapalı hava',
    env: {
      sky: { zenith: 0x5d6975, horizon: 0xa9aeb0, ground: 0x6a6a68, glow: [0.25, 0.25, 0.25], disc: [0.3, 0.3, 0.3], band: [0.04, 0.04, 0.05], stars: 0 },
      fog: [35, 290], sunDir: [0.35, 0.7, 0.45], sun: [0xe6ebf0, 1.55], hemi: [0xc2cad4, 0x5c5854, 1.55], exposure: 1.02,
      reflect: [0x6a7682, 0xa9aeb0, 0x5a5a58], view: [0xc8d0d8, 0x5c5854, 1.6, 0xe6ebf0, 1.4],
      dust: 0x8f8a82, ambient: { wind: 360, gain: 0.18, distant: 1.4 }, perception: 0.95, weather: 'ash',
    },
  },
  pass: {
    name: 'Karlı Dağ Geçidi', desc: 'Karlı sıradağlar, kar yağışı',
    env: {
      sky: { zenith: 0x4f78a6, horizon: 0xd2dde8, ground: 0xe4ebf0, glow: [0.6, 0.55, 0.45], disc: [1.0, 0.95, 0.85], band: [0.08, 0.08, 0.1], stars: 0 },
      fog: [45, 360], sunDir: [0.5, 0.42, 0.62], sun: [0xfff0dc, 2.3], hemi: [0xcfe0f2, 0x8894a0, 1.3], exposure: 0.92,
      reflect: [0x5a82b0, 0xd8e2ec, 0xe8eef2], view: [0xdbe6f2, 0x8894a0, 1.5, 0xfff0dc, 2.0],
      dust: 0xe8eef2, ambient: { wind: 620, gain: 0.26, distant: 0.6 }, perception: 0.9, weather: 'snow',
    },
  },
  refinery: {
    name: 'Gece Rafinerisi', desc: 'Petrol rafinerisi, gece',
    env: {
      sky: { zenith: 0x040814, horizon: 0x1c2640, ground: 0x07070a, glow: [0.18, 0.22, 0.35], disc: [0.85, 0.9, 1.0], band: [0.12, 0.06, 0.02], stars: 1 },
      fog: [28, 250], sunDir: [-0.42, 0.55, -0.62], sun: [0xa8bcff, 0.85], hemi: [0x4a5e9a, 0x2a2018, 0.95], exposure: 1.5,
      reflect: [0x0a1224, 0x2a3450, 0x0a0a0c], view: [0x6a7aa8, 0x2a2018, 0.9, 0xb0c0ff, 0.6],
      dust: 0x6a6a70, ambient: { wind: 260, gain: 0.12, distant: 0.8, hum: true }, perception: 0.85, weather: null,
    },
  },
};

// Seviyeler (kolaydan zora). İlk iki seviye Kızılkum'un bölümleri; sonrakiler başka haritalarda, her biri
// tek bir operasyon. tuning: seçilen zorluğun (Acemi/Asker/Gazi) üstüne uygulanan çarpanlar.
//   reaction ↑ = düşman geç tepki verir, aim ↑ = daha çok ıskalar, damage = mermi hasarı,
//   perception/awareness = görme mesafesi ve fark etme hızı, attackers = aynı anda ateş eden sayısına ek
// enemies: hangi gruplar doğar; exclude: bu türler doğmaz; hardTypes: işaretli tüfekçiler keskin nişancı olur;
//   hmg: haritanın mevzi listesinden kaç ağır makineli mevzi kurulur. allyTier: manganın kademesi (ALLY_TIERS)
export const LEVELS = [
  {
    id: 1, map: 'kizilkum', name: 'Kontrol Noktası', tag: 'Kolay',
    brief: 'Kuzeydeki kontrol noktasını mangayla birlikte temizle. Yavaş tepki veren, az isabet ettiren muhafızlar.',
    start: 0, objectives: ['outpost', 'extract'], allies: 3, allyTier: 1,
    radioIntro: 'Kızılkum Vadisi\'ne hoş geldiniz. Kartal-1, mangan arkanda: üç tüfekçi.',
    outro: 'Herkes içeride. Güzel iş Kartal ekibi, sizi köyün kuzeyine bırakıyoruz.',
    enemies: { groups: ['outpost'], exclude: ['shotgunner'], hmg: 0 },
    tuning: { reaction: 1.45, aim: 1.55, damage: 0.6, perception: 0.85, awareness: 0.75, attackers: -1, grenades: false },
  },
  {
    id: 2, map: 'kizilkum', name: 'Uçaksavarlar', tag: 'Kolay-orta',
    brief: 'Köydeki iki uçaksavar topunu C4 ile imha et. Pompalılar hücum eder, çatıda nöbetçi var.',
    start: 1, objectives: ['aa', 'extract'], allies: 3, allyTier: 2,
    radioIntro: 'Kontrol noktası bizde. Sıradaki iş köyde.',
    outro: 'Gökyüzü bizim! Kartal ekibi, sizi doğruca limana götürüyoruz.',
    enemies: { groups: ['village'], exclude: ['heavy'], hmg: 0 },
    tuning: { reaction: 1.2, aim: 1.25, damage: 0.8, perception: 0.95, awareness: 0.9, attackers: 0, grenades: false },
  },
  {
    id: 3, map: 'harbor', name: 'Liman', tag: 'Orta',
    brief: 'Gün batarken limana sız: giriş kapısını temizle, rıhtımdaki iki uçaksavarı patlat, helikopter gelene kadar pisti tut. İki makineli yuvası var.',
    start: 0, objectives: ['outpost', 'aa', 'lz', 'defend', 'board'], allies: 3, allyTier: 3,
    radioIntro: 'Liman sektöründesiniz. Kapıdaki makineli yuvası yolu tutuyor; mangan bastırırken yanından dolan.',
    outro: 'Tahliye tamam. Liman bizim.',
    enemies: { groups: ['outpost', 'village'], exclude: [], hmg: 2 },
    defendTime: 75,
    tuning: { reaction: 1.05, aim: 1.08, damage: 0.92, perception: 1.0, awareness: 1.0, attackers: 0, grenades: true },
  },
  {
    id: 4, map: 'ruins', name: 'Yıkık Şehir', tag: 'Orta-zor',
    brief: 'Moloz kaplı meydanı temizle, eski belediye binasından istihbaratı al, takviyeyi yarıp stadyumdaki piste ulaş. Üç makineli yuvası.',
    start: 0, objectives: ['outpost', 'intel', 'lz', 'defend', 'board'], allies: 3, allyTier: 3,
    radioIntro: 'Şehir merkezine giriyorsunuz. Yıkıntılar siper dolu ama pencerelerde makineli var.',
    outro: 'Tahliye tamam. İstihbarat komutanlığa ulaştı.',
    enemies: { groups: ['outpost', 'hq'], exclude: [], reinforcements: true, hmg: 3, tanks: 1 },
    defendTime: 90,
    tuning: { reaction: 0.95, aim: 0.98, damage: 1.0, perception: 1.03, awareness: 1.08, attackers: 0, grenades: true },
  },
  {
    id: 5, map: 'pass', name: 'Karlı Geçit', tag: 'Zor',
    brief: 'Kar fırtınasında dağ geçidini aç: karakolu al, iki uçaksavarı patlat, sığınaktaki haritaları çal ve tahliyeyi bekle. Dört makineli yuvası.',
    start: 0, objectives: ['outpost', 'aa', 'intel', 'lz', 'defend', 'board'], allies: 3, allyTier: 4,
    radioIntro: 'Geçitte görüş kısa, kar sesleri yutuyor. Sığınakların mazgallarında ağır makineliler var.',
    outro: 'Tahliye tamam. Geçit açıldı.',
    enemies: { groups: ['outpost', 'village', 'hq'], exclude: [], reinforcements: true, hmg: 4, tanks: 2 },
    defendTime: 100,
    tuning: { reaction: 0.88, aim: 0.9, damage: 1.08, perception: 1.06, awareness: 1.15, attackers: 1, grenades: true },
  },
  {
    id: 6, map: 'refinery', name: 'Demir Şafak', tag: 'Çok zor',
    brief: 'Gece rafinerisine baskın: kapıyı düşür, üç yakıt pompasını patlat, kontrol odasından kodları al, şafak sökene dek pisti tut. Beş makineli yuvası.',
    start: 0, objectives: ['outpost', 'aa', 'intel', 'lz', 'defend', 'board'], allies: 3, allyTier: 5,
    radioIntro: 'Demir Şafak başladı. Karanlık seni gizler ama onları da. Komando mangan hazır.',
    outro: 'Tahliye tamam. Demir Şafak operasyonu başarıyla tamamlandı.',
    enemies: { groups: ['outpost', 'village', 'hq'], exclude: [], hardTypes: true, reinforcements: true, extraWave: true, hmg: 5, tanks: 2 },
    defendTime: 115,
    tuning: { reaction: 0.82, aim: 0.85, damage: 1.15, perception: 1.0, awareness: 1.2, attackers: 1, grenades: true },
  },
];

// Vuruş kutuları (kemiğe bağlı, görünmez; bağlanma pozunda ölçüldü). Gövde/kafa kutuları kemik boyunca
// "along" metre ileride ve "size" boyutunda; uzuv kutuları iki eklem arasını "width" kalınlıkta kaplar.
export const SOLDIER_HITBOXES = [
  { bone: 'Head', size: [0.25, 0.28, 0.29], along: 0.13, zone: 'head' },
  { bone: 'Neck', size: [0.13, 0.08, 0.13], along: 0.02, zone: 'head' },
  { bone: 'Spine2', size: [0.46, 0.22, 0.3], along: 0.09, zone: 'torso' },
  { bone: 'Spine1', size: [0.38, 0.13, 0.27], along: 0.06, zone: 'torso' },
  { bone: 'Spine', size: [0.36, 0.13, 0.26], along: 0.06, zone: 'torso' },
  { bone: 'Hips', size: [0.38, 0.2, 0.27], along: 0.02, zone: 'torso' },
  { bone: 'LeftArm', to: 'LeftForeArm', width: 0.14, zone: 'limb' },
  { bone: 'RightArm', to: 'RightForeArm', width: 0.14, zone: 'limb' },
  { bone: 'LeftForeArm', to: 'LeftHand', width: 0.12, zone: 'limb' },
  { bone: 'RightForeArm', to: 'RightHand', width: 0.12, zone: 'limb' },
  { bone: 'LeftUpLeg', to: 'LeftLeg', width: 0.2, zone: 'limb' },
  { bone: 'RightUpLeg', to: 'RightLeg', width: 0.2, zone: 'limb' },
  { bone: 'LeftLeg', to: 'LeftFoot', width: 0.16, zone: 'limb' },
  { bone: 'RightLeg', to: 'RightFoot', width: 0.16, zone: 'limb' },
];

// Görüntü çözünürlüğü: eller ve silah her zaman tam ekran çözünürlüğünde (keskin) çizilir; dünya kaliteye
// göre ölçekli bir hedefe çizilip ekrana büyütülür. Telefonda dünyayı küçük çizmek akıcılığı korur,
// en çok göze giren eller ve silah ise piksellenmez.
export const RENDER = {
  maxPixelRatio: 2, // tuvalin (eller + silah) en yüksek piksel oranı
  worldPixelRatio: { high: 2, medium: 1.5, low: 1 }, // dünyanın en yüksek piksel oranı (masaüstü)
  touchWorldPixelRatio: { high: 1.5, medium: 1.15, low: 0.85 }, // dokunmatik cihazlarda
  msaa: { high: 4, medium: 4, low: 2 }, // dünya hedefinin kenar yumuşatma örnek sayısı
  anisotropy: { high: 16, medium: 8, low: 4 }, // doku süzme üst sınırı (cihazın izin verdiğiyle sınırlı)
};

// Teçhizat ekranındaki silah görselleri (Operasyon Güncellemesi §5.4): oyunun kendi modelinden stüdyo
// çizimi (kart simgesi) ve sağ paneldeki dönen, sürüklenebilen önizleme
export const WEAPON_VIEW = {
  icon: { width: 512, height: 256, supersample: 2 }, // simge boyutu; iki kat büyük çizilip küçültülür (kenar yumuşatma)
  yawDeg: 14, // namlu sağa bakarken kameranın hafif önden açısı (perspektif)
  pitchDeg: 7,
  fov: 24, // dar görüş açısı: uzun namlu bozulmadan sığar
  fill: 0.9, // simgede modelin kapladığı en büyük oran
  exposure: 1.1,
  envIntensity: 0.65, // stüdyo ortam yansıması (metal yüzeyler okunur olsun)
  previewSpin: 0.45, // önizlemenin kendi dönüş hızı (rad/sn)
  previewResume: 1.6, // sürükleme bitince kendiliğinden dönmeye başlamadan önce bekleme (sn)
  dragSens: 0.012, // sürüklemede piksel başına dönüş (rad)
  maxPitchDeg: 30,
  previewMaxPx: 900, // önizleme çizim tamponunun uzun kenarı en fazla
};

// Yüklenebilir uygulama (PWA, dist/pwa): hizmet çalışanı ve menüdeki yükleme/güncelleme satırı
export const PWA = {
  swUrl: 'sw.js', // sayfaya göre; kapsamı bulunduğu klasör
  updateCheckMin: 30, // uygulama açık dururken yeni sürüm denetimi en sık bu kadar dakikada bir
};

// Zorluk ayarları (DA_Difficulty karşılığı).
export const DIFFICULTY = {
  easy: {
    label: 'Acemi', desc: 'Düşmanlar yavaş fark eder, az isabet ettirir.',
    reaction: 0.95, aimMult: 1.7, damageMult: 0.55, perception: 0.8, awarenessRate: 0.65,
    maxAttackers: 1, grenades: false, regenDelay: 5, dpsCap: 32,
  },
  normal: {
    label: 'Asker', desc: 'Dengeli çatışma. İlk oynayış için önerilir.',
    reaction: 0.62, aimMult: 1.0, damageMult: 1.0, perception: 1.0, awarenessRate: 1.0,
    maxAttackers: 2, grenades: true, regenDelay: 6, dpsCap: 40,
  },
  hard: {
    label: 'Gazi', desc: 'Hızlı tepki, sert isabet, bol el bombası.',
    reaction: 0.38, aimMult: 0.72, damageMult: 1.45, perception: 1.15, awarenessRate: 1.45,
    maxAttackers: 3, grenades: true, regenDelay: 7, dpsCap: 75,
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
  snow: { impact: 'dust', color: 0xeef2f6, step: 'sand' },
  concrete: { impact: 'dust', color: 0x9a978f, step: 'concrete' },
  metal: { impact: 'sparks', color: 0x6d7275, step: 'metal' },
  wood: { impact: 'splinter', color: 0x8b6a45, step: 'wood' },
  sandbag: { impact: 'dust', color: 0xa89470, step: 'sand' },
  flesh: { impact: 'blood', color: 0x7a1010, step: 'sand' },
  rock: { impact: 'dust', color: 0x8a7a66, step: 'concrete' },
};
