// Çevrim içi maç arayüzü (S6): skor çubuğu ve süre, geri sayım bandı, öldürme akışı, puan tablosu (Tab basılı;
// dokunmatikte skor çubuğuna dokun), ölüm kartı (kim vurdu, doğuşa kalan), maç sonu ekranı.
// Veri game.net'ten ve olaylardan (EV.NET_*); adlar sunucudan geldiği için hep textContent.
import { EV } from '../events.js';
import { PHASE, SIDE, RF, WEAPON_MELEE, SLOT_NONE } from '../../shared/net/protocol.js';
import { WEAPON_ORDER, WEAPONS } from '../config.js';
import { weaponShortName } from '../weaponInfo.js';
import MODES from '../data/modes.json' with { type: 'json' };
import ARENAS from '../data/arenas.json' with { type: 'json' };

const $ = (id) => document.getElementById(id);
const FEED_MAX = 5;
const FEED_SEC = 6;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
export const modeTitle = (id) => (id === 'sandbox' ? MODES.sandbox.name : MODES.modes.find((m) => m.id === id)?.name || id);

export class MatchHud {
  constructor(game) {
    this.game = game;
    this.net = null;
    this.active = false;
    this.pinned = false; // dokunmatikte tablo açık kalır
    this.feed = [];
    this.boardSig = '';
    $('mhBar').addEventListener('click', () => {
      if (!this.active) return;
      this.pinned = !this.pinned;
    });
    $('btnMhMenu').addEventListener('click', () => game.leaveOnline());
    const ev = game.events;
    ev.on(EV.NET_KILL, (k) => this.onKill(k));
    ev.on(EV.NET_ROSTER, () => (this.boardSig = ''));
    ev.on(EV.NET_ROUND, (r) => {
      if (r.code === 1) this.banner('MAÇ BAŞLADI', 1.6);
    });
    ev.on(EV.NET_MATCH_END, () => this.showEnd());
    ev.on(EV.NET_SPAWN, () => ($('mhDeath').hidden = true));
  }

  start(net) {
    this.net = net;
    this.active = true;
    this.pinned = false;
    this.feed = [];
    $('mhFeed').textContent = '';
    $('mhEnd').hidden = true;
    $('mhBoard').hidden = true;
    $('mhDeath').hidden = true;
    $('mhBanner').hidden = true;
    const W = net.welcome;
    const sandbox = W.mode === 'sandbox';
    const arena = ARENAS[W.map]?.name || W.map;
    $('mhInfo').textContent = `${modeTitle(W.mode).toLocaleUpperCase('tr-TR')} · ${arena.toLocaleUpperCase('tr-TR')} · ODA ${W.room}`;
    $('matchHud').hidden = false;
    $('mhBar').classList.toggle('sandbox', sandbox);
    document.body.classList.add('online');
  }

  stop() {
    this.active = false;
    this.net = null;
    $('matchHud').hidden = true;
    document.body.classList.remove('online');
  }

  banner(text, sec) {
    const b = $('mhBanner');
    b.textContent = text;
    b.hidden = false;
    this.bannerUntil = performance.now() + sec * 1000;
  }

  onKill(k) {
    if (!this.active) return;
    const row = el('div', `mhKill${k.mine ? ' mine' : ''}${k.me ? ' me' : ''}`);
    const side = (p) => (p && this.net.remotes.sided ? (p.side === this.net.mySide ? 'blue' : 'red') : p?.slot === this.net.slot ? 'blue' : 'red');
    const who = (p) => {
      const s = el('b', side(p), p ? p.name : 'Dünya');
      if (p && p.flags & RF.BOT) s.append(el('small', '', 'YZ'));
      return s;
    };
    const wid = WEAPON_ORDER[k.weapon];
    const wname = k.weapon === WEAPON_MELEE ? 'Bıçak' : wid && WEAPONS[wid] ? weaponShortName(wid) : '';
    if (k.killer && k.killer.slot !== k.victim?.slot) row.append(who(k.killer), el('span', 'w', `${wname}${k.head ? ' ✛' : ''}`), who(k.victim));
    else row.append(who(k.victim), el('span', 'w', 'düştü'));
    $('mhFeed').prepend(row);
    this.feed.push({ row, until: performance.now() + FEED_SEC * 1000 });
    while ($('mhFeed').children.length > FEED_MAX) $('mhFeed').lastElementChild.remove();
    if (k.me) {
      $('mhKiller').textContent = k.killer && k.killer.slot !== k.victim?.slot ? `${k.killer.name}${k.killer.flags & RF.BOT ? ' (YZ)' : ''} seni vurdu` : 'Öldün';
      $('mhDeath').hidden = false;
    }
    if (k.mine && !k.me) this.game.events.emit('pickup', k.head ? 'KAFADAN · +125' : 'ÖLDÜRME · +100');
  }

