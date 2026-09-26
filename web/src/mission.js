// Oyun modu ve görev akışı (AShooterGameMode karşılığı): hedefler, kontrol noktaları,
// etkileşimli nesneler (C4, istihbarat, ikmal), patlayıcı variller, uçaksavarlar,
// savunma dalgaları, helikopterle tahliye ve atış poligonu modu.
import * as THREE from 'three';
import { buildMission, buildRange } from './level.js';
import { buildAAGun, buildBarrel, buildLaptop, buildAmmoCrate, buildPouch, buildC4, buildHelicopter, buildWeapon, mat } from './models.js';
import { C4, SCORE, WEAPONS, WEAPON_ORDER, LEVELS } from './config.js';
import { loadWeaponAsset, assetIdFor } from './assets.js';
import { rand, lerp, clamp, smoothstep, pick } from './util.js';

const _v = new THREE.Vector3();
// Operasyonun kronolojik hedef sırası: bir seviyenin ilk hedefinden öncekiler yapılmış sayılır
const OBJECTIVE_ORDER = ['outpost', 'aa', 'intel', 'lz', 'defend', 'board'];
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

class AAGun {
  constructor(game, def) {
    this.game = game;
    this.def = def;
    this.id = def.id;
    this.pos = def.pos.clone();
    const m = buildAAGun();
    this.model = m;
    m.root.position.copy(def.pos);
    m.root.rotation.y = def.yaw;
    game.scene.add(m.root);
    game.world.addCollider(def.pos.x - 1.5, 0, def.pos.z - 1.5, def.pos.x + 1.5, 1.9, def.pos.z + 1.5, 'metal');
    this.destroyed = false;
    this.planted = false;
    this.fuse = 0;
    this.fireT = rand(1, 4);
    this.beepT = 0;
    this.c4 = null;
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
    // Göğe doğru uçaksavar ateşi: uzaktan hedefi belli eder
    const dist = this.pos.distanceTo(g.player.pos);
    if (!this.planted && dist < 170) {
      this.model.turret.rotation.y = Math.sin(g.time * 0.2 + this.pos.x) * 0.8;
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
          const m = this.model;
          m.guns.updateMatrixWorld(true);
          const start = new THREE.Vector3(this.burst % 2 ? 0.35 : -0.35, 0, -3.4).applyMatrix4(m.guns.matrixWorld);
          const dir = new THREE.Vector3(0, 0, -1).transformDirection(m.guns.matrixWorld);
          const end = start.clone().addScaledVector(dir, 260).add(new THREE.Vector3(rand(-8, 8), rand(-4, 4), rand(-8, 8)));
          g.effects.tracer(start, end, 350, 0.07);
          g.effects.enemyMuzzle(start, dir);
          g.audio.gunshot('enemyLmg', start);
        }
      }
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
    this.checkpoint = null;
    this.markers = [];
  }

  build() {
    const g = this.game;
    const W = g.world;
    this.data = this.mode === 'range' ? buildRange(W) : buildMission(W);
    const D = this.data;
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
    // Uçaksavarlar
    this.aa = D.aaGuns.map((def) => new AAGun(g, def));
    for (const gun of this.aa) {
      this.interactables.push({
        id: gun.id, pos: gun.pos.clone().setY(1), radius: 2.9, prompt: 'C4 yerleştir', time: C4.plantTime,
        enabled: () => !gun.destroyed && !gun.planted && this.current?.id === 'aa',
        action: () => gun.plant(),
      });
    }
    // İstihbarat dizüstü
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
    if (first > OBJECTIVE_ORDER.indexOf('intel')) {
      this.intel = true;
      this.laptop.screen.material.emissive.setHex(0xd63d3d);
    }
    D.enemies.forEach((spec, i) => {
      if (!E.groups.includes(spec.group) || E.exclude.includes(spec.type)) return;
      const s = { ...spec, id: `m${i}` };
      if (s.hardType && (E.hardTypes || g.difficultyKey === 'hard')) s.type = s.hardType;
      g.enemies.spawn(s);
    });
    this.waves = E.extraWave ? [...D.waves, D.extraWave] : D.waves;
    this.defendTime = L.defendTime || D.defendTime;
    // Hedefler
    const defs = this.objectiveDefs();
    this.objectives = L.objectives.map((id) => defs[id]);
    this.objIdx = 0;
    const cp = D.checkpoints[L.start] || D.checkpoints[0];
    g.player.reset(cp.pos, cp.yaw);
    g.allies.spawnSquad(L.allies, cp.pos, cp.yaw);
    this.saveCheckpoint(L.start, true);
    // Açılış telsizi
    this.radio('YUVA', `Kartal ekibi, burası Yuva. ${L.radioIntro}`, 1.5);
    this.current.start?.(true);
    if (L.id === 1) this.radio('İPUCU', 'Mavi askerler senin mangan: seni izler, ateş açınca karşılık verir. Onlara ateş etme.', 12);
    g.events.emit('objective', this.currentText());
  }

  // Hedef tablosu: seviyeler buradan sıra seçer. cp: hedef başlarken kaydedilen kontrol noktası,
  // start(first): hedef başlarken çalışan telsiz ve ayarlar, skip: hata ayıklamada hedef atlanınca yapılacaklar
  objectiveDefs() {
    const g = this.game;
    const D = this.data;
    return {
      outpost: {
        id: 'outpost', text: 'Kontrol noktasını temizle', group: 'outpost', cp: 0,
        marker: () => new THREE.Vector3(0, 1.5, 66),
        start: () => this.radio('YUVA', 'İlk hedef kuzeydeki kontrol noktası. Temizle ve yolu aç.', 5.5),
        skip: () => this.killGroup('outpost'),
      },
      aa: {
        id: 'aa', text: 'Uçaksavar toplarını C4 ile imha et', cp: 1,
        marker: () => this.aa.filter((a) => !a.destroyed).map((a) => a.pos.clone().setY(2.5)),
        start: (first) => {
          this.radio('YUVA', `${first ? '' : 'Kontrol noktası temiz. '}Köydeki iki uçaksavar topu hava desteğimizi engelliyor. İkisini de C4 ile patlat.`, first ? 5.5 : 1.2);
          this.radio('YUVA', 'Toplar göğe ateş ediyor, izli mermilerden yerlerini görebilirsin.', first ? 12 : 7);
        },
        skip: () => {
          for (const a of this.aa) {
            if (a.destroyed) continue;
            a.destroyed = true;
            this.destroyed.add(a.id);
          }
        },
      },
      intel: {
        id: 'intel', text: 'Komuta merkezinden istihbaratı al', cp: 3,
        marker: () => D.laptop.pos.clone().setY(1.2),
        start: (first) => {
          this.radio('YUVA', `${first ? '' : 'Gökyüzü temiz! '}Güneydeki kapıdan komuta merkezine gir ve binadaki istihbaratı al.`, first ? 5.5 : 1.2);
          this.radio('YUVA', 'Kulede bir keskin nişancı var. Kırmızı lazeri görürsen siper al.', first ? 12 : 8);
        },
        skip: () => {
          this.intel = true;
        },
      },
      lz: { id: 'lz', text: 'İniş bölgesine ulaş', cp: 4, marker: () => D.lz.clone().setY(1) },
      defend: {
        id: 'defend', text: 'Helikopter gelene kadar iniş bölgesini savun', cp: 5,
        marker: () => D.lz.clone().setY(1),
        start: (first) => {
          this.defendT = 0;
          this.wavesSpawned = 0;
          this.radio('YUVA', 'Helikopter yolda. Bölgeyi tut, düşman dört bir yandan geliyor!', first ? 5.5 : 0.5);
        },
      },
      board: {
        id: 'board', text: 'Helikoptere bin', cp: null,
        marker: () => (this.heli ? this.heli.root.position.clone().setY(1.5) : D.lz.clone()),
      },
    };
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
    if (o.id === 'outpost') detail = `Kalan düşman: ${g.enemies.aliveInGroup('outpost')}`;
    else if (o.id === 'aa') detail = `${this.destroyed.size}/2 imha edildi`;
    else if (o.id === 'defend') detail = `Helikopter: ${Math.max(0, Math.ceil(this.defendTime - this.defendT))} sn`;
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
    if (g.weapons.owned[p.id]) return `${d.name} · cephane al`;
    const same = g.weapons.slots.find((s) => WEAPONS[s].category === d.category);
    return same && this.mode === 'mission' ? `${d.name} al (${WEAPONS[same].name} bırakılır)` : `${d.name} al`;
  }

  takePickup(p) {
    const g = this.game;
    const res = g.weapons.pickUp(p.id, p.ammo);
    p.remove();
    g.audio.mech('pickup');
    g.events.emit('message', res.refilled ? `${p.data.name} · CEPHANE` : `${p.data.name.toUpperCase()} ALINDI`, 'info');
    if (res.dropped) {
      // Bırakılan silah oyuncunun önüne düşer, geri alınabilir
      const P = g.player;
      const fwd = new THREE.Vector3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
      const at = P.pos.clone().addScaledVector(fwd, 0.9);
      at.y = P.pos.y;
      this.pickups3.push(new WeaponPickup(this, res.dropped.id, at, P.yaw + 1.2, { mag: res.dropped.mag, reserve: res.dropped.reserve }));
    }
  }

  // Roket ya da el bombası uçaksavarın dibinde patlarsa top da imha olur
  onExplosion(pos, radius, damage, owner) {
    if (!this.aa || owner !== 'player' || damage < 200 || this.current?.id !== 'aa') return;
    for (const gun of this.aa) {
      if (!gun.destroyed && !gun.planted && gun.pos.distanceTo(pos) < 3.6) gun.detonate();
    }
  }

  advance() {
    const g = this.game;
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
    if (this.destroyed.size >= 2 && this.current?.id === 'aa') {
      this.advance();
    } else {
      this.radio('YUVA', 'Güzel iş, bir top gitti. Diğerini de bul.', 1);
      this.saveCheckpoint(2);
    }
  }

  onIntel() {
    const g = this.game;
    this.intel = true;
    this.laptop.screen.material.emissive.setHex(0xd63d3d);
    g.audio.siren(9);
    g.events.emit('message', 'İSTİHBARAT ALINDI', 'info');
    this.radio('YUVA', 'Dosyalar elimizde! Alarm çaldı, takviye geliyor. Kuzey kapısından çık ve iniş bölgesine ilerle.', 0.8);
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
    const calls = ['Güneyden hareket var!', 'Doğu ve batıdan yeni bir grup!', 'Ağır makineli dahil büyük bir grup geliyor!', 'Son dalga! İki ağır makineli yanlardan, hücumcular önden!'];
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
        const left = g.enemies.aliveInGroup('outpost');
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
        if (this.heli && P.pos.distanceTo(this.heli.root.position) < 6.5) this.finish();
        break;
      default:
        break;
    }
    this.updateHeli(dt);
  }

  spawnHeli() {
    const g = this.game;
    const h = buildHelicopter();
    g.scene.add(h.root);
    this.heli = { ...h, t: 0, landed: false };
    h.root.position.set(0, 45, 160);
    h.root.rotation.y = 0;
    g.audio.startRotor();
    this.radio('PİLOT', 'Kartal-1, burası Şahin-2. İniş bölgesini görüyorum, alçalıyorum!', 0);
    const lz = this.data.lz;
    this.heliDust = g.effects.addEmitter({
      rate: 0,
      spawn: (fx) => {
        const a = Math.random() * Math.PI * 2;
        const r = rand(2, 6);
        fx.smoke.spawn(lz.x + Math.cos(a) * r, 0.3, lz.z + Math.sin(a) * r, Math.cos(a) * rand(6, 12), rand(0.3, 1.5), Math.sin(a) * rand(6, 12), rand(1.2, 2.2), 1.5, 5, fx._c.setHex(0xcbb08a), 0.5, 0, 1.5);
      },
    });
  }

  updateHeli(dt) {
    const H = this.heli;
    if (!H) return;
    const g = this.game;
    H.t += dt;
    const lz = this.data.lz;
    // Güneyden gelip iniş bölgesine süzülerek alçal
    const dur = 20;
    const k = clamp(H.t / dur, 0, 1);
    const e = smoothstep(k);
    const z = lerp(160, lz.z + 3, Math.min(1, e * 1.15));
    const y = k < 0.7 ? lerp(45, 14, smoothstep(k / 0.7)) : lerp(14, 0.05, smoothstep((k - 0.7) / 0.3));
    H.root.position.set(lz.x + Math.sin(H.t * 0.6) * (1 - k) * 4, y, z);
    H.root.rotation.x = k < 0.85 ? 0.12 * (1 - k) : 0;
    H.root.rotation.z = Math.sin(H.t * 0.8) * 0.04 * (1 - k);
    H.rotor.rotation.y += dt * 28;
    H.tail.rotation.x += dt * 40;
    if (k >= 1) H.landed = true;
    if (this.heliDust) this.heliDust.rate = y < 12 ? 40 * (1 - y / 12) : 0;
    g.audio.updateRotor(H.root.position);
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
