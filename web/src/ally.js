// Dost askerler: oyuncunun mavi mangası (UE5'te AShooterAlly + AIController karşılığı).
// Oyuncuyu gevşek bir düzende izler. Silahlar serbest kalınca (bir düşman çatışmaya girdi, oyuncu ateş
// etti ya da manga vuruldu) düzen yerinin yakınında siper alır ve görünen en yakın düşmana kısa seriler
// atar. Sessiz ilerlerken ateş açmaz: oyuncunun gizliliğini bozmasın diye.
// Vurulan dost kalıcı ölmez; bir süre yaralı kalıp toparlanır. Böylece seviye dengesi dostların
// kaybına bağlanmaz. Düşmanlar dostları da hedef alır (enemy.js → foe); oyuncunun mermisi dostu yaralamaz.
//
// Kademe (ALLY_TIERS, seviyeye göre): isabet, tepki, hasar, can ve açık taktikler. Taktikler:
//   peek: siperde eğilip çıkarak ateş · callout: düşmanı telsizle ve HUD işaretiyle bildirme
//   suppress: ağır makineli nişancısını bastırma ateşiyle eğdirme · revive: yerdeki dostu ayıltma
//   grenade: toplu düşmana ya da mevziye el bombası · bound: biri örterken diğeri sipere atılır
//   flank: bir dost mevzinin atış yayının dışına dolanıp nişancıyı yandan vurur
//
// Alfa Timi (Operasyon Güncellemesi §8.1, §8.6): kimlik, rol ve rol silahı data/squad.json'dan. Komutlar
// (commands.js) askere bir emir verir; hareket hedefi şu öncelikle seçilir:
//   1) yerde (Modül D) · 2) can %25'in altında ve ateş altında: kısa süre siper · 3) son emir
//   (pozisyonu koru, oraya git, siper al, bölgeyi temizle, beni iyileştir) · 4) otonom davranış (takip,
//   çatışmada siper, kademe taktikleri). Saldır ve baskı ateşi hareketi değil ateşi yönlendirir;
//   ateşi kes/serbest ateş tetik disiplinidir.
import * as THREE from 'three';
import { ALLY, ALLY_TIERS, SOLDIER_ANIM, HMG } from './config.js';
import { createSoldier } from './soldier.js';
import { Health } from './health.js';
import { DEG, clamp, damp, dampAngle, angleDiff, dirToYaw, rand, randomInCone, pick } from './util.js';
import SQUAD from './data/squad.json' with { type: 'json' };
import STORE from './data/store.json' with { type: 'json' };
import VOICE from './data/voicelines.tr.json' with { type: 'json' };
import { computeArmorDamage } from './armor.js';
import { EV } from './events.js';
import { REVIVE, BleedOut, allyBleedOutFor, allyCanDie, assistScore, assistDecision, reviveTime } from './downed.js';

