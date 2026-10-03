// HUD: olaylarla güncellenen paneller (can, cephane, hedef, telsiz) ve kare başına
// konuma bağlı öğeler (nişangah, pusula, işaretçiler, mini harita, hasar yönü, düşman farkındalık ikonları).
import * as THREE from 'three';
import { DEG, clamp } from './util.js';
import { WEAPONS, MAPS, ALLY_TIERS, BALANCE, ENEMY_TYPES } from './config.js';
import { weaponName, weaponShortName } from './weaponInfo.js';
import { itemIcon } from './storeIcons.js';
import { BINDINGS, keyName } from './input.js';
import { REVIVE } from './downed.js';
import { EV } from './events.js';
import { COMMANDS } from './commands.js';
import { CMD_ICONS } from './commandWheel.js';

const CMD_ICON_SEC = 3; // komut simgesinin askerin başında kalma süresi (oyun saati)

const REVIVE_DARK = REVIVE.darkenLastSec; // son saniyelerde ekran kararır

const $ = (id) => document.getElementById(id);
const _v = new THREE.Vector3();
const ALLY_TAG_RANGE = 70; // dost isim etiketinin görüldüğü en uzak mesafe (m)

const MODE_LABEL = { auto: 'OTOMATİK', burst: '3\'LÜ SERİ', semi: 'TEK ATIŞ' };
const CARD = [
  [0, 'K'], [45, 'KD'], [90, 'D'], [135, 'GD'], [180, 'G'], [225, 'GB'], [270, 'B'], [315, 'KB'],
];

// Asker satırındaki emir etiketi: saldırı/baskı hareket emrinden önce gösterilir
const ORDER_LABEL = { FOLLOW: 'Takip', HOLD: 'Pozisyon', MOVE_TO: 'İlerliyor', TAKE_COVER: 'Siper', CLEAR_AREA: 'Temizlik', HEAL_PLAYER: 'Tedavi' };
function orderLabel(a) {
  let t = a.suppress ? 'Baskı' : a.focus ? 'Saldırı' : a.order.id === 'MOVE_TO' && a.order.arrived ? 'Pozisyonda' : ORDER_LABEL[a.order.id] || '';
  if (a.holdFire) t += ' · ateş kesik';
  return t;
}

export class HUD {
  constructor(game) {
    this.game = game;
    this.root = $('hud');
    this.el = {
      crosshair: $('crosshair'), chT: null, hit: $('hitmarker'), vignette: $('vignette'), dead: $('dead'),
      objNum: $('objNum'), objTitle: $('objTitle'), objDetail: $('objDetail'), objective: $('objective'),
      hpVal: $('hpVal'), hpBar: $('hpBar'), health: $('health'),
      armorRow: $('armorRow'), arVal: $('arVal'), arBar: $('arBar'), helmIcon: $('helmIcon'), visor: $('visor'),
      wName: $('wName'), wMode: $('wMode'), aMag: $('aMag'), aRes: $('aRes'), ammo: $('ammo'), nades: $('nades'),
      reloadHint: $('reloadHint'), radio: $('radio'), message: $('message'), feed: $('feed'),
      interact: $('interact'), interactText: $('interactText'), interactBar: $('interactBar'), interactKey: $('interactKey'),
      markers: $('markers'), icons: $('icons'), dmgNums: $('dmgNums'), dmgDirs: $('dmgDirs'), grenadeWarn: $('grenadeWarn'),
      compassStrip: $('compassStrip'), compassObj: $('compassObj'), compass: $('compass'),
      minimap: $('minimap'), scoreVal: $('scoreVal'), fps: $('fps'), intro: $('introCard'), tbUse: $('tbUse'), tbAds: $('tbAds'),
      slots: $('slots'), kit: $('kit'), squad: $('squad'), downed: $('downed'), dnRing: $('dnRing'), dnRevive: $('dnRevive'), dnTime: $('dnTime'),
      dnStatus: $('dnStatus'), dnHint: $('dnHint'), dnPulse: $('dnPulse'), dnDark: $('dnDark'), game: $('game'), tbItems: [$('tbItem1'), $('tbItem2')], scope: $('scope'), breathBar: $('scopeBreathBar'), breathText: $('scopeBreathText'),
    };
    this.ch = {
      t: this.el.crosshair.querySelector('.t'), b: this.el.crosshair.querySelector('.b'),
      l: this.el.crosshair.querySelector('.l'), r: this.el.crosshair.querySelector('.r'),
    };
    this.buildCompass();
    this.markerPool = [];
    this.iconPool = [];
    this.allyPool = [];
    this.ffT = 0;
    this.dmgDirPool = [];
    for (let i = 0; i < 6; i++) {
      const d = document.createElement('div');
      d.className = 'dmgdir';
      this.el.dmgDirs.appendChild(d);
      this.dmgDirPool.push({ el: d, t: 0, ang: 0 });
    }
    this.gwarnPool = [];
    this.numPool = [];
    this.radioT = 0;
    this.miniT = 0;
    this.fpsAcc = 0;
    this.fpsN = 0;
    this.lastHp = -1;
    this.bind();
  }

