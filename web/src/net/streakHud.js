// Çevrim içi seri ödülleri arayüzü (İHA, hava saldırısı, topçu; kurallar shared/sim/streaks.js, sunucu sim.useStreak).
//   - Sağ altta üç ödül rozeti: ölmeden art arda öldürme ilerlemesi (2/5), hazır olan parlar; tuşu (7/8/9) ya da
//     rozete dokunmak kullanır (komutun STREAK bitleri: hedef nişangâhın gösterdiği yer, sunucu ışınla bulur).
//   - Hazır olunca ve biri kullanınca bant/akış; İHA takımındaysa süre boyunca rakipler duvar ardından kırmızı
//     işaretle görünür; hava saldırısı ve topçuda jet/ıslık sesi (patlamalar NEV.BLAST ile gelir).
// Veri: gameClient.streak (anlık görüntü: art arda öldürme, hazır ödüller), olay NEV.STREAK → EV.NET_STREAK.
import * as THREE from 'three';
import { EV } from '../events.js';
import { STREAKS } from '../../shared/sim/streaks.js';
import { BINDINGS, keyName } from '../input.js';

const $ = (id) => document.getElementById(id);
const _v = new THREE.Vector3();
const ACTIONS = ['streak1', 'streak2', 'streak3'];

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export class StreakHud {
  constructor(game, matchHud) {
    this.game = game;
    this.mh = matchHud;
    this.net = null;
    this.badges = [];
    this.marks = [];
    this.uavUntil = 0;
    const root = $('mhStreaks');
    STREAKS.forEach((s, i) => {
      const b = el('button', 'mhStreak');
      b.type = 'button';
      b.dataset.streak = s.id;
      const key = el('kbd');
      b.append(el('b', null, s.short), el('small', 'n'), key);
      b.title = `${s.name}: ${s.desc}`;
      b.addEventListener('click', () => this.use(i));
      root.append(b);
      this.badges.push({ b, n: b.querySelector('.n'), key });
    });
    game.events.on(EV.NET_STREAK, (e) => this.onStreak(e));
  }

  start(net) {
    this.net = net;
    this.uavUntil = 0;
    // Rekabetçide seri ödülü yok
    $('mhStreaks').hidden = !net.streaks;
    this.badges.forEach((x, i) => {
      const code = BINDINGS[ACTIONS[i]]?.[0];
      x.key.textContent = code ? keyName(code) : '';
    });
  }

  stop() {
    this.net = null;
    for (const m of this.marks) m.remove();
    this.marks = [];
    $('mhStreaks').hidden = true;
  }

  use(i) {
    const net = this.net;
    if (!net?.streaks || !(net.streak.ready & (1 << i)) || !this.game.player.alive) return;
    net.useStreak(i);
    this.game.audio.uiClick?.();
  }

  onStreak(e) {
    const net = this.net;
    if (!net) return;
    const s = STREAKS[e.kind];
    const mine = e.slot === net.slot;
    if (e.state === 0) {
      // Hazır (yalnız kendisine gelir)
      this.mh.banner(`${s.name.toLocaleUpperCase('tr-TR')} HAZIR · ${this.badges[e.kind].key.textContent}`, 2.2, 'win');
      this.game.audio.beep(1320, 0.12, 0.3);
      return;
    }
    const who = net.rosterOf(e.slot);
    const friendly = mine || net.remotes.isFriendly(e.slot);
    this.game.events.emit('pickup', `${mine ? 'SEN' : who?.name || '?'} · ${s.name}`);
    if (s.id === 'uav' && friendly) this.uavUntil = performance.now() + s.duration * 1000;
    if (s.id === 'uav' && !friendly) this.mh.banner('RAKİP İHA HAVADA', 1.8, 'lose');
    if (s.id === 'airstrike' || s.id === 'artillery') {
      this.game.audio.incoming?.(s.id === 'airstrike', e.pos);
      if (!friendly) this.mh.banner(s.id === 'airstrike' ? 'HAVA SALDIRISI GELİYOR' : 'TOPÇU ATIŞI GELİYOR', 2, 'lose');
    }
  }

  update(input) {
    const net = this.net;
    if (!net?.streaks) return;
    const st = net.streak;
    this.badges.forEach((x, i) => {
      const ready = !!(st.ready & (1 << i));
      x.b.classList.toggle('ready', ready);
      x.n.textContent = ready ? 'HAZIR' : `${Math.min(st.kills, STREAKS[i].kills)}/${STREAKS[i].kills}`;
      if (ready && input.pressed(ACTIONS[i])) this.use(i);
    });
  }

  // İHA: takımın rakipleri duvar ardından işaretli (konumları zaten anlık görüntüde; yalnız görünüm)
  updateMarks(hud, width, height) {
    const net = this.net;
    let at = 0;
    if (net && performance.now() < this.uavUntil) {
      const RP = net.remotes;
      for (const r of RP.map.values()) {
        if (!r.alive || !r.hasPose || RP.isFriendly(r.slot)) continue;
        _v.set(r.pos.x, r.pos.y + 2.2, r.pos.z);
        const s = hud.project(_v, {});
        if (s.behind || s.x < 0 || s.x > width || s.y < 0 || s.y > height) continue;
        let m = this.marks[at];
        if (!m) {
          m = el('div', 'uavMark');
          hud.el.icons.appendChild(m);
          this.marks.push(m);
        }
        at++;
        m.hidden = false;
        m.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%) rotate(45deg)`;
      }
    }
    for (let i = at; i < this.marks.length; i++) this.marks[i].hidden = true;
  }
}
