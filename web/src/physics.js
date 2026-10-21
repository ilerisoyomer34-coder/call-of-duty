// Fizik motoru (Rapier, Rust → WebAssembly). Yalnız görsel fizik:
//  - ragdoll: ölen asker iskeletinden kapsül gövdeler + sınırlı menteşeler (dirsek, diz, kalça, bel, boyun) ve serbest
//    omuzlarla yığılır; mermi vurulan parçayı, patlama bütün gövdeyi iter; uyuyunca (ya da maxSec sonra) gövdeler
//    kaldırılır, poz donar (maliyet sıfır);
//  - düşen silah/kask (game.addDebris), kovanlar ve patlama parçaları (effects.js) duvara ve zemine çarpıp seker.
// Oyuncu hareketi, mermiler ve çevrim içi simülasyon shared/'daki belirlenimci kodda kalır: sunucu ve istemci aynı
// sonucu bulmalı, genel bir fizik motoru bunu bozar ve sunucuya da yük olur.
// Statik dünya, haritanın çarpışma kutularından (CollisionWorld: eksen hizalı kutular + y = 0 zemini) kurulur; sonradan
// eklenen/kaldırılan kutular (patlayan varil) World kancasıyla izlenir, her karede yeniden kurulan tank kutuları alınmaz.
// Motor açılışı bekletmeden arka planda yüklenir (init); yüklenemezse (eski cihaz, WebAssembly'ye izin vermeyen sayfa)
// ready hep false kalır ve oyun eski yollarla (canlandırılmış ölüm, basit sekme) sürer.
import * as THREE from 'three';
import { PHYSICS as P } from './config.js';

// Çarpışma grupları (16 bit üyelik << 16 | 16 bit süzgeç). Ragdoll parçaları birbirine çarpmaz: ölüm pozunda kollar
// göğsün önünde iç içe; çarpışsaydı ilk adımda patlar gibi savrulurdu (iki ceset üst üste yığılmaz, nadir)
const G_WORLD = 1;
const G_RAGDOLL = 2;
const G_SMALL = 4;
const groups = (member, filter) => (member << 16) | filter;
const RAGDOLL_GROUPS = groups(G_RAGDOLL, G_WORLD | G_SMALL);
const SMALL_GROUPS = groups(G_SMALL, G_WORLD | G_RAGDOLL | G_SMALL);
const WORLD_GROUPS = groups(G_WORLD, G_RAGDOLL | G_SMALL);

// Geçici nesneler (her karede bellek ayırmamak için)
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _p2 = new THREE.Vector3();
const _d = new THREE.Vector3();
const _a = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _box = new THREE.Box3();
const Y = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);
const plain = (v) => ({ x: v.x, y: v.y, z: v.z });
const plainQ = (q) => ({ x: q.x, y: q.y, z: q.z, w: q.w });

// Gövdenin hız değişimi (m/s): kütleyle çarpılmış itme (bütün parçalar aynı hızı alsın, ağır olan geride kalmasın)
function pushBody(body, vx, vy, vz) {
  const m = body.mass();
  body.applyImpulse({ x: vx * m, y: vy * m, z: vz * m }, true);
}

export class PhysicsSystem {
  constructor(game) {
    this.game = game;
    this.R = null;
    this.status = 'idle'; // idle | loading | ready | failed
    this.error = null;
    this.enabled = true; // Ayarlar → Fizik efektleri
    this.world = null; // Rapier dünyası (harita başına)
    this.map = null; // bağlı CollisionWorld
    this.gen = 0; // dünya kuşağı: eski dünyanın gövdesini taşıyan efekt bunu karşılaştırır
    this.acc = 0;
    this.statics = new Map(); // CollisionWorld kutusu → Rapier çarpıştırıcısı
    this.ragdolls = [];
    this.debris = [];
    this.touch = !!game?.isTouch;
  }

  // Motor çalışıyor ve bir harita bağlı mı (efektler ve ragdoll buna bakar)
  get ready() {
    return this.enabled && this.status === 'ready' && !!this.world;
  }