  bind() {
    const E = this.game.events;
    E.on('health', (hp, max) => this.setHealth(hp, max));
    E.on('armor', (a, hit) => this.setArmor(a, hit));
    E.on('ammo', (w) => this.setAmmo(w));
    E.on('weapon', (w) => {
      this.setAmmo(w);
      this.setSlots();
    });
    E.on('slots', () => this.setSlots());
    E.on('fireMode', (w) => this.setAmmo(w));
    E.on('grenades', (n) => this.setNades(n));
    E.on('kit', (slots, using) => this.setKit(slots, using));
    E.on('hitmarker', (kind, headKill) => this.hitmarker(kind, headKill));
    E.on('damageDir', (ang) => this.damageDir(ang));
    E.on('objective', (o) => this.setObjective(o));
    E.on('objectiveNew', () => {
      this.el.objective.classList.remove('flash');
      void this.el.objective.offsetWidth;
      this.el.objective.classList.add('flash');
    });
    E.on('radio', (text, who) => this.radio(text, who));
    E.on('message', (text, kind) => this.message(text, kind));
    E.on('score', (pts, label, head) => this.feed(`+${pts}  ${label}`, head));
    E.on('pickup', (text) => this.feed(text, false));
    E.on('interact', (target, k) => this.setInteract(target, k));
    E.on('noAmmo', () => this.message('CEPHANE YOK', 'warn'));
    // Mevzi ateş açtı: bir kez büyük uyarı; mini haritada kalıcı işaret
    E.on('hmgFire', (m) => this.message(m?.warnText || 'AĞIR MAKİNELİ ATEŞİ · SİPER AL', 'warn'));
    E.on('tankSpotted', () => this.message('TANK! · ROKETATAR YA DA C4 KULLAN', 'warn'));
    // Komutu alan askerin başında kısa süre komut simgesi (çağrı kodu → { text, until })
    this.cmdTags = new Map();
    E.on(EV.COMMAND_ISSUED, (p) => {
      const text = `${CMD_ICONS[p.commandId] || '•'} ${COMMANDS[p.commandId]?.label || ''}`;
      const until = this.game.time + CMD_ICON_SEC;
      for (const cs of p.addressees || []) this.cmdTags.set(cs, { text, until });
    });
    // Dostun bildirdiği düşman kısa süre işaretli kalır
    this.marks = new Map();
    E.on('allyMark', (enemy, time) => this.marks.set(enemy, this.game.time + time));
    E.on('friendlyFire', () => {
      // Dost asker vuruldu: uyarı sık sık tekrarlanmasın
      if (this.game.time - this.ffT < 2) return;
      this.ffT = this.game.time;
      this.message('DOST ASKER · ATEŞ ETME', 'warn');
    });
  }

  show(on) {
    this.root.hidden = !on;
  }

  // Yeni seviye: önceki seviyeden kalan telsiz yazısı, mesaj, işaretler ve etiketler görünmesin
  resetTransient() {
    this.radioT = 0;
    this.el.radio.className = '';
    this.el.message.className = '';
    this.marks.clear();
    this.cmdTags.clear();
    for (const el of [...this.allyPool, ...this.iconPool, ...this.markerPool]) el.hidden = true;
  }

  applySettings(S) {
    this.el.crosshair.style.setProperty('--ch', S.crosshairColor);
    this.el.fps.hidden = !S.showFps;
  }

  buildCompass() {
    const strip = this.el.compassStrip;
    strip.innerHTML = '';
    this.pxPerDeg = 2.4;
    for (let rep = -1; rep <= 1; rep++) {
      for (let d = 0; d < 360; d += 15) {
        const x = (d + rep * 360) * this.pxPerDeg;
        const card = CARD.find((c) => c[0] === d);
        const s = document.createElement('span');
        if (card) {
          s.className = 'card';
          s.textContent = card[1];
        } else if (d % 45 === 0) s.textContent = d;
        else s.className = 'tick';
        s.style.left = `${x}px`;
        strip.appendChild(s);
      }
    }
  }

  setHealth(hp, max) {
    const r = hp / max;
    const v = Math.ceil(hp);
    if (v !== this.lastHp) {
      this.lastHp = v;
      this.el.hpVal.textContent = v;
      this.el.hpBar.style.width = `${r * 100}%`;
      this.el.health.classList.toggle('low', r < 0.35);
    }
    this.el.vignette.style.opacity = r < 0.6 ? String(clamp((0.6 - r) / 0.45, 0, 1)) : '0';
  }

  // Zırh çubuğu: gövde zırhının ZP'si; kask simgesi kaskın doluluğuna göre (aşınınca soluk)
  setArmor(a, hit = false) {
    const E = this.el;
    const has = !!a && !a.empty;
    E.armorRow.hidden = !has;
    E.visor.hidden = !a?.helmet?.def.visor;
    if (!has) return;
    const b = a.body;
    const pts = b ? b.points : 0;
    E.arVal.textContent = b ? Math.ceil(pts) : '—';
    E.arBar.style.width = b ? `${(pts / b.max) * 100}%` : '0%';
    E.armorRow.classList.toggle('broken', !!b && pts <= 0);
    E.helmIcon.hidden = !a.helmet;
    if (a.helmet) {
      E.helmIcon.classList.toggle('worn', a.helmet.points < a.helmet.max * 0.5);
      E.helmIcon.style.opacity = String(0.35 + 0.65 * (a.helmet.points / a.helmet.max));
    }
    if (hit) {
      E.armorRow.classList.remove('flash');
      void E.armorRow.offsetWidth;
      E.armorRow.classList.add('flash');
      clearTimeout(this.armorFlashT);
      this.armorFlashT = setTimeout(() => E.armorRow.classList.remove('flash'), 140);
    }
  }

