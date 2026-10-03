// Mağaza (Operasyon Güncellemesi §4.8–4.9): katalog, satın alma ve kuşanma kuralları. Arayüzden bağımsızdır
// (menus.js → mağaza ekranı bunu kullanır; birim testleri doğrudan dener). Ürünler veri dosyalarından gelir:
// zırh/kask data/armor.json, sarf malzemesi ve tim yükseltmesi data/store.json, kilitli silahlar
// data/weapons.json (unlockCost > 0). Kredi yalnız EconomySystem üzerinden harcanır; kayıt anında yazılır.
import ARMOR from './data/armor.json' with { type: 'json' };
import STORE from './data/store.json' with { type: 'json' };
import WEAPON_META from './data/weapons.json' with { type: 'json' };
import { weaponName } from './weaponInfo.js';

export const CATEGORIES = STORE.categories;

// Tüm ürünler tek listede: { id, category, name, desc, price, def }
export const ITEMS = [
  ...ARMOR.body.map((d) => ({ id: d.id, category: 'armor', name: d.name, desc: d.desc, price: d.price, def: d })),
  ...ARMOR.helmets.map((d) => ({ id: d.id, category: 'helmet', name: d.name, desc: d.desc, price: d.price, def: d })),
  ...STORE.consumables.map((d) => ({ id: d.id, category: 'consumable', name: d.name, desc: d.desc, price: d.price, def: d })),
  ...STORE.upgrades.map((d) => ({ id: d.id, category: 'squad', name: d.name, desc: d.desc, price: d.price, def: d })),
  ...Object.entries(WEAPON_META)
    .filter(([, m]) => (m.unlockCost || 0) > 0)
    // Ad ayara bağlı (Gerçek silah adları): her okumada güncel
    .map(([id, m]) => ({ id, category: 'weapon', get name() { return weaponName(id); }, desc: `${m.class} · ${m.caliber}`, price: m.unlockCost, def: m })),
];
export const ITEM_BY_ID = new Map(ITEMS.map((i) => [i.id, i]));

// Satın alma sonucu nedenleri (arayüz Türkçe metne çevirir)
export const BUY = Object.freeze({ OK: 'ok', NO_CREDIT: 'credit', OWNED: 'owned', LOCKED: 'locked', FULL: 'full', UNKNOWN: 'unknown' });

export class StoreSystem {
  constructor(save, economy) {
    this.save = save;
    this.economy = economy;
  }

  get inv() {
    return this.save.data.inventory;
  }

  get loadout() {
    return this.save.data.loadout;
  }

  items(category) {
    return category ? ITEMS.filter((i) => i.category === category) : ITEMS;
  }

  // Kategorinin görünür olup olmadığı: Silahlar sekmesi yalnız kilitli silah varsa çıkar
  categoryVisible(id) {
    return this.items(id).length > 0;
  }

  owned(item) {
    const I = this.inv;
    switch (item.category) {
      case 'armor':
        return I.armor.includes(item.id);
      case 'helmet':
        return I.helmets.includes(item.id);
      case 'squad':
        return I.upgrades.includes(item.id);
      case 'weapon':
        return I.weapons.includes(item.id);
      default:
        return false; // sarf malzemesi sahiplik değil, adet
    }
  }

  count(item) {
    return item.category === 'consumable' ? this.inv.consumables[item.id] || 0 : this.owned(item) ? 1 : 0;
  }

  equipped(item) {
    if (item.category === 'armor') return this.loadout.armor === item.id;
    if (item.category === 'helmet') return this.loadout.helmet === item.id;
    return false;
  }

  // Önkoşul (ör. Tim Zırhı Sv. 2 için Sv. 1) sağlanmamışsa kilitli
  locked(item) {
    const req = item.def.requires;
    return !!req && !this.inv.upgrades.includes(req);
  }

  // Sarf malzemesinde depoda tutulabilecek en fazla adet: teçhizat yuvalarının toplamı kadar değil,
  // makul bir üst sınır (iki yuvanın iki katı) — taşıma kuralı teçhizat ekranında uygulanır
  stockLimit(item) {
    return (item.def.maxStack || 1) * STORE.loadoutSlots * 2;
  }

  // Kart rozeti: equipped | owned | locked | full | credit | available
  status(item) {
    if (this.equipped(item)) return 'equipped';
    if (item.category !== 'consumable' && this.owned(item)) return 'owned';
    if (this.locked(item)) return 'locked';
    if (item.category === 'consumable' && this.count(item) + (item.def.perBuy || 1) > this.stockLimit(item)) return 'full';
    if (!this.economy.canAfford(item.price)) return 'credit';
    return 'available';
  }

  missing(item) {
    return Math.max(0, item.price - this.economy.credits);
  }

  buy(id) {
    const item = ITEM_BY_ID.get(id);
    if (!item) return BUY.UNKNOWN;
    const st = this.status(item);
    if (st === 'owned' || st === 'equipped') return BUY.OWNED;
    if (st === 'locked') return BUY.LOCKED;
    if (st === 'full') return BUY.FULL;
    if (!this.economy.spend(item.price, item.name)) return BUY.NO_CREDIT;
    this.save.update(
      (d) => {
        const I = d.inventory;
        if (item.category === 'armor') I.armor.push(item.id);
        else if (item.category === 'helmet') I.helmets.push(item.id);
        else if (item.category === 'squad') I.upgrades.push(item.id);
        else if (item.category === 'weapon') I.weapons.push(item.id);
        else I.consumables[item.id] = (I.consumables[item.id] || 0) + (item.def.perBuy || 1);
      },
      { now: true }
    );
    return BUY.OK;
  }

  // Kuşan: yalnız sahip olunan zırh/kask; aynı yuvadaki öncekinin yerine geçer
  equip(id) {
    const item = ITEM_BY_ID.get(id);
    if (!item || !this.owned(item) || (item.category !== 'armor' && item.category !== 'helmet')) return false;
    this.save.update((d) => (d.loadout[item.category === 'armor' ? 'armor' : 'helmet'] = id), { now: true });
    return true;
  }

  unequip(slot) {
    if (slot !== 'armor' && slot !== 'helmet') return;
    this.save.update((d) => (d.loadout[slot] = null), { now: true });
  }

  // Ayrıntı panelindeki karşılaştırma: kuşanılan ürünle (yoksa 'yok') değer değer
  //  → [{ label, from, to, better, fmt }]
  compare(item) {
    if (item.category !== 'armor' && item.category !== 'helmet') return [];
    const curId = item.category === 'armor' ? this.loadout.armor : this.loadout.helmet;
    const cur = curId ? ITEM_BY_ID.get(curId)?.def : null;
    const d = item.def;
    const row = (label, a, b, higherIsBetter, fmt) => ({ label, from: a, to: b, better: a === b ? 0 : (b > a) === higherIsBetter ? 1 : -1, fmt });
    return [
      row('Zırh Puanı', cur?.points || 0, d.points, true, (v) => String(v)),
      row('Hasar emme', cur?.absorb || 0, d.absorb, true, (v) => `%${Math.round(v * 100)}`),
      row('Hız', -(cur?.speedPenalty || 0), -(d.speedPenalty || 0), true, (v) => (v ? `−%${Math.round(-v * 100)}` : 'cezasız')),
    ];
  }
}
