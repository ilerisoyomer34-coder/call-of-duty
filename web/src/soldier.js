// Düşman askerinin görünümü ve animasyonu (UE5'teki SkeletalMesh + AnimBP karşılığı).
// Hazır iskeletli model (Mixamo "Vanguard", three.js örnek deposundan) yüklendiyse SkinnedSoldier,
// yüklenemezse prosedürel kutu asker (BlockSoldier) kullanılır. İkisi aynı arayüzü sunar:
//   root, meshes (vuruş bölgeleri), reset(pos, yaw), animate(dt, st), fire(k), hit(zone),
//   die(info, game), updateDeath(dt, A, pos, yaw), muzzleWorld(out), hide(), dispose()
//
// SkinnedSoldier katmanları:
//   1) Hareket: Idle / Walk / Run klipleri hıza göre karışır. Adım döngüsü gerçek hıza bağlı
//      ilerler (m/s ÷ adım boyu), iki klip aynı topuk vuruşundan başlar → ayak kaymaz, geçiş seker.
//   2) Alt gövde hareket yönüne döner (en çok ±70°), omurga ters dönerek üst gövdeyi hedefe çevirir;
//      hareket bakışın tersine düşerse klip geriye oynar (geri geri yürüme).
//   3) Silah gövde uzayında duruşa göre konur (nişan / hazır / rahat), iki kol analitik iki kemikli
//      IK ile silaha kilitlenir; el yönleri silahın eksenine göre kurulur.
//   4) Çömelme ve ölümde diz çökme: kalça iner, bacak IK ayakları yerde tutar.
//   5) Tepkiler: atışta geri tepme, isabette sarsılma ve burulma, ölümde silah yere düşer.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { loadCharacterAsset } from './assets.js';
import { buildSoldier, buildEnemyGun, mergeGroup, ENEMY_GUN_KIND, ENEMY_GUN_POINTS } from './models.js';
import { SOLDIER_ANIM, SOLDIER_LOOKS, SOLDIER_HITBOXES } from './config.js';
import { clamp, damp, dampAngle, angleDiff, dirToYaw, lerp, smoothstep, rand, Spring } from './util.js';

const A = SOLDIER_ANIM;
let template = null;
let envMap = null; // haritanın yansıma haritası (setSoldierEnvironment)
let realShadows = true; // gölge haritası açık mı (düşük kalitede kapalı: ayak gölgesi her mesafede)

// Yumuşak ayak gölgesi: tek geometri ve malzeme, tüm askerler paylaşır
let blobShared = null;
function blobAssets() {
  if (blobShared) return blobShared;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const grd = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  grd.addColorStop(0, 'rgba(0,0,0,1)');
  grd.addColorStop(0.55, 'rgba(0,0,0,0.55)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 64, 64);
  const geo = new THREE.PlaneGeometry(1.15, 1.15);
  geo.rotateX(-Math.PI / 2);
  geo.userData.shared = true; // sahne atılırken paylaşılan geometri silinmesin
  const mat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), color: 0x000000, transparent: true, opacity: A.blobOpacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  blobShared = { geo, mat };
  return blobShared;
}

// Harita değişince askerlerin yansıma haritası (uzakta ve gölgede siyaha dönmesin)
export function setSoldierEnvironment(tex, shadowsOn) {
  envMap = tex;
  realShadows = shadowsOn;
  if (!template) return;
  for (const L of template.looks.values()) {
    for (const m of L.values()) {
      if (!m.isMeshStandardMaterial) continue;
      if (!m.envMap !== !tex) m.needsUpdate = true;
      m.envMap = tex;
      m.envMapIntensity = A.envIntensity;
    }
  }
}

// Geçici nesneler (her karede bellek ayırmamak için)
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _e = new THREE.Vector3();
const _pd = new THREE.Vector3();
const _u1 = new THREE.Vector3();
const _u2 = new THREE.Vector3();
const _t1 = new THREE.Vector3();
const _t2 = new THREE.Vector3();
const _t3 = new THREE.Vector3();
const _tR = new THREE.Vector3(); // el hedefleri: IK çözücünün geçici vektörleriyle çakışmasın
const _tL = new THREE.Vector3();
const _up = new THREE.Vector3();
const _right = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _pq = new THREE.Quaternion();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _qw = new THREE.Quaternion();
const _qg = new THREE.Quaternion();
const _qf = [new THREE.Quaternion(), new THREE.Quaternion()];
const _eul = new THREE.Euler(0, 0, 0, 'YXZ');
const _m1 = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _x1 = new THREE.Vector3();
const _y1 = new THREE.Vector3();
const _z1 = new THREE.Vector3();
const _x2 = new THREE.Vector3();
const _y2 = new THREE.Vector3();
const _z2 = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);
const clamp01 = (v) => clamp(v, 0, 1);
const SPINE_SHARE = [0.3, 0.3, 0.4]; // omurga dönüşünün kemiklere dağılımı (alt → üst)
const AXES = ['x', 'y', 'z'];

// Duruş karışımı: rahat → hazır (lowK), sonra → nişan (aimK). i verilirse stok ofsetinin o bileşeni
function stanceMix(key, lowK, aimK, i = -1) {
  const S = A.stances;
  const r = i < 0 ? S.relaxed[key] : S.relaxed[key][i];
  const h = i < 0 ? S.ready[key] : S.ready[key][i];
  const a = i < 0 ? S.aim[key] : S.aim[key][i];
  return lerp(lerp(r, h, lowK), a, aimK);
}

