// Savaş robotu (Sketchfab "Combat Robot", ILUSHANDRO, CC BY 4.0; tools/prepare-robot.mjs): iki ayaklı, iki
// kolu gatling'li makine. Model sert parçalı; eklemler (leğen, gövde, omuzlar, kalça, diz, bilek) düğüm ağacı
// olarak gelir, hareket burada kodla verilir. Düşman askerinin görünüm arayüzünü sunar (enemy.js değişmeden
// kullanır): root, meshes (vuruş kutuları), reset, animate(dt, st), fire, hit, die, updateDeath, muzzleWorld,
// hide, dispose.
//   - Yürüyüş: ağır, ters dizli adım. Bacaklar hareket yönüne (en çok ±60°), gövde hedefe döner; her adımda
//     gövde iner-kalkar, ayak yere basınca toz ve gümbürtü
//   - Nişan: gövde eğimi ve iki kolun eğimi; atış iki kol arasında sırayla, kolu geri iter
//   - Ölüm: kıvılcım ve patlama, dizler çöker, gövde öne devrilir; enkaz uzun süre tüter
import * as THREE from 'three';
import { loadRobotAsset, CHARACTER_ASSETS } from './assets.js';
import { ROBOT } from './config.js';
import { clamp, damp, dampAngle, angleDiff, dirToYaw, rand, Spring, warnOnce } from './util.js';

const R = ROBOT;
let template = null;
let envMap = null;
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const AXIS_X = new THREE.Vector3(1, 0, 0);
const hitGeo = new Map();

export async function preloadRobot() {
  if (template) return true;
  const entry = CHARACTER_ASSETS.robot;
  if (!entry) return false;
  try {
    const scene = await loadRobotAsset();
    scene.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      const m = o.material;
      m.envMap = envMap;
      m.envMapIntensity = R.envIntensity;
      m.color.multiplyScalar(R.brighten);
      // Işıyan göz ve uyarı lambaları gölgede de seçilsin
      if (m.emissiveMap) m.emissive.setRGB(1, 1, 1).multiplyScalar(R.glow);
    });
    template = { scene, info: entry };
    return true;
  } catch (e) {
    warnOnce('robot', `Robot modeli yüklenemedi (${e.message})`);
    return false;
  }
}

export function robotModelReady() {
  return !!template;
}

export function setRobotEnvironment(tex) {
  envMap = tex;
  template?.scene.traverse((o) => {
    if (!o.isMesh) return;
    if (!o.material.envMap !== !tex) o.material.needsUpdate = true;
    o.material.envMap = tex;
  });
}

export function createRobot() {
  return template ? new RobotModel() : null;
}

class RobotModel {
  constructor() {
    const T = template;
    this.root = new THREE.Group();
    this.root.rotation.order = 'YXZ';
    this.body = T.scene.clone(true);
    this.root.add(this.body);
    this.j = {};
    this.body.traverse((o) => {
      if (T.info.joints[o.name]) this.j[o.name] = o;
    });
    this.rest = {};
    for (const [k, n] of Object.entries(this.j)) this.rest[k] = { p: n.position.clone(), q: n.quaternion.clone() };
    const v = (a) => new THREE.Vector3(a[0], a[1], a[2]);
    // Namlu ağızları omuz düğümlerinin uzayında (kol eğilince namlu da döner)
    this.muzzles = ['L', 'R'].map((s) => this.j[`shoulder${s}`].worldToLocal(this.body.localToWorld(v(T.info.muzzles[s]))));
    this.side = 0;
    this.meshes = this.buildHitboxes();
    this.recoil = [new Spring(220, 16), new Spring(220, 16)];
    this.flinch = new Spring(120, 10);
    this.phase = 0;
    this.legYaw = 0;
    this.moveT = 0;
    this.pitch = 0;
    this.lastStep = 0;
    this.smokeE = null;
  }

