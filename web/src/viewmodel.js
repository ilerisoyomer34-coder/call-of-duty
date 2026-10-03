// Birinci şahıs silah/kol görünümü ve prosedürel animasyon katmanı (master prompt §4.7):
// sway, bob, nefes, geri tepme yayı, ADS hizalama, koşu pozu, duvar geri çekme,
// prosedürel reload, equip/unequip, pompa/sürgü hareketi, bıçak, el bombası.
// Ayrı sahnede çizilir: silah duvarların içine girmez.
import * as THREE from 'three';
import { buildWeapon, buildArms, poseArm, buildGrenade, buildSmokeGrenade } from './models.js';
import { WEAPONS, WEAPON_ORDER } from './config.js';
import { preloadWeapons, rigFor, assetIdFor, loadWeaponAsset } from './assets.js';
import { clamp, damp, lerp, smoothstep, Spring, rand, warnOnce } from './util.js';

const _p = new THREE.Vector3();
const _r = new THREE.Euler();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _upR = new THREE.Vector3(); // el sırtı yön ipuçları (poseArm)
const _upL = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _hit = {};

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

export class Viewmodel {
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
    this.holder.add(m.root);
    m.flash = this.makeFlash(this.textures, WEAPONS[id].flashSize || 0.14);
    m.root.add(m.flash);
    m.flash.position.copy(m.muzzle);
    if (m.dot) m.dot.scale.setScalar(0.75);
    for (const part of Object.values(m.parts)) if (part) part.userData.base = part.position.clone();
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
    for (const name of ['mag', 'charging', 'slide', 'optic']) {
      const n = scene.getObjectByName(name);
      if (n) parts[name] = n;
    }
    let dot = null;
    if (d.reticle === 'dot') {
      // Nişangah ekseninde kırmızı nokta: ADS'de tam ekran merkezine düşer
      dot = new THREE.Mesh(new THREE.CircleGeometry(0.0011, 12), new THREE.MeshBasicMaterial({ color: 0xff2a1a, depthTest: false }));
      dot.position.copy(rig.sight).add(new THREE.Vector3(0, 0, d.id === 'lmg' ? -0.1 : -0.03));
      dot.renderOrder = 6;
      root.add(dot);
    }
    // Modeldeki nişangah kapalı bir gövde: nişan alırken yerine içinden bakılabilen açık tüp çizilir
    let adsRing = null;
    if (parts.optic && d.adsRing) {
      const g = new THREE.CylinderGeometry(d.adsRing.r, d.adsRing.r, d.adsRing.len, 24, 1, true);
      g.rotateX(Math.PI / 2);
      adsRing = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x151719, roughness: 0.45, metalness: 0.6, side: THREE.DoubleSide }));
      adsRing.position.copy(rig.sight).add(new THREE.Vector3(0, 0, -d.adsRing.len / 2 - 0.004));
      adsRing.visible = false;
      root.add(adsRing);
    }
    if (d.envIntensity) {
      scene.traverse((o) => {
        if (o.isMesh) o.material.envMapIntensity = d.envIntensity;
      });
    }
    return {
      root,
      parts,
      muzzle: rig.muzzle,
      sight: rig.sight,
      leftHand: rig.leftHand,
      rightHand: new THREE.Vector3(0, -0.035, 0.025),
      eject: rig.eject,
      dot,
      adsRing,
    };
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
    if (!w) return;
    const d = w.data;
    const m = this.models[w.id];
    if (this.currentId !== w.id) {
      for (const id in this.models) this.models[id].root.visible = id === w.id;
      this.currentId = w.id;
    }
    // Dürbünlü silahta tam nişanda model gizlenir, dürbün kaplaması görünür
    this.scoped = !!d.scope && P.adsT > 0.86;
    this.holder.visible = P.alive && !this.scoped;
    const handgun = d.category === 'secondary' && !d.projectile;

    // --- Temel poz: kalça ↔ nişan ---
    const ads = smoothstep(P.adsT);
    const hip = d.hip.pos;
    const ax = -m.sight.x;
    const ay = -m.sight.y;
    const az = -d.adsDist - m.sight.z;
    _p.set(lerp(hip[0], ax, ads), lerp(hip[1], ay, ads), lerp(hip[2], az, ads));
    let rx = 0;
    let ry = lerp(0.02, 0, ads);
    let rz = 0;

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

    // Sol el hedefi (varsayılan: tutamak)
    let leftOverride = null;
    // Parça animasyonları: her karede dinlenme konumuna dön
    for (const part of Object.values(m.parts)) {
      if (part && part.userData.base) part.position.copy(part.userData.base);
    }
    if (m.parts.mag) m.parts.mag.visible = true;
    const chargeBase = m.parts.charging ? m.parts.charging.userData.base.z : 0;
    const pumpBase = m.parts.pump ? m.parts.pump.userData.base.z : 0;

    const info = W.reloadInfo();
    if (info && info.type === 'mag' && d.projectile) {
      // Roketatar: tüpü indir, yeni harp başlığını önden tak
      const k = info.k;
      const tilt = envelope(k, 0, 0.15, 0.8, 1);
      rx += -tilt * 0.35;
      rz += tilt * 0.25;
      _p.y += -0.06 * tilt;
      const wh = m.parts.warhead;
      const s = smoothstep(clamp((k - 0.3) / 0.28, 0, 1));
      wh.visible = k > 0.3;
      wh.position.z = wh.userData.base.z - 0.45 * (1 - s);
      wh.position.y = wh.userData.base.y - 0.1 * (1 - s);
      if (k > 0.25 && k < info.insertAt + 0.1) {
        leftOverride = _v.copy(wh.position).add(_v2.set(-0.03, -0.06, 0.06)).clone();
      }
    } else if (info && info.type === 'mag' && m.parts.mag) {
      const k = info.k;
      const tilt = envelope(k, 0, 0.16, 0.82, 1);
      rz += tilt * (handgun ? 0.35 : 0.6);
      rx += tilt * 0.18;
      ry += tilt * 0.12;
      _p.y += -0.025 * tilt;
      _p.x += -0.02 * tilt;
      const mag = m.parts.mag;
      const baseY = mag.userData.base.y;
      const ins = info.insertAt;
      let magOff = 0;
      if (k > 0.1 && k < 0.32) {
        magOff = -smoothstep((k - 0.1) / 0.22) * 0.28;
      } else if (k >= 0.32 && k < ins - 0.2) {
        magOff = -0.28;
        mag.visible = false;
      } else if (k >= ins - 0.2 && k < ins) {
        magOff = -0.22 * (1 - smoothstep((k - (ins - 0.2)) / 0.2));
      }
      mag.position.y = baseY + magOff;
      // Sol el şarjörü takip eder
      if (k > 0.08 && k < ins + 0.08) {
        _v.copy(m.leftHand);
        const toMag = envelope(k, 0.08, 0.14, ins, ins + 0.08);
        _v2.set(mag.position.x - 0.03, mag.position.y - 0.08, mag.position.z + 0.02);
        if (k >= 0.32 && k < ins - 0.2) _v2.set(-0.05, baseY - 0.35 + (k - 0.32) * 0.3, mag.position.z);
        _v.lerp(_v2, toMag);
        leftOverride = _v.clone();
      }
      if (info.empty && m.parts.charging && k > 0.72 && k < 0.95) {
        const c = envelope(k, 0.74, 0.8, 0.83, 0.9);
        m.parts.charging.position.z = chargeBase + c * 0.07;
        const toCh = envelope(k, 0.72, 0.76, 0.88, 0.95);
        _v.copy(m.leftHand).lerp(_v2.set(-0.02, 0.07, 0.06 + c * 0.07), toCh);
        leftOverride = _v.clone();
      }
      if (info.empty && d.slide && k > 0.8) this.slideZ.x = Math.max(0, this.slideZ.x * 0.5);
    } else if (info && info.type === 'shell') {
      const k = info.k;
      let tilt = 1;
      if (info.phase === 'start') tilt = smoothstep(k);
      else if (info.phase === 'end') tilt = 1 - smoothstep(k);
      rz += -tilt * 0.55;
      rx += tilt * 0.12;
      _p.x += -0.03 * tilt;
      _p.y += -0.02 * tilt;
      if (info.phase === 'loop') {
        // Fişeği yükleme penceresine it
        const push = k < 0.5 ? smoothstep(k / 0.5) : 1 - smoothstep((k - 0.5) / 0.5);
        _v.set(0.0, -0.09 + push * 0.06, -0.08 - push * 0.02);
        leftOverride = _v.clone();
        rx += push * 0.03;
      }
      if (info.phase === 'end' && info.empty && m.parts.pump) {
        const pk = envelope(k, 0.2, 0.45, 0.5, 0.8);
        m.parts.pump.position.z = pumpBase + pk * 0.09;
      }
    }
    if (m.parts.warhead && !info) m.parts.warhead.visible = w.mag > 0;
    if (m.parts.optic) {
      const swap = ads > 0.72;
      m.parts.optic.visible = !swap;
      if (m.adsRing) m.adsRing.visible = swap;
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
    // Tabanca sürgüsü
    if (m.parts.slide) {
      const sz = this.slideZ.update(dt);
      const travel = d.id === 'd50' ? 0.045 : 0.035;
      m.parts.slide.position.z = m.parts.slide.userData.base.z + (w.slideLocked ? travel : clamp(sz * 0.006, 0, travel));
    }

    // Bıçak: sol el bıçağı savururken silah sağ alta iner. Model yoksa dipçik darbesi.
    const knifeOn = W.state === 'melee' && !!this.knife && W.stateT < KNIFE_END;
    if (this.knife) this.knife.visible = knifeOn;
    if (W.state === 'melee' && this.knife) {
      const s = envelope(W.stateT, 0, 0.08, 0.38, 0.56);
      _p.x += 0.1 * s;
      _p.y += -0.15 * s;
      rz += -0.3 * s;
      rx += -0.2 * s;
      if (knifeOn) this.poseKnife(W.stateT);
    } else if (W.state === 'melee') {
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
    m.root.position.copy(_p);
    m.root.rotation.set(rx, ry, rz);
    m.root.updateMatrix();
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
    const rightHand = _v.copy(m.rightHand).applyMatrix4(m.root.matrix).clone();
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
    else _upL.set(-0.35, -1, 0);
    poseArm(this.arms.right, elbowR, rightHand, _upR);
    poseArm(this.arms.left, elbowL, leftHand, _upL);

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
