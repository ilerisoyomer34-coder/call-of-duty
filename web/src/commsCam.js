// Sinematik konuşma görüntüsü: telsizde biri konuşurken köşede konuşanın canlı çekimi (CoD'daki telsiz portresi).
// Alfa askeri konuşuyorsa sahnedeki gerçek asker yüzünden çekilir (ikinci kamera; duvar arkadaysa yaklaşır). Karargâh,
// pilot ve düşman telsizi için haritanın altında gizli bir stüdyo köşesi kurulur (asker modeli, arka plan). Çekim ayrı ve
// küçük bir hedefe COMMS_CAM.fps (kaliteye göre) kare hızında çizilir (her karede değil: hem sinema hissi hem maliyet), her karede o
// doku tuvalin kutusuna sinema süzgeciyle (renk tonu, gren, tarama çizgisi, vinyet, kesmede parazit) basılır.
// Kutu (#commsCam) DOM'dadır: konuşanın adı, görevi ve altyazı. Ayar settings.commsCam.
import * as THREE from 'three';
import { COMMS_CAM as C, ALLY, ENEMY_TYPES } from './config.js';
import SQUAD from './data/squad.json' with { type: 'json' };
import { createSoldier } from './soldier.js';
import { clamp } from './util.js';
import { speakerShot, lineSeconds } from './commsShot.js';

export { speakerShot, lineSeconds };

