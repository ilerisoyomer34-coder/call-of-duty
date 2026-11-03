// Rekabetçi satın alma menüsü: raunt başındaki satın alma evresinde (PHASE.BUY, oyuncular yerinde) kendiliğinden
// açılır; B (buyMenu) ya da SATIN AL çipi açar/kapatır, Esc kapatır. Ana silahlar sınıf başlıklarıyla fiyat sırasında,
// altta el bombası ve sis (raunt başına birer). Paranın yetmediği kart soluk, eldeki silah işaretli. Satın alma
// sunucuda doğrulanır (C_BUY → comp.buy); kabul edilince elindeki silah değişir (NEV.LOADOUT) ve para anlık
// görüntüyle güncellenir. Liste ve fiyatlar shared/sim/competitive.js → BUY_ITEMS (ağdaki dizin aynı).
import { PHASE } from '../../shared/net/protocol.js';
import { BUY_ITEMS, COMP_RULES } from '../../shared/sim/competitive.js';
import { weaponName, weaponShortName, weaponType, weaponInfoLine, classesOf } from '../weaponInfo.js';
import { weaponIcon, weaponPlaceholder, releaseStudio } from '../weaponIcons.js';

const $ = (id) => document.getElementById(id);

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export const fmtMoney = (v) => `${Math.round(v).toLocaleString('tr-TR')} $`;
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class BuyScreen {
  constructor(game) {
    this.game = game;
    this.net = null;
    this.open = false;
    this.dismissed = false; // bu satın alma evresinde oyuncu kapattı: kendiliğinden yeniden açılmaz
    this.round = -1;
    this.cards = [];
    this.iconsUsed = false;
    $('btnBuyClose').addEventListener('click', () => this.close(true, true));
    $('mhBuyChip').addEventListener('click', () => (this.open ? this.close(true, true) : this.show()));
  }

  start(net) {
    this.net = net;
    this.open = false;
    this.dismissed = false;
    this.round = -1;
    this.build();
    $('mhBuy').hidden = true;
    $('mhBuyChip').hidden = true;
  }

  stop() {
    this.close(false);
    this.net = null;
    $('mhBuyChip').hidden = true;
  }

  build() {
    const grid = $('mhBuyGrid');
    grid.textContent = '';
    this.cards = [];
    const weapons = BUY_ITEMS.map((it, i) => ({ it, i })).filter(({ it }) => it.kind === 'weapon');
    // Sınıf başlıkları (CODM düzeni: weaponClasses.json sırası); sınıf içinde fiyat sırası
    for (const cls of classesOf(weapons.map(({ it }) => it.id))) {
      const items = weapons.filter(({ it }) => weaponType(it.id).id === cls.id);
      if (!items.length) continue;
      const sec = el('div', 'mhBuyGroup');
      sec.append(el('h3', null, cls.group || cls.name));
      const row = el('div', 'mhBuyRow');
      for (const { it, i } of items) row.append(this.card(it, i));
      sec.append(row);
      grid.append(sec);
    }
    const nades = el('div', 'mhBuyGroup');
    nades.append(el('h3', null, 'Bombalar'));
    const row = el('div', 'mhBuyRow');
    for (const [i, it] of BUY_ITEMS.entries()) if (it.kind !== 'weapon') row.append(this.card(it, i));
    nades.append(row);
    grid.append(nades);
  }

  card(it, i) {
    const c = el('button', 'mhBuyCard');
    c.type = 'button';
    c.dataset.item = it.id;
    let img = null;
    if (it.kind === 'weapon') {
      img = el('img', 'mhPrepImg');
      img.alt = '';
      img.decoding = 'async';
      img.src = weaponPlaceholder(it.id);
      c.append(img, el('b', null, weaponShortName(it.id)));
      c.title = `${weaponName(it.id)} · ${weaponInfoLine(it.id)}`;
    } else {
      c.append(el('i', `mhBuyNade ${it.kind}`), el('b', null, it.kind === 'frag' ? 'El bombası' : 'Sis bombası'));
      c.title = it.kind === 'frag' ? 'Patlayıcı el bombası (G)' : 'Sis bombası: görüşü keser (4)';
    }
    const price = el('span', 'pr', fmtMoney(it.price));
    const state = el('small', 'st');
    c.append(price, state);
    c.addEventListener('click', () => this.buy(i));
    this.cards.push({ c, it, i, img, state });
    return c;
  }

  loadIcons() {
    this.iconsUsed = true;
    for (const { it, img } of this.cards) {
      if (!img) continue;
      weaponIcon(it.id).then((r) => {
        img.src = r.url;
        img.classList.toggle('ready', r.kind !== 'silhouette');
      });
    }
  }

  buy(i) {
    const net = this.net;
    if (!net?.comp || net.phase !== PHASE.BUY) return;
    const it = BUY_ITEMS[i];
    if (net.comp.money < it.price || this.owned(it)) {
      this.game.audio.mech('dry');
      return;
    }
    net.buy(i);
    this.game.audio.purchase();
  }

  owned(it) {
    const net = this.net;
    if (it.kind === 'weapon') return net.loadout?.[0] === it.id;
    const n = it.kind === 'frag' ? net.nades?.frag : net.nades?.smoke;
    return (n || 0) >= COMP_RULES.nades[it.kind];
  }

  show() {
    const net = this.net;
    if (!net?.comp || net.phase !== PHASE.BUY || !this.game.player.alive) return;
    this.open = true;
    this.dismissed = false;
    $('mhBuy').hidden = false;
    this.game.input.exitLock();
    this.game.input.clearTransientInput();
    if (!this.iconsUsed) this.loadIcons();
    this.refresh();
  }

  close(byUser, lock = false) {
    if (!this.open) return;
    this.open = false;
    if (byUser) this.dismissed = true;
    $('mhBuy').hidden = true;
    if (this.iconsUsed) {
      releaseStudio();
      this.iconsUsed = false;
    }
    if (lock && this.game.state === 'playing') this.game.input.requestLock();
  }

  toggle() {
    if (this.open) this.close(true, true);
    else this.show();
  }

  refresh() {
    const net = this.net;
    const money = net.comp.money;
    $('mhBuyMoney').textContent = fmtMoney(money);
    for (const { c, it, state } of this.cards) {
      const own = this.owned(it);
      c.classList.toggle('own', own);
      c.classList.toggle('poor', !own && money < it.price);
      state.textContent = own ? (it.kind === 'weapon' ? 'ELİNDE' : 'ALINDI') : money < it.price ? 'YETERSİZ' : '';
    }
  }

  update(input) {
    const net = this.net;
    if (!net?.comp) return;
    const buying = net.phase === PHASE.BUY && net.state === 'playing' && this.game.player.alive;
    if (!buying) {
      this.close(false, this.open);
      $('mhBuyChip').hidden = true;
      return;
    }
    // Yeni raunt: menü yeniden kendiliğinden açılır
    if (net.comp.round !== this.round) {
      this.round = net.comp.round;
      this.dismissed = false;
    }
    // Esc main.js'te (duraklatmadan önce menüyü kapatır)
    if (input.pressed('buyMenu')) this.toggle();
    else if (!this.open && !this.dismissed && !this.game.matchHud.prep.open) this.show();
    const t = fmt(Math.ceil(net.timeLeft));
    $('mhBuyTime').textContent = t;
    $('mhBuyChipTime').textContent = t;
    $('mhBuyChip').hidden = this.open;
    if (this.open) this.refresh();
  }
}
