// Tim komutları (Operasyon Güncellemesi §8.2, §8.6): komut verme, muhatap seçimi, onay repliği ve sonuç
// geri bildirimi. Komutu alan her asker kendi emrini uygular (ally.js → setOrder); bitirince ya da
// yapamayınca buraya bildirir. Komut "tamamlandı" sayılması için bütün muhatapların bitirmesi gerekir.
// Olaylar: COMMAND_ISSUED → (asker onayı) → COMMAND_COMPLETED + kısa rapor | COMMAND_FAILED + gerekçe.
// Komutu kimin verdiği (kısayol, çark, işaret, yazı, ses) inputMethod alanında taşınır.
import * as THREE from 'three';
import CMD from './data/commands.tr.json' with { type: 'json' };
import SQUAD from './data/squad.json' with { type: 'json' };
import { EV } from './events.js';
import { pick } from './util.js';
import { playerLabel } from './nameScreen.js';

export const COMMANDS = CMD.commands;
export const ORDERS = SQUAD.orders;
// Kısayol eylemleri (input.js → BINDINGS) → komut
export const SHORTCUTS = {
  cmdFollow: 'FOLLOW',
  cmdHold: 'HOLD',
  cmdSuppress: 'SUPPRESS',
  cmdCover: 'TAKE_COVER',
  cmdHeal: 'HEAL_PLAYER',
  cmdHoldFire: 'HOLD_FIRE',
  cmdFreeFire: 'FREE_FIRE',
};
// Hedef noktası isteyen komutlar (nişangâhın baktığı yer)
const NEEDS_POINT = new Set(['MOVE_TO', 'SUPPRESS', 'CLEAR_AREA']);

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _hit = {};

export class CommandSystem {
  constructor(game) {
    this.game = game;
    this.seq = 0;
    this.active = new Map(); // id → komut
    this.addressee = 'all'; // seçili muhatap: 'all' | çağrı kodu
  }

  clear() {
    this.active.clear();
    this.addressee = 'all';
  }

  // Muhatap listesi → yerde olmayan askerler. 'all' | 'Alfa-2' | ['Alfa-1', 'Alfa-3']
  resolve(addressees) {
    const list = this.game.allies.list.filter((a) => !a.down);
    if (!addressees || addressees === 'all') return list;
    const want = new Set(Array.isArray(addressees) ? addressees : [addressees]);
    return list.filter((a) => want.has(a.callsign));
  }

  label(addressees, list) {
    if (!addressees || addressees === 'all' || list.length === this.game.allies.list.length) return SQUAD.team;
    return list.map((a) => a.callsign).join(', ');
  }

  // Nişangâhın baktığı nokta ve (varsa) düşman: { point, enemy }
  aim(maxDist = 140) {
    const g = this.game;
    g.camera.getWorldPosition(_o);
    g.camera.getWorldDirection(_d);
    const wh = g.world.raycast(_o, _d, maxDist, _hit);
    const far = wh ? wh.dist : maxDist;
    const eh = g.enemies.raycast(_o, _d, far);
    if (eh?.enemy?.alive) return { point: eh.enemy.pos.clone(), enemy: eh.enemy };
    const point = wh ? wh.point.clone() : _o.clone().addScaledVector(_d, Math.min(far, 40));
    point.y = 0;
    return { point, enemy: null };
  }

