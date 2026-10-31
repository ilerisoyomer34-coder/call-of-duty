// Rekabetçi modun maç arayüzü (matchHud.js kurar): rol (SALDIRI / SAVUNMA), para, bombanın durumu ve ipucu
// ("bombayı kur", "imha et"), kurma/imha ilerleme çubuğu, raunt bantları (satın alma, başla, kazanan ve neden, yarı),
// ölünce izlenen arkadaş. Satın alma menüsü buyScreen.js, dünyadaki işaretler compWorld.js, izleme spectate.js.
// Veri game.net.comp (gameClient: NEV.ROUND_STATE, NEV.BOMB, anlık görüntüdeki para ve eylem).
import { EV } from '../events.js';
import { PHASE, SIDE } from '../../shared/net/protocol.js';
import { BOMB, ACT, ROUND_STATE, ROUND_REASON, SITE_NAMES, COMP_RULES } from '../../shared/sim/competitive.js';
import { COMP_VIEW } from '../config.js';
import { keyName, BINDINGS } from '../input.js';
import { BuyScreen, fmtMoney } from './buyScreen.js';
import { CompWorld } from './compWorld.js';
import { Spectator } from './spectate.js';

const $ = (id) => document.getElementById(id);
const REASON = {
  [ROUND_REASON.ELIM]: 'rakip takım yok edildi',
  [ROUND_REASON.TIME]: 'süre doldu',
  [ROUND_REASON.BOMB]: 'bomba patladı',
  [ROUND_REASON.DEFUSE]: 'bomba imha edildi',
};
const sideName = (s) => (s === SIDE.BLUE ? 'MAVİ' : 'KIRMIZI');

export class CompHud {
  constructor(game, matchHud) {
    this.game = game;
    this.mh = matchHud;
    this.net = null;
    this.buyScreen = new BuyScreen(game);
    this.world = new CompWorld(game);
    this.spectator = new Spectator(game);
    const ev = game.events;
    ev.on(EV.NET_ROUND_STATE, (c) => this.onRoundState(c));
    ev.on(EV.NET_BOMB, (b) => this.onBomb(b));
    ev.on(EV.NET_DEATH, () => this.spectator.onDeath());
    $('mhSpectate').addEventListener('click', () => this.spectator.tap());
  }

  get active() {
    return !!this.net;
  }

  start(net) {
    this.net = net.comp ? net : null;
    document.body.classList.toggle('comp', !!this.net);
    $('mhComp').hidden = !this.net;
    $('mhAct').hidden = true;
    $('mhSpectate').hidden = true;
    if (!this.net) return;
    this.buyScreen.start(net);
    this.world.start(net);
    this.lastBomb = BOMB.NONE;
  }

  stop() {
    if (!this.net) return;
    this.buyScreen.stop();
    this.world.stop();
    this.spectator.release();
    this.net = null;
    document.body.classList.remove('comp');
    $('mhComp').hidden = true;
    $('mhAct').hidden = true;
    $('mhSpectate').hidden = true;
  }

  get attacking() {
    return this.net.comp.attackSide === this.net.mySide;
  }

  // Ayarlardaki atama BINDINGS'e uygulanmış (applyBindingOverrides)
  keyOf(action) {
    const code = BINDINGS[action]?.[0];
    return code ? keyName(code) : '?';
  }

  onRoundState(c) {
    if (!this.net) return;
    const mh = this.mh;
    if (c.state === ROUND_STATE.BUY) {
      const half = c.round === COMP_RULES.rounds.half + 1;
      mh.banner(half ? `İKİNCİ YARI · ROLLER DEĞİŞTİ · RAUNT ${c.round}` : `RAUNT ${c.round} · SATIN ALMA`, COMP_VIEW.bannerSec);
    } else if (c.state === ROUND_STATE.LIVE) {
      mh.banner(this.attacking ? 'SALDIR · BOMBAYI KUR' : 'SAVUN · BÖLGELERİ TUT', 1.6);
    } else if (c.state === ROUND_STATE.POST) {
      const win = c.winner === this.net.mySide;
      mh.banner(`${win ? 'RAUNT SİZİN' : 'RAUNT KAYBEDİLDİ'} · ${sideName(c.winner)} · ${REASON[c.reason] || ''}`, COMP_VIEW.bannerSec, win ? 'win' : 'lose');
      this.game.audio.beep(win ? 880 : 330, 0.25, 0.3);
    }
  }