  // load(): Rapier modülünü (ya da onun default'unu) veren söz. Oyunda derlemenin virtual:rapier'i (gömülü, yerel dosya
  // ya da CDN); testlerde paketin kendisi
  async init(load = defaultLoader) {
    if (this.status !== 'idle') return this.status === 'ready';
    this.status = 'loading';
    try {
      const mod = await load();
      const R = mod?.default?.init ? mod.default : mod;
      await R.init();
      this.R = R;
      this.status = 'ready';
      // Motor yüklenirken açılmış harita varsa şimdi kurulur
      if (this.map) this.setMap(this.map);
      return true;
    } catch (err) {
      this.status = 'failed';
      this.error = err;
      console.warn(`Fizik motoru yüklenemedi: ${err?.message || err}`);
      return false;
    }
  }

  // Yeni harita: eski dünya atılır, kutular statik çarpıştırıcı olur. Motor henüz yüklenmediyse harita hatırlanır
  setMap(cw) {
    this.dropWorld();
    this.map = cw;
    if (cw) cw.onColliderChange = (op, c) => (op === 'add' ? this.addStatic(c) : this.removeStatic(c));
    if (!cw || this.status !== 'ready' || !this.enabled) return;
    const R = this.R;
    this.world = new R.World({ x: 0, y: P.gravity, z: 0 });
    this.world.timestep = P.step;
    this.gen++;
    const G = P.ground;
    this.world.createCollider(R.ColliderDesc.cuboid(G.halfSize, G.depth / 2, G.halfSize).setTranslation(0, -G.depth / 2, 0).setFriction(0.9).setCollisionGroups(WORLD_GROUPS));
    for (const c of cw.colliders) this.addStatic(c);
  }

  // Ayarlar → Fizik efektleri. Kapanınca dünya atılır (ragdoll'lar o anki pozda donar), açılınca harita yeniden kurulur
  setEnabled(on) {
    if (on === this.enabled) return;
    this.enabled = on;
    if (!on) this.dropWorld();
    else if (this.map) this.setMap(this.map);
  }

  // Menüye dönüş: dünya atılır, harita bağı kopar
  clear() {
    this.dropWorld();
    if (this.map) this.map.onColliderChange = null;
    this.map = null;
  }

  dropWorld() {
    for (const r of this.ragdolls) if (r.model.ragdoll === r) r.model.ragdoll = { frozen: true };
    this.ragdolls.length = 0;
    this.debris.length = 0;
    this.statics.clear();
    this.acc = 0;
    if (this.world) {
      this.world.free();
      this.world = null;
      this.gen++;
    }
  }

  // Harita kutusu → statik çarpıştırıcı. Tankın kutuları her karede yeniden kurulur: alınmaz (enkaz tankın içinden geçer)
  addStatic(c) {
    if (!this.world || this.statics.has(c) || c.owner?.kind === 'tank') return;
    const hx = (c.max.x - c.min.x) / 2;
    const hy = (c.max.y - c.min.y) / 2;
    const hz = (c.max.z - c.min.z) / 2;
    if (!(hx > 0 && hy > 0 && hz > 0)) return;
    const desc = this.R.ColliderDesc.cuboid(hx, hy, hz)
      .setTranslation(c.min.x + hx, c.min.y + hy, c.min.z + hz)
      .setFriction(0.8)
      .setCollisionGroups(WORLD_GROUPS);
    this.statics.set(c, this.world.createCollider(desc));
  }

  removeStatic(c) {
    const col = this.statics.get(c);
    if (!col) return;
    this.statics.delete(c);
    if (this.world) this.world.removeCollider(col, true);
  }

