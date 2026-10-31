import {recommendedLevel, levelLabel} from './campaign.js';
// Lobi (ana sayfa, CODM düzeni): oyuncu kartı (rütbe amblemi, seviye, XP çubuğu), günün görevleri, 7 günlük giriş
// ödülü, sıradaki görev ve BAŞLA. Veriler progression.js'ten; 3B operatör main.js → lobby sahnesinde.
// Kullanıcı metni hep textContent (oyuncu adı dahil).
import { LEVELS, MAPS, DIFFICULTY } from './config.js';
import { PROG } from './progression.js';
import { weaponName } from './weaponInfo.js';
import { formatKR } from './economy.js';
import { EV } from './events.js';

const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// Rütbe amblemi (SVG): erbaşlarda 1–4 ok (çavuş şeridi), subay ve astsubaylarda 1–4 yıldız, generallerde
// defne dallı yıldızlar. Kalkan zemini rütbe kademesiyle koyulaşır
export function rankEmblem(index) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 40 40');
  const add = (tag, attrs) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    svg.appendChild(e);
    return e;
  };
  const tier = index < 5 ? 0 : index < 12 ? 1 : 2;
  const fill = ['#2a3036', '#2b2a1c', '#3a1d14'][tier];
  add('path', { d: 'M20 2 L36 8 V20 C36 29 29 35 20 38 C11 35 4 29 4 20 V8 Z', fill, stroke: '#f0a33a', 'stroke-width': '1.6' });
  const gold = '#ffcf5c';
  if (tier === 0) {
    const n = Math.min(4, index + 1);
    for (let i = 0; i < n; i++) {
      const y = 25 - i * 5 + (n - 1) * 2.5;
      add('path', { d: `M11 ${y} L20 ${y - 5} L29 ${y}`, fill: 'none', stroke: gold, 'stroke-width': '2.6', 'stroke-linejoin': 'round' });
    }
  } else {
    const n = tier === 1 ? ((index - 5) % 4) + 1 : Math.min(4, index - 11);
    const star = (cx, cy, r) => {
      let d = '';
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const rr = k % 2 ? r * 0.45 : r;
        d += `${k ? 'L' : 'M'}${(cx + Math.cos(a) * rr).toFixed(2)} ${(cy + Math.sin(a) * rr).toFixed(2)}`;
      }
      add('path', { d: `${d}Z`, fill: gold });
    };
    const xs = n === 1 ? [20] : n === 2 ? [15, 25] : n === 3 ? [12, 20, 28] : [11, 17, 23, 29];
    for (const x of xs) star(x, 19, n > 2 ? 4 : 5);
    // Üst subaylarda (binbaşı ve üstü) alt şerit, generallerde defne dalı
    if (index >= 9) add('path', { d: 'M10 28 H30', stroke: gold, 'stroke-width': '2' });
    if (tier === 2) add('path', { d: 'M9 26 C12 33 17 34 20 34 C23 34 28 33 31 26', fill: 'none', stroke: '#9fc06a', 'stroke-width': '2' });
  }
  return svg;
}

export class Lobby {
  constructor(game, menus) {
    this.game = game;
    this.menus = menus;
    const g = game;
    const click = (id, fn) => $(id)?.addEventListener('click', () => {
      g.audio.init();
      g.audio.uiClick();
      fn();
    });
    // Ses düğmesi: tıklama sesi sessizden çıkarken toggleSound içinde çalar
    $('btnSound')?.addEventListener('click', () => g.toggleSound());
    click('btnQuick', () => this.quickStart());
    click('btnLoadoutMenu', () => menus.loadoutScreen.open('Teçhizat · lobiden'));
    click('btnDaily', () => this.claim());
    const refresh = () => {
      if (menus.current === 'menu') this.refresh();
    };
    for (const ev of [EV.XP_GAINED, EV.LEVEL_UP, EV.DAILY_CLAIMED, EV.CHALLENGE_DONE, EV.CREDITS_CHANGED, EV.PROFILE_CHANGED]) g.events.on(ev, refresh);
  }

