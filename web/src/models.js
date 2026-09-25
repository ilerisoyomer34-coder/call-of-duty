// Prosedürel modeller: silahlar (birinci şahıs ve düşman), kollar, askerler, araçlar, görev nesneleri.
// Sketchfab asset'leri gelene kadar yer tutucu değil, oyunun kendi görsel dili.
import * as THREE from 'three';

const matCache = new Map();
export function mat(color, rough = 0.7, metal = 0.1, extra = null) {
  const key = `${color}|${rough}|${metal}|${extra ? JSON.stringify(extra) : ''}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...(extra || {}) });
    matCache.set(key, m);
  }
  return m;
}

const boxGeoCache = new Map();
function boxGeo(w, h, d) {
  const k = `${w}|${h}|${d}`;
  let g = boxGeoCache.get(k);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    boxGeoCache.set(k, g);
  }
  return g;
}

function part(parent, geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}
const B = (parent, w, h, d, material, x, y, z, rx, ry, rz) => part(parent, boxGeo(w, h, d), material, x, y, z, rx, ry, rz);
// Z eksenli silindir (namlu vb.)
function cylZ(parent, r, len, material, x, y, z, seg = 12, open = false) {
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, open);
  g.rotateX(Math.PI / 2);
  return part(parent, g, material, x, y, z);
}

// Grubun tüm meshlerini tek geometriye (köşe renkli) birleştirir: çizim çağrısını azaltır.
export function mergeGroup(group, material) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const pos = [];
  const nor = [];
  const col = [];
  const idx = [];
  const v = new THREE.Vector3();
  const m4 = new THREE.Matrix4();
  const nm = new THREE.Matrix3();
  group.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    m4.multiplyMatrices(inv, o.matrixWorld);
    nm.getNormalMatrix(m4);
    const c = o.material.color;
    const base = pos.length / 3;
    const P = g.attributes.position;
    const N = g.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(m4);
      pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
      nor.push(v.x, v.y, v.z);
      col.push(c.r, c.g, c.b);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(base + g.index.getX(i));
    else for (let i = 0; i < P.count; i++) idx.push(base + i);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return new THREE.Mesh(geo, material);
}

// --- Silahlar ---
// Yerel eksen: köken tabanca kabzasının üstü (sağ el), namlu -Z yönünde.
// Dönüş: { root, parts, muzzle, sight, leftHand, rightHand, dot }
export function buildRifle() {
  const root = new THREE.Group();
  const tan = mat(0x8a7556, 0.75, 0.05);
  const blk = mat(0x1f2123, 0.45, 0.6);
  const blk2 = mat(0x2c2f31, 0.6, 0.35);
  B(root, 0.055, 0.07, 0.34, blk, 0, 0.045, -0.12);
  B(root, 0.05, 0.05, 0.2, blk2, 0, -0.005, -0.1);
  B(root, 0.046, 0.05, 0.075, blk2, 0, -0.045, -0.14);
  B(root, 0.032, 0.1, 0.045, tan, 0, -0.058, 0.025, -0.3);
  B(root, 0.008, 0.03, 0.05, blk2, 0, -0.035, -0.035); // tetik korkuluğu
  cylZ(root, 0.015, 0.12, blk, 0, 0.04, 0.1);
  B(root, 0.046, 0.075, 0.16, tan, 0, 0.022, 0.2);
  B(root, 0.05, 0.12, 0.022, blk2, 0, 0.0, 0.285);
  B(root, 0.062, 0.062, 0.26, tan, 0, 0.045, -0.42);
  B(root, 0.022, 0.012, 0.5, blk, 0, 0.083, -0.25);
  for (let i = 0; i < 5; i++) B(root, 0.064, 0.01, 0.018, blk2, 0, 0.045, -0.33 - i * 0.045);
  cylZ(root, 0.011, 0.16, blk, 0, 0.045, -0.63);
  cylZ(root, 0.017, 0.055, blk, 0, 0.045, -0.735, 8);
  B(root, 0.03, 0.07, 0.035, tan, 0, -0.018, -0.46, 0.2); // ön tutamak
  B(root, 0.004, 0.035, 0.07, blk2, 0.03, 0.045, -0.08); // kovan penceresi
  // Nişangah (red dot)
  B(root, 0.03, 0.028, 0.05, blk, 0, 0.1, -0.08);
  const tube = cylZ(root, 0.021, 0.065, blk, 0, 0.13, -0.08, 20, true);
  tube.material = mat(0x1f2123, 0.45, 0.6, { side: THREE.DoubleSide });
  const lens = new THREE.Mesh(
    new THREE.CircleGeometry(0.02, 20),
    new THREE.MeshBasicMaterial({ color: 0x5f8a7a, transparent: true, opacity: 0.12, depthWrite: false })
  );
  lens.position.set(0, 0.13, -0.11);
  root.add(lens);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0011, 12), new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
  dot.position.set(0, 0.13, -0.1);
  dot.renderOrder = 5;
  root.add(dot);
  const mag = new THREE.Group();
  mag.position.set(0, -0.07, -0.145);
  B(mag, 0.03, 0.17, 0.065, tan, 0, -0.06, 0.012, 0.25);
  root.add(mag);
  const charging = new THREE.Group();
  charging.position.set(0, 0.076, 0.045);
  B(charging, 0.045, 0.012, 0.02, blk2, 0, 0, 0);
  root.add(charging);
  return {
    root,
    parts: { mag, charging },
    muzzle: new THREE.Vector3(0, 0.045, -0.77),
    sight: new THREE.Vector3(0, 0.13, -0.08),
    leftHand: new THREE.Vector3(-0.005, -0.03, -0.45),
    rightHand: new THREE.Vector3(0, -0.035, 0.03),
    eject: new THREE.Vector3(0.03, 0.045, -0.08),
    dot,
  };
}

export function buildPistol() {
  const root = new THREE.Group();
  const slideM = mat(0x2b2d30, 0.4, 0.65);
  const frame = mat(0x1a1b1d, 0.7, 0.1);
  const slide = new THREE.Group();
  root.add(slide);
  B(slide, 0.03, 0.035, 0.19, slideM, 0, 0.032, -0.08);
  for (let i = 0; i < 5; i++) B(slide, 0.032, 0.03, 0.004, frame, 0, 0.032, 0.0 - i * 0.008);
  B(slide, 0.004, 0.009, 0.006, frame, 0, 0.054, -0.165); // arpacık
  B(slide, 0.006, 0.009, 0.006, frame, -0.0075, 0.054, 0.004); // gez
  B(slide, 0.006, 0.009, 0.006, frame, 0.0075, 0.054, 0.004);
  B(root, 0.028, 0.022, 0.16, frame, 0, 0.005, -0.075);
  cylZ(root, 0.0065, 0.02, slideM, 0, 0.032, -0.18, 8);
  B(root, 0.028, 0.11, 0.045, frame, 0, -0.05, 0.012, -0.25);
  B(root, 0.006, 0.025, 0.035, frame, 0, -0.018, -0.03);
  const mag = new THREE.Group();
  mag.position.set(0, -0.02, 0.005);
  B(mag, 0.022, 0.1, 0.035, slideM, 0, -0.045, 0.01, -0.25);
  B(mag, 0.03, 0.01, 0.048, frame, 0, -0.098, 0.024, -0.25);
  root.add(mag);
  return {
    root,
    parts: { slide, mag },
    muzzle: new THREE.Vector3(0, 0.032, -0.19),
    sight: new THREE.Vector3(0, 0.0555, -0.08),
    leftHand: new THREE.Vector3(-0.022, -0.055, 0.012),
    rightHand: new THREE.Vector3(0, -0.04, 0.015),
    eject: new THREE.Vector3(0.018, 0.04, -0.05),
    dot: null,
  };
}

export function buildShotgun() {
  const root = new THREE.Group();
  const blk = mat(0x1f2123, 0.45, 0.6);
  const furn = mat(0x4a4f3a, 0.8, 0.05);
  B(root, 0.05, 0.075, 0.24, blk, 0, 0.035, -0.08);
  cylZ(root, 0.013, 0.52, blk, 0, 0.06, -0.45);
  cylZ(root, 0.014, 0.42, blk, 0, 0.022, -0.4);
  B(root, 0.008, 0.005, 0.5, blk, 0, 0.0755, -0.45);
  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.0035, 8, 6), mat(0xd8c89a, 0.3, 0.7));
  bead.position.set(0, 0.079, -0.69);
  root.add(bead);
  B(root, 0.02, 0.004, 0.01, blk, 0, 0.079, 0.0); // gez sırtı
  B(root, 0.032, 0.1, 0.045, furn, 0, -0.058, 0.025, -0.3);
  B(root, 0.046, 0.085, 0.26, furn, 0, 0.018, 0.2);
  B(root, 0.05, 0.12, 0.022, blk, 0, 0.0, 0.33);
  B(root, 0.006, 0.028, 0.045, blk, 0, -0.022, -0.03);
  const pump = new THREE.Group();
  pump.position.set(0, 0.022, -0.34);
  B(pump, 0.052, 0.05, 0.16, furn, 0, 0, 0);
  for (let i = 0; i < 4; i++) B(pump, 0.054, 0.052, 0.008, blk, 0, 0, -0.06 + i * 0.04);
  root.add(pump);
  return {
    root,
    parts: { pump },
    muzzle: new THREE.Vector3(0, 0.06, -0.72),
    sight: new THREE.Vector3(0, 0.0785, -0.3),
    leftHand: new THREE.Vector3(0, -0.012, -0.34),
    rightHand: new THREE.Vector3(0, -0.035, 0.03),
    eject: new THREE.Vector3(0.03, 0.04, -0.06),
    dot: null,
  };
}

export function buildWeapon(id) {
  if (id === 'pistol') return buildPistol();
  if (id === 'shotgun') return buildShotgun();
  return buildRifle();
}

// Düşman silahları (tek mesh'e birleştirilir).
export function buildEnemyGun(kind) {
  const g = new THREE.Group();
  const blk = mat(0x1d1e1f, 0.6, 0.4);
  const wood = mat(0x5a4230, 0.8, 0.05);
  const olive = mat(0x3f4432, 0.8, 0.1);
  if (kind === 'shotgun') {
    B(g, 0.05, 0.07, 0.24, blk, 0, 0.03, -0.08);
    cylZ(g, 0.014, 0.5, blk, 0, 0.05, -0.44, 6);
    B(g, 0.05, 0.05, 0.16, olive, 0, 0.015, -0.33);
    B(g, 0.045, 0.08, 0.25, olive, 0, 0.015, 0.19);
    B(g, 0.03, 0.09, 0.04, olive, 0, -0.05, 0.02, -0.3);
  } else if (kind === 'lmg') {
    B(g, 0.07, 0.09, 0.42, blk, 0, 0.04, -0.12);
    cylZ(g, 0.018, 0.5, blk, 0, 0.05, -0.55, 6);
    B(g, 0.1, 0.1, 0.12, olive, -0.06, -0.03, -0.12);
    B(g, 0.05, 0.09, 0.2, blk, 0, 0.02, 0.2);
    B(g, 0.03, 0.09, 0.04, blk, 0, -0.05, 0.02, -0.3);
    B(g, 0.012, 0.18, 0.012, blk, 0.04, -0.05, -0.62, 0.5, 0, 0.3);
    B(g, 0.012, 0.18, 0.012, blk, -0.04, -0.05, -0.62, 0.5, 0, -0.3);
  } else if (kind === 'sniper') {
    B(g, 0.05, 0.07, 0.36, blk, 0, 0.03, -0.1);
    cylZ(g, 0.012, 0.6, blk, 0, 0.04, -0.58, 6);
    cylZ(g, 0.025, 0.3, blk, 0, 0.11, -0.1, 8);
    B(g, 0.05, 0.1, 0.3, wood, 0, 0.0, 0.2);
    B(g, 0.03, 0.09, 0.04, wood, 0, -0.05, 0.02, -0.3);
  } else {
    // AK tarzı piyade tüfeği (kurgusal)
    B(g, 0.05, 0.075, 0.36, blk, 0, 0.035, -0.1);
    cylZ(g, 0.011, 0.36, blk, 0, 0.05, -0.5, 6);
    B(g, 0.055, 0.055, 0.22, wood, 0, 0.03, -0.35);
    B(g, 0.03, 0.17, 0.06, blk, 0, -0.08, -0.13, 0.35);
    B(g, 0.045, 0.085, 0.24, wood, 0, 0.0, 0.2);
    B(g, 0.03, 0.09, 0.04, wood, 0, -0.05, 0.02, -0.3);
  }
  return g;
}

// --- Birinci şahıs kollar ---
export function buildArms() {
  const sleeve = mat(0x59603f, 0.95, 0.0);
  const glove = mat(0x2a2826, 0.85, 0.05);
  const cuff = mat(0x4a4f36, 0.95, 0.0);
  const mk = () => {
    const g = new THREE.Group();
    const fore = B(g, 0.082, 0.082, 1, sleeve, 0, 0, 0);
    const cuffM = B(g, 0.09, 0.09, 0.05, cuff, 0, 0, 0);
    const hand = B(g, 0.07, 0.05, 0.1, glove, 0, 0, 0);
    const fingers = B(g, 0.065, 0.035, 0.05, glove, 0, 0, 0);
    return { g, fore, cuff: cuffM, hand, fingers };
  };
  return { left: mk(), right: mk() };
}

// Kol parçalarını dirsekten ele yerleştirir (basit IK).
const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _z = new THREE.Vector3(0, 0, 1);
export function poseArm(arm, elbow, hand) {
  _dir.subVectors(hand, elbow);
  const len = _dir.length();
  _dir.divideScalar(len || 1);
  _q.setFromUnitVectors(_z, _dir);
  arm.fore.position.copy(elbow).addScaledVector(_dir, (len - 0.06) / 2);
  arm.fore.quaternion.copy(_q);
  arm.fore.scale.set(1, 1, Math.max(0.01, len - 0.06));
  arm.cuff.position.copy(hand).addScaledVector(_dir, -0.07);
  arm.cuff.quaternion.copy(_q);
  arm.hand.position.copy(hand).addScaledVector(_dir, -0.01);
  arm.hand.quaternion.copy(_q);
  arm.fingers.position.copy(hand).addScaledVector(_dir, 0.05);
  arm.fingers.position.y -= 0.01;
  arm.fingers.quaternion.copy(_q);
}

// --- Düşman askeri ---
// Hiyerarşi: root(ayak) > pelvis > [thighL>shinL, thighR>shinR, spine > head, helmet]
const enemyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.05 });
const _limbTmp = new THREE.Vector3();

function limbBetween(parent, a, b, t, material) {
  _limbTmp.subVectors(b, a);
  const len = _limbTmp.length();
  const m = B(parent, t, t, len, material, 0, 0, 0);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(_z, _limbTmp.normalize());
  return m;
}

export function buildSoldier(type, colors) {
  const C = colors;
  const uni = mat(C.uniform, 0.95, 0);
  const vest = mat(C.vest, 0.9, 0);
  const skin = mat(C.skin, 0.8, 0);
  const boot = mat(0x2a241e, 0.9, 0);
  const band = mat(C.band, 0.9, 0);
  const glove = mat(0x252320, 0.9, 0);
  const scarf = mat(0x3a352c, 0.95, 0);

  const root = new THREE.Group();
  const pelvis = new THREE.Group();
  pelvis.position.y = 0.95;
  root.add(pelvis);

  // Kalça (tek mesh)
  const hipsG = new THREE.Group();
  B(hipsG, 0.34, 0.2, 0.22, uni, 0, 0, 0);
  B(hipsG, 0.36, 0.05, 0.24, vest, 0, 0.08, 0);
  const hips = mergeGroup(hipsG, enemyMat);
  pelvis.add(hips);

  const mkLeg = (side) => {
    const thigh = new THREE.Group();
    thigh.position.set(0.1 * side, -0.06, 0);
    const tg = new THREE.Group();
    B(tg, 0.15, 0.46, 0.17, uni, 0, -0.23, 0);
    B(tg, 0.05, 0.12, 0.1, vest, 0.08 * side, -0.25, 0); // cep
    const tMesh = mergeGroup(tg, enemyMat);
    thigh.add(tMesh);
    const shin = new THREE.Group();
    shin.position.set(0, -0.44, 0);
    const sg = new THREE.Group();
    B(sg, 0.13, 0.42, 0.15, uni, 0, -0.2, 0);
    B(sg, 0.14, 0.12, 0.26, boot, 0, -0.44, -0.04);
    B(sg, 0.14, 0.09, 0.16, vest, 0, -0.02, -0.02); // dizlik
    const sMesh = mergeGroup(sg, enemyMat);
    shin.add(sMesh);
    thigh.add(shin);
    pelvis.add(thigh);
    return { thigh, shin, meshes: [tMesh, sMesh] };
  };
  const legL = mkLeg(-1);
  const legR = mkLeg(1);

  const spine = new THREE.Group();
  spine.position.y = 0.08;
  pelvis.add(spine);
  const sg = new THREE.Group();
  B(sg, 0.4, 0.52, 0.24, uni, 0, 0.26, 0);
  B(sg, 0.44, 0.36, 0.3, vest, 0, 0.3, 0);
  B(sg, 0.1, 0.12, 0.06, vest, -0.12, 0.24, -0.17);
  B(sg, 0.1, 0.12, 0.06, vest, 0.0, 0.24, -0.17);
  B(sg, 0.1, 0.12, 0.06, vest, 0.12, 0.24, -0.17);
  B(sg, 0.3, 0.3, 0.12, vest, 0, 0.3, 0.2); // sırt çantası
  B(sg, 0.13, 0.05, 0.13, band, -0.25, 0.37, 0); // kol bandı
  // Kollar sabit tüfek tutuş pozunda
  const shR = new THREE.Vector3(0.22, 0.45, 0.0);
  const shL = new THREE.Vector3(-0.22, 0.45, 0.0);
  const grip = new THREE.Vector3(0.09, 0.34, -0.14);
  const fore = new THREE.Vector3(0.07, 0.33, -0.52);
  const elR = new THREE.Vector3(0.28, 0.2, -0.04);
  const elL = new THREE.Vector3(-0.13, 0.2, -0.32);
  limbBetween(sg, shR, elR, 0.12, uni);
  limbBetween(sg, elR, grip, 0.105, uni);
  limbBetween(sg, shL, elL, 0.12, uni);
  limbBetween(sg, elL, fore, 0.105, uni);
  B(sg, 0.08, 0.08, 0.1, glove, grip.x, grip.y, grip.z);
  B(sg, 0.08, 0.08, 0.1, glove, fore.x, fore.y, fore.z);
  const gun = buildEnemyGun(ENEMY_GUN_KIND[type] || 'rifle');
  gun.position.copy(grip).add(new THREE.Vector3(0, 0.02, 0.02));
  sg.add(gun);
  const spineMesh = mergeGroup(sg, enemyMat);
  spine.add(spineMesh);

  const head = new THREE.Group();
  head.position.y = 0.56;
  spine.add(head);
  const hg = new THREE.Group();
  B(hg, 0.09, 0.08, 0.09, skin, 0, 0.02, 0); // boyun
  B(hg, 0.19, 0.22, 0.21, skin, 0, 0.14, 0);
  B(hg, 0.2, 0.1, 0.22, scarf, 0, 0.08, -0.005); // yüz örtüsü
  B(hg, 0.16, 0.03, 0.02, mat(0x111111, 0.3, 0.2), 0, 0.17, -0.105); // gözlük
  const headMesh = mergeGroup(hg, enemyMat);
  head.add(headMesh);
  const helmetG = new THREE.Group();
  const hs = new THREE.Mesh(new THREE.SphereGeometry(0.145, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(C.helmet, 0.8, 0.1));
  hs.scale.set(1, 0.9, 1.08);
  helmetG.add(hs);
  B(helmetG, 0.3, 0.02, 0.32, mat(C.helmet, 0.8, 0.1), 0, 0.005, 0);
  const helmet = mergeGroup(helmetG, enemyMat);
  helmet.position.y = 0.2;
  head.add(helmet);

  // Muzzle noktası (spine uzayında): namlu ucu
  const muzzleLocal = new THREE.Vector3(grip.x, grip.y + 0.07, grip.z - (type === 'heavy' ? 0.82 : type === 'sniper' ? 0.9 : 0.72));

  const bodyMeshes = [hips, legL.meshes[0], legL.meshes[1], legR.meshes[0], legR.meshes[1], spineMesh, headMesh, helmet];
  hips.userData.zone = 'torso';
  spineMesh.userData.zone = 'torso';
  headMesh.userData.zone = 'head';
  helmet.userData.zone = 'head';
  for (const m of [...legL.meshes, ...legR.meshes]) m.userData.zone = 'limb';
  for (const m of bodyMeshes) {
    m.castShadow = true;
    m.receiveShadow = false;
  }
  if (C.scale) root.scale.setScalar(C.scale);
  return { root, pelvis, spine, head, helmet, legL, legR, meshes: bodyMeshes, muzzleLocal };
}
const ENEMY_GUN_KIND = { rifleman: 'rifle', shotgunner: 'shotgun', heavy: 'lmg', sniper: 'sniper', dummy: 'rifle' };

// --- Görev nesneleri ---
export function buildAAGun() {
  const root = new THREE.Group();
  const olive = mat(0x4f5a3c, 0.8, 0.3);
  const dark = mat(0x2a2d2b, 0.6, 0.5);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 0.5, 12), olive);
  base.position.y = 0.25;
  root.add(base);
  const turret = new THREE.Group();
  turret.position.y = 0.5;
  root.add(turret);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.4, 12), dark);
  ring.position.y = 0.2;
  turret.add(ring);
  B(turret, 1.4, 0.9, 1.0, olive, 0, 0.85, 0);
  B(turret, 0.08, 0.9, 1.1, olive, 0.75, 1.0, 0);
  B(turret, 0.08, 0.9, 1.1, olive, -0.75, 1.0, 0);
  B(turret, 0.5, 0.5, 0.5, dark, 0, 0.7, 0.75); // koltuk
  const guns = new THREE.Group();
  guns.position.set(0, 1.3, -0.1);
  guns.rotation.x = 0.7;
  turret.add(guns);
  for (const sx of [-0.35, 0.35]) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 3.2, 8), dark);
    bar.rotation.x = Math.PI / 2;
    bar.position.set(sx, 0, -1.7);
    guns.add(bar);
    B(guns, 0.3, 0.35, 0.8, olive, sx, 0, -0.1);
  }
  for (let i = 0; i < 3; i++) B(root, 0.5, 0.3, 0.35, mat(0x4d5234, 0.8, 0.2), 1.9, 0.15 + i * 0.3, -0.6 + (i % 2) * 0.1);
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return { root, turret, guns };
}

export function buildBarrel() {
  const g = new THREE.Group();
  const red = mat(0x8e2418, 0.6, 0.35);
  const band = mat(0x2b1f1a, 0.7, 0.4);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 14), red);
  body.position.y = 0.45;
  g.add(body);
  for (const y of [0.2, 0.7]) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.04, 14), band);
    r.position.y = y;
    g.add(r);
  }
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.02, 14), mat(0xd9a126, 0.6, 0.3));
  top.position.y = 0.905;
  g.add(top);
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

export function buildLaptop() {
  const g = new THREE.Group();
  const body = mat(0x2a2c2e, 0.5, 0.4);
  B(g, 0.36, 0.02, 0.25, body, 0, 0.01, 0);
  const lid = new THREE.Group();
  lid.position.set(0, 0.02, 0.12);
  lid.rotation.x = -0.35;
  B(lid, 0.36, 0.24, 0.015, body, 0, 0.12, 0);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.33, 0.21),
    new THREE.MeshStandardMaterial({ color: 0x0a1a12, emissive: 0x3dd68c, emissiveIntensity: 0.9 })
  );
  screen.position.set(0, 0.12, -0.009);
  screen.rotation.y = Math.PI;
  lid.add(screen);
  g.add(lid);
  return { root: g, screen };
}

export function buildAmmoCrate() {
  const g = new THREE.Group();
  const green = mat(0x4a5638, 0.8, 0.15);
  const dark = mat(0x2d3322, 0.8, 0.2);
  B(g, 1.0, 0.45, 0.55, green, 0, 0.225, 0);
  B(g, 1.04, 0.06, 0.59, dark, 0, 0.47, 0);
  B(g, 0.2, 0.08, 0.04, mat(0xc9a227, 0.6, 0.3), 0, 0.3, -0.28);
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

export function buildPouch() {
  const g = new THREE.Group();
  B(g, 0.28, 0.14, 0.18, mat(0x4d5436, 0.9, 0.05), 0, 0.07, 0);
  B(g, 0.3, 0.04, 0.2, mat(0x3a402a, 0.9, 0.05), 0, 0.15, 0);
  B(g, 0.06, 0.04, 0.02, mat(0xc9a227, 0.5, 0.4), 0, 0.1, -0.1);
  return g;
}

export function buildGrenade() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), mat(0x3f4a2e, 0.7, 0.2));
  body.scale.set(1, 1.2, 1);
  g.add(body);
  B(g, 0.03, 0.04, 0.03, mat(0x8a8d8f, 0.4, 0.8), 0, 0.06, 0);
  B(g, 0.012, 0.07, 0.02, mat(0x8a8d8f, 0.4, 0.8), 0.022, 0.04, 0);
  return g;
}

export function buildC4() {
  const g = new THREE.Group();
  B(g, 0.22, 0.08, 0.14, mat(0xcfc6a8, 0.9, 0), 0, 0.04, 0);
  B(g, 0.08, 0.03, 0.06, mat(0x222222, 0.6, 0.3), 0, 0.095, 0);
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2010 }));
  light.position.set(0.02, 0.115, 0);
  g.add(light);
  return { root: g, light };
}

export function buildHelicopter() {
  const root = new THREE.Group();
  const body = mat(0x3b4331, 0.7, 0.3);
  const dark = mat(0x1d2019, 0.6, 0.4);
  const glass = mat(0x1a2a30, 0.1, 0.8);
  B(root, 2.6, 2.1, 6.0, body, 0, 1.9, 0);
  B(root, 2.3, 1.6, 1.6, glass, 0, 2.0, -3.3);
  B(root, 2.0, 1.0, 1.2, body, 0, 3.3, 0.4);
  B(root, 0.7, 0.8, 7.5, body, 0, 2.6, 6.6);
  B(root, 0.15, 2.0, 1.2, body, 0, 3.6, 10.0);
  B(root, 2.4, 0.12, 0.8, body, 0, 2.7, 9.6);
  for (const sx of [-1.2, 1.2]) {
    B(root, 0.1, 0.1, 5.2, dark, sx, 0.1, 0);
    B(root, 0.08, 0.8, 0.08, dark, sx, 0.5, -1.6);
    B(root, 0.08, 0.8, 0.08, dark, sx, 0.5, 1.6);
  }
  // Açık yan kapı boşluğu (koyu iç)
  B(root, 2.62, 1.5, 2.0, mat(0x0e100c, 1, 0), 0, 1.8, 0.4);
  const rotor = new THREE.Group();
  rotor.position.set(0, 4.0, 0.3);
  root.add(rotor);
  B(rotor, 0.3, 0.3, 0.3, dark, 0, 0, 0);
  for (let i = 0; i < 4; i++) {
    const blade = B(rotor, 0.35, 0.05, 7.5, dark, 0, 0.1, 0);
    blade.rotation.y = (i * Math.PI) / 2;
    blade.geometry = boxGeo(0.35, 0.05, 7.5);
    blade.position.set(Math.sin((i * Math.PI) / 2) * 3.75, 0.1, Math.cos((i * Math.PI) / 2) * 3.75);
  }
  const tail = new THREE.Group();
  tail.position.set(0.25, 3.5, 10.2);
  root.add(tail);
  for (let i = 0; i < 2; i++) {
    const b = B(tail, 0.05, 1.8, 0.2, dark, 0, 0, 0);
    b.rotation.x = (i * Math.PI) / 2;
  }
  root.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return { root, rotor, tail };
}

export function buildShotgunPickup() {
  const w = buildShotgun();
  w.root.scale.setScalar(1.35);
  return w.root;
}
