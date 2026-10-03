// Komut çarkı (Operasyon Güncellemesi §8.3): T basılı tutulunca ekranın ortasında sekiz dilim; fareyle
// dilim seçilir, T bırakınca komut verilir. Ortada muhatap (Alfa Timi / Alfa-1 / Alfa-2 / Alfa-3; tekerlek ya da
// 1–4 ile değişir). Çark açıkken oyun yavaşlar (Ayarlar → çark yavaşlatması).
// Dokunmatikte TELSİZ düğmesi çarkı açıp kapar; dilime dokununca komut verilir, ortaya dokununca muhatap değişir.
// Dilim seçimi fare hareketinin biriktirdiği yöne göredir: imleç kilitliyken de çalışır.
import { COMMANDS } from './commands.js';
import SQUAD from './data/squad.json' with { type: 'json' };

export const WHEEL_SLICES = ['FOLLOW', 'HOLD', 'MOVE_TO', 'ATTACK', 'SUPPRESS', 'TAKE_COVER', 'HEAL_PLAYER', 'CLEAR_AREA'];
// Komut simgeleri: çark dilimleri ve komutu alan askerin başındaki etiket (§8.6) aynı simgeyi kullanır.
// Yazı tipinden bağımsız, emoji olarak çizilmeyen basit karakterler
export const CMD_ICONS = {
  FOLLOW: '»', HOLD: '■', MOVE_TO: '➤', ATTACK: '✛', SUPPRESS: '≋', TAKE_COVER: '▼', HEAL_PLAYER: '✚',
  CLEAR_AREA: '⌂', HOLD_FIRE: '⊘', FREE_FIRE: '✸',
};
const ADDRESSEES = ['all', ...SQUAD.members.map((m) => m.callsign)];
const DEAD_ZONE = 18; // seçim için en az fare yolu (piksel)
const MAX_R = 90;
const NS = 'http://www.w3.org/2000/svg';

export class CommandWheel {
  constructor(game) {
    this.game = game;
    this.open = false;
    this.sel = -1;
    this.vx = 0;
    this.vy = 0;
    this.addr = 0;
    this.byTouch = false;
    this.build();
  }

  // Açıkken oyun saatinin çarpanı
  get slow() {
    return this.open ? this.game.settings.wheelSlowMo ?? 0.3 : 1;
  }