  // Sıradaki görev: açılmış en yüksek seviye, son seçilen zorluk
  next() {
    const g = this.game;
    const level = recommendedLevel(g.progress);
    const diff = DIFFICULTY[g.save.data.progress.lastDiff] ? g.save.data.progress.lastDiff : 'normal';
    return { level, diff };
  }

  // BAŞLA: tek dokunuşla sıradaki görev (teçhizat kayıttaki gibi); brifing ve teçhizat Kampanya kartında
  quickStart() {
    const { level, diff } = this.next();
    this.game.loadouts.repair();
    this.menus.pendingDiff = diff;
    this.menus.pendingLevel = level.id;
    this.game.startMode('mission', diff, level.id);
  }

  claim() {
    const r = this.game.progression.claimDaily();
    if (!r) return;
    this.game.audio.purchase?.();
    this.menus.notice(`Günlük ödül · ${r.day}. gün: +${formatKR(r.credits)} · +${r.xp} XP`);
    this.refresh();
  }

  refresh() {
    const g = this.game;
    const P = g.progression;
    if (!P) return;
    // Oyuncu kartı
    const L = P.level;
    const rank = P.rank;
    const em = $('lbEmblem');
    if (em) em.replaceChildren(rankEmblem(rank.index));
    $('lbRank').textContent = rank.name;
    $('lbLevel').textContent = String(L.level);
    $('lbXpBar').style.width = `${Math.round(L.frac * 100)}%`;
    $('lbXpText').textContent = L.max ? 'EN YÜKSEK SEVİYE' : `${L.into.toLocaleString('tr-TR')} / ${L.need.toLocaleString('tr-TR')} XP`;
    // Günün görevleri
    const list = $('lbChallenges');
    list.replaceChildren();
    for (const c of P.challenges()) {
      const li = el('li', c.done ? 'done' : '');
      const bar = el('i');
      const fill = el('b');
      fill.style.width = `${Math.round((c.progress / c.count) * 100)}%`;
      bar.append(fill);
      li.append(el('span', null, `${c.done ? '✓ ' : ''}${c.name}`), el('em', null, `+${formatKR(c.credits)}`), bar, el('small', null, `${c.progress}/${c.count} · +${c.xp} XP`));
      list.append(li);
    }
    // Günlük giriş ödülü: yedi günlük şerit, alınacak gün vurgulu
    const D = P.daily();
    const pips = $('lbPips');
    pips.replaceChildren();
    PROG.daily.credits.forEach((kr, i) => {
      const day = i + 1;
      const got = D.canClaim ? day < D.day : day <= D.day;
      const li = el('li', got ? 'got' : day === D.day && D.canClaim ? 'now' : '');
      li.append(el('b', null, `${day}.G`), document.createTextNode(kr >= 1000 ? `${kr / 1000}B` : String(kr)));
      pips.append(li);
    });
    $('lbStreak').textContent = `Seri: ${D.canClaim ? D.streak - 1 : D.streak} gün`;
    const btn = $('btnDaily');
    btn.disabled = !D.canClaim;
    btn.classList.toggle('ready', D.canClaim);
    btn.textContent = D.canClaim ? `Ödülü al · +${formatKR(PROG.daily.credits[D.day - 1])}` : 'Alındı · yarın yine gel';
    // Sıradaki görev
    const { level, diff } = this.next();
    $('lbNextName').textContent = `${levelLabel(level)} · ${MAPS[level.map]?.name || level.name}`;
    const lo = g.loadout;
    const arms = [lo?.primary, lo?.secondary].filter(Boolean).map((id) => weaponName(id)).join(' + ');
    $('lbNextSub').textContent = `${DIFFICULTY[diff].label}${arms ? ` · ${arms}` : ''}`;
  }
}
