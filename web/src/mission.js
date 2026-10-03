// Oyun modu ve görev akışı (AShooterGameMode karşılığı): hedefler, kontrol noktaları,
// etkileşimli nesneler (C4, istihbarat, ikmal), patlayıcı variller, uçaksavarlar,
// savunma dalgaları, helikopterle tahliye ve atış poligonu modu.
import * as THREE from 'three';
import { buildMission, buildRange } from './level.js';
import { nestRing } from './maps/kit.js';
import { buildAAGun, buildFuelPump, buildBarrel, buildLaptop, buildAmmoCrate, buildPouch, buildC4, buildHelicopter, hasHelicopterProp, buildWeapon, mat } from './models.js';
import { C4, SCORE, WEAPONS, WEAPON_ORDER, LEVELS, HMG, AA_GUN, TANK, EXTRACT } from './config.js';
import { HeavyNest } from './hmg.js';
import { Tank } from './tank.js';
import { loadWeaponAsset, assetIdFor } from './assets.js';
import { weaponName } from './weaponInfo.js';
import { EV } from './events.js';
import { rand, lerp, clamp, smoothstep, pick, dirToYaw, damp } from './util.js';

const _v = new THREE.Vector3();
const _cam = new THREE.Vector3();
const _d = new THREE.Vector3();
const _e = new THREE.Vector3();
// Operasyonun kronolojik hedef sırası: bir seviyenin ilk hedefinden öncekiler yapılmış sayılır
const OBJECTIVE_ORDER = ['outpost', 'aa', 'intel', 'lz', 'defend', 'board', 'extract'];
const HELI_PARK_Y = -400; // hazır helikopter gelene dek haritanın altında bekler (görünmez, gölge düşürmez)
const LEVEL_END_DELAY = 4; // son hedef ile zafer ekranı arası (s): telsiz duyulsun, çatışma yatışsın

const TIPS = [
  'Çömelmek (C) seni daha zor fark edilir kılar ve isabetini artırır.',
  'Keskin nişancının kırmızı lazeri seni izler: hareket et ya da siper al.',
  'Kafa vuruşları çok daha ölümcüldür. Nişan alırken (sağ tık) başa odaklan.',
  'Yeşil mühimmat sandıklarında (F) cephane ve el bombanı yenileyebilirsin.',
  'Q ve E ile siperin kenarından eğilerek ateş edebilirsin.',
  'Kırmızı variller patlar. Düşmanlar yanındaysa bir mermi yeter.',
  'Koşarken ateş edemezsin; koşudan çıkmak kısa bir an sürer.',
  'Canın bir süre hasar almazsan kendiliğinden yenilenir.',
  'Silah sesi uzağa gider. Sessiz ilerlemek için çatışmadan kaçın.',
  'G tuşunu basılı tutarak el bombasının fitilini pişirebilirsin.',
];

class Barrel {
  constructor(game, pos) {
    this.game = game;
    this.pos = pos.clone();
    this.mesh = buildBarrel();
    this.mesh.position.copy(pos);
    game.scene.add(this.mesh);
    this.collider = game.world.addCollider(pos.x - 0.3, 0, pos.z - 0.3, pos.x + 0.3, 0.9, pos.z + 0.3, 'metal', this);
    this.hp = 30;
    this.dead = false;
    this.fuseT = -1;
  }
  onShot(dmg) {
    if (this.dead) return;
    this.hp -= dmg;
    if (this.hp <= 0 && this.fuseT < 0) this.fuseT = 0.12 + Math.random() * 0.15;
  }
  update(dt) {
    if (this.fuseT < 0 || this.dead) return;
    this.fuseT -= dt;
    if (this.fuseT <= 0) {
      this.dead = true;
      this.game.world.removeCollider(this.collider);
      this.game.nav?.unstampCollider(this.collider);
      this.mesh.visible = false;
      this.game.explode(this.pos.clone().setY(0.5), 6.5, 160, 'player', 0.9);
    }
  }
}

// Yerdeki silah: F ile alınır; görevde aynı türdeki silahın yerine geçer, eldeki yere düşer
class WeaponPickup {
  constructor(mission, id, pos, rotY = 0, ammo = null) {
    const g = mission.game;
    this.mission = mission;
    this.id = id;
    this.data = WEAPONS[id];
    this.pos = pos.clone();
    this.ammo = ammo;
    this.taken = false;
    this.spawnedAt = mission.time;
    this.takenAt = -1;
    this.root = new THREE.Group();
    this.root.position.copy(pos);
    this.root.rotation.y = rotY;
    g.scene.add(this.root);
    this.setModel(buildWeapon(id).root);
    if (this.data.model === 'glb') {
      loadWeaponAsset(assetIdFor(this.data))
        .then((scene) => !this.taken && this.setModel(scene))
        .catch(() => {});
    }
    // Uzaktan fark edilsin diye hafif parıltı
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.textures.soft, color: 0xffe2a0, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.glow.scale.setScalar(0.9);
    this.glow.position.set(pos.x, pos.y + 0.25, pos.z);
    g.scene.add(this.glow);
    this.interactable = {
      id: `pickup-${id}`,
      pos: this.pos.clone().setY(pos.y + 0.1),
      radius: 2.0,
      time: 0,
      get prompt() {
        return mission.pickupPrompt(this.pickup);
      },
      enabled: () => !this.taken,
      action: () => mission.takePickup(this),
    };
    this.interactable.pickup = this;
    mission.interactables.push(this.interactable);
  }

  // Silahı yan yatır, alt yüzeyi zemine otursun; metal yüzeyler ortam haritasını yansıtsın
  setModel(obj) {
    const g = this.mission.game;
    if (this.model) this.model.removeFromParent();
    const holder = new THREE.Group();
    holder.add(obj);
    holder.rotation.z = Math.PI / 2;
    this.root.add(holder);
    this.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder);
    holder.position.y = this.root.position.y - box.min.y + 0.005;
    obj.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.material = o.material.clone();
      o.material.envMap = g.envMap;
      o.material.envMapIntensity = 0.7;
    });
    this.model = holder;
  }

  remove() {
    this.taken = true;
    this.takenAt = this.mission.time;
    this.root.removeFromParent();
    this.glow.removeFromParent();
  }

  // Kontrol noktasına dönünce yerine koy
  restore() {
    const scene = this.mission.game.scene;
    this.taken = false;
    scene.add(this.root);
    scene.add(this.glow);
  }

  update(t) {
    if (!this.taken) this.glow.material.opacity = 0.3 + 0.25 * Math.sin(t * 3 + this.pos.x);
  }
}