// Düşman silahları biraz parlak (metal/polimer), askerin dokulu malzemesinden ayrı
const gunMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.35 });
const hitGeoCache = new Map();

// --- Kemik yardımcıları (dünya uzayında; ebeveynlerin matrixWorld'ü güncel olmalı) ---
function bonePos(bone, out) {
  return out.setFromMatrixPosition(bone.matrixWorld);
}

// Kemiği dünya uzayındaki q kadar döndür: yerel = E⁻¹ · q · E · yerel (E: ebeveynin dünya dönüşü)
function rotateBoneWorld(bone, q) {
  bone.parent.matrixWorld.decompose(_p, _pq, _s);
  _q.copy(_pq).invert().multiply(q).multiply(_pq);
  bone.quaternion.premultiply(_q);
  bone.updateMatrixWorld(true);
}

function rotateBoneAxis(bone, axis, angle) {
  if (Math.abs(angle) < 1e-5) return;
  _qw.setFromAxisAngle(axis, angle);
  rotateBoneWorld(bone, _qw);
}

function setBoneWorldQuat(bone, q) {
  bone.parent.matrixWorld.decompose(_p, _pq, _s);
  bone.quaternion.copy(_pq).invert().multiply(q);
  bone.updateMatrixWorld(true);
}

// Analitik iki kemikli IK: a (omuz/kalça) → b (dirsek/diz) → c (bilek/ayak bileği) zinciri c hedefe
// uzanacak şekilde döner; dirsek, a–hedef doğrusu ile kutup noktasının oluşturduğu düzlemde kalır.
function solveTwoBone(a, b, c, target, pole) {
  const A0 = bonePos(a, _a);
  const B0 = bonePos(b, _b);
  const C0 = bonePos(c, _c);
  const lab = A0.distanceTo(B0);
  const lbc = B0.distanceTo(C0);
  const dir = _d.subVectors(target, A0);
  let lat = dir.length();
  if (lat < 1e-4 || lab < 1e-4 || lbc < 1e-4) return;
  dir.divideScalar(lat);
  lat = clamp(lat, Math.abs(lab - lbc) + 1e-3, (lab + lbc) * 0.999);
  const pd = _pd.subVectors(pole, A0);
  pd.addScaledVector(dir, -pd.dot(dir));
  if (pd.lengthSq() < 1e-8) pd.subVectors(B0, A0).addScaledVector(dir, -_pd.dot(dir));
  pd.normalize();
  const cosA = clamp((lab * lab + lat * lat - lbc * lbc) / (2 * lab * lat), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  const elbow = _e.copy(A0).addScaledVector(dir, cosA * lab).addScaledVector(pd, sinA * lab);
  _u1.subVectors(B0, A0).normalize();
  _u2.subVectors(elbow, A0).normalize();
  _qw.setFromUnitVectors(_u1, _u2);
  rotateBoneWorld(a, _qw);
  bonePos(b, _b);
  bonePos(c, _c);
  const reach = _t3.copy(A0).addScaledVector(dir, lat);
  _u1.subVectors(_c, _b).normalize();
  _u2.subVectors(reach, _b).normalize();
  _qw.setFromUnitVectors(_u1, _u2);
  rotateBoneWorld(b, _qw);
}

// Parmak yönü ve avuç normali verilen elin dünya dönüşü. fingerL/palmL: aynı yönlerin kemik uzayındaki
// karşılıkları (bağlanma pozundan ölçülür). R · [fL pL fL×pL] = [fW pW fW×pW]
function handQuat(out, fingerW, palmW, hand) {
  _x1.copy(hand.finger);
  _y1.copy(hand.palm).addScaledVector(_x1, -hand.palm.dot(_x1)).normalize();
  _z1.crossVectors(_x1, _y1);
  _x2.copy(fingerW).normalize();
  _y2.copy(palmW).addScaledVector(_x2, -palmW.dot(_x2)).normalize();
  _z2.crossVectors(_x2, _y2);
  _m1.makeBasis(_x1, _y1, _z1).transpose();
  _m2.makeBasis(_x2, _y2, _z2).multiply(_m1);
  return out.setFromRotationMatrix(_m2);
}

// --- Şablon ---
function prepareTemplate({ scene, animations }) {
  scene.updateMatrixWorld(true);
  const clips = {};
  for (const c of animations) clips[c.name] = c;
  for (const n of ['Idle', 'Walk', 'Run']) if (!clips[n]) throw new Error(`Asker modelinde ${n} klibi yok`);
  const bones = {};
  scene.traverse((o) => {
    if (o.isBone) bones[o.name] = o;
  });
  // El tabanı: bilekten orta parmak köküne yön ve T pozunda aşağı bakan avuç, kemik uzayında
  const hand = (name, finger) => {
    const hb = bones[name];
    hb.matrixWorld.decompose(_p, _pq, _s);
    const qi = _pq.clone().invert();
    const hp = new THREE.Vector3().setFromMatrixPosition(hb.matrixWorld);
    const fp = new THREE.Vector3().setFromMatrixPosition(bones[finger].matrixWorld);
    return { finger: fp.sub(hp).normalize().applyQuaternion(qi), palm: new THREE.Vector3(0, -1, 0).applyQuaternion(qi) };
  };
  const hands = { right: hand('RightHand', 'RightHandMiddle1'), left: hand('LeftHand', 'LeftHandMiddle1') };
  // Parmak bükme eksenleri: bağlanma pozunda parmak yönü × avuç normali, her kemiğin kendi uzayında
  const fingers = [];
  for (const side of ['Left', 'Right']) {
    const hp = new THREE.Vector3().setFromMatrixPosition(bones[`${side}Hand`].matrixWorld);
    const fw = new THREE.Vector3().setFromMatrixPosition(bones[`${side}HandMiddle1`].matrixWorld).sub(hp).normalize();
    const axisW = fw.cross(new THREE.Vector3(0, -1, 0)).normalize();
    for (const [f, angles] of Object.entries(A.gripCurl[side])) {
      angles.forEach((ang, i) => {
        const b = bones[`${side}Hand${f}${i + 1}`];
        if (!b) return;
        b.matrixWorld.decompose(_p, _pq, _s);
        const axis = axisW.clone().applyQuaternion(_pq.clone().invert());
        fingers.push({ name: b.name, grip: b.quaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(axis, ang)) });
      });
    }
  }
  // Başın ileri ekseni (kemik uzayında): bağlanma pozunda model -Z'ye bakar
  bones.Head.matrixWorld.decompose(_p, _pq, _s);
  const headFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(_pq.clone().invert());
  // Her klipte sağ topuğun yere vurduğu an (ayak en önde): döngüler bu andan başlatılır
  const strike = {};
  {
    const tmp = cloneSkinned(scene);
    const mixer = new THREE.AnimationMixer(tmp);
    const foot = tmp.getObjectByName('RightFoot');
    for (const n of ['Walk', 'Run']) {
      mixer.stopAllAction();
      mixer.clipAction(clips[n]).reset().play();
      let best = 0;
      let bestZ = Infinity;
      const N = 48;
      for (let i = 0; i < N; i++) {
        mixer.setTime((clips[n].duration * i) / N);
        tmp.updateMatrixWorld(true);
        const z = _p.setFromMatrixPosition(foot.matrixWorld).z;
        if (z < bestZ) {
          bestZ = z;
          best = i / N;
        }
      }
      strike[n] = best;
    }
    mixer.stopAllAction();
    mixer.uncacheRoot(tmp);
  }
  // Görüş konisi testi için sınır küresi: bağlanma pozunda ölçülür, animasyon payıyla büyütülür
  const spheres = new Map();
  scene.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    o.computeBoundingSphere();
    const sp = o.boundingSphere.clone();
    sp.radius *= 1.35;
    spheres.set(o.name, sp);
  });
  return { scene, clips, hands, headFwd, fingers, strike, spheres, looks: new Map() };
}