  setAmmo(w) {
    if (!w) return;
    const d = w.data;
    const inf = this.game.cheats.infiniteAmmo;
    this.el.wName.textContent = weaponName(d.id);
    this.el.wMode.textContent = `${d.kind} · ${MODE_LABEL[w.mode]}`;
    this.el.aMag.textContent = inf ? '∞' : w.mag;
    this.el.aRes.textContent = `/ ${w.reserve}`;
    const low = w.mag === 0 || (d.magSize > 3 && w.mag <= Math.ceil(d.magSize * 0.25));
    this.el.ammo.classList.toggle('low', low);
    const hint = this.el.reloadHint;
    if (w.mag === 0 && w.reserve === 0) {
      hint.textContent = 'CEPHANE YOK · SİLAH DEĞİŞTİR';
      hint.className = 'on warn';
    } else if (low && w.reserve > 0) {
      hint.textContent = this.game.input.touch.active ? 'ŞARJÖR DEĞİŞTİR' : 'R · ŞARJÖR DEĞİŞTİR';
      hint.className = 'on';
    } else hint.className = '';
  }

  // Taşınan silahlar: görevde "1 AR-7 · 2 P-9", poligonda kısa ipucu
  setSlots() {
    const W = this.game.weapons;
    const box = this.el.slots;
    box.innerHTML = '';
    if (!W || !W.slots) return;
    if (W.slots.length > 3) {
      const s = document.createElement('span');
      s.textContent = `1–${W.slots.length} silah değiştir`;
      box.appendChild(s);
      return;
    }
    W.slots.forEach((id, i) => {
      const s = document.createElement('span');
      if (id === W.currentId) s.className = 'on';
      const k = document.createElement('kbd');
      k.textContent = i + 1;
      s.append(k, document.createTextNode(weaponShortName(id)));
      box.appendChild(s);
    });
  }

  // Sarf yuvaları (kit.js): tuş, simge, ad ve adet; takılırken dolan çubuk. Dokunmatikte iki düğme.
  setKit(slots, using) {
    const box = this.el.kit;
    if (!box) return;
    if (!this.kitBuilt) {
      this.kitBuilt = true;
      this.kitEls = [0, 1].map((i) => {
        const s = document.createElement('div');
        s.className = 'kslot';
        const k = document.createElement('kbd');
        const ic = document.createElement('i');
        const n = document.createElement('b');
        const bar = document.createElement('u');
        s.append(k, ic, n, bar);
        box.appendChild(s);
        return { s, k, ic, n, bar, id: null };
      });
    }
    const any = slots.some(Boolean);
    box.hidden = !any;
    slots.forEach((slot, i) => {
      const e = this.kitEls[i];
      if (!e) return;
      e.s.hidden = !slot;
      const tb = this.el.tbItems[i];
      if (tb) tb.hidden = !slot;
      if (!slot) return;
      if (e.id !== slot.id) {
        e.id = slot.id;
        e.ic.innerHTML = itemIcon(slot.id, 'consumable');
        e.s.title = slot.def.name;
        if (tb) tb.innerHTML = `${itemIcon(slot.id, 'consumable')}<b></b>`;
      }
      e.k.textContent = keyName(BINDINGS[`useItem${i + 1}`]?.[0] || '');
      e.n.textContent = `×${slot.left}`;
      e.s.classList.toggle('empty', slot.left <= 0);
      const busy = using && using.slot === i;
      e.s.classList.toggle('busy', !!busy);
      e.bar.style.transform = `scaleX(${busy ? Math.min(1, using.t / using.dur) : 0})`;
      if (tb) {
        tb.querySelector('b').textContent = slot.left;
        tb.classList.toggle('empty', slot.left <= 0);
      }
    });
  }

  setNades(n) {
    const box = this.el.nades;
    box.innerHTML = '';
    // Satın alınmış bombalar görevin verdiği dört taneyi aşabilir
    for (let i = 0; i < Math.max(4, n); i++) {
      const g = document.createElement('i');
      if (i >= n) g.className = 'off';
      box.appendChild(g);
    }
  }

  setObjective(o) {
    this.el.objNum.textContent = o.total ? `${o.index}/${o.total}` : '';
    this.el.objTitle.textContent = o.title;
    this.el.objDetail.textContent = o.detail || '';
    this.el.objDetail.hidden = !o.detail;
  }

  hitmarker(kind, headKill) {
    const h = this.el.hit;
    h.className = '';
    void h.offsetWidth;
    h.className = `show ${kind === 'kill' ? 'kill' : kind === 'head' || headKill ? 'head' : kind === 'armor' ? 'armor' : ''}`;
  }

  damageDir(ang) {
    const d = this.dmgDirPool.find((x) => x.t <= 0) || this.dmgDirPool[0];
    d.t = 1.3;
    d.ang = ang;
  }

  // Ortadaki altyazı yalnız karargâh ve düşman telsizi için; komutan, tim ve sistem satırları sol alttaki
  // telsiz kutusunda (radioChat.js)
  radio(text, who) {
    if (who === 'player' || who === 'squad' || who === 'ally' || who === 'system') return;
    const i = text.indexOf(':');
    const el = this.el.radio;
    el.innerHTML = '';
    if (i > 0) {
      const b = document.createElement('b');
      b.textContent = text.slice(0, i + 1);
      el.appendChild(b);
      el.appendChild(document.createTextNode(text.slice(i + 1)));
    } else el.textContent = text;
    el.className = `on ${who === 'enemy' ? 'enemy' : who === 'ally' ? 'ally' : ''}`;
    this.radioT = Math.max(3.5, text.length * 0.065);
  }

  message(text, kind = '') {
    const m = this.el.message;
    m.textContent = text;
    m.className = '';
    void m.offsetWidth;
    m.className = `on ${kind}`;
  }

