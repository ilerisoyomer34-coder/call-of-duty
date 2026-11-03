// Silah modifiye ekranı (kullanıcı isteği: "silahları modifiye edebilelim"). Teçhizat ekranında silah ayrıntısındaki
// MODİFİYE düğmesi açar: solda kategoriler (takılı eklentiyle), ortada o kategorinin uyumlu eklentileri (etkileri
// ▲/▼, durum: takılı / sahipsin / fiyat), sağda eklentili 3B önizleme ve altı çubuklu karşılaştırma (şimdiki →
// seçili). Kurallar gunsmith.js (satın alma, takma), eklentili tanım shared/sim/mods.js; burası yalnız görünüm.
// Esc / Geri teçhizata döner.
import { ATTACHMENTS, ATT_CATEGORIES, choicesFor, moddedDef } from '../shared/sim/mods.js';
import { MOD_RESULT } from './gunsmith.js';
import { weaponName, weaponStats } from './weaponInfo.js';
import { WeaponPreview } from './weaponIcons.js';
import { SIGHT_TYPES } from './sights.js';
import { formatKR } from './economy.js';
import { EV } from './events.js';

const $ = (id) => document.getElementById(id);

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// Etki satırları: çarpan → yüzde; iyi yön (lower: azalması iyi)
const EFFECTS = [
  ['recoil', 'Geri tepme', true],
  ['hip', 'Kalçadan sapma', true],
  ['adsTime', 'Nişana geçiş', true],
  ['adsMove', 'Nişanda hareket', false],
  ['mobility', 'Hareket', false],
  ['mag', 'Şarjör', false],
  ['reload', 'Dolum süresi', true],
  ['range', 'Etkili menzil', false],
  ['noise', 'Duyulma', true],
  ['flash', 'Namlu alevi', true],
];

export function effectLines(att) {
  const out = [];
  // Büyütme: nişangâhın adındaki değer (3×, 8×); yoksa görüş açısından
  const zoom = SIGHT_TYPES[att.sight]?.zoom;
  if (zoom || att.mods?.fov) out.push({ text: `Büyütme ${zoom || `${(1 / att.mods.fov).toFixed(1).replace('.', ',')}×`}`, good: true });
  else if (att.sight) out.push({ text: SIGHT_TYPES[att.sight]?.kind === 'reflex' ? 'Kolimatör' : 'Nişangâh', good: null });
  for (const [k, label, lower] of EFFECTS) {
    const v = att.mods?.[k];
    if (v === undefined || v === 1) continue;
    const pct = Math.round((v - 1) * 100);
    out.push({ text: `${label} ${pct > 0 ? '+' : '−'}%${Math.abs(pct)}`, good: lower ? v < 1 : v > 1 });
  }
  if (att.sound === 'suppressed') out.push({ text: 'Sessiz atış', good: true });
  if (att.camo) out.push({ text: 'Yalnız görünüm', good: null });
  return out;
}

