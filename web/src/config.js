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

// Çevrim içi (çok oyunculu S2–S3). serverUrl boşsa çevrim içi kapalı ("Sunucu henüz kurulmadı"); VPS kurulunca
// buraya adres yazılıp derlenir (Docs/DEPLOY.md). Geliştirmede ?server=http://localhost:8790 ya da Ayarlar.
// Mağaza uygulaması (Capacitor, dist/app) ve yasal sayfalar (Docs/STORE_RELEASE.md)
export const APP = {
  // Mağaza kaydına da yazılan gizlilik politikası (src/pwa/privacy.html → Pages)
  privacyUrl: 'https://ilerisoyomer34-coder.github.io/call-of-duty/privacy.html',
  backExitSec: 2, // Android geri tuşu: ana menüde bu süre içinde ikinci basış uygulamadan çıkar
  confirmSec: 4, // "Hesabı sil" gibi iki basışlı onayların bekleme süresi
};

export const NET = {
  serverUrl: '',
  // Davet bağlantısı bu adrese ?sunucu= ekler (arkadaşlar oyunu Pages'ten açar; ev sunucusu server/host.mjs)
  gameUrl: 'https://ilerisoyomer34-coder.github.io/call-of-duty/',
  infoRefreshSec: 15, // Çevrim içi ekranı açıkken bağlı sunucunun oyuncu sayısı bu aralıkla yenilenir
  reconnectSec: [1, 2, 4, 8, 16, 30], // bağlantı koparsa yeniden deneme aralıkları
  pingSec: 25, // bağlantı canlı kalsın (vekiller boştaki bağlantıyı keser)
  searchMin: 2,
  searchDebounceMs: 300,
  toastSec: 12, // bildirim kartı ekranda kalma süresi (yanıt düğmeli kartlar daha uzun)
  toastActionSec: 30,
  toastMax: 3,
};

// Yapay zekâlı telsiz (radioChat.js → aiRadio.js; metinler data/aiRadio.tr.json, sunucu server/ai.js). İki yol:
// claude.ai Artifact'ında 'sample' (izleyicinin kendi Claude hesabı), başka yerde yapay zekâsı açık sunucu.
export const AI_RADIO = {
  // Tanınan kısa komut yerelde anında çalışır; bundan uzun cümle ya da soru yapay zekâya gider
  localMaxWords: 9,
  historyTurns: 6, // sohbet belleği: son N soru-cevap (görev başında sıfırlanır)
  maxReply: 280, // cevap metni üst sınırı (karakter)
  maxActions: 8, // sıralı emir üst sınırı (commands.js planı)
  maxDistance: 200, // yapay zekânın verdiği mesafe (m) bu aralığa kırpılır
  contextEnemies: 6, // bağlama giren en yakın düşman sayısı
  contextRange: 140, // bu mesafeden uzak düşman yalnız sayılır
  timeoutMs: 25000, // sunucu yolu: bu sürede cevap gelmezse yerel telsize düşülür
  modelTier: 'quick', // Artifact yolu: en hızlı model ailesi (telsiz kısa ve anlık olmalı)
  peekSec: 8, // telsiz paneli kapalıyken yapay zekâ cevabı bu kadar sn önizlenir
};

// Çevrim içi maç (S4–S6). Sunucu (server/game/) ve istemci (src/net/) aynı değerleri okur.
export const ONLINE = {
  hp: 100,
  regenDelay: 5, // sn: hasar almadan sonra can dolmaya başlar
  regenRate: 25, // can / sn
  protectSec: 2, // doğuş koruması (ateş edince biter)
  maxRewindMs: 200, // gecikme telafisinin üst sınırı (daha eski görüntüye ateş edilemez)
  historyTicks: 40, // vuruş kutusu geçmişi (tick)
  creditMax: 8, // komut bütçesi: gecikip biriken komutlar en çok bu kadar tick öne geçebilir
  queueMax: 24, // sunucudaki bekleyen komut sınırı (fazlası atılır)
  snapshotEvery: 2, // anlık görüntü her 2 tick'te (32 Hz)
  // Silah doğrulaması (istemci atış zamanını kendi belirler, sunucu sınırlar): tolerans payları
  fireTolerance: 0.7, // atış kredisi bu kadarsa atış kabul
  reloadTolerance: 0.75,
  switchTolerance: 0.6,
  melee: { damage: 100, range: 2.2, coneDeg: 40, cooldown: 0.6 },
  defaultPrimary: 'rifle',
  defaultSecondary: 'pistol',
  // İstemci: uzak oyuncuların aralanması ve tahmin düzeltmesi
  interpMs: 100, // görüntü tamponu (titreşime göre 60–250 ms arası uyarlanır)
  interpMinMs: 60,
  interpMaxMs: 250,
  extrapolateMs: 120,
  reconcileEps: 0.002, // m: tahmin ile sunucu arası bu kadarsa düzeltme yok
  correctionHalfLife: 0.06, // sn: düzeltmenin görüntüde yumuşatılması
  dilation: { low: 1, high: 4, fast: 1.03, slow: 0.97 }, // sunucu komut tamponu derinliğine göre tick hızı
  graphPingSec: 3, // net_graph 2 grafiği
  inputRedundancy: 3, // her pakette son 3 komut
  reconnectSec: [1, 2, 4, 8],
  endScreenSec: 10,
};

// Hazır ağaç modeli (Sketchfab çamı; kit.js pine/palm → World.addTree, tüm ağaçlar InstancedMesh)
// Rüzgâr (models.js → addWind): salınım hızı ve genliği (yüksekliğin oranı); çimen öbekleri (world.js →
// scatterGrass): harita ortamındaki "grass" satırı sıklığı (100 m² başına) ve rengi verir; kaliteye göre sıklık çarpanı
export const WIND = { speed: 1.25, treeFoliage: 0.022, treeTrunk: 0.006, grass: 0.16 };
export const GRASS = { cell: 32, density: { low: 0, medium: 0.55, high: 1 }, height: [0.35, 0.75], width: [0.45, 0.85] };

export const TREES = {
  alphaTest: 0.2, // yaprak kartlarının saydamlık kesme eşiği (modelin kendi MASK eşiği ≈ 0,21; yüksek değer tacı seyreltir)
  scaleJitter: 0.12, // aynı boydaki ağaçlar birbirinin kopyası görünmesin: ± oran
  snowTint: [0.86, 0.93, 1.05], // karlı haritada yaprak rengi çarpanı (soğuk, kırağılı)
};