  feed(text, head) {
    const d = document.createElement('div');
    d.textContent = text;
    if (head) d.className = 'head';
    this.el.feed.appendChild(d);
    setTimeout(() => d.remove(), 1850);
    while (this.el.feed.children.length > 4) this.el.feed.firstChild.remove();
  }

  setInteract(target, k) {
    const el = this.el.interact;
    const touch = this.game.input.touch.active;
    this.el.tbUse.hidden = !(touch && target);
    if (!target) {
      el.classList.remove('on');
      return;
    }
    el.classList.add('on');
    this.el.interactKey.textContent = touch ? 'KULLAN' : 'F';
    this.el.interactText.textContent = target.time > 0 ? `basılı tut · ${target.prompt}` : target.prompt;
    this.el.interactBar.parentElement.hidden = !(target.time > 0);
    this.el.interactBar.style.width = `${clamp(k, 0, 1) * 100}%`;
  }

  intro() {
    const c = this.el.intro;
    // Seviye kartı: numara ve zorluk, ad, manga büyüklüğü
    const L = this.game.level;
    if (L) {
      const map = MAPS[L.map]?.name || '';
      const rank = ALLY_TIERS[L.allyTier || 1]?.rank || '';
      c.children[0].textContent = `SEVİYE ${L.id} · ${L.tag} · ${map}`.toLocaleUpperCase('tr-TR');
      c.children[1].textContent = L.name.toLocaleUpperCase('tr-TR');
      c.children[2].textContent = L.allies ? `Alfa Timi · ${L.allies} ${rank.toLocaleLowerCase('tr-TR')} seninle` : 'Komutan · tek başına';
    }
    c.classList.remove('on');
    void c.offsetWidth;
    c.classList.add('on');
  }

  damageNumber(point, dmg, head) {
    let n = this.numPool.find((x) => x.t <= 0);
    if (!n) {
      if (this.numPool.length > 20) return;
      const el = document.createElement('div');
      el.className = 'dnum';
      this.el.dmgNums.appendChild(el);
      n = { el, t: 0, p: new THREE.Vector3() };
      this.numPool.push(n);
    }
    n.t = 0.9;
    n.p.copy(point);
    n.p.x += (Math.random() - 0.5) * 0.3;
    n.el.textContent = Math.round(dmg);
    n.el.className = head ? 'dnum head' : 'dnum';
  }

  project(p, out) {
    const cam = this.game.camera;
    _v.copy(p).project(cam);
    const w = this.game.width;
    const h = this.game.height;
    out.x = (_v.x * 0.5 + 0.5) * w;
    out.y = (-_v.y * 0.5 + 0.5) * h;
    out.behind = _v.z > 1;
    return out;
  }

  // Kare başına güncelleme
  // Yere düşme ekranı (§7.3): ortada kan kaybı halkası ve süre, gelen asker ve mesafesi, canlandırma halkası;
  // renkler sayaçla solar, kenarda kırmızı nabız, son saniyelerde kararır (tuvale CSS süzgeci: ek çizim geçişi yok)
  updateDowned(dt) {
    const g = this.game;
    const P = g.player;
    const E = this.el;
    if (!E.downed) return;
    if (!P.down) {
      if (this.wasDown) {
        this.wasDown = false;
        E.downed.hidden = true;
        E.game.style.filter = '';
        E.dnPulse.style.opacity = '0';
        E.dnDark.style.opacity = '0';
        document.body.classList.remove('downed');
      }
      return;
    }
    if (!this.wasDown) {
      this.wasDown = true;
      E.downed.hidden = false;
      document.body.classList.add('downed');
      const kit = g.kit.slots.findIndex((s) => s?.id === 'adrenaline' && s.left > 0);
      E.dnHint.innerHTML = '';
      const add = (key, text) => {
        const k = document.createElement('kbd');
        k.textContent = key;
        E.dnHint.append(k, document.createTextNode(` ${text}  `));
      };
      add(keyName(BINDINGS.interact[0] || 'KeyE'), 'basılı: yardım çağır');
      add(keyName(BINDINGS.swapWeapon[0] || 'KeyX'), 'basılı: pes et');
      if (kit >= 0) add(keyName(BINDINGS[`useItem${kit + 1}`]?.[0] || ''), 'adrenalin');
    }
    const B = P.bleed;
    const f = B.frac;
    const C = 2 * Math.PI * 46;
    E.dnRing.style.strokeDashoffset = String(C * (1 - f));
    E.dnRevive.style.strokeDashoffset = String(C * (1 - (P.reviver ? P.reviveK : 0)));
    E.dnTime.textContent = String(Math.ceil(B.left));
    const R = g.allies.rescue;
    let st;
    if (P.reviver) st = `${P.reviver.rankName} seni kaldırıyor`;
    else if (R.reviver) st = `${R.reviver.rankName} geliyor — ${Math.round(R.reviver.pos.distanceTo(P.pos))} m`;
    else if (!g.allies.list.some((a) => !a.down)) st = 'Kurtarma yok — tim yerde';
    else if (R.decision === 'clearFirst') st = 'Tim önce bölgeyi temizliyor…';
    else st = 'Yardım yolda değil — bölge çok sıcak';
    if (st !== this.dnSt) {
      this.dnSt = st;
      E.dnStatus.textContent = st;
    }
    // Ekran: canlandırılırken renk hızla geri gelir
    const k = P.reviver ? 0.2 : 1;
    const desat = (0.45 + (1 - f) * 0.55) * k;
    const dark = B.left < REVIVE_DARK ? (1 - B.left / REVIVE_DARK) * 0.8 * k : 0;
    E.game.style.filter = `grayscale(${desat.toFixed(2)}) brightness(${(1 - dark).toFixed(2)})`;
    const beat = 0.5 + 0.5 * Math.sin(P.time * (4 + (1 - f) * 6));
    E.dnPulse.style.opacity = String(((0.35 + (1 - f) * 0.5) * beat * k).toFixed(2));
    E.dnDark.style.opacity = String(dark.toFixed(2));
  }