// C4 ile imha edilen hedef: uçaksavar topu (göğe ateş eder) ya da yakıt pompası (kind: 'pump')
// Sürekli ateş: alev dili (toplamalı parçacık) + yükselen duman
function fireEmitter(p, k) {
  return {
    rate: 26 * k,
    spawn: (fx) => {
      const c = fx._c.setRGB(1, rand(0.35, 0.65), 0.12);
      fx.add.spawn(p.x + rand(-0.4, 0.4) * k, p.y + rand(0, 0.4) * k, p.z + rand(-0.4, 0.4) * k, rand(-0.3, 0.3), rand(2, 4) * k, rand(-0.3, 0.3), rand(0.4, 0.8), 1.1 * k, 0.4 * k, c, 0.9, -1, 0.5);
      if (Math.random() < 0.35) {
        const gg = rand(0.06, 0.14);
        fx.smoke.spawn(p.x + rand(-0.5, 0.5), p.y + 1.5 * k, p.z + rand(-0.5, 0.5), rand(0.3, 1), rand(2, 3.5), rand(-0.3, 0.3), rand(5, 8), 1.2 * k, 6 * k, fx._c.setRGB(gg, gg, gg), 0.55, -0.1, 0.1);
      }
    },
  };
}

class AAGun {
  constructor(game, def) {
    this.game = game;
    this.def = def;
    this.id = def.id;
    this.kind = def.kind || 'aa';
    this.pos = def.pos.clone();
    const m = this.kind === 'pump' ? buildFuelPump() : buildAAGun();
    this.model = m;
    m.root.position.copy(def.pos);
    m.root.rotation.y = def.yaw;
    game.scene.add(m.root);
    m.root.updateMatrixWorld(true);
    const x = def.pos.x;
    const z = def.pos.z;
    if (this.kind === 'aa') {
      // Alçak platform (üstüne çıkılabilir) + taret gövdesi: nişancının başı ve göğsü taretin üstünden görünür
      game.world.addCollider(x - 1.5, 0, z - 1.5, x + 1.5, AA_GUN.baseH, z + 1.5, 'metal');
      game.world.addCollider(x - AA_GUN.bodyHalf, 0, z - AA_GUN.bodyHalf, x + AA_GUN.bodyHalf, AA_GUN.bodyH, z + AA_GUN.bodyHalf, 'metal');
    } else game.world.addCollider(x - 1.5, 0, z - 1.5, x + 1.5, 1.9, z + 1.5, 'metal');
    this.destroyed = false;
    this.planted = false;
    this.fuse = 0;
    this.fireT = rand(1, 4);
    this.beepT = 0;
    this.burst = 0;
    this.burstT = 0;
    this.c4 = null;
    this.gunner = null;
    // Nişancı düzeneği arayüzü (HeavyNest ile aynı; enemy.js → actMounted): taret tam döner
    this.cfg = AA_GUN;
    this.yaw = def.yaw;
    this.arc = Math.PI;
    this.selfIdle = true; // çatışma yokken top kendi başına göğe ateş eder
    this.restPitch = AA_GUN.restPitch;
    this.warned = false;
    this.warnText = 'UÇAKSAVAR SANA ATEŞ EDİYOR · SİPER AL';
    this.calloutName = 'Uçaksavar';
    this.barrel = 0;
  }

  // Başına nişancı oturt (seviyenin düşman grupları bu topun grubunu içeriyorsa)
  man() {
    if (this.kind !== 'aa' || this.destroyed || this.gunner) return;
    this.gunner = this.game.enemies.spawn({
      id: `${this.id}g`, type: 'aaGunner', group: this.def.group || 'village', pos: this.seatPos(new THREE.Vector3()), yaw: this.def.yaw, mount: this,
    });
  }

  get aimYaw() {
    return this.model.turret.rotation.y;
  }
  get aimPitch() {
    return this.model.guns.rotation.x;
  }
  get worldYaw() {
    return this.yaw + this.aimYaw;
  }
  get wrecked() {
    return this.destroyed;
  }
  // Kumanda kolları taretle döner ama namluyla eğilmez: nişancının gövdesi namlunun tam açısını izlemez
  get animPitch() {
    return clamp(this.aimPitch, AA_GUN.animPitchMin, AA_GUN.animPitchMax);
  }
  // Nişancı başında ve çatışmada: göğe rastgele ateş yerine hedefe ateş eder
  get engaged() {
    const n = this.gunner;
    return !!n && n.alive && n.mount === this && n.aiState === 'combat';
  }

  pivot(out) {
    return out.set(this.pos.x, this.pos.y + AA_GUN.pivotH, this.pos.z);
  }

  // Nişancı taretin arkasında, platformun üstünde durur; taretle birlikte döner
  seatPos(out, yaw = this.worldYaw) {
    return out.set(this.pos.x + Math.sin(yaw) * AA_GUN.seatBack, this.pos.y + AA_GUN.seatY, this.pos.z + Math.cos(yaw) * AA_GUN.seatBack);
  }

  inArc() {
    return true;
  }

  setAim(relYaw, pitch) {
    this.model.turret.rotation.y = relYaw;
    this.model.guns.rotation.x = pitch;
    this.model.turret.updateMatrixWorld(true);
  }

  // İki namlu sırayla ateş eder
  muzzleWorld(out) {
    this.barrel ^= 1;
    this.model.guns.updateMatrixWorld(true);
    return this.model.guns.localToWorld(out.set(this.barrel ? AA_GUN.barrelX : -AA_GUN.barrelX, 0, -AA_GUN.barrelLen));
  }

  grips(outL, outR) {
    const t = this.model.turret;
    t.updateMatrixWorld(true);
    t.localToWorld(outL.set(-AA_GUN.gripX, AA_GUN.gripY, AA_GUN.gripZ));
    t.localToWorld(outR.set(AA_GUN.gripX, AA_GUN.gripY, AA_GUN.gripZ));
  }