const _head = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _look = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uTime, uFade, uStatic, uSat, uVig, uGrain, uCA, uExp;
uniform vec3 uShadow, uHigh;
uniform vec2 uRes;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 d = vUv - 0.5;
  float r2 = dot(d, d);
  // Kenara doğru artan renk sapması (eski mercek)
  vec2 off = d * uCA * r2;
  vec3 c = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b) * uExp;
  // Renk tonu: doymuşluk düşük, gölgeler camgöbeğine, ışıklar sıcağa
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSat);
  c *= mix(uShadow, uHigh, smoothstep(0.02, 0.7, l));
  c *= 1.0 - r2 * uVig;
  // Film greni ve tarama çizgileri (yayın görüntüsü)
  float n = hash(floor(vUv * uRes) + floor(uTime * 24.0) * 7.31);
  c *= 1.0 + (n - 0.5) * uGrain;
  c *= 0.94 + 0.06 * sin(vUv.y * uRes.y * 1.5708);
  // Parazit: kesmede ve düşman telsizinde yatay bantlar
  float band = step(0.8, hash(vec2(floor(vUv.y * 48.0), floor(uTime * 24.0))));
  c = mix(c, vec3(n * 0.6), clamp(uStatic * (0.3 + band), 0.0, 1.0));
  gl_FragColor = vec4(c, uFade);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class CommsCam {
  constructor(game) {
    this.game = game;
    this.camera = new THREE.PerspectiveCamera(C.fov, 16 / 9, C.near, C.far);
    this.rt = null;
    this.line = null; // { who, text, shot, ally, t, dur, color }
    this.fade = 0;
    this.cutT = 0;
    this.captureT = 0;
    this.time = 0;
    this.subject = null; // çekilen Alfa askeri (ally.js tam ayrıntıda canlandırır)
    this.studio = null;
    this.rect = { x: 0, y: 0, w: 0, h: 0 };
    this.layoutDirty = true;
    this.composite = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: {
          tDiffuse: { value: null }, uTime: { value: 0 }, uFade: { value: 0 }, uStatic: { value: 0 },
          uExp: { value: C.grade.exposure }, uSat: { value: C.grade.saturation }, uVig: { value: C.grade.vignette }, uGrain: { value: C.grade.grain },
          uCA: { value: C.grade.aberration }, uShadow: { value: new THREE.Color(...C.grade.shadow) },
          uHigh: { value: new THREE.Color(...C.grade.highlight) }, uRes: { value: new THREE.Vector2(320, 180) },
        },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: COMPOSITE_FRAG,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.composite.frustumCulled = false;
    this.compositeScene = new THREE.Scene();
    this.compositeScene.add(this.composite);
    this.compositeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const $ = (id) => document.getElementById(id);
    this.el = $('commsCam');
    this.viewEl = this.el?.querySelector('.ccView');
    this.nameEl = this.el?.querySelector('.ccName');
    this.roleEl = this.el?.querySelector('.ccRole');
    this.lineEl = this.el?.querySelector('.ccLine');
    this.chanEl = this.el?.querySelector('.ccChan');
    window.addEventListener('resize', () => (this.layoutDirty = true));
  }

  get enabled() {
    return this.game.settings.commsCam !== false && !!this.el;
  }

  get active() {
    return !!this.line && this.fade > 0;
  }

  // Asker konuşuyor mu (baş hareketi): çekimdeki konuşan, satırı sürerken
  talking(ally) {
    return !!this.line && this.line.ally === ally && this.line.t < this.line.dur;
  }

  // radioChat.onRadio her satırda çağırır. Konuşan değişince kesme (kısa parazit), aynı konuşanda yalnız altyazı
  show(who, text, { kind = null, ally = null } = {}) {
    if (!this.enabled || kind === 'player') return false;
    const shot = speakerShot(who, kind, ally);
    if (!shot) return false;
    const same = this.line && this.line.shot === shot && this.line.ally === ally && this.fade > 0;
    const m = ally?.member;
    this.line = {
      who, text, shot, ally, t: 0, dur: lineSeconds(text),
      name: m ? `${m.callsign.toLocaleUpperCase('tr-TR')} · ${m.name.toLocaleUpperCase('tr-TR')}` : C.labels[shot].name,
      role: m ? `${ally.rankName} · ${m.roleLabel}` : C.labels[shot].role,
      color: m?.color || C.labels[shot].color,
    };
    if (!same) {
      this.cutT = C.cut;
      this.captureT = 0;
    }
    this.subject = shot === 'ally' ? ally : null;
    this.writeDom();
    return true;
  }

  writeDom() {
    const L = this.line;
    if (!this.el || !L) return;
    this.nameEl.textContent = L.name;
    this.nameEl.style.color = L.color;
    this.roleEl.textContent = L.role;
    this.lineEl.textContent = L.text;
    this.chanEl.textContent = C.labels[L.shot].channel;
    this.el.dataset.shot = L.shot;
    this.el.hidden = false;
    this.layoutDirty = true;
  }

  hide() {
    this.line = null;
    this.subject = null;
    this.fade = 0;
    if (this.el) this.el.hidden = true;
  }

  // Satır süresi, sesli okuma, giriş/çıkış. Görünmeyen durumlarda (menü, duraklatma, kalkış sahnesi) kapanır
  update(dt) {
    const g = this.game;
    const L = this.line;
    if (!L) return;
    const blocked = !this.enabled || g.state !== 'playing' || g.mode === 'menu' || g.mission?.takeoff || !g.player.alive;
    this.time += dt;
    L.t += dt;
    // Konuşan susmadıysa (sesli okuma sürüyor) görüntü kalır
    const voice = g.radioVoice;
    if (L.t >= L.dur && voice?.speaking && voice.current?.who === L.who) L.dur = L.t + 0.1;
    const live = !blocked && L.t < L.dur + C.tail;
    if (L.ally && (!L.ally.alive && !L.ally.down)) L.dur = Math.min(L.dur, L.t);
    this.fade = clamp(this.fade + (live ? dt : -dt) / C.fade, 0, 1);
    this.cutT = Math.max(0, this.cutT - dt);
    if (!live && this.fade <= 0) this.hide();
    else if (this.el) this.el.style.opacity = String(this.fade);
  }

  // Kutunun tuvaldeki yeri (CSS piksel, WebGL'in alt-sol kökenine göre)
  measure(r) {
    if (!this.viewEl) return false;
    const b = this.viewEl.getBoundingClientRect();
    const size = r.getSize(_s);
    this.rect.x = b.left;
    this.rect.y = size.y - b.bottom;
    this.rect.w = b.width;
    this.rect.h = b.height;
    this.layoutDirty = false;
    if (b.width < 8 || b.height < 8) return false;
    const pr = Math.min(r.getPixelRatio(), this.game.isTouch ? C.touchPR : C.maxPR);
    const w = Math.round(b.width * pr), h = Math.round(b.height * pr);
    if (!this.rt) this.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType });
    else if (this.rt.width !== w || this.rt.height !== h) this.rt.setSize(w, h);
    this.composite.material.uniforms.tDiffuse.value = this.rt.texture;
    this.composite.material.uniforms.uRes.value.set(w / pr, h / pr);
    this.camera.aspect = b.width / b.height;
    this.camera.updateProjectionMatrix();
    return true;
  }

  // Alfa askerinin yüzü: kafa kemiğinin önünden, hafif yandan; arada duvar varsa kamera yaklaşır
  aimAtAlly(ally) {
    const g = this.game;
    const head = ally.model?.bones?.Head;
    if (head) head.getWorldPosition(_head);
    else ally.headPos(_head);
    _fwd.set(-Math.sin(ally.yaw), 0, -Math.cos(ally.yaw));
    _right.crossVectors(_fwd, UP);
    const sway = Math.sin(this.time * C.drift.speed * 6.28) * C.drift.amp;
    _dir.copy(_fwd).multiplyScalar(C.dist).addScaledVector(_right, C.side + sway).addScaledVector(UP, C.height);
    let dist = _dir.length();
    _dir.normalize();
    const hit = g.world.raycast(_head, _dir, dist);
    if (hit) dist = Math.max(C.minDist, hit.distance - 0.08);
    this.camera.position.copy(_head).addScaledVector(_dir, dist);
    _look.copy(_head).addScaledVector(UP, C.lookUp);
    this.camera.lookAt(_look);
  }

  // Karargâh/pilot/düşman: stüdyo köşesi ilk gerektiğinde kurulur. Ayrı sahne değil, ana sahnenin içinde haritanın
  // çok altında (COMMS_CAM.studioY) gizli bir grup: aynı ışıklarla çizildiği için ışık sayısı değişmez, malzemeler yeni
  // gölgelendirici istemez (ayrı sahne her geçişte bütün malzemelerin ışık durumunu yeniden kurdururdu)
  buildStudio() {
    if (!this.studio) {
      const root = new THREE.Group();
      root.position.set(0, C.studioY, 0);
      root.visible = false;
      const sets = {};
      for (const [shot, S] of Object.entries(C.studio)) {
        const set = new THREE.Group();
        // Arka plan: konuşanın yeri (karargâh harita duvarı, kokpit, karanlık oda); ışıksız, sissiz
        const back = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.4), new THREE.MeshBasicMaterial({ map: backdrop(S.backdrop), fog: false }));
        back.position.set(0, 1.5, -0.9);
        set.add(back);
        const colors = S.type in ENEMY_TYPES ? ENEMY_TYPES[S.type].colors : ALLY.colors;
        const actor = createSoldier(S.type, colors, S.model || null, null);
        set.add(actor.root);
        set.visible = false;
        root.add(set);
        sets[shot] = { set, actor };
      }
      this.studio = { root, sets, state: { pos: new THREE.Vector3(), yaw: Math.PI, vel: { x: 0, z: 0 }, crouch: false, aimPitch: 0, stance: 'relaxed', reload: -1, throw: -1, dist: 1, mount: null, hideGun: true, offscreen: false, talk: 0 } };
    }
    // Harita değişince sahne yeniden kurulur: köşe yeni sahneye taşınır
    if (this.studio.root.parent !== this.game.scene) this.game.scene.add(this.studio.root);
    return this.studio;
  }

  // Gölgelendiriciler açılışta derlensin: ilk konuşmada kare takılmasın
  // Çekim hedefe (ton eşlemesiz) çizildiğinden gölgelendirici sürümleri de hedef bağlıyken derlenir
  precompile(r) {
    const st = this.buildStudio();
    if (!this.rt) this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
    st.root.visible = true;
    for (const s of Object.values(st.sets)) s.set.visible = true;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.rt);
    r.compile(this.game.scene, this.camera);
    r.setRenderTarget(prev);
    for (const s of Object.values(st.sets)) s.set.visible = false;
    st.root.visible = false;
    r.compile(this.compositeScene, this.compositeCam);
  }

  aimStudio(shot, dt) {
    const st = this.buildStudio();
    for (const [k, s] of Object.entries(st.sets)) s.set.visible = k === shot;
    const s = st.sets[shot];
    st.state.talk = this.line && this.line.t < this.line.dur ? 1 : 0;
    st.state.pos.copy(st.root.position);
    s.actor.animate(dt, st.state);
    const head = s.actor.bones?.Head;
    if (head) head.getWorldPosition(_head);
    else _head.set(0, st.root.position.y + 1.6, 0);
    const sway = Math.sin(this.time * C.drift.speed * 6.28) * C.drift.amp;
    this.camera.position.set(_head.x + C.side * 0.6 + sway, _head.y + C.height, _head.z + C.dist);
    _look.copy(_head).addScaledVector(UP, C.lookUp);
    this.camera.lookAt(_look);
    return st.root;
  }

  // renderFrame sonunda: çekim (COMMS_CAM.fps), ardından kutuya basım. Kendi saatiyle (çizim adımı süre almaz)
  render(r) {
    const now = performance.now();
    const dt = Math.min(0.1, (now - (this.lastRender || now)) / 1000);
    this.lastRender = now;
    if (!this.line || this.fade <= 0) return;
    if (this.layoutDirty && !this.measure(r)) return;
    if (!this.rt) return;
    const L = this.line;
    const fps = C.fps[this.game.renderQuality] || C.fps.medium;
    this.captureT -= dt;
    // Yavaş cihazda (kare süresi çekim aralığından uzun) her kare çekilmesin: en fazla iki karede bir
    if (this.captureT <= 0 && !this.capturedLast) {
      this.captureT += 1 / fps;
      if (this.captureT < 0) this.captureT = 1 / fps;
      this.capturedLast = true;
      const g = this.game;
      let studio = null;
      if (L.shot === 'ally' && L.ally?.model) this.aimAtAlly(L.ally);
      else studio = this.aimStudio(L.shot, 1 / fps);
      if (studio) studio.visible = true;
      // Gölge haritası ana kameranındır: ikinci çekim onu yeniden çizmesin
      const auto = r.shadowMap.autoUpdate;
      r.shadowMap.autoUpdate = false;
      const prev = r.getRenderTarget();
      r.setRenderTarget(this.rt);
      r.clear();
      r.render(g.scene, this.camera);
      r.setRenderTarget(prev);
      r.shadowMap.autoUpdate = auto;
      if (studio) studio.visible = false;
    } else this.capturedLast = false;
    const u = this.composite.material.uniforms;
    u.uTime.value = this.time;
    u.uFade.value = this.fade;
    u.uStatic.value = (L.shot === 'enemy' ? C.enemyStatic : 0) + (this.cutT > 0 ? this.cutT / C.cut : 0);
    const R = this.rect;
    r.setViewport(R.x, R.y, R.w, R.h);
    r.setScissor(R.x, R.y, R.w, R.h);
    r.setScissorTest(true);
    r.render(this.compositeScene, this.compositeCam);
    r.setScissorTest(false);
    const size = r.getSize(_s);
    r.setViewport(0, 0, size.x, size.y);
  }
}

