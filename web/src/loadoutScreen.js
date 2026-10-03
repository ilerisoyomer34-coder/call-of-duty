// Teçhizat ekranı (Operasyon Güncellemesi §5.5): solda yuvalar (ana/yan silah, zırh, kask, iki sarf), ortada
// o yuvaya uygun kartlar, sağda seçili kartın ayrıntısı (silahta dönen 3D önizleme). Tıkla = seç, çift tıkla ya
// da "Kuşan" = yuvaya tak, Esc = geri. Seçimler anında kayda yazılır; sonraki görev aynı teçhizatla açılır.
// Kurallar loadout.js (silah, sarf) ve store.js (zırh/kask sahipliği); burası yalnız görünüm.
import { ITEM_BY_ID, ITEMS } from './store.js';
import { itemIcon } from './storeIcons.js';
import { formatKR } from './economy.js';
import { EV } from './events.js';
import { weaponName, weaponClass, weaponInfoLine, weaponStats, weaponBadges, WEAPON_META } from './weaponInfo.js';
import { weaponIcon, weaponPlaceholder, WeaponPreview } from './weaponIcons.js';

const $ = (id) => document.getElementById(id);
const SLOTS = [
  { id: 'primary', label: 'Ana silah', kind: 'weapon' },
  { id: 'secondary', label: 'Yan silah', kind: 'weapon' },
  { id: 'armor', label: 'Zırh', kind: 'armor' },
  { id: 'helmet', label: 'Kask', kind: 'helmet' },
  { id: 'slot0', label: 'Sarf 1', kind: 'consumable', index: 0 },
  { id: 'slot1', label: 'Sarf 2', kind: 'consumable', index: 1 },
];
const NONE = { armor: 'Zırhsız', helmet: 'Kasksız', consumable: 'Boş' };
// Boş yuva simgesi (kesik çember)
const NONE_ICON = '<svg viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-dasharray="5 5" opacity=".5"/></svg>';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function bars(stats) {
  const b = el('div', 'loBars');
  for (const s of stats) {
    const i = el('i');
    i.style.setProperty('--v', `${s.value}%`);
    b.append(el('span', null, s.label), i, el('em', null, String(s.value)));
  }
  return b;
}