function lookMaterials(type) {
  let L = template.looks.get(type);
  if (L) return L;
  const spec = SOLDIER_LOOKS[type] || SOLDIER_LOOKS.rifleman;
  L = new Map();
  template.scene.traverse((o) => {
    if (!o.isMesh || L.has(o.material)) return;
    const m = o.material.clone();
    if (/visor/i.test(o.name)) {
      m.color.set(spec.visor);
      m.roughness = 0.22;
      m.metalness = 0.65;
    } else {
      if (Array.isArray(spec.tint)) m.color.setRGB(spec.tint[0], spec.tint[1], spec.tint[2]);
      else m.color.set(spec.tint);
      if (spec.glow) m.emissive.set(spec.glow);
      m.roughness = 0.8;
      m.metalness = 0.08;
    }
    m.envMap = envMap;
    m.envMapIntensity = A.envIntensity;
    L.set(o.material, m);
  });
  template.looks.set(type, L);
  return L;
}

// Açılışta bir kez: hazır modeli yükle. Hata olursa prosedürel askerler kullanılır.
export async function preloadSoldier() {
  if (template) return true;
  const asset = await loadCharacterAsset('soldier');
  template = prepareTemplate(asset);
  return true;
}

export function soldierModelReady() {
  return !!template;
}

export function createSoldier(type, colors) {
  return template ? new SkinnedSoldier(type, colors) : new BlockSoldier(type, colors);
}

