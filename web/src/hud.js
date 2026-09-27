// HUD: olaylarla güncellenen paneller (can, cephane, hedef, telsiz) ve kare başına
// konuma bağlı öğeler (nişangah, pusula, işaretçiler, mini harita, hasar yönü, düşman farkındalık ikonları).
import * as THREE from 'three';
import { DEG, clamp } from './util.js';
import { WEAPONS, MAPS, ALLY_TIERS } from './config.js';

const $ = (id) => document.getElementById(id);
const _v = new THREE.Vector3();
const ALLY_TAG_RANGE = 70; // dost isim etiketinin görüldüğü en uzak mesafe (m)

const MODE_LABEL = { auto: 'OTOMATİK', burst: '3\'LÜ SERİ', semi: 'TEK ATIŞ' };
const CARD = [
  [0, 'K'], [45, 'KD'], [90, 'D'], [135, 'GD'], [180, 'G'], [225, 'GB'], [270, 'B'], [315, 'KB'],
];

export class HUD {
  constructor(game) {
    this.game = game;
    this.root = $('hud');
    this.el = {
      crosshair: $('crosshair'), chT: null, hit: $('hitmarker'), vignette: $('vignette'), dead: $('dead'),
      objNum: $('objNum'), objTitle: $('objTitle'), objDetail: $('objDetail'), objective: $('objective'),
      hpVal: $('hpVal'), hpBar: $('hpBar'), health: $('health'),
      wName: $('wName'), wMode: $('wMode'), aMag: $('aMag'), aRes: $('aRes'), ammo: $('ammo'), nades: $('nades'),
      reloadHint: $('reloadHint'), radio: $('radio'), message: $('message'), feed: $('feed'),
      interact: $('interact'), interactText: $('interactText'), interactBar: $('interactBar'), interactKey: $('interactKey'),
      markers: $('markers'), icons: $('icons'), dmgNums: $('dmgNums'), dmgDirs: $('dmgDirs'), grenadeWarn: $('grenadeWarn'),
      compassStrip: $('compassStrip'), compassObj: $('compassObj'), compass: $('compass'),
      minimap: $('minimap'), scoreVal: $('scoreVal'), fps: $('fps'), intro: $('introCard'), tbUse: $('tbUse'),
      slots: $('slots'), scope: $('scope'), breathBar: $('scopeBreathBar'), breathText: $('scopeBreathText'),
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
    E.on('ammo', (w) => this.setAmmo(w));
    E.on('weapon', (w) => {
      this.setAmmo(w);
      this.setSlots();
    });
    E.on('slots', () => this.setSlots());
    E.on('fireMode', (w) => this.setAmmo(w));
    E.on('grenades', (n) => this.setNades(n));
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

  setAmmo(w) {
    if (!w) return;
    const d = w.data;
    const inf = this.game.cheats.infiniteAmmo;
    this.el.wName.textContent = d.name;
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
      s.append(k, document.createTextNode(WEAPONS[id].name.split(' ')[0]));
      box.appendChild(s);
    });
  }

  setNades(n) {
    const box = this.el.nades;
    box.innerHTML = '';
    for (let i = 0; i < 4; i++) {
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
    h.className = `show ${kind === 'kill' ? 'kill' : kind === 'head' || headKill ? 'head' : ''}`;
  }

  damageDir(ang) {
    const d = this.dmgDirPool.find((x) => x.t <= 0) || this.dmgDirPool[0];
    d.t = 1.3;
    d.ang = ang;
  }

  radio(text, who) {
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
      c.children[2].textContent = L.allies ? `Kartal ekibi · ${L.allies} ${rank.toLocaleLowerCase('tr-TR')} seninle` : 'Kartal-1 · tek başına';
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
  update(dt) {
    const g = this.game;
    const P = g.player;
    const W = g.weapons;
    const w = W.current;
    const cam = g.camera;
    const width = g.width;
    const height = g.height;

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
        el.innerHTML = '<span></span><i></i>';
        this.el.icons.appendChild(el);
        this.allyPool.push(el);
      }
      at++;
      el.hidden = false;
      el.classList.toggle('down', a.down);
      const txt = a.down ? `${a.rankName} · YARALI` : a.rankName;
      if (el.firstChild.textContent !== txt) el.firstChild.textContent = txt;
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
    for (const n of g.mission?.nests || []) {
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