  plant() {
    const g = this.game;
    this.planted = true;
    this.fuse = C4.fuse;
    const c = buildC4();
    c.root.position.set(this.pos.x + 1.1, 0.55, this.pos.z + 0.6);
    c.root.rotation.y = rand(0, 3);
    g.scene.add(c.root);
    this.c4 = c;
    g.events.emit('message', 'C4 YERLEŞTİRİLDİ — UZAKLAŞ!', 'warn');
    g.audio.beep(2200, 0.08, 0.3, this.pos);
  }
  update(dt) {
    const g = this.game;
    if (this.destroyed) return;
    // Göğe doğru uçaksavar ateşi: uzaktan hedefi belli eder. Nişancı oyuncuyla çatışmadaysa top ona döner
    // (enemy.js → actMounted); nişancı öldüyse ya da topu bıraktıysa top susar
    const dist = this.pos.distanceTo(g.player.pos);
    const n = this.gunner;
    const crewed = !n || (n.alive && n.mount === this);
    if (!this.planted && dist < AA_GUN.skyFireRange && this.kind === 'aa' && crewed && !this.engaged) {
      const m = this.model;
      m.turret.rotation.y = Math.sin(g.time * 0.2 + this.pos.x) * 0.8;
      m.guns.rotation.x = damp(m.guns.rotation.x, AA_GUN.idlePitch, 1.5, dt);
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = rand(3, 7);
        this.burst = 5;
        this.burstT = 0;
      }
      if (this.burst > 0) {
        this.burstT -= dt;
        if (this.burstT <= 0) {
          this.burstT = 0.13;
          this.burst--;
          const start = this.muzzleWorld(_v);
          const dir = _d.set(0, 0, -1).transformDirection(m.guns.matrixWorld);
          _e.copy(start).addScaledVector(dir, 260);
          _e.x += rand(-8, 8);
          _e.y += rand(-4, 4);
          _e.z += rand(-8, 8);
          g.effects.tracer(start, _e, 350, 0.07);
          g.effects.enemyMuzzle(start, dir);
          g.audio.gunshot('enemyLmg', start);
        }
      }
    } else if (!crewed && this.kind === 'aa') {
      // Başında kimse yok: namlu yavaşça iner
      const r = this.model.guns.rotation;
      r.x = damp(r.x, AA_GUN.idleDrop, 1, dt);
    }
    if (this.planted) {
      this.fuse -= dt;
      this.beepT -= dt;
      if (this.beepT <= 0) {
        this.beepT = clamp(this.fuse / C4.fuse, 0.08, 1) * 0.7;
        g.audio.beep(2400, 0.05, 0.25, this.pos);
        if (this.c4) this.c4.light.visible = true;
      } else if (this.c4 && this.beepT < 0.05) this.c4.light.visible = false;
      if (this.fuse <= 0) this.detonate();
    }
  }
  detonate() {
    const g = this.game;
    // Patlamadan önce işaretle: patlama onExplosion ile bu topu yeniden patlatmaya çalışmasın
    this.destroyed = true;
    this.planted = false;
    if (this.gunner?.alive && this.gunner.mount === this) this.gunner.dismount();
    if (this.c4) this.c4.root.removeFromParent();
    g.explode(this.pos.clone().setY(1.2), C4.radius, C4.damage, 'player', 1.8);
    this.wreck(true);
    g.mission.onTargetDestroyed(this.id);
  }
  // Kararmış enkaz. fire=false: önceki seviyede imha edilmiş top (yalnızca ince duman tüter)
  wreck(fire) {
    const g = this.game;
    this.destroyed = true;
    const burnt = mat(0x1f1c1a, 0.95, 0.2);
    this.model.root.traverse((o) => {
      if (o.isMesh) o.material = burnt;
    });
    this.model.guns.rotation.x = -0.15;
    this.model.turret.rotation.z = 0.12;
    const p = this.pos.clone();
    g.effects.addEmitter({
      rate: fire ? 22 : 3,
      life: 90,
      spawn: (fx) => {
        const c = fx._c.setRGB(1, rand(0.35, 0.6), 0.1);
        fx.add.spawn(p.x + rand(-0.8, 0.8), 1.2 + rand(0, 0.5), p.z + rand(-0.8, 0.8), rand(-0.3, 0.3), rand(1.5, 3), rand(-0.3, 0.3), rand(0.4, 0.8), 0.9, 0.3, c, 0.9, -1, 0.5);
        if (Math.random() < 0.5) {
          const gg = rand(0.08, 0.18);
          fx.smoke.spawn(p.x + rand(-0.5, 0.5), 2, p.z + rand(-0.5, 0.5), rand(0.2, 0.8), rand(2, 3.5), rand(-0.3, 0.3), rand(4, 7), 1, 5, fx._c.setRGB(gg, gg, gg), 0.6, -0.1, 0.1);
        }
      },
    });
  }
}

export class Mission {
  constructor(game, mode, level = LEVELS[LEVELS.length - 1]) {
    this.game = game;
    this.mode = mode; // 'mission' | 'range'
    this.level = level;
    this.endT = 0;
    this.interactables = [];
    this.pickups = [];
    this.objectives = [];
    this.objIdx = 0;
    this.radioQueue = [];
    this.radioT = 0;
    this.time = 0;
    this.heli = null;
    this.defendT = 0;
    this.wavesSpawned = 0;
    this.destroyed = new Set();
    this.intel = false;
    this.complete = false;
    this.takeoff = null; // helikopter kalkış sahnesi (board → finish)
    this.heliWaitSaid = false;
    this.checkpoint = null;
    this.markers = [];
  }