export class LoadoutScreen {
  constructor(game, menus, store) {
    this.game = game;
    this.menus = menus;
    this.lo = game.loadouts;
    this.store = store;
    this.slot = SLOTS[0];
    this.sel = null; // odaktaki kartın kimliği ('' = zırhsız/boş)
    this.preview = null;
    this.build();
    game.events.on(EV.CREDITS_CHANGED, (e) => {
      if (this.krVal) this.krVal.textContent = formatKR(e.credits);
    });
    // Esc: geri (onay penceresi yok; menüdeki diğer ekranlar Geri düğmesiyle döner)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.visible) {
        e.preventDefault();
        this.menus.back();
      }
    });
  }

  get visible() {
    return !$('loadoutScreen').hidden;
  }

  build() {
    const root = $('loadoutRoot');
    root.innerHTML = '';
    const head = el('div', 'stHead');
    const titles = el('div');
    this.eyebrow = el('div', 'eyebrow', 'Teçhizat');
    this.eyebrow.id = 'loadoutDiff';
    titles.append(this.eyebrow, el('h2', null, 'Teçhizat'));
    const kr = el('div', 'kr');
    this.krVal = el('b', null, formatKR(this.game.economy.credits));
    kr.append(el('small', null, 'KREDİ'), this.krVal);
    head.append(titles, kr);

    const body = el('div', 'loBody');
    this.nav = el('div', 'loNav');
    this.nav.setAttribute('role', 'tablist');
    this.navBtns = new Map();
    for (const s of SLOTS) {
      const b = el('button', 'loSlot');
      b.type = 'button';
      b.dataset.slot = s.id;
      b.setAttribute('role', 'tab');
      const lab = el('small', null, s.label);
      const val = el('b');
      b.append(lab, val);
      b.addEventListener('click', () => {
        this.game.audio.uiClick();
        this.slot = s;
        this.sel = null;
        this.render();
      });
      this.nav.appendChild(b);
      this.navBtns.set(s.id, { b, val });
    }
    this.grid = el('div', 'loGrid');
    this.detail = el('div', 'stDetail loDetail');
    body.append(this.nav, this.grid, this.detail);

    const row = el('div', 'row loActions');
    const deploy = el('button', 'btn primary', 'Göreve başla ▶');
    deploy.type = 'button';
    deploy.id = 'btnDeploy';
    deploy.addEventListener('click', () => this.deploy());
    const shop = el('button', 'btn', 'Mağaza');
    shop.type = 'button';
    shop.id = 'btnLoadoutStore';
    shop.addEventListener('click', () => {
      this.game.audio.uiClick();
      this.menus.storeScreen.open(this.slot.kind === 'consumable' ? 'consumable' : this.slot.kind === 'helmet' ? 'helmet' : 'armor');
    });
    const back = el('button', 'btn', 'Geri');
    back.type = 'button';
    back.id = 'loBack';
    back.addEventListener('click', () => {
      this.game.audio.uiClick();
      this.menus.back();
    });
    this.deployBtn = deploy;
    row.append(deploy, shop, back);
    root.append(head, body, row);

    // Önizleme tuvali bir kez kurulur; silah ayrıntısında yeniden yerleştirilir
    this.canvas = el('canvas', 'loPreview');
    this.canvas.title = 'Sürükleyerek çevir';
  }

  open(eyebrow) {
    if (eyebrow) this.eyebrow.textContent = eyebrow;
    this.lo.repair();
    this.slot = SLOTS[0];
    this.sel = null;
    this.krVal.textContent = formatKR(this.game.economy.credits);
    this.render();
    this.menus.show('loadoutScreen');
    this.warmIcons();
  }

  // Mağazadan dönünce (sahiplik/kredi değişmiş olabilir) yeniden çiz
  refresh() {
    this.lo.repair();
    this.render();
    if (this.preview && this.slot.kind === 'weapon') this.preview.start();
  }

  // Tüm silah simgelerini sırayla üret (ekran açıkken arka planda; sonraki açılışta anında)
  warmIcons() {
    for (const s of SLOTS) if (s.kind === 'weapon') for (const id of this.lo.weaponsFor(s.id)) weaponIcon(id);
  }

  // Yuvanın şu anki değeri ('' = boş)
  value(slot) {
    const L = this.lo.data;
    if (slot.kind === 'consumable') return L.slots[slot.index] || '';
    return L[slot.id] || '';
  }

  valueName(slot) {
    const v = this.value(slot);
    if (!v) return NONE[slot.kind];
    if (slot.kind === 'weapon') return weaponName(v);
    if (slot.kind === 'consumable') return `${ITEM_BY_ID.get(v)?.name} ×${this.lo.carry(v)}`;
    return ITEM_BY_ID.get(v)?.name || v;
  }

  // Yuvaya uygun kartlar: { id, ... } ('' = zırhsız/kasksız/boş)
  items(slot) {
    if (slot.kind === 'weapon') return this.lo.weaponsFor(slot.id);
    const cat = slot.kind;
    return ['', ...ITEMS.filter((i) => i.category === cat).map((i) => i.id)];
  }

  // Kart durumu: equipped | owned | locked (silah) | shop (sahip değil / stok yok)
  status(slot, id) {
    if (id === this.value(slot)) return 'equipped';
    if (id === '') return 'owned';
    if (slot.kind === 'weapon') return this.lo.weaponLocked(id) ? 'locked' : 'owned';
    if (slot.kind === 'consumable') return this.lo.stock(id) > 0 ? 'owned' : 'shop';
    return this.store.owned(ITEM_BY_ID.get(id)) ? 'owned' : 'shop';
  }

  render() {
    for (const s of SLOTS) {
      const n = this.navBtns.get(s.id);
      n.b.classList.toggle('sel', s === this.slot);
      n.b.setAttribute('aria-selected', s === this.slot ? 'true' : 'false');
      n.val.textContent = this.valueName(s);
    }
    const items = this.items(this.slot);
    if (this.sel === null || !items.includes(this.sel)) this.sel = this.value(this.slot);
    this.grid.className = `loGrid ${this.slot.kind}`;
    this.grid.innerHTML = '';
    for (const id of items) this.grid.appendChild(this.card(id));
    this.deployBtn.disabled = !this.lo.canDeploy();
    this.renderDetail();
  }

  card(id) {
    const slot = this.slot;
    const st = this.status(slot, id);
    const c = el('button', `loCard ${st}${id === this.sel ? ' sel' : ''}`);
    c.type = 'button';
    c.dataset.id = id || 'none';
    if (slot.kind === 'weapon') {
      const img = el('img', 'loImg');
      img.alt = '';
      img.decoding = 'async';
      img.src = weaponPlaceholder(id);
      weaponIcon(id).then((r) => {
        img.src = r.url;
        img.classList.toggle('ready', r.kind !== 'silhouette');
      });
      c.append(img, el('b', null, weaponName(id)), el('small', 'loClass', weaponClass(id).toLocaleUpperCase('tr-TR')), el('span', 'loInfo', weaponInfoLine(id)), bars(weaponStats(id)));
      const badges = weaponBadges(id);
      if (badges.length) {
        const bx = el('div', 'loBadges');
        for (const t of badges) bx.append(el('em', 'stBadge', t));
        c.append(bx);
      }
      if (st === 'locked') c.append(el('span', 'loLock', `🔒 ${formatKR(WEAPON_META[id].unlockCost)}`));
    } else {
      const item = id ? ITEM_BY_ID.get(id) : null;
      const img = el('div', 'stImg');
      img.innerHTML = item ? itemIcon(id, item.category) : NONE_ICON;
      c.append(img, el('b', null, item ? item.name : NONE[slot.kind]));
      if (item && slot.kind === 'consumable') c.append(el('span', 'loInfo', `Envanterde ${this.lo.stock(id)} · taşınır ${Math.min(item.def.maxStack, this.lo.stock(id))}/${item.def.maxStack}`));
      else if (item) c.append(el('span', 'loInfo', `${item.def.points} ZP · %${Math.round(item.def.absorb * 100)} emme${item.def.speedPenalty ? ` · hız −%${Math.round(item.def.speedPenalty * 100)}` : ''}`));
      if (st === 'shop') c.append(el('span', 'loLock', `MAĞAZADA · ${formatKR(item.price)}`));
    }
    if (st === 'equipped') c.append(el('span', 'loCheck', '✓'));
    c.addEventListener('click', () => {
      this.game.audio.uiClick();
      this.sel = id;
      for (const x of this.grid.children) x.classList.toggle('sel', x === c);
      this.renderDetail();
    });
    c.addEventListener('dblclick', () => this.equip(id));
    return c;
  }

  renderDetail() {
    const D = this.detail;
    D.innerHTML = '';
    const slot = this.slot;
    const id = this.sel;
    const st = this.status(slot, id);
    if (slot.kind === 'weapon') {
      D.append(this.canvas);
      if (!this.preview) this.preview = new WeaponPreview(this.canvas);
      this.preview.show(id).then((ok) => {
        if (!ok) this.canvas.replaceWith(Object.assign(el('img', 'loPreview'), { src: weaponPlaceholder(id), alt: '' }));
      });
      D.append(el('h3', 'stName', weaponName(id)), el('div', 'stTag', `${weaponClass(id).toLocaleUpperCase('tr-TR')} · ${weaponInfoLine(id)}`), bars(weaponStats(id)));
      const badges = weaponBadges(id);
      if (badges.length) {
        const bx = el('div', 'loBadges');
        for (const t of badges) bx.append(el('em', 'stBadge', t));
        D.append(bx);
      }
    } else {
      this.preview?.stop();
      const item = id ? ITEM_BY_ID.get(id) : null;
      const img = el('div', 'stImg big');
      img.innerHTML = item ? itemIcon(id, item.category) : NONE_ICON;
      D.append(img, el('h3', 'stName', item ? item.name : NONE[slot.kind]));
      if (item) {
        if (item.def.nij) D.append(el('div', 'stTag', item.def.nij));
        D.append(el('p', 'stText', item.desc));
        if (slot.kind === 'consumable') {
          const d = item.def;
          D.append(el('p', 'stText', `Envanterde ${this.lo.stock(id)} · bu yuvada en fazla ${d.maxStack} · kullanılmayan envantere döner`));
        } else {
          const t = el('div', 'stCmp');
          for (const r of this.store.compare(item)) {
            const line = el('div', `stRow ${r.better > 0 ? 'up' : r.better < 0 ? 'down' : ''}`);
            line.append(el('span', null, r.label), el('b', null, `${r.fmt(r.from)} → ${r.fmt(r.to)} ${r.better > 0 ? '▲' : r.better < 0 ? '▼' : ''}`));
            t.append(line);
          }
          D.append(t);
          if (item.def.noSprint) D.append(el('p', 'stWarn', 'Bu zırhla koşamazsın.'));
        }
      } else {
        D.append(el('p', 'stText', slot.kind === 'consumable' ? 'Bu yuvaya sarf malzemesi konmaz.' : 'Koruma yok, hız cezası da yok.'));
      }
    }
    const row = el('div', 'row stActions');
    if (st === 'equipped') row.append(el('span', 'stState', slot.kind === 'consumable' && id ? 'YUVADA' : 'KUŞANILDI'));
    else if (st === 'shop') {
      const b = el('button', 'btn primary', 'Mağazada al');
      b.type = 'button';
      b.addEventListener('click', () => {
        this.game.audio.uiClick();
        this.menus.storeScreen.open(slot.kind);
      });
      row.append(b);
    } else if (st === 'locked') {
      row.append(el('span', 'stWarn', `Kilitli · ${formatKR(WEAPON_META[id].unlockCost)} (Mağaza → Silahlar)`));
    } else {
      const b = el('button', 'btn primary', slot.kind === 'consumable' ? (id ? 'Yuvaya koy' : 'Yuvayı boşalt') : 'Kuşan');
      b.type = 'button';
      b.id = 'loEquip';
      b.addEventListener('click', () => this.equip(id));
      row.append(b);
    }
    D.append(row);
  }

  equip(id) {
    const slot = this.slot;
    const st = this.status(slot, id);
    if (st === 'equipped' || st === 'locked' || st === 'shop') return;
    let ok = false;
    if (slot.kind === 'weapon') ok = this.lo.selectWeapon(slot.id, id);
    else if (slot.kind === 'consumable') ok = this.lo.setSlot(slot.index, id || null);
    else if (id) ok = this.store.equip(id);
    else {
      this.store.unequip(slot.id);
      ok = true;
    }
    if (!ok) return;
    this.game.audio.mech('equip');
    this.sel = id;
    this.render();
  }

  deploy() {
    if (!this.lo.canDeploy()) return;
    this.game.audio.init();
    this.game.audio.uiClick();
    this.preview?.stop();
    this.game.startMode('mission', this.menus.pendingDiff || 'normal', this.menus.pendingLevel);
  }
}