// Stüdyo arka planları kod ile çizilir (dosya yok): karargâh harita duvarı, kokpit camı, düşman odası
function backdrop(kind) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const x = c.getContext('2d');
  if (kind === 'map') {
    x.fillStyle = '#3a5446';
    x.fillRect(0, 0, 256, 128);
    x.strokeStyle = 'rgba(170,220,180,.35)';
    for (let i = 0; i < 256; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 128); x.stroke(); }
    for (let i = 0; i < 128; i += 16) { x.beginPath(); x.moveTo(0, i); x.lineTo(256, i); x.stroke(); }
    x.strokeStyle = 'rgba(220,235,180,.5)';
    for (let k = 0; k < 5; k++) { x.beginPath(); x.ellipse(90 + k * 12, 64, 30 + k * 14, 18 + k * 9, 0.4, 0, 6.28); x.stroke(); }
    x.fillStyle = '#c0453a';
    for (const [px, py] of [[60, 40], [150, 70], [200, 35]]) { x.beginPath(); x.arc(px, py, 4, 0, 6.28); x.fill(); }
    x.fillStyle = 'rgba(255,214,140,.5)';
    x.fillRect(206, 8, 40, 26);
  } else if (kind === 'cockpit') {
    const g = x.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#7f99ad');
    g.addColorStop(0.6, '#b9c3c4');
    g.addColorStop(1, '#3b3f3c');
    x.fillStyle = g;
    x.fillRect(0, 0, 256, 128);
    x.fillStyle = '#1b1e20';
    x.fillRect(0, 96, 256, 32);
    x.fillRect(118, 0, 20, 100);
    x.fillStyle = 'rgba(120,255,170,.8)';
    for (let i = 0; i < 9; i++) x.fillRect(20 + i * 26, 106, 8, 5);
  } else {
    x.fillStyle = '#2a1715';
    x.fillRect(0, 0, 256, 128);
    const g = x.createRadialGradient(190, 40, 4, 190, 40, 90);
    g.addColorStop(0, 'rgba(200,40,30,.55)');
    g.addColorStop(1, 'rgba(200,40,30,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 256, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
