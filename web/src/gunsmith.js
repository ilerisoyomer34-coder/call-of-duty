// Silah modifiye kuralları (arayüzden bağımsız; görünüm gunsmithScreen.js, testi tests/gunsmith.test.mjs).
// Kayıt: save.data.inventory.attachments (satın alınan eklentiler; bir kez alınan her uyumlu silahta kullanılır),
// save.data.weaponMods[silah] = { kategori: eklenti }. Kredi yalnız EconomySystem'den. Eklentili silah tanımı ve uyum
// kuralları shared/sim/mods.js (çevrim içi sunucu da aynısını kullanır).
import { ATTACHMENTS, compatible, normalizeMods } from '../shared/sim/mods.js';
import { EV } from './events.js';

export const MOD_RESULT = { OK: 'ok', UNKNOWN: 'unknown', INCOMPATIBLE: 'incompatible', NO_CREDIT: 'no_credit', NOT_OWNED: 'not_owned', OWNED: 'owned' };

export class GunsmithSystem {
  constructor(save, economy, events = null) {
    this.save = save;
    this.economy = economy;
    this.events = events;
  }

  owns(attId) {
    return this.save.data.inventory.attachments.includes(attId);
  }

  // Silahın takılı eklentileri (uyumsuz ya da artık sahip olunmayan kayıt atlanır)
  modsFor(weaponId) {
    const raw = this.save.data.weaponMods?.[weaponId];
    const m = normalizeMods(weaponId, raw);
    for (const [cat, id] of Object.entries(m)) if (!this.owns(id)) delete m[cat];
    return m;
  }

  // Durum: 'equipped' | 'owned' | 'buy' (alınabilir) | 'no_credit' | 'incompatible'
  status(weaponId, attId) {
    const a = ATTACHMENTS[attId];
    if (!a || !compatible(weaponId, attId)) return 'incompatible';
    if (this.modsFor(weaponId)[a.cat] === attId) return 'equipped';
    if (this.owns(attId)) return 'owned';
    return this.economy.credits >= a.price ? 'buy' : 'no_credit';
  }

  buy(attId) {
    const a = ATTACHMENTS[attId];
    if (!a) return MOD_RESULT.UNKNOWN;
    if (this.owns(attId)) return MOD_RESULT.OWNED;
    if (!this.economy.spend(a.price, `Eklenti: ${a.name}`)) return MOD_RESULT.NO_CREDIT;
    this.save.update((d) => d.inventory.attachments.push(attId), { now: true });
    return MOD_RESULT.OK;
  }

  // Tak (attId) ya da o kategoriyi boşalt (attId null)
  equip(weaponId, cat, attId) {
    if (attId !== null) {
      const a = ATTACHMENTS[attId];
      if (!a || a.cat !== cat) return MOD_RESULT.UNKNOWN;
      if (!compatible(weaponId, attId)) return MOD_RESULT.INCOMPATIBLE;
      if (!this.owns(attId)) return MOD_RESULT.NOT_OWNED;
    }
    this.save.update(
      (d) => {
        const m = { ...(d.weaponMods[weaponId] || {}) };
        if (attId === null) delete m[cat];
        else m[cat] = attId;
        d.weaponMods[weaponId] = m;
      },
      { now: true }
    );
    this.events?.emit(EV.WEAPON_MODS_CHANGED, { weaponId, mods: this.modsFor(weaponId) });
    return MOD_RESULT.OK;
  }

  // Satın al ve tak (tek tıkla)
  buyAndEquip(weaponId, attId) {
    if (!compatible(weaponId, attId)) return MOD_RESULT.INCOMPATIBLE;
    if (!this.owns(attId)) {
      const r = this.buy(attId);
      if (r !== MOD_RESULT.OK) return r;
    }
    return this.equip(weaponId, ATTACHMENTS[attId].cat, attId);
  }
}