  // Komut ver. opts: { target (düşman), pos (Vector3), inputMethod, sourceText, silent }
  issue(commandId, addressees = this.addressee, opts = {}) {
    const g = this.game;
    const def = COMMANDS[commandId];
    if (!def || g.mode !== 'mission') return null;
    let list = this.resolve(addressees);
    // "Beni iyileştir"i yalnız medik uygular
    if (commandId === 'HEAL_PLAYER') list = list.filter((a) => a.role === 'medic');
    const who = this.label(addressees, list);
    g.mission?.radio(`${playerLabel(g, SQUAD.playerCallsign)} → ${who}`, opts.sourceText || def.say, 0, 'player');
    if (!list.length) {
      const reason = commandId === 'HEAL_PLAYER' ? 'Medik yerde ya da timde değil' : 'Komutu alacak asker yok';
      g.mission?.radio('TELSİZ', reason, 0, 'system');
      g.events.emit(EV.COMMAND_FAILED, { commandId, addressees: [], reason, inputMethod: opts.inputMethod || 'shortcut' });
      return null;
    }
    let { target = null, pos = null } = opts;
    if ((NEEDS_POINT.has(commandId) && !pos) || (commandId === 'ATTACK' && !target)) {
      const a = this.aim();
      pos = pos || a.point;
      target = target || a.enemy;
    }
    if (commandId === 'ATTACK' && !target) {
      g.mission?.radio(list[0].radioLabel, 'Hedef göremiyorum komutanım!', 0, 'squad', 'reply');
      g.events.emit(EV.COMMAND_FAILED, { commandId, addressees: list.map((a) => a.callsign), reason: 'no-target', inputMethod: opts.inputMethod || 'shortcut' });
      return null;
    }
    const cmd = {
      id: ++this.seq,
      commandId,
      addressees: list.map((a) => a.callsign),
      target,
      pos,
      inputMethod: opts.inputMethod || 'shortcut',
      sourceText: opts.sourceText || def.say,
      pending: new Set(list),
      failed: false,
      t0: g.time,
    };
    this.active.set(cmd.id, cmd);
    g.events.emit(EV.COMMAND_ISSUED, { commandId, addressees: cmd.addressees, target, inputMethod: cmd.inputMethod, sourceText: cmd.sourceText });
    g.save.update((d) => (d.stats.commandsIssued = (d.stats.commandsIssued || 0) + 1));
    // Onay: tim komutunu önce lider yardımcısı (Alfa-1), tek muhatapta kendisi onaylar
    const first = list.find((a) => a.member.confirmsFirst) || list[0];
    if (!opts.silent) first.sayLine(pick(def.confirm), true, 'reply');
    list.forEach((a, i) => a.setOrder(commandId, cmd, i, list.length));
    return cmd;
  }

  // Asker emrini bitirdi; hepsi bitirince komut tamamlanır (rapor satırı son bitirenden)
  complete(ally, cmd, line = null) {
    if (!cmd || !this.active.has(cmd.id)) return;
    cmd.pending.delete(ally);
    if (cmd.pending.size) return;
    this.active.delete(cmd.id);
    if (line) ally.sayLine(line, true);
    this.game.events.emit(EV.COMMAND_COMPLETED, { commandId: cmd.commandId, addressees: cmd.addressees, by: ally.callsign, inputMethod: cmd.inputMethod });
  }

  // Asker emri yapamadı: komut başarısız (gerekçe telsizde)
  fail(ally, cmd, reason, line = null) {
    if (!cmd || !this.active.has(cmd.id)) return;
    this.active.delete(cmd.id);
    if (line) ally.sayLine(line, true);
    this.game.events.emit(EV.COMMAND_FAILED, { commandId: cmd.commandId, addressees: cmd.addressees, by: ally.callsign, reason, inputMethod: cmd.inputMethod });
  }

  // Asker yere düştü ya da yeni emir aldı: eski komuttan çıkar (yalnız kendisi kalmışsa başarısız)
  drop(ally, cmd, reason) {
    if (!cmd || !this.active.has(cmd.id)) return;
    cmd.pending.delete(ally);
    if (!cmd.pending.size) this.fail(ally, cmd, reason);
  }

  update() {
    const g = this.game;
    // Takılı kalan komutlar (ör. yol açılmadı) zaman aşımıyla düşer
    for (const cmd of this.active.values()) {
      if (g.time - cmd.t0 > ORDERS.commandTimeout) {
        const a = [...cmd.pending][0];
        this.active.delete(cmd.id);
        g.events.emit(EV.COMMAND_FAILED, { commandId: cmd.commandId, addressees: cmd.addressees, by: a?.callsign, reason: 'timeout', inputMethod: cmd.inputMethod });
      }
    }
  }
}
