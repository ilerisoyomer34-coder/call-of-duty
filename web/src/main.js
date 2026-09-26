// Oyun çekirdeği (GameMode + PlayerController + ana döngü): sahne, ışık, gökyüzü, sistemlerin
// oluşturulması, durum makinesi (menü/oynanış/duraklatma/ölüm/zafer), puan ve istatistikler.
import * as THREE from 'three';
import { createTextures } from './textures.js';
import { World } from './world.js';
import { NavGrid } from './nav.js';
import { Effects } from './effects.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { PlayerWeapons } from './weapons.js';
import { Viewmodel } from './viewmodel.js';
import { EnemyManager } from './enemy.js';
import { GrenadeSystem, applyRadialDamage } from './grenades.js';
import { Mission } from './mission.js';
import { HUD } from './hud.js';
import { Menus } from './menus.js';
import { DevConsole } from './devconsole.js';
import { preloadSoldier } from './soldier.js';
import { loadSettings, resolveQuality, saveSettings } from './settings.js';
import { DIFFICULTY, SCORE, DEFAULT_LOADOUT, WEAPONS, LEVELS } from './config.js';
import { AllyManager } from './ally.js';
import { storage, warnOnce } from './util.js';
import { Emitter, clamp, rand } from './util.js';

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w;
}`;
const SKY_FRAG = /* glsl */ `
uniform vec3 sunDir;
uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 ground;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.55));
  col = mix(col, ground, clamp(-h * 6.0, 0.0, 1.0));
  float s = max(dot(d, sunDir), 0.0);
  col += vec3(1.0, 0.62, 0.32) * pow(s, 8.0) * 0.55;
  col += vec3(1.0, 0.85, 0.6) * pow(s, 900.0) * 6.0;
  // Ufuk çizgisinde sıcak bant
  col += vec3(0.35, 0.16, 0.06) * exp(-abs(h) * 14.0) * (0.4 + 0.6 * pow(s, 2.0));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const LOADOUT_KEY = 'demirsafak.loadout.v1';
const CHARACTER_TIMEOUT_MS = 25000; // asker modeli bu sürede inmezse basit askerle açılır
const PRECOMPILE_TIMEOUT_MS = 8000; // paralel derleme desteklenmiyorsa bu süreden sonra beklemeden devam
const FRAME_ERROR_LIMIT = 90; // art arda bu kadar karede hata olursa oyuncuya gösterilir
const HOT_READY_FALLBACK_MS = 2500;

// Yükleme ekranı (shell.html'deki açılış bekçisi). Bekçi yoksa (ör. eski kabuk) en azından ekranı aç/kapa.
function loadingScreen() {
  if (window.__boot) return window.__boot;
  const el = document.getElementById('loading');
  return {
    show() { el.hidden = false; },
    step() {},
    hide() { el.hidden = true; },
    ready() { el.hidden = true; },
    fail(title, err) { console.error(title, err); },
  };
}

// Aşama metninin ekrana çizilmesi için bir kare bekle; sekme görünmüyorsa (rAF durur) zamanlayıcıyla devam et
function nextPaint() {
  return new Promise((resolve) => {
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      setTimeout(resolve, 0);
    };
    requestAnimationFrame(go);
    setTimeout(go, 150);
  });
}
// Seviye ilerlemesi: açılan son seviye ve her seviyenin en iyi sonucu (tarayıcı depolaması yoksa bellekte)
const PROGRESS_KEY = 'demirsafak.progress.v1';
function loadProgress() {
  const s = storage.get(PROGRESS_KEY, null);
  const unlocked = clamp(Math.floor(s?.unlocked || 1), 1, LEVELS.length);
  return { unlocked, best: s && typeof s.best === 'object' && s.best ? s.best : {} };
}

// Seviyenin zorluk çarpanları seçilen temel zorluğun (Acemi/Asker/Gazi) üstüne uygulanır
function levelDifficulty(base, level) {
  const t = level?.tuning;
  if (!t) return base;
  return {
    ...base,
    reaction: base.reaction * t.reaction,
    aimMult: base.aimMult * t.aim,
    damageMult: base.damageMult * t.damage,
    perception: base.perception * t.perception,
    awarenessRate: base.awarenessRate * t.awareness,
    maxAttackers: clamp(base.maxAttackers + t.attackers, 1, 4),
    grenades: base.grenades && t.grenades,
    dpsCap: base.dpsCap * t.damage,
  };
}