  build() {
    // Dokunmatik düğme katmanının (#touch) üstünde dursun: dilimlere dokunulabilsin
    const host = document.getElementById('app') || document.body;
    const root = document.createElement('div');
    root.id = 'wheel';
    root.hidden = true;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '-100 -100 200 200');
    this.wedges = WHEEL_SLICES.map((id, i) => {
      // Dilim 0 tepede, saat yönünde
      const a0 = ((i - 0.5) / WHEEL_SLICES.length) * Math.PI * 2 - Math.PI / 2;
      const a1 = ((i + 0.5) / WHEEL_SLICES.length) * Math.PI * 2 - Math.PI / 2;
      const p = (r, a) => `${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)}`;
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', `M ${p(38, a0)} L ${p(96, a0)} A 96 96 0 0 1 ${p(96, a1)} L ${p(38, a1)} A 38 38 0 0 0 ${p(38, a0)} Z`);
      path.dataset.cmd = id;
      const am = (a0 + a1) / 2;
      // Simge üstte, ad iki satıra bölünür (dilim dar): "Pozisyonu / koru"
      const cx = Math.cos(am) * 67;
      const cy = Math.sin(am) * 67;
      const text = document.createElementNS(NS, 'text');
      text.setAttribute('x', cx.toFixed(1));
      const words = COMMANDS[id].label.split(' ');
      const lines = [CMD_ICONS[id], words[0], words.slice(1).join(' ')].filter(Boolean);
      lines.forEach((ln, k) => {
        const ts = document.createElementNS(NS, 'tspan');
        ts.setAttribute('x', cx.toFixed(1));
        ts.setAttribute('y', (cy + (k - (lines.length - 1) / 2) * 9 + 3).toFixed(1));
        if (k === 0) ts.classList.add('wIcon');
        ts.textContent = ln;
        text.appendChild(ts);
      });
      const g = document.createElementNS(NS, 'g');
      g.classList.add('wSlice');
      g.append(path, text);
      g.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.sel = i;
        this.close(true);
      });
      svg.appendChild(g);
      return g;
    });
    const center = document.createElementNS(NS, 'circle');
    center.setAttribute('r', '34');
    center.classList.add('wCenter');
    this.addrText = document.createElementNS(NS, 'text');
    this.addrText.setAttribute('y', '4');
    this.addrText.classList.add('wAddr');
    const cg = document.createElementNS(NS, 'g');
    cg.append(center, this.addrText);
    cg.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.cycle(1);
    });
    svg.appendChild(cg);
    const hint = document.createElement('div');
    hint.className = 'wHint';
    hint.textContent = 'Fareyle dilim seç · tekerlek: muhatap · bırakınca verilir';
    this.hint = hint;
    root.append(svg, hint);
    // Dokunmatikte çarkın dışına dokunmak kapatır
    root.addEventListener('pointerdown', () => this.close(false));
    host.appendChild(root);
    this.root = root;
    this.renderAddr();
  }

  renderAddr() {
    const a = ADDRESSEES[this.addr];
    this.addrText.textContent = a === 'all' ? 'TÜM TİM' : a.toLocaleUpperCase('tr-TR');
    this.game.commands && (this.game.commands.addressee = a);
  }

  cycle(d) {
    this.addr = (this.addr + d + ADDRESSEES.length) % ADDRESSEES.length;
    this.renderAddr();
    this.game.audio.uiClick?.();
  }

  show(touch = false) {
    const g = this.game;
    if (g.mode !== 'mission' || !g.allies.list.some((a) => !a.dead) || g.player.down) return;
    this.open = true;
    this.byTouch = touch;
    this.sel = -1;
    this.vx = 0;
    this.vy = 0;
    this.root.hidden = false;
    this.root.classList.toggle('touch', touch);
    this.hint.textContent = touch ? 'Komuta dokun · ortası: muhatap' : 'Fareyle dilim seç · tekerlek: muhatap · bırakınca verilir';
    this.highlight();
    this.game.audio.radio?.();
  }

  // apply: seçili dilimi ver
  close(apply) {
    if (!this.open) return;
    this.open = false;
    this.root.hidden = true;
    if (apply && this.sel >= 0) this.game.commands.issue(WHEEL_SLICES[this.sel], ADDRESSEES[this.addr], { inputMethod: 'wheel' });
  }

  highlight() {
    this.wedges.forEach((w, i) => w.classList.toggle('on', i === this.sel));
  }

  update(dt, input) {
    const g = this.game;
    if (!this.open) {
      if (input.pressed('wheel')) this.show(input.touch.active);
      return;
    }
    if (input.pressed('pause') || !g.player.alive || g.player.down) {
      this.close(false);
      return;
    }
    if (this.byTouch) {
      if (input.pressed('wheel')) this.close(false);
      return;
    }
    // Fare: biriken yön dilimi seçer (bakış çark açıkken dönmez)
    const look = input.consumeLook();
    this.vx += look.dx;
    this.vy += look.dy;
    const r = Math.hypot(this.vx, this.vy);
    if (r > MAX_R) {
      this.vx *= MAX_R / r;
      this.vy *= MAX_R / r;
    }
    if (r > DEAD_ZONE) {
      const a = Math.atan2(this.vy, this.vx) + Math.PI / 2; // tepe = 0
      const n = WHEEL_SLICES.length;
      const i = ((Math.round((a / (Math.PI * 2)) * n) % n) + n) % n;
      if (i !== this.sel) {
        this.sel = i;
        this.highlight();
        g.audio.uiHover?.();
      }
    }
    if (input.pressed('nextWeapon')) this.cycle(1);
    if (input.pressed('prevWeapon')) this.cycle(-1);
    for (let k = 0; k < ADDRESSEES.length; k++) {
      if (input.pressed(`weapon${k + 1}`)) {
        this.addr = k;
        this.renderAddr();
      }
    }
    if (!input.isDown('wheel')) this.close(true);
  }
}