  build() {
    const g = this.game;
    const W = g.world;
    this.data = this.mode === 'range' ? buildRange(W) : buildMission(W, this.level.map);
    const D = this.data;
    // Ağır makineli mevzileri: seviyenin istediği kadarı, haritanın listesinden sırayla (kum torbaları dünyaya
    // birleştirilmeden önce eklenmeli)
    const nestDefs = this.mode === 'range' ? [] : (D.hmg || []).slice(0, this.level.enemies?.hmg || 0);
    for (const n of nestDefs) nestRing(W, n.pos.x, n.pos.z, n.yaw);
    // Tanklar: çarpıştırıcıları gezinme ağından önce eklenmeli (askerler etrafından dolansın)
    const tankDefs = this.mode === 'range' ? [] : (D.tanks || []).slice(0, this.level.enemies?.tanks || 0);
    this.tanks = tankDefs.map((t, i) => new Tank(g, t, i));
    W.finalize();
    g.buildNav();
    g.barrels = (D.barrels || []).map((p) => new Barrel(g, p));
    // İkmal sandıkları
    for (const p of D.ammoCrates || []) {
      const m = buildAmmoCrate();
      m.position.copy(p);
      g.scene.add(m);
      W.addCollider(p.x - 0.5, 0, p.z - 0.28, p.x + 0.5, 0.5, p.z + 0.28, 'wood');
      let cd = 0;
      this.interactables.push({
        id: 'ammo', pos: p.clone().setY(0.5), radius: 2.2, prompt: 'Mühimmat ikmali', time: 0,
        enabled: () => g.time > cd,
        action: () => {
          cd = g.time + 1;
          g.weapons.refill();
          g.audio.mech('pickup');
          g.events.emit('message', 'CEPHANE YENİLENDİ', 'info');
        },
      });
    }
    if (this.mode === 'range') {
      this.buildRangeMode();
      return;
    }
    // Hazır helikopter modeli sahnenin altında bekler: gölgelendiricileri açılışta derlenir, geldiğinde takılma olmaz
    this.heliSpare = null;
    if (hasHelicopterProp()) {
      this.heliSpare = buildHelicopter();
      this.heliSpare.root.position.set(0, HELI_PARK_Y, 0);
      g.scene.add(this.heliSpare.root);
    }
    // Uçaksavarlar / pompalar
    this.aa = (D.aaGuns || []).map((def) => new AAGun(g, def));
    for (const gun of this.aa) {
      this.interactables.push({
        id: gun.id, pos: gun.pos.clone().setY(1), radius: 2.9, prompt: 'C4 yerleştir', time: C4.plantTime,
        enabled: () => !gun.destroyed && !gun.planted && this.current?.id === 'aa',
        action: () => gun.plant(),
      });
    }
    // Tanka C4: gövdenin oyuncuya en yakın noktasından, hedeften bağımsız
    for (const t of this.tanks) {
      this.interactables.push({
        id: t.id, pos: t.c4Spot, radius: TANK.c4Radius, prompt: 'Tanka C4 yerleştir', time: C4.plantTime,
        enabled: () => !t.destroyed && !t.planted,
        action: () => t.plant(),
      });
    }
    // İstihbarat dizüstü (haritada istihbarat hedefi varsa)
    if (D.laptop) {
      const lap = buildLaptop();
      lap.root.position.copy(D.laptop.pos);
      lap.root.rotation.y = D.laptop.yaw;
      g.scene.add(lap.root);
      this.laptop = lap;
      this.interactables.push({
        id: 'intel', pos: D.laptop.pos.clone(), radius: 2.0, prompt: 'İstihbaratı indir', time: 2.6,
        enabled: () => !this.intel && this.current?.id === 'intel',
        action: () => this.onIntel(),
      });
    }
    // Sürekli yanan ateşler (rafineri bacası, yanan araçlar): yalnızca parçacık, ışık eklemez
    for (const f of D.fires || []) g.effects.addEmitter(fireEmitter(f.pos, f.size || 1));
    // Haritaya dağıtılmış silahlar
    this.pickups3 = (D.weaponPickups || []).map((p) => new WeaponPickup(this, p.id, p.pos, p.rotY));
    // Seviye: hangi düşman grupları, hangi hedefler, nereden başlanır
    const L = this.level;
    const E = L.enemies;
    // Bu seviyeden önceki bölümlerde yapılmış işler (toplar imha edilmiş, istihbarat alınmış)
    const first = OBJECTIVE_ORDER.indexOf(L.objectives[0]);
    if (first > OBJECTIVE_ORDER.indexOf('aa')) {
      for (const gun of this.aa) {
        gun.wreck(false);
        this.destroyed.add(gun.id);
      }
    }
    if (first > OBJECTIVE_ORDER.indexOf('intel') && this.laptop) {
      this.intel = true;
      this.laptop.screen.material.emissive.setHex(0xd63d3d);
    }
    // Uçaksavar nişancıları: topun grubu seviyede varsa (Seviye 1'de köy grubu yok, toplar yalnız göğe ateş eder)
    for (const gun of this.aa) if (E.groups.includes(gun.def.group || 'village')) gun.man();
    D.enemies.forEach((spec, i) => {
      if (!E.groups.includes(spec.group) || E.exclude.includes(spec.type)) return;
      const s = { ...spec, id: `m${i}` };
      if (s.hardType && (E.hardTypes || g.difficultyKey === 'hard')) s.type = s.hardType;
      g.enemies.spawn(s);
    });
    this.nests = nestDefs.map((n, i) => new HeavyNest(g, n, i));
    // Nişancılı düzenekler (mevziler + başında nişancı olan uçaksavarlar): manga bunları bastırır
    this.mounts = [...this.nests, ...this.aa.filter((a) => a.gunner)];
    this.waves = E.extraWave && D.extraWave ? [...D.waves, D.extraWave] : D.waves;
    this.defendTime = L.defendTime || D.defendTime;
    // Hedefler
    const defs = this.objectiveDefs();
    this.objectives = L.objectives.map((id) => defs[id]);
    this.objIdx = 0;
    const cp = D.checkpoints[L.start] || D.checkpoints[0];
    g.player.reset(cp.pos, cp.yaw);
    g.allies.spawnSquad(L.allies, cp.pos, cp.yaw, L.allyTier || 1);
    this.saveCheckpoint(L.start, true);
    // Açılış telsizi
    this.radio('YUVA', `Kartal ekibi, burası Yuva. ${L.radioIntro}`, 1.5);
    this.current.start?.(true);
    if (L.id === 1) this.radio('İPUCU', 'Mavi askerler senin mangan: seni izler, ateş açınca karşılık verir. Onlara ateş etme.', 12);
    g.events.emit('objective', this.currentText());
  }