function loadLoadout() {
  const s = storage.get(LOADOUT_KEY, null);
  const ok = s && WEAPONS[s.primary]?.category === 'primary' && WEAPONS[s.secondary]?.category === 'secondary';
  return ok ? { primary: s.primary, secondary: s.secondary } : { ...DEFAULT_LOADOUT };
}

export class Game {
  constructor() {
    this.events = new Emitter();
    this.settings = loadSettings();
    this.canvas = document.getElementById('game');
    this.isTouch = matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && 'ontouchstart' in window);
    this.quality = resolveQuality(this.settings.quality, this.isTouch);
    this.cheats = { god: false, infiniteAmmo: false, aiOff: false };
    this.stats = this.freshStats();
    this.time = 0;
    this.timeScale = 1;
    this.state = 'boot';
    this.mode = 'menu';
    this.difficultyKey = 'normal';
    this.difficulty = DIFFICULTY.normal;
    this.progress = loadProgress();
    this.level = LEVELS[0];
    this.barrels = [];
    this.debris = [];
    this.sunDir = new THREE.Vector3(0.82, 0.3, -0.22).normalize();

    const hi = this.quality === 'high';
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: this.quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.autoClear = false;
    this.renderer.shadowMap.enabled = this.quality !== 'low';
    this.renderer.shadowMap.type = hi ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;

