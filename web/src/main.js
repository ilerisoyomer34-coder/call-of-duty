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
import { preloadSoldier, setSoldierEnvironment } from './soldier.js';
import { loadSettings, resolveQuality, saveSettings } from './settings.js';
import { DIFFICULTY, SCORE, LEVELS, MAPS, RENDER, WEAPONS, BALANCE, TREES } from './config.js';
import { setMaxAnisotropy, loadPropAsset, PROP_ASSETS } from './assets.js';
import { AllyManager } from './ally.js';
import { setHelicopterProp, setPropEnvironment, setTreeProp, setContainerProp } from './models.js';
import { warnOnce } from './util.js';
import { getSave } from './save.js';
import { EconomySystem } from './economy.js';
import { LoadoutSystem } from './loadout.js';
import { KitSystem } from './kit.js';
import { setRealNames } from './weaponInfo.js';
import { levelMission, MissionTracker, computeRewards, mergeRecord } from './missionSystem.js';
import { MissionHud } from './missionUi.js';
import { CommandSystem, SHORTCUTS } from './commands.js';
import { CommandWheel } from './commandWheel.js';
import { PingSystem } from './ping.js';
import { RadioChat, VoiceCommand } from './radioChat.js';
import { EV } from './events.js';
import { applyBindingOverrides } from './input.js';
import { setupPwa } from './pwa.js';
import { SocialClient } from './net/social.js';
import { OnlineScreen } from './onlineScreen.js';
import { GameClient } from './net/gameClient.js';
import { MatchHud, modeTitle } from './net/matchHud.js';
import { NetGraph } from './netGraph.js';
import ARENAS from './data/arenas.json' with { type: 'json' };
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
uniform vec3 glowCol;
uniform vec3 discCol;
uniform vec3 bandCol;
uniform float stars;
varying vec3 vDir;
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.55));
  col = mix(col, ground, clamp(-h * 6.0, 0.0, 1.0));
  float s = max(dot(d, sunDir), 0.0);
  col += glowCol * pow(s, 8.0) * 0.55;
  col += discCol * pow(s, 900.0) * 6.0;
  // Ufuk çizgisinde bant (şafakta sıcak, gecede rafineri ışıklarının turuncu yansıması)
  col += bandCol * exp(-abs(h) * 14.0) * (0.4 + 0.6 * pow(s, 2.0));
  // Gece: seyrek yıldızlar (yönün hücresine göre sabit, kamera dönünce kaymaz)
  if (stars > 0.0 && h > 0.05) {
    float st = hash(floor(d * 260.0));
    col += vec3(0.8, 0.85, 1.0) * step(0.9975, st) * stars * clamp(h * 4.0, 0.0, 1.0) * (0.5 + 0.5 * hash(floor(d * 90.0)));
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

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
// Seviye ilerlemesi: açılan son seviye ve her seviyenin en iyi sonucu. Ortak kaydın (save.js) progress
// nesnesinin kendisi döner: oyun onu değiştirip saveProgress ile yazar
function loadProgress(save) {
  const P = save.data.progress;
  P.unlocked = clamp(Math.floor(P.unlocked || 1), 1, LEVELS.length);
  if (!P.best || typeof P.best !== 'object') P.best = {};
  return P;
}

// Seviyenin zorluk çarpanları seçilen temel zorluğun (Acemi/Asker/Gazi) üstüne uygulanır.
// Haritanın görüş koşulu (gece, kar) düşman algısını ayrıca kısar
function levelDifficulty(base, level) {
  const t = level?.tuning;
  if (!t) return base;
  const seeing = MAPS[level.map]?.env.perception ?? 1;
  return {
    ...base,
    reaction: base.reaction * t.reaction,
    aimMult: base.aimMult * t.aim,
    damageMult: base.damageMult * t.damage,
    perception: base.perception * t.perception * seeing,
    awarenessRate: base.awarenessRate * t.awareness,
    maxAttackers: clamp(base.maxAttackers + t.attackers, 1, 4),
    grenades: base.grenades && t.grenades,
    dpsCap: base.dpsCap * t.damage,
  };
}

export class Game {
  constructor() {
    this.events = new Emitter();
    // Ortak kayıt (kredi, envanter, teçhizat, ilerleme, ayarlar) ve kredi hareketlerinin tek giriş noktası
    this.save = getSave();
    this.economy = new EconomySystem(this.save, this.events);
    this.settings = loadSettings();
    applyBindingOverrides(this.settings.bindings);
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
    this.progress = loadProgress(this.save);
    this.level = LEVELS[0];
    this.barrels = [];
    this.debris = [];
    this.sunDir = new THREE.Vector3(0.82, 0.3, -0.22).normalize();
    this.env = MAPS.kizilkum.env;

    const hi = this.quality === 'high';
    // Tuval kenar yumuşatmalı: eller ve silah doğrudan tuvale tam çözünürlükte çizilir. 'Düşük' kalite bilinçli
    // performans modudur (zayıf GPU'da tuval MSAA'sı kareyi yarıya indirir); telefonlar artık 'orta'dan başlar
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: this.quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.autoClear = false;
    this.renderer.shadowMap.enabled = this.quality !== 'low';
    this.renderer.shadowMap.type = hi ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;

    this.camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 1200);
    this.camera.rotation.order = 'YXZ';
    // Anizotropi kaliteye göre: zemin tüm ekranı kapladığı için zayıf GPU'da 16× örnekleme kareyi belirgin yavaşlatır
    const aniso = Math.min(this.renderer.capabilities.getMaxAnisotropy(), RENDER.anisotropy[this.quality] || 4);
    setMaxAnisotropy(aniso);
    this.textures = createTextures(this.quality, aniso);
    this.worldRT = null;
    this.worldPR = 1;
    this.blit = createBlit();
    this.audio = new Audio();
    this.input = new Input(this.canvas, document.getElementById('touch'));
    this.player = new Player(this);
    this.viewmodel = new Viewmodel(this, this.textures);
    this.applyEnvironment('kizilkum');
    // Teçhizat (silahlar, zırh, kask, sarf yuvaları) kayıtta; kurallar loadout.js. Sarf yuvaları görevde kit.js.
    this.loadouts = new LoadoutSystem(this.save);
    this.kit = new KitSystem(this);
    this.hud = new HUD(this);
    // Bonus görevler (missionSystem.js) ve takipçisi; görev başında kurulur, sonunda ödül hesaplanır
    this.missionHud = new MissionHud(this);
    // Tim komutları (commands.js): kısayollar F1–F5, F8, F9; komut çarkı (T) ve bağlamsal işaret (Z)
    this.commands = new CommandSystem(this);
    this.wheel = new CommandWheel(this);
    this.ping = new PingSystem(this);
    // Telsiz kutusu (sol alt; Enter ile yazılı komut) ve isteğe bağlı sesli komut (N)
    this.chat = new RadioChat(this);
    this.voice = new VoiceCommand(this.chat);
    this.voice.refresh(this.settings);
    this.run = null; // { mission, tracker, record, levelId, difficulty }
    // Çevrim içi sosyal katman (arkadaşlar, bildirimler, parti): menülerden önce, ekranlar olayları dinler
    this.social = new SocialClient(this);
    this.menus = new Menus(this);
    this.online = new OnlineScreen(this, this.menus);
    // Çevrim içi maç (S4–S6): bağlantı game.net (maçtayken), arayüz ve ağ ölçüm paneli
    this.net = null;
    this.matchHud = new MatchHud(this);
    this.netGraph = new NetGraph(this);
    this.events.on(EV.MATCH_FOUND, (m) => this.onMatchFound(m));
    this.console = new DevConsole(this);

    this.input.onLockChange = (locked, selfExit) => {
      // Telsiz satırı kapanırken istenen kilit satır yeniden açıldıktan sonra gelebilir: yazarken imleç serbest
      // kalsın (kilitliyken Esc tarayıcıya gider, satırı kapatamaz)
      if (locked && this.chat?.open) {
        this.input.exitLock();
        return;
      }
      // Konsol ve telsiz satırı imleci bilerek serbest bırakır: o zaman duraklatma
      if (!locked && !selfExit && this.state === 'playing' && !this.console.open && !this.chat?.open && !this.input.touch.active) this.pause();
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

  // Hazır araç modelleri (Sketchfab): gelmezse prosedürel modelle devam edilir; açılışı bekletmesin diye kısa süre sınırı
  async loadProps() {
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('zaman aşımı')), CHARACTER_TIMEOUT_MS));
    try {
      const scene = await Promise.race([loadPropAsset('helicopter'), timeout]);
      setHelicopterProp(scene, PROP_ASSETS.helicopter);
    } catch (err) {
      warnOnce('heli-model', `Helikopter modeli yüklenemedi, basit model kullanılıyor (${err.message})`);
    }
    // Ağaç (Sketchfab çamı): haritalardaki tüm ağaçlar; gelmezse prosedürel ağaç
    try {
      const scene = await Promise.race([loadPropAsset('pine'), timeout]);
      setTreeProp(scene, PROP_ASSETS.pine, TREES.alphaTest);
    } catch (err) {
      warnOnce('tree-model', `Ağaç modeli yüklenemedi, basit ağaç kullanılıyor (${err.message})`);
    }
    // Konteyner (Sketchfab, beş renk): haritalardaki tüm konteynerler; gelmezse kutu konteyner
    try {
      const scene = await Promise.race([loadPropAsset('containers'), timeout]);
      setContainerProp(scene, PROP_ASSETS.containers);
    } catch (err) {
      warnOnce('container-model', `Konteyner modeli yüklenemedi, basit konteyner kullanılıyor (${err.message})`);
    }
  }

  // Gölgelendiricileri yükleme ekranı açıkken derle: ilk karede telefonda saniyelerce donma olmasın.
  // KHR_parallel_shader_compile yoksa derleme yine olur ama zaman aşımı sonsuz beklemeyi önler.
  precompile() {
    // Süren derleme bitmeden sahne değişirse (malzemeler atılırsa) three.js zamanlayıcısı çöker:
    // startMode bu sözü bekler
    this.compiling = this.precompileNow();
    return this.compiling;
  }

  async precompileNow() {
    const r = this.renderer;
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    try {
      this.camera.updateMatrixWorld();
      // Zaman aşımı kazansa da derleme arka planda sürer: bitene dek bu sahnenin malzemeleri atılmaz
      // Dünya ara hedefe çiziliyorsa gölgelendiriciler o hedefin ayarlarıyla (ton eşlemesiz) derlenmeli
      r.setRenderTarget(this.worldRT);
      const p = r.compileAsync(this.scene, this.camera);
      r.setRenderTarget(null);
      this.sceneCompile = p;
      p.then(() => {
        if (this.sceneCompile === p) this.sceneCompile = null;
      });
      await Promise.race([p, wait(PRECOMPILE_TIMEOUT_MS)]);
      if (this.mode !== 'menu') await Promise.race([r.compileAsync(this.viewmodel.scene, this.viewmodel.camera), wait(PRECOMPILE_TIMEOUT_MS / 2)]);
    } catch (err) {
      warnOnce('precompile', `Gölgelendirici ön derlemesi atlandı (${err.message})`);
    }
  }

  // Silahların metal yüzeyleri için haritanın gökyüzünden ortam yansıma haritası
  buildEnvMap(env = MAPS.kizilkum.env) {
    const envScene = new THREE.Scene();
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(10, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: {
          ...skyUniforms(env.sky, this.sunDir),
          zenith: { value: new THREE.Color(env.reflect[0]) },
          horizon: { value: new THREE.Color(env.reflect[1]) },
          ground: { value: new THREE.Color(env.reflect[2]) },
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
    sky.geometry.dispose();
    sky.material.dispose();
    return tex;
  }

  // Harita değişince yansıma haritası, silah görünümü ışıkları ve pozlama yeni ortama uyar
  applyEnvironment(key) {
    const env = MAPS[key]?.env || MAPS.kizilkum.env;
    this.env = env;
    this.sunDir.set(env.sunDir[0], env.sunDir[1], env.sunDir[2]).normalize();
    this.renderer.toneMappingExposure = env.exposure;
    if (this.envKey !== key) {
      this.envKey = key;
      this.envMap?.dispose();
      this.envMap = this.buildEnvMap(env);
      this.viewmodel.setEnvironment(this.envMap);
      this.viewmodel.setLighting(env.view);
    }
    setSoldierEnvironment(this.envMap, this.renderer.shadowMap.enabled && (this.renderQuality || 'medium') !== 'low');
    setPropEnvironment(this.envMap);
    return env;
  }

  freshStats() {
    return { kills: 0, headshots: 0, shots: 0, hits: 0, deaths: 0, score: 0, time: 0, grenades: 0, damageTaken: 0, explosions: 0, ttd: [] };
  }

  enableTouch() {
    this.isTouch = true;
    document.body.classList.add('touch');
    if (this.state === 'playing') this.input.enableTouch(true);
  }

  applySettings() {
    const S = this.settings;
    setRealNames(S.realNames);
    if (this.weapons?.current) this.events.emit('weapon', this.weapons.current);
    this.audio.setVolumes({ master: S.masterVolume, sfx: S.sfxVolume, ambient: S.ambientVolume });
    this.hud.applySettings(S);
    this.voice?.refresh(S);
    if (this.effects) this.effects.bloodOn = S.blood;
    const q = resolveQuality(S.quality, this.isTouch);
    this.renderQuality = q;
    if (this.sun) this.sun.castShadow = q !== 'low' && this.renderer.shadowMap.enabled;
    if (this.envMap) setSoldierEnvironment(this.envMap, q !== 'low' && this.renderer.shadowMap.enabled);
    this.resize();
  }

  // Tuval tam cihaz çözünürlüğünde (eller ve silah); dünya kaliteye ve "Dünya çözünürlüğü" ayarına göre
  // ölçekli hedefe çizilir. Dünya tam çözünürlükteyse ara hedef kullanılmaz (ek maliyet yok).
  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.width = w;
    this.height = h;
    const dpr = window.devicePixelRatio || 1;
    const canvasPR = Math.min(dpr, RENDER.maxPixelRatio);
    const q = this.renderQuality || resolveQuality(this.settings.quality, this.isTouch);
    const scale = this.settings.renderScale;
    const table = this.isTouch ? RENDER.touchWorldPixelRatio : RENDER.worldPixelRatio;
    const worldPR = Math.min(canvasPR, scale === 'auto' || !scale ? Math.min(dpr, table[q]) : canvasPR * parseFloat(scale));
    this.renderer.setPixelRatio(canvasPR);
    this.renderer.setSize(w, h, false);
    this.worldPR = worldPR;
    const rw = Math.max(1, Math.round(w * worldPR));
    const rh = Math.max(1, Math.round(h * worldPR));
    if (worldPR < canvasPR - 0.01) {
      const samples = RENDER.msaa[q];
      if (!this.worldRT || this.worldRT.samples !== samples) {
        this.worldRT?.dispose();
        this.worldRT = new THREE.WebGLRenderTarget(rw, rh, { type: THREE.HalfFloatType, samples });
        this.blit.material.uniforms.tDiffuse.value = this.worldRT.texture;
      } else this.worldRT.setSize(rw, rh);
    } else if (this.worldRT) {
      this.worldRT.dispose();
      this.worldRT = null;
    }
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewmodel.resize(w / h);
    if (this.effects) this.effects.setScale(h * worldPR, this.camera.fov);
  }

  // Dünyayı çiz: ölçekli hedefe (ton eşleme yok, doğrusal HDR), sonra tam ekran dörtgenle tuvale
  // (ACES + sRGB burada). Ölçek 1 ise doğrudan tuvale.
  drawWorld(cam) {
    const r = this.renderer;
    if (this.worldRT) {
      r.setRenderTarget(this.worldRT);
      r.clear();
      r.render(this.scene, cam);
      r.setRenderTarget(null);
      r.clear();
      r.render(this.blit.scene, this.blit.camera);
    } else {
      r.clear();
      r.render(this.scene, cam);
    }
  }

  // --- Sahne kurulumu ---
  // Menü ve poligon Kızılkum'u kullanır; görev seviyesi kendi haritasının ortamını
  mapKey(mode) {
    if (mode === 'online') return ARENAS[this.net?.welcome?.map]?.env || 'harbor';
    return mode === 'mission' ? this.level.map || 'kizilkum' : 'kizilkum';
  }

  buildScene(mode) {
    if (this.scene) this.disposeScene();
    const env = this.applyEnvironment(this.mapKey(mode));
    const scene = new THREE.Scene();
    this.scene = scene;
    const horizon = new THREE.Color(env.sky.horizon);
    scene.fog = new THREE.Fog(horizon, env.fog[0], env.fog[1]);
    scene.background = horizon;
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(900, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: skyUniforms(env.sky, this.sunDir),
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
    const hemi = new THREE.HemisphereLight(env.hemi[0], env.hemi[1], env.hemi[2]);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(env.sun[0], env.sun[1]);
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
    // Menü arka planı Kızılkum'un köy bölümü (toplar göğe ateş eder)
    this.mission = new Mission(this, mode, mode === 'mission' ? this.level : MENU_LEVEL);
    if (env.weather) this.effects.addEmitter(weatherEmitter(env.weather, this));
    this.resize();
  }

  disposeScene() {
    this.scene.traverse((o) => {
      if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose();
    });
    if (this.world) {
      const mats = Object.values(this.world.materials);
      const dispose = () => mats.forEach((m) => m.dispose());
      if (this.sceneCompile) this.sceneCompile.then(dispose);
      else dispose();
      this.sceneCompile = null;
    }
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
    this.menus.needName();
    this.social.setPresence('menu');
    this.menus.notice(this.pendingNotice);
    this.pendingNotice = null;
  }

  buildMenuWorld() {
    // Görev haritası, düşmansız (yalnızca uçaksavarlar göğe ateş eder)
    const M = this.mission;
    M.mode = 'mission';
    M.build();
    this.enemies.clear();
    this.allies.clear();
    for (const a of M.aa || []) a.gunner = null; // nişancısız toplar göğe ateş etmeyi sürdürür
    M.objectives = [];
    M.radioQueue.length = 0;
    M.interactables.length = 0;
    this.menuT = 0;
  }

  // Bonus görev takibi: görev başında kurulur (tekrar oynamada ayara göre farklı bonuslar)
  startRun(mode) {
    this.commands.clear();
    this.wheel.close(false);
    this.ping.clear();
    this.chat.clear();
    this.run?.tracker.dispose();
    this.run = null;
    this.missionHud.hide();
    if (mode !== 'mission') return;
    const id = String(this.level.id);
    const record = this.save.data.missions[id] || null;
    const mission = levelMission(id, { reroll: !!this.settings.rerollBonuses && !!record?.completed });
    if (!mission) return;
    const tracker = new MissionTracker(this.events, mission, (i, kind) => this.missionHud.onChange(i, kind));
    this.run = { mission, tracker, record, levelId: id, difficulty: this.difficultyKey };
    this.missionHud.setup(mission, tracker, record, this.difficultyKey);
    this.events.emit(EV.MISSION_STARTED, { missionId: id, difficulty: this.difficultyKey });
  }

  // Görev sonu: bonuslar onaylanır, kredi verilir, sonuç kayda yazılır → ödül dökümü
  settleRun(success) {
    const R = this.run;
    if (!R) return null;
    this.run = null;
    this.missionHud.hide();
    const timeSec = this.mission.time;
    const results = R.tracker.finish(success, timeSec);
    const rw = computeRewards({ mission: R.mission, success, results, kills: this.stats.kills, difficulty: R.difficulty, record: R.record });
    if (rw.total > 0) this.economy.add(rw.total, success ? `Görev ${R.levelId} ödülü` : `Görev ${R.levelId} teselli`);
    this.save.update((d) => {
      d.missions[R.levelId] = mergeRecord(d.missions[R.levelId], { success, stars: rw.stars, results, timeSec });
      if (success) d.stats.missionsCompleted = (d.stats.missionsCompleted || 0) + 1;
      d.stats.kills = (d.stats.kills || 0) + this.stats.kills;
      // Yere düşme süreleri (§10): son örnekler ve ortalaması denge izlemesi için kayıtta
      if (this.stats.ttd.length) {
        d.stats.ttdSamples = [...(d.stats.ttdSamples || []), ...this.stats.ttd].slice(-BALANCE.ttdKeep);
        d.stats.ttdAvg = Math.round((d.stats.ttdSamples.reduce((a, b) => a + b, 0) / d.stats.ttdSamples.length) * 100) / 100;
      }
    }, { now: true });
    const ttd = this.stats.ttd.length ? this.stats.ttd.reduce((a, b) => a + b, 0) / this.stats.ttd.length : null;
    this.events.emit(EV.MISSION_ENDED, { missionId: R.levelId, success, timeSec, total: rw.total, stars: rw.stars, ttdAvg: ttd });
    return { ...rw, results };
  }

  // Bonus görev "Baskı Ustası": düşman timin baskı ateşi altında mı öldü?
  squadSuppressing(enemy) {
    return this.allies.isSuppressing(enemy);
  }

  // Kayıttaki teçhizat: { primary, secondary, armor, helmet, slots }
  get loadout() {
    return this.save.data.loadout;
  }

  setLoadout(primary, secondary) {
    this.loadouts.selectWeapon('primary', primary);
    this.loadouts.selectWeapon('secondary', secondary);
  }

  async startMode(mode, diffKey = 'normal', levelId = this.level.id) {
    await this.compiling;
    // Arkadaşlar "oyunda" görür
    this.social.setPresence('playing');
    this.audio.init();
    this.audio.stopMenuMusic();
    this.menus.hideAll();
    const L = loadingScreen();
    const level = LEVELS.find((l) => l.id === levelId) || LEVELS[0];
    const mapName = mode === 'mission' ? MAPS[level.map]?.name : 'Atış Poligonu';
    L.show(`${(mapName || 'Harita').toLocaleUpperCase('tr-TR')} İNŞA EDİLİYOR`);
    this.state = 'loading';
    try {
      L.step('Harita ve düşmanlar yerleştiriliyor', 0.25);
      await nextPaint();
      this.mode = mode;
      this.difficultyKey = diffKey;
      this.level = level;
      const base = DIFFICULTY[diffKey] || DIFFICULTY.normal;
      this.difficulty = mode === 'mission' ? levelDifficulty(base, this.level) : base;
      this.stats = this.freshStats();
      this.cheats.god = false;
      this.buildScene(mode);
      this.mission.build();
      L.step('Teçhizat hazırlanıyor', 0.6);
      await nextPaint();
      this.startRun(mode);
      // Sarf yuvaları silahlardan önce: satın alınmış el bombaları bomba sayısına eklenir
      this.kit.reset(mode === 'mission' ? this.loadouts.missionKit() : null);
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
    this.hud.resetTransient();
    this.hud.show(true);
    this.hud.setHealth(this.player.health.hp, this.player.health.max);
    this.events.emit('interact', null, 0);
    L.hide();
    this.state = 'playing';
    this.input.enabled = true;
    this.input.enableTouch(this.isTouch);
    document.body.classList.add('playing');
    this.audio.startAmbient(this.env.ambient);
    if (mode === 'mission') this.hud.intro();
    this.input.requestLock();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    // Açık komut çarkı ve telsiz satırı duraklatma ekranında asılı kalmasın
    this.wheel.close(false);
    this.chat.closeChat();
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
    if (this.net) return this.leaveOnline();
    // Görev yarıda bırakıldı: bonus yok, öldürme başına teselli (§6.3)
    const rw = this.state !== 'victory' ? this.settleRun(false) : null;
    this.menus.hideAll();
    this.pendingNotice = rw && rw.total > 0 ? `Görev yarıda kaldı · teselli ödülü +${rw.total.toLocaleString('tr-TR')} KR` : null;
    this.audio.stopAmbient();
    this.audio.startMenuMusic();
    this.showMenu();
  }

  // --- Çevrim içi maç (S4–S6) ---
  // Eşleşme ya da takım liderinin deneme odası: menüdeyse doğrudan katıl, oyundaysa kart göster
  onMatchFound(m) {
    if (this.net || !m) return;
    if (this.state === 'menu') this.joinMatch(m);
    else this.online.toast({ id: `mf${m.room}`, kind: 'match_found', payload: m, live: true });
  }

  joinMatch(m) {
    if (this.net || this.state === 'loading') return;
    if (this.mode !== 'menu') {
      // Tek oyunculu görev yarıda kalır (teselli ödülü, toMenu ile aynı)
      this.settleRun(false);
      this.audio.stopAmbient();
      this.menus.hideAll();
    }
    this.startOnline(m);
  }

  // Maçtaki silahlar: sunucunun onayladığı teçhizat (roket ve el bombası yok)
  onlineLoadout() {
    const W = this.net?.welcome;
    const p = W?.primary || 'rifle';
    const s = W?.secondary || 'pistol';
    return { weapons: { [p]: null, [s]: null }, slots: [p, s], grenades: 0, current: p };
  }

  matchTitle() {
    const W = this.net?.welcome;
    if (!W) return '';
    return `${modeTitle(W.mode)} · ${ARENAS[W.map]?.name || W.map}`;
  }

  async startOnline(match) {
    if (this.net || this.state === 'loading') return;
    await this.compiling;
    this.audio.init();
    this.audio.stopMenuMusic();
    this.menus.hideAll();
    const L = loadingScreen();
    L.show(match.kind === 'sandbox' ? 'DENEME ODASI' : 'MAÇA BAĞLANILIYOR');
    this.state = 'loading';
    L.step('Sunucuya bağlanılıyor', 0.1);
    const net = new GameClient(this, match);
    try {
      await net.connect();
    } catch (e) {
      net.close();
      L.fail(e.title || 'Bağlanılamadı', null, e.text, true);
      return;
    }
    this.net = net;
    this.social.setPresence('playing');
    try {
      L.step('Arena kuruluyor', 0.35);
      await nextPaint();
      this.mode = 'online';
      this.difficultyKey = 'normal';
      this.difficulty = DIFFICULTY.normal;
      this.stats = this.freshStats();
      this.cheats.god = false;
      this.cheats.infiniteAmmo = false;
      this.timeScale = 1;
      this.startRun('online');
      this.buildScene('online');
      this.mission.build();
      this.kit.reset(null);
      this.weapons.reset(this.onlineLoadout());
      this.hud.bakeMinimap();
      this.player.applyCamera(this.camera, 0);
      L.step('Gölgelendiriciler derleniyor', 0.8);
      await nextPaint();
      await this.precompile();
    } catch (err) {
      this.net = null;
      net.leave();
      L.fail('Arena açılamadı', err, 'Ana menüye dönüp yeniden dene.', true);
      return;
    }
    if (net.state === 'closed') {
      // Yüklenirken bağlantı koptu
      this.net = null;
      const e = net.error || { title: 'Bağlantı koptu', text: 'Sunucuyla bağlantı kesildi.' };
      L.fail(e.title, null, e.text, true);
      return;
    }
    this.hud.resetTransient();
    this.hud.show(true);
    this.hud.setHealth(this.player.health.hp, this.player.health.max);
    this.events.emit('interact', null, 0);
    L.hide();
    this.state = 'playing';
    this.input.enabled = true;
    this.input.enableTouch(this.isTouch);
    document.body.classList.add('playing');
    this.audio.startAmbient(this.env.ambient);
    this.matchHud.start(net);
    net.ready();
    this.input.requestLock();
  }

  // Bağlantı koptu ya da oda kapandı. Maç bittiyse sonuç ekranı kalır (oyuncu düğmeyle döner)
  onNetClosed(err) {
    const net = this.net;
    if (!net) return;
    if (net.result) return;
    if (this.state === 'loading') return; // startOnline yüklemeden sonra görür
    this.leaveOnline(err);
  }

  leaveOnline(err = null) {
    const net = this.net;
    if (!net) return;
    this.net = null;
    const r = net.result;
    net.leave();
    this.matchHud.stop();
    this.menus.hideAll();
    this.audio.stopAmbient();
    this.audio.startMenuMusic();
    if (err) this.pendingNotice = `${err.title}: ${err.text}`;
    else if (r) this.pendingNotice = `Maç bitti · ${this.stats.kills} öldürme`;
    else this.pendingNotice = null;
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
    const byPlayer = info.source === 'player';
    this.events.emit(EV.ENEMY_KILLED, {
      enemy,
      weaponId: info.weapon,
      slot: byPlayer ? WEAPONS[info.weapon]?.category || (info.weapon === 'melee' ? 'melee' : 'other') : null,
      headshot: info.zone === 'head',
      distance: enemy.pos.distanceTo(this.player.pos),
      armorBroken: !!enemy.armorBrokenBy,
      underSuppression: !!this.squadSuppressing?.(enemy),
      killer: byPlayer ? 'player' : info.source === 'ally' ? info.attacker?.callsign || 'ally' : info.source,
    });
  }

  onPlayerDeath() {
    this.stats.deaths++;
    this.events.emit(EV.PLAYER_DIED, {});
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
    this.save.update(null, { now: true }); // P, kaydın progress nesnesinin kendisi
    const next = LEVELS.find((l) => l.id === lv.id + 1) || null;
    const rewards = this.settleRun(true);
    this.menus.showVictory(this.stats, DIFFICULTY[this.difficultyKey]?.label || '', lv, next, firstClear, rewards);
  }

  // Konsol ve testler için: tüm seviyeleri aç
  unlockAllLevels() {
    this.progress.unlocked = LEVELS.length;
    this.save.update(null, { now: true });
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
    // Komut çarkı açıkken oyun yavaşlar (ayar); çarkın kendisi gerçek girdilerle çalışır
    // Telsize yazarken de yavaşlar (ayar)
    const slow = this.state === 'playing' ? this.wheel.slow * (this.chat.open ? this.settings.chatSlowMo ?? 0.3 : 1) : 1;
    // Çevrim içinde oyun saati gerçek saattir (maç sunucuda sürer)
    if (!this.net) dt *= this.timeScale * slow;
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
          // Çevrim içinde duraklatma menüsü açıkken de maç akar (oyuncu durur)
          if (this.net) this.updatePlaying(dt);
          else this.renderFrame();
          break;
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
    this.effects.setScale(this.height * this.worldPR, cam.fov);
    this.drawWorld(cam);
  }

  updatePlaying(dt) {
    const I = this.input;
    this.time += dt;
    this.net?.frame(dt);
    if (this.state === 'playing' && I.pressed('pause') && !this.console.open) {
      this.pause();
      this.renderFrame();
      return;
    }
    // Kalkış sahnesinde oyuncu helikopterin içinde: kontrol yok, kamera kabinden bakar
    const cine = !!this.mission.takeoff;
    // Telsize yazarken oyuncu durur (tuşlar yazı alanına gider)
    const canAct = this.player.alive && !this.console.open && !this.chat.open && this.state === 'playing' && !cine;
    if (this.mode === 'mission' && canAct && !this.wheel.open && I.pressed('chat')) this.chat.openChat();
    if (this.console.open || cine) I.consumeLook();
    if (cine) {
      this.player.update(dt, NULL_INPUT);
      this.player.applyCamera(this.camera, dt); // görüş açısı (dürbün kapanır) ve dinleyici güncel kalsın
      this.mission.takeoffCamera(this.camera);
      const c = this.camera.position;
      this.audio.setListener(c.x, c.y, c.z, this.player.yaw);
    } else {
      // Komut çarkı (T): açıkken fare dilim seçer (bakış dönmez), 1–4 ve tekerlek muhatap seçer
      const cmdOk = canAct && this.mode === 'mission';
      if (cmdOk) this.wheel.update(dt, I);
      else if (this.wheel.open) this.wheel.close(false);
      this.player.update(dt, canAct ? I : NULL_INPUT);
      this.player.applyCamera(this.camera, dt);
    }
    this.camera.updateMatrixWorld();
    const wheelOpen = this.wheel.open;
    // Sarf malzemesi takılırken silah kullanılmaz (kit kendi tuşlarını ve iptali okur); çark açıkken 3/4 muhatap seçer
    this.kit.update(dt, canAct && !wheelOpen ? I : NULL_INPUT, canAct);
    if (canAct && this.mode === 'mission' && !wheelOpen) {
      for (const action in SHORTCUTS) if (I.pressed(action)) this.commands.issue(SHORTCUTS[action], this.commands.addressee, { inputMethod: 'shortcut' });
      // Bağlamsal işaret (Z): nişangâhın baktığı şeye göre saldır / git / kaldır / temizle; çift basış iptal
      if (I.pressed('ping') && !this.player.down) this.ping.press();
      // Sesli komut: N basılıyken dinler, bırakınca tanınan cümle ayrıştırıcıya gider
      if (this.settings.voiceCommands && I.pressed('voice')) this.voice.start();
    }
    if (I.released('voice')) this.voice.stop();
    this.chat.update(dt);
    this.commands.update();
    this.ping.update(dt);
    // Çevrim içinde geri sayım ve maç sonunda silah kullanılmaz (sunucu da kabul etmez)
    const armed = canAct && !this.kit.using && !wheelOpen && !(this.net && (this.net.frozen || this.net.state !== 'playing'));
    this.weapons.update(dt, armed ? I : NULL_INPUT, armed);
    this.enemies.update(dt);
    this.allies.update(dt);
    this.grenades.update(dt);
    this.mission.update(dt);
    this.updateDebris(dt);
    if (this.hitboxDebug?.on) this.hitboxDebug.update();
    this.effects.update(dt, this.camera.position);
    this.effects.setScale(this.height * this.worldPR, this.camera.fov);
    this.viewmodel.update(dt);
    this.hud.update(dt);
    if (this.net) {
      this.net.remotes.updateTags(this.hud, this.width, this.height);
      this.matchHud.update(dt, this.console.open ? NULL_INPUT : I);
    }
    this.netGraph.update(dt);
    this.missionHud.update(dt, canAct ? I : NULL_INPUT);
    this.audio.updateAmbient();
    this.stats.time = this.mission.time;
    const lockMissing = this.state === 'playing' && !I.locked && !I.lockFailed && !I.touch.active && !this.console.open && !this.chat.open && !cine;
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
    this.drawWorld(this.camera);
    if (this.mode !== 'menu' && this.player.alive && this.state !== 'victory' && !this.mission?.takeoff) this.viewmodel.render(r);
  }
}

// Ölçekli dünya hedefini tuvale aktaran tam ekran dörtgen: ton eşleme ve sRGB dönüşümü burada yapılır
// (hedefe çizilirken three.js bunları atlar), böylece iki yolun görüntüsü aynı olur
function createBlit() {
  const material = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D(tDiffuse, vUv);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
    depthTest: false,
    depthWrite: false,
  });
  const scene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  scene.add(quad);
  return { scene, material, camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
}

// Gökyüzü gölgelendiricisinin renk uniform'ları (ortam tablosundan)
function skyUniforms(sky, sunDir) {
  const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  return {
    sunDir: { value: sunDir },
    zenith: { value: new THREE.Color(sky.zenith) },
    horizon: { value: new THREE.Color(sky.horizon) },
    ground: { value: new THREE.Color(sky.ground) },
    glowCol: { value: v3(sky.glow) },
    discCol: { value: v3(sky.disc) },
    bandCol: { value: v3(sky.band) },
    stars: { value: sky.stars },
  };
}

// Hava durumu: kameranın çevresinde düşen kar ya da savrulan kül (duman havuzundan; ışık eklemez).
// Yoğunluk grafik kalitesine göre: düşük kalitede parçacık havuzu küçük
const WEATHER = {
  snow: { rate: 140, color: 0xf4f8ff, size: 0.07, fall: [-1.6, -0.9], drift: 0.6, life: 4.5, alpha: 0.9 },
  ash: { rate: 45, color: 0x7a7672, size: 0.06, fall: [-0.5, -0.15], drift: 0.9, life: 6, alpha: 0.7 },
};
function weatherEmitter(kind, game) {
  const W = WEATHER[kind];
  if (!W) return { rate: 0, spawn() {} };
  const low = game.quality === 'low';
  return {
    rate: W.rate * (low ? 0.35 : 1),
    spawn: (fx) => {
      const c = game.camera.position;
      const x = c.x + rand(-16, 16);
      const z = c.z + rand(-16, 16);
      const y = c.y + rand(1, 9);
      fx.smoke.spawn(x, y, z, rand(-W.drift, W.drift), rand(W.fall[0], W.fall[1]), rand(-W.drift, W.drift), W.life, W.size, W.size, fx._c.setHex(W.color), W.alpha, 0, 0, 0, 0.15);
    },
  };
}

// Menü arka planı için sahte seviye: Kızılkum'un köy bölümü, düşmansız
const MENU_LEVEL = { ...LEVELS[1], id: 0 };

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
  // PWA sürümünde yükleme düğmesi ve güncelleme satırı (diğer sürümlerde null)
  const pwa = setupPwa();
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
  game.pwa = pwa;
  try {
    L.step('Asker modelleri yükleniyor', 0.4);
    await nextPaint();
    await game.loadCharacters();
    L.step('Araç modelleri yükleniyor', 0.5);
    await nextPaint();
    await game.loadProps();
    L.step('Harita inşa ediliyor', 0.6);
    await nextPaint();
    game.showMenu();
    // Çevrim içi: sunucu adresi ve ad varsa bağlan (yoksa durum "kapalı"; ad girilince kendiliğinden başlar)
    game.social.start();
    L.step('Gölgelendiriciler derleniyor', 0.85);
    await nextPaint();
    await game.precompile();
  } catch (err) {
    L.fail('Oyun başlatılamadı', err);
    return;
  }
  L.ready();
  pwa?.register();
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
