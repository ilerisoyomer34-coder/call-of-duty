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
const QUERIES = new Set(['HELP', 'STATUS']);

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _hit = {};

export class CommandSystem {
  constructor(game) {
    this.game = game;
    this.seq = 0;
    this.active = new Map(); // id → komut
    this.plans = new Map(); // Sıralı telsiz emirleri, sonraki adım yalnız tamamlanınca başlar.
    this.planSeq = 0;
    this.addressee = 'all'; // seçili muhatap: 'all' | çağrı kodu
    this.radioContext = {};
  }

  clear() {
    this.active.clear();
    this.plans.clear();
    this.addressee = 'all';
    this.radioContext = {};
  }

  // Muhatap listesi → yerde olmayan askerler. 'all' | 'Alfa-2' | ['Alfa-1', 'Alfa-3']
  resolve(addressees) {
    const list = this.game.allies.list.filter((a) => !a.down && !a.dead);
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

  // Yeni doğrudan emir, aynı askerlere verilmiş eski planın ilerlemesini durdurur.
  cancelPlans(addressees = 'all') {
    const wanted = new Set(this.resolve(addressees).map((a) => a.callsign));
    for (const [id, plan] of this.plans) {
      if (plan.steps.some((step) => this.resolve(step.addressees).some((a) => wanted.has(a.callsign)))) this.plans.delete(id);
    }
  }

  // Yalnız oyuncunun görebildiği düşmanlar doğal dilde seçilebilir.
  visibleEnemy(dir = null, anchor = this.game.player) {
    if (!anchor?.pos) return null;
    const g = this.game;
    const eye = anchor.pos.clone().add(new THREE.Vector3(0, 1.5, 0));
    const yaw = (anchor.yaw || 0) - ((dir?.clock || 0) / 12) * Math.PI * 2;
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    return (g.enemies?.list || []).filter((enemy) => {
      if (!enemy.alive || enemy.dummy || enemy.pos.distanceToSquared(anchor.pos) > 140 * 140) return false;
      const delta = enemy.pos.clone().sub(anchor.pos).setY(0).normalize();
      if (dir && delta.dot(forward) < Math.cos(Math.PI / 4)) return false;
      const ray = enemy.pos.clone().add(new THREE.Vector3(0, 1.2, 0)).sub(eye);
      const length = ray.length();
      const hit = g.world?.raycast?.(eye, ray.normalize(), length, {});
      return !hit || hit.dist >= length - 0.5;
    }).sort((a, b) => a.pos.distanceToSquared(anchor.pos) - b.pos.distanceToSquared(anchor.pos))[0] || null;
  }

  // Yapı ve araç merkezi çarpıştırıcının içinde olabilir. Yakınındaki yürünebilir
  // noktayı seç; kilometrelerce uzakta başka bir yere sessizce yönlendirme.
  approachPoint(point) {
    const pos = point.clone().setY(0);
    const nav = this.game.nav;
    if (!nav?.isWalkable || nav.isWalkable(pos.x, pos.z)) return pos;
    const player = this.game.player?.pos || pos;
    const start = Math.atan2(player.z - pos.z, player.x - pos.x);
    for (let radius = 1; radius <= 6; radius++) {
      for (let i = 0; i < 12; i++) {
        const angle = start + (i / 12) * Math.PI * 2;
        const x = pos.x + Math.cos(angle) * radius; const z = pos.z + Math.sin(angle) * radius;
        if (nav.isWalkable(x, z)) return new THREE.Vector3(x, 0, z);
      }
    }
    return pos; // Askerin yol bulucusu ulaşılamıyorsa açıkça rapor eder.
  }

  intentTarget(step, context = {}) {
    const g = this.game; const mission = g.mission;
    const anchor = context.anchor || g.player;
    let pos = null; let target = null;
    const kind = step.reference?.kind;
    if (kind === 'previous') {
      pos = context.previousPoint?.clone();
      target = context.previousTarget?.alive ? context.previousTarget : null;
      if (step.commandId === 'ATTACK' && !target) return { reason: 'Önceki saldırı hedefi artık uygun değil. Yeni hedefi nişangâhla gösterin.' };
    } else if (kind === 'player') pos = anchor?.pos?.clone();
    else if (kind === 'objective') {
      const markers = mission?.current?.marker?.();
      const points = (Array.isArray(markers) ? markers : [markers]).filter(Boolean);
      points.sort((a, b) => a.distanceToSquared(anchor.pos) - b.distanceToSquared(anchor.pos));
      pos = points[0]?.clone();
    } else if (kind === 'extraction') pos = (mission?.extractPoint?.() || mission?.data?.lz)?.clone();
    else if (kind === 'intel') pos = mission?.data?.laptop?.pos?.clone();
    else if (kind === 'helicopter') pos = mission?.heli?.root?.position?.clone();
    else if (kind === 'tank') {
      const tanks = (mission?.tanks || []).filter((tank) => !tank.destroyed && tank.pos);
      tanks.sort((a, b) => a.pos.distanceToSquared(anchor.pos) - b.pos.distanceToSquared(anchor.pos));
      pos = tanks[0]?.pos.clone();
    } else if (kind === 'nearest-enemy' || (step.commandId === 'ATTACK' && step.dir)) {
      target = this.visibleEnemy(step.dir, anchor);
      pos = target?.pos.clone();
      if (!target) return { reason: 'Bu yönde görüşte uygun düşman yok. Hedefi nişangâhla gösterin.' };
    } else if (step.dir && anchor?.pos) {
      const yaw = anchor.yaw - (step.dir.clock / 12) * Math.PI * 2;
      pos = anchor.pos.clone();
      pos.x -= Math.sin(yaw) * (step.distance || 15);
      pos.z -= Math.cos(yaw) * (step.distance || 15);
    } else if (NEEDS_POINT.has(step.commandId) || step.commandId === 'ATTACK') {
      const aim = context.aim || this.aim();
      pos = aim.point?.clone(); target = aim.enemy;
    }
    if (kind && !pos) return { reason: kind === 'nearest-enemy' ? 'Görüşte uygun düşman yok.' : 'Bu görevde istenen hedef noktası bulunamadı. Noktayı nişangâhla gösterip tekrar emir verin.' };
    return { pos: pos && NEEDS_POINT.has(step.commandId) ? this.approachPoint(pos) : pos, target };
  }

  report(addressees) {
    const names = new Set(Array.isArray(addressees) ? addressees : [addressees]);
    const list = this.game.allies.list.filter((ally) => !addressees || addressees === 'all' || names.has(ally.callsign));
    if (!list.length) { this.game.mission?.radio('TELSİZ', 'Bu çağrı kodunda asker yok.', 0, 'system'); return; }
    for (const ally of list) {
      if (ally.dead || ally.down) { this.game.mission?.radio('TELSİZ', `${ally.callsign}: ${ally.dead ? 'Kayıp.' : 'Yaralı, yardım bekliyor.'}`, 0, 'system'); continue; }
      const hp = ally.health ? `Sağlık %${Math.round(100 * ally.health.hp / ally.health.max)}. ` : '';
      const order = COMMANDS[ally.order?.id]?.label || 'Hazır';
      ally.sayLine(`${hp}Emir: ${order}. ${ally.holdFire ? 'Ateş kapalı.' : 'Ateş serbest.'}`, true, 'reply');
    }
  }

  // Telsizin tek giriş noktası; tuş/çark emirleri issue ile çalışmayı sürdürür.
  issuePlan(parsed, opts = {}) {
    if (!parsed || parsed.commandId === 'UNKNOWN' || this.game.mode !== 'mission') return null;
    const steps = parsed.steps || [parsed];
    for (const step of steps) if (!QUERIES.has(step.commandId)) this.cancelPlans(step.addressees);
    const needsAim = steps.some((step) => !step.dir && !step.reference && (NEEDS_POINT.has(step.commandId) || step.commandId === 'ATTACK'));
    const plan = {
      id: ++this.planSeq, steps, index: 0, waiting: false, ...opts,
      context: { anchor: this.game.player ? { pos: this.game.player.pos.clone(), yaw: this.game.player.yaw } : null, aim: needsAim ? this.aim() : null,
        previousPoint: this.radioContext.point?.clone(), previousTarget: this.radioContext.target },
    };
    this.plans.set(plan.id, plan);
    if (steps.length > 1) this.game.mission?.radio('TELSİZ', `${steps.length} adımlı emir alındı. Her adım tamamlanınca sıradaki uygulanacak.`, 0, 'system');
    this.advancePlan(plan);
    return plan;
  }

  advancePlan(plan) {
    if (!this.plans.has(plan.id) || plan.waiting) return;
    const step = plan.steps[plan.index++];
    if (!step) { this.plans.delete(plan.id); return; }
    if (step.commandId === 'HELP') { this.game.mission?.radio('TELSİZ', CMD.help, 0, 'system'); return; }
    if (step.commandId === 'STATUS') { this.report(step.addressees); return; }
    if (step.commandId === 'CANCEL_PLAN') {
      for (const ally of this.resolve(step.addressees)) {
        this.drop(ally, ally.focusCmd, 'cancelled');
        this.drop(ally, ally.suppress?.cmd, 'cancelled');
        ally.focus = null; ally.focusCmd = null; ally.suppress = null;
      }
    }
    const id = step.commandId === 'CANCEL_PLAN' ? 'HOLD' : step.commandId;
    const binding = this.intentTarget(step, plan.context);
    if (binding.reason) { this.stopPlan(plan.id, binding.reason); return; }
    plan.waiting = true;
    const cmd = this.issue(id, step.addressees, {
      inputMethod: plan.inputMethod || 'text', sourceText: plan.inputMethod === 'voice' ? `🎤 ${step.sourceText}` : step.sourceText,
      ...binding, planId: plan.id,
    });
    if (!cmd) this.stopPlan(plan.id, 'Emir uygulanamadı; kalan adımlar durduruldu.');
    else if (!cmd.failed) {
      this.radioContext.addressees = step.addressees;
      this.radioContext.lastOrder = { ...step, commandId: id };
      if (!['HOLD', 'HOLD_FIRE', 'FREE_FIRE', 'CANCEL_PLAN'].includes(step.commandId)) this.radioContext.resumeOrder = { ...step };
      // Bekle/ateşi kes gibi yan emirler son hedefi silmez; “aynı yere git”
      // nişangâh sonradan dönse de gerçekten verilen son noktayı kullanır.
      if (cmd.pos) this.radioContext.point = cmd.pos.clone();
      if (cmd.target) this.radioContext.target = cmd.target;
      if (cmd.pos) plan.context.previousPoint = cmd.pos.clone();
      if (cmd.target) plan.context.previousTarget = cmd.target;
    }
  }

  stopPlan(id, reason) {
    if (!id || !this.plans.has(id)) return;
    this.plans.delete(id);
    this.game.mission?.radio('TELSİZ', reason, 0, 'system');
  }

  // Komut ver. opts: { target (düşman), pos (Vector3), inputMethod, sourceText, silent }
  issue(commandId, addressees = this.addressee, opts = {}) {
    const g = this.game;
    const def = COMMANDS[commandId];
    if (!def || g.mode !== 'mission') return null;
    if (!opts.planId) this.cancelPlans(addressees);
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
      planId: opts.planId || null,
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
    const plan = this.plans.get(cmd.planId);
    if (plan) plan.waiting = false;
    if (line) ally.sayLine(line, true);
    this.game.events.emit(EV.COMMAND_COMPLETED, { commandId: cmd.commandId, addressees: cmd.addressees, by: ally.callsign, inputMethod: cmd.inputMethod });
  }

  // Asker emri yapamadı: komut başarısız (gerekçe telsizde)
  fail(ally, cmd, reason, line = null) {
    if (!cmd || !this.active.has(cmd.id)) return;
    cmd.failed = true;
    this.active.delete(cmd.id);
    this.stopPlan(cmd.planId, 'Emir tamamlanamadı; kalan adımlar durduruldu.');
    if (line) ally?.sayLine(line, true);
    this.game.events.emit(EV.COMMAND_FAILED, { commandId: cmd.commandId, addressees: cmd.addressees, by: ally?.callsign, reason, inputMethod: cmd.inputMethod });
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
        this.fail(a, cmd, 'timeout');
      }
    }
    // Senkron tamamlanan HOLD/FREE_FIRE gibi emirlerde sonraki adımı askerlerin
    // setOrder çağrısının içinden başlatma: eski emir yenisini ezebilir.
    for (const plan of this.plans.values()) if (!plan.waiting) this.advancePlan(plan);
  }
}