  // Vuruş kutuları (görünmez, düğümlere bağlı): göz/sensör "head" (zayıf nokta), gövde, kollar ve bacaklar
  buildHitboxes() {
    const out = [];
    for (const h of R.hitboxes) {
      const n = this.j[h.joint];
      if (!n) continue;
      const k = h.size.join('|');
      let g = hitGeo.get(k);
      if (!g) hitGeo.set(k, (g = new THREE.BoxGeometry(h.size[0], h.size[1], h.size[2])));
      const m = new THREE.Mesh(g);
      m.position.set(h.at[0], h.at[1], h.at[2]);
      m.visible = false;
      m.userData.zone = h.zone;
      n.add(m);
      out.push(m);
    }
    return out;
  }

  reset(pos, yaw) {
    this.root.visible = true;
    this.root.position.copy(pos);
    this.root.rotation.set(0, yaw, 0, 'YXZ');
    this.legYaw = yaw;
    for (const [k, n] of Object.entries(this.j)) {
      n.position.copy(this.rest[k].p);
      n.quaternion.copy(this.rest[k].q);
    }
    this.body.position.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
    this.phase = 0;
    this.moveT = 0;
    this.pitch = 0;
    if (this.smokeE) this.smokeE.life = 0;
    this.smokeE = null;
  }

  setRot(name, x, y = 0, z = 0) {
    const n = this.j[name];
    n.quaternion.copy(this.rest[name].q);
    if (x || y || z) n.quaternion.multiply(_q.setFromEuler(_e.set(x, y, z, 'YXZ')));
  }