  // Sabit adım; yavaş karede en çok maxSubsteps (fazlası atılır). Ragdoll kemikleri ve enkaz mesh'leri yazılır
  update(dt) {
    if (!this.ready) return;
    this.acc += dt;
    let n = 0;
    while (this.acc >= P.step && n < P.maxSubsteps) {
      this.world.step();
      this.acc -= P.step;
      n++;
    }
    if (n === P.maxSubsteps) this.acc = 0;
    if (!n) return;
    const elapsed = n * P.step;
    for (let i = this.ragdolls.length - 1; i >= 0; i--) {
      const r = this.ragdolls[i];
      r.age += elapsed;
      this.writeRagdoll(r);
      if (r.age > P.ragdoll.maxSec || (r.age > 0.6 && this.ragdollAsleep(r))) this.freeze(r);
    }
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      if (!d.body) continue;
      d.age += elapsed;
      const t = d.body.translation();
      const q = d.body.rotation();
      d.mesh.position.set(t.x, t.y, t.z);
      d.mesh.quaternion.set(q.x, q.y, q.z, q.w);
      // Yerine oturan parça statik mesh olarak kalır (gövdesi kaldırılır)
      if ((d.body.isSleeping() && d.age > P.debris.minSec) || d.age > P.debris.settleSec) {
        this.world.removeRigidBody(d.body);
        d.body = null;
      }
    }
  }

  // --- Ragdoll ---
  // model: iskeletli asker (SkinnedSoldier: bones, root). opts: { vel, dir, zone, damage, melee }
  // Dönüş: model.ragdoll'a konan kayıt ya da null (motor yok, iskelet eksik)
  ragdoll(model, opts = {}) {
    if (!this.ready || !model?.bones) return null;
    const R = this.R;
    const RG = P.ragdoll;
    const B = model.bones;
    for (const part of RG.parts) if (!B[part.bone]) return null;
    // Sınır: en eskisi dondurulur
    const max = this.touch ? P.limits.ragdollsTouch : P.limits.ragdolls;
    while (this.ragdolls.length >= max) this.freeze(this.ragdolls[0]);
    model.root.updateMatrixWorld(true);
    const wp = (name, out) => out.setFromMatrixPosition(B[name].matrixWorld);
    // Gövdenin sağı (kalça kemiklerinden): menteşe eksenleri buna göre
    const right = new THREE.Vector3().subVectors(wp('RightUpLeg', _p), wp('LeftUpLeg', _p2));
    right.y = 0;
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    right.normalize();
    // Kök kemiğin (kalça) yerel konumu: asker yeniden doğunca geri konur (dönüşleri canlandırma yazar)
    const rag = { model, parts: [], byId: {}, age: 0, rootBone: B[RG.parts[0].bone], rootPos: B[RG.parts[0].bone].position.clone() };
    const v = opts.vel || { x: 0, y: 0, z: 0 };
    for (const spec of RG.parts) {
      const bone = B[spec.bone];
      bone.matrixWorld.decompose(_p, _q, _s);
      const pos = _p.clone();
      const rot = _q.clone();
      const inv = rot.clone().invert();
      const body = this.world.createRigidBody(
        R.RigidBodyDesc.dynamic()
          .setTranslation(pos.x, pos.y, pos.z)
          .setRotation(plainQ(rot))
          .setLinvel(v.x, v.y || 0, v.z)
          .setLinearDamping(RG.linearDamping)
          .setAngularDamping(RG.angularDamping)
          .setCanSleep(true)
      );
      const collider = (desc) =>
        this.world.createCollider(desc.setDensity(RG.density).setFriction(RG.friction).setRestitution(RG.restitution).setCollisionGroups(RAGDOLL_GROUPS), body);
      if (spec.ball) {
        // Baş: boyundan başa doğru biraz ileride küre
        const neck = wp('Neck', _a);
        _d.subVectors(pos, neck).normalize().multiplyScalar(spec.ahead).applyQuaternion(inv);
        collider(R.ColliderDesc.ball(spec.ball).setTranslation(_d.x, _d.y, _d.z));
      } else {
        this.capsule(collider, pos, inv, wp(spec.seg, _a), spec.r, spec.ext || 0);
        if (spec.foot && B[spec.foot]) this.capsule(collider, pos, inv, wp(spec.foot, _a), spec.r * 0.7, 0.05, wp(spec.seg, _p2));
      }
      const segPos = spec.seg ? wp(spec.seg, new THREE.Vector3()) : null;
      const part = { spec, bone, body, pos, rot, segPos };
      rag.parts.push(part);
      rag.byId[spec.id] = part;
      if (spec.parent) this.joint(rag.byId[spec.parent], part, right);
    }
    this.impulse(rag, opts);
    this.ragdolls.push(rag);
    model.ragdoll = rag;
    return rag;
  }

  // Kemikten (body uzayı başlangıcı) hedef noktaya kapsül. from verilirse kapsül oradan başlar (ayak)
  capsule(collider, pos, inv, to, r, ext, from = null) {
    const a = from ? _p2.subVectors(from, pos).applyQuaternion(inv) : _p2.set(0, 0, 0);
    const b = _d.subVectors(to, pos).applyQuaternion(inv);
    const dir = _a.subVectors(b, a);
    let len = dir.length();
    if (len < 1e-4) return;
    dir.divideScalar(len);
    if (ext) {
      b.addScaledVector(dir, ext);
      len += ext;
    }
    const mid = a.add(b).multiplyScalar(0.5);
    const half = Math.max(0.005, len / 2 - r * 0.6);
    _q2.setFromUnitVectors(Y, dir);
    collider(this.R.ColliderDesc.capsule(half, r).setTranslation(mid.x, mid.y, mid.z).setRotation(plainQ(_q2)));
  }

  // Ebeveyn ↔ çocuk eklemi; çocuğun kemik başı eklem noktasıdır. Menteşenin sıfırı ölüm pozudur (iki çerçeve
  // dünyada çakışacak biçimde kurulur): sınırlar o pozdan ± radyan
  joint(parent, child, right) {
    const R = this.R;
    const spec = child.spec;
    const anchor1 = _p.subVectors(child.pos, parent.pos).applyQuaternion(_q.copy(parent.rot).invert());
    const zero = { x: 0, y: 0, z: 0 };
    let joint;
    if (spec.joint === 'hinge') {
      // Menteşe ekseni (dünya): gövdenin sağı/solu ya da kemik düzleminin normali (büküm yönü artı olur)
      const axis = new THREE.Vector3();
      let limits = spec.limits;
      if (spec.axis === 'bend') {
        const pd = _a.subVectors(child.pos, parent.pos).normalize();
        const cd = child.segPos ? _d.subVectors(child.segPos, child.pos).normalize() : _d.set(0, -1, 0);
        const cur = Math.acos(Math.min(1, Math.max(-1, pd.dot(cd))));
        if (cur > 0.2) axis.crossVectors(pd, cd).normalize();
        else axis.copy(right).multiplyScalar(spec.fallback === 'left' ? -1 : 1);
        const bent = cur > 0.2 ? cur : 0;
        limits = [-bent + 0.02, spec.flex - bent];
      } else axis.copy(right).multiplyScalar(spec.axis === 'left' ? -1 : 1);
      // Dünya çerçevesi F: X = eksen. Her gövdenin yerel çerçevesi R⁻¹·F (ilk anda ikisi aynı → açı 0)
      const yAxis = Math.abs(axis.y) < 0.9 ? _p2.set(0, 1, 0) : _p2.set(1, 0, 0);
      const zAxis = new THREE.Vector3().crossVectors(axis, yAxis).normalize();
      yAxis.crossVectors(zAxis, axis).normalize();
      _m.makeBasis(axis, yAxis, zAxis);
      const F = new THREE.Quaternion().setFromRotationMatrix(_m);
      const f1 = _q2.copy(parent.rot).invert().multiply(F);
      const f2 = new THREE.Quaternion().copy(child.rot).invert().multiply(F);
      joint = this.world.createImpulseJoint(R.JointData.revolute(plain(anchor1), zero, plain(X)), parent.body, child.body, true);
      joint.setLocalFrame1(plain(anchor1), plainQ(f1));
      joint.setLocalFrame2(zero, plainQ(f2));
      joint.setLimits(limits[0], limits[1]);
    } else {
      joint = this.world.createImpulseJoint(R.JointData.spherical(plain(anchor1), zero), parent.body, child.body, true);
    }
    joint.setContactsEnabled(false);
  }

  // Ölüm anındaki itme: mermi vurulan parçayı (bir kısmı kalçaya), bıçak az
  impulse(rag, opts) {
    const dir = opts.dir;
    if (!dir) return;
    const RB = P.ragdoll.bullet;
    const k = Math.min(RB.max, RB.speed * ((opts.damage || RB.ref) / RB.ref)) * (opts.melee ? 0.35 : 1);
    if (!(k > 0)) return;
    const zones = P.ragdoll.zoneParts;
    let id = zones[opts.zone] || 'chest';
    if (Array.isArray(id)) id = id[(Math.random() * id.length) | 0];
    const hit = rag.byId[id] || rag.byId.chest;
    pushBody(hit.body, dir.x * k, (dir.y || 0) * k + RB.lift * k, dir.z * k);
    pushBody(rag.byId.pelvis.body, dir.x * k * 0.35, 0, dir.z * k * 0.35);
  }

  ragdollAsleep(r) {
    const lim = P.ragdoll.settleSpeed;
    for (const p of r.parts) {
      if (p.body.isSleeping()) continue;
      const v = p.body.linvel();
      if (Math.abs(v.x) > lim || Math.abs(v.y) > lim || Math.abs(v.z) > lim) return false;
    }
    return true;
  }

  // Gövdelerden kemiklere: kemiğe yalnız dönüş yazılır (yerel = ebeveynin dünya dönüşü⁻¹ · gövdenin dönüşü); konum
  // yalnız köke (kalça). Kemik boyları hiç değişmez: eklemin küçük açıklığı görünmez, ölüp dirilen poligon mankeninde
  // iskelet kaymaz. Sıra ebeveynden çocuğa (config'teki sıra); her yazıdan sonra alt ağaç güncellenir
  writeRagdoll(r) {
    for (let i = 0; i < r.parts.length; i++) {
      const part = r.parts[i];
      const bone = part.bone;
      const parent = bone.parent;
      const q = part.body.rotation();
      parent.matrixWorld.decompose(_p, _q2, _s);
      bone.quaternion.copy(_q2.invert()).multiply(_q.set(q.x, q.y, q.z, q.w));
      if (i === 0) {
        const t = part.body.translation();
        bone.position.set(t.x, t.y, t.z).applyMatrix4(_m.copy(parent.matrixWorld).invert());
      }
      bone.updateMatrixWorld(true);
    }
  }

  // Gövdeler kaldırılır, kemikler son pozda kalır
  freeze(r) {
    const i = this.ragdolls.indexOf(r);
    if (i >= 0) this.ragdolls.splice(i, 1);
    if (this.world) for (const p of r.parts) this.world.removeRigidBody(p.body);
    r.parts.length = 0;
    r.frozen = true;
  }

  // Asker yeniden doğdu (poligon mankeni) ya da atıldı
  release(model) {
    const r = model?.ragdoll;
    if (!r) return;
    if (!r.frozen) this.freeze(r);
    r.rootBone?.position.copy(r.rootPos);
    model.ragdoll = null;
  }

  // --- Düşen eşya (silah, kask) ---
  // mesh sahnenin kökünde olmalı (dünya = yerel). Kutusu mesh'in kendi eksenlerinde ölçülür
  addDebris(mesh, vel, spin = null) {
    if (!this.ready) return false;
    const R = this.R;
    const D = P.debris;
    const pos = mesh.position.clone();
    const rot = mesh.quaternion.clone();
    mesh.position.set(0, 0, 0);
    mesh.quaternion.identity();
    mesh.updateMatrixWorld(true);
    _box.setFromObject(mesh, true);
    mesh.position.copy(pos);
    mesh.quaternion.copy(rot);
    mesh.updateMatrixWorld(true);
    if (_box.isEmpty()) return false;
    const c = _box.getCenter(_p);
    const h = _box.getSize(_s).multiplyScalar(0.5);
    const body = this.world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, pos.y, pos.z)
        .setRotation(plainQ(rot))
        .setLinvel(vel.x, vel.y, vel.z)
        .setAngvel(spin ? plain(spin) : { x: (Math.random() - 0.5) * 10, y: (Math.random() - 0.5) * 6, z: (Math.random() - 0.5) * 10 })
        .setAngularDamping(D.angularDamping)
        .setCcdEnabled(true)
    );
    this.world.createCollider(
      R.ColliderDesc.cuboid(Math.max(D.minHalf, h.x), Math.max(D.minHalf, h.y), Math.max(D.minHalf, h.z))
        .setTranslation(c.x, c.y, c.z)
        .setDensity(D.density)
        .setFriction(D.friction)
        .setRestitution(D.restitution)
        .setCollisionGroups(SMALL_GROUPS),
      body
    );
    this.debris.push({ mesh, body, age: 0 });
    if (this.debris.length > P.limits.debris) {
      const old = this.debris.shift();
      if (old.body) this.world.removeRigidBody(old.body);
      old.mesh.removeFromParent();
    }
    return true;
  }

  // --- Küçük gövdeler (effects.js: kovan, patlama parçası) ---
  // shape: { kind: 'capsule' | 'box', r, half | hx,hy,hz } + malzeme. Dönüş: gövde (kaldırmak efektin işi: remove)
  small(pos, rot, vel, angvel, shape, mat) {
    if (!this.ready) return null;
    const R = this.R;
    const body = this.world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, pos.y, pos.z)
        .setRotation(rot ? plainQ(rot) : { x: 0, y: 0, z: 0, w: 1 })
        .setLinvel(vel.x, vel.y, vel.z)
        .setAngvel(plain(angvel))
        .setAngularDamping(0.6)
        .setCcdEnabled(true)
    );
    const desc = shape.kind === 'capsule' ? R.ColliderDesc.capsule(shape.half, shape.r).setRotation({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }) : R.ColliderDesc.cuboid(shape.hx, shape.hy, shape.hz);
    this.world.createCollider(desc.setDensity(mat.density).setFriction(mat.friction).setRestitution(mat.restitution).setCollisionGroups(SMALL_GROUPS), body);
    body.gen = this.gen;
    return body;
  }

  // Gövde bu dünyanın mı (harita değişince eski gövdeler geçersiz)
  alive(body) {
    return !!body && body.gen === this.gen && !!this.world;
  }

  remove(body) {
    if (this.alive(body)) this.world.removeRigidBody(body);
  }

  // Patlama: yarıçapın reach katı içindeki her dinamik gövdeye uzaklıkla azalan hız (biraz yukarı)
  blast(pos, radius) {
    if (!this.ready) return;
    const BL = P.blast;
    const reach = radius * BL.reach;
    this.world.bodies.forEach((b) => {
      if (!b.isDynamic()) return;
      const t = b.translation();
      const dx = t.x - pos.x;
      const dy = t.y - pos.y;
      const dz = t.z - pos.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > reach) return;
      const k = BL.speed * (1 - d / reach);
      const inv = 1 / Math.max(0.2, d);
      pushBody(b, dx * inv * k, (Math.max(0, dy) * inv + BL.up) * k, dz * inv * k);
    });
  }

  // Bilgi (konsol, testler)
  stats() {
    return {
      status: this.status,
      ready: this.ready,
      bodies: this.world ? this.world.bodies.len() : 0,
      statics: this.statics.size,
      ragdolls: this.ragdolls.length,
      debris: this.debris.filter((d) => d.body).length,
    };
  }
}

// Oyunda: derleme her sürüme uygun virtual:rapier'i verir (bağımsız: gömülü, PWA/uygulama: yerel dosya, Artifact: CDN)
function defaultLoader() {
  return import('virtual:rapier').then((m) => m.loadRapier());
}