// --- İskeletli asker ---
class SkinnedSoldier {
  constructor(type, colors) {
    const T = template;
    this.type = type;
    this.root = new THREE.Group();
    this.root.rotation.order = 'YXZ';
    this.body = cloneSkinned(T.scene);
    this.root.add(this.body);
    this.bones = {};
    const L = lookMaterials(type);
    this.body.traverse((o) => {
      if (o.isBone) this.bones[o.name] = o;
      if (o.isSkinnedMesh) {
        o.material = L.get(o.material) || o.material;
        o.castShadow = true;
        o.receiveShadow = false;
        const sp = T.spheres.get(o.name);
        if (sp) o.boundingSphere = sp.clone();
      }
    });
    this.mixer = new THREE.AnimationMixer(this.body);
    this.idle = this.mixer.clipAction(T.clips.Idle);
    this.walk = this.mixer.clipAction(T.clips.Walk);
    this.run = this.mixer.clipAction(T.clips.Run);
    for (const a of [this.idle, this.walk, this.run]) {
      a.play();
      a.setEffectiveWeight(0);
    }
    // Yürüme/koşma zamanı elle sürülür (adım döngüsü hıza bağlı)
    this.walk.timeScale = 0;
    this.run.timeScale = 0;
    this.idle.time = Math.random() * T.clips.Idle.duration;

    const kind = ENEMY_GUN_KIND[type] || 'rifle';
    const P = ENEMY_GUN_POINTS[kind];
    const v = (a) => new THREE.Vector3(a[0], a[1], a[2]);
    this.gp = { muzzle: v(P.muzzle), grip: v(P.grip), fore: v(P.fore), magWell: v(P.magWell), stock: P.stock };
    this.gun = mergeGroup(buildEnemyGun(kind), gunMat);
    this.gun.castShadow = true;
    this.root.add(this.gun);

    const blob = blobAssets();
    this.blob = new THREE.Mesh(blob.geo, blob.mat);
    this.blob.position.y = 0.03;
    this.blob.renderOrder = 1;
    this.root.add(this.blob);

    this.body.updateMatrixWorld(true);
    this.meshes = this.buildHitboxes();
    this.fingers = T.fingers.map((f) => ({ bone: this.bones[f.name], grip: f.grip }));
    const B = this.bones;
    this.spineChain = [B.Spine, B.Spine1, B.Spine2];
    this.legs = [
      [B.LeftUpLeg, B.LeftLeg, B.LeftFoot, -1],
      [B.RightUpLeg, B.RightLeg, B.RightFoot, 1],
    ];

    this.flinch = new Spring(160, 12);
    this.twist = new Spring(160, 12);
    this.recoil = new Spring(260, 20);
    this.phase = Math.random();
    this.lodT = 1;
    this.resetState();
    if (colors?.scale) this.root.scale.setScalar(colors.scale);
  }

  // Görünmez kutular kemiklere bağlı: iskeleti takip eder, ışın testi ucuzdur (her biri 12 üçgen)
  buildHitboxes() {
    const out = [];
    for (const h of SOLDIER_HITBOXES) {
      const b = this.bones[h.bone];
      if (!b) continue;
      b.matrixWorld.decompose(_p, _pq, _s);
      const unit = _s.x; // kemik uzayında 1 birim kaç metre (model santimetre ile kurulmuş)
      let geo;
      const box = new THREE.Mesh();
      if (h.to && this.bones[h.to]) {
        const c = this.bones[h.to].position;
        const len = c.length();
        geo = this.hitGeo(h.width / unit, len, h.width / unit);
        box.position.copy(c).multiplyScalar(0.5);
        box.quaternion.setFromUnitVectors(Y, _t1.copy(c).normalize());
      } else {
        geo = this.hitGeo(h.size[0] / unit, h.size[1] / unit, h.size[2] / unit);
        // Kutu karakterin eksenlerine hizalı dursun: kemiğin bağlanma pozundaki dönüşünün tersi
        box.quaternion.copy(_pq).invert();
        box.position.set(0, h.along / unit, 0).applyQuaternion(box.quaternion);
      }
      box.geometry = geo;
      box.visible = false;
      box.userData.zone = h.zone;
      b.add(box);
      out.push(box);
    }
    return out;
  }

  hitGeo(x, y, z) {
    const k = `${x.toFixed(2)}|${y.toFixed(2)}|${z.toFixed(2)}`;
    let g = hitGeoCache.get(k);
    if (!g) {
      g = new THREE.BoxGeometry(x, y, z);
      hitGeoCache.set(k, g);
    }
    return g;
  }

  resetState() {
    this.flinch.reset();
    this.twist.reset();
    this.recoil.reset();
    this.hipYaw = 0;
    this.legYaw = 0;
    this.back = false;
    this.moveT = 0;
    this.runT = 0;
    this.crouchT = 0;
    this.aimT = 0;
    this.readyT = 0;
    this.pitch = 0;
    this.lodT = 1;
  }

  reset(pos, yaw) {
    this.resetState();
    this.root.visible = true;
    this.root.position.copy(pos);
    this.root.rotation.set(0, yaw, 0, 'YXZ');
    this.legYaw = yaw;
    this.body.position.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
    this.gun.visible = true;
    if (this.dropped) {
      this.dropped.removeFromParent();
      this.dropped = null;
    }
    this.idle.setEffectiveWeight(1);
    this.walk.setEffectiveWeight(0);
    this.run.setEffectiveWeight(0);
  }

