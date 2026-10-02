// Mağaza ekranı (Operasyon Güncellemesi §4.9): üstte sekmeler ve kredi, solda ürün kartları, sağda seçili
// ürünün ayrıntısı (kuşanılanla karşılaştırma ▲/▼), satın alma onay penceresi. Kurallar store.js'te;
// burası yalnız görünüm. Ana menüden, teçhizat ve bölüm sonu ekranından açılır; görevde açılmaz.
import { StoreSystem, CATEGORIES, ITEM_BY_ID, BUY } from './store.js';
import { itemIcon } from './storeIcons.js';
import { formatKR } from './economy.js';
import { EV } from './events.js';

const $ = (id) => document.getElementById(id);
const BADGE = { equipped: 'KUŞANILDI', owned: 'SAHİPSİN', locked: 'KİLİTLİ', credit: 'YETERSİZ KREDİ', full: 'DOLU' };
const COUNT_MS = 650; // kredi sayacının geriye sayma süresi

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export class StoreScreen {
  constructor(game, menus) {
    this.game = game;
    this.menus = menus;
    this.store = new StoreSystem(game.save, game.economy);
    this.tab = 'armor';
    this.sel = null;
    this.shownCredits = game.economy.credits;
    this.build();
    game.events.on(EV.CREDITS_CHANGED, (e) => this.animateCredits(e.credits));
  }

  build() {
    const root = $('storeRoot');
    root.innerHTML = '';
    const head = el('div', 'stHead');
    const titles = el('div');
    titles.append(el('div', 'eyebrow', 'Mağaza · kalıcı teçhizat'), el('h2', null, 'Mağaza'));
    const kr = el('div', 'kr');
    kr.append(el('small', null, 'KREDİ'));
    this.krVal = el('b', null, formatKR(this.shownCredits));
    kr.append(this.krVal);
    head.append(titles, kr);

    this.tabs = el('div', 'seg stTabs');
    this.tabs.setAttribute('role', 'tablist');
    for (const c of CATEGORIES) {
      if (!this.store.categoryVisible(c.id)) continue;
      const b = el('button', 'diff');
      b.type = 'button';
      b.dataset.tab = c.id;
      b.setAttribute('role', 'tab');
      b.append(el('b', null, c.label));
      b.addEventListener('click', () => {
        this.game.audio.uiClick();
        this.tab = c.id;
        this.sel = null;
        this.render();
      });
      this.tabs.appendChild(b);
    }

    const body = el('div', 'stBody');
    this.grid = el('div', 'stGrid');
    this.detail = el('div', 'stDetail');
    body.append(this.grid, this.detail);

    const row = el('div', 'row');
    const back = el('button', 'btn', 'Geri');
    back.type = 'button';
    back.id = 'stBack';
    // data-back özniteliği yok: menus.bind() açılışta onları bağlar, bu düğme kendi işleyicisiyle geri döner
    back.addEventListener('click', () => {
      this.game.audio.uiClick();
      this.menus.back();
    });
    row.append(back);

    // Onay penceresi
    this.modal = el('div', 'stModal');
    this.modal.hidden = true;
    const box = el('div', 'stModalBox');
    this.modalText = el('p');
    const yes = el('button', 'btn primary', 'Onayla');
    const no = el('button', 'btn', 'Vazgeç');
    yes.type = no.type = 'button';
    yes.id = 'stConfirm';
    yes.addEventListener('click', () => this.confirmBuy());
    no.addEventListener('click', () => {
      this.game.audio.uiClick();
      this.modal.hidden = true;
    });
    const br = el('div', 'row');
    br.append(yes, no);
    box.append(this.modalText, br);
    this.modal.append(box);

    root.append(head, this.tabs, body, row, this.modal);
  }

  open(tab = null) {
    if (tab) this.tab = tab;
    this.sel = null;
    this.shownCredits = this.game.economy.credits;
    this.krVal.textContent = formatKR(this.shownCredits);
    this.modal.hidden = true;
    this.render();
    this.menus.show('storeScreen');
  }

  render() {
    for (const b of this.tabs.children) b.classList.toggle('sel', b.dataset.tab === this.tab);
    const items = this.store.items(this.tab);
    if (!this.sel || !items.includes(this.sel)) this.sel = items.find((i) => this.store.equipped(i)) || items[0];
    this.grid.innerHTML = '';
    for (const item of items) this.grid.appendChild(this.card(item));
    this.renderDetail();
  }

  card(item) {
    const st = this.store.status(item);
    const c = el('button', `stCard ${st}${item === this.sel ? ' sel' : ''}`);
    c.type = 'button';
    c.dataset.id = item.id;
    const img = el('div', 'stImg');
    img.innerHTML = itemIcon(item.id, item.category);
    const name = el('b', null, item.name);
    const desc = el('span', 'stDesc', item.desc);
    const foot = el('div', 'stFoot');
    const price = el('span', 'stPrice', item.category === 'consumable' && this.store.count(item) ? `${formatKR(item.price)} · ${this.store.count(item)} adet` : formatKR(item.price));
    foot.append(price);
    if (BADGE[st]) foot.append(el('em', `stBadge ${st}`, BADGE[st]));
    c.append(img, name, desc, foot);
    c.addEventListener('click', () => {
      this.game.audio.uiClick();
      this.sel = item;
      this.render();
    });
    c.addEventListener('dblclick', () => {
      if (this.store.owned(item) && !this.store.equipped(item)) this.equip(item);
    });
    return c;
  }

  renderDetail() {
    const D = this.detail;
    D.innerHTML = '';
    const item = this.sel;
    if (!item) return;
    const S = this.store;
    const st = S.status(item);
    const img = el('div', 'stImg big');
    img.innerHTML = itemIcon(item.id, item.category);
    D.append(img, el('h3', 'stName', item.name));
    if (item.def.nij) D.append(el('div', 'stTag', item.def.nij));
    D.append(el('p', 'stText', item.desc));
    // Kuşanılanla karşılaştırma: daha iyi yeşil ▲, daha kötü kırmızı ▼
    const cmp = S.compare(item);
    if (cmp.length) {
      const t = el('div', 'stCmp');
      for (const r of cmp) {
        const line = el('div', `stRow ${r.better > 0 ? 'up' : r.better < 0 ? 'down' : ''}`);
        line.append(el('span', null, r.label), el('b', null, `${r.fmt(r.from)} → ${r.fmt(r.to)} ${r.better > 0 ? '▲' : r.better < 0 ? '▼' : ''}`));
        t.append(line);
      }
      D.append(t);
      if (item.def.noSprint) D.append(el('p', 'stWarn', 'Bu zırhla koşamazsın.'));
    }
    if (item.category === 'consumable') {
      const d = item.def;
      D.append(el('p', 'stText', `Envanterde: ${S.count(item)} · Bir yuvada en fazla ${d.maxStack} · Bir alımda ${d.perBuy || 1} adet`));
    }
    if (item.def.requires && S.locked(item)) D.append(el('p', 'stWarn', `Önce: ${ITEM_BY_ID.get(item.def.requires)?.name}`));

    const row = el('div', 'row stActions');
    if (st === 'equipped') {
      const b = el('button', 'btn', 'Çıkar');
      b.type = 'button';
      b.addEventListener('click', () => {
        this.game.audio.uiClick();
        S.unequip(item.category === 'armor' ? 'armor' : 'helmet');
        this.render();
      });
      row.append(el('span', 'stState', 'KUŞANILDI'), b);
    } else if (st === 'owned') {
      const b = el('button', 'btn primary', 'Kuşan');
      b.type = 'button';
      b.id = 'stEquip';
      if (item.category === 'armor' || item.category === 'helmet') b.addEventListener('click', () => this.equip(item));
      else b.disabled = true;
      row.append(b);
    } else {
      const b = el('button', 'btn primary', st === 'credit' ? `${formatKR(S.missing(item))} eksik` : st === 'locked' ? 'Kilitli' : st === 'full' ? 'Envanter dolu' : `Satın al · ${formatKR(item.price)}`);
      b.type = 'button';
      b.id = 'stBuy';
      b.disabled = st !== 'available';
      b.addEventListener('click', () => this.askBuy(item));
      row.append(b);
    }
    D.append(row);
  }

  askBuy(item) {
    this.game.audio.uiClick();
    this.pending = item;
    this.modalText.textContent = `${item.name} — ${formatKR(item.price)}. Onaylıyor musun?`;
    this.modal.hidden = false;
  }

  confirmBuy() {
    const item = this.pending;
    this.modal.hidden = true;
    if (!item) return;
    const r = this.store.buy(item.id);
    if (r === BUY.OK) {
      this.game.audio.purchase();
      this.sel = item;
      this.render();
      // Kart kısa bir parlamayla onaylanır
      const card = this.grid.querySelector(`[data-id="${item.id}"]`);
      card?.classList.add('bought');
    } else {
      this.game.audio.uiClick();
      this.render();
    }
  }

  equip(item) {
    if (this.store.equip(item.id)) {
      this.game.audio.mech?.('equip');
      this.render();
    }
  }

  // Kredi sayacı yeni değere sayarak iner/çıkar
  animateCredits(to) {
    const from = this.shownCredits;
    this.shownCredits = to;
    if (!this.krVal) return;
    const t0 = performance.now();
    const token = (this.countToken = (this.countToken || 0) + 1);
    const step = (t) => {
      if (token !== this.countToken) return;
      const k = Math.min(1, (t - t0) / COUNT_MS);
      this.krVal.textContent = formatKR(from + (to - from) * k);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    // Kare hızı düşükse (ya da sekme arka plandaysa) sayaç yine son değerde biter
    setTimeout(() => {
      if (token === this.countToken) this.krVal.textContent = formatKR(to);
    }, COUNT_MS + 60);
  }
}