  // Alfa Timi durumu (§8.1): renk, çağrı kodu ve ad, can ve zırh çubuğu, son emir. Saniyede dört kez.
  // Geliştirici hasar paneli (konsol "dmgpanel", §10): son 10 sn'deki isabetler — kaynak, mesafe, ham hasar →
  // zırhın emdiği → cana geçen — ve yere düşme süreleri. Kapalıyken hiç güncellenmez
  updateDmgPanel(dt) {
    const g = this.game;
    if (!g.debugDmg) {
      if (this.dmgPanel && !this.dmgPanel.hidden) this.dmgPanel.hidden = true;
      return;
    }
    this.dmgPanelT = (this.dmgPanelT || 0) - dt;
    if (this.dmgPanelT > 0 && !this.dmgPanel?.hidden) return;
    this.dmgPanelT = 0.25;
    if (!this.dmgPanel) {
      this.dmgPanel = document.createElement('pre');
      this.dmgPanel.id = 'dmgPanel';
      this.root.appendChild(this.dmgPanel);
    }
    const P = g.player;
    const f1 = (v) => v.toFixed(1).replace('.', ',');
    const rows = (P.dmgLog || []).filter((d) => P.time - d.t <= BALANCE.dmgPanelSec);
    let hp = 0;
    let ar = 0;
    for (const d of rows) {
      hp += d.dealt;
      ar += d.absorbed;
    }
    const lines = [`HASAR · son ${BALANCE.dmgPanelSec} sn: ${rows.length} isabet · can −${f1(hp)} · zırh −${f1(ar)}`];
    for (const d of rows.slice(-8).reverse()) {
      const who = ENEMY_TYPES[d.src]?.name || d.src;
      lines.push(`−${f1(P.time - d.t)} sn  ${who.padEnd(14)} ${d.dist != null ? `${d.dist} m`.padStart(5) : '    —'}  ${f1(d.raw)} → zırh ${f1(d.absorbed)} → can ${f1(d.dealt)}  (${Math.round(d.hp)})`);
    }
    const T = g.stats.ttd || [];
    const avg = T.length ? T.reduce((a, b) => a + b, 0) / T.length : 0;
    lines.push(T.length ? `Yere düşme: son ${f1(T.at(-1))} sn · ort. ${f1(avg)} sn (${T.length})` : 'Yere düşme: henüz yok');
    this.dmgPanel.textContent = lines.join('\n');
    this.dmgPanel.hidden = false;
  }

  // Dokunmatikte paneller sol sütunda alt alta: can paneli zırh satırıyla uzayınca silah paneli (ve onun altındaki
  // bonus takipçisi) aşağı kayar, üst üste binmez. Masaüstünde CSS konumu geçerlidir
  layoutColumn(dt) {
    this.colT = (this.colT || 0) - dt;
    if (this.colT > 0) return;
    this.colT = 0.25;
    const am = this.el.ammo;
    const hp = this.el.health;
    const want = this.game.input.touch.active && hp.offsetHeight ? `${hp.offsetTop + hp.offsetHeight + 6}px` : '';
    if (am.style.top !== want) am.style.top = want;
  }

  updateSquad(dt) {
    const box = this.el.squad;
    if (!box) return;
    this.squadT = (this.squadT || 0) - dt;
    if (this.squadT > 0) return;
    this.squadT = 0.25;
    const list = this.game.allies.list;
    box.hidden = !list.length || this.game.mode !== 'mission';
    // Tim varken dokunmatik TELSİZ/İŞARET düğmeleri görünür
    document.body.classList.toggle('squad', !box.hidden);
    if (box.hidden) return;
    // Can paneli zırh satırıyla uzayıp kısalır: liste hep hemen üstünde dursun. Dokunmatikte sol sütun dolu:
    // liste can panelinin sağında (CSS), alttan konum verilmez
    const hp = this.el.health;
    if (!this.game.input.touch.active && box.style.top) box.style.top = box.style.left = '';
    if (this.game.input.touch.active) {
      box.style.bottom = '';
      // Hedef panelinin altında, can ve silah panellerinin sağında (silah adı uzunsa panel genişler)
      const o = this.el.objective;
      const am = this.el.ammo;
      box.style.top = `${Math.max(o.offsetTop + o.offsetHeight + 6, hp.offsetTop)}px`;
      box.style.left = `${Math.max(hp.offsetLeft + hp.offsetWidth, am.offsetLeft + am.offsetWidth) + 8}px`;
    } else if (hp?.offsetHeight) box.style.bottom = `${hp.offsetParent ? hp.offsetParent.clientHeight - hp.offsetTop + 6 : 104}px`;
    if (!this.sqRows || this.sqRows.length !== list.length || this.sqRows.some((r, i) => r.ally !== list[i])) {
      box.innerHTML = '';
      this.sqRows = list.map((a) => {
        const r = document.createElement('div');
        r.className = 'sq';
        const dot = document.createElement('i');
        dot.style.background = a.member.color;
        const name = document.createElement('b');
        name.textContent = `${a.callsign} ${a.person}`;
        const ord = document.createElement('em');
        const hp = document.createElement('u');
        hp.className = 'hp';
        const hpI = document.createElement('s');
        hp.append(hpI);
        const ar = document.createElement('u');
        ar.className = 'ar';
        const arI = document.createElement('s');
        ar.append(arI);
        r.append(dot, name, ord, hp, ar);
        r.title = a.member.roleLabel;
        box.appendChild(r);
        return { ally: a, r, ord, hpI, ar, arI, last: '' };
      });
    }
    for (const row of this.sqRows) {
      const a = row.ally;
      const label = a.down ? 'YERDE' : orderLabel(a);
      if (label !== row.last) {
        row.last = label;
        row.ord.textContent = label;
      }
      row.r.classList.toggle('down', a.down);
      // Konuşan asker 1 sn parlar (§8.4)
      row.r.classList.toggle('talk', (a.talkUntil || 0) > performance.now());
      row.hpI.style.transform = `scaleX(${a.down ? 0 : clamp(a.health.hp / a.health.max, 0, 1)})`;
      row.ar.hidden = !a.armor;
      if (a.armor) row.arI.style.transform = `scaleX(${clamp(a.armor.points / a.armor.max, 0, 1)})`;
    }
  }

