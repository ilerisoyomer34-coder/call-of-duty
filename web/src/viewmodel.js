// Birinci şahıs silah/kol görünümü ve prosedürel animasyon katmanı (master prompt §4.7):
// sway, bob, nefes, geri tepme yayı, ADS hizalama, koşu pozu, duvar geri çekme,
// silaha özgü şarjör/fişek/roket değiştirme, equip/unequip, pompa/sürgü hareketi, bıçak, el bombası.
// Ayrı sahnede çizilir: silah duvarların içine girmez.
import * as THREE from 'three';
import { buildWeapon, buildArms, poseArm, buildGrenade, buildSmokeGrenade, buildRocket, mat } from './models.js';
import { WEAPONS, WEAPON_ORDER, SIGHT_VIEW, HAND_VIEW } from './config.js';
import { preloadWeapons, rigFor, assetIdFor, loadWeaponAsset } from './assets.js';
import { sightFor, hasReticle, isScoped, canAim } from './sights.js';
import { calibrateWeapon, placeWeapon } from './weaponAim.js';
import { reticleMesh, housingMesh, glowDots } from './reticles.js';
import { clamp, damp, lerp, smoothstep, Spring, rand, warnOnce } from './util.js';

const _p = new THREE.Vector3();
const _r = new THREE.Euler();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _upR = new THREE.Vector3(); // el sırtı yön ipuçları (poseArm)
const _upL = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qa = new THREE.Quaternion();
const _NEG_Z = new THREE.Vector3(0, 0, -1);
const _m4 = new THREE.Matrix4();
const _box = new THREE.Box3();
const _Z = new THREE.Vector3(0, 0, 1);
const _X = new THREE.Vector3(1, 0, 0);
const _hit = {};
const _mo = new THREE.Vector3(); // şarjör ofseti (kök uzayı)
const _mq = new THREE.Quaternion();
const _g = new THREE.Vector3();
const _g2 = new THREE.Vector3();
const _hand = new THREE.Vector3();
// Şarjör/bıçak animasyonlarının bu karedeki katkısı (update() toplar)
const _pose = { dx: 0, dy: 0, dz: 0, rx: 0, ry: 0, rz: 0, left: null, right: null };

// 0→1 yükselen, tutulan, sonra 1→0 inen zarf
function envelope(k, a, b, c, d) {
  if (k <= a || k >= d) return 0;
  if (k < b) return smoothstep((k - a) / (b - a));
  if (k <= c) return 1;
  return 1 - smoothstep((k - c) / (d - c));
}

// Bıçak savurma anahtar kareleri (görünüm modeli uzayı: x sağ, y yukarı, kamera -Z'ye bakar).
// Sol el bıçağı sol alttan kaldırır, soldan sağa keser (isabet anı MELEE.hitTime ≈ 0,14 sn, kesişin
// ortası), sonra sağ alttan ekrandan çıkar. rot: Euler (x, y, z). Ucu hep ileri-sağa bakar, ağzı aşağıda:
// bıçağın yan yüzü kameraya döner, kesiş boyunca siluet okunur (uç kameradan uzağa bakarsa kısalıp kaybolur).
const KNIFE_KEYS = [
  { t: 0.0, pos: [-0.34, -0.36, -0.3], rot: [0.3, -0.3, 0.3] },
  { t: 0.08, pos: [-0.26, -0.07, -0.38], rot: [0.2, -0.45, 0.25] },
  { t: 0.2, pos: [0.12, -0.12, -0.44], rot: [-0.05, -0.8, 0.1] },
  { t: 0.34, pos: [0.14, -0.28, -0.36], rot: [-0.3, -0.95, 0] },
  { t: 0.5, pos: [0.06, -0.52, -0.3], rot: [-0.6, -1.1, 0] },
];
const KNIFE_END = KNIFE_KEYS[KNIFE_KEYS.length - 1].t;

// Elde tutulan bıçağın savuruşları (sağ el): bekleme pozuna eklenen konum/açı farkı, t savuruş süresinin oranı.
// A sağdan sola (ağız önde, sola bakar), B soldan sağa ters savuruş (bilek döner, ağız sağa). İsabet anı
// (melee.hitTime / melee.time ≈ 0,26) kurulma ile kesişin ortası arasında
const SLASH_KEYS = [
  [
    { t: 0, pos: [0, 0, 0], rot: [0, 0, 0] },
    { t: 0.18, pos: [0.1, 0.12, 0.06], rot: [0.2, -0.35, -0.3] },
    { t: 0.38, pos: [-0.08, 0.02, -0.1], rot: [-0.1, 0.5, -0.2] },
    { t: 0.6, pos: [-0.3, -0.08, -0.02], rot: [-0.3, 0.9, -0.1] },
    { t: 1, pos: [0, 0, 0], rot: [0, 0, 0] },
  ],
  [
    { t: 0, pos: [0, 0, 0], rot: [0, 0, 0] },
    { t: 0.18, pos: [-0.22, 0.08, 0.02], rot: [0.15, 0.7, 0.6] },
    { t: 0.38, pos: [-0.02, 0.02, -0.12], rot: [-0.05, 0.1, 0.9] },
    { t: 0.6, pos: [0.16, -0.08, -0.04], rot: [-0.3, -0.4, 0.9] },
    { t: 1, pos: [0, 0, 0], rot: [0, 0, 0] },
  ],
];