// Sabit adımlı oyuncu simülasyonu (çok oyunculu M1; tick hızı shared/constants.js → TICK_RATE)
export const SIM = {
  maxTicksPerFrame: 10, // tek karede en çok bu kadar tick (uzun karede tick yağmuru olmasın; fazlası atılır)
  renderSnapDist: 2, // iki tick arası bundan uzunsa ışınlanma sayılır, kamera aralanmaz (m)
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
    reloadAnim: 'ak', // şarjör öne devrilerek çıkar ve takılır (viewmodel.js → RELOAD_STYLES)
    reloadTactical: 1.45,
    reloadEmpty: 1.8,
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
    shell: 'shotgun', // elde görünen fişek; yükleme penceresi alıcının altında, fişek tüpe öne doğru itilir
    loadPort: [0, -0.008, -0.1],
    loadRoll: -0.55,
    reloadStart: 0.3,
    reloadPerShell: 0.36,
    reloadEnd: 0.32,
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
    reloadTactical: 1,
    reloadEmpty: 1.3,
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
    reloadTactical: 1.5,
    reloadEmpty: 1.9,
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
    reloadAnim: 'lmg',
    reloadTactical: 3.2,
    reloadEmpty: 3.8,
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
    ads: { fovMult: 0.52, time: 0.38, moveMult: 0.55, sensMult: 0.68, vmFov: 40 }, // taktik dürbün (ACOG) ~3×
    mobility: 0.86,
    equipTime: 0.8,
    unequipTime: 0.5,
    hip: { pos: [0.16, -0.2, -0.36] },
    adsDist: 0.2,
    sound: 'lmg',
    noise: 80,
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
    reloadAnim: 'sniper',
    reloadTactical: 2.3,
    reloadEmpty: 2.8,
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
    reloadTactical: 1.2,
    reloadEmpty: 1.5,
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
    reloadAnim: 'smg', // boşta kurma koluna vurulur
    reloadTactical: 1.3,
    reloadEmpty: 1.6,
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
  // Bazuka (Sketchfab "Bazooka M20", CC BY 4.0): roket tüpün arkasından yüklenir; kimlik eski roketatarın
  // ('rpg') kimliği kalır: kayıtlar, harita roket noktaları ve çevrim içi silah sırası değişmesin
  rpg: {
    id: 'rpg',
    name: 'BZ-20 Yıldırım',
    kind: 'Bazuka',
    category: 'secondary',
    model: 'glb',
    asset: 'bazooka',
    source: 'sketchfab',
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
    reloadTactical: 2.1,
    reloadEmpty: 2.1,
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
    reloadTactical: 1.55,
    reloadEmpty: 1.95,
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
    reloadTactical: 1.4,
    reloadEmpty: 1.75,
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
    reloadTactical: 1.45,
    reloadEmpty: 1.8,
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
    reloadTactical: 1.7,
    reloadEmpty: 2.15,
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
  // Kolimatörlü 5,45'lik taarruz tüfeği: orta tempo, yüksek hasar, sola–sağa kayan dikey tepme
  ak74: {
    id: 'ak74',
    name: 'AK-74 Poyraz',
    kind: 'Taarruz Tüfeği',
    category: 'primary',
    model: 'glb',
    source: 'sketchfab',
    fireModes: ['auto', 'semi'],
    rpm: 650,
    pellets: 1,
    range: 280,
    damage: 30,
    falloff: { start: 36, end: 85, min: 0.7 },
    zones: { head: 2.4, torso: 1.0, limb: 0.8 },
    magSize: 30,
    reserveMax: 240,
    reserveStart: 150,
    reloadType: 'mag',
    reloadAnim: 'ak',
    reloadTactical: 1.6,
    reloadEmpty: 2,
    ammoInsertAt: 0.6,
    chamber: true,
    spread: { hip: 2.8, perShot: 0.3, max: 6, recovery: 9, adsMult: 0.08, crouchMult: 0.8, moveMult: 1.7, airMult: 3.0 },
    recoil: {
      pattern: [
        [0.0, 0.9], [-0.1, 0.86], [-0.2, 0.8], [-0.28, 0.74], [-0.18, 0.7], [0.05, 0.66],
        [0.22, 0.62], [0.32, 0.58], [0.2, 0.55], [-0.12, 0.52], [-0.3, 0.5], [-0.2, 0.48],
      ],
      random: 0.17,
      adsMult: 0.68,
      recoveryDelay: 0.09,
      recovery: 9,
      kick: 0.92,
      kickRot: 1.0,
      shake: 0.12,
    },
    ads: { fovMult: 0.72, time: 0.22, moveMult: 0.7, sensMult: 0.8, vmFov: 36 },
    mobility: 0.97,
    equipTime: 0.48,
    unequipTime: 0.3,
    hip: { pos: [0.15, -0.165, -0.34] },
    adsDist: 0.2,
    sound: 'ak74',
    noise: 72,
    tracerEvery: 2,
    flashSize: 0.14,
  },
  // Kısa namlulu taarruz tüfeği: en hızlı tempo ve nişan, iki mermilik seri atış, demir nişangâh
  bren2: {
    id: 'bren2',
    name: 'BR-2 Şimşek',
    kind: 'Taarruz Tüfeği',
    category: 'primary',
    model: 'glb',
    source: 'sketchfab',
    fireModes: ['auto', 'burst', 'semi'],
    rpm: 850,
    burstCount: 2,
    burstRpm: 1000,
    burstDelay: 0.18,
    pellets: 1,
    range: 230,
    damage: 25,
    falloff: { start: 28, end: 65, min: 0.65 },
    zones: { head: 2.3, torso: 1.0, limb: 0.8 },
    magSize: 30,
    reserveMax: 240,
    reserveStart: 150,
    reloadType: 'mag',
    reloadTactical: 1.4,
    reloadEmpty: 1.75,
    ammoInsertAt: 0.6,
    chamber: true,
    spread: { hip: 2.4, perShot: 0.28, max: 5.5, recovery: 11, adsMult: 0.1, crouchMult: 0.8, moveMult: 1.5, airMult: 2.8 },
    recoil: {
      pattern: [
        [0.0, 0.7], [0.14, 0.66], [-0.16, 0.62], [0.2, 0.58], [-0.2, 0.55], [0.18, 0.52],
        [-0.18, 0.5], [0.22, 0.48], [-0.22, 0.46], [0.18, 0.45], [-0.18, 0.44], [0.2, 0.43],
      ],
      random: 0.2,
      adsMult: 0.7,
      recoveryDelay: 0.07,
      recovery: 11,
      kick: 0.78,
      kickRot: 0.88,
      shake: 0.09,
    },
    ads: { fovMult: 0.8, time: 0.17, moveMult: 0.76, sensMult: 0.84, vmFov: 40 },
    mobility: 1.03,
    equipTime: 0.4,
    unequipTime: 0.26,
    hip: { pos: [0.15, -0.16, -0.33] },
    adsDist: 0.2,
    sound: 'bren',
    noise: 66,
    tracerEvery: 2,
    flashSize: 0.12,
  },
  // Sürgü mekanizmalı keskin nişancı (.338): tek atışta öldürür; her atıştan sonra sürgü çekilir ve
  // dürbünden çıkılır (bolt.unscope), basılı tutulan nişan sürgü bitince geri gelir
  awm: {
    id: 'awm',
    name: 'NT-33 Şahin',
    kind: 'Keskin Nişancı',
    category: 'primary',
    model: 'glb',
    source: 'sketchfab',
    fireModes: ['semi'],
    rpm: 48,
    pellets: 1,
    range: 520,
    damage: 165,
    falloff: { start: 120, end: 320, min: 0.85 },
    zones: { head: 3.0, torso: 1.0, limb: 0.9 },
    magSize: 5,
    reserveMax: 30,
    reserveStart: 20,
    reloadType: 'mag',
    reloadTactical: 2.2,
    reloadEmpty: 2.6,
    ammoInsertAt: 0.6,
    chamber: true,
    bolt: { delay: 0.14, time: 0.92, unscope: true, travel: 0.085, lift: 1.05 },
    spread: { hip: 7.5, perShot: 3, max: 9, recovery: 4, adsMult: 0.0, crouchMult: 0.8, moveMult: 1.5, airMult: 3.0 },
    recoil: {
      pattern: [[0.0, 4.6], [0.3, 4.4]],
      random: 0.6,
      adsMult: 0.8,
      recoveryDelay: 0.14,
      recovery: 5.5,
      kick: 2.6,
      kickRot: 3.0,
      shake: 0.45,
    },
    ads: { fovMult: 0.13, time: 0.34, moveMult: 0.52, sensMult: 1.1, vmFov: 40 },
    mobility: 0.9,
    equipTime: 0.7,
    unequipTime: 0.45,
    hip: { pos: [0.16, -0.19, -0.36] },
    adsDist: 0.14,
    sound: 'awm',
    noise: 105,
    tracerEvery: 1,
    flashSize: 0.24,
  },
  // Pompalı nişancı tüfeği (Lightning tipi, kodla modellendi): her atıştan sonra pompa çekilir (dürbün açık kalır),
  // tüp şarjör fişek fişek dolar; yarı otomatik nişancıdan yavaş ama ağır vurur, keskin nişancıdan çevik
  pr10: {
    id: 'pr10',
    name: 'PR-10 Tayfun',
    kind: 'Pompalı Nişancı',
    category: 'primary',
    pump: true,
    pumpDelay: 0.22,
    flashSize: 0.17,
    fireModes: ['semi'],
    rpm: 75,
    pellets: 1,
    range: 400,
    damage: 92,
    falloff: { start: 70, end: 180, min: 0.8 },
    zones: { head: 2.6, torso: 1.0, limb: 0.85 },
    magSize: 8,
    reserveMax: 48,
    reserveStart: 24,
    reloadType: 'shell',
    shell: 'rifle', // yükleme kapağı alıcının sağında: silah sağ yanını gösterecek kadar yatar, fişek sola itilir
    loadPort: [0.019, 0.03, -0.04],
    loadDir: [-1, 0, 0],
    loadRoll: 0.45,
    reloadStart: 0.3,
    reloadPerShell: 0.36,
    reloadEnd: 0.32,
    chamber: false,
    spread: { hip: 4.5, perShot: 1.6, max: 7, recovery: 6, adsMult: 0.02, crouchMult: 0.8, moveMult: 1.5, airMult: 3.0 },
    recoil: {
      pattern: [[0.0, 3.2], [0.3, 3.0]],
      random: 0.5,
      adsMult: 0.8,
      recoveryDelay: 0.12,
      recovery: 6,
      kick: 2.0,
      kickRot: 2.2,
      shake: 0.32,
    },
    ads: { fovMult: 0.22, time: 0.3, moveMult: 0.6, sensMult: 0.95, vmFov: 38 },
    mobility: 0.95,
    equipTime: 0.55,
    unequipTime: 0.35,
    hip: { pos: [0.16, -0.18, -0.36] },
    adsDist: 0.16,
    sound: 'pr10',
    noise: 90,
    tracerEvery: 1,
  },
  // Oyunun özel silahı (mağazada satılır): altı namlulu döner makineli. Namlular tam hıza çıkmadan ateş etmez
  // (sağ tık önceden döndürür), nişan alınmaz. Çok güçlü: ağır mermi, zırh deler, uzakta da etkili. 1.000'lik
  // cephane kutusu + 9.000 yedek = 10.000 fişek; kutu değişimi kısa animasyonla. Çevrim içinde yok
  minigun: {
    id: 'minigun',
    name: 'M134 Kasırga',
    kind: 'Döner Makineli',
    category: 'primary',
    model: 'glb',
    online: false,
    fireModes: ['auto'],
    rpm: 1800,
    pellets: 1,
    range: 320,
    damage: 55,
    falloff: { start: 45, end: 140, min: 0.8 },
    zones: { head: 2.0, torso: 1.0, limb: 0.9 },
    magSize: 1000,
    reserveMax: 9000,
    reserveStart: 9000,
    reloadType: 'mag',
    reloadTactical: 2.4,
    reloadEmpty: 2.4,
    ammoInsertAt: 0.62,
    chamber: false,
    spin: { up: 0.35, down: 1.6, rps: 22, moveMult: 0.82 }, // rps: tam hızda namlu demeti dönüşü (tur/sn)
    spread: { hip: 2.2, perShot: 0.04, max: 3.2, recovery: 7, adsMult: 1, crouchMult: 0.75, moveMult: 1.4, airMult: 2.5 },
    recoil: {
      pattern: [[0.0, 0.09], [0.07, 0.085], [-0.07, 0.085], [0.09, 0.08], [-0.09, 0.08], [0.05, 0.08]],
      random: 0.12,
      adsMult: 1,
      recoveryDelay: 0.05,
      recovery: 10,
      kick: 0.22,
      kickRot: 0.16,
      shake: 0.045,
    },
    ads: { fovMult: 1, time: 0.3, moveMult: 1, sensMult: 1, vmFov: 60 },
    mobility: 0.8,
    equipTime: 1.0,
    unequipTime: 0.6,
    // Köken arka üst tutamak: namlu demeti 22 cm aşağıda; silah sağ altta, namlu nişangâha doğru döner, sol el dikey tutamakta
    hip: { pos: [0.25, -0.1, -0.32], rot: [0.06, 0.14, 0.05], leftGrip: 'vertical' },
    adsDist: 0.3,
    sound: 'minigun',
    noise: 95,
    tracerEvery: 2,
    flashSize: 0.22,
  },
  // Elde tutulan bıçak (Sketchfab "Knife", CC BY 4.0): görevde 3. yuva. Sol tık keser (sağdan sola, sonra
  // soldan sağa sırayla), nişan yok, şarjör yok; elde bıçakla daha hızlı koşulur. V ile hızlı bıçak her silahta kalır
  knife: {
    id: 'knife',
    name: 'Muharebe Bıçağı',
    kind: 'Bıçak',
    category: 'melee',
    model: 'glb',
    source: 'sketchfab',
    online: false,
    melee: { hitTime: 0.11, time: 0.42 }, // isabet anı ve savuruş süresi (sn); tempo rpm'den
    fireModes: ['semi'],
    rpm: 140,
    pellets: 1,
    range: 2.4,
    damage: 120,
    falloff: { start: 999, end: 1000, min: 1 },
    zones: { head: 1, torso: 1, limb: 1 },
    magSize: 0,
    reserveMax: 0,
    reserveStart: 0,
    reloadType: 'none',
    reloadTactical: 0,
    reloadEmpty: 0,
    ammoInsertAt: 0,
    chamber: false,
    spread: { hip: 0, perShot: 0, max: 0, recovery: 10, adsMult: 1, crouchMult: 1, moveMult: 1, airMult: 1 },
    recoil: { pattern: [[0, 0]], random: 0, adsMult: 1, recoveryDelay: 0.1, recovery: 10, kick: 0, kickRot: 0, shake: 0 },
    ads: { fovMult: 1, time: 0.2, moveMult: 1, sensMult: 1, vmFov: 60 },
    mobility: 1.12,
    equipTime: 0.3,
    unequipTime: 0.2,
    // Köken sapın ortası, uç -Z, ağız -Y: sağ alt köşede, uç ileri ve hafif yukarı, ağız sola-aşağı
    hip: { pos: [0.15, -0.16, -0.31], rot: [0.45, 0.32, -0.55] },
    adsDist: 0.3,
    sound: 'melee',
    noise: 8,
  },
};

// Kullanıcının yüklediği sekiz CC BY 4.0 silah. Ortak mekanikler mevcut silahlardan gelir;
// katalog kimlikleri ve ağdaki eski silah sırası korunur, yeni kimlikler sona eklenir.
Object.assign(WEAPONS, {
  ak47: { ...WEAPONS.ak74, id: 'ak47', name: 'TK-47 Köz', asset: 'ak47', rpm: 600, damage: 35,
    fireModes: ['auto', 'semi'], falloff: { start: 35, end: 100, min: 0.72 },
    recoil: { ...WEAPONS.ak74.recoil, kick: 1.15, random: 0.23 }, sound: 'ak74' },
  adar215: { ...WEAPONS.k8, id: 'adar215', name: 'SK-15 Sedir', asset: 'adar215',
    fireModes: ['semi'], rpm: 350, damage: 38, magSize: 10, reserveMax: 100, reserveStart: 60,
    recoil: { ...WEAPONS.k8.recoil, kick: 1.1 }, mobility: 0.97 },
  g95: { ...WEAPONS.k8, id: 'g95', name: 'GT-95 Kalkan', asset: 'g95', rpm: 750, damage: 29,
    reloadTactical: 1.65, reloadEmpty: 2.05, mobility: 0.94 },
  mp7: { ...WEAPONS.bren2, id: 'mp7', name: 'HM-7 Kıvılcım', asset: 'mp7', kind: 'Hafif Makineli',
    fireModes: ['auto', 'semi'], rpm: 950, damage: 21, range: 160,
    falloff: { start: 18, end: 50, min: 0.52 }, reserveStart: 120,
    reloadTactical: 1.4, reloadEmpty: 1.8, mobility: 1.06, sound: 'smg',
    spread: { ...WEAPONS.bren2.spread, hip: 2.1, adsMult: 0.14 },
    recoil: { ...WEAPONS.bren2.recoil, kick: 0.62 },
    hip: { pos: [0.15, -0.16, -0.34] } },
  stm556: { ...WEAPONS.bren2, id: 'stm556', name: 'ST-56 Yel', asset: 'stm556',
    fireModes: ['auto', 'semi'], rpm: 780, damage: 30, mobility: 0.98,
    ads: { ...WEAPONS.bren2.ads, fovMult: 0.76, time: 0.22 } },
  m4super90: { ...WEAPONS.shotgun, id: 'm4super90', name: 'YO-90 Fırtına', asset: 'm4super90',
    model: 'glb', source: 'sketchfab', kind: 'Yarı Otomatik Av Tüfeği', pump: false,
    rpm: 220, pellets: 8, damage: 15, magSize: 7, reserveMax: 56, reserveStart: 28,
    loadPort: [0, 0.02, -0.16], loadRoll: -0.55 },
  ar10t: { ...WEAPONS.k8, id: 'ar10t', name: 'NT-10 Kartal', asset: 'ar10t', kind: 'Muharebe Tüfeği',
    fireModes: ['semi'], rpm: 300, damage: 47, range: 400, magSize: 20, reserveMax: 100, reserveStart: 60,
    falloff: { start: 60, end: 140, min: 0.75 }, mobility: 0.9,
    spread: { ...WEAPONS.k8.spread, hip: 3.2, adsMult: 0.035 },
    recoil: { ...WEAPONS.k8.recoil, kick: 1.65, kickRot: 1.5 },
    ads: { ...WEAPONS.k8.ads, fovMult: 0.7, time: 0.28, moveMult: 0.62 } },
  ithaca37: { ...WEAPONS.shotgun, id: 'ithaca37', name: 'PT-37 Koru', asset: 'ithaca37',
    model: 'glb', source: 'sketchfab', rpm: 75, pellets: 8, damage: 18,
    magSize: 5, reserveMax: 40, reserveStart: 25, loadPort: [0, 0.008, -0.13] },
});

// Tuş sırası: 1-9 (poligonda hepsi, görevde ana + yan silah + 3'te bıçak)
// Sketchfab silahları sonda: poligonda 1-9 tuşları eski dizilişte kalır, yenilere tekerlekle geçilir
// Yeni silahlar hep sona eklenir: çevrim içi protokol silahı bu dizideki sırasıyla taşır
export const WEAPON_ORDER = ['rifle', 'mar556', 'smg', 'shotgun', 'lmg', 'sniper', 'pistol', 'd50', 'rpg', 'k8', 'kr4', 'mk4', 'kt9', 'ak74', 'bren2', 'awm', 'minigun', 'pr10', 'knife', 'ak47', 'adar215', 'g95', 'mp7', 'stm556', 'm4super90', 'ar10t', 'ithaca37'];
// Varsayılan teçhizat hazır (ayrıntılı) modeller: oyuncunun ilk gördüğü silah kutulardan kurulu kod modeli olmasın
export const DEFAULT_LOADOUT = { primary: 'ak74', secondary: 'd50', melee: 'knife' };

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
  // Savaş robotunun iki gatling'i: çok hızlı, uzun seriler, mermi başına hafif; seriler arası soğuma
  robotGun: { rpm: 950, damage: 6, magSize: 140, reload: 3.6, burst: [14, 26], burstGap: [1.0, 1.7], pellets: 1, range: 95, sound: 'enemyLmg', noise: 120, tracerEvery: 2 },
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
  // Savaş robotu (robot.js): ağır, yavaş, siper kullanmaz, bomba atmaz, yana adım atmaz; tercih ettiği mesafede
  // durup uzun seriler sıkar. Hasar kuralları ROBOT tablosunda (zırh delme, patlayıcı, sensör)
  robot: {
    name: 'Savaş Robotu', hp: 900, weapon: 'robotGun', walk: 1.25, run: 1.9, viewRange: 85, fov: 170,
    prefDist: [14, 38], usesCover: false, rushes: false, aimBase: 3.6, headMult: 1,
    robot: true, noGrenades: true, noStrafe: true, eyeH: 2.55, chestH: 2.15, radius: 0.7, height: 2.9,
    colors: {},
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
  // Tarama bitince ateşsiz arama: silah son bilinen yerin çevresinde yavaşça gezinir (genlik °, hız rad/s)
  searchDeg: 18,
  searchRate: 0.6,
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
  searchDeg: 14,
  searchRate: 0.6,
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
  // Ele geçirme: bu can oranının altında mürettebat (crew asker) tankı terk eder; oyuncu binebilir (vehicle.js)
  bailRatio: 0.35,
  crew: 2,
  vsPlayerMult: 2.0, // düşman top mermisinin oyuncunun sürdüğü tanka çarpanı (ağır/hafif ayrımı yerine)
  bulletMult: 0.12, // düşman mermisinin oyuncunun tankına etkisi (mermi başına hasar × bu)
  // Oyuncunun sürüşü: hızlar (m/s), ivme, palet dönüşü (rad/s), taret dönüşü, top eğimi, dolum, ezme hızı,
  // üzerinden geçilen engel yüksekliği (m); kamera: uzaklık, yükseklik, bakış noktasının yerden yüksekliği
  drive: { maxFwd: 7.5, maxBack: 3.2, accel: 3.2, brake: 8, turn: 0.8, turretTurn: 1.6, pitchMin: -0.14, pitchMax: 0.38, reload: 3.0, crush: 2.0, climb: 0.85, camDist: 10, camHeight: 2.2, camPivot: 3.2, exitDist: 2.6 },
  playerShell: { rocketSpeed: 150, damage: 160, splashRadius: 6, splashDamage: 240 },
  playerCoax: { rpm: 600, damage: 24, range: 130, errDeg: 0.9 },
};

// Araçlar (vehicle.js): binme alanı ve süresi (E basılı), araç patlayınca içindekinin aldığı hasar, üçüncü
// şahıs kameranın eğim sınırı, nişan ışınının menzili
export const VEHICLE = { enterRadius: 2.6, enterTime: 0.5, ejectDamage: 55, pitchMin: -0.5, pitchMax: 0.32, aimRange: 400 };

// Savaş robotu (robot.js, tools/prepare-robot.mjs). Hasar: mermi zırh delmesiyle ölçeklenir (bulletBase + (1 − bulletBase)
// × delme), patlayıcı explosiveMult katı, bıçak meleeMult; ön paneldeki kırmızı sensör ("head") zayıf nokta
export const ROBOT = {
  walkSpeed: 1.25, // tam adım animasyonunun hızı (m/s)
  stride: 2.4, // bir tam adım döngüsü (m)
  hipTurn: 60 * Math.PI / 180, // bacaklar bakıştan en çok bu kadar sapar
  legTurn: 3, // bacakların dönüş hızı
  hipSwing: 0.32, // kalça salınımı (rad)
  kneeLift: 0.55, // salınımdaki diz bükümü (rad)
  bob: 0.09, // adımda gövdenin inişi (m)
  recoil: 0.05,
  glow: 2.2, // ışıyan göz ve lambaların parlaklığı
  envIntensity: 1.0,
  brighten: 1.5, // kaynak dokular çok koyu (gece mavisi metal): gündüz haritalarında seçilsin
  bulletBase: 0.35,
  explosiveMult: 2.2,
  meleeMult: 0.15,
  sensorMult: 1.6, // sensöre isabette silahın kafa çarpanının üstüne
  deathBlast: { radius: 5, damage: 70, fx: 1.3 },
  deathDrop: 0.75, // çökerken gövdenin inişi (m)
  wreckSmoke: 40, // enkaz bu kadar tüter (s)
  score: 400,
  stepShake: 14, // bu mesafenin içinde adım kamerayı sarsar (m)
  // Vuruş kutuları: eklem uzayında merkez ve boy (m)
  hitboxes: [
    { joint: 'torso', zone: 'torso', at: [0, 0.55, 0.0], size: [1.15, 1.0, 1.05] },
    { joint: 'torso', zone: 'head', at: [0, 0.42, -0.52], size: [0.36, 0.3, 0.2] },
    { joint: 'pelvis', zone: 'torso', at: [0, -0.05, 0], size: [0.95, 0.5, 0.85] },
    { joint: 'shoulderL', zone: 'limb', at: [-0.15, -0.3, -0.35], size: [0.55, 0.8, 1.1] },
    { joint: 'shoulderR', zone: 'limb', at: [0.15, -0.3, -0.35], size: [0.55, 0.8, 1.1] },
    { joint: 'hipL', zone: 'limb', at: [0, -0.43, -0.16], size: [0.45, 1.0, 0.5] },
    { joint: 'hipR', zone: 'limb', at: [0, -0.43, -0.16], size: [0.45, 1.0, 0.5] },
    { joint: 'kneeL', zone: 'limb', at: [0, -0.32, 0.19], size: [0.4, 0.8, 0.45] },
    { joint: 'kneeR', zone: 'limb', at: [0, -0.32, 0.19], size: [0.4, 0.8, 0.45] },
    { joint: 'ankleL', zone: 'limb', at: [0, -0.12, -0.05], size: [0.6, 0.26, 0.9] },
    { joint: 'ankleR', zone: 'limb', at: [0, -0.12, -0.05], size: [0.6, 0.26, 0.9] },
  ],
};

// Kan (Ayarlar → Kan açıkken): sıçrama ve damla lekeleri, ölen/yere düşen askerin altında yayılan göl
export const BLOOD = {
  decals: 90, // her leke biçiminden en çok bu kadar (halka tampon: eskisi silinir)
  decalsLow: 40,
  pools: 28,
  poolsLow: 12,
  poolSize: 1.5, // ölen askerin kan gölünün çapı (m)
  poolTime: 9, // göl bu sürede yayılır (s): önce hızlı, sonra yavaş
  downedPoolSize: 1.1, // yerde yaralı asker / oyuncu
  downedPoolTime: 14,
  wallChance: 0.75, // isabette arkadaki yüzeye sıçrama olasılığı
  wallReach: 3, // m
  wallSize: [0.45, 0.95],
  groundChance: 0.7, // isabette altındaki zemine damla olasılığı
  groundSize: [0.25, 0.5],
  splatRoughness: 0.45, // lekeler yarı ıslak
  poolRoughness: 0.16, // göl ıslak: güneşi ve gökyüzünü yansıtır
  envIntensity: 0.8,
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
  // Dururken ayaklar yerinde kalır; gövde bacaklardan bu kadar dönünce (rad) bacaklar adım atıp hizalanır
  turnStart: 0.75,
  turnEnd: 0.08, // hizalama bu açının altında biter
  turnSpeed: 9, // hizalanma hızı (birkaç hızlı adım)
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
  offscreenRate: 1 / 10, // görüş alanı dışındaki asker (gölgesi görünebilir: donmasın, seyrek güncellensin)
  meshLodDist: 28, // bu mesafeden ötede sade model (≈2,3 bin üçgen; tam model ≈11,4 bin)
  meshLodHyst: 3,
  blobFrom: 38, // gölge haritasının menzili dışında askerin altına yumuşak ayak gölgesi (m)
  blobOpacity: 0.42,
  envIntensity: 0.45, // ortam yansıması: gölgede ve uzakta asker simsiyah bir siluete dönmesin
  // Elde gerçek silah modeli (Alfa Timi): bileğin kabzaya göre yeri, sol bileğin kundak noktasına göre kayması,
  // şarjör yuvası yüksekliği ve dipçik ucunun omuza gömülme payı (m, silah uzayında)
  heldGun: { grip: [0.025, -0.035, 0.1], fore: [-0.03, -0.045, 0.02], magY: -0.07, stockPad: 0.01 },
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
  // Ad, rol ve rol silahı data/squad.json'da (Alfa Timi); burada ortak davranış değerleri
  regenDelay: 6, // hasar almadan bu kadar süre geçince can dolmaya başlar (s)
  regenRate: 18, // can / s
  reviveHp: 0.55, // toparlanınca canın oranı
  damageTaken: 0.6, // düşman mermisinin dosta etkisi (oyuncuya göre)
  walk: 2.2,
  run: 4.6,
  // Hedef bu kadar yakın ve arada engel yoksa yol ağı yerine doğrudan yürü: yol ağı duvar dibindeki hücreleri
  // kapalı sayar, duvara yaslanmış oyuncuya (tedavi, canlandırma) ancak son birkaç metre düz gidilerek ulaşılır
  directDist: 4,
  settle: [0.9, 1.6], // hedefe varış / yeniden yürümeye başlama mesafesi (m)
  faceHold: 2.0, // hedef gözden kaybolunca o yöne bakmayı sürdürme süresi (s)
  faceMoveDist: 3.0, // bundan kısa yer değiştirmede gövde hareket yönüne dönmez, yan/geri adımla gider (m)
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
  fireLaneMargin: 0.8, // hattın dışına kaydırılan hedefin koni kenarından payı (m)
  coverSwitchGain: 3, // yeni siper ancak bu kadar daha iyi puanlıysa değiştirilir (sürekli siper değiştirmesin)
  coverHold: 4, // hedef kaybolduktan sonra siperde bekleme süresi (s)
  coverHoldDist: 9, // oyuncu ilerleyip düzen yeri siperden bu kadar uzaklaşınca siper bırakılır (m)
  stealth: 0.6, // düşmanın dostu fark etme hızı çarpanı: manga oyuncunun arkasında, dikkat çekmemeye çalışır
  colors: { uniform: 0x3d5a8a, vest: 0x243650, helmet: 0x2f4b78, skin: 0xa77b5b, band: 0x4aa3ff },
  // Kademe taktiklerinin ayarları (hangi taktiğin açık olduğu ALLY_TIERS'ta)
  // Siperde saklanma / ateş için çıkma süreleri (daha kısası askeri durmadan eğilip kalkıyor gösteriyordu)
  peek: { hide: [1.3, 2.2], show: [2.0, 3.4] },
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
      grass: { density: 5, color: 0xb6a46a, height: 0.8 }, // kuru çöl otu
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
  forest: {
    name: 'Kara Orman', desc: 'Sık çam ormanı, sisli sabah',
    env: {
      sky: { zenith: 0x58789a, horizon: 0xb9c6bf, ground: 0x4a5640, glow: [0.85, 0.7, 0.45], disc: [1.0, 0.92, 0.72], band: [0.12, 0.1, 0.05], stars: 0 },
      fog: [24, 240], sunDir: [-0.55, 0.38, 0.62], sun: [0xffe2b4, 2.5], hemi: [0xc4d6dc, 0x56663f, 1.55], exposure: 1.12,
      reflect: [0x56708a, 0xb9c6bf, 0x4a5640], view: [0xc6d4d8, 0x4a5a3a, 1.45, 0xffe2b4, 1.8],
      dust: 0x7a7a5a, ambient: { wind: 380, gain: 0.15, distant: 0.6 }, perception: 0.82, weather: null,
      grass: { density: 26, color: 0x7e9a56, height: 1.1 },
    },
  },
  factory: {
    name: 'Çelik Fabrika', desc: 'Robot fabrikası, gece',
    env: {
      sky: { zenith: 0x05070f, horizon: 0x2a1e30, ground: 0x08080a, glow: [0.3, 0.12, 0.18], disc: [0.9, 0.85, 1.0], band: [0.16, 0.05, 0.05], stars: 1 },
      fog: [26, 240], sunDir: [0.4, 0.55, -0.7], sun: [0xb8c4ff, 0.9], hemi: [0x5a5e9a, 0x2a1a18, 1.0], exposure: 1.55,
      reflect: [0x0c1020, 0x3a2a40, 0x0a0a0c], view: [0x7a7aa8, 0x2a1a18, 0.95, 0xc0c8ff, 0.65],
      dust: 0x5a5a62, ambient: { wind: 220, gain: 0.1, distant: 0.9, hum: true }, perception: 0.85, weather: null,
    },
  },
  coast: {
    name: 'Kıyı', desc: 'Kumsal ve burun, şafak',
    env: {
      sky: { zenith: 0x3e6a9c, horizon: 0xf2c19a, ground: 0xc8b090, glow: [1.0, 0.6, 0.35], disc: [1.0, 0.86, 0.62], band: [0.36, 0.16, 0.08], stars: 0 },
      fog: [70, 460], sunDir: [0.2, 0.22, 0.95], sun: [0xffcfa0, 2.8], hemi: [0xb8cce4, 0x8a7458, 1.2], exposure: 1.05,
      reflect: [0x4a78a8, 0xf2c19a, 0x9a8466], view: [0xd2deec, 0x8a7458, 1.5, 0xffd2a8, 2.1],
      dust: 0xd2bc94, ambient: { wind: 360, gain: 0.18, distant: 1.1, sea: true }, perception: 1, weather: null,
      grass: { density: 4, color: 0xc0b07a, height: 1.0 }, // kumul otu
    },
  },
  core: {
    name: 'Son Kale', desc: 'Kızıl kanyon, alacakaranlık, kül yağışı',
    env: {
      sky: { zenith: 0x2a1218, horizon: 0xc0583a, ground: 0x4a2418, glow: [1.0, 0.32, 0.14], disc: [1.0, 0.55, 0.3], band: [0.5, 0.12, 0.04], stars: 0 },
      fog: [30, 270], sunDir: [-0.5, 0.34, 0.8], sun: [0xff7a48, 2.5], hemi: [0xb47a8a, 0x6a3220, 1.45], exposure: 1.12,
      reflect: [0x4a2028, 0xc0583a, 0x4a2418], view: [0xc89090, 0x5a2a1a, 1.35, 0xff9a6a, 1.9],
      dust: 0x9a5a40, ambient: { wind: 480, gain: 0.2, distant: 1.3 }, perception: 0.92, weather: 'ash',
      grass: { density: 2.5, color: 0x9a6a48, height: 0.7 },
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
    radioIntro: 'Kızılkum Vadisi\'ne hoş geldiniz. Komutan, Alfa Timi arkanda: Demir, Kaya ve Yıldız.',
    outro: 'Herkes içeride. Güzel iş Alfa Timi, sizi köyün kuzeyine bırakıyoruz.',
    enemies: { groups: ['outpost'], exclude: ['shotgunner'], hmg: 0 },
    tuning: { reaction: 1.45, aim: 1.55, damage: 0.6, perception: 0.85, awareness: 0.75, attackers: -1, grenades: false },
  },
  {
    id: 2, map: 'kizilkum', name: 'Uçaksavarlar', tag: 'Kolay-orta',
    brief: 'Köydeki iki uçaksavar topunu C4 ile imha et. Pompalılar hücum eder, çatıda nöbetçi var.',
    start: 1, objectives: ['aa', 'extract'], allies: 3, allyTier: 2,
    radioIntro: 'Kontrol noktası bizde. Sıradaki iş köyde.',
    outro: 'Gökyüzü bizim! Alfa Timi, sizi doğruca limana götürüyoruz.',
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
  {
    id: 7, map: 'forest', name: 'Kara Orman', tag: 'Zor · robot',
    brief: 'Sisli çam ormanında kereste kampını temizle, tepedeki radar istasyonundan verileri indir ve istasyonu koruyan savaş robotunu yok et. Bazuka ve C4 robota karşı en iyi silah.',
    start: 0, objectives: ['outpost', 'intel', 'robots', 'extract'], allies: 3, allyTier: 5,
    radioIntro: 'Kuzey ormanından garip sinyaller geliyor. Önce kampı al, sonra istasyona çık.',
    outro: 'Tahliye tamam. Robotun verileri karargâha gidiyor. Bu daha başlangıç.',
    enemies: { groups: ['outpost', 'hq', 'robots'], exclude: [], hmg: 3 },
    tuning: { reaction: 0.84, aim: 0.88, damage: 1.1, perception: 0.95, awareness: 1.15, attackers: 1, grenades: true },
  },
  {
    id: 8, map: 'factory', name: 'Çelik Fabrika', tag: 'Zor · tank',
    brief: 'Gece robot fabrikasına baskın: boş dost tanka bin, kapıyı topla düşür, avludaki robotları ve düşman tankını yok et, montaj salonundaki üç jeneratörü C4 ile patlat.',
    start: 0, objectives: ['capture', 'robots', 'aa', 'extract'], allies: 3, allyTier: 5,
    radioIntro: 'Robotların üretildiği fabrikayı bulduk. Tank hazır, Komutan: bu gece onu sen süreceksin.',
    outro: 'Tahliye tamam. Fabrika karanlıkta, üretim durdu.',
    enemies: { groups: ['outpost', 'robots', 'village'], exclude: [], hmg: 3, tanks: 1 },
    tuning: { reaction: 0.82, aim: 0.86, damage: 1.12, perception: 0.95, awareness: 1.15, attackers: 1, grenades: true },
  },
  {
    id: 9, map: 'coast', name: 'Kıyı Çıkarması', tag: 'Çok zor',
    brief: 'Şafakta sahile çıkarma: kum tepesindeki sığınakları al, sahil yolundaki tankları ele geçir ya da patlat, köydeki iki kıyı topunu sustur ve burundaki pisti helikopter gelene dek tut.',
    start: 0, objectives: ['outpost', 'aa', 'lz', 'defend', 'board'], allies: 3, allyTier: 5,
    radioIntro: 'Rampa inmek üzere! Kumsal açık; sığınaklardaki makineliler sizi bekliyor. Arkanda dost bir tank çıkıyor.',
    outro: 'Tahliye tamam. Sahil başı bizim, filo karaya çıkıyor.',
    enemies: { groups: ['outpost', 'village'], exclude: [], reinforcements: true, hmg: 4, tanks: 2 },
    defendTime: 95,
    tuning: { reaction: 0.8, aim: 0.84, damage: 1.15, perception: 1.0, awareness: 1.2, attackers: 1, grenades: true },
  },
  {
    id: 10, map: 'core', name: 'Son Kale', tag: 'Final',
    brief: 'Kızıl kanyondaki robot komuta üssü: kapıyı düşür, robot sürüsünü yok et, üç enerji çekirdeğini patlat, kapatma kodlarını al ve robot dalgalarına karşı pisti tut.',
    start: 0, objectives: ['outpost', 'robots', 'aa', 'intel', 'lz', 'defend', 'board'], allies: 3, allyTier: 5,
    radioIntro: 'Son Kale. Ne olursa olsun bu gece bitiyor. Alfa Timi, yanındayız.',
    outro: 'Kapatma kodları çalıştı. Robot ordusu sustu. Demir Şafak tamamlandı, Komutan.',
    enemies: { groups: ['outpost', 'robots', 'village', 'hq'], exclude: [], hardTypes: true, reinforcements: true, extraWave: true, hmg: 5 },
    defendTime: 110,
    tuning: { reaction: 0.78, aim: 0.82, damage: 1.18, perception: 1.0, awareness: 1.22, attackers: 1, grenades: true },
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
  touchMsaa: { high: 4, medium: 2, low: 2 }, // dokunmatik cihazlarda (küçük ekranda fark az, piksel maliyeti yüksek)
  anisotropy: { high: 16, medium: 8, low: 4 }, // doku süzme üst sınırı (cihazın izin verdiğiyle sınırlı)
  // Örneklenmiş hazır modeller (ağaç, konteyner) bu boyda (m) kare hücrelere bölünür: her hücre ayrı InstancedMesh,
  // bakış ve gölge konisinin dışındaki hücreler hiç çizilmez. Küçük hücre = az üçgen, çok çizim çağrısı
  instanceCell: 40,
  // Statik dünya geometrisi (duvar, bina, kum torbası) de bu boyda hücrelere bölünüp malzeme başına birleşir
  worldCell: 64,
  // Kamera uzak düzlemi sisin bittiği yerin bu kadar ötesi (m): tamamen sise gömülmüş geometri çizilmez
  farPastFog: 30,
  // Gölge haritasının merkezi oyuncunun bu kadar önünde (m; harita ±48 m): bakılan yer kaplanır
  shadowAhead: 20,
  // Dokunmatik cihazlarda gölge haritası bu kadar karede bir yenilenir (gölge geçişinin maliyeti yarıya iner)
  touchShadowEvery: 2,
};

// Teçhizat ekranındaki silah görselleri (Operasyon Güncellemesi §5.4): oyunun kendi modelinden stüdyo
// çizimi (kart simgesi) ve sağ paneldeki dönen, sürüklenebilen önizleme
// Lobi (ana sayfa) 3B sahnesi: menü haritasında kameraya dönük operatör (tim askeri modeli). Kamera önünde durur,
// operatör ekranın ortasının biraz sağında (sol sütun modlar, sağ sütun görevler); hafif nefes salınımı
export const LOBBY = {
  op: [0, 86], // operatörün haritadaki yeri (x, z): Kızılkum yolu, arkasında köy
  opYaw: Math.PI, // kameraya (güneye) dönük
  type: 'allyElite',
  model: 'squad_forest', // Alfa Timi askeri (characterAssets.json)
  gun: 'ak74', // elindeki silah modeli (weaponAssets.json)
  camDist: 3.4,
  camHeight: 1.5,
  lookHeight: 1.15,
  side: 0.32, // bakış noktası operatörün bu kadar solunda (m, kameradan bakınca): operatör ekranın sağına kayar
  fov: 38,
  swayAmp: 0.06, // kamera salınımı (m)
  swaySpeed: 0.35,
  maxFps: 30, // lobide çizim sınırı (pil): operatör nefes alır, kamera yavaş salınır; 30 kare yeter
};

// Nişangâh görünümü (data/sights.json türleri, reticles.js çizimleri)
export const SIGHT_VIEW = {
  reticleZ: 0.03, // açık gövdesi olmayan (prosedürel) kolimatörde işaretin gez noktasından ilerisi (m)
  housingGap: 0.004, // açık gövdede işaret gövde ortasından bu kadar ileride
  reticleFrom: 0.55, // nişan oranı bunu geçince işaret belirmeye başlar (kalçadan bakınca camda işaret yok)
  reticleFade: 0.35, // belirme aralığı
  housingSwap: 0.72, // modelin kapalı gövdesi bu nişan oranından sonra açık gövdeyle değişir
  scopeAt: 0.86, // dürbünlü silahta bu orandan sonra model gizlenir, dürbün kaplaması çizilir
  scopeBreathAt: 0.6, // dürbünde nefes salınımı bu orandan sonra başlar
};

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
    reaction: 0.9, aimMult: 1.7, damageMult: 0.6, perception: 0.8, awarenessRate: 0.65,
    maxAttackers: 1, grenades: false, regenDelay: 5, dpsCap: 32,
  },
  normal: {
    label: 'Asker', desc: 'Dengeli çatışma. İlk oynayış için önerilir.',
    reaction: 0.6, aimMult: 1.0, damageMult: 0.85, perception: 1.0, awarenessRate: 1.0,
    maxAttackers: 2, grenades: true, regenDelay: 6, dpsCap: 40,
  },
  hard: {
    label: 'Gazi', desc: 'Hızlı tepki, sert isabet, bol el bombası.',
    reaction: 0.4, aimMult: 0.72, damageMult: 1.0, perception: 1.15, awarenessRate: 1.45,
    maxAttackers: 3, grenades: true, regenDelay: 7, dpsCap: 75,
  },
};

// Hayatta kalma ölçümü (Operasyon Güncellemesi §10): hasar günlüğü ve yere düşme süresi (time-to-down).
// Hedef (Asker, Hafif Taktik Yelek, açıkta): tek düşmana ≥ 4 sn, iki düşmana ≥ 2,5 sn (duman testi "balance")
export const BALANCE = {
  dmgLogSize: 32, // oyuncunun son isabet kayıtları (konsol "dmgpanel")
  dmgPanelSec: 10, // panelde gösterilen pencere
  ttdKeep: 30, // kayıtta tutulan son yere düşme süreleri
  ttdTarget: { one: 4, two: 2.5 },
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
  // Açıkta yan adım: kararlı yürüyüş parçaları, arada durup nişan; kısa aralıklı sağ-sol gidip gelme
  // "dans" gibi görünüyordu
  strafeTime: [1.4, 3.2], // bir yöne yürüme süresi (sn)
  strafePause: 0.35, // yön değişiminde durup ateş etme olasılığı
  strafeSpeed: 1.0, // yürüme hızına çarpan
  // Açıkta diz çökme (yalnız tüfekçi): süreli duruş; eskiden kare başına zar atılıyor, bir kare çöküyordu
  kneelChance: 0.35,
  kneelTime: [1.6, 3.2],
  standTime: [2.5, 5.5],
  // Görüş kısa süre kesilince (direk, ağaç, dost asker araya girdi) hemen yerinden fırlamaz
  chaseDelay: 0.8,
  // Siperdeki asker ancak bu kadar süre açıkta kalırsa siperi bırakır (yükseklik sınırında gidip gelmesin)
  coverExposedTime: 0.6,
  coverArriveDist: 2.5, // yol siperin yakınında bittiyse varılmış sayılır
  // Aramada çevreye bakış: varış anındaki yöne göre (kendi yönüne eklenince yerinde fırıl fırıl dönüyordu)
  lookAroundArc: 0.9,
  lookAroundRate: 1.3,
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