  // st: { pos, yaw, vel, crouch, aimPitch, stance: 'aim'|'ready'|'relaxed', reload ve throw (-1 ya da 0..1), dist,
  //       mount: { gripL, gripR } (mevzi silahının tutamakları, dünya) ya da null, hideGun: kendi tüfeği görünmez }
  animate(dt, st) {
    this.root.position.copy(st.pos);
    this.root.rotation.set(0, st.yaw, 0, 'YXZ');
    // Gölge haritasının menzili dışında (ya da gölgeler kapalıyken) ayak gölgesi: asker havada durmasın
    this.blob.visible = st.dist > A.blobFrom || !realShadows;
    // Uzaktaki askerlerde iskelet seyrek güncellenir; biriken süre tek adımda işlenir
    this.lodT += dt;
    const every = st.dist > A.lodVeryFar ? A.lodRates[2] : st.dist > A.lodFar ? A.lodRates[1] : st.dist > A.lodNear ? A.lodRates[0] : 0;
    if (this.lodT < every) return;
    const step = Math.min(this.lodT, 0.25);
    this.lodT = 0;

    // 1) Hareket karışımı
    const sp = Math.hypot(st.vel.x, st.vel.z);
    let hipTarget = 0;
    if (sp > 0.25) {
      const rel = angleDiff(st.yaw, dirToYaw(st.vel.x, st.vel.z));
      const a = Math.abs(rel);
      if (!this.back && a > A.backwardEnter) this.back = true;
      else if (this.back && a < A.backwardExit) this.back = false;
      hipTarget = clamp(this.back ? angleDiff(0, rel + Math.PI) : rel, -A.hipTurnMax, A.hipTurnMax);
    }
    // Bacaklar dünyada kendi yönünü tutar: yerinde dönerken gövde önden döner, bacaklar adım atarak yetişir
    const prevLeg = this.legYaw;
    this.legYaw = dampAngle(this.legYaw, st.yaw + hipTarget, sp > 0.25 ? 12 : 4, step);
    const turnRate = Math.abs(angleDiff(prevLeg, this.legYaw)) / step;
    this.hipYaw = clamp(angleDiff(st.yaw, this.legYaw), -A.hipTurnMax, A.hipTurnMax);
    this.legYaw = st.yaw + this.hipYaw;
    const spAnim = Math.max(sp, Math.min(turnRate * A.turnStep, A.turnStepMax));
    this.moveT = damp(this.moveT, smoothstep(clamp01((spAnim - A.moveBlend[0]) / (A.moveBlend[1] - A.moveBlend[0]))), 10, step);
    this.runT = damp(this.runT, clamp01((sp - A.runBlend[0]) / (A.runBlend[1] - A.runBlend[0])), 6, step);
    const stride = lerp(A.walkStride, A.runStride, this.runT);
    this.phase = (this.phase + ((this.back ? -1 : 1) * spAnim * step) / stride + 1) % 1;
    const T = template;
    this.walk.time = ((this.phase + T.strike.Walk) % 1) * T.clips.Walk.duration;
    this.run.time = ((this.phase + T.strike.Run) % 1) * T.clips.Run.duration;
    this.idle.setEffectiveWeight(1 - this.moveT);
    this.walk.setEffectiveWeight(this.moveT * (1 - this.runT));
    this.run.setEffectiveWeight(this.moveT * this.runT);
    this.mixer.update(step);

    // 2) Alt gövde yönü ve çömelme
    this.crouchT = damp(this.crouchT, st.crouch ? 1 : 0, 8, step);
    const drop = A.crouchDrop * this.crouchT;
    this.body.rotation.y = this.hipYaw;
    this.body.position.y = -drop;
    this.root.updateMatrixWorld(true);
    if (drop > 0.005) this.plantFeet(drop);

    // 3) Omurga: göğsü bakış yönüne çevir (alt gövdenin dönüşü ve klibin kendi duruş açısı
    //    — bekleme klibinde kalça ~45°, omuzlar ~17° yan durur — burada telafi edilir),
    //    nişan eğiminin bir kısmını gövdeye ver
    const fl = this.flinch.update(step);
    const tw = this.twist.update(step);
    this.aimT = damp(this.aimT, st.stance === 'aim' ? 1 : 0, A.aimSpeed, step);
    this.readyT = damp(this.readyT, st.stance === 'relaxed' ? 0 : 1, 4, step);
    this.pitch = damp(this.pitch, st.aimPitch, 8, step);
    const B = this.bones;
    _up.set(0, 1, 0).applyQuaternion(this.root.quaternion);
    _right.set(1, 0, 0).applyQuaternion(this.root.quaternion);
    const chest = bonePos(B.RightArm, _t1).sub(bonePos(B.LeftArm, _t2));
    chest.addScaledVector(_up, -chest.dot(_up)).normalize();
    const chestErr = Math.atan2(_d.crossVectors(chest, _right).dot(_up), chest.dot(_right));
    // Mevzi silahı iki elle, göğüs karşıdan tutulur: tüfek duruşundaki yan dönüş (blade) yok
    const blade = st.mount ? 0 : A.aimBlade;
    const yawFix = chestErr * lerp(0.75, 1, this.aimT) - blade * this.aimT + tw * 0.1;
    const pitchSpine = this.pitch * A.spinePitchShare * this.aimT - this.crouchT * 0.2 + fl * 0.1;
    for (let i = 0; i < 3; i++) {
      _q2.setFromAxisAngle(_up, yawFix * SPINE_SHARE[i]);
      _qw.setFromAxisAngle(_right, pitchSpine * SPINE_SHARE[i]).premultiply(_q2);
      rotateBoneWorld(this.spineChain[i], _qw);
    }

    // 4) Silah: sağ omuza göre duruş karışımı (gövde uzayında)
    const lowK = this.readyT;
    const aimK = this.aimT;
    let pitch = stanceMix('pitch', lowK, aimK) + this.pitch * aimK;
    let yaw = stanceMix('yaw', lowK, aimK);
    let roll = stanceMix('roll', lowK, aimK);
    // Şarjör değişiminde silah yana yatıp aşağı iner (hareketin ortasında en fazla)
    const rk = st.reload >= 0 ? Math.sin(clamp01(st.reload) * Math.PI) : 0;
    pitch += A.reloadTilt.pitch * rk;
    roll += A.reloadTilt.roll * rk;
    yaw += A.reloadTilt.yaw * rk;
    // Koşarken (nişan yokken) silah göğse çaprazlanır
    const carry = this.runT * this.moveT * (1 - aimK);
    yaw += A.runCarry.yaw * carry;
    pitch += A.runCarry.pitch * carry;
    const kick = this.recoil.update(step);
    pitch += kick * A.recoilPitch;
    _eul.set(pitch, yaw, roll, 'YXZ');
    this.gun.quaternion.setFromEuler(_eul);
    const sh = this.root.worldToLocal(bonePos(B.RightArm, _t1));
    for (let i = 0; i < 3; i++) sh[AXES[i]] += stanceMix('stock', lowK, aimK, i);
    sh.x += A.runCarry.side * carry;
    _fwd.set(0, 0, -1).applyQuaternion(this.gun.quaternion);
    this.gun.position.copy(sh).addScaledVector(_fwd, this.gp.stock - kick);
    this.gun.updateMatrixWorld();
    // Kısa kollu model uzun silaha yetişemezse silahı namlu ekseninde geri çek (dipçik omuz zırhına gömülür)
    const s = this.root.scale.x;
    const reach = this.armReach(B.LeftArm) * 0.97;
    const over = bonePos(B.LeftArm, _t2).distanceTo(this.gun.localToWorld(_t3.copy(this.gp.fore))) - reach;
    if (over > 0) {
      this.gun.position.addScaledVector(_fwd, -Math.min(over / s, 0.25));
      this.gun.updateMatrixWorld();
    }

    this.gun.visible = !st.hideGun;

    // 5) Kollar: iki kemikli IK ile kabza ve el kundağına (hedefler dünya uzayında); mevzide silahın tutamaklarına
    for (const f of this.fingers) f.bone.quaternion.copy(f.grip);
    _fwd.set(0, 0, -1).applyQuaternion(this.root.quaternion);
    const M = st.mount;
    const rT = M ? _tR.copy(M.gripR) : this.gun.localToWorld(_tR.copy(this.gp.grip));
    const lT = M ? _tL.copy(M.gripL) : st.throw >= 0 ? this.throwHandTarget(st.throw, _tL) : this.leftHandTarget(st.reload, _tL);
    _pole.copy(bonePos(B.RightArm, _p)).addScaledVector(_right, 0.35 * s).addScaledVector(_up, -0.6 * s).addScaledVector(_fwd, -0.2 * s);
    solveTwoBone(B.RightArm, B.RightForeArm, B.RightHand, rT, _pole);
    _pole.copy(bonePos(B.LeftArm, _p)).addScaledVector(_right, -0.5 * s).addScaledVector(_up, -0.55 * s).addScaledVector(_fwd, 0.05 * s);
    solveTwoBone(B.LeftArm, B.LeftForeArm, B.LeftHand, lT, _pole);
    if (M) {
      // Kürek tutamaklar dikey: iki el aynı biçimde, avuçlar içe bakar (ayna)
      _eul.set(st.aimPitch, st.yaw, 0, 'YXZ');
      _qg.setFromEuler(_eul);
      handQuat(_qf[0], _u1.set(-0.3, -0.35, -0.88).applyQuaternion(_qg), _u2.set(-1, 0, 0.1).applyQuaternion(_qg), T.hands.right);
      setBoneWorldQuat(B.RightHand, _qf[0]);
      handQuat(_qf[1], _u1.set(0.3, -0.35, -0.88).applyQuaternion(_qg), _u2.set(1, 0, 0.1).applyQuaternion(_qg), T.hands.left);
      setBoneWorldQuat(B.LeftHand, _qf[1]);
    } else {
      _qg.copy(this.root.quaternion).multiply(this.gun.quaternion);
      // Sağ el tabancı kabzayı kavrar: parmaklar öne-aşağı, avuç silahın sol yanına
      handQuat(_qf[0], _u1.set(-0.3, -0.35, -0.88).applyQuaternion(_qg), _u2.set(-1, 0, 0.1).applyQuaternion(_qg), T.hands.right);
      setBoneWorldQuat(B.RightHand, _qf[0]);
      // Sol el kundağı alttan tutar: avuç yukarı, parmaklar sağ yana sarılır; şarjör değişiminde avuç içe döner
      handQuat(_qf[1], _u1.set(0.5, 0.2, -0.85).applyQuaternion(_qg), _u2.set(0.35 * rk, 1, 0).applyQuaternion(_qg), T.hands.left);
      setBoneWorldQuat(B.LeftHand, _qf[1]);
    }

    // 6) Baş bakış yönüne döner (klipteki yana bakışı düzeltir), nişanda hedefe eğilir, isabette sarsılır
    B.Head.matrixWorld.decompose(_p, _pq, _s);
    _u1.copy(T.headFwd).applyQuaternion(_pq);
    _eul.set(this.pitch * (1 - A.spinePitchShare) * aimK * 0.7 - A.aimHeadTilt * aimK - fl * 0.06, 0, 0, 'YXZ');
    _u2.set(0, 0, -1).applyEuler(_eul).applyQuaternion(this.root.quaternion);
    _qw.setFromUnitVectors(_u1, _u2);
    _q2.identity().slerp(_qw, 0.85);
    rotateBoneWorld(B.Head, _q2);
  }