const O = SQUAD.orders;
// Tim Zırhı yükseltmeleri (mağaza): sahip olunan en yüksek seviyenin ZP'si
const SQUAD_ARMOR = STORE.upgrades.filter((u) => u.squadArmor).sort((a, b) => b.squadArmor - a.squadArmor);

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _d = new THREE.Vector3();
const _hit = {};
const _ray = new THREE.Raycaster();
// Görünüm katmanına her karede aktarılan durum (bellek ayırmamak için tek nesne)
const ANIM = { pos: null, yaw: 0, vel: null, crouch: false, aimPitch: 0, stance: 'relaxed', reload: -1, throw: -1, dist: 0, mount: null, hideGun: false };
const CLOCK = ['12', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'];

const LINES = {
  contact: ['Temas! Düşman görüldü.', 'Hedef görüldü, ateş ediyorum!', 'İleride düşman var!'],
  reload: ['Şarjör değiştiriyorum!', 'Şarjör! Beni koruyun.'],
  kill: ['Düştü!', 'Bir düşman eksik.', 'Hedef etkisiz.'],
  down: ['Vuruldum! Biraz zaman lazım.', 'Yaralandım, yere düştüm!'],
  up: ['Toparlandım, devam ediyorum.', 'Tamam, yine çatışmadayım.'],
  friendly: ['Dikkat komutanım, bana ateş etme!', 'Dost ateşi! Nişanını kaldır!'],
  suppress: ['Makineliyi bastırıyorum, yanaş!', 'Makineli yuvasını baskı altına aldım!', 'Başını kaldırtmıyorum, ilerle!'],
  grenade: ['Bomba atıyorum!', 'El bombası, eğilin!'],
  revive: ['Seni kaldırıyorum, dayan!', 'Yaralıya gidiyorum!'],
  flank: ['Makinelinin yanına dolanıyorum!', 'Yandan vuruyorum, oyalayın!'],
  bound: ['İlerliyorum, örtün beni!', 'Hareket! Siz örtün!'],
};

// Replik türü → voicelines.tr.json anahtarı (§8.7). Eşlenmeyen türler (bomba atıyorum, kanada dolanıyorum…)
// yukarıdaki yerel listeden gelir
const VOICE_KIND = { contact: 'enemySpotted', reload: 'reloading', kill: 'enemyDown', down: 'down', hit: 'hit', incoming: 'grenade' };

// {dir} saat yönü, {dist} mesafe; bilgi yoksa yer tutuculu satırlar seçilmez
function voiceLine(kind, ctx) {
  const lines = VOICE.lines[VOICE_KIND[kind]] || LINES[kind];
  if (!lines) return null;
  const usable = ctx ? lines : lines.filter((l) => !l.includes('{'));
  const line = pick(usable.length ? usable : lines);
  return ctx ? line.replace('{dir}', ctx.dir).replace('{dist}', ctx.dist) : line;
}

export class Ally {
  constructor(game, index, pos, yaw) {
    this.game = game;
    this.index = index;
    // Kimlik ve rol (data/squad.json): Alfa-1 Demir tüfekçi, Alfa-2 Kaya medik, Alfa-3 Yıldız makineli
    this.member = SQUAD.members[index % SQUAD.members.length];
    this.callsign = this.member.callsign;
    this.name = this.callsign; // HUD etiketi ve telsiz
    this.person = this.member.name;
    this.role = this.member.role;
    this.C = SQUAD.roleCombat[this.role] || SQUAD.roleCombat.rifleman;
    this.isPlayer = false;
    // Kademe değerleri (seviyeyle artar): isabet, tepki, hasar, can, taktikler
    this.S = game.allies.tier;
    this.rankName = `${this.S.short} ${this.person}`;
    this.radioLabel = `${this.callsign} ${this.rankName}`;
    this.model = createSoldier(this.C.gun === 'lmg' ? 'allyGunner' : this.S.elite ? 'allyElite' : 'ally', ALLY.colors);
    game.scene.add(this.model.root);
    this.pos = new THREE.Vector3().copy(pos);
    this.vel = new THREE.Vector3();
    this.state = { pos: this.pos, vel: this.vel, radius: 0.36, height: 1.8, grounded: true, gravity: 15, hitWall: false };
    this.health = new Health(this.S.hp, 0);
    this.flankGoal = new THREE.Vector3();
    this.weapon = { mag: this.C.magSize, cooldown: 0, burstLeft: 0, gapT: 0, reloadT: 0 };
    this.armor = null; // Tim Zırhı: { points, max, absorb }
    this.orderPos = new THREE.Vector3();
    this.slotGoal = new THREE.Vector3();
    this.lastPos = new THREE.Vector3();
    this.pathGoal = new THREE.Vector3(Infinity, 0, 0);
    this.reset(pos, yaw);
  }

  reset(pos, yaw) {
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.health.reset();
    this.down = false;
    this.downT = 0;
    this.lastHurt = -100;
    this.target = null;
    this.targetVisible = false;
    this.lastSeenT = -100;
    this.reactT = 0;
    this.thinkT = Math.random() * ALLY.thinkInterval;
    this.cover = null;
    this.coverT = 0;
    this.path = null;
    this.pathIdx = 0;
    this.repathT = 0;
    this.slotT = 0;
    this.stuckT = 0;
    this.stuckN = 0;
    this.detour = null;
    this.detourUntil = 0;
    this.lastPos.copy(pos);
    this.run = false;
    this.crouch = false;
    this.aimPitch = 0;
    this.sayT = rand(2, 5);
    this.weapon.mag = this.C.magSize;
    this.weapon.reloadT = 0;
    // Tim Zırhı her görev/toplanmada tam dolu (oyuncunun zırhı gibi)
    const inv = this.game.save?.data.inventory.upgrades || [];
    const up = SQUAD_ARMOR.find((u) => inv.includes(u.id));
    this.armor = up ? { points: up.squadArmor, max: up.squadArmor, absorb: SQUAD.squadArmorAbsorb } : null;
    // Emir durumu: hareket emri (order), odak hedefi (saldır), baskı alanı, tetik disiplini
    this.order = { id: 'FOLLOW', cmd: null };
    this.focus = null;
    this.focusCmd = null;
    this.suppress = null;
    this.holdFire = false;
    this.healCooldownUntil = this.healCooldownUntil || 0;
    this.selfCoverUntil = 0;
    // Modül D: kan kaybı (Normal/Zor'da kaldırılmazsa ölür), kalıcı ölüm, oyuncuyu canlandırma
    this.dead = false;
    this.bleed = null;
    this.revivedBy = null; // onu kaldırmakta olan (asker ya da 'player')
    this.rescueT = 0; // oyuncuyu canlandırma süresi
    this.rescueDmg = 0;
    this.assist = null; // son yardım puanı ve kararı (geliştirici görünümü)
    this.weapon.burstLeft = 0;
    this.peekPhase = 'show';
    this.peekT = 0;
    this.grenadeT = rand(2, 6); // ilk bomba için kısa bekleme; sonrakiler grenade.cooldown
    this.throwAnim = null;
    this.reviving = null; // ayıltmaya gittiği dost
    this.reviveT = 0;
    this.flanking = null; // dolandığı mevzi
    this.flankUntil = 0;
    this.boundGoal = null;
    this.model.reset(this.pos, yaw);
  }

  has(tac) {
    return this.game.allies.has(tac);
  }

  // --- Düşmanın gördüğü hedef arayüzü (Player ile aynı) ---
  get alive() {
    return !this.down;
  }
  get grounded() {
    return true;
  }
  get crouched() {
    return this.crouch;
  }
  get horizSpeed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }
  get sprinting() {
    return this.run && this.horizSpeed > 3.5;
  }
  headPos(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + (this.crouch ? 1.15 : 1.62), this.pos.z);
  }
  chestPos(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + (this.crouch ? 0.95 : 1.3), this.pos.z);
  }

  takeDamage(amount, fromPos = null, hit = null) {
    if (this.down) return;
    const g = this.game;
    this.lastHurt = g.time;
    // Tim Zırhı (mağaza yükseltmesi): gövde ve kafa vuruşunu emer, bacak vuruşu doğrudan cana
    if (this.armor && this.armor.points > 0 && hit?.zone !== 'leg') amount = computeArmorDamage(amount, hit?.pen ?? 0.3, this.armor).healthDamage;
    this.health.damage(amount);
    this.model.hit('torso');
    // Ağır isabet ama ayakta: "Vuruldum!" (bekleme süreleri ve aynı tür kuralı geçerli)
    if (!this.health.dead && amount >= VOICE.hitMinDamage) this.say('hit');
    // Görmediği yerden vurulduysa o yöne döner
    if (fromPos && !this.targetVisible) this.threatYaw = dirToYaw(fromPos.x - this.pos.x, fromPos.z - this.pos.z);
    // Oyuncuyu canlandırırken ağır hasar işlemi keser (§7.5); karar yeniden verilir
    if (this.rescueT > 0) {
      this.rescueDmg += amount;
      if (this.rescueDmg >= REVIVE.reviveInterruptDamage) {
        this.rescueT = 0;
        this.rescueDmg = 0;
        if (g.player.reviver === this) g.player.reviver = null;
        g.allies.rescueT = 0;
        this.sayLine('Ateş altındayım, bırakmak zorundayım!');
      }
    }
    if (this.health.dead) {
      this.down = true;
      this.downT = this.S.downTime;
      // Kolay'da bir süre sonra kendi kalkar; Normal/Zor'da kan kaybı sayacı dolarsa ölür
      this.bleed = allyCanDie(g.difficultyKey) ? new BleedOut(allyBleedOutFor(g.difficultyKey)) : null;
      if (this.bleed) this.downT = Infinity;
      this.revivedBy = null;
      this.rescueT = 0;
      if (g.player.reviver === this) g.player.reviver = null;
      g.events.emit(EV.ALLY_DOWNED, { allyId: this.callsign, ally: this });
      this.registerReviveInteract();
      this.target = null;
      this.throwAnim = null;
      this.reviving = null;
      this.flanking = null;
      this.releaseCover();
      // Yere düşen asker emrini bırakır; komut başka muhatap kalmadıysa başarısız olur
      g.commands?.drop(this, this.order.cmd, 'down');
      g.commands?.drop(this, this.focusCmd, 'down');
      g.commands?.drop(this, this.suppress?.cmd, 'down');
      this.order = { id: 'FOLLOW', cmd: null };
      this.focus = null;
      this.suppress = null;
      this.say('down', true);
      g.events.emit('allyDown', this);
    }
  }

  // Oyuncu yanına gelip E'yi basılı tutarak kaldırır (3 sn, Muharebe Medik Eğitimi ile kısa)
  registerReviveInteract() {
    const g = this.game;
    const M = g.mission;
    if (!M) return;
    const self = this;
    this.reviveIa ||= {
      id: `revive-${this.callsign}`,
      pos: new THREE.Vector3(),
      radius: 1.8,
      time: REVIVE.playerReviveHoldSec,
      get prompt() {
        return `${self.callsign} ${self.person}: ayağa kaldır`;
      },
      enabled: () => self.down && !self.dead && g.player.alive && !g.player.down,
      action: () => self.reviveBy('player'),
    };
    this.reviveIa.time = REVIVE.playerReviveHoldSec * g.allies.reviveTraining;
    this.reviveIa.pos.set(this.pos.x, this.pos.y + 0.6, this.pos.z);
    if (!M.interactables.includes(this.reviveIa)) M.interactables.push(this.reviveIa);
  }

  // Kalk: başka bir asker ya da oyuncu kaldırdı (by: çağrı kodu | 'player'), ya da Kolay'da kendiliğinden (null)
  reviveBy(by) {
    const g = this.game;
    if (!this.down || this.dead) return;
    this.down = false;
    this.downT = 0;
    this.bleed = null;
    this.revivedBy = null;
    this.health.hp = this.health.max * ALLY.reviveHp;
    this.say('up', true);
    if (by) g.events.emit(EV.ALLY_REVIVED, { allyId: this.callsign, by });
    if (by === 'player') g.save?.update((d) => (d.stats.revivesGiven = (d.stats.revivesGiven || 0) + 1));
  }

  // Kan kaybından öldü: görevin geri kalanında kayıp; bir sonraki kontrol noktasında geri gelir (ayar)
  die() {
    const g = this.game;
    this.dead = true;
    this.down = true;
    this.bleed = null;
    this.revivedBy = null;
    this.releaseCover();
    this.deathT = 0;
    this.model.die({ zone: 'torso', dir: _d.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)), source: 'enemy' }, g);
    g.mission?.radio('TELSİZ', `${this.radioLabel} kaybedildi.`, 0, 'system');
    g.events.emit(EV.ALLY_DIED, { allyId: this.callsign, ally: this });
  }

  updateDeath(dt) {
    if (this.deathT > 2.5) return;
    this.deathT += dt;
    const A = (this._deathAnim ||= { deathT: 0, fallDir: 1, fallSide: 0 });
    A.deathT = this.deathT;
    this.model.updateDeath?.(dt, A, this.pos, this.yaw);
  }

  // Oyuncunun mermisi değdi: hasar yok, uyarı var
  onFriendlyFire() {
    this.say('friendly', true);
  }

  // Telsiz: her dost ve tüm manga için ayrı bekleme süresi, aynı tür replik tüm timde 10 sn'de bir (ekranı
  // doldurmasın). Acil türler (el bombası, komutan yerde) beklemeye takılmaz ve kuyruğun önüne geçer.
  // ctx: { dir, dist } → "saat {dir}", "{dist} metre"
  say(kind, force = false, text = null, ctx = null) {
    const g = this.game;
    const M = g.allies;
    const urgent = VOICE.urgent.includes(VOICE_KIND[kind]);
    if (!force && !urgent) {
      if (this.sayT > 0 || M.sayT > 0) return;
      if (g.time - (M.kindAt.get(kind) ?? -1e9) < VOICE.sameTypeCooldownSec) return;
    }
    const line = text || voiceLine(kind, ctx);
    if (!line) return;
    M.kindAt.set(kind, g.time);
    this.sayT = rand(7, 11);
    M.sayT = 3.5;
    g.mission?.radio(this.radioLabel, line, 0, 'ally', urgent);
  }

  // Komut onayı ve rapor satırı (bekleme süresini atlar). urgent: true kuyruğun önüne geçer (komutan yerde,
  // ulaşılamıyor); 'reply' komuta cevap olarak acillerin arkasına girer
  sayLine(text, force = true, urgent = false) {
    if (!text) return;
    if (force) this.sayT = Math.max(this.sayT, 3);
    this.game.mission?.radio(this.radioLabel, text, 0, 'squad', urgent);
  }

  voice(kind) {
    const lines = VOICE.lines[kind];
    return lines ? pick(lines) : null;
  }

  // --- Komutlar (commands.js) ---
  // i/n: muhatap listesindeki sıra; aynı noktaya gönderilenler yan yana dağılır
  setOrder(commandId, cmd, i = 0, n = 1) {
    const g = this.game;
    const C = g.commands;
    switch (commandId) {
      case 'HOLD_FIRE':
        this.holdFire = true;
        C.complete(this, cmd);
        return;
      case 'FREE_FIRE':
        this.holdFire = false;
        C.complete(this, cmd);
        return;
      case 'ATTACK':
        C.drop(this, this.focusCmd, 'replaced');
        this.focus = cmd.target;
        this.focusCmd = cmd;
        this.focusSeenT = g.time;
        this.holdFire = false;
        return;
      case 'SUPPRESS':
        C.drop(this, this.suppress?.cmd, 'replaced');
        this.suppress = { pos: cmd.pos.clone().setY(1.2), until: g.time + O.suppressTime, cmd };
        this.holdFire = false;
        return;
      default:
        break;
    }
    // Hareket emirleri bir öncekinin yerine geçer
    C.drop(this, this.order.cmd, 'replaced');
    const o = { id: commandId, cmd, arrived: false, pos: null };
    if (commandId === 'HOLD') {
      o.pos = this.pos.clone();
      o.arrived = true;
      o.cmd = null;
      C.complete(this, cmd);
    } else if (commandId === 'MOVE_TO' || commandId === 'CLEAR_AREA') {
      o.pos = this.spreadPoint(cmd.pos, i, n);
      // Ulaşılamayan nokta: yol bulucu en yakın noktaya kadar götürür; hedeften uzak kalıyorsa yol yok
      const path = g.nav.inBounds(o.pos.x, o.pos.z) && g.nav.isWalkable(o.pos.x, o.pos.z) ? g.nav.findPath(this.pos, o.pos) : null;
      const end = path?.[path.length - 1];
      if (!end || Math.hypot(end.x - o.pos.x, end.z - o.pos.z) > 3) {
        C.fail(this, cmd, 'no-path', this.voice('noPath'));
        return;
      }
      if (commandId === 'CLEAR_AREA') {
        o.points = [];
        for (let k = 0; k < O.clearPoints; k++) {
          const p = g.nav.randomPointNear(cmd.pos, O.clearRadius);
          if (p) o.points.push(p);
        }
        o.points.push(o.pos.clone());
        o.idx = 0;
      }
    } else if (commandId === 'TAKE_COVER') {
      const c = this.coverFromThreat();
      this.releaseCover();
      if (c) {
        this.cover = c;
        c.taken = this;
      }
      o.pos = c ? c.pos.clone() : this.pos.clone();
    } else if (commandId === 'HEAL_PLAYER') {
      const left = this.healCooldownUntil - g.time;
      if (left > 0) {
        C.fail(this, cmd, 'cooldown', `${this.voice('healCooldown')} (${Math.ceil(left)} sn)`);
        return;
      }
      o.prev = this.order.id === 'HEAL_PLAYER' ? this.order.prev : this.order;
      o.t = 0;
    }
    this.order = o;
    this.path = null;
  }

  // Saldır ve baskı emirlerinin sonu: hedef düştü / kayboldu, baskı süresi doldu
  updateOrders() {
    const g = this.game;
    const C = g.commands;
    if (this.focus) {
      if (!this.focus.alive) {
        C.complete(this, this.focusCmd, this.voice('targetDown'));
        this.focus = null;
        this.focusCmd = null;
      } else if (g.time - this.focusSeenT > O.attackLoseTime) {
        C.fail(this, this.focusCmd, 'lost', 'Hedefi kaybettim komutanım!');
        this.focus = null;
        this.focusCmd = null;
      }
    }
    if (this.suppress && g.time > this.suppress.until) {
      C.complete(this, this.suppress.cmd, 'Baskı ateşi tamam.');
      this.suppress = null;
    }
  }

  // Grup emrinde askerler hedef noktada yan yana (oyuncunun sağına/soluna) dağılır
  spreadPoint(base, i, n) {
    const g = this.game;
    const P = g.player;
    const off = (i - (n - 1) / 2) * O.spread;
    const out = new THREE.Vector3(base.x + Math.cos(P.yaw) * off, 0, base.z - Math.sin(P.yaw) * off);
    if (!g.nav.isWalkable(out.x, out.z)) out.copy(g.nav.randomPointNear(base, 2.5) || base);
    return out;
  }

  // Tehdit yönüne göre en yakın siper: en yakın canlı düşman (yoksa oyuncunun baktığı yön)
  coverFromThreat() {
    const g = this.game;
    let threat = this.target?.alive ? this.target.pos : null;
    if (!threat) {
      let bestD = 60;
      for (const e of g.enemies.list) {
        if (!e.alive || e.dummy) continue;
        const d = e.pos.distanceTo(this.pos);
        if (d < bestD) {
          bestD = d;
          threat = e.pos;
        }
      }
    }
    if (!threat) threat = _v3.set(this.pos.x - Math.sin(g.player.yaw) * 20, 0, this.pos.z - Math.cos(g.player.yaw) * 20);
    let best = null;
    let bestScore = -Infinity;
    for (const c of g.nav.coversNear(this.pos, 10)) {
      if (c.taken && c.taken !== this) continue;
      const tx = threat.x - c.pos.x;
      const tz = threat.z - c.pos.z;
      const dT = Math.hypot(tx, tz) || 1;
      if ((c.normal.x * tx + c.normal.z * tz) / dT < 0.3) continue; // siper tehdide dönük olmalı
      const score = -c.pos.distanceTo(this.pos);
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best;
  }

  // Hareket emrinin hedefi (yoksa null: otonom davranış). Varınca emri bitirir ve rapor verir.
  orderGoal(dt) {
    const g = this.game;
    const o = this.order;
    const C = g.commands;
    if (o.id === 'FOLLOW') {
      if (o.cmd && this.pos.distanceTo(this.slotGoal) < O.followDoneDist) {
        C.complete(this, o.cmd);
        o.cmd = null;
      }
      return null;
    }
    if (o.id === 'HEAL_PLAYER') {
      const P = g.player;
      if (!P.alive) {
        C.fail(this, o.cmd, 'player-dead');
        this.order = o.prev || { id: 'FOLLOW', cmd: null };
        return null;
      }
      if (this.pos.distanceTo(P.pos) < O.healRange) {
        this.crouch = true;
        o.t += dt;
        if (o.t >= this.member.healTimeSec) {
          P.health.heal(this.member.healHp);
          this.healCooldownUntil = g.time + this.member.healCooldownSec;
          C.complete(this, o.cmd, this.voice('healDone'));
          this.order = o.prev || { id: 'FOLLOW', cmd: null };
        }
        return this.pos; // yanında: yerinde durur (düzen yerine dönmez), tedavi eder
      }
      return P.pos;
    }
    if (o.id === 'CLEAR_AREA' && o.points) {
      const p = o.points[o.idx];
      if (Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < O.arriveDist) {
        o.idx++;
        if (o.idx >= o.points.length) {
          // Son nokta: görünen düşman yoksa bölge temiz; varsa çatışma bitince yeniden bakılır
          o.points = null;
          o.arrived = true;
          if (!this.targetVisible) C.complete(this, o.cmd, this.voice('areaClear'));
          else C.fail(this, o.cmd, 'contact', this.voice('cannotReach'));
          o.cmd = null;
          return o.pos;
        }
      }
      return o.points[o.idx];
    }
    if (!o.arrived && Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z) < O.arriveDist) {
      o.arrived = true;
      C.complete(this, o.cmd, o.id === 'TAKE_COVER' ? null : this.voice('inPosition'));
      o.cmd = null;
    }
    return o.pos;
  }

  // Oyuncuya göre düzen yeri (sağa, geriye); yürünemiyorsa yakındaki boş nokta
  slotPos(out) {
    const g = this.game;
    const P = g.player;
    const [ox, oz] = ALLY.slots[this.index % ALLY.slots.length];
    const c = Math.cos(P.yaw);
    const s = Math.sin(P.yaw);
    out.set(P.pos.x + c * ox + s * oz, P.pos.y, P.pos.z - s * ox + c * oz);
    if (!g.nav.isWalkable(out.x, out.z)) {
      const alt = g.nav.randomPointNear(out, 3);
      out.copy(alt || P.pos);
    }
    return out;
  }

  update(dt) {
    const g = this.game;
    const P = g.player;
    this.sayT -= dt;
    if (this.dead) {
      this.updateDeath(dt);
      return;
    }
    if (this.down) {
      this.downT -= dt;
      this.vel.x = damp(this.vel.x, 0, 10, dt);
      this.vel.z = damp(this.vel.z, 0, 10, dt);
      this.crouch = true;
      // Biri kaldırırken (asker ya da E basılı oyuncu) sayaç durur
      if (this.reviveIa) this.reviveIa.pos.set(this.pos.x, this.pos.y + 0.6, this.pos.z);
      const byPlayer = !!this.reviveIa && P.interacting && P.interactTarget === this.reviveIa;
      if (this.bleed && this.bleed.tick(dt, !!this.revivedBy || byPlayer)) {
        this.die();
        return;
      }
      if (this.downT <= 0) this.reviveBy(null);
      g.world.moveCharacter(this.state, dt, 0.45);
      this.animate(dt, 'relaxed');
      return;
    }
    if (g.time - this.lastHurt > ALLY.regenDelay) this.health.heal(ALLY.regenRate * dt);

    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT += ALLY.thinkInterval;
      this.perceive();
    }
    // Tetik disiplini: "ateşi kes" emrinde yalnız kendisine ateş edilirse karşılık verir; saldır ve baskı
    // emirleri tetiği serbest bırakır
    const hurtRecently = g.time - this.lastHurt < 6;
    const weaponsFree = (this.holdFire ? false : g.allies.weaponsFree) || hurtRecently || !!this.focus || !!this.suppress;
    this.updateOrders();

    // Hedef: çatışmada düzen yerinin yakınındaki siper, değilse düzen yeri
    this.slotT -= dt;
    if (this.slotT <= 0) {
      this.slotT = 0.4;
      if (this.order.pos && this.order.id !== 'HEAL_PLAYER') this.slotGoal.copy(this.order.pos);
      else this.slotPos(this.slotGoal);
    }
    let goal = this.slotGoal;
    if (weaponsFree && this.target) {
      this.coverT -= dt;
      if (this.coverT <= 0) {
        this.coverT = rand(2, 3.5);
        this.pickCover();
      }
      if (this.cover) goal = this.cover.pos;
    } else this.releaseCover();
    // Emir: pozisyonu koru / oraya git / siper al / temizle / iyileştir. Noktası olan emirde çatışma siperi
    // o noktanın çevresinden seçilir (slotGoal yerine emir noktası)
    const og = this.orderGoal(dt);
    if (og) {
      // Çatışmada emir noktasının yanındaki siper korunur; siper al, temizle ve iyileştir emirleri doğrudan gider
      const keepFightCover = weaponsFree && this.target && this.cover && !['TAKE_COVER', 'HEAL_PLAYER', 'CLEAR_AREA'].includes(this.order.id);
      if (!keepFightCover) goal = og;
    }
    // Saldır: odak hedef görünmüyorsa takipteki asker ona yaklaşır
    if (this.focus && !this.targetVisible && this.order.id === 'FOLLOW') goal = this.focus.pos;
    // Kademe taktikleri hedefi değiştirebilir: yaralıya koş, mevzinin yanına dolan (emir yokken)
    const tac = this.order.id === 'FOLLOW' ? this.tacticGoal(dt, weaponsFree) : this.reviving ? this.tacticGoal(dt, weaponsFree) : null;
    if (tac) {
      goal = tac;
      this.releaseCover();
    }
    // Oyuncuyu canlandırma (§7.4–7.5): seçilen asker emri ne olursa olsun komutana koşar
    if (g.allies.rescue.reviver === this && P.down) {
      goal = P.pos;
      this.releaseCover();
    }
    // Kendini koruma: can çok düşük ve ateş altında → kısa süre en yakın sipere (emirden önce gelir)
    if (this.health.hp < this.health.max * O.selfPreserveHp && g.time - this.lastHurt < O.selfPreserveHurtSec && g.time > this.selfCoverUntil) {
      this.selfCoverUntil = g.time + O.selfPreserveCoverSec;
      const c = this.coverFromThreat();
      if (c) {
        this.releaseCover();
        this.cover = c;
        c.taken = this;
      }
      this.sayLine(this.voice('lowHealthCover'), false);
    }
    if (g.time < this.selfCoverUntil && this.cover) goal = this.cover.pos;
    // Oyuncunun nişan hattındaysa kenara çekil; oyuncuyu tedavi ederken ya da kaldırırken yanından ayrılmaz
    // (yoksa tam önünde duran medik tedaviyi yarıda bırakıp kenara kaçar)
    const tending = this.order.id === 'HEAL_PLAYER' || (g.allies.rescue.reviver === this && P.down);
    if (!tending && this.inFireLane()) {
      const c = Math.cos(P.yaw);
      const s = Math.sin(P.yaw);
      const side = (this.pos.x - P.pos.x) * c - (this.pos.z - P.pos.z) * s >= 0 ? 1 : -1;
      _v.set(this.pos.x + c * 2.2 * side, this.pos.y, this.pos.z - s * 2.2 * side);
      if (g.nav.isWalkable(_v.x, _v.z)) goal = _v;
    }

    // Çok geride kaldıysa (ör. kontrol noktası, dar geçit) oyuncunun görmediği anda yanına al
    const dP = this.pos.distanceTo(P.pos);
    if (dP > ALLY.teleportDist && P.alive && this.order.id === 'FOLLOW') {
      _d.subVectors(this.slotGoal, P.pos).normalize();
      const fx = -Math.sin(P.yaw);
      const fz = -Math.cos(P.yaw);
      if (_d.x * fx + _d.z * fz < 0.2) {
        this.pos.copy(this.slotGoal);
        this.path = null;
      }
    }

    let dist = Math.hypot(goal.x - this.pos.x, goal.z - this.pos.z);
    this.updateStuck(dt, dist);
    if (this.detour && g.time < this.detourUntil) {
      goal = this.detour;
      dist = Math.hypot(goal.x - this.pos.x, goal.z - this.pos.z);
    } else this.detour = null;
    this.crouch = false;
    let hiding = false;
    if (dist > 0.9) {
      // Oyuncunun hızına uy: geride kalınca açığı kapatacak kadar hızlan; taktik hareket koşarak
      const speed = tac ? ALLY.run : clamp(P.horizSpeed * 1.1 + (dist - 1) * 0.35, ALLY.walk, ALLY.run);
      this.run = speed > ALLY.walk + 1;
      this.followPath(goal, dt, speed);
    } else {
      this.path = null;
      this.vel.x = damp(this.vel.x, 0, 8, dt);
      this.vel.z = damp(this.vel.z, 0, 8, dt);
      // Siperde şarjör değiştirirken çömel; "siper al" emrinde siperde eğik bekle (hedef görünce kalkar)
      if (this.cover && this.weapon.reloadT > 0) this.crouch = true;
      if (this.order.id === 'TAKE_COVER' && !(this.targetVisible && weaponsFree)) this.crouch = true;
      if (this.order.id === 'HEAL_PLAYER' && this.pos.distanceTo(P.pos) < O.healRange) {
        this.crouch = true;
        hiding = true;
      }
      // Komutanın yanında: çömel, sayaç durur, süre dolunca kaldır
      if (g.allies.rescue.reviver === this && P.down && this.pos.distanceTo(P.pos) < REVIVE.reviveRange + 0.4) {
        this.crouch = true;
        hiding = true;
        P.reviver = this;
        this.rescueT += dt;
        const need = reviveTime({ medic: this.role === 'medic', training: g.allies.reviveTraining });
        P.reviveK = Math.min(1, this.rescueT / need);
        if (this.rescueT >= need) {
          this.rescueT = 0;
          this.rescueDmg = 0;
          g.allies.rescue.reviver = null;
          this.sayLine(this.voice('reviving'));
          P.revive(this.callsign);
        }
      }
      // Eğilip çıkma: siperde saklan / kalk ve ateş et döngüsü (düşman görüşünden çıkar)
      if (this.cover && this.target && this.has('peek')) {
        this.peekT -= dt;
        if (this.peekT <= 0) {
          this.peekPhase = this.peekPhase === 'show' ? 'hide' : 'show';
          const r = ALLY.peek[this.peekPhase];
          this.peekT = rand(r[0], r[1]);
        }
        if (this.peekPhase === 'hide') {
          this.crouch = true;
          hiding = true;
        }
      }
      // Ayıltma: yaralının yanında çömel, süre dolunca kaldır
      if (this.reviving && this.pos.distanceTo(this.reviving.pos) < 1.4) {
        this.crouch = true;
        hiding = true;
        this.reviveT += dt;
        this.reviving.revivedBy = this;
        if (this.reviveT >= reviveTime({ medic: this.role === 'medic', training: g.allies.reviveTraining })) {
          this.reviving.reviveBy(this.callsign);
          this.reviving = null;
          this.reviveT = 0;
        }
      }
    }

    // Bakış: hedef → hareket yönü → oyuncunun baktığı yön
    let face;
    if (this.target && this.targetVisible) face = dirToYaw(this.target.pos.x - this.pos.x, this.target.pos.z - this.pos.z);
    else if (this.threatYaw != null && g.time - this.lastHurt < 3) face = this.threatYaw;
    else if (this.horizSpeed > 0.4) face = dirToYaw(this.vel.x, this.vel.z);
    else face = P.yaw;
    this.yaw = dampAngle(this.yaw, face, this.targetVisible ? 8 : 4, dt);

    this.updateWeapon(dt, weaponsFree && !hiding && !this.throwAnim);
    this.updateGrenade(dt, weaponsFree);
    // Diğer dostlarla ve oyuncuyla iç içe girme
    for (const o of g.allies.list) {
      if (o === this) continue;
      const dx = this.pos.x - o.pos.x;
      const dz = this.pos.z - o.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 0.8 && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        this.vel.x += (dx / d) * (0.9 - d) * 5;
        this.vel.z += (dz / d) * (0.9 - d) * 5;
      }
    }
    g.world.moveCharacter(this.state, dt, 0.45);
    let stance = 'relaxed';
    if (this.target && weaponsFree) stance = this.targetVisible ? 'aim' : 'ready';
    else if (g.allies.alert) stance = 'ready';
    this.animate(dt, stance);
  }

  animate(dt, stance) {
    let aim = 0;
    if (this.target && this.targetVisible) {
      const e = this.headPos(_v);
      const h = this.target.chestPos(_v2);
      aim = Math.atan2(h.y - e.y, Math.hypot(h.x - e.x, h.z - e.z));
    }
    this.aimPitch = damp(this.aimPitch, clamp(aim, -0.7, 0.7), 8, dt);
    const W = this.weapon;
    ANIM.pos = this.pos;
    ANIM.yaw = this.yaw;
    ANIM.vel = this.vel;
    ANIM.crouch = this.crouch;
    ANIM.aimPitch = this.aimPitch;
    ANIM.stance = this.throwAnim ? 'ready' : stance;
    ANIM.reload = W.reloadT > 0 ? 1 - W.reloadT / this.C.reload : -1;
    ANIM.throw = this.throwAnim ? this.throwAnim.t / SOLDIER_ANIM.throwTime : -1;
    ANIM.dist = this.pos.distanceTo(this.game.player.pos);
    this.model.animate(dt, ANIM);
  }

  // Takılma: engele sıkışan dost önce yakındaki boş bir noktaya sapar; yine ilerleyemezse oyuncunun
  // görmediği anda düzen yerine alınır (manga geride kalmasın)
  updateStuck(dt, dist) {
    const g = this.game;
    this.stuckT += dt;
    if (this.stuckT < ALLY.stuckCheck) return;
    const moved = Math.hypot(this.pos.x - this.lastPos.x, this.pos.z - this.lastPos.z);
    if (dist > 1.5 && moved < ALLY.stuckMove) {
      this.stuckN++;
      this.path = null;
      this.repathT = 0;
      if (this.stuckN >= 2 && !this.seenByPlayer()) {
        this.pos.copy(this.slotGoal);
        this.stuckN = 0;
      } else {
        const alt = g.nav.randomPointNear(this.pos, 2.5);
        if (alt) {
          this.detour = alt;
          this.detourUntil = g.time + 1;
        }
      }
    } else this.stuckN = 0;
    this.stuckT = 0;
    this.lastPos.copy(this.pos);
  }

  // Oyuncu bu dostu şu an görüyor mu (önünde ve arada engel yok)?
  seenByPlayer() {
    const g = this.game;
    const P = g.player;
    const dx = this.pos.x - P.pos.x;
    const dz = this.pos.z - P.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    if ((dx * -Math.sin(P.yaw) + dz * -Math.cos(P.yaw)) / d < 0.3) return false;
    return g.world.lineOfSight(P.headPos(_v2), this.chestPos(_v3));
  }

  // Görünen en yakın düşman (mevcut hedef önce sınanır; en fazla üç görüş testi). Bastırma taktiği
  // açıksa çalışan bir ağır makineli nişancısı, daha uzakta olsa da önce hedeflenir
  perceive() {
    const g = this.game;
    const eye = this.headPos(_v);
    let best = null;
    let bestD = ALLY.viewRange;
    let tests = 0;
    const T = this.target;
    // Saldır emri: işaretli düşman her zaman hedef; görünürlüğü ayrıca izlenir
    if (this.focus?.alive) {
      const vis = eye.distanceTo(this.focus.pos) < ALLY.viewRange * 1.5 && (g.world.canSee(eye, this.focus.chestPos(_v2)) || g.world.canSee(eye, this.focus.eyePos(_v2)));
      if (this.target !== this.focus) this.reactT = this.S.reaction * 0.6;
      this.target = this.focus;
      this.targetVisible = vis;
      if (vis) {
        this.lastSeenT = g.time;
        this.focusSeenT = g.time;
      }
      return;
    }
    const gunner = this.has('suppress') ? this.visibleGunner(eye) : null;
    if (gunner) {
      best = gunner;
      bestD = 0;
    } else if (T && T.alive && eye.distanceTo(T.pos) < ALLY.viewRange && g.world.canSee(eye, T.chestPos(_v2))) {
      best = T;
      bestD = eye.distanceTo(T.pos) * 0.8; // hedef değiştirmek için belirgin biçimde daha yakın biri gerekir
      tests++;
    }
    for (const e of g.enemies.list) {
      if (!e.alive || e.dummy || e === T) continue;
      const d = eye.distanceTo(e.pos);
      if (d >= bestD) continue;
      if (tests >= 3) break;
      tests++;
      if (g.world.canSee(eye, e.chestPos(_v2))) {
        best = e;
        bestD = d;
      }
    }
    if (best) {
      if (best !== this.target) {
        this.reactT = this.S.reaction * rand(0.8, 1.3);
        if (best.mount && this.has('suppress') && g.allies.weaponsFree) this.say('suppress');
        else if (!this.target && g.allies.weaponsFree) this.say('contact', false, null, g.allies.clockOf(best.pos));
        if (this.has('callout') && g.allies.weaponsFree) g.allies.callout(this, best);
      }
      this.target = best;
      this.targetVisible = true;
      this.lastSeenT = g.time;
    } else {
      this.targetVisible = false;
      if (this.target && (!this.target.alive || g.time - this.lastSeenT > ALLY.loseTargetTime)) this.target = null;
    }
  }

  // Bastırma menzilindeki, görülebilen, başında nişancı olan mevzi (en yakını)
  visibleGunner(eye) {
    const g = this.game;
    let best = null;
    let bestD = ALLY.suppress.range;
    for (const n of g.mission?.mounts || []) {
      const e = n.gunner;
      if (!e.alive || e.mount !== n || e.aiState !== 'combat') continue;
      const d = eye.distanceTo(e.pos);
      if (d >= bestD) continue;
      if (!g.world.canSee(eye, e.eyePos(_v2))) continue;
      best = e;
      bestD = d;
    }
    return best;
  }

  // Taktik hareket hedefi (yoksa null): yaralı dostu ayıltmaya koş, mevziyi yandan vur, sıçramalı ilerle
  tacticGoal(dt, weaponsFree) {
    const g = this.game;
    const M = g.allies;
    // Ayıltma: en yakın sağlam dost gider (manga yöneticisi atar)
    if (this.reviving) {
      if (!this.reviving.down) this.reviving = null;
      else return this.reviving.pos;
    }
    // Kanat: mevzinin yayı dışındaki noktaya git, oradan nişancıyı vur
    if (this.flanking) {
      const n = this.flanking;
      if (!n.gunner.alive || n.gunner.mount !== n || n.wrecked || g.time > this.flankUntil) {
        this.flanking = null;
        M.flanker = null;
      } else return this.flankGoal;
    }
    // Sıçramalı ilerleme: kendi sırası gelince hedefe doğru bir sonraki sipere atıl
    if (this.has('bound') && weaponsFree && this.target && this.targetVisible) {
      if (M.boundTurn === this.index % 2 && !this.boundGoal) {
        const c = this.pickBoundCover();
        if (c) {
          this.boundGoal = c.pos;
          this.releaseCover();
          this.cover = c;
          c.taken = this;
          this.say('bound');
        }
      }
      if (this.boundGoal) {
        if (this.pos.distanceTo(this.boundGoal) < 1) this.boundGoal = null;
        else return this.boundGoal;
      }
    } else this.boundGoal = null;
    return null;
  }

  // Sıçrama siperi: şimdikinden hedefe bound.step kadar yakın, oyuncudan fazla uzaklaşmayan
  pickBoundCover() {
    const g = this.game;
    const T = this.target;
    const P = g.player;
    const dNow = this.pos.distanceTo(T.pos);
    const [s0, s1] = ALLY.bound.step;
    let best = null;
    let bestScore = -Infinity;
    for (const c of g.nav.coversNear(this.pos, s1 + 2)) {
      if (c.taken && c.taken !== this) continue;
      const dT = c.pos.distanceTo(T.pos);
      const gain = dNow - dT;
      if (gain < s0 * 0.5 || gain > s1 + 2 || dT < 7) continue;
      if (c.pos.distanceTo(P.pos) > 16) continue;
      const tx = T.pos.x - c.pos.x;
      const tz = T.pos.z - c.pos.z;
      if ((c.normal.x * tx + c.normal.z * tz) / dT < 0.3) continue;
      const score = -Math.abs(gain - (s0 + s1) / 2) - c.pos.distanceTo(P.pos) * 0.2;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best;
  }

  // Kanat noktası: mevzinin sağında ya da solunda, atış yayının dışında; yürünebilir olan
  startFlank(nest) {
    const g = this.game;
    const d = ALLY.flank.dist;
    const fx = -Math.sin(nest.yaw);
    const fz = -Math.cos(nest.yaw);
    let best = null;
    let bestD = Infinity;
    for (const side of [-1, 1]) {
      // yanda ve biraz geride: yay (±65°) dışında kalır
      _v.set(nest.pos.x + fz * -side * d - fx * 2, 0, nest.pos.z + fx * side * d - fz * 2);
      const p = g.nav.isWalkable(_v.x, _v.z) ? _v : g.nav.randomPointNear(_v, 3);
      if (!p) continue;
      const toP = Math.hypot(p.x - nest.pos.x, p.z - nest.pos.z);
      if (toP < 5 || nest.inArc(dirToYaw(p.x - nest.pos.x, p.z - nest.pos.z))) continue;
      const dd = p.distanceTo(this.pos);
      if (dd < bestD) {
        bestD = dd;
        best = p.clone();
      }
    }
    if (!best) return false;
    this.flankGoal.copy(best);
    this.flanking = nest;
    this.flankUntil = g.time + ALLY.flank.time;
    this.say('flank', true);
    return true;
  }

  // El bombası: toplu düşmana ya da çalışan mevziye; oyuncuya ve dostlara uzak noktaya
  updateGrenade(dt, weaponsFree) {
    const g = this.game;
    const A = this.throwAnim;
    if (A) {
      A.t += dt;
      if (!A.released && A.t >= SOLDIER_ANIM.throwRelease) {
        A.released = true;
        this.releaseGrenade(A.target);
      }
      if (A.t >= SOLDIER_ANIM.throwTime) this.throwAnim = null;
      return;
    }
    this.grenadeT -= dt;
    if (!this.has('grenade') || !weaponsFree || this.grenadeT > 0 || !this.target || g.allies.grenadeT > 0) return;
    const T = this.target;
    const G = ALLY.grenade;
    const d = this.pos.distanceTo(T.pos);
    this.grenadeT = rand(1.5, 3);
    if (d < G.range[0] || d > G.range[1]) return;
    if (T.pos.distanceTo(g.player.pos) < G.safe) return;
    for (const a of g.allies.list) if (a !== this && a.pos.distanceTo(T.pos) < G.safe) return;
    // Toplu düşman, mevzi ya da siper arkasına saklanmış yakın hedef (bomba onu yerinden çıkarır)
    let n = 0;
    for (const e of g.enemies.list) if (e.alive && e.pos.distanceTo(T.pos) < G.clusterRadius) n++;
    const hidden = !this.targetVisible && d < G.hiddenRange;
    if (!T.mount && n < G.cluster && !hidden) return;
    this.throwAnim = { t: 0, target: (T.mount ? T.mount.pivot(_v3) : T.pos).clone(), released: false };
    this.grenadeT = G.cooldown * rand(0.8, 1.3);
    g.allies.grenadeT = G.cooldown * 0.4;
    this.say('grenade', true);
  }

  releaseGrenade(target) {
    const g = this.game;
    const from = this.headPos(new THREE.Vector3());
    from.y += 0.2;
    const tgt = target.clone().add(new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1)));
    const dist = from.distanceTo(tgt);
    const t = clamp(dist / 14, 0.8, 1.7);
    const grav = 15;
    const vel = new THREE.Vector3((tgt.x - from.x) / t, (tgt.y - from.y) / t + 0.5 * grav * t, (tgt.z - from.z) / t);
    g.grenades.spawn(from, vel, rand(2.4, 2.9), 'ally');
  }

  // Düzen yerinin yakınında, düşmana dönük ve saklanınca görünmeyen siper
  pickCover() {
    const g = this.game;
    const T = this.target;
    if (!T) return;
    if (this.boundGoal) return; // sıçrama sürerken siperini koru
    const cands = g.nav.coversNear(this.slotGoal, 7);
    let best = null;
    let bestScore = -Infinity;
    let evals = 0;
    const head = T.eyePos(_v3);
    for (const c of cands) {
      if (c.taken && c.taken !== this) continue;
      const tx = T.pos.x - c.pos.x;
      const tz = T.pos.z - c.pos.z;
      const dT = Math.hypot(tx, tz);
      if (dT < 5 || (c.normal.x * tx + c.normal.z * tz) / dT < 0.3) continue;
      // Geriye çekilmesin: siper hedefe düzen yerinden daha uzak olmamalı
      if (dT > Math.hypot(T.pos.x - this.slotGoal.x, T.pos.z - this.slotGoal.z) + 1) continue;
      if (evals++ > 6) break;
      _v2.set(c.pos.x, 1.6, c.pos.z);
      if (!g.world.lineOfSight(_v2, head)) continue; // ayağa kalkınca hedefi görmeli
      const score = -c.pos.distanceTo(this.slotGoal) - c.pos.distanceTo(this.pos) * 0.3;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (best !== this.cover) {
      this.releaseCover();
      if (best) {
        this.cover = best;
        best.taken = this;
        this.path = null;
      }
    }
  }

  releaseCover() {
    if (this.cover && this.cover.taken === this) this.cover.taken = null;
    this.cover = null;
  }

  // Oyuncunun önünde, nişan konisinin içinde mi?
  inFireLane() {
    const P = this.game.player;
    const dx = this.pos.x - P.pos.x;
    const dz = this.pos.z - P.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 1 || d > 25) return false;
    const fx = -Math.sin(P.yaw);
    const fz = -Math.cos(P.yaw);
    return (dx * fx + dz * fz) / d > Math.cos(ALLY.fireLaneDeg * DEG);
  }

  followPath(goal, dt, speed) {
    const g = this.game;
    this.repathT -= dt;
    if (!this.path || (this.repathT <= 0 && this.pathGoal.distanceToSquared(goal) > 2.25)) {
      if (g.enemies.requestPath()) {
        this.path = g.nav.findPath(this.pos, goal);
        this.pathIdx = 0;
        this.pathGoal.copy(goal);
        this.repathT = 0.8;
      }
    }
    let wp = null;
    if (this.path && this.path.length) {
      wp = this.path[this.pathIdx];
      while (wp && Math.hypot(wp.x - this.pos.x, wp.z - this.pos.z) < 0.6) {
        this.pathIdx++;
        wp = this.path[this.pathIdx];
      }
      if (!wp) {
        // Yolun sonu ama hedef (oyuncu yürüdükçe) ilerlemiş: hemen yeni yol iste
        this.path = null;
        this.repathT = 0;
      }
    }
    // Yol yoksa (bütçe, yakın hedef) doğrudan yürü
    const t = wp || goal;
    const dx = t.x - this.pos.x;
    const dz = t.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    const s = d < 0.3 ? 0 : Math.min(speed, d * 4);
    this.vel.x = damp(this.vel.x, d > 1e-4 ? (dx / d) * s : 0, 8, dt);
    this.vel.z = damp(this.vel.z, d > 1e-4 ? (dz / d) * s : 0, 8, dt);
  }

  updateWeapon(dt, weaponsFree) {
    const g = this.game;
    const W = this.weapon;
    W.cooldown -= dt;
    this.reactT -= dt;
    if (W.reloadT > 0) {
      W.reloadT -= dt;
      if (W.reloadT <= 0) W.mag = this.C.magSize;
      return;
    }
    if (this.boundGoal && this.horizSpeed > 2) return; // sıçrarken ateş etmez, koşar
    if (W.mag <= 0) {
      W.reloadT = this.C.reload;
      g.audio.mech('magOut', this.pos);
      if (this.target || this.suppress) this.say('reload');
      return;
    }
    // Baskı ateşi: görünür hedef gerekmez, alana sürekli seri
    const sup = this.suppress;
    const T = sup ? this.areaTarget(sup.pos) : this.target;
    if (!weaponsFree || !T || (!sup && (!this.targetVisible || this.reactT > 0))) {
      W.burstLeft = 0;
      return;
    }
    const facing = Math.abs(angleDiff(this.yaw, dirToYaw(T.pos.x - this.pos.x, T.pos.z - this.pos.z))) < 0.35;
    if (!facing) return;
    if (W.burstLeft <= 0) {
      W.gapT -= dt;
      if (W.gapT <= 0) {
        // Mevziye bastırma ya da baskı emri: uzun, sık seriler
        const long = sup || (T.mount && this.has('suppress'));
        const b = long ? ALLY.suppress.burst : this.C.burst;
        const gap = long ? ALLY.suppress.gap : this.S.burstGap;
        W.burstLeft = Math.round(rand(b[0], b[1]));
        W.gapT = rand(gap[0], gap[1]);
      }
    }
    let n = 0;
    while (W.burstLeft > 0 && W.cooldown <= 0 && W.mag > 0 && n < 3) {
      this.shoot(T);
      W.burstLeft--;
      W.mag -= sup ? O.suppressAmmoMult : 1; // baskı ateşi cephaneyi daha hızlı tüketir
      W.cooldown += 60 / this.C.rpm;
      n++;
    }
    if (sup) this.applySuppression(sup.pos);
    if (W.cooldown < -0.2) W.cooldown = 0;
  }

  // Baskı alanı için sahte hedef (ateş kodu hedeften yalnız konum ister)
  areaTarget(p) {
    const A = (this._area ||= { pos: new THREE.Vector3(), alive: true, mount: null, area: true, chestPos: (o) => o.copy(A.pos), eyePos: (o) => o.copy(A.pos) });
    A.pos.copy(p);
    return A;
  }

  // Baskı alanındaki düşmanlar eğilir ve isabetleri düşer (makineli tüfekçide alan daha geniş)
  applySuppression(p) {
    const g = this.game;
    const r = O.suppressRadius * (this.member.suppressMult || 1);
    for (const e of g.enemies.list) {
      if (!e.alive || e.dummy || e.pos.distanceTo(p) > r) continue;
      e.aimPenaltyUntil = g.time + O.suppressHold;
      e.aimPenalty = O.suppressAimMult;
      e.suppress?.();
    }
  }

  shoot(T) {
    const g = this.game;
    g.allies.shots++;
    const muzzle = this.model.muzzleWorld(_v).clone();
    // Mevzi nişancısı kalkanın arkasında: kafasına (kalkanın üstüne) nişan alınır
    const aim = T.mount || Math.random() < 0.2 ? T.eyePos(_v2) : T.chestPos(_v2);
    const base = _d.subVectors(aim, muzzle);
    const dist = base.length();
    base.divideScalar(dist);
    let err = this.S.aimDeg * (0.6 + dist / 40) * (this.horizSpeed > 1 ? 1.5 : 1);
    if ((T.mount && this.has('suppress')) || T.area) err = Math.max(err, ALLY.suppress.aimDeg * (0.6 + dist / 60));
    const dir = randomInCone(base, err * DEG, new THREE.Vector3(), 0.8);
    const wh = g.world.raycast(muzzle, dir, this.C.range, _hit);
    const eh = g.enemies.raycast(muzzle, dir, wh ? wh.dist : this.C.range);
    let end;
    if (eh?.armor) {
      if (muzzle.distanceTo(g.camera.position) < 90) g.effects.impact(eh.point, eh.normal, 'metal', 0.5);
      end = eh.point;
    } else if (eh && eh.enemy.alive) {
      const dmg = this.S.damage * this.C.damageMult * (ALLY.zones[eh.zone] || 1);
      const out = eh.enemy.takeDamage(dmg, { zone: eh.zone, dir, point: eh.point, source: 'ally', attacker: this, weapon: 'allyRifle' });
      g.effects.impact(eh.point, _v3.copy(dir).negate(), 'flesh', 0.5);
      if (out.killed) {
        g.events.emit('allyKill', this, eh.enemy);
        this.say('kill');
      }
      end = eh.point;
    } else if (wh) {
      if (muzzle.distanceTo(g.camera.position) < 90) g.effects.impact(wh.point, wh.normal, wh.surface, 0.5);
      if (wh.collider?.owner?.onShot) wh.collider.owner.onShot(this.S.damage, wh.point);
      end = wh.point;
    } else end = _v3.copy(muzzle).addScaledVector(dir, Math.min(80, this.C.range));
    if (Math.random() < 0.5) g.effects.tracer(muzzle, end, 320, 0.018);
    if (muzzle.distanceTo(g.camera.position) < 80) {
      g.effects.enemyMuzzle(muzzle, dir);
      g.effects.flashLight(muzzle, 0xffc070, 14, 5, 0.04);
    }
    g.audio.gunshot('rifle2', muzzle);
    g.makeNoise(this.pos, ALLY.noise, 'gunshot');
    g.enemies.bulletNearMiss(muzzle, dir, eh ? eh.dist : wh ? wh.dist : this.C.range, this);
    this.model.fire(0.8);
  }

  dispose() {
    this.releaseCover();
    this.model.dispose();
  }
}

