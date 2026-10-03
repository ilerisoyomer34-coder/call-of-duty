// Teçhizat kuralları (Operasyon Güncellemesi §5.5, §4.8 taşıma kuralı): ana/yan silah, zırh, kask ve iki sarf
// yuvası. Arayüzden bağımsızdır (teçhizat ekranı ve görev bunu kullanır; birim testleri doğrudan dener).
// Kayıt: save.data.loadout = { primary, secondary, armor, helmet, slots: [id|null, id|null] }.
// Sarf yuvası yalnız türü tutar; görevde taşınan adet min(yığın sınırı, envanterdeki adet). Envanterden
// yalnız kullanılan düşer, kullanılmayan kendiliğinden "geri dönmüş" olur.
import { WEAPONS, WEAPON_ORDER, DEFAULT_LOADOUT } from './config.js';
import STORE from './data/store.json' with { type: 'json' };
import WEAPON_META from './data/weapons.json' with { type: 'json' };

export const SLOT_COUNT = STORE.loadoutSlots;
export const CONSUMABLES = new Map(STORE.consumables.map((c) => [c.id, c]));

export class LoadoutSystem {
  constructor(save) {
    this.save = save;
    this.repair();
  }

  get data() {
    return this.save.data.loadout;
  }

  get inv() {
    return this.save.data.inventory;
  }

  // Bozuk ya da eski kayıttan gelen değerleri geçerli hâle getir (silah kategorisi, sahiplik, yuva sayısı)
  repair() {
    const L = this.data;
    let dirty = false;
    const fix = (k, v) => {
      if (L[k] !== v) {
        L[k] = v;
        dirty = true;
      }
    };
    if (!this.weaponOk('primary', L.primary)) fix('primary', DEFAULT_LOADOUT.primary);
    if (!this.weaponOk('secondary', L.secondary)) fix('secondary', DEFAULT_LOADOUT.secondary);
    if (L.armor && !this.inv.armor.includes(L.armor)) fix('armor', null);
    if (L.helmet && !this.inv.helmets.includes(L.helmet)) fix('helmet', null);
    const slots = Array.isArray(L.slots) ? L.slots.slice(0, SLOT_COUNT) : [];
    while (slots.length < SLOT_COUNT) slots.push(null);
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      // Eski biçim { id, count } de okunur
      const id = s && typeof s === 'object' ? s.id : s;
      slots[i] = CONSUMABLES.has(id) && slots.indexOf(id) === i ? id : null;
    }
    if (JSON.stringify(slots) !== JSON.stringify(L.slots)) fix('slots', slots);
    if (dirty) this.save.update(null);
  }

  weaponsFor(slot) {
    return WEAPON_ORDER.filter((id) => WEAPONS[id].category === slot);
  }

  // Kilitli silah: verideki unlockCost > 0 ve mağazadan açılmamış
  weaponLocked(id) {
    return (WEAPON_META[id]?.unlockCost || 0) > 0 && !this.inv.weapons.includes(id);
  }

  weaponOk(slot, id) {
    return !!WEAPONS[id] && WEAPONS[id].category === slot && !this.weaponLocked(id);
  }

  selectWeapon(slot, id) {
    if (!this.weaponOk(slot, id)) return false;
    this.save.update((d) => (d.loadout[slot] = id), { now: true });
    return true;
  }

  // Envanterdeki adet ve bir yuvada taşınabilecek adet
  stock(id) {
    return this.inv.consumables[id] || 0;
  }

  carry(id) {
    const c = CONSUMABLES.get(id);
    return c ? Math.min(c.maxStack || 1, this.stock(id)) : 0;
  }

  // Yuvaya sarf malzemesi koy (null boşaltır). Aynı tür iki yuvaya konmaz: yığın sınırı anlamını yitirir.
  // Envanterde hiç yoksa konmaz.
  setSlot(i, id) {
    if (i < 0 || i >= SLOT_COUNT) return false;
    if (id !== null && (!CONSUMABLES.has(id) || this.stock(id) <= 0)) return false;
    this.save.update(
      (d) => {
        const s = d.loadout.slots;
        if (id !== null) for (let k = 0; k < s.length; k++) if (k !== i && s[k] === id) s[k] = null;
        s[i] = id;
      },
      { now: true }
    );
    return true;
  }

  // GÖREVE BAŞLA yalnız ana silah seçili (ve açık) ise etkin
  canDeploy() {
    return this.weaponOk('primary', this.data.primary);
  }

  // Görev başında taşınan sarf malzemeleri: [{ id, count } | null] (envanter sonradan azalmışsa adet kırpılır)
  missionKit() {
    return this.data.slots.map((id) => (id && this.carry(id) > 0 ? { id, count: this.carry(id) } : null));
  }

  // Görevde bir adet kullanıldı: envanterden hemen düşer (görev yarıda kalsa da harcanmış sayılır)
  consume(id) {
    if (this.stock(id) <= 0) return false;
    this.save.update((d) => (d.inventory.consumables[id] = Math.max(0, (d.inventory.consumables[id] || 0) - 1)), { now: true });
    return true;
  }
}