  // El bombası: sol el kundaktan omuz arkasına kalkar, öne-yukarı savrulur, kundağa döner
  throwHandTarget(k, out) {
    const fore = this.gun.localToWorld(out.copy(this.gp.fore));
    const sh = bonePos(this.bones.LeftArm, _c);
    const s = this.root.scale.x;
    const back = _t1.copy(sh).addScaledVector(_up, 0.22 * s).addScaledVector(_fwd, -0.18 * s).addScaledVector(_right, -0.08 * s);
    const front = _b.copy(sh).addScaledVector(_up, 0.2 * s).addScaledVector(_fwd, 0.42 * s).addScaledVector(_right, 0.05 * s);
    if (k < 0.35) return out.lerp(back, smoothstep(k / 0.35));
    if (k < 0.55) return out.copy(back).lerp(front, smoothstep((k - 0.35) / 0.2));
    return out.copy(front).lerp(fore, smoothstep((k - 0.55) / 0.45));
  }

  // Omuzdan bileğe kol boyu (dünya ölçeğinde)
  armReach(upper) {
    const fore = upper.children.find((c) => c.isBone);
    const hand = fore?.children.find((c) => c.isBone);
    if (!hand) return 1;
    return bonePos(upper, _a).distanceTo(bonePos(fore, _b)) + _b.distanceTo(bonePos(hand, _c));
  }