function pushApart(a, p, r) {
  const dx = a.pos.x - p.x;
  const dz = a.pos.z - p.z;
  const d2 = dx * dx + dz * dz;
  if (d2 < r * r && d2 > 1e-6 && Math.abs(p.y - a.pos.y) < 1.5) {
    const d = Math.sqrt(d2);
    a.pos.x += (dx / d) * (r - d);
    a.pos.z += (dz / d) * (r - d);
  }
}

// Manga: doğurma, yeniden toplama, dost ateşi ışın testi, düşmanlara görünürlük
export class AllyManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.sayT = 0;
    this.shots = 0; // test ve istatistik için: mangadan çıkan mermi sayısı
    this.weaponsFree = false;
    this.alert = false;
    this._seen = { ally: null, dist: 0 };
    this.tier = ALLY_TIERS[1];
    this.tactics = new Set();
    this.boundTurn = 0;
    this.boundT = 0;
    this.grenadeT = 0;
    this.calloutT = 0;
    this.flanker = null;
    this.rescue = { reviver: null, decision: 'none', best: null, dist: 0 };
    this.rescueT = 0;
    this.cannotSayT = 0;
    this.smokeT = 0;
    this.reviveTraining = 1;
    this.kindAt = new Map(); // replik türü → son söylendiği oyun saati (aynı tür 10 sn kuralı)
    this.warned = new WeakSet(); // uyarısı yapılmış düşman el bombaları
  }

  has(tac) {
    return this.tactics.has(tac);
  }

  // tier: 1–5 (LEVELS → allyTier). Değerler ve açık taktikler ALLY_TIERS'tan
  spawnSquad(n, pos, yaw, tier = 1) {
    this.clear();
    const g = this.game;
    this.tier = ALLY_TIERS[tier] || ALLY_TIERS[1];
    this.tactics = new Set(this.tier.tactics);
    this.boundT = 0;
    this.grenadeT = 0;
    this.calloutT = 0;
    this.flanker = null;
    this.rescue = { reviver: null, decision: 'none', best: null, dist: 0 };
    this.rescueT = 0;
    this.kindAt.clear();
    // Muharebe Medik Eğitimi (mağaza): tüm canlandırma süreleri kısalır
    const up = g.save?.data.inventory.upgrades || [];
    this.reviveTraining = STORE.upgrades.filter((u) => u.reviveTimeMult && up.includes(u.id)).reduce((m, u) => m * u.reviveTimeMult, 1);
    for (let i = 0; i < n; i++) {
      const [ox, oz] = ALLY.slots[i % ALLY.slots.length];
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      _v.set(pos.x + c * ox + s * oz, pos.y, pos.z - s * ox + c * oz);
      if (g.nav && !g.nav.isWalkable(_v.x, _v.z)) _v.copy(pos);
      this.list.push(new Ally(g, i, _v, yaw));
    }
  }

  // Kan kaybından ölen askerler bir sonraki kontrol noktasında geri gelir (revive.json → allyRespawnAtCheckpoint)
  respawnDead(pos, yaw) {
    if (!REVIVE.allyRespawnAtCheckpoint) return 0;
    let n = 0;
    this.list.forEach((a, i) => {
      if (!a.dead) return;
      const [ox, oz] = ALLY.slots[i % ALLY.slots.length];
      _v.set(pos.x + Math.cos(yaw) * ox + Math.sin(yaw) * oz, pos.y, pos.z - Math.sin(yaw) * ox + Math.cos(yaw) * oz);
      if (!this.game.nav.isWalkable(_v.x, _v.z)) _v.copy(pos);
      a.reset(_v, yaw);
      n++;
    });
    return n;
  }

  // Oyuncu yerdeyken (§7.4): her 0,5 sn'de her asker için yardım puanı; en iyisi kararına göre canlandırır,
  // diğerleri tehdidi bastırır. Kimse gelemiyorsa telsizle bildirir.
  updateRescue(dt) {
    const g = this.game;
    const P = g.player;
    const R = this.rescue;
    if (!P.down) {
      R.reviver = null;
      R.decision = 'none';
      for (const a of this.list) a.rescueT = 0;
      return;
    }
    // Canlandırıcı uzaklaştıysa ya da değiştiyse sayaç yeniden işler
    if (P.reviver && (P.reviver !== R.reviver || P.reviver.down || P.reviver.pos.distanceTo(P.pos) > REVIVE.reviveRange + 0.8)) {
      P.reviver.rescueT = 0;
      P.reviver = null;
      P.reviveK = 0;
    }
    this.rescueT -= dt;
    this.cannotSayT -= dt;
    this.smokeT -= dt;
    if (this.rescueT > 0) return;
    this.rescueT = REVIVE.reevaluateIntervalSec;
    // Yerdekini gören düşmanlar (tehdit)
    const threats = [];
    const head = P.headPos(_v2);
    for (const e of g.enemies.list) {
      if (!e.alive || e.dummy || e.pos.distanceTo(P.pos) > REVIVE.assist.threatRange) continue;
      if (threats.length < 5 && g.world.lineOfSight(e.eyePos(_v3), head)) threats.push(e);
    }
    let best = null;
    let bestScore = -Infinity;
    for (const a of this.list) {
      if (a.down || a.dead) {
        a.assist = null;
        continue;
      }
      const path = g.nav.findPath(a.pos, P.pos);
      let len = null;
      let exposed = 0;
      if (path?.length) {
        len = 0;
        let prev = a.pos;
        for (const p of path) {
          len += Math.hypot(p.x - prev.x, p.z - prev.z);
          prev = p;
          if (threats.some((e) => g.world.lineOfSight(e.eyePos(_v3), _v.set(p.x, 1.2, p.z)))) exposed++;
        }
        const end = path[path.length - 1];
        if (Math.hypot(end.x - P.pos.x, end.z - P.pos.z) > 2.5) len = null;
      }
      const score = assistScore({
        pathLen: len,
        threats: threats.length,
        exposure: path?.length ? exposed / path.length : 0,
        underFire: g.time - a.lastHurt < 2,
        healthPct: a.health.hp / a.health.max,
        medic: a.role === 'medic',
        calledHelp: P.time < P.calledHelpUntil,
        bleedLeft: P.bleed?.left ?? Infinity,
      });
      a.assist = { score, decision: assistDecision(score) };
      if (score > bestScore) {
        bestScore = score;
        best = a;
      }
    }
    const decision = best ? assistDecision(bestScore) : 'none';
    // Canlandırıcı değişmedikçe (ve kesilmedikçe) aynı kalır: yolun yarısında başkası seçilmesin
    const keep = R.reviver && !R.reviver.down && R.reviver.assist?.decision === 'direct';
    if (!keep) {
      const next = decision === 'direct' ? best : null;
      if (next && next !== R.reviver) {
        // Emrini bırakan asker bunu söyler (§7.4)
        next.sayLine(next.voice(next.order.id !== 'FOLLOW' ? 'holdOnPlayer' : 'playerDowned'), true, true);
      }
      R.reviver = next;
    }
    R.decision = R.reviver ? 'direct' : decision;
    R.best = best;
    R.dist = best ? best.pos.distanceTo(P.pos) : 0;
    // Diğerleri tehdidi bastırır; önce temizlemek gerekiyorsa bir sis bombası komutanın yanına
    for (const a of this.list) {
      if (a.down || a === R.reviver || !threats.length) continue;
      const t = threats[0];
      a.suppress = { pos: t.pos.clone().setY(1.2), until: g.time + REVIVE.reevaluateIntervalSec * 2, cmd: null };
    }
    if (threats.length && (R.decision === 'clearFirst' || R.reviver) && this.smokeT <= 0 && best) {
      this.smokeT = 15;
      const from = best.headPos(new THREE.Vector3());
      const to = P.pos.clone();
      const t = clamp(from.distanceTo(to) / 14, 0.6, 1.6);
      g.grenades.spawn(from, new THREE.Vector3((to.x - from.x) / t, (to.y - from.y) / t + 0.5 * 15 * t, (to.z - from.z) / t), 1.2, 'ally', 'smoke');
      best.say('grenade', true, 'Sis atıyorum, komutanın yanına!');
    }
    // Gidemiyor ya da önce temizlemek gerekiyor: komutana söylenir ("Ateş altındayız, ulaşamıyorum!", §12/4)
    if ((R.decision === 'cannot' || R.decision === 'clearFirst') && best && this.cannotSayT <= 0) {
      this.cannotSayT = 8;
      best.sayLine(best.voice('cannotReach'), true, true);
    }
  }

  // Kontrol noktasında ya da hedef atlanınca manga oyuncunun arkasında yeniden toplanır
  regroup(pos, yaw) {
    const g = this.game;
    this.list.forEach((a, i) => {
      const [ox, oz] = ALLY.slots[i % ALLY.slots.length];
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      _v.set(pos.x + c * ox + s * oz, pos.y, pos.z - s * ox + c * oz);
      if (!g.nav.isWalkable(_v.x, _v.z)) _v.copy(pos);
      a.reset(_v, yaw);
    });
  }

  clear() {
    for (const a of this.list) a.dispose();
    this.list = [];
    this.flanker = null;
  }

  // Oyuncuya göre saat yönü ve 5 m'ye yuvarlanmış mesafe (telsiz replikleri için)
  clockOf(pos) {
    const P = this.game.player;
    const rel = angleDiff(P.yaw, dirToYaw(pos.x - P.pos.x, pos.z - P.pos.z));
    const h = ((Math.round(-rel / (Math.PI / 6)) % 12) + 12) % 12;
    return { dir: CLOCK[h], dist: Math.max(5, Math.round(pos.distanceTo(P.pos) / 5) * 5) };
  }

  // Gelen düşman el bombası: en yakın sağlam asker bir kez uyarır (acil replik, kuyruğu atlar)
  warnGrenades() {
    const g = this.game;
    for (const nade of g.grenades.dangerNear(g.player.pos, VOICE.grenadeWarnDist)) {
      if (this.warned.has(nade)) continue;
      this.warned.add(nade);
      const a = this.list.filter((x) => !x.down).sort((x, y) => x.pos.distanceTo(nade.pos) - y.pos.distanceTo(nade.pos))[0];
      if (a) a.say('incoming');
    }
  }

  // Düşman bildirme: "Kartal-3: Düşman, saat 2 yönünde, 30 metre!" + HUD'da kısa süreli işaret
  callout(ally, enemy) {
    const g = this.game;
    if (this.calloutT > 0) return;
    this.calloutT = ALLY.callout.cooldown;
    const P = g.player;
    const rel = angleDiff(P.yaw, dirToYaw(enemy.pos.x - P.pos.x, enemy.pos.z - P.pos.z));
    const h = ((Math.round(-rel / (Math.PI / 6)) % 12) + 12) % 12;
    const m = Math.round(enemy.pos.distanceTo(P.pos) / 5) * 5;
    const what = enemy.mount?.calloutName || (enemy.type === 'sniper' ? 'Keskin nişancı' : 'Düşman');
    ally.say('contact', true, `${what}, saat ${CLOCK[h]} yönünde, ${m} metre!`);
    g.events.emit('allyMark', enemy, ALLY.callout.markTime);
  }

  // Mevzi ilk kez ateş açtı (enemy.js çağırır): kademeye göre manga tepki verir (bildir, kanada dolan)
  // Tank oyuncuyu gördü: manga bildirir (roketatar ya da C4 gerekir)
  onTank() {
    const alive = this.list.filter((a) => !a.down);
    if (!alive.length) return;
    this.game.mission?.radio(alive[0].name, 'Tank! Siper alın, mermi işlemez. Roketatar ya da C4 lazım!', 0, 'ally');
  }

  onHmgFire(nest) {
    const g = this.game;
    const alive = this.list.filter((a) => !a.down);
    if (!alive.length) return;
    if (this.has('callout')) {
      this.calloutT = 0;
      this.callout(alive[0], nest.gunner);
    } else g.mission?.radio(alive[0].name, `${nest.calloutName || 'Ağır makineli'}! Siper alın!`, 0, 'ally');
    if (this.has('flank') && !this.flanker) {
      // Oyuncudan en uzakta olmayan, yakındaki dost dolanır; diğerleri bastırır
      const cand = alive.slice().sort((a, b) => a.pos.distanceTo(nest.pos) - b.pos.distanceTo(nest.pos))[0];
      if (cand.pos.distanceTo(nest.pos) < 70 && cand.startFlank(nest)) this.flanker = cand;
    }
  }

  update(dt) {
    const g = this.game;
    this.sayT -= dt;
    // Silahlar serbest: bir düşman çatışmada ya da oyuncu az önce ateş etti
    let combat = false;
    let alert = false;
    for (const e of g.enemies.list) {
      if (!e.alive || e.dummy) continue;
      if (e.aiState === 'combat') {
        combat = true;
        break;
      }
      if (e.aiState === 'investigate' || e.aiState === 'search') alert = true;
    }
    this.weaponsFree = combat || g.time - (g.lastPlayerShot ?? -100) < ALLY.fireFollow;
    this.alert = alert || this.weaponsFree;
    this.calloutT -= dt;
    this.grenadeT -= dt;
    this.warnGrenades();
    // Sıçramalı ilerleme: çift/tek numaralılar sırayla atılır, diğerleri örter
    if (this.has('bound')) {
      this.boundT -= dt;
      if (this.boundT <= 0) {
        this.boundT = ALLY.bound.cover + rand(2.5, 4);
        this.boundTurn = 1 - this.boundTurn;
      }
    }
    // Kurtarma: oyuncu yerdeyse canlandırıcı seçimi
    this.updateRescue(dt);
    // Ayıltma: yerdeki her dosta en yakın sağlam dost atanır (komutanı canlandıran hariç)
    {
      for (const d of this.list) {
        if (!d.down || d.dead || this.list.some((a) => a.reviving === d)) continue;
        let best = null;
        let bestD = ALLY.revive.range;
        for (const a of this.list) {
          if (a.down || a.reviving || a.flanking || a === this.rescue.reviver) continue;
          const dd = a.pos.distanceTo(d.pos);
          if (dd < bestD) {
            bestD = dd;
            best = a;
          }
        }
        if (best) {
          best.reviving = d;
          best.reviveT = 0;
          best.say('revive', true);
        }
      }
    }
    for (const a of this.list) a.update(dt);
    // Oyuncu ve düşmanlarla iç içe girme: dost kenara itilir (oyuncu itilmez, kontrol onda kalsın)
    const P = g.player;
    for (const a of this.list) {
      pushApart(a, P.pos, 0.75);
      for (const e of g.enemies.list) if (e.alive) pushApart(a, e.pos, 0.75);
    }
  }

  // Baskı ateşi altındaki düşman mı? (bonus görev "Baskı Ustası" için ENEMY_KILLED yükü)
  isSuppressing(enemy) {
    return (enemy.aimPenaltyUntil || 0) > this.game.time;
  }

  // Düşmanın görebileceği en yakın dost (yalnızca en yakın aday için görüş testi)
  visibleTo(enemy, eye, range, fovHalf, inCombat) {
    const g = this.game;
    let best = null;
    let bestD = range;
    for (const a of this.list) {
      if (a.down) continue;
      const d = eye.distanceTo(a.pos);
      if (d >= bestD) continue;
      const off = Math.abs(angleDiff(enemy.lookYaw, dirToYaw(a.pos.x - eye.x, a.pos.z - eye.z)));
      if (off > fovHalf && d > 3.5 && !(inCombat && d < 30)) continue;
      best = a;
      bestD = d;
    }
    if (!best) return null;
    if (!g.world.canSee(eye, best.headPos(_v2)) && !g.world.canSee(eye, best.chestPos(_v2))) return null;
    this._seen.ally = best;
    this._seen.dist = bestD;
    return this._seen;
  }

  // Oyuncu mermisi için: ışın bir dosta değiyor mu? {ally, dist, point}
  raycast(o, d, maxD) {
    let best = null;
    let bestD = maxD;
    for (const a of this.list) {
      _v.set(a.pos.x, a.pos.y + 1.0, a.pos.z).sub(o);
      const t = _v.dot(d);
      if (t < -1 || t > bestD + 1.5) continue;
      if (_v.lengthSq() - t * t > 1.8) continue;
      _ray.set(o, d);
      _ray.far = bestD;
      const hits = _ray.intersectObjects(a.model.meshes, false);
      if (hits.length && hits[0].distance < bestD) {
        bestD = hits[0].distance;
        best = { ally: a, dist: bestD, point: hits[0].point };
      }
    }
    return best;
  }
}