  onBomb(b) {
    if (!this.net) return;
    const prev = this.lastBomb;
    this.lastBomb = b.state;
    if (b.state === BOMB.PLANTED && prev !== BOMB.PLANTED) {
      this.mh.banner(`BOMBA KURULDU · ${SITE_NAMES[b.site] || ''} BÖLGESİ`, COMP_VIEW.bannerSec, 'bomb');
      this.game.audio.beep(1500, 0.3, 0.35);
    } else if (b.state === BOMB.DROPPED && prev === BOMB.CARRIED && this.attacking) this.mh.banner('BOMBA DÜŞTÜ · AL VE KUR', 1.6);
    else if (b.state === BOMB.EXPLODED) this.game.blastFx(this.game.world.newVec(b.pos.x, b.pos.y + 0.3, b.pos.z), COMP_RULES.bomb.blastRadius, 3);
  }

  // Bomba durum satırı ve ipucu
  bombLine() {
    const net = this.net;
    const C = net.comp;
    const B = C.bomb;
    const use = this.keyOf('interact');
    if (C.state !== ROUND_STATE.LIVE && C.state !== ROUND_STATE.BUY) return '';
    if (B.state === BOMB.PLANTED) return this.attacking ? `BOMBA ${SITE_NAMES[B.site] || ''} BÖLGESİNDE · KORU` : `BOMBA ${SITE_NAMES[B.site] || ''} BÖLGESİNDE · İMHA ET (${use} basılı)`;
    if (!this.attacking) return 'BÖLGELERİ SAVUN · A · B';
    if (B.state === BOMB.CARRIED && B.slot === net.slot) return `BOMBA SENDE · A ya da B bölgesinde ${use} basılı tut`;
    if (B.state === BOMB.DROPPED) return 'BOMBA YERDE · üstünden geçen alır';
    if (B.state === BOMB.CARRIED) {
      const p = net.roster.find((q) => q.slot === B.slot);
      return `BOMBA ${p ? p.name : 'arkadaşında'} · ona eşlik et`;
    }
    return '';
  }

  update(dt, input) {
    const net = this.net;
    if (!net) return;
    const C = net.comp;
    this.buyScreen.update(input);
    this.world.update(dt);
    $('mhRole').textContent = this.attacking ? 'SALDIRI' : 'SAVUNMA';
    $('mhRole').className = `mhRole ${this.attacking ? 'att' : 'def'}`;
    $('mhMoney').textContent = fmtMoney(C.money);
    const line = this.bombLine();
    $('mhBomb').textContent = line;
    $('mhBomb').classList.toggle('planted', C.bomb.state === BOMB.PLANTED);
    $('mhBomb').hidden = !line;
    // Kurma / imha ilerlemesi (sunucunun saydığı)
    const act = this.game.player.alive ? C.act : ACT.NONE;
    $('mhAct').hidden = act === ACT.NONE;
    if (act !== ACT.NONE) {
      $('mhActLabel').textContent = act === ACT.PLANT ? 'BOMBA KURULUYOR · hareket etme' : 'BOMBA İMHA EDİLİYOR · hareket etme';
      $('mhActBar').style.width = `${Math.round(C.actProgress * 100)}%`;
    }
  }

  // Kameradan sonra (main.js): ölüyken arkadaşı izle
  updateCamera(dt, input) {
    if (!this.net) return false;
    const r = this.spectator.update(dt, input);
    const el = $('mhSpectate');
    el.hidden = !r;
    if (r) {
      const info = r.info;
      $('mhSpectateName').textContent = info ? `${info.name}${info.flags & 1 ? ' · YZ' : ''}` : '';
    }
    return !!r;
  }

  updateTags(hud, w, h) {
    if (this.net) this.world.updateTags(hud, w, h);
  }

  drawRadar(ctx, toMap, R, yaw) {
    if (this.net) this.world.drawRadar(ctx, toMap, R, yaw);
  }

  // Ölüm kartının alt satırı
  deathText() {
    const C = this.net.comp;
    if (C.state === ROUND_STATE.POST || this.net.phase === PHASE.ROUND_END) return 'Raunt bitti · yeni raunt başlıyor';
    return 'Raunt sonunda doğacaksın';
  }
}