  // Hedef tablosu: seviyeler buradan sıra seçer. cp: hedef başlarken kaydedilen kontrol noktası,
  // start(first): hedef başlarken çalışan telsiz ve ayarlar, skip: hata ayıklamada hedef atlanınca yapılacaklar.
  // Metinler, işaretçiler ve telsiz haritanın verisinden (D.obj) gelir: yeni harita yeni kod gerektirmez
  objectiveDefs() {
    const D = this.data;
    const O = D.obj || {};
    // Hedefin açılış telsizi: ilk hedefse brifingden sonra, değilse önceki hedefin "tamam" cümlesiyle hemen
    const say = (id, first) => {
      const lines = O[id]?.radio || [];
      const prev = this.objectives[this.objIdx - 1];
      const done = !first && prev ? O[prev.id]?.doneLine || '' : '';
      lines.forEach((t, i) => this.radio('YUVA', i === 0 ? `${done}${t}` : t, first ? 5.5 + i * 6.5 : 1.2 + i * 6));
    };
    const outpost = O.outpost || {};
    const extractCp = () => this.extractInfo().cp ?? null;
    return {
      outpost: {
        id: 'outpost', text: outpost.text || 'Bölgeyi temizle', group: outpost.group || 'outpost', cp: 0,
        marker: () => outpost.marker?.clone() || null,
        start: (first) => say('outpost', first),
        skip: () => this.killGroup(outpost.group || 'outpost'),
      },
      aa: {
        id: 'aa', text: O.aa?.text || 'Hedefleri C4 ile imha et', cp: 1,
        marker: () => this.aa.filter((a) => !a.destroyed).map((a) => a.pos.clone().setY(2.5)),
        start: (first) => say('aa', first),
        skip: () => {
          for (const a of this.aa) {
            if (a.destroyed) continue;
            a.destroyed = true;
            this.destroyed.add(a.id);
          }
        },
      },
      intel: {
        id: 'intel', text: O.intel?.text || 'İstihbaratı al', cp: 3,
        marker: () => D.laptop.pos.clone().setY(1.2),
        start: (first) => say('intel', first),
        skip: () => {
          this.intel = true;
        },
      },
      lz: { id: 'lz', text: O.lz?.text || 'İniş bölgesine ulaş', cp: 4, marker: () => D.lz.clone().setY(1), start: (first) => say('lz', first) },
      defend: {
        id: 'defend', text: 'Helikopter gelene kadar iniş bölgesini savun', cp: 5,
        marker: () => D.lz.clone().setY(1),
        start: (first) => {
          this.defendT = 0;
          this.wavesSpawned = 0;
          const line = O.defend?.radio?.[0] || 'Helikopter yolda. Bölgeyi tut!';
          this.radio('YUVA', line, first ? 5.5 : 0.5);
        },
      },
      board: {
        id: 'board', text: 'Helikoptere bin', cp: null,
        marker: () => (this.heli ? this.heli.root.position.clone().setY(1.5) : D.lz.clone()),
      },
      // Savunmasız tahliye: son hedeften sonra helikopter haritanın o bölgedeki açık noktasına iner
      extract: {
        id: 'extract', text: O.extract?.text || 'Tahliye noktasına git, helikoptere bin',
        // Kontrol noktası tahliye başlarken kaydedilir (ölünce etkisiz düşmanlar geri gelmesin); yeri haritadan
        get cp() {
          return extractCp();
        },
        marker: () => (this.heli?.landed ? this.heli.root.position.clone().setY(1.5) : this.extractPoint().clone().setY(1)),
        start: (first) => {
          this.spawnHeli(this.extractPoint());
          const prev = this.objectives[this.objIdx - 1];
          const done = !first && prev ? O[prev.id]?.doneLine || '' : '';
          const lines = this.extractInfo().radio || ['Şahin-2 tahliye için yolda. İşaretli noktaya git, helikoptere bin.'];
          lines.forEach((t, i) => this.radio('YUVA', i === 0 ? `${done}${t}` : t, first ? 5.5 + i * 6.5 : 1.2 + i * 6));
        },
      },
    };
  }

  // Tahliye noktası ve telsizi: haritanın verdiği, bir önceki hedefe göre (yoksa iniş bölgesi)
  extractInfo() {
    const X = this.data.extract || {};
    const prev = this.objectives[this.objIdx - 1]?.id;
    return X[prev] || X.default || { pos: this.data.lz };
  }
  extractPoint() {
    return this.extractInfo().pos;
  }

  killGroup(group) {
    for (const e of this.game.enemies.list) {
      if (e.alive && e.group === group) e.takeDamage(999, { zone: 'torso', dir: new THREE.Vector3(0, 0, 1), source: 'cheat' });
    }
  }

  // Hata ayıklama: n. hedefe atla (önceki hedeflerin sonuçlarını uygula)
  skipTo(n) {
    const g = this.game;
    const idx = clamp(n - 1, 0, this.objectives.length - 1);
    for (let i = 0; i < idx; i++) this.objectives[i].skip?.();
    this.objIdx = idx;
    const o = this.current;
    const cp = this.data.checkpoints[idx === 0 ? this.level.start : o.cp ?? this.level.start] || this.data.checkpoints[0];
    g.player.reset(cp.pos, cp.yaw);
    g.allies.regroup(cp.pos, cp.yaw);
    if (o.id === 'defend') this.defendT = 0;
    g.events.emit('objective', this.currentText());
  }

  buildRangeMode() {
    const g = this.game;
    const D = this.data;
    D.dummies.forEach((d, i) => g.enemies.spawn({ ...d, id: `d${i}`, type: 'dummy', dummy: true }));
    g.player.reset(D.playerStart.pos, D.playerStart.yaw);
    this.objectives = [{ id: 'range', text: 'Atış poligonu — hedefler 10 / 25 / 50 / 100 m', marker: () => null }];
    this.objIdx = 0;
    g.events.emit('objective', this.currentText());
    this.radio('POLİGON', 'Dokuz silahın hepsi hazır: 1–9 tuşlarıyla değiştir. B ile atış modunu, dürbünde Shift ile nefesini tut.', 1);
    this.radio('POLİGON', 'Turuncu mankenler hasar sayısını gösterir ve 3 saniyede yeniden kalkar.', 6);
  }

  get current() {
    return this.objectives[this.objIdx];
  }

  currentText() {
    const o = this.current;
    if (!o) return { title: '', detail: '' };
    const g = this.game;
    let detail = '';
    if (o.id === 'outpost') detail = `Kalan düşman: ${g.enemies.aliveInGroup(o.group)}`;
    else if (o.id === 'aa') detail = `${this.destroyed.size}/${this.aa.length} imha edildi`;
    else if (o.id === 'defend') detail = `Helikopter: ${Math.max(0, Math.ceil(this.defendTime - this.defendT))} sn`;
    else if (o.id === 'extract') detail = this.heli?.landed ? 'Helikopter bekliyor' : 'Helikopter yolda';
    else if (o.id === 'lz' || o.id === 'board' || o.id === 'intel') detail = '';
    return { title: o.text, detail, index: this.objIdx + 1, total: this.objectives.length };
  }

  // kind: HUD'da konuşanın rengi ('ally' mavi, 'enemy' kırmızı); verilmezse komuta sesi
  radio(who, text, delay = 0, kind = null) {
    // Dostların anlık seslenmeleri kuyrukta bayatlamasın: sırada bekleyen varsa atla
    if (kind === 'ally' && this.radioQueue.length > 1) return;
    this.radioQueue.push({ who, text, at: this.time + delay, kind });
  }

  saveCheckpoint(idx, silent = false) {
    const g = this.game;
    this.checkpoint = {
      idx,
      time: this.time,
      objIdx: this.objIdx,
      dead: new Set(g.enemies.list.filter((e) => !e.alive).map((e) => e.id)),
      destroyed: new Set(this.destroyed),
      wrecked: new Set((this.nests || []).filter((n) => n.wrecked).map((n) => n.id)),
      tankHp: new Map((this.tanks || []).map((t) => [t.id, t.hp])),
      intel: this.intel,
      loadout: g.weapons.owned && Object.keys(g.weapons.owned).length ? g.weapons.snapshot() : null,
      spawnedIds: new Set(g.enemies.list.map((e) => e.id)),
    };
    if (!silent) {
      g.events.emit('message', 'KONTROL NOKTASI', 'checkpoint');
    }
  }