  update(dt) {
    const g = this.game;
    const P = g.player;
    const W = g.weapons;
    const w = W.current;
    const cam = g.camera;
    const width = g.width;
    const height = g.height;
    this.updateSquad(dt);
    this.updateDowned(dt);
    this.layoutColumn(dt);
    this.updateDmgPanel(dt);

    // Dokunmatik NİŞAN aç/kapa çalışır: nişandayken düğme parmak kalksa da yanık kalsın (DOM'a yalnız değişince yaz)
    const adsLatched = g.input.touch.active && P.adsToggle;
    if (adsLatched !== this.adsLatched) {
      this.adsLatched = adsLatched;
      this.el.tbAds.classList.toggle('latched', adsLatched);
    }

    // Nişangah: anlık sapmaya göre açılır
    if (w) {
      const spread = W.currentSpread();
      const pxPerRad = height / 2 / Math.tan((cam.fov * DEG) / 2);
      const gap = Math.max(3, Math.tan(spread * DEG) * pxPerRad);
      this.ch.t.style.transform = `translateY(${-gap - 9}px)`;
      this.ch.b.style.transform = `translateY(${gap}px)`;
      this.ch.l.style.transform = `translateX(${-gap - 9}px)`;
      this.ch.r.style.transform = `translateX(${gap}px)`;
      let op = 1 - clamp(P.adsT * 3, 0, 1);
      if (P.sprinting || W.state === 'unequipping' || W.state === 'melee' || !P.alive) op = 0;
      else if (W.state === 'reloading' || W.state === 'equipping') op *= 0.4;
      this.el.crosshair.style.opacity = op;
    }

    // Dürbün kaplaması ve nefes göstergesi
    const scoped = g.viewmodel.scoped && P.alive;
    if (this.el.scope.hidden === scoped) this.el.scope.hidden = !scoped;
    if (scoped) {
      this.el.breathBar.style.width = `${Math.round(P.breath * 100)}%`;
      const t = P.breathTired ? 'NEFES NEFESE' : P.holdingBreath ? 'NEFES TUTULUYOR' : this.game.input.touch.active ? 'NİŞANI SABİT TUT' : 'SHIFT · NEFESİNİ TUT';
      if (this.el.breathText.textContent !== t) this.el.breathText.textContent = t;
    }

    // Telsiz altyazısı
    if (this.radioT > 0) {
      this.radioT -= dt;
      if (this.radioT <= 0) this.el.radio.className = '';
    }

    // Hasar yönü
    const fwdAng = Math.atan2(-Math.sin(P.yaw), -Math.cos(P.yaw));
    for (const d of this.dmgDirPool) {
      if (d.t <= 0) {
        if (d.el.style.opacity !== '0') d.el.style.opacity = '0';
        continue;
      }
      d.t -= dt;
      const rel = -(d.ang - fwdAng);
      d.el.style.transform = `rotate(${rel}rad)`;
      d.el.style.opacity = String(clamp(d.t / 0.6, 0, 1));
    }

    // Pusula
    const heading = ((-P.yaw / DEG) % 360 + 360) % 360;
    this.el.compassStrip.style.transform = `translateX(${-heading * this.pxPerDeg}px)`;
    const cw = this.el.compass.clientWidth;

    // İşaretçiler (hedef + son düşmanlar)
    const mission = g.mission;
    const markers = [];
    const obj = mission?.current;
    if (obj && obj.marker) {
      const m = obj.marker();
      if (Array.isArray(m)) for (const p of m) markers.push({ p, enemy: false });
      else if (m) markers.push({ p: m, enemy: false });
    }
    if (obj && obj.group) {
      const left = g.enemies.list.filter((e) => e.alive && e.group === obj.group);
      if (left.length <= 2) for (const e of left) markers.push({ p: e.pos.clone().setY(e.pos.y + 2.2), enemy: true });
    }
    // Manganın bildirdiği düşmanlar
    for (const [e, until] of this.marks) {
      if (!e.alive || g.time > until) this.marks.delete(e);
      else markers.push({ p: e.pos.clone().setY(e.pos.y + 2.2), enemy: true });
    }
    let used = 0;
    let compassSet = false;
    for (const mk of markers) {
      let el = this.markerPool[used];
      if (!el) {
        el = document.createElement('div');
        el.className = 'marker';
        el.innerHTML = '<div class="dia"></div><div class="dist"></div>';
        this.el.markers.appendChild(el);
        this.markerPool.push(el);
      }
      used++;
      el.hidden = false;
      el.className = mk.enemy ? 'marker enemy' : 'marker';
      const s = this.project(mk.p, {});
      const margin = 40;
      let x = s.x;
      let y = s.y;
      if (s.behind) {
        x = width - x;
        y = height - margin;
      }
      x = clamp(x, margin, width - margin);
      y = clamp(y, margin + 60, height - 150);
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      el.style.left = '0';
      el.style.top = '0';
      const dist = Math.round(mk.p.distanceTo(P.pos));
      const distEl = el.lastChild;
      const txt = `${dist} m`;
      if (distEl.textContent !== txt) distEl.textContent = txt;
      if (!mk.enemy && !compassSet) {
        compassSet = true;
        const bearing = Math.atan2(mk.p.x - P.pos.x, -(mk.p.z - P.pos.z)) / DEG;
        let rel = ((bearing - heading + 540) % 360) - 180;
        const px = clamp(rel * this.pxPerDeg, -cw / 2 + 8, cw / 2 - 8);
        this.el.compassObj.style.left = `${cw / 2 + px}px`;
        this.el.compassObj.hidden = false;
      }
    }
    if (!compassSet) this.el.compassObj.hidden = true;
    for (let i = used; i < this.markerPool.length; i++) this.markerPool[i].hidden = true;

    // Düşman farkındalık ikonları
    let ic = 0;
    for (const e of g.enemies.list) {
      if (!e.alive || e.dummy) continue;
      const aware = e.aiState !== 'combat' && e.awareness > 0.08;
      const alert = e.alertIconT > 0;
      if (!aware && !alert) continue;
      if (e.pos.distanceTo(P.pos) > 70) continue;
      _v.set(e.pos.x, e.pos.y + 2.3, e.pos.z);
      const s = this.project(_v, {});
      if (s.behind || s.x < 0 || s.x > width || s.y < 0 || s.y > height) continue;
      let el = this.iconPool[ic];
      if (!el) {
        el = document.createElement('div');
        el.innerHTML = '<span></span><div class="fill"><i></i></div>';
        this.el.icons.appendChild(el);
        this.iconPool.push(el);
      }
      ic++;
      el.hidden = false;
      el.className = alert && !aware ? 'eicon x' : 'eicon q';
      el.firstChild.textContent = alert && !aware ? '!' : '?';
      el.lastChild.hidden = !aware;
      el.lastChild.firstChild.style.width = `${e.awareness * 100}%`;
      el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
      if (ic >= 14) break;
    }
    for (let i = ic; i < this.iconPool.length; i++) this.iconPool[i].hidden = true;

    // Dost askerler: mavi ok ve isim (kim olduğu hemen anlaşılsın, vurulmasın); yaralıysa belirtilir
    let at = 0;
    for (const a of g.allies.list) {
      const d = a.pos.distanceTo(P.pos);
      if (d > ALLY_TAG_RANGE) continue;
      _v.set(a.pos.x, a.pos.y + (a.crouch ? 1.75 : 2.15), a.pos.z);
      const s = this.project(_v, {});
      if (s.behind || s.x < 0 || s.x > width || s.y < 0 || s.y > height) continue;
      let el = this.allyPool[at];
      if (!el) {
        el = document.createElement('div');
        el.className = 'atag';
        el.innerHTML = '<span></span><i></i><b hidden></b>';
        this.el.icons.appendChild(el);
        this.allyPool.push(el);
      }
      at++;
      el.hidden = false;
      el.classList.toggle('down', a.down);
      el.classList.toggle('talk', (a.talkUntil || 0) > performance.now());
      const txt = a.down ? `${a.callsign} · YARALI` : `${a.callsign} · ${a.rankName}`;
      if (el.firstChild.textContent !== txt) el.firstChild.textContent = txt;
      const ct = this.cmdTags.get(a.callsign);
      const showCmd = !!ct && !a.down && g.time < ct.until;
      const cb = el.lastChild;
      if (cb.hidden === showCmd) cb.hidden = !showCmd;
      if (showCmd && cb.textContent !== ct.text) cb.textContent = ct.text;
      el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
      el.style.opacity = String(clamp(1.2 - d / ALLY_TAG_RANGE, 0.4, 1));
    }
    for (let i = at; i < this.allyPool.length; i++) this.allyPool[i].hidden = true;

    // El bombası uyarısı
    const nades = g.grenades.dangerNear(P.pos, 9);
    for (let i = 0; i < Math.max(nades.length, this.gwarnPool.length); i++) {
      let el = this.gwarnPool[i];
      if (!el) {
        el = document.createElement('div');
        el.className = 'gwarn';
        el.innerHTML = '<b>!</b>';
        this.el.grenadeWarn.appendChild(el);
        this.gwarnPool.push(el);
      }
      const n = nades[i];
      if (!n) {
        el.hidden = true;
        continue;
      }
      el.hidden = false;
      const ang = Math.atan2(n.pos.x - P.pos.x, n.pos.z - P.pos.z);
      el.style.transform = `rotate(${-(ang - fwdAng)}rad)`;
      el.firstChild.textContent = `${Math.round(n.pos.distanceTo(P.pos))}m`;
    }

    // Hasar sayıları
    for (const n of this.numPool) {
      if (n.t <= 0) {
        if (!n.el.hidden) n.el.hidden = true;
        continue;
      }
      n.t -= dt;
      n.p.y += dt * 0.8;
      const s = this.project(n.p, {});
      n.el.hidden = s.behind;
      n.el.style.left = `${s.x}px`;
      n.el.style.top = `${s.y}px`;
      n.el.style.opacity = String(clamp(n.t / 0.4, 0, 1));
    }

    // Mini harita (15 Hz)
    this.miniT -= dt;
    if (this.miniT <= 0) {
      this.miniT = 1 / 15;
      this.drawMinimap(markers);
    }
    this.el.dead.classList.toggle('on', !P.alive);

    if (g.settings.showFps) {
      this.fpsAcc += dt;
      this.fpsN++;
      if (this.fpsAcc > 0.5) {
        this.el.fps.textContent = `${Math.round(this.fpsN / this.fpsAcc)} FPS · ${g.renderer.info.render.calls} çizim`;
        this.fpsAcc = 0;
        this.fpsN = 0;
      }
    }
  }

