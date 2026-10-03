// Görevdeki sarf malzemeleri (Operasyon Güncellemesi §4.8): teçhizattaki iki yuva; klavyede 3 / 4
// (useItem1/useItem2, ayarlardan değişir), dokunmatikte iki düğme.
//  - Zırh Plakası ve İlk Yardım Kiti süreli takılır: silah iner, koşulamaz; ateş etmek ya da tuşu yeniden
//    basmak işlemi iptal eder (yarıda kalan malzeme harcanmaz).
//  - Sis ve el bombası silah sisteminden atılır (pimi çek → bırak). Satın alınmış el bombaları G ile de
//    atılır, ama görevin verdiği bombalardan sonra (weapons.kitFrags).
//  - Adrenalin yalnız yere düşünce kullanılır (Modül D).
// Her kullanılan adet ITEM_USED olayıyla duyurulur ve envanterden hemen düşer; kullanılmayan envanterde kalır.
import { CONSUMABLES } from './loadout.js';
import { EV } from './events.js';

export const KIT_ACTIONS = ['useItem1', 'useItem2'];

export class KitSystem {
  constructor(game) {
    this.game = game;
    this.slots = [];
    this.using = null; // { slot, id, t, dur }
    this.active = false;
    game.events.on(EV.ITEM_USED, (e) => this.onUsed(e.id));
  }

  // Görev başında teçhizattan: kit = [{ id, count } | null] (poligonda yuva yok)
  reset(kit) {
    this.active = !!kit;
    this.slots = (kit || []).map((s) => (s ? { id: s.id, def: CONSUMABLES.get(s.id), left: s.count } : null));
    this.using = null;
    this.adrenalineUsed = 0;
    this.game.player.usingItem = false;
    this.game.weapons.kitFrags = this.count('frag');
    this.emit();
  }

  count(id) {
    let n = 0;
    for (const s of this.slots) if (s?.id === id) n += s.left;
    return n;
  }

  emit() {
    this.game.events.emit('kit', this.slots, this.using);
  }

  // Bir adet harcandı (atış ya da süreli kullanımın sonu): yuvadan ve envanterden düşer
  onUsed(id) {
    const s = this.slots.find((x) => x?.id === id && x.left > 0);
    if (!s) return;
    s.left--;
    this.game.loadouts.consume(id);
    this.game.stats.itemsUsed = (this.game.stats.itemsUsed || 0) + 1;
    this.emit();
  }

  update(dt, input, canAct) {
    if (!this.active) return;
    const g = this.game;
    const P = g.player;
    if (this.using) {
      const u = this.using;
      // İptal: ölüm, yere düşme, ateş, aynı yuvanın tuşu ya da silah değiştirme
      if (!canAct || !P.alive || P.down || input.pressed('fire') || input.pressed(KIT_ACTIONS[u.slot]) || input.pressed('swapWeapon')) {
        this.cancel();
        return;
      }
      u.t += dt;
      if (u.t >= u.dur) this.finish();
      else this.emit();
      return;
    }
    if (!canAct) return;
    for (let i = 0; i < KIT_ACTIONS.length; i++) if (input.pressed(KIT_ACTIONS[i])) this.use(i);
  }

  say(text) {
    this.game.events.emit('message', text, 'info');
  }

  use(i) {
    const g = this.game;
    const P = g.player;
    const s = this.slots[i];
    if (!s || s.left <= 0) {
      this.say(s ? `${s.def.name}: kalmadı` : 'Bu yuva boş');
      return;
    }
    if (P.down && s.id !== 'adrenaline') {
      this.say('Yerdeyken yalnız adrenalin kullanılabilir');
      return;
    }
    switch (s.id) {
      case 'plate_pack':
        if (!P.armor.body) return this.say('Gövde zırhın yok');
        if (P.armor.body.points >= P.armor.body.max) return this.say('Zırh zaten dolu');
        return this.begin(i, s);
      case 'medkit':
        if (P.health.hp >= P.health.max) return this.say('Can zaten dolu');
        return this.begin(i, s);
      case 'adrenaline':
        // Yere düşmüşken kendini kaldırır (Modül D); görev başına sınırlı
        if (!P.down) return this.say('Adrenalin yalnız yere düştüğünde kullanılır');
        if (this.adrenalineUsed >= (s.def.perMission || 1)) return this.say('Bu görevde adrenalin hakkın doldu');
        this.adrenalineUsed++;
        P.revive('adrenaline');
        g.audio.mech('equip');
        this.say('ADRENALİN');
        g.events.emit(EV.ITEM_USED, { id: 'adrenaline' });
        return;
      case 'smoke':
        g.weapons.startThrow('smoke', KIT_ACTIONS[i]);
        return;
      case 'frag':
        g.weapons.startThrow('frag', KIT_ACTIONS[i]);
        return;
      default:
        return;
    }
  }

  begin(i, s) {
    const g = this.game;
    if (g.weapons.state !== 'idle' && g.weapons.state !== 'reloading' && g.weapons.state !== 'equipping') return;
    g.weapons.cancelReload();
    g.player.stopSprint();
    g.player.usingItem = true;
    this.using = { slot: i, id: s.id, name: s.def.name, t: 0, dur: s.def.useTime || 1 };
    g.audio.mech('equip');
    this.emit();
  }

  cancel() {
    this.using = null;
    this.game.player.usingItem = false;
    this.emit();
  }

  finish() {
    const g = this.game;
    const P = g.player;
    const { id } = this.using;
    const def = CONSUMABLES.get(id);
    this.using = null;
    P.usingItem = false;
    if (id === 'plate_pack') {
      P.armor.addPoints(def.armor);
      g.events.emit('armor', P.armor, false);
      g.audio.armorHit?.('body');
      this.say(`+${def.armor} ZIRH`);
    } else if (id === 'medkit') {
      P.health.heal(def.heal);
      this.say(`+${def.heal} CAN`);
    }
    g.events.emit(EV.ITEM_USED, { id });
  }
}