  animate(dt, st) {
    if (!(dt > 0)) return;
    const step = Math.min(dt, 0.1);
    this.root.position.copy(st.pos);
    const sp = Math.hypot(st.vel.x, st.vel.z);
    // Bacaklar hareket yönüne, gövde bakışa (st.yaw); geri geri yürürken bacaklar ters döner
    let legTarget = st.yaw;
    if (sp > 0.2) {
      const mv = dirToYaw(st.vel.x, st.vel.z);
      const rel = angleDiff(st.yaw, mv);
      legTarget = st.yaw + clamp(Math.abs(rel) > Math.PI / 2 ? angleDiff(0, rel + Math.PI) : rel, -R.hipTurn, R.hipTurn);
    }
    this.legYaw = dampAngle(this.legYaw, legTarget, R.legTurn, step);
    this.root.rotation.set(0, this.legYaw, 0, 'YXZ');
    this.moveT = damp(this.moveT, clamp(sp / R.walkSpeed, 0, 1), 5, step);
    const back = sp > 0.2 && Math.abs(angleDiff(st.yaw, dirToYaw(st.vel.x, st.vel.z))) > Math.PI / 2 ? -1 : 1;
    this.phase = (this.phase + (back * Math.max(sp, this.moveT * 0.4) * step) / R.stride + 1) % 1;
    const a = this.phase * Math.PI * 2;
    const m = this.moveT;
    // Bacak döngüsü: kalça öne-arkaya, diz salınımda bükülür, bilek tabanı yere paralel tutar
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 'L' : 'R';
      const ph = a + i * Math.PI;
      const swing = Math.sin(ph) * R.hipSwing * m;
      const lift = Math.max(0, Math.cos(ph)) * R.kneeLift * m;
      this.setRot(`hip${s}`, swing - lift * 0.4);
      this.setRot(`knee${s}`, lift);
      this.setRot(`ankle${s}`, -(swing - lift * 0.4) - lift);
    }
    // Ayak basışı: gövde iner, toz ve gümbürtü (ses, enemy.js değil burada: adımla eşzamanlı)
    const bob = (1 - Math.abs(Math.cos(a))) * R.bob * m;
    this.body.position.y = -bob;
    const stepK = Math.floor(this.phase * 2);
    if (m > 0.3 && stepK !== this.lastStep) {
      this.lastStep = stepK;
      this.onStep?.(stepK);
    }
    // Gövde: bacakların dönüşünü geri alıp hedefe döner, nişanda eğilir; isabette sarsılır
    this.pitch = damp(this.pitch, st.stance === 'aim' ? st.aimPitch : -0.05, 6, step);
    const fl = this.flinch.update(step);
    const twist = angleDiff(this.legYaw, st.yaw);
    this.setRot('torso', this.pitch * 0.35 + fl * 0.05, twist + Math.sin(a) * 0.04 * m, Math.sin(a) * 0.03 * m);
    // Kollar nişana; ateşte geri teper
    for (let i = 0; i < 2; i++) {
      const k = this.recoil[i].update(step);
      const s = i === 0 ? 'L' : 'R';
      this.setRot(`shoulder${s}`, this.pitch * 0.65 + (st.stance === 'aim' ? 0 : -0.12) + k * 0.6);
      this.j[`shoulder${s}`].position.copy(this.rest[`shoulder${s}`].p).z += k * 0.25;
    }
  }

  fire(k = 1) {
    this.recoil[this.side].impulse(R.recoil * 25 * k);
    this.side ^= 1;
  }

  hit(zone) {
    this.flinch.impulse(zone === 'head' ? 2 : 1);
  }

  // Patlama ve kıvılcım; gövde çöker (updateDeath), enkaz tüter
  die(info, game) {
    const p = this.j.torso.getWorldPosition(new THREE.Vector3());
    game.explode(p, R.deathBlast.radius, R.deathBlast.damage, 'robot', R.deathBlast.fx);
    for (let i = 0; i < 40; i++) {
      const c = game.effects._c.setRGB(1, rand(0.6, 0.9), 0.4);
      game.effects.add.spawn(p.x, p.y, p.z, rand(-7, 7), rand(2, 10), rand(-7, 7), rand(0.5, 1.4), 0.07, 0.02, c, 1, 12, 0.4);
    }
    this.smokeE = game.effects.addEmitter({
      rate: 9,
      life: R.wreckSmoke,
      spawn: (fx) => {
        const q = this.j.torso.getWorldPosition(_v);
        const gg = rand(0.08, 0.16);
        fx.smoke.spawn(q.x + rand(-0.4, 0.4), q.y + 0.3, q.z + rand(-0.4, 0.4), rand(-0.2, 0.4), rand(1.5, 3), rand(-0.2, 0.2), rand(3, 6), 0.8, 4, fx._c.setRGB(gg, gg, gg), 0.55, -0.1, 0.1);
        if (Math.random() < 0.25) fx.add.spawn(q.x, q.y, q.z, rand(-2, 2), rand(1, 4), rand(-2, 2), rand(0.2, 0.5), 0.05, 0.02, fx._c.setRGB(1, 0.75, 0.4), 1, 10, 0.3);
      },
    });
  }

  updateDeath(dt, D, pos, yaw) {
    this.root.position.copy(pos);
    const k = clamp(D.deathT / 1.2, 0, 1);
    const kk = k * k;
    // Dizler çöker, gövde öne devrilir, kollar sarkar
    this.body.position.y = -kk * R.deathDrop;
    for (const s of ['L', 'R']) {
      this.setRot(`hip${s}`, -kk * 0.9);
      this.setRot(`knee${s}`, kk * 1.6);
      this.setRot(`ankle${s}`, -kk * 0.7);
      this.setRot(`shoulder${s}`, -kk * 0.7 + (s === 'L' ? 0.1 : -0.1) * kk);
    }
    this.setRot('torso', kk * 0.45 * D.fallDir, 0, D.fallSide * kk * 0.4);
    this.root.rotation.set(0, this.legYaw, 0, 'YXZ');
    void yaw;
  }

  muzzleWorld(out) {
    return this.j[`shoulder${this.side ? 'R' : 'L'}`].localToWorld(out.copy(this.muzzles[this.side]));
  }

  hide() {
    this.root.visible = false;
  }

  dispose() {
    this.root.removeFromParent();
    if (this.smokeE) this.smokeE.life = 0;
  }
}
const _e = new THREE.Euler();
void AXIS_X;