  // Şarjör değişiminde sol el: kundak → şarjör yuvası → yelek cebi → yuva → kundak
  leftHandTarget(reload, out) {
    const fore = this.gun.localToWorld(out.copy(this.gp.fore));
    if (!(reload >= 0)) return fore;
    const well = this.gun.localToWorld(_t1.copy(this.gp.magWell));
    const chest = bonePos(this.bones.Spine2, _c);
    const s = this.root.scale.x;
    const pouch = chest.addScaledVector(_fwd, 0.2 * s).addScaledVector(_right, -0.1 * s).addScaledVector(_up, -0.2 * s);
    const r = clamp01(reload);
    if (r < 0.2) return out.copy(fore).lerp(well, smoothstep(r / 0.2));
    if (r < 0.45) return out.copy(well).lerp(pouch, smoothstep((r - 0.2) / 0.25));
    if (r < 0.7) return out.copy(pouch).lerp(well, smoothstep((r - 0.45) / 0.25));
    return out.copy(well).lerp(fore, smoothstep((r - 0.7) / 0.3));
  }

  // Beden drop kadar indirildi: ayaklar eski yerlerinde kalsın, dizler öne bükülsün
  plantFeet(drop) {
    const s = this.root.scale.x;
    _up.set(0, 1, 0).applyQuaternion(this.root.quaternion);
    this.body.getWorldQuaternion(_q2);
    _fwd.set(0, 0, -1).applyQuaternion(_q2);
    _right.set(1, 0, 0).applyQuaternion(_q2);
    for (let i = 0; i < 2; i++) {
      const [up, low, foot, side] = this.legs[i];
      foot.matrixWorld.decompose(_p, _qf[i], _s);
      const target = _t2.copy(_p).addScaledVector(_up, drop * s);
      _pole.copy(bonePos(low, _t1)).addScaledVector(_fwd, 0.6 * s).addScaledVector(_right, 0.12 * side * s);
      solveTwoBone(up, low, foot, target, _pole);
      setBoneWorldQuat(foot, _qf[i]);
    }
  }

  fire(k = 1) {
    this.recoil.impulse(A.recoilKick * 25 * k);
    this.flinch.impulse(0.15 * k);
  }

  hit(zone) {
    this.flinch.impulse(zone === 'head' ? 3.5 : 2.2);
    this.twist.impulse(rand(-2.5, 2.5));
  }

  // Silah elden düşer (asıl silah gizlenir; yere düşen kopya ortak geometriyi kullanır).
  // Mevzi nişancısının elinde tüfek yoktu: düşecek bir şey yok
  die(info, game) {
    this.blob.visible = false; // devrilen gövdeyle birlikte eğilmesin
    if (!this.gun.visible) return;
    this.gun.updateMatrixWorld();
    const drop = new THREE.Mesh(this.gun.geometry, this.gun.material);
    this.gun.matrixWorld.decompose(drop.position, drop.quaternion, drop.scale);
    drop.castShadow = true;
    game.scene.add(drop);
    this.gun.visible = false;
    if (this.dropped) this.dropped.removeFromParent();
    this.dropped = drop;
    const d = info.dir;
    game.addDebris(drop, new THREE.Vector3((d?.x || 0) * 1.5 + rand(-0.6, 0.6), rand(0.6, 1.6), (d?.z || 0) * 1.5 + rand(-0.6, 0.6)), 0.04);
  }

  // A: { deathT, fallDir, fallSide } — önce dizler çöker, sonra gövde devrilir; kollar bekleme pozunda sarkar
  updateDeath(dt, D, pos, yaw) {
    this.idle.setEffectiveWeight(1);
    this.walk.setEffectiveWeight(0);
    this.run.setEffectiveWeight(0);
    this.mixer.update(dt);
    const k = clamp01(D.deathT / 0.75);
    const kk = k * k;
    const buckle = clamp01(D.deathT / 0.25);
    const drop = buckle * 0.4 - kk * 0.12;
    this.body.position.y = -drop;
    this.root.position.set(pos.x, pos.y - kk * 0.2, pos.z);
    this.root.rotation.set(D.fallDir * kk * 1.45, yaw, D.fallSide * kk, 'YXZ');
    this.root.updateMatrixWorld(true);
    if (D.deathT < 0.55) this.plantFeet(drop * (1 - kk));
    _right.set(1, 0, 0).applyQuaternion(this.root.quaternion);
    const curl = -0.35 * buckle * D.fallDir;
    rotateBoneAxis(this.bones.Spine1, _right, curl * 0.5);
    rotateBoneAxis(this.bones.Spine2, _right, curl * 0.5);
    rotateBoneAxis(this.bones.Head, _right, -0.35 * kk);
  }