export class GunsmithScreen {
  constructor(game, onClose = null) {
    this.game = game;
    this.gs = game.gunsmith;
    this.onClose = onClose;
    this.weapon = null;
    this.cat = ATT_CATEGORIES[0].id;
    this.sel = null; // odaktaki eklenti ('' = boş)
    this.preview = null;
    this.build();
    game.events.on(EV.CREDITS_CHANGED, (e) => {
      if (this.krVal) this.krVal.textContent = formatKR(e.credits);
    });
    // Teçhizat ekranının Esc'inden önce: açıkken Esc yalnız bu ekranı kapatır
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape' && this.visible) {
          e.preventDefault();
          e.stopPropagation();
          this.close();
        }
      },
      true
    );
  }

  get visible() {
    return !!this.root && !this.root.hidden;
  }

  build() {
    const root = $('gunsmithRoot');
    this.root = root;
    root.innerHTML = '';
    const head = el('div', 'stHead');
    const t = el('div');
    this.title = el('h2', null, 'Modifiye');
    t.append(el('div', 'eyebrow', 'Silah modifiye'), this.title);
    const kr = el('div', 'kr');
    this.krVal = el('b', null, formatKR(this.game.economy.credits));
    kr.append(el('small', null, 'KREDİ'), this.krVal);
    head.append(t, kr);
    const body = el('div', 'gsBody');
    this.cats = el('div', 'gsCats');
    this.cats.setAttribute('role', 'tablist');
    this.list = el('div', 'gsList');
    const side = el('div', 'gsSide stDetail');
    this.canvas = el('canvas', 'loPreview gsPreview');
    this.canvas.title = 'Sürükleyerek çevir';
    this.stats = el('div', 'gsStats');
    this.desc = el('div', 'gsDesc');
    this.actions = el('div', 'row stActions');
    // Eylem düğmesi önizlemenin hemen altında: küçük ekranda kaydırmadan görünür
    side.append(this.canvas, this.actions, this.desc, this.stats);
    body.append(this.cats, this.list, side);
    const row = el('div', 'row loActions');
    const back = el('button', 'btn', 'Teçhizata dön');
    back.type = 'button';
    back.id = 'gsBack';
    back.dataset.back = '';
    back.addEventListener('click', () => this.close());
    row.append(back);
    root.append(head, body, row);
  }

  open(weaponId) {
    this.weapon = weaponId;
    this.title.textContent = weaponName(weaponId);
    this.krVal.textContent = formatKR(this.game.economy.credits);
    this.cat = ATT_CATEGORIES.find((c) => choicesFor(weaponId, c.id).length)?.id || ATT_CATEGORIES[0].id;
    this.sel = this.gs.modsFor(weaponId)[this.cat] || '';
    this.root.hidden = false;
    const screen = $('loadoutScreen');
    screen.scrollTop = 0;
    screen.classList.add('gsOpen');
    this.render();
  }

  close() {
    if (!this.visible) return;
    this.game.audio.uiClick();
    this.root.hidden = true;
    $('loadoutScreen').classList.remove('gsOpen');
    this.preview?.stop();
    this.onClose?.();
  }

  // Seçili eklentiyle (ya da boş) silahın eklentileri: önizleme ve karşılaştırma bunu gösterir
  candidate() {
    const m = { ...this.gs.modsFor(this.weapon) };
    if (this.sel) m[this.cat] = this.sel;
    else delete m[this.cat];
    return m;
  }

  render() {
    const W = this.weapon;
    const mods = this.gs.modsFor(W);
    // Kategoriler: uyumlu eklentisi olmayan kategori kapalı
    this.cats.innerHTML = '';
    for (const c of ATT_CATEGORIES) {
      const n = choicesFor(W, c.id).length;
      const b = el('button', `loSlot gsCat${c.id === this.cat ? ' active' : ''}`);
      b.type = 'button';
      b.dataset.cat = c.id;
      b.disabled = !n;
      b.append(el('small', null, c.name), el('b', null, mods[c.id] ? ATTACHMENTS[mods[c.id]].name : n ? 'Boş' : 'Uygun değil'));
      b.addEventListener('click', () => {
        this.game.audio.uiClick();
        this.cat = c.id;
        this.sel = this.gs.modsFor(W)[c.id] || '';
        this.render();
      });
      this.cats.append(b);
    }
    // Eklentiler: önce "Boş", sonra katalog sırası
    this.list.innerHTML = '';
    const cur = mods[this.cat] || '';
    const none = el('button', `gsCard none${this.sel === '' ? ' sel' : ''}${cur === '' ? ' equipped' : ''}`);
    none.type = 'button';
    none.dataset.att = '';
    none.append(el('b', null, 'Eklenti yok'), el('small', null, 'Silahın kendi parçası'));
    if (cur === '') none.append(el('span', 'gsState', 'TAKILI'));
    none.addEventListener('click', () => this.pick(''));
    this.list.append(none);
    for (const id of choicesFor(W, this.cat)) {
      const a = ATTACHMENTS[id];
      const st = this.gs.status(W, id);
      const c = el('button', `gsCard ${st}${this.sel === id ? ' sel' : ''}`);
      c.type = 'button';
      c.dataset.att = id;
      c.append(el('b', null, a.name));
      const fx = el('div', 'gsFx');
      for (const f of effectLines(a)) fx.append(el('em', f.good === null ? '' : f.good ? 'up' : 'down', f.text));
      c.append(fx);
      c.append(el('span', 'gsState', st === 'equipped' ? 'TAKILI' : st === 'owned' ? 'SAHİPSİN' : formatKR(a.price)));
      c.addEventListener('click', () => this.pick(id));
      c.addEventListener('dblclick', () => this.act());
      this.list.append(c);
    }
    this.renderSide();
  }

  pick(id) {
    this.game.audio.uiClick();
    this.sel = id;
    for (const x of this.list.children) x.classList.toggle('sel', x.dataset.att === id);
    this.renderSide();
  }

  renderSide() {
    const W = this.weapon;
    const now = this.gs.modsFor(W);
    const next = this.candidate();
    if (!this.preview) this.preview = new WeaponPreview(this.canvas);
    this.preview.show(W, next);
    // Karşılaştırma: şimdiki → seçili
    const a = weaponStats(W, moddedDef(W, now));
    const b = weaponStats(W, moddedDef(W, next));
    this.stats.innerHTML = '';
    a.forEach((s, i) => {
      const d = b[i].value - s.value;
      const row = el('div', `gsStat${d > 0 ? ' up' : d < 0 ? ' down' : ''}`);
      const bar = el('i');
      bar.style.setProperty('--v', `${b[i].value}%`);
      bar.style.setProperty('--w', `${Math.min(s.value, b[i].value)}%`);
      row.append(el('span', null, s.label), bar, el('em', null, d ? `${b[i].value} (${d > 0 ? '+' : '−'}${Math.abs(d)})` : String(s.value)));
      this.stats.append(row);
    });
    const def = moddedDef(W, next);
    const att = this.sel ? ATTACHMENTS[this.sel] : null;
    this.desc.innerHTML = '';
    if (att) this.desc.append(el('h3', 'stName', att.name), el('p', 'stText', att.desc));
    else this.desc.append(el('p', 'stText', 'Bu kategoride eklenti takılı değil.'));
    this.desc.append(el('p', 'stText gsMag', `Şarjör ${def.magSize} · dolum ${(def.reloadTactical || def.reloadStart || 0).toFixed(1).replace('.', ',')} sn`));
    // Eylem düğmesi
    this.actions.innerHTML = '';
    const cur = now[this.cat] || '';
    if (this.sel === cur) {
      this.actions.append(el('span', 'stState', 'TAKILI'));
      if (cur) this.actions.append(this.button('Çıkar', 'gsRemove', () => this.equip(null)));
      return;
    }
    if (!this.sel) {
      this.actions.append(this.button('Eklentiyi çıkar', 'gsAct', () => this.equip(null)));
      return;
    }
    const st = this.gs.status(W, this.sel);
    if (st === 'owned') this.actions.append(this.button('Tak', 'gsAct', () => this.act(), true));
    else if (st === 'buy') this.actions.append(this.button(`Satın al ve tak · ${formatKR(att.price)}`, 'gsAct', () => this.act(), true));
    else if (st === 'no_credit') this.actions.append(el('span', 'stWarn', `Yetersiz kredi · ${formatKR(att.price)}`));
  }

  button(text, id, fn, primary = false) {
    const b = el('button', `btn${primary ? ' primary' : ''}`, text);
    b.type = 'button';
    b.id = id;
    b.addEventListener('click', fn);
    return b;
  }

  act() {
    if (!this.sel) return this.equip(null);
    const r = this.gs.buyAndEquip(this.weapon, this.sel);
    if (r === MOD_RESULT.OK) {
      this.game.audio.mech('equip');
      this.render();
    } else if (r === MOD_RESULT.NO_CREDIT) this.game.audio.mech('dry');
  }

  equip(id) {
    if (this.gs.equip(this.weapon, this.cat, id) === MOD_RESULT.OK) {
      this.game.audio.mech('equip');
      this.sel = id || '';
      this.render();
    }
  }
}