  update(dt, input) {
    if (!this.active) return;
    const net = this.net;
    const now = performance.now();
    for (let i = this.feed.length - 1; i >= 0; i--) {
      if (now > this.feed[i].until) {
        this.feed[i].row.remove();
        this.feed.splice(i, 1);
      }
    }
    if (this.bannerUntil && now > this.bannerUntil) {
      $('mhBanner').hidden = true;
      this.bannerUntil = 0;
    }
    // Skor ve süre
    const sided = net.remotes.sided;
    $('mhLabelA').textContent = sided ? (net.mySide === SIDE.BLUE ? 'MAVİ · SİZ' : 'MAVİ') : 'SEN';
    $('mhLabelB').textContent = sided ? (net.mySide === SIDE.RED ? 'KIRMIZI · SİZ' : 'KIRMIZI') : 'LİDER';
    $('mhScoreA').textContent = String(net.scoreA);
    $('mhScoreB').textContent = String(net.scoreB);
    const limit = net.welcome.scoreLimit;
    $('mhLimit').textContent = limit ? `${limit} öldürme` : '';
    const left = net.timeLeft;
    $('mhTime').textContent = net.phase === PHASE.LIVE && net.welcome.timeLimit ? fmtTime(left) : net.phase === PHASE.WARMUP ? fmtTime(left) : net.phase === PHASE.ENDED ? 'BİTTİ' : '∞';
    if (net.phase === PHASE.WARMUP) {
      $('mhBanner').textContent = `MAÇ BAŞLIYOR · ${Math.max(1, Math.ceil(left))}`;
      $('mhBanner').hidden = false;
      this.bannerUntil = now + 200;
    }
    // Ölüm kartı: doğuşa kalan
    if (!net.me.alive && net.state === 'playing' && net.phase !== PHASE.ENDED) {
      $('mhDeath').hidden = false;
      $('mhRespawn').textContent = net.me.respawnIn > 0 ? `Yeniden doğuş: ${Math.ceil(net.me.respawnIn)} sn` : 'Doğuyor…';
    } else if (net.me.alive) $('mhDeath').hidden = true;
    // Puan tablosu
    const show = input.isDown('scoreboard') || this.pinned;
    $('mhBoard').hidden = !show || !$('mhEnd').hidden;
    if (show) this.renderBoard($('mhBoardBody'));
  }

  sortedRoster() {
    const net = this.net;
    return [...net.roster].sort((a, b) => (net.remotes.sided ? a.side - b.side : 0) || b.kills - a.kills || b.score - a.score || a.deaths - b.deaths);
  }

  renderBoard(body) {
    const net = this.net;
    const rows = this.sortedRoster();
    const sig = rows.map((p) => `${p.slot}:${p.kills}:${p.deaths}:${p.score}:${Math.round(p.ping / 10)}`).join('|');
    if (sig === this.boardSig && body.children.length) return;
    this.boardSig = sig;
    body.textContent = '';
    const myParty = net.roster.find((p) => p.slot === net.slot)?.party;
    let side = -1;
    for (const p of rows) {
      if (net.remotes.sided && p.side !== side) {
        side = p.side;
        const h = el('div', `mhRow head ${side === SIDE.BLUE ? 'blue' : 'red'}`);
        h.append(el('span', 'nm', side === SIDE.BLUE ? 'MAVİ TARAF' : 'KIRMIZI TARAF'), el('span', '', 'ÖLD.'), el('span', '', 'ÖLÜM'), el('span', '', 'PUAN'), el('span', '', 'PİNG'));
        body.append(h);
      }
      const r = el('div', `mhRow${p.slot === net.slot ? ' me' : ''}${p.flags & RF.BOT ? ' bot' : ''}`);
      const nm = el('span', 'nm', p.name);
      if (p.flags & RF.BOT) nm.append(el('small', 'yz', 'YZ'));
      else if (p.tag) nm.append(el('small', 'tg', `#${p.tag}`));
      if (myParty && p.party === myParty && p.slot !== net.slot) nm.append(el('small', 'pt', 'TAKIM'));
      r.append(nm, el('span', '', String(p.kills)), el('span', '', String(p.deaths)), el('span', '', String(p.score)), el('span', '', p.flags & RF.BOT ? '—' : String(p.ping)));
      body.append(r);
    }
  }

  showEnd() {
    if (!this.active) return;
    const net = this.net;
    const r = net.result;
    let title = 'MAÇ BİTTİ';
    let cls = '';
    if (net.remotes.sided) {
      if (r.winner === SIDE.NONE) title = 'BERABERE';
      else if (r.winner === net.mySide) {
        title = 'ZAFER';
        cls = 'win';
      } else {
        title = 'YENİLGİ';
        cls = 'lose';
      }
    } else if (r.winner !== SLOT_NONE) {
      const w = net.roster.find((p) => p.slot === r.winner);
      title = r.winner === net.slot ? 'BİRİNCİ OLDUN' : `KAZANAN: ${w ? w.name : '?'}`;
      cls = r.winner === net.slot ? 'win' : '';
    }
    $('mhEndTitle').textContent = title;
    $('mhEndTitle').className = cls;
    $('mhEndSub').textContent = net.remotes.sided ? `Mavi ${r.scoreA} – ${r.scoreB} Kırmızı · ${r.reason === 1 ? 'skor sınırı' : 'süre doldu'}` : r.reason === 1 ? 'Öldürme sınırına ulaşıldı' : 'Süre doldu';
    this.boardSig = '';
    this.renderBoard($('mhEndBody'));
    $('mhEnd').hidden = false;
    $('mhBoard').hidden = true;
    $('mhDeath').hidden = true;
    this.game.input.exitLock();
  }
}