// Şarjör değiştirme tarzları (HALO örnek alındı: kısa ve vurgulu; silah yatar, sol el şarjörü kendi ekseni
// boyunca çeker, yenisini getirip avuçla oturtur, silah o anda hafifçe sıçrar). Şarjörün yeri ve ekseni her
// silahın kendi modelinden ölçülür (computeMagInfo); burada yalnız tarz.
//  tilt: [namlu yukarı, sola dönüş, yatış] (rad) · lift: silahın ekrana doğru kalkışı [sağ, yukarı, geri] (m;
//  şarjör yuvası ekranın ortasına gelir, el ve şarjör görünür) · out: şarjörün yuvadan çıkışı (m)
//  rock: AK tipi öne devrilerek çıkma/takılma (rad) · drop: boş şarjör kendiliğinden bu kadar düşer (m, tabanca)
//  fetch: yeni şarjörün getirildiği yer (MAG_FETCH yerine; tabancada yakın, ekranda görünsün)
//  grabTop: el şarjörü üstünden tutar (fişek kayışı) · charge: şarjör boşsa sondaki iş ('handle' kurma kolu,
//  'slap' kola vurup bırakma, 'slide' sürgü kendiliğinden kapanır, 'bolt' sürgü çekilir, 'none')
const RELOAD_STYLES = {
  rifle: { tilt: [0.22, 0.22, -0.4], lift: [-0.07, 0.06, 0.04], out: 0.22, rock: 0, charge: 'handle' },
  ak: { tilt: [0.25, 0.25, -0.35], lift: [-0.08, 0.06, 0.04], out: 0.2, rock: 0.55, charge: 'handle' },
  smg: { tilt: [0.2, 0.2, -0.45], lift: [-0.06, 0.05, 0.03], out: 0.18, rock: 0, charge: 'slap' },
  lmg: { tilt: [0.18, 0.3, -0.25], lift: [-0.06, 0.03, 0.02], out: 0.24, rock: 0, charge: 'handle' },
  belt: { tilt: [0, 0.3, 0.6], lift: [-0.1, 0.05, 0.03], out: 0.3, rock: 0, charge: 'none', grabTop: true },
  pistol: { tilt: [0.1, 0.35, -0.7], lift: [-0.08, 0.12, 0.06], out: 0.1, rock: 0, charge: 'slide', drop: 0.4, fetch: [-0.05, -0.1, 0.05] },
  sniper: { tilt: [0.2, 0.25, -0.35], lift: [-0.08, 0.06, 0.04], out: 0.2, rock: 0, charge: 'handle' },
  bolt: { tilt: [0.2, 0.22, -0.3], lift: [-0.08, 0.09, 0.04], out: 0.18, rock: 0, charge: 'bolt' },
  // Fişek fişek doldurma: yatış silahın verisinden (loadRoll); silah kalkar, yükleme penceresi ekrana gelir
  shell: { tilt: [0.25, 0.25, 0], lift: [-0.08, 0.12, 0.05] },
  // Bazuka: tüp önce öne itilir, sonra sola savrulur (arkası kameranın içinden geçmesin); arka ağız sol üste gelir
  rocket: { tilt: [-0.25, -0.85, 0.1], lift: [0.1, 0.1, -0.5] },
};
// Zaman çizelgesi (0..1). I = ammoInsertAt: yeni şarjör tam o anda oturur (cephane o an geçer).
// grab: el şarjöre gider · pull: şarjör ekseni boyunca çıkar · toss: bırakılır, düşer · bring: I'dan bu kadar
// önce yenisi gelir · seat: I'dan bu kadar önce yuvaya girer · ret: el kundağa döner · charge: boş şarjörde son iş
const RT = { tiltIn: 0.14, tiltOut: 0.84, grab: [0.05, 0.15], pull: [0.15, 0.27], toss: [0.27, 0.35], bring: 0.2, seat: 0.07, ret: 0.1, charge: [0.68, 0.92] };
// Yeni şarjörün getirildiği yer (şarjörün oturmuş hâline göre, kök uzayı): aşağıda, solda, biraz geride
const MAG_FETCH = [-0.07, -0.2, 0.08];
// Şarjör oturunca silahın sıçraması (yay itkisi) ve sürgü/kurma kolu bırakılınca
const RELOAD_BUMP = { seat: 1.3, seatZ: -0.4, charge: 0.9 };

// Görünüm modeli silahın tarzı: veride (reloadAnim) ya da türünden
function reloadStyle(d) {
  if (d.reloadAnim && RELOAD_STYLES[d.reloadAnim]) return RELOAD_STYLES[d.reloadAnim];
  if (d.bolt) return RELOAD_STYLES.bolt;
  if (d.spin) return RELOAD_STYLES.belt;
  if (d.category === 'secondary') return RELOAD_STYLES.pistol;
  return RELOAD_STYLES.rifle;
}

// Anahtar karelerden t anındaki değeri pose'a ekle (iki kare arası yumuşak geçiş)
function sampleKeys(keys, t, out) {
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1].t) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const k = smoothstep(clamp((t - a.t) / (b.t - a.t), 0, 1));
  out.dx += lerp(a.pos[0], b.pos[0], k);
  out.dy += lerp(a.pos[1], b.pos[1], k);
  out.dz += lerp(a.pos[2], b.pos[2], k);
  out.rx += lerp(a.rot[0], b.rot[0], k);
  out.ry += lerp(a.rot[1], b.rot[1], k);
  out.rz += lerp(a.rot[2], b.rot[2], k);
}

// Parçayı verilen noktada (parçanın üst düğümünün uzayında) duran bir eksen düğümüne taşı: dönüş o noktanın çevresinde
function pivotAround(part, at) {
  const pivot = new THREE.Group();
  pivot.position.copy(at);
  pivot.userData.base = at.clone();
  part.parent.add(pivot);
  pivot.add(part);
  part.position.sub(at);
  return pivot;
}

export class Viewmodel {
  refreshArms() {
    this.arms.left.g.removeFromParent(); this.arms.right.g.removeFromParent();
    this.arms = buildArms(this.textures);
    this.holder.add(this.arms.left.g, this.arms.right.g);
  }

