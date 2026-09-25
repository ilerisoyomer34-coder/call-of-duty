// Birinci şahıs silah/kol görünümü ve prosedürel animasyon katmanı (master prompt §4.7):
// sway, bob, nefes, geri tepme yayı, ADS hizalama, koşu pozu, duvar geri çekme,
// prosedürel reload, equip/unequip, pompa/sürgü hareketi, bıçak, el bombası.
// Ayrı sahnede çizilir: silah duvarların içine girmez.
import * as THREE from 'three';
import { buildWeapon, buildArms, poseArm, buildGrenade } from './models.js';
import { clamp, damp, lerp, smoothstep, Spring, rand } from './util.js';

const _p = new THREE.Vector3();
const _r = new THREE.Euler();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _hit = {};

// 0→1 yükselen, tutulan, sonra 1→0 inen zarf
function envelope(k, a, b, c, d) {
  if (k <= a || k >= d) return 0;
  if (k < b) return smoothstep((k - a) / (b - a));
  if (k <= c) return 1;
  return 1 - smoothstep((k - c) / (d - c));
}

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
    this.models = {};
    for (const id of ['rifle', 'shotgun', 'pistol']) {
      const m = buildWeapon(id);
      m.root.visible = false;
      this.holder.add(m.root);
      m.flash = this.makeFlash(textures, id);
      m.root.add(m.flash);
      m.flash.position.copy(m.muzzle);
      if (m.dot) m.dot.scale.setScalar(0.75);
      this.models[id] = m;
    }
    this.arms = buildArms();
    this.holder.add(this.arms.left.g, this.arms.right.g);
    this.grenade = buildGrenade();
    this.grenade.visible = false;
    this.holder.add(this.grenade);
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

  makeFlash(T, id) {
    const g = new THREE.Group();
    const mk = (map) =>
      new THREE.MeshBasicMaterial({ map, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, color: new THREE.Color(1.6, 1.3, 1.0) });
    const size = id === 'shotgun' ? 0.2 : id === 'pistol' ? 0.1 : 0.14;
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
    if (d.id === 'pistol') this.slideZ.impulse(4.5);
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
    this.holder.visible = P.alive;

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
    if (w.id === 'pistol') {
      _p.x += -0.02 * sp;
      _p.y += -0.08 * sp;
      rx += -0.7 * sp;
    } else {
      _p.x += -0.05 * sp;
      _p.y += -0.05 * sp;
      _p.z += 0.05 * sp;
      rx += -0.22 * sp;
      ry += 0.75 * sp;
      rz += 0.35 * sp;
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

    // Etkileşimde silahı indir
    this.interactT = damp(this.interactT || 0, P.interacting ? 1 : 0, 10, dt);
    _p.y -= this.interactT * 0.14;
    rx -= this.interactT * 0.6;

    // Sol el hedefi (varsayılan: tutamak)
    let leftOverride = null;
    // Parça animasyonları
    if (m.parts.mag) m.parts.mag.position.y = m.parts.mag.userData.baseY ?? (m.parts.mag.userData.baseY = m.parts.mag.position.y);
    if (m.parts.mag) m.parts.mag.visible = true;
    if (m.parts.charging) m.parts.charging.position.z = 0.045;
    if (m.parts.pump) m.parts.pump.position.z = -0.34;

    const info = W.reloadInfo();
    if (info && info.type === 'mag') {
      const k = info.k;
      const tilt = envelope(k, 0, 0.16, 0.82, 1);
      rz += tilt * (w.id === 'pistol' ? 0.35 : 0.6);
      rx += tilt * 0.18;
      ry += tilt * 0.12;
      _p.y += -0.025 * tilt;
      _p.x += -0.02 * tilt;
      const mag = m.parts.mag;
      const baseY = mag.userData.baseY;
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
        m.parts.charging.position.z = 0.045 + c * 0.07;
        const toCh = envelope(k, 0.72, 0.76, 0.88, 0.95);
        _v.copy(m.leftHand).lerp(_v2.set(-0.02, 0.07, 0.06 + c * 0.07), toCh);
        leftOverride = _v.clone();
      }
      if (info.empty && w.id === 'pistol' && k > 0.8) this.slideZ.x = Math.max(0, this.slideZ.x * 0.5);
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
        m.parts.pump.position.z = -0.34 + pk * 0.09;
      }
    }
    // Pompa (atıştan sonra)
    if (m.parts.pump && w.pumpT >= 0) {
      const t = w.pumpT - d.pumpDelay;
      if (t > 0) {
        const pk = envelope(t / 0.32, 0, 0.4, 0.5, 1);
        m.parts.pump.position.z = -0.34 + pk * 0.09;
        rx += pk * 0.05;
      }
    }
    if (m.parts.pump) {
      _v.copy(m.leftHand);
      _v.z += m.parts.pump.position.z + 0.34;
      if (!leftOverride) leftOverride = _v.clone();
    }
    // Tabanca sürgüsü
    if (m.parts.slide) {
      const sz = this.slideZ.update(dt);
      m.parts.slide.position.z = w.slideLocked ? 0.035 : clamp(sz * 0.006, 0, 0.035);
    }

    // Bıçak (dipçik/silah darbesi)
    if (W.state === 'melee') {
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
    this.grenade.visible = cooking || (throwing && W.stateT < 0.12);
    if (cooking || throwing) {
      const k = cooking ? smoothstep(clamp(W.stateT / 0.2, 0, 1)) : 1 - smoothstep(clamp(W.stateT / 0.42, 0, 1));
      _p.y -= 0.18 * k;
      _p.x += 0.06 * k;
      rx -= 0.5 * k;
      const gx = throwing ? lerp(-0.14, 0.0, clamp(W.stateT / 0.12, 0, 1)) : -0.14;
      const gz = throwing ? lerp(-0.34, -0.7, clamp(W.stateT / 0.12, 0, 1)) : -0.34 + Math.sin(this.time * 3) * 0.005;
      this.grenade.position.set(gx, -0.08 + (throwing ? 0.08 : 0), gz);
      this.grenade.rotation.set(0.3, 0.4, 0);
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
      w.id === 'pistol'
        ? new THREE.Vector3(_p.x - 0.2, _p.y - 0.28, _p.z + 0.22)
        : new THREE.Vector3(_p.x - 0.22, _p.y - 0.32, leftHand.z + 0.36);
    if (cooking || throwing) {
      leftHand.copy(this.grenade.position).add(_v.set(0.01, -0.04, 0.05));
      elbowL.set(-0.3, -0.35, leftHand.z + 0.3);
    }
    poseArm(this.arms.right, elbowR, rightHand);
    poseArm(this.arms.left, elbowL, leftHand);

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

  render(renderer) {
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  }
}