    this.camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 1200);
    this.camera.rotation.order = 'YXZ';
    this.textures = createTextures(this.quality);
    this.audio = new Audio();
    this.input = new Input(this.canvas, document.getElementById('touch'));
    this.player = new Player(this);
    this.viewmodel = new Viewmodel(this, this.textures);
    this.envMap = this.buildEnvMap();
    this.viewmodel.setEnvironment(this.envMap);
    this.loadout = loadLoadout();
    this.hud = new HUD(this);
    this.menus = new Menus(this);
    this.console = new DevConsole(this);

    this.input.onLockChange = (locked) => {
      if (!locked && this.state === 'playing' && !this.console.open && !this.input.touch.active) this.pause();
    };
    this.clickToPlay = document.getElementById('clickToPlay');
    this.clickToPlay.addEventListener('click', () => {
      this.audio.init();
      this.input.requestLock();
    });
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });
    window.addEventListener('touchstart', () => this.enableTouch(), { passive: true, once: true });
    if (this.isTouch) this.enableTouch();
    this.applySettings();
    this.resize();
  }

  // Hazır asker modeli: gelmezse (dosya yok, ağ hatası, zaman aşımı) prosedürel askerle devam edilir
  async loadCharacters() {
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('zaman aşımı')), CHARACTER_TIMEOUT_MS));
    try {
      await Promise.race([preloadSoldier(), timeout]);
    } catch (err) {
      warnOnce('soldier-model', `Asker modeli yüklenemedi, basit asker kullanılıyor (${err.message})`);
    }
  }

  // Gölgelendiricileri yükleme ekranı açıkken derle: ilk karede telefonda saniyelerce donma olmasın.
  // KHR_parallel_shader_compile yoksa derleme yine olur ama zaman aşımı sonsuz beklemeyi önler.
  async precompile() {
    const r = this.renderer;
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    try {
      this.camera.updateMatrixWorld();
      await Promise.race([r.compileAsync(this.scene, this.camera), wait(PRECOMPILE_TIMEOUT_MS)]);
      if (this.mode !== 'menu') await Promise.race([r.compileAsync(this.viewmodel.scene, this.viewmodel.camera), wait(PRECOMPILE_TIMEOUT_MS / 2)]);
    } catch (err) {
      warnOnce('precompile', `Gölgelendirici ön derlemesi atlandı (${err.message})`);
    }
  }

  // Silahların metal yüzeyleri için şafak gökyüzünden ortam yansıma haritası
  buildEnvMap() {
    const envScene = new THREE.Scene();
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(10, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: {
          sunDir: { value: this.sunDir },
          zenith: { value: new THREE.Color(0x4a78a8) },
          horizon: { value: new THREE.Color(0xe0b595) },
          ground: { value: new THREE.Color(0x9a7a58) },
        },
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
      })
    );
    envScene.add(sky);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const tex = pmrem.fromScene(envScene, 0.02).texture;
    pmrem.dispose();
    return tex;
  }

  freshStats() {
    return { kills: 0, headshots: 0, shots: 0, hits: 0, deaths: 0, score: 0, time: 0, grenades: 0, damageTaken: 0, explosions: 0 };
  }

  enableTouch() {
    this.isTouch = true;
    document.body.classList.add('touch');
    if (this.state === 'playing') this.input.enableTouch(true);
  }

  applySettings() {
    const S = this.settings;
    this.audio.setVolumes({ master: S.masterVolume, sfx: S.sfxVolume, ambient: S.ambientVolume });
    this.hud.applySettings(S);
    if (this.effects) this.effects.bloodOn = S.blood;
    const q = resolveQuality(S.quality, this.isTouch);
    const pr = q === 'high' ? Math.min(devicePixelRatio, 2) : q === 'medium' ? Math.min(devicePixelRatio, 1.5) : Math.min(devicePixelRatio, 1);
    this.renderer.setPixelRatio(pr);
    if (this.sun) this.sun.castShadow = q !== 'low' && this.renderer.shadowMap.enabled;
    this.resize();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewmodel.resize(w / h);
    if (this.effects) this.effects.setScale(h * this.renderer.getPixelRatio(), this.camera.fov);
  }

  // --- Sahne kurulumu ---
  buildScene(mode) {
    if (this.scene) this.disposeScene();
    const scene = new THREE.Scene();
    this.scene = scene;
    const horizon = new THREE.Color(0xd8a987);
    scene.fog = new THREE.Fog(horizon, 70, 460);
    scene.background = horizon;
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(900, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: {
          sunDir: { value: this.sunDir },
          zenith: { value: new THREE.Color(0x3d6a9a) },
          horizon: { value: horizon },
          ground: { value: new THREE.Color(0xb89878) },
        },
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      })
    );
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    scene.add(sky);
    this.sky = sky;
    const hemi = new THREE.HemisphereLight(0xb4c8e0, 0x8a6f4d, 1.15);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffcf9c, 2.9);
    sun.castShadow = this.renderer.shadowMap.enabled;
    const size = this.quality === 'high' ? 2048 : 1024;
    sun.shadow.mapSize.set(size, size);
    const s = 48;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 320 });
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.04;
    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;

    this.world = new World(scene, this.textures);
    this.effects = new Effects(scene, this.textures, this.audio, this.quality);
    this.effects.bloodOn = this.settings.blood;
    this.enemies = new EnemyManager(this);
    this.allies = new AllyManager(this);
    this.grenades = new GrenadeSystem(this);
    this.weapons = new PlayerWeapons(this);
    this.barrels = [];
    this.debris = [];
    // Menü arka planı tam operasyon haritasını kullanır (toplar göğe ateş eder)
    this.mission = new Mission(this, mode, mode === 'mission' ? this.level : LEVELS[LEVELS.length - 1]);
    this.resize();
  }

  disposeScene() {
    this.scene.traverse((o) => {
      if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose();
    });
    if (this.world) for (const m of Object.values(this.world.materials)) m.dispose();
    this.audio.stopRotor();
    this.scene = null;
  }

  buildNav() {
    this.nav = new NavGrid(this.world, 0.35);
    this.nav.generateCovers();
  }

  // Menü arka planı: haritanın üzerinde yavaş kamera turu
  async showMenu() {
    this.state = 'menu';
    this.mode = 'menu';
    this.input.enabled = false;
    this.input.enableTouch(false);
    document.body.classList.remove('playing');
    this.hud.show(false);
    this.clickToPlay.hidden = true;
    this.buildScene('menu');
    this.mission.data = null;
    this.buildMenuWorld();
    this.menus.show('menu', false);
    this.menus.stack = [];
  }

  buildMenuWorld() {
    // Görev haritası, düşmansız (yalnızca uçaksavarlar göğe ateş eder)
    const M = this.mission;
    M.mode = 'mission';
    M.build();
    this.enemies.clear();
    this.allies.clear();
    M.objectives = [];
    M.radioQueue.length = 0;
    M.interactables.length = 0;
    this.menuT = 0;
  }

  setLoadout(primary, secondary) {
    this.loadout = { primary, secondary };
    storage.set(LOADOUT_KEY, this.loadout);
  }

  async startMode(mode, diffKey = 'normal', levelId = this.level.id) {
    this.audio.init();
    this.audio.stopMenuMusic();
    this.menus.hideAll();
    const L = loadingScreen();
    L.show('HARİTA İNŞA EDİLİYOR');
    this.state = 'loading';
    try {
      L.step('Harita ve düşmanlar yerleştiriliyor', 0.25);
      await nextPaint();
      this.mode = mode;
      this.difficultyKey = diffKey;
      this.level = LEVELS.find((l) => l.id === levelId) || LEVELS[0];
      const base = DIFFICULTY[diffKey] || DIFFICULTY.normal;
      this.difficulty = mode === 'mission' ? levelDifficulty(base, this.level) : base;
      this.stats = this.freshStats();
      this.cheats.god = false;
      this.buildScene(mode);
      this.mission.build();
      L.step('Teçhizat hazırlanıyor', 0.6);
      await nextPaint();
      this.weapons.reset(this.mission.defaultLoadout());
      // Seviyenin başlangıç kontrol noktasını teçhizatla birlikte sessizce yeniden kaydet
      this.mission.saveCheckpoint(this.mission.checkpoint?.idx ?? 0, true);
      this.hud.bakeMinimap();
      this.player.applyCamera(this.camera, 0);
      L.step('Gölgelendiriciler derleniyor', 0.8);
      await nextPaint();
      await this.precompile();
    } catch (err) {
      // Yarım kalmış sahne oynatılmaz; oyuncu menüye dönüp yeniden deneyebilir
      L.fail('Harita açılamadı', err, 'Ana menüye dönüp yeniden dene. Sorun sürerse düşük grafikle açmayı dene.', true);
      return;
    }
    this.hud.show(true);
    this.hud.setHealth(this.player.health.hp, this.player.health.max);
    this.events.emit('interact', null, 0);
    L.hide();
    this.state = 'playing';
    this.input.enabled = true;
    this.input.enableTouch(this.isTouch);
    document.body.classList.add('playing');
    this.audio.startAmbient();
    if (mode === 'mission') this.hud.intro();
    this.input.requestLock();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.exitLock();
    this.clickToPlay.hidden = true;
    this.menus.showPause();
  }

  resume() {
    this.menus.hideAll();
    this.state = 'playing';
    this.input.requestLock();
  }

  respawn() {
    this.menus.hideAll();
    this.effects.add.clear();
    this.effects.smoke.clear();
    this.mission.restoreCheckpoint();
    this.hud.setHealth(this.player.health.hp, this.player.health.max);
    this.state = 'playing';
    this.input.requestLock();
  }

  toMenu() {
    this.menus.hideAll();
    this.audio.stopAmbient();
    this.audio.startMenuMusic();
    this.showMenu();
  }

  // --- Oyun olayları ---
  makeNoise(pos, radius, type) {
    this.enemies.onNoise(pos, radius, type);
  }

  explode(pos, radius, damage, owner, scale = 1) {
    this.stats.explosions++;
    this.effects.explosion(pos, scale);
    this.audio.explosion(pos, scale);
    applyRadialDamage(this, pos, radius, damage, owner);
    this.mission?.onExplosion?.(pos, radius, damage, owner);
    this.makeNoise(pos, 90, 'explosion');
    // Yakındaki patlama görüşü beyazlatır
    const d = pos.distanceTo(this.player.pos);
    if (d < radius * 2.5) this.player.shake(clamp(1 - d / (radius * 2.5), 0, 1));
  }

  addScore(pts, label, head = false) {
    this.stats.score += pts;
    this.events.emit('score', pts, label, head);
  }

  onEnemyKilled(enemy, info) {
    if (info.source === 'player') {
      this.stats.kills++;
      const head = info.zone === 'head';
      if (head) this.stats.headshots++;
      if (info.weapon !== 'melee') this.addScore(SCORE.kill + (head ? SCORE.headshot : 0), head ? 'KAFA VURUŞU' : 'ETKİSİZ', head);
    }
    if (this.mode === 'mission' && Math.random() < 0.5) this.mission.spawnPouch(enemy.pos);
    this.events.emit('enemyKilled', enemy, info);
  }

  onPlayerDeath() {
    this.stats.deaths++;
    this.state = 'dying';
    this.deathT = 0;
    this.audio.hurt();
  }

  onMissionComplete() {
    this.state = 'victory';
    this.stats.time = this.mission.time;
    this.input.exitLock();
    this.clickToPlay.hidden = true;
    this.hud.show(false);
    this.input.enableTouch(false);
    // Sonraki seviyenin kilidi açılır; en iyi puan saklanır
    const lv = this.level;
    const P = this.progress;
    const firstClear = P.unlocked <= lv.id && lv.id < LEVELS.length;
    P.unlocked = Math.max(P.unlocked, Math.min(LEVELS.length, lv.id + 1));
    const prev = P.best[lv.id];
    if (!prev || this.stats.score > prev.score) P.best[lv.id] = { score: this.stats.score, time: Math.round(this.stats.time), diff: this.difficultyKey };
    storage.set(PROGRESS_KEY, P);
    const next = LEVELS.find((l) => l.id === lv.id + 1) || null;
    this.menus.showVictory(this.stats, DIFFICULTY[this.difficultyKey]?.label || '', lv, next, firstClear);
  }

  // Konsol ve testler için: tüm seviyeleri aç
  unlockAllLevels() {
    this.progress.unlocked = LEVELS.length;
    storage.set(PROGRESS_KEY, this.progress);
  }

  findInteractable(eye, fwd) {
    return this.mission ? this.mission.findInteractable(eye, fwd) : null;
  }

  addDebris(mesh, vel, radius = 0.1) {
    this.debris.push({ mesh, vel, radius, spin: new THREE.Vector3(rand(-8, 8), rand(-8, 8), rand(-8, 8)), rest: false });
    if (this.debris.length > 20) {
      const old = this.debris.shift();
      old.mesh.removeFromParent();
    }
  }

  updateDebris(dt) {
    for (const d of this.debris) {
      if (d.rest) continue;
      d.vel.y -= 14 * dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      d.mesh.rotation.x += d.spin.x * dt;
      d.mesh.rotation.z += d.spin.z * dt;
      if (d.mesh.position.y < d.radius) {
        d.mesh.position.y = d.radius;
        d.vel.y *= -0.35;
        d.vel.x *= 0.6;
        d.vel.z *= 0.6;
        d.spin.multiplyScalar(0.5);
        if (Math.abs(d.vel.y) < 0.4) d.rest = true;
      }
    }
  }

  // Konsol: seviyenin n. hedefine atla (test amaçlı)
  debugSkipTo(n) {
    this.menus.hideAll();
    this.state = 'playing';
    this.mission.skipTo(n);
  }

  // --- Ana döngü ---
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const last = this.lastNow ?? now;
    this.lastNow = now;
    let dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    dt *= this.timeScale;
    const I = this.input;
    try {
      I.pollGamepad(dt, this.settings.sensitivity);
      if (I.pressed('console') && (this.state === 'playing' || this.state === 'paused')) this.console.toggle();
      switch (this.state) {
        case 'menu':
          this.updateMenu(dt);
          break;
        case 'playing':
        case 'dying':
          this.updatePlaying(dt);
          break;
        case 'paused':
        case 'dead':
        case 'victory':
          this.renderFrame();
          break;
        default:
          break;
      }
      this.errorStreak = 0;
    } catch (err) {
      console.error(err);
      this.lastError = err;
      // Her karede tekrarlayan hata oyunu dondurur: sessiz kalmak yerine ekrana yaz
      this.errorStreak = (this.errorStreak || 0) + 1;
      if (this.errorStreak === FRAME_ERROR_LIMIT) {
        this.state = 'error';
        this.input.exitLock();
        loadingScreen().fail('Oyun döngüsü durdu', err, 'Ana menüye dönüp yeniden dene.', true);
      }
    }
    I.endFrame();
  }

  updateMenu(dt) {
    this.time += dt;
    this.menuT = (this.menuT || 0) + dt;
    const t = this.menuT;
    const cam = this.camera;
    cam.position.set(Math.sin(t * 0.04) * 55, 20 + Math.sin(t * 0.09) * 5, 10 + Math.cos(t * 0.04) * 80);
    cam.lookAt(Math.sin(t * 0.03) * 12, 2, -20 + Math.sin(t * 0.05) * 30);
    if (Math.abs(cam.fov - 55) > 0.1) {
      cam.fov = 55;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
    this.audio.setListener(cam.position.x, cam.position.y, cam.position.z, 0);
    if (this.mission.aa) for (const a of this.mission.aa) a.update(dt);
    this.effects.update(dt, cam.position);
    this.followSun(cam.position);
    this.effects.setScale(this.height * this.renderer.getPixelRatio(), cam.fov);
    this.renderer.clear();
    this.renderer.render(this.scene, cam);
  }

  updatePlaying(dt) {
    const I = this.input;
    this.time += dt;
    if (this.state === 'playing' && I.pressed('pause') && !this.console.open) {
      this.pause();
      this.renderFrame();
      return;
    }
    const canAct = this.player.alive && !this.console.open && this.state === 'playing';
    if (this.console.open) I.consumeLook();
    this.player.update(dt, canAct ? I : NULL_INPUT);
    this.player.applyCamera(this.camera, dt);
    this.camera.updateMatrixWorld();
    this.weapons.update(dt, canAct ? I : NULL_INPUT, canAct);
    this.enemies.update(dt);
    this.allies.update(dt);
    this.grenades.update(dt);
    this.mission.update(dt);
    this.updateDebris(dt);
    this.effects.update(dt, this.camera.position);
    this.effects.setScale(this.height * this.renderer.getPixelRatio(), this.camera.fov);
    this.viewmodel.update(dt);
    this.hud.update(dt);
    this.audio.updateAmbient();
    this.stats.time = this.mission.time;
    const lockMissing = this.state === 'playing' && !I.locked && !I.lockFailed && !I.touch.active && !this.console.open;
    this.clickToPlay.hidden = !lockMissing;
    if (this.state === 'dying') {
      this.deathT += dt;
      if (this.deathT > 2.2) {
        this.state = 'dead';
        this.input.exitLock();
        this.clickToPlay.hidden = true;
        this.menus.showDeath(this.mission.randomTip());
      }
    }
    this.renderFrame();
  }

  followSun(center) {
    const sun = this.sun;
    const snap = 2;
    const cx = Math.round(center.x / snap) * snap;
    const cz = Math.round(center.z / snap) * snap;
    sun.target.position.set(cx, 0, cz);
    sun.position.set(cx + this.sunDir.x * 150, this.sunDir.y * 150, cz + this.sunDir.z * 150);
    this.sky.position.copy(this.camera.position);
  }

  renderFrame() {
    const r = this.renderer;
    this.followSun(this.player.pos);
    r.clear();
    r.render(this.scene, this.camera);
    if (this.mode !== 'menu' && this.player.alive && this.state !== 'victory') this.viewmodel.render(r);
  }
}