  // Ölümden sonra son kontrol noktasına dön
  restoreCheckpoint() {
    const g = this.game;
    const C = this.checkpoint;
    // Mevziler: kontrol noktasından sonra susturulanlar yeniden çalışır (nişancı reset'te başına geçer)
    for (const n of this.nests || []) n.restore(C.wrecked.has(n.id));
    // Tanklar: imha edilen enkaz kalır; sağ olan kontrol noktasındaki canıyla, oyuncuyu henüz görmemiş başlar
    for (const t of this.tanks || []) {
      if (!t.destroyed) t.hp = C.tankHp.get(t.id) ?? t.hp;
      t.reset(false);
    }
    // Kontrol noktasından sonra doğan düşmanları kaldır
    const keep = [];
    for (const e of g.enemies.list) {
      if (!C.spawnedIds.has(e.id)) {
        e.model.dispose();
        if (e.laser) e.laser.removeFromParent();
        if (e.glint) e.glint.removeFromParent();
        continue;
      }
      if (C.dead.has(e.id)) {
        e.model.hide();
      } else e.reset();
      keep.push(e);
    }
    g.enemies.list = keep;
    // Silah noktaları: kontrol noktasından sonra alınanlar geri gelir, sonradan bırakılanlar kalkar
    if (this.pickups3) {
      const kept = [];
      for (const p of this.pickups3) {
        if (p.spawnedAt > C.time) {
          if (!p.taken) p.remove();
          continue;
        }
        if (p.taken && p.takenAt > C.time) p.restore();
        kept.push(p);
      }
      this.pickups3 = kept;
    }
    this.objIdx = C.objIdx;
    this.intel = C.intel;
    this.defendT = 0;
    this.wavesSpawned = 0;
    this.reinforced = this.intel;
    if (this.heli) {
      this.heli.root.removeFromParent();
      g.audio.stopRotor();
      this.heli = null;
    }
    if (this.heliDust) {
      g.effects.removeEmitter(this.heliDust);
      this.heliDust = null;
    }
    const cp = this.data.checkpoints[C.idx] || this.data.checkpoints[0];
    g.player.reset(cp.pos, cp.yaw);
    g.allies.regroup(cp.pos, cp.yaw);
    this.endT = 0;
    const lo = C.loadout || this.defaultLoadout();
    // Yeniden doğuşta en az başlangıç cephanesi
    for (const [id, a] of Object.entries(lo.weapons)) {
      if (!a) continue;
      a.reserve = Math.max(a.reserve, WEAPONS[id].reserveStart);
      a.mag = Math.max(a.mag, 0);
    }
    lo.grenades = Math.max(lo.grenades, 2);
    g.weapons.reset(lo);
    g.grenades.clear();
    this.radioQueue.length = 0;
    g.events.emit('objective', this.currentText());
  }

  defaultLoadout() {
    if (this.mode === 'range') {
      const weapons = {};
      for (const id of WEAPON_ORDER) weapons[id] = null;
      return { weapons, slots: [...WEAPON_ORDER], grenades: 4, current: 'rifle' };
    }
    const L = this.game.loadout;
    return { weapons: { [L.primary]: null, [L.secondary]: null }, slots: [L.primary, L.secondary], grenades: 3, current: L.primary };
  }

  pickupPrompt(p) {
    const g = this.game;
    const d = p.data;
    const name = weaponName(p.id);
    if (g.weapons.owned[p.id]) return `${name} · cephane al`;
    const same = g.weapons.slots.find((s) => WEAPONS[s].category === d.category);
    return same && this.mode === 'mission' ? `${name} al (${weaponName(same)} bırakılır)` : `${name} al`;
  }

  takePickup(p) {
    const g = this.game;
    const res = g.weapons.pickUp(p.id, p.ammo);
    p.remove();
    g.audio.mech('pickup');
    const name = weaponName(p.id);
    g.events.emit('message', res.refilled ? `${name} · CEPHANE` : `${name.toLocaleUpperCase('tr-TR')} ALINDI`, 'info');
    if (res.dropped) {
      // Bırakılan silah oyuncunun önüne düşer, geri alınabilir
      const P = g.player;
      const fwd = new THREE.Vector3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
      const at = P.pos.clone().addScaledVector(fwd, 0.9);
      at.y = P.pos.y;
      this.pickups3.push(new WeaponPickup(this, res.dropped.id, at, P.yaw + 1.2, { mag: res.dropped.mag, reserve: res.dropped.reserve }));
    }
  }

  // Roket ya da el bombası uçaksavarın dibinde patlarsa top da imha olur; mevzinin yanında patlarsa makineli susar
  onExplosion(pos, radius, damage, owner) {
    for (const t of this.tanks || []) t.onExplosion(pos, radius, damage, owner);
    if (this.nests && owner !== 'enemy' && damage >= HMG.silenceDamage) {
      for (const n of this.nests) {
        if (!n.wrecked && n.pivot(_v).distanceTo(pos) < HMG.silenceRadius) n.silence();
      }
    }
    if (!this.aa || owner !== 'player' || damage < 200 || this.current?.id !== 'aa') return;
    for (const gun of this.aa) {
      if (!gun.destroyed && !gun.planted && gun.pos.distanceTo(pos) < 3.6) gun.detonate();
    }
  }

  advance() {
    const g = this.game;
    g.events.emit(EV.OBJECTIVE_COMPLETED, { objectiveId: this.current?.id });
    this.objIdx++;
    g.addScore(SCORE.objective, 'HEDEF TAMAMLANDI');
    g.audio.radio();
    const o = this.current;
    if (!o) {
      // Seviyenin son hedefi bitti: kısa bir telsiz, sonra zafer ekranı
      this.radio('YUVA', this.level.outro, 0.3);
      this.endT = LEVEL_END_DELAY;
      return;
    }
    g.events.emit('objective', this.currentText());
    g.events.emit('objectiveNew', this.currentText());
    if (o.cp != null) this.saveCheckpoint(o.cp);
    o.start?.(false);
  }