  constructor(game, textures) {
    this.game = game;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.01, 10);
    this.hemi = new THREE.HemisphereLight(0xd6e0ec, 0x7a6650, 1.5);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffd9b0, 2.2);
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.flash = new THREE.PointLight(0xffb060, 0, 1.5, 2);
    this.scene.add(this.flash);
    this.holder = new THREE.Group();
    this.scene.add(this.holder);
    this.textures = textures;
    this.models = {};
    for (const id of WEAPON_ORDER) this.installModel(id, buildWeapon(id));
    // Blender modelleri hazır olunca yedek (prosedürel) modelin yerine geçer
    preloadWeapons(WEAPONS, (id, scene) => this.installModel(id, this.modelFromGlb(id, scene), true));
    this.arms = buildArms(textures);
    this.holder.add(this.arms.left.g, this.arms.right.g);
    this.grenade = buildGrenade();
    this.grenade.scale.setScalar(0.7);
    this.grenade.visible = false;
    this.holder.add(this.grenade);
    this.smokeNade = buildSmokeGrenade();
    this.smokeNade.scale.setScalar(0.7);
    this.smokeNade.visible = false;
    this.holder.add(this.smokeNade);
    // Fişek fişek doldurmada elde görünen fişek (pompalı: kırmızı kovan + pirinç taban; tüfek fişeği pirinç) ve
    // bazukaya arkadan sürülen roket. Doldurulan silahın köküne bağlanır, yalnız o sırada görünür
    this.shells = {
      shotgun: this.makeShell(0.0105, 0.068, 0xa3262a),
      rifle: this.makeShell(0.0065, 0.05, 0xb38a3c),
    };
    this.rocket = buildRocket();
    this.rocket.scale.setScalar(0.8);
    this.rocket.visible = false;
    this.rocket.traverse((o) => {
      if (o.isMesh) o.frustumCulled = false;
    });
    this.prevReloadK = -1;
    this.reloadStyles = RELOAD_STYLES; // konsoldan/denemeden ayar için
    // Yakın dövüş bıçağı (Sketchfab, sol elde savrulur). Yüklenemezse eski dipçik darbesi kalır.
    this.knife = null;
    this.knifeWarm = false;
    loadWeaponAsset('knife')
      .then((scene) => {
        const k = new THREE.Group();
        k.add(scene);
        k.visible = false;
        k.traverse((o) => {
          if (o.isMesh) o.frustumCulled = false;
        });
        this.holder.add(k);
        this.knife = k;
      })
      .catch((e) => warnOnce('glb-knife', `Bıçak modeli yüklenemedi, dipçik darbesi kullanılıyor (${e.message})`));
    this.holder.traverse((o) => {
      if (o.isMesh) o.frustumCulled = false;
    });

    this.kickZ = new Spring(260, 18);
    this.kickRot = new Spring(220, 16);
    this.kickRoll = new Spring(200, 14);
    this.swayX = 0;
    this.swayY = 0;
    this.sprintT = 0;
    this.wallT = 0;
    this.slideZ = new Spring(900, 40);
    this.flashT = 0;
    this.time = 0;
    this.lightScale = 1;
    this.lightCheckT = 0;
    this.currentId = null;
  }

  // Modeli tutucuya yerleştir; parçaların dinlenme konumlarını sakla
  installModel(id, m, fromGlb = false) {
    const old = this.models[id];
    if (old) old.root.removeFromParent();
    m.root.visible = this.currentId === id;
    calibrateWeapon(id, m, fromGlb);
    this.holder.add(m.root);
    m.flash = this.makeFlash(this.textures, WEAPONS[id].flashSize || 0.14);
    m.root.add(m.flash);
    m.flash.position.copy(m.muzzle);
    for (const part of Object.values(m.parts)) if (part) part.userData.base = part.position.clone();
    m.magInfo = this.computeMagInfo(m, WEAPONS[id]);
    m.chargeAt = m.parts.charging ? _box.setFromObject(m.parts.charging).getCenter(new THREE.Vector3()) : null;
    this.addSight(id, m);
    m.root.traverse((o) => {
      if (o.isMesh) o.frustumCulled = false;
    });
    m.glb = fromGlb;
    this.models[id] = m;
  }

  // GLB sahnesinden görünüm modeli: parçalar düğüm adlarıyla, noktalar dışa aktarma JSON'undan
  modelFromGlb(id, scene) {
    const d = WEAPONS[id];
    const rig = rigFor(assetIdFor(d));
    const root = new THREE.Group();
    root.add(scene);
    const parts = {};
    for (const name of ['mag', 'charging', 'slide', 'optic', 'bolt', 'spin', 'pump']) {
      const n = scene.getObjectByName(name);
      if (n) parts[name] = n;
    }
    if (d.envIntensity) {
      scene.traverse((o) => {
        if (o.isMesh) o.material.envMapIntensity = d.envIntensity;
      });
    }
    scene.updateMatrixWorld(true);
    // Döner namlu demeti kendi ekseninde döner: eksen demetin kutu ortası (altı namlu simetrik dizili)
    let spinPivot = null;
    if (parts.spin) {
      const c = _box.setFromObject(parts.spin).getCenter(new THREE.Vector3());
      spinPivot = pivotAround(parts.spin, c.set(c.x, c.y, 0));
    }
    // Sürgü, gövdedeki ekseninde döner (kol kalkar) ve geri çekilir
    let boltPivot = null;
    if (parts.bolt && rig.boltAxis) boltPivot = pivotAround(parts.bolt, rig.boltAxis.clone());
    return {
      root,
      parts,
      muzzle: rig.muzzle,
      sight: rig.sight,
      front: rig.front,
      leftHand: rig.leftHand,
      // Bıçakta köken sapın ortası: el sapı kavrar
      rightHand: d.melee ? new THREE.Vector3(0, -0.004, 0.012) : new THREE.Vector3(0, -0.035, 0.025),
      eject: rig.eject,
      spinPivot,
      boltPivot,
      boltAxis: rig.boltAxis,
      boltHandle: rig.boltHandle,
    };
  }

  // Şarjörün kök uzayındaki ekseni ve tutma noktaları (modelin kendi köşelerinden): üst ve alt uçların ağırlık
  // merkezleri eksen verir (AK'nın öne kıvrık şarjörü öne doğru çıkar), ön üst köşe devrilme ekseni, alt uç (fişek
  // kayışında üst uç) elin tuttuğu yer. Model kurulurken bir kez ölçülür; kök ve tutucu o an birim dönüşümde
  computeMagInfo(m, d) {
    const mag = m.parts.mag;
    if (!mag) return null;
    m.root.updateMatrixWorld(true);
    const inv = _m4.copy(m.root.matrixWorld).invert();
    const pts = [];
    const M = new THREE.Matrix4();
    mag.traverse((o) => {
      if (!o.isMesh) return;
      const P = o.geometry.attributes.position;
      M.multiplyMatrices(inv, o.matrixWorld);
      const step = Math.max(1, Math.floor(P.count / 800));
      for (let i = 0; i < P.count; i += step) pts.push(new THREE.Vector3().fromBufferAttribute(P, i).applyMatrix4(M));
    });
    if (pts.length < 4) return null;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    const band = (maxY - minY) * 0.2;
    const top = new THREE.Vector3();
    const bot = new THREE.Vector3();
    let nt = 0;
    let nb = 0;
    let frontZ = Infinity;
    for (const p of pts) {
      if (p.y >= maxY - band) {
        top.add(p);
        nt++;
        frontZ = Math.min(frontZ, p.z);
      }
      if (p.y <= minY + band) {
        bot.add(p);
        nb++;
      }
    }
    top.divideScalar(nt);
    bot.divideScalar(nb);
    const axis = bot.clone().sub(top);
    if (axis.length() < 0.02) axis.set(0, -1, 0);
    axis.normalize();
    const style = reloadStyle(d);
    return {
      axis,
      pivot: new THREE.Vector3(top.x, maxY, frontZ),
      grip: style.grabTop ? top : bot,
      baseQuat: mag.quaternion.clone(),
    };
  }

  makeShell(r, len, color) {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), mat(color, 0.55, 0.1));
    hull.rotation.x = Math.PI / 2;
    g.add(hull);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.06, r * 1.06, len * 0.22, 10), mat(0xc9a14a, 0.3, 0.85));
    base.rotation.x = Math.PI / 2;
    base.position.z = len * 0.39;
    g.add(base);
    g.visible = false;
    g.traverse((o) => {
      if (o.isMesh) o.frustumCulled = false;
    });
    return g;
  }

  // Nişangâh görselleri (data/sights.json → reticles.js): camdaki işaret (kolimatör, holografik, prizmatik),
  // modelin kapalı nişangâh gövdesinin nişan alırken yerine geçen açık gövdesi ve demir nişangâhın ışıklı noktaları
  addSight(id, m) {
    const d = WEAPONS[id];
    const s = sightFor(id);
    m.reticle = null;
    m.housing = null;
    if (s.housing && m.parts.optic) {
      m.housing = housingMesh(s.housing, s);
      m.housing.position.copy(m.sight);
      m.root.add(m.housing);
    }
    if (hasReticle(id)) {
      // İşaret gez noktasının önünde, gövdenin ortasında: tam nişanda ekran merkezine düşer
      const z = s.housing ? s.housing.len / 2 + SIGHT_VIEW.housingGap : SIGHT_VIEW.reticleZ;
      m.reticle = reticleMesh(s, d.adsDist + z, d.ads.vmFov);
      m.reticle.position.copy(m.sight);
      m.reticle.position.z -= z;
      m.root.add(m.reticle);
    }
    if (s.glow.length) {
      // Tabancada noktalar sürgüyle birlikte geri gider: sürgü parçasının uzayına taşınır
      const dots = glowDots(s, s.glow, s.glowPost);
      const host = m.parts.slide || m.root;
      m.root.updateMatrixWorld(true);
      dots.applyMatrix4(_m4.copy(host.matrixWorld).invert().multiply(m.root.matrixWorld));
      host.add(dots);
    }
  }

  // Haritanın ışığına uy: gecede silah parlak öğlen ışığıyla aydınlanmasın. v: [gök, zemin, şiddet, güneş, şiddet]
  setLighting(v) {
    this.hemi.color.setHex(v[0]);
    this.hemi.groundColor.setHex(v[1]);
    this.hemi.intensity = v[2];
    this.sun.color.setHex(v[3]);
    this.sun.intensity = v[4];
  }

  setEnvironment(tex) {
    this.scene.environment = tex;
    this.scene.environmentIntensity = 0.9;
  }

  makeFlash(T, size) {
    const g = new THREE.Group();
    const mk = (map) =>
      new THREE.MeshBasicMaterial({ map, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, color: new THREE.Color(1.6, 1.3, 1.0) });
    const front = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mk(T.flash));
    g.add(front);
    const sideGeo = new THREE.PlaneGeometry(size * 2, size * 0.9);
    sideGeo.rotateY(Math.PI / 2);
    sideGeo.translate(0, 0, -size);
    const s1 = new THREE.Mesh(sideGeo, mk(T.flashSide));
    const s2 = new THREE.Mesh(sideGeo, mk(T.flashSide));
    s2.rotation.z = Math.PI / 2;
    g.add(s1, s2);
    g.visible = false;
    g.userData.front = front;
    return g;
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  onFire(w) {
    const d = w.data;
    const ads = this.game.player.adsT;
    const posMul = lerp(1, 0.55, ads);
    this.kickZ.impulse(d.recoil.kick * posMul);
    this.kickRot.impulse(d.recoil.kickRot * lerp(1, 0.4, ads) * rand(0.8, 1.2));
    this.kickRoll.impulse(rand(-0.6, 0.6) * d.recoil.kickRot);
    if (d.slide) this.slideZ.impulse(d.id === 'd50' ? 6 : 4.5);
    this.flashT = 0.035;
    const m = this.models[d.id];
    m.flash.visible = true;
    m.flash.rotation.z = Math.random() * Math.PI;
    const s = rand(0.8, 1.25);
    m.flash.scale.set(s, s, rand(0.8, 1.3));
    m.flash.userData.front.visible = ads < 0.8; // ADS'de merkezde görüşü kapatmasın
    this.flash.intensity = 1.2;
  }

  update(dt) {
    const g = this.game;
    const P = g.player;
    const W = g.weapons;
    const w = W.current;
    this.time += dt;
    // Yerdeyken eller ve silah görünmez (sürünme, silah yok)
    this.holder.visible = !P.down;
    if (!w) return;
    const d = w.data;
    const m = this.models[w.id];
    if (this.currentId !== w.id) {
      for (const id in this.models) this.models[id].root.visible = id === w.id;
      this.currentId = w.id;
    }
    // Dürbünlü silahta tam nişanda model gizlenir, dürbün kaplaması görünür
    this.scoped = isScoped(w.id) && P.adsT > SIGHT_VIEW.scopeAt;
    this.holder.visible = P.alive && !P.down && !this.scoped;
    // Tabanca ve elde bıçak tek elle taşınır: koşuda namlu aşağı (tüfek gibi yana dönmez)
    const handgun = (d.category === 'secondary' && !d.projectile) || !!d.melee;

    // --- Temel poz: kalça ↔ nişan ---
    // Minigun ve bıçakta hayalî gez noktasına hizalama yapma; gövde kameranın içine girmesin.
    const ads = canAim(w.id) ? smoothstep(P.adsT) : 0;
    const hip = d.hip.pos;
    const ax = -m.sight.x;
    const ay = -m.sight.y;
    const az = -d.adsDist - m.sight.z;
    _p.set(lerp(hip[0], ax, ads), lerp(hip[1], ay, ads), lerp(hip[2], az, ads));
    // Silaha özgü kalça açısı (hip.rot): ağır silahın namlusu nişangâha doğru döner
    const hr = d.hip.rot;
    let rx = hr ? hr[0] * (1 - ads) : 0;
    let ry = lerp(0.02, 0, ads) + (hr ? hr[1] * (1 - ads) : 0);
    let rz = hr ? hr[2] * (1 - ads) : 0;

    // Koşu pozu
    this.sprintT = damp(this.sprintT, P.sprinting ? 1 : 0, 9, dt);
    const sp = this.sprintT;
    if (handgun) {
      _p.x += -0.02 * sp;
      _p.y += -0.08 * sp;
      rx += -0.7 * sp;
    } else {
      _p.x += -0.05 * sp;
      _p.y += -0.05 * sp;
      _p.z += 0.05 * sp;
      rx += -0.22 * sp;
      ry += 0.6 * sp;
      rz += 0.3 * sp;
    }

    // Yürüme sallantısı (8 figürü)
    const moveAmt = P.grounded ? clamp(P.horizSpeed / 4, 0, 1.7) : 0;
    const bob = moveAmt * (1 - ads * 0.88) * (1 + sp * 0.8);
    const ph = P.stepPhase;
    _p.x += Math.sin(ph) * 0.011 * bob;
    _p.y += -Math.abs(Math.cos(ph)) * 0.011 * bob;
    rz += Math.sin(ph) * 0.025 * bob;
    rx += Math.cos(ph * 2) * 0.01 * bob;
    // Nefes
    const br = 1 - ads * 0.8;
    _p.y += Math.sin(this.time * 1.7) * 0.002 * br;
    rx += Math.sin(this.time * 1.1) * 0.005 * br;
    ry += Math.sin(this.time * 0.8) * 0.003 * br;

    // Sway: fare hareketini gecikmeli takip
    const swayMul = lerp(1, 0.25, ads);
    const tx = clamp(-P.lookDX * 0.0009, -0.09, 0.09) * swayMul;
    const ty = clamp(-P.lookDY * 0.0009, -0.07, 0.07) * swayMul;
    this.swayX = damp(this.swayX, tx, 10, dt);
    this.swayY = damp(this.swayY, ty, 10, dt);
    ry += this.swayX;
    rx += this.swayY;
    rz += this.swayX * 0.8;
    _p.x += this.swayX * 0.12;
    _p.y += this.swayY * 0.08;
    // Yana hareket eğimi
    const localVX = P.vel.x * Math.cos(P.yaw) - P.vel.z * Math.sin(P.yaw);
    rz += -clamp(localVX, -6, 6) * 0.012 * (1 - ads * 0.7);
    // Zıplama/iniş
    _p.y += P.landDip * 0.35 - clamp(P.vel.y * 0.006, -0.03, 0.03);
    // Çömelince hafif yatır
    rz += P.crouchT * 0.05 * (1 - ads);

    // Geri tepme yayları
    const kz = this.kickZ.update(dt);
    const kr = this.kickRot.update(dt);
    const kroll = this.kickRoll.update(dt);
    _p.z += kz * 0.03;
    _p.y += kr * 0.004;
    rx += kr * 0.045;
    rz += kroll * 0.01;

    // Duvara yaklaşınca geri çek
    this.lightCheckT -= dt;
    if (this.lightCheckT <= 0) {
      this.lightCheckT = 0.08;
      const cam = g.camera;
      cam.getWorldPosition(_v);
      cam.getWorldDirection(_v2);
      const h = g.world.raycast(_v, _v2, 1.0, _hit);
      this.wallTarget = h ? clamp(1 - (h.dist - 0.3) / 0.6, 0, 1) : 0;
      // İç mekân mı? Güneşe doğru ışın: kapalıysa silah aydınlatmasını kıs
      const inShade = g.world.raycast(_v, g.sunDir, 60, _hit);
      this.lightTarget = inShade ? 0.25 : 1;
    }
    this.wallT = damp(this.wallT, this.wallTarget || 0, 10, dt);
    this.lightScale = damp(this.lightScale, this.lightTarget ?? 1, 4, dt);
    const wall = this.wallT * (1 - ads * 0.6);
    _p.z += wall * 0.14;
    _p.y += -wall * 0.03;
    rx += wall * 0.55;

    // Equip / unequip
    let e = 0;
    if (W.state === 'equipping') e = 1 - smoothstep(clamp(W.stateT / d.equipTime, 0, 1));
    else if (W.state === 'unequipping') e = smoothstep(clamp(W.stateT / (d.unequipTime * 0.8), 0, 1));
    _p.y -= e * 0.32;
    rx -= e * 0.9;
    rz += e * 0.25;

    // Etkileşimde ve sarf malzemesi takılırken silahı indir
    this.interactT = damp(this.interactT || 0, P.interacting || P.usingItem ? 1 : 0, 10, dt);
    _p.y -= this.interactT * 0.14;
    rx -= this.interactT * 0.6;

    // Sol el hedefi (varsayılan: tutamak); sağ el sürgü çekerken sürgü koluna gider
    let leftOverride = null;
    let rightOverride = null;
    // Parça animasyonları: her karede dinlenme konumuna dön
    for (const part of Object.values(m.parts)) {
      if (part && part.userData.base) part.position.copy(part.userData.base);
    }
    if (m.parts.mag) {
      m.parts.mag.visible = true;
      if (m.magInfo) m.parts.mag.quaternion.copy(m.magInfo.baseQuat);
    }
    const pumpBase = m.parts.pump ? m.parts.pump.userData.base.z : 0;
    this.shells.shotgun.visible = false;
    this.shells.rifle.visible = false;
    this.rocket.visible = false;
    _pose.dx = _pose.dy = _pose.dz = _pose.rx = _pose.ry = _pose.rz = 0;
    _pose.left = null;
    _pose.right = null;

    // Elde bıçak: sol tıkla savuruş (sağdan sola, sonra soldan sağa)
    if (d.melee && W.state === 'melee' && W.meleeKnife) sampleKeys(SLASH_KEYS[W.slashSide] || SLASH_KEYS[0], clamp(W.stateT / d.melee.time, 0, 1), _pose);

    const info = W.reloadInfo();
    let boltK = -1; // boş şarjör değişiminin sonunda sürgü çekme ilerlemesi (sürgülü tüfek)
    if (info && info.type === 'mag' && d.projectile) {
      if (m.parts.warhead) this.poseWarhead(m, info);
      else this.poseRocket(m, info);
    } else if (info && info.type === 'mag') {
      boltK = this.poseMagReload(m, d, info);
    } else if (info && info.type === 'shell') {
      this.poseShellReload(m, d, info);
    }
    // Şarjör oturunca silah hafifçe sıçrar (avuç darbesi); boşta kurma kolu bırakılınca da
    if (info && info.type === 'mag') {
      const prev = this.prevReloadK;
      const S = reloadStyle(d);
      const rel = RT.charge[0] + 0.12;
      if (prev >= 0 && prev < info.insertAt && info.k >= info.insertAt) {
        this.kickRot.impulse(RELOAD_BUMP.seat);
        this.kickZ.impulse(RELOAD_BUMP.seatZ);
      }
      if (info.empty && (S.charge === 'handle' || S.charge === 'slap') && prev >= 0 && prev < rel && info.k >= rel) this.kickRot.impulse(RELOAD_BUMP.charge);
      this.prevReloadK = info.k;
    } else this.prevReloadK = -1;
    _p.x += _pose.dx;
    _p.y += _pose.dy;
    _p.z += _pose.dz;
    rx += _pose.rx;
    ry += _pose.ry;
    rz += _pose.rz;
    if (_pose.left) leftOverride = _pose.left;
    if (_pose.right) rightOverride = _pose.right;
    if (m.parts.warhead && !info) m.parts.warhead.visible = w.mag > 0;
    // Nişangâh: kapalı gövde nişan alırken açık gövdeyle değişir; camdaki işaret nişana girerken belirir
    if (m.housing) {
      const swap = ads > SIGHT_VIEW.housingSwap;
      m.parts.optic.visible = !swap;
      m.housing.visible = swap;
    }
    if (m.reticle) {
      const k = clamp((ads - SIGHT_VIEW.reticleFrom) / SIGHT_VIEW.reticleFade, 0, 1);
      m.reticle.material.opacity = k;
      m.reticle.visible = k > 0;
    }
    // Pompa (atıştan sonra)
    if (m.parts.pump && w.pumpT >= 0) {
      const t = w.pumpT - d.pumpDelay;
      if (t > 0) {
        const pk = envelope(t / 0.32, 0, 0.4, 0.5, 1);
        m.parts.pump.position.z = pumpBase + pk * 0.09;
        rx += pk * 0.05;
      }
    }
    if (m.parts.pump) {
      _v.copy(m.leftHand);
      _v.z += m.parts.pump.position.z - pumpBase;
      if (!leftOverride) leftOverride = _v.clone();
    }
    // Döner namlu demeti: hız silahın spin değerinden; ateşte silah titrer
    if (m.spinPivot && d.spin) {
      m.spinPivot.rotation.z = (m.spinPivot.rotation.z - w.spin * d.spin.rps * Math.PI * 2 * dt) % (Math.PI * 2);
      const firing = W.time - w.lastShot < 0.06;
      if (firing) {
        _p.x += (Math.random() - 0.5) * 0.004;
        _p.y += (Math.random() - 0.5) * 0.004;
        rz += (Math.random() - 0.5) * 0.01;
      }
    }
    // Sürgü: kol kalkar, sürgü geri çekilir ve itilir, kol iner; sağ el kolu tutar, silah hafifçe yatar
    if (m.boltPivot && d.bolt) {
      const bk = boltK >= 0 ? boltK : W.boltInfo();
      const B = d.bolt;
      let lift = 0;
      let pull = 0;
      if (bk >= 0) {
        lift = envelope(bk, 0, 0.16, 0.8, 0.96) * B.lift;
        pull = envelope(bk, 0.18, 0.42, 0.5, 0.76) * B.travel;
        const tilt = envelope(bk, 0, 0.12, 0.85, 1);
        rz += -0.2 * tilt;
        rx += 0.06 * tilt;
        _p.x += -0.015 * tilt;
        if (m.boltHandle) {
          _v.copy(m.boltHandle).sub(m.boltAxis).applyAxisAngle(_Z, lift).add(m.boltAxis);
          _v.z += pull;
          rightOverride = _v2.copy(m.rightHand).lerp(_v, envelope(bk, 0, 0.1, 0.86, 1)).clone();
        }
      }
      m.boltPivot.rotation.z = lift;
      m.boltPivot.position.z = m.boltPivot.userData.base.z + pull;
    }
    // Tabanca sürgüsü
    if (m.parts.slide) {
      const sz = this.slideZ.update(dt);
      const travel = d.id === 'd50' ? 0.045 : 0.035;
      m.parts.slide.position.z = m.parts.slide.userData.base.z + (w.slideLocked ? travel : clamp(sz * 0.006, 0, travel));
    }

    // Hızlı bıçak (V): sol el bıçağı savururken silah sağ alta iner. Model yoksa dipçik darbesi. Elde bıçak varken
    // savuruşu bıçağın kendisi yapar (yukarıda)
    const quick = W.state === 'melee' && !W.meleeKnife;
    const knifeOn = quick && !!this.knife && W.stateT < KNIFE_END;
    if (this.knife) this.knife.visible = knifeOn;
    if (quick && this.knife) {
      const s = envelope(W.stateT, 0, 0.08, 0.38, 0.56);
      _p.x += 0.1 * s;
      _p.y += -0.15 * s;
      rz += -0.3 * s;
      rx += -0.2 * s;
      if (knifeOn) this.poseKnife(W.stateT);
    } else if (quick) {
      const k = clamp(W.stateT / 0.42, 0, 1);
      const s = k < 0.3 ? smoothstep(k / 0.3) : 1 - smoothstep((k - 0.3) / 0.7);
      _p.x += -0.1 * s;
      _p.y += 0.03 * s;
      _p.z += -0.16 * s;
      ry += 0.7 * s;
      rz += -0.5 * s;
      rx += 0.15 * s;
    }
    // El bombası
    const cooking = W.state === 'cooking';
    const throwing = W.state === 'throwing';
    // Eldeki bomba: el bombası ya da sis (sarf yuvasından)
    const nade = W.throwKind === 'smoke' ? this.smokeNade : this.grenade;
    (nade === this.grenade ? this.smokeNade : this.grenade).visible = false;
    nade.visible = cooking || (throwing && W.stateT < 0.12);
    if (cooking || throwing) {
      const k = cooking ? smoothstep(clamp(W.stateT / 0.2, 0, 1)) : 1 - smoothstep(clamp(W.stateT / 0.42, 0, 1));
      _p.y -= 0.18 * k;
      _p.x += 0.06 * k;
      rx -= 0.5 * k;
      const gx = throwing ? lerp(-0.2, 0.0, clamp(W.stateT / 0.12, 0, 1)) : -0.2;
      const gz = throwing ? lerp(-0.45, -0.8, clamp(W.stateT / 0.12, 0, 1)) : -0.45 + Math.sin(this.time * 3) * 0.005;
      nade.position.set(gx, -0.13 + (throwing ? 0.1 : 0), gz);
      nade.rotation.set(0.3, 0.4, 0);
    }

    // --- Uygula ---
    // Nişanda dönüşler gez noktası etrafında: geri tepme ve sallantı silahı oynatır ama gez ekran merkezinden
    // (merminin gittiği yer) kaçmaz. Gez → arpacık çizgisi kamera eksenine oturur (sightAlign)
    _r.set(rx, ry, rz);
    placeWeapon(m.root, _p, _r, m.sight, m.adsAlign, ads);
    if (m.flash.visible) {
      this.flashT -= dt;
      if (this.flashT <= 0) {
        m.flash.visible = false;
      }
    }
    this.flash.intensity = Math.max(0, this.flash.intensity - dt * 30);
    _v.copy(m.muzzle).applyMatrix4(m.root.matrix);
    this.flash.position.copy(_v);

    // Kollar
    const rightHand = _v.copy(rightOverride || m.rightHand).applyMatrix4(m.root.matrix).clone();
    const leftLocal = leftOverride || m.leftHand;
    const leftHand = _v2.copy(leftLocal).applyMatrix4(m.root.matrix).clone();
    const elbowR = new THREE.Vector3(_p.x + 0.09, _p.y - 0.24, _p.z + 0.34);
    const elbowL =
      handgun
        ? new THREE.Vector3(_p.x - 0.2, _p.y - 0.28, _p.z + 0.22)
        : new THREE.Vector3(_p.x - 0.22, _p.y - 0.32, leftHand.z + 0.36);
    if (cooking || throwing) {
      leftHand.copy((W.throwKind === 'smoke' ? this.smokeNade : this.grenade).position).add(_v.set(0.01, -0.04, 0.05));
      elbowL.set(-0.3, -0.35, leftHand.z + 0.3);
    }
    if (knifeOn) {
      // Sol el bıçağın sapını kavrar (bıçağın kökeni sap ortası); dirsek elin altında ve gerisinde
      leftHand.copy(this.knife.position);
      elbowL.set(leftHand.x - 0.16, leftHand.y - 0.3, leftHand.z + 0.32);
    }
    // El sırtı yönleri: sağ el kabzayı yandan kavrar, sol el kundağı alttan tutar (tabancada sağ eli sarar)
    _upR.set(0.45, 1, 0.1);
    if (cooking || throwing) _upL.set(0.2, 1, 0);
    else if (knifeOn) _upL.set(-0.4, 1, 0);
    else if (handgun) _upL.set(-0.7, 0.6, 0);
    else if (d.hip.leftGrip === 'vertical') _upL.set(-1, 0.15, 0.2); // dikey tutamak: el sırtı sola, parmaklar sarar
    else _upL.set(-0.35, -1, 0);
    // Şarjör, sürgü ve bomba animasyonunda serbest bileğe yumuşak geç; normal tutuşta silaha kilitle.
    const freeLeft = !!info || quick || cooking || throwing || knifeOn;
    const freeRight = !!rightOverride || cooking || throwing;
    m.leftGripBlend = damp(m.leftGripBlend ?? 1, freeLeft ? 0 : 1, HAND_VIEW.blendRate, dt);
    m.rightGripBlend = damp(m.rightGripBlend ?? 1, freeRight ? 0 : 1, HAND_VIEW.blendRate, dt);
    const rightGrip = m.rightGrip ? _qa.copy(m.root.quaternion).multiply(m.rightGrip) : null;
    poseArm(this.arms.right, elbowR, rightHand, _upR, rightGrip, m.rightGripBlend);
    // Elde bıçakta sol el boştur (ekran dışında); el bombası atarken görünür
    this.arms.left.g.visible = !d.melee || cooking || throwing;
    const leftGrip = m.leftGrip ? _qa.copy(m.root.quaternion).multiply(m.leftGrip) : null;
    poseArm(this.arms.left, elbowL, leftHand, _upL, leftGrip, m.leftGripBlend);

    // Kamera ve ışık
    const cam = g.camera;
    const vmFovBase = 60;
    const f = lerp(vmFovBase, d.ads.vmFov, ads);
    if (Math.abs(this.camera.fov - f) > 0.01) {
      this.camera.fov = f;
      this.camera.updateProjectionMatrix();
    }
    // Güneş yönünü kamera uzayına çevir
    _q.copy(cam.quaternion).invert();
    _v.copy(g.sunDir).applyQuaternion(_q);
    this.sun.position.copy(_v).multiplyScalar(5);
    this.sun.target.position.set(0, 0, 0);
    this.sun.intensity = 2.6 * this.lightScale;
    this.hemi.intensity = 0.9 + 0.7 * this.lightScale;
  }

  // Şarjörün o anki dönüşü (q) ve ofseti (o), kök uzayında: eksen boyunca off, ön üst köşe çevresinde rock,
  // getirilirken far (1 → aşağıda/solda), bırakılınca fall (aşağı düşüş)
  magTransform(mi, off, rock, far, fall, q, o, F = MAG_FETCH) {
    q.setFromAxisAngle(_X, rock);
    o.copy(mi.axis).multiplyScalar(off);
    o.x += F[0] * far - 0.05 * fall;
    o.y += F[1] * far - fall;
    o.z += F[2] * far;
  }

  // Elin şarjörü tuttuğu nokta (verilen dönüş/ofsetle), avuç şarjörün altında
  gripPoint(mi, S, q, o, out) {
    return out
      .copy(mi.grip)
      .sub(mi.pivot)
      .applyQuaternion(q)
      .add(mi.pivot)
      .add(o)
      .addScaledVector(mi.axis, S.grabTop ? -0.02 : 0.025);
  }

  // Şarjörlü silah (HALO örneği): silah yatar ve iner; sol el şarjörü kendi ekseni boyunca çeker (AK'da öne
  // devirerek), bırakır, yenisini aşağıdan getirir, yuvaya oturtur (o anda cephane geçer, silah sıçrar), kundağa
  // döner. Tabancada boş şarjör kendiliğinden düşer. Şarjör boşsa sonda kurma kolu çekilir / vurulur ya da sürgü
  // çekilir. Dönüş: sürgü çekme ilerlemesi (0..1) ya da -1
  poseMagReload(m, d, info) {
    const S = reloadStyle(d);
    const R = _pose;
    const k = info.k;
    const I = info.insertAt;
    const s = envelope(k, 0, RT.tiltIn, RT.tiltOut, 1);
    R.rx += S.tilt[0] * s;
    R.ry += S.tilt[1] * s;
    R.rz += S.tilt[2] * s;
    R.dx += S.lift[0] * s;
    R.dy += S.lift[1] * s;
    R.dz += S.lift[2] * s;
    const mi = m.magInfo;
    const mag = m.parts.mag;
    const base = m.leftHand;
    const b0 = I - RT.bring;
    const b1 = I - RT.seat;
    let hand = null;
    if (mi && mag) {
      let off = 0;
      let rock = 0;
      let far = 0;
      let fall = 0;
      let vis = true;
      if (S.drop) {
        if (k > RT.grab[0] && k < RT.toss[1]) {
          const u = (k - RT.grab[0]) / (RT.toss[1] - RT.grab[0]);
          off = S.drop * u * u;
        } else if (k >= RT.toss[1] && k < b0) vis = false;
      } else if (k >= RT.pull[0] && k < RT.pull[1]) {
        const u = smoothstep((k - RT.pull[0]) / (RT.pull[1] - RT.pull[0]));
        off = S.out * u;
        rock = S.rock * smoothstep(Math.min(1, u * 2));
      } else if (k >= RT.pull[1] && k < RT.toss[1]) {
        const u = (k - RT.pull[1]) / (RT.toss[1] - RT.pull[1]);
        off = S.out;
        rock = S.rock;
        fall = 0.3 * u * u;
      } else if (k >= RT.toss[1] && k < b0) vis = false;
      if (k >= b0 && k < b1) {
        off = S.out;
        rock = S.rock;
        far = 1 - smoothstep((k - b0) / (b1 - b0));
      } else if (k >= b1 && k < I) {
        const u = smoothstep((k - b1) / (I - b1));
        off = S.out * (1 - u);
        rock = S.rock * (1 - smoothstep(clamp(u * 2 - 1, 0, 1)));
      }
      this.magTransform(mi, off, rock, far, fall, _mq, _mo, S.fetch);
      mag.visible = vis;
      if (vis && (off || rock || far || fall)) {
        mag.position.copy(mag.userData.base).sub(mi.pivot).applyQuaternion(_mq).add(mi.pivot).add(_mo);
        mag.quaternion.copy(_mq).multiply(mi.baseQuat);
      }
      // Sol el: kundaktan şarjöre, şarjörle birlikte, yenisini almaya (aşağı), yenisiyle yuvaya, kundağa geri
      if (k >= RT.grab[0] && k < I + RT.ret) {
        this.magTransform(mi, S.out, S.rock, 1, 0, _q, _v, S.fetch);
        const fetch = this.gripPoint(mi, S, _q, _v, _g2);
        const cur = () => this.gripPoint(mi, S, _mq, _mo, _hand);
        if (k >= I) {
          this.magTransform(mi, 0, 0, 0, 0, _q, _v);
          this.gripPoint(mi, S, _q, _v, _g);
          hand = _hand.copy(_g).lerp(base, smoothstep((k - I) / RT.ret));
        } else if (k >= b0) hand = cur();
        else if (S.drop) hand = _hand.copy(base).lerp(fetch, smoothstep(clamp((k - RT.grab[0]) / (RT.toss[1] - RT.grab[0]), 0, 1)));
        else if (k < RT.grab[1]) {
          this.magTransform(mi, 0, 0, 0, 0, _q, _v);
          this.gripPoint(mi, S, _q, _v, _g);
          hand = _hand.copy(base).lerp(_g, smoothstep((k - RT.grab[0]) / (RT.grab[1] - RT.grab[0])));
        } else if (k < RT.pull[1]) hand = cur();
        else if (k < RT.toss[1]) {
          this.magTransform(mi, S.out, S.rock, 0, 0, _q, _v);
          this.gripPoint(mi, S, _q, _v, _g);
          hand = _hand.copy(_g).lerp(fetch, smoothstep((k - RT.pull[1]) / (RT.toss[1] - RT.pull[1])));
        } else hand = _hand.copy(fetch);
      }
    }
    // Boş şarjör: kurma kolu (çek-bırak ya da vur), sürgülü tüfekte sürgü
    let boltK = -1;
    const [c0, c1] = RT.charge;
    if (info.empty && k >= c0 && k < c1) {
      if (S.charge === 'bolt') boltK = (k - c0) / (c1 - c0);
      else if ((S.charge === 'handle' || S.charge === 'slap') && m.chargeAt) {
        const reach = envelope(k, c0, c0 + 0.05, c1 - 0.06, c1);
        const back = S.charge === 'slap' ? envelope(k, c0 + 0.05, c0 + 0.09, c0 + 0.1, c0 + 0.12) : envelope(k, c0 + 0.05, c0 + 0.1, c0 + 0.11, c0 + 0.13);
        const travel = 0.065 * back;
        const ch = m.parts.charging;
        if (ch) ch.position.z = ch.userData.base.z + travel;
        _g.copy(m.chargeAt);
        _g.y += 0.012;
        _g.z += travel + 0.02;
        hand = _hand.copy(hand || base).lerp(_g, reach);
        R.rz += 0.12 * reach;
        R.ry -= 0.06 * reach;
      }
    }
    if (hand) R.left = hand;
    return boltK;
  }

  // Fişek fişek doldurma (pompalı, pompalı nişancı): silah sola yatar; her fişekte sol el fişeği aşağıdan getirip
  // yükleme penceresinden tüpe iter. Pencere ve itme yönü veriden (loadPort, loadDir)
  poseShellReload(m, d, info) {
    const R = _pose;
    const k = info.k;
    let tilt = 1;
    if (info.phase === 'start') tilt = smoothstep(k);
    else if (info.phase === 'end') tilt = 1 - smoothstep(k);
    const S = RELOAD_STYLES.shell;
    R.rx += tilt * S.tilt[0];
    R.ry += tilt * S.tilt[1];
    R.rz += tilt * (d.loadRoll ?? -0.55);
    R.dx += tilt * S.lift[0];
    R.dy += tilt * S.lift[1];
    R.dz += tilt * S.lift[2];
    if (info.phase === 'loop') {
      const shell = this.shells[d.shell] || this.shells.shotgun;
      if (shell.parent !== m.root) m.root.add(shell);
      const port = _g.fromArray(d.loadPort || [0, -0.008, -0.1]);
      const dir = _g2.fromArray(d.loadDir || [0, 0, -1]);
      const up = smoothstep(clamp(k / 0.45, 0, 1));
      const push = smoothstep(clamp((k - 0.45) / 0.25, 0, 1));
      const down = smoothstep(clamp((k - 0.7) / 0.3, 0, 1));
      // Fişek pencereye arkasından girer: önce pencerenin gerisinde (−dir), aşağıdan yükselir, sonra dir yönünde içeri
      shell.visible = k < 0.68;
      shell.position.copy(port).addScaledVector(dir, -0.05 + 0.08 * push);
      shell.position.y -= 0.11 * (1 - up);
      shell.quaternion.setFromUnitVectors(_NEG_Z, dir);
      shell.rotateX(0.6 * (1 - up));
      // Sol el fişeğin dibini başparmakla iter; fişek girince aşağı iner (sonraki fişeği almaya)
      _hand.copy(shell.position).addScaledVector(dir, -0.035);
      _hand.y -= 0.025;
      if (down > 0) _hand.lerp(_v.copy(port).setY(port.y - 0.13), down);
      R.left = _hand;
      R.rx += push * (1 - down) * 0.03;
    }
    if (info.phase === 'end' && info.empty && m.parts.pump) {
      const pk = envelope(k, 0.2, 0.45, 0.5, 0.8);
      m.parts.pump.position.z = m.parts.pump.userData.base.z + pk * 0.09;
    }
  }

  // Bazuka (arkadan dolar): tüp öne ve sola savrulur, arka ağzı ekranın solunda görünür; sol el roketi aşağıdan
  // getirip arka ağızdan tüpe sürer (I anında içeride), tüp omuza döner
  poseRocket(m, info) {
    const R = _pose;
    const k = info.k;
    const I = info.insertAt;
    // Konum dönüşten önce gider, dönüşten sonra geri gelir: tüpün arka ucu kameranın içinden geçmez
    const sp = envelope(k, 0, 0.1, 0.88, 1);
    const sr = envelope(k, 0.04, 0.2, 0.76, 0.92);
    const S = RELOAD_STYLES.rocket;
    R.rx += S.tilt[0] * sr;
    R.ry += S.tilt[1] * sr;
    R.rz += S.tilt[2] * sr;
    R.dx += S.lift[0] * sp;
    R.dy += S.lift[1] * sp;
    R.dz += S.lift[2] * sp;
    const rk = this.rocket;
    if (rk.parent !== m.root) m.root.add(rk);
    const rear = m.eject;
    const dir = _g2.copy(m.muzzle).sub(rear).normalize(); // arkadan namluya
    const t0 = 0.22;
    const t1 = I - 0.15;
    if (k >= t0 && k < I + 0.02) {
      rk.visible = k < I;
      const bring = smoothstep(clamp((k - t0) / (t1 - t0), 0, 1));
      const push = smoothstep(clamp((k - t1) / (I - t1), 0, 1));
      // Hizada: roketin burnu arka ağızda (roketin yarısı 0,2 m); getirilirken aşağıda ve geride
      rk.position.copy(rear).addScaledVector(dir, -0.24 + 0.5 * push);
      rk.position.y -= 0.22 * (1 - bring);
      rk.position.z += 0.12 * (1 - bring);
      rk.quaternion.setFromUnitVectors(_NEG_Z, dir);
      _hand.copy(rk.position).addScaledVector(dir, -0.17);
      _hand.y -= 0.03;
      R.left = _hand;
    } else if (k >= I + 0.02 && k < I + 0.16) {
      // El roketi bıraktı: tutamağa döner
      _hand.copy(rear).addScaledVector(dir, 0.33);
      _hand.y -= 0.03;
      R.left = _hand.lerp(m.leftHand, smoothstep((k - I - 0.02) / 0.14));
    }
  }

  // Kodla kurulmuş roketatar (bazuka modeli inmezse): tüp iner, harp başlığı önden takılır
  poseWarhead(m, info) {
    const R = _pose;
    const k = info.k;
    const tilt = envelope(k, 0, 0.15, 0.8, 1);
    R.rx += -tilt * 0.35;
    R.rz += tilt * 0.25;
    R.dy += -0.06 * tilt;
    const wh = m.parts.warhead;
    const s = smoothstep(clamp((k - 0.3) / 0.28, 0, 1));
    wh.visible = k > 0.3;
    wh.position.z = wh.userData.base.z - 0.45 * (1 - s);
    wh.position.y = wh.userData.base.y - 0.1 * (1 - s);
    if (k > 0.25 && k < info.insertAt + 0.1) R.left = _hand.copy(wh.position).add(_v2.set(-0.03, -0.06, 0.06));
  }

  // Bıçağı t anındaki anahtar kareye yerleştir (iki kare arası yumuşak geçiş)
  poseKnife(t) {
    let i = 0;
    while (i < KNIFE_KEYS.length - 2 && t > KNIFE_KEYS[i + 1].t) i++;
    const a = KNIFE_KEYS[i];
    const b = KNIFE_KEYS[i + 1];
    const k = smoothstep(clamp((t - a.t) / (b.t - a.t), 0, 1));
    this.knife.position.set(lerp(a.pos[0], b.pos[0], k), lerp(a.pos[1], b.pos[1], k), lerp(a.pos[2], b.pos[2], k));
    this.knife.rotation.set(lerp(a.rot[0], b.rot[0], k), lerp(a.rot[1], b.rot[1], k), lerp(a.rot[2], b.rot[2], k));
  }

  render(renderer) {
    // Gölgelendirici ilk savuruşta takılmasın: bıçak yüklendikten sonra ilk çizimde bir kez derlenir
    // (derleme yalnız görünür nesnelere bakar)
    if (this.knife && !this.knifeWarm) {
      this.knifeWarm = true;
      const was = this.knife.visible;
      this.knife.visible = true;
      renderer.compile(this.scene, this.camera);
      this.knife.visible = was;
    }
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  }
}