// Konsol açıkken ya da ölüyken oyuncu girdisi yok
const NULL_INPUT = {
  isDown: () => false,
  pressed: () => false,
  released: () => false,
  move: () => ({ x: 0, y: 0 }),
  consumeLook: () => ({ dx: 0, dy: 0 }),
  touch: { active: false, sprint: false },
};

async function boot() {
  const L = loadingScreen();
  L.step('Grafik sistemi başlatılıyor', 0.15);
  await nextPaint();
  let game;
  try {
    game = new Game();
  } catch (err) {
    const webgl = /webgl|context/i.test(String(err && err.message));
    L.fail(
      webgl ? '3B grafik açılamadı' : 'Oyun başlatılamadı',
      err,
      webgl
        ? 'Tarayıcı WebGL grafik bağlamı oluşturamadı. Donanım hızlandırmayı açıp, açık oyun sekmelerini kapatıp yeniden dene.'
        : null
    );
    return;
  }
  window.__game = game;
  try {
    L.step('Asker modelleri yükleniyor', 0.4);
    await nextPaint();
    await game.loadCharacters();
    L.step('Harita inşa ediliyor', 0.6);
    await nextPaint();
    game.showMenu();
    L.step('Gölgelendiriciler derleniyor', 0.85);
    await nextPaint();
    await game.precompile();
  } catch (err) {
    L.fail('Oyun başlatılamadı', err);
    return;
  }
  L.ready();
  requestAnimationFrame((t) => game.frame(t));
  // İlk tıklamada menü müziği
  const startAudio = () => {
    game.audio.init();
    if (game.state === 'menu') game.audio.startMenuMusic();
    window.removeEventListener('pointerdown', startAudio);
    window.removeEventListener('keydown', startAudio);
  };
  window.addEventListener('pointerdown', startAudio);
  window.addEventListener('keydown', startAudio);
  window.claude?.hot?.snapshot?.(() => ({ settings: game.settings }));
  void saveSettings;
}

// Artifact çalışma ortamı sıcak yeniden yükleme için hot.ready sunar; geri çağrı gelmezse
// oyun yine de açılsın diye kısa bir süre sonra kendimiz başlatırız (bir kez).
let started = false;
function start() {
  if (started) return;
  started = true;
  boot();
}
const hot = typeof window !== 'undefined' ? window.claude?.hot : null;
if (hot?.ready) {
  hot.ready(start);
  setTimeout(start, HOT_READY_FALLBACK_MS);
} else start();