  onTargetDestroyed(id) {
    const g = this.game;
    this.destroyed.add(id);
    g.addScore(SCORE.objective, 'HEDEF İMHA EDİLDİ');
    g.events.emit('objective', this.currentText());
    if (this.destroyed.size >= this.aa.length && this.current?.id === 'aa') {
      this.advance();
    } else {
      const left = this.aa.length - this.destroyed.size;
      this.radio('YUVA', this.data.obj?.aa?.one || `Güzel iş, biri gitti. Kalan: ${left}.`, 1);
      this.saveCheckpoint(2);
    }
  }

  onIntel() {
    const g = this.game;
    this.intel = true;
    this.laptop.screen.material.emissive.setHex(0xd63d3d);
    g.audio.siren(9);
    g.events.emit('message', 'İSTİHBARAT ALINDI', 'info');
    this.radio('YUVA', this.data.obj?.intel?.got || 'Dosyalar elimizde! Alarm çaldı, iniş bölgesine ilerle.', 0.8);
    if (this.level.enemies.reinforcements) this.spawnReinforcements();
    this.advance();
  }

  spawnReinforcements() {
    const g = this.game;
    this.reinforced = true;
    this.data.reinforcements.forEach((u, i) => {
      g.enemies.spawn({ ...u, id: `r${i}`, group: 'reinf', rush: true, rushTarget: g.player.pos.clone() });
    });
  }

  spawnWave(i) {
    const g = this.game;
    const w = this.waves[i];
    w.units.forEach((u, k) => {
      const e = g.enemies.spawn({ ...u, id: `w${i}_${k}`, group: 'wave', rush: true, rushTarget: this.data.lz.clone() });
      e.lastKnown.copy(g.player.pos);
    });
    const calls = this.data.waveCalls || ['Yeni bir grup geliyor!'];
    this.radio('YUVA', calls[i] || calls[calls.length - 1], 0.2);
  }

  findInteractable(eye, fwd) {
    let best = null;
    let bestD = Infinity;
    for (const it of this.interactables) {
      if (!it.enabled()) continue;
      const d = it.pos.distanceTo(eye);
      if (d > it.radius + 0.8) continue;
      _v.subVectors(it.pos, eye).normalize();
      const facing = _v.dot(fwd);
      if (facing < 0.35 && d > 1.2) continue;
      if (d < bestD) {
        best = it;
        bestD = d;
      }
    }
    return best;
  }

  spawnPouch(pos) {
    const g = this.game;
    const m = buildPouch();
    m.position.set(pos.x, 0.02, pos.z);
    m.rotation.y = rand(0, 6);
    g.scene.add(m);
    this.pickups.push({ mesh: m, pos: m.position, life: 90 });
  }