  muzzleWorld(out) {
    return this.gun.localToWorld(out.copy(this.gp.muzzle));
  }

  hide() {
    this.root.visible = false;
    if (this.dropped) this.dropped.visible = false;
  }

  dispose() {
    this.root.removeFromParent();
    if (this.dropped) this.dropped.removeFromParent();
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.body);
  }
}

// --- Prosedürel kutu asker (model yüklenemezse) ---
class BlockSoldier {
  constructor(type, colors) {
    const m = buildSoldier(type, colors);
    Object.assign(this, m);
    this.type = type;
    this.flinch = new Spring(160, 12);
    this.twist = new Spring(160, 12);
    this.phase = Math.random() * 6;
    this.crouchT = 0;
    this.aimPitch = 0;
  }

  reset(pos, yaw) {
    this.flinch.reset();
    this.twist.reset();
    this.root.visible = true;
    this.root.rotation.set(0, yaw, 0, 'YXZ');
    this.root.position.copy(pos);
    this.pelvis.position.y = 0.95;
    this.spine.rotation.set(0, 0, 0);
    if (this.helmet.parent !== this.head) {
      this.helmet.removeFromParent();
      this.head.add(this.helmet);
      this.helmet.position.set(0, 0.2, 0);
      this.helmet.rotation.set(0, 0, 0);
    }
  }

  animate(dt, st) {
    const sp = Math.hypot(st.vel.x, st.vel.z);
    this.crouchT = damp(this.crouchT, st.crouch ? 1 : 0, 8, dt);
    this.phase += sp * dt * 3.1;
    const amp = clamp(sp / 4.5, 0, 1) * 0.75 * (1 - this.crouchT * 0.6);
    const s = Math.sin(this.phase);
    const c = this.crouchT;
    this.legL.thigh.rotation.x = s * amp + c * 1.25;
    this.legR.thigh.rotation.x = -s * amp + c * 0.6;
    this.legL.shin.rotation.x = -Math.max(0, Math.sin(this.phase + 1.2)) * amp * 1.4 - c * 1.9;
    this.legR.shin.rotation.x = -Math.max(0, Math.sin(this.phase + 1.2 + Math.PI)) * amp * 1.4 - c * 1.3;
    this.legR.thigh.position.z = c * 0.1;
    this.pelvis.position.y = 0.95 - c * 0.4 + Math.abs(Math.cos(this.phase)) * 0.035 * amp;
    const aim = st.stance === 'aim' ? st.aimPitch : st.stance === 'relaxed' ? -0.35 : -0.15;
    this.aimPitch = damp(this.aimPitch, clamp(aim, -0.7, 0.7), 8, dt);
    const fl = this.flinch.update(dt);
    const tw = this.twist.update(dt);
    this.spine.rotation.x = this.aimPitch + fl * 0.12 + c * 0.12;
    this.spine.rotation.y = tw * 0.08 + Math.sin(this.phase) * amp * 0.08;
    this.spine.rotation.z = 0;
    this.head.rotation.x = -fl * 0.05;
    this.root.position.copy(st.pos);
    this.root.rotation.set(0, st.yaw, 0, 'YXZ');
    this.root.updateMatrixWorld(true);
  }

  fire(k = 1) {
    this.flinch.impulse(0.35 * k);
  }

  hit(zone) {
    this.flinch.impulse(zone === 'head' ? 3.5 : 2.2);
    this.twist.impulse(rand(-2.5, 2.5));
  }

  // Kafa vuruşunda kask fırlar
  die(info, game) {
    if (info.zone !== 'head' || info.source !== 'player' || this.type === 'dummy') return;
    const d = info.dir || _t1.set(0, 0, 0);
    this.helmet.updateMatrixWorld();
    const wp = new THREE.Vector3();
    this.helmet.getWorldPosition(wp);
    this.helmet.removeFromParent();
    game.scene.add(this.helmet);
    this.helmet.position.copy(wp);
    game.addDebris(this.helmet, new THREE.Vector3((d.x || 0) * 3 + rand(-1, 1), rand(2.5, 4), (d.z || 0) * 3 + rand(-1, 1)), 0.12);
  }

  updateDeath(dt, D, pos, yaw) {
    const k = clamp01(D.deathT / 0.75);
    const kk = k * k;
    const buckle = clamp01(D.deathT / 0.25);
    this.pelvis.position.y = 0.95 - buckle * 0.35 + kk * 0.1;
    this.legL.thigh.rotation.x = buckle * 0.9 - kk * 0.6;
    this.legR.thigh.rotation.x = buckle * 0.5 - kk * 0.4;
    this.legL.shin.rotation.x = -buckle * 1.3 + kk * 1.1;
    this.legR.shin.rotation.x = -buckle * 1.0 + kk * 0.9;
    this.spine.rotation.x = -0.3 * buckle * D.fallDir;
    this.root.rotation.set(D.fallDir * kk * 1.45, yaw, D.fallSide * kk, 'YXZ');
    this.root.position.set(pos.x, pos.y - kk * 0.25, pos.z);
  }

  muzzleWorld(out) {
    out.copy(this.muzzleLocal);
    return this.spine.localToWorld(out);
  }

  hide() {
    this.root.visible = false;
  }

  dispose() {
    this.root.removeFromParent();
    if (this.helmet.parent) this.helmet.removeFromParent();
  }
}