  // Statik harita izini bir kez çiz (çarpıştırıcıların üstten görünüşü)
  bakeMinimap() {
    const W = this.game.world;
    const B = W.bounds;
    const scale = 3;
    const c = document.createElement('canvas');
    c.width = Math.ceil((B.maxx - B.minx) * scale);
    c.height = Math.ceil((B.maxz - B.minz) * scale);
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(160,140,100,0.18)';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = 'rgba(120,110,90,0.25)';
    ctx.fillRect((-4 - B.minx) * scale, 0, 8 * scale, c.height);
    for (const col of W.colliders) {
      if (col.max.y < 0.5 || col.min.y > 3) continue;
      const tall = col.max.y > 2;
      ctx.fillStyle = tall ? 'rgba(231,220,196,0.62)' : 'rgba(231,220,196,0.32)';
      ctx.fillRect((col.min.x - B.minx) * scale, (col.min.z - B.minz) * scale, Math.max(1, (col.max.x - col.min.x) * scale), Math.max(1, (col.max.z - col.min.z) * scale));
    }
    this.miniBake = { canvas: c, scale };
  }

  drawMinimap(markers) {
    const g = this.game;
    const cv = this.el.minimap;
    const ctx = cv.getContext('2d');
    const S = cv.width;
    const R = S / 2;
    const P = g.player;
    const B = g.world.bounds;
    const range = 55; // metre (yarıçap)
    const k = R / range;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(R, R, R - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(R, R);
    ctx.rotate(P.yaw); // oyuncunun baktığı yön yukarıda
    const toMap = (x, z) => [(x - P.pos.x) * k, (z - P.pos.z) * k];
    if (this.miniBake) {
      const mb = this.miniBake;
      const [ox, oz] = toMap(B.minx, B.minz);
      ctx.drawImage(mb.canvas, ox, oz, mb.canvas.width * (k / mb.scale), mb.canvas.height * (k / mb.scale));
    }
    // Dost manga mavi nokta (yaralıysa sarı)
    for (const a of g.allies.list) {
      const [x, z] = toMap(a.pos.x, a.pos.z);
      ctx.fillStyle = a.down ? '#f0a33a' : '#6fb0ff';
      ctx.beginPath();
      ctx.arc(x, z, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Ateş eden düşmanlar kırmızı nokta (radar)
    for (const e of g.enemies.list) {
      if (!e.alive || e.dummy) continue;
      const recent = g.time - e.lastFired < 2.2;
      if (!recent) continue;
      const [x, z] = toMap(e.pos.x, e.pos.z);
      ctx.fillStyle = '#e0513f';
      ctx.beginPath();
      ctx.arc(x, z, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Kendini belli etmiş ağır makineli mevzileri: kırmızı üçgen (susturulunca kaybolur)
    for (const n of g.mission?.mounts || []) {
      if (!n.warned || n.wrecked || !n.gunner.alive || n.gunner.mount !== n) continue;
      const [x, z] = toMap(n.pos.x, n.pos.z);
      ctx.save();
      ctx.translate(x, z);
      ctx.rotate(-P.yaw);
      ctx.fillStyle = '#ff5a3c';
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(6.5, 5);
      ctx.lineTo(-6.5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    // Kendini göstermiş tank: kırmızı gövde ve taretin baktığı yönde namlu
    for (const t of g.mission?.tanks || []) {
      if (!t.warned || t.destroyed) continue;
      const [x, z] = toMap(t.pos.x, t.pos.z);
      ctx.save();
      ctx.translate(x, z);
      ctx.rotate(-t.yaw);
      ctx.fillStyle = '#ff5a3c';
      ctx.fillRect(-4.5, -6.5, 9, 13);
      ctx.rotate(-t.aimYaw);
      ctx.fillRect(-1, -12, 2, 11);
      ctx.restore();
    }
    for (const mk of markers) {
      const [x, z] = toMap(mk.p.x, mk.p.z);
      const d = Math.hypot(x, z);
      const lim = R - 12;
      const sx = d > lim ? (x / d) * lim : x;
      const sz = d > lim ? (z / d) * lim : z;
      ctx.save();
      ctx.translate(sx, sz);
      ctx.rotate(-P.yaw);
      ctx.fillStyle = mk.enemy ? '#e0513f' : '#f0a33a';
      ctx.fillRect(-5, -5, 10, 10);
      ctx.restore();
    }
    ctx.restore();
    // Oyuncu oku
    ctx.fillStyle = '#f0a33a';
    ctx.beginPath();
    ctx.moveTo(R, R - 10);
    ctx.lineTo(R + 7, R + 8);
    ctx.lineTo(R, R + 4);
    ctx.lineTo(R - 7, R + 8);
    ctx.closePath();
    ctx.fill();
    this.el.scoreVal.textContent = g.stats.score;
  }
}