  update(dt) {
    const g = this.game;
    this.time += dt;
    // Telsiz sırası
    if (this.radioQueue.length && this.radioQueue[0].at <= this.time && this.radioT <= 0) {
      const r = this.radioQueue.shift();
      g.events.emit('radio', `${r.who}: ${r.text}`, r.kind || r.who);
      g.audio.radio();
      this.radioT = 2.5;
    }
    this.radioT -= dt;
    for (const b of g.barrels) b.update(dt);
    if (this.pickups3) for (const p of this.pickups3) p.update(this.time);
    if (this.aa) for (const a of this.aa) a.update(dt);
    if (this.nests) for (const n of this.nests) n.update(dt);
    if (this.tanks) for (const t of this.tanks) t.update(dt);
    // Yerden toplama
    const P = g.player;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.life -= dt;
      p.mesh.rotation.y += dt;
      if (p.life <= 0) {
        p.mesh.removeFromParent();
        this.pickups.splice(i, 1);
        continue;
      }
      if (P.alive && p.pos.distanceTo(P.pos) < 1.3) {
        const gotAmmo = g.weapons.addAmmo(0.18);
        const gotNade = Math.random() < 0.3 && g.weapons.addGrenade(1);
        if (gotAmmo || gotNade) {
          p.mesh.removeFromParent();
          this.pickups.splice(i, 1);
          g.audio.mech('pickup');
          g.events.emit('pickup', gotNade ? '+ CEPHANE  + EL BOMBASI' : '+ CEPHANE');
        }
      }
    }
    if (this.takeoff) {
      this.updateTakeoff(dt);
      return;
    }
    if (this.mode === 'range' || this.complete) {
      this.updateHeli(dt);
      return;
    }
    if (this.endT > 0) {
      this.endT -= dt;
      if (this.endT <= 0) this.finish();
    }
    const o = this.current;
    if (!o) return;
    switch (o.id) {
      case 'outpost': {
        const left = g.enemies.aliveInGroup(o.group);
        if (left !== this.lastLeft) {
          this.lastLeft = left;
          g.events.emit('objective', this.currentText());
        }
        if (left === 0) this.advance();
        break;
      }
      case 'lz':
        if (P.pos.distanceTo(this.data.lz) < 11) {
          if (this.objectives[this.objIdx + 1]) this.radio('YUVA', `İniş bölgesindesin. Helikopter ${this.defendTime} saniye uzakta!`, 0);
          this.advance();
        }
        break;
      case 'defend': {
        this.defendT += dt;
        const waves = this.waves;
        while (this.wavesSpawned < waves.length && this.defendT >= waves[this.wavesSpawned].t) {
          this.spawnWave(this.wavesSpawned);
          this.wavesSpawned++;
        }
        const secs = Math.ceil(this.defendTime - this.defendT);
        if (secs !== this.lastSecs) {
          this.lastSecs = secs;
          g.events.emit('objective', this.currentText());
        }
        if (!this.heli && this.defendT > this.defendTime - 22) this.spawnHeli();
        if (this.defendT >= this.defendTime && this.heli && this.heli.landed) {
          this.radio('PİLOT', 'Yere indik Kartal-1, hemen bin!', 0);
          this.advance();
        }
        break;
      }
      case 'board':
      case 'extract':
        // Kontrol noktasına dönüş helikopteri kaldırır: tahliyede yeniden çağrılır
        if (o.id === 'extract' && !this.heli) this.spawnHeli(this.extractPoint());
        if (this.heli?.landed && P.pos.distanceTo(this.heli.root.position) < EXTRACT.boardRadius) this.board();
        else if (o.id === 'extract' && this.heli?.landed && !this.heliWaitSaid) {
          this.heliWaitSaid = true;
          g.events.emit('objective', this.currentText());
          this.radio('PİLOT', 'Yere indik Kartal-1, hemen bin!', 0);
        }
        break;
      default:
        break;
    }
    this.updateHeli(dt);
  }

  spawnHeli(at = this.data.lz) {
    const g = this.game;
    if (this.heli) return;
    const h = this.heliSpare || buildHelicopter();
    this.heliSpare = null;
    if (!h.root.parent) g.scene.add(h.root);
    // Helikopter haritanın verdiği yönden gelir (varsayılan: güneyden, haritanın üstünden)
    const lz = at;
    const from = this.data.heliFrom || new THREE.Vector3(lz.x, 0, 160);
    const yaw = dirToYaw(lz.x - from.x, lz.z - from.z);
    this.heli = { ...h, t: 0, landed: false, from: from.clone(), yaw, lz: lz.clone() };
    h.root.position.set(from.x, 45, from.z);
    h.root.rotation.y = yaw;
    g.audio.startRotor();
    this.radio('PİLOT', 'Kartal-1, burası Şahin-2. İniş bölgesini görüyorum, alçalıyorum!', 0);
    const dust = g.env?.dust ?? 0xcbb08a;
    this.heliDust = g.effects.addEmitter({
      rate: 0,
      spawn: (fx) => {
        const a = Math.random() * Math.PI * 2;
        const r = rand(2, 6);
        fx.smoke.spawn(lz.x + Math.cos(a) * r, 0.3, lz.z + Math.sin(a) * r, Math.cos(a) * rand(6, 12), rand(0.3, 1.5), Math.sin(a) * rand(6, 12), rand(1.2, 2.2), 1.5, 5, fx._c.setHex(dust), 0.5, 0, 1.5);
      },
    });
  }

  updateHeli(dt) {
    const H = this.heli;
    if (!H) return;
    const g = this.game;
    H.t += dt;
    const lz = H.lz;
    // Geliş yönünden iniş bölgesine süzülerek alçal (pistin 3 m gerisine konar)
    const dur = EXTRACT.approach;
    const k = clamp(H.t / dur, 0, 1);
    const e = Math.min(1, smoothstep(k) * 1.15);
    const dx = lz.x - H.from.x;
    const dz = lz.z - H.from.z;
    const len = Math.hypot(dx, dz) || 1;
    const endX = lz.x - (dx / len) * 3;
    const endZ = lz.z - (dz / len) * 3;
    const y = k < 0.7 ? lerp(45, 14, smoothstep(k / 0.7)) : lerp(14, 0.05, smoothstep((k - 0.7) / 0.3));
    const sway = Math.sin(H.t * 0.6) * (1 - k) * 4;
    H.root.position.set(lerp(H.from.x, endX, e) + (dz / len) * sway, y, lerp(H.from.z, endZ, e) - (dx / len) * sway);
    H.root.rotation.x = k < 0.85 ? 0.12 * (1 - k) : 0;
    H.root.rotation.z = Math.sin(H.t * 0.8) * 0.04 * (1 - k);
    H.rotor.rotation.y += dt * 28;
    H.tail.rotation[H.tailAxis || 'x'] += dt * 40;
    if (k >= 1) H.landed = true;
    if (this.heliDust) this.heliDust.rate = y < 12 ? 40 * (1 - y / 12) : 0;
    g.audio.updateRotor(H.root.position);
  }

  // Oyuncu bindi: hedefler biter, manga içeride, kalkış sahnesi başlar (bitince bölüm kartı)
  board() {
    const g = this.game;
    if (this.takeoff || this.complete) return;
    const H = this.heli;
    // Kamera savaş alanını görsün: haritanın ortasına bakan kapı (sağ +1, sol -1)
    const B = g.world.bounds;
    const cx = (B.minx + B.maxx) / 2 - H.root.position.x;
    const cz = (B.minz + B.maxz) / 2 - H.root.position.z;
    const side = Math.cos(H.yaw) * cx - Math.sin(H.yaw) * cz >= 0 ? 1 : -1;
    this.takeoff = { t: 0, base: H.root.position.clone(), fx: -Math.sin(H.yaw), fz: -Math.cos(H.yaw), side };
    this.objIdx = this.objectives.length;
    g.addScore(SCORE.objective, 'TAHLİYE');
    g.audio.radio();
    g.player.invulnerable = true;
    for (const a of g.allies.list) a.model.root.visible = false;
    g.hud.show(false);
    g.input.enableTouch(false);
    this.radioQueue.length = 0;
    this.radio('PİLOT', 'Herkes içeride, kalkıyoruz!', 0);
    this.radio('YUVA', this.level.outro, 2.4);
    g.events.emit('boarded');
  }

  // Kalkış: dikine yüksel, burnu eğip hızlan; rotor tozu yükseldikçe azalır
  updateTakeoff(dt) {
    const g = this.game;
    const T = this.takeoff;
    const H = this.heli;
    T.t += dt;
    const k = T.t;
    const up = smoothstep(clamp(k / 3.5, 0, 1)) * EXTRACT.climb + Math.min(k, 0.6) * 0.8;
    const f = Math.max(0, k - 1.3);
    const dist = (EXTRACT.speed * f * f) / (f + EXTRACT.accelTime);
    H.root.position.set(T.base.x + T.fx * dist, T.base.y + up, T.base.z + T.fz * dist);
    H.root.rotation.x = -0.14 * smoothstep(clamp((k - 1.1) / 1.8, 0, 1));
    H.root.rotation.z = Math.sin(k * 0.9) * 0.03;
    H.rotor.rotation.y += dt * 30;
    H.tail.rotation[H.tailAxis || 'x'] += dt * 42;
    if (this.heliDust) this.heliDust.rate = up < 10 ? 40 * (1 - up / 10) : 0;
    g.audio.updateRotor(H.root.position);
    if (T.t >= EXTRACT.takeoff) this.finish();
  }

  // Kalkış kamerası: kabinin içinden, sağ kapıdan aşağıdaki savaş alanına
  takeoffCamera(cam) {
    const H = this.heli;
    H.root.updateMatrixWorld(true);
    const S = EXTRACT.seat;
    const L = EXTRACT.look;
    const side = this.takeoff.side;
    // Hazır modelde yer gövdeden ölçülür (kapının hemen dışı), prosedürel modelde ayar tablosundan
    if (H.seat) H.root.localToWorld(cam.position.set(H.seat.x * side, H.seat.y, H.seat.z));
    else H.root.localToWorld(cam.position.set(S[0] * side, S[1], S[2]));
    _cam.set(L[0] * side, L[1], L[2]).normalize().transformDirection(H.root.matrixWorld).add(cam.position);
    cam.up.set(0, 1, 0);
    cam.lookAt(_cam);
  }

  finish() {
    if (this.complete) return;
    this.complete = true;
    this.game.onMissionComplete();
  }

  randomTip() {
    return pick(TIPS);
  }
}
