// Komut çarkı (Operasyon Güncellemesi §8.3): T basılı tutulunca ekranın ortasında sekiz dilim; fareyle
// dilim seçilir, T bırakınca komut verilir. Ortada muhatap (Alfa Timi / Alfa-1 / Alfa-2 / Alfa-3; tekerlek ya da
// 1–4 ile değişir). Çark açıkken oyun yavaşlar (Ayarlar → çark yavaşlatması).
// Dokunmatikte TELSİZ düğmesi çarkı açıp kapar; dilime dokununca komut verilir, ortaya dokununca muhatap değişir.
// Dilim seçimi fare hareketinin biriktirdiği yöne göredir: imleç kilitliyken de çalışır.
// Aynı sınıf çevrim içi maçta telsiz kalıplarını gösterir (spec: dilimler, muhatapsız orta, yavaşlatma yok, seçilen
// kalıp game.net'e; src/net/netChat.js → radioWheelSpec).
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

// Görevdeki tim komut çarkı: dilimler komutlar, ortada muhatap, açıkken oyun yavaşlar
function commandSpec(game) {
  return {
    id: 'wheel',
    slices: WHEEL_SLICES.map((id) => ({ id, icon: CMD_ICONS[id], label: COMMANDS[id].label })),
    addressees: ADDRESSEES,
    slowMo: true,
    hint: 'Fareyle dilim seç · tekerlek: muhatap · bırakınca verilir',
    touchHint: 'Komuta dokun · ortası: muhatap',
    canShow: () => game.mode === 'mission' && game.allies.list.some((a) => !a.dead) && !game.player.down,
    apply: (id, addr) => game.commands.issue(id, addr, { inputMethod: 'wheel' }),
  };
}

export class CommandWheel {
  constructor(game, spec = null) {
    this.game = game;
    this.spec = spec || commandSpec(game);
    this.slices = this.spec.slices;
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
    return this.open && this.spec.slowMo ? this.game.settings.wheelSlowMo ?? 0.3 : 1;
  }

  // Dilimleri yeniden kur (çevrim içi: Rekabetçide bomba kalıpları)
  setSlices(slices) {
    if (this.open) this.close(false);
    this.spec.slices = slices;
    this.slices = slices;
    this.root.remove();
    this.build();
  }

  build() {
    // Dokunmatik düğme katmanının (#touch) üstünde dursun: dilimlere dokunulabilsin
    const host = document.getElementById('app') || document.body;
    const root = document.createElement('div');
    root.id = this.spec.id;
    root.className = 'wheel';
    root.hidden = true;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '-100 -100 200 200');
    const N = this.slices.length;
    this.wedges = this.slices.map((sl, i) => {
      // Dilim 0 tepede, saat yönünde
      const a0 = ((i - 0.5) / N) * Math.PI * 2 - Math.PI / 2;
      const a1 = ((i + 0.5) / N) * Math.PI * 2 - Math.PI / 2;
      const p = (r, a) => `${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)}`;
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', `M ${p(38, a0)} L ${p(96, a0)} A 96 96 0 0 1 ${p(96, a1)} L ${p(38, a1)} A 38 38 0 0 0 ${p(38, a0)} Z`);
      path.dataset.cmd = sl.id;
      const am = (a0 + a1) / 2;
      // Simge üstte, ad iki satıra bölünür (dilim dar): "Pozisyonu / koru"
      const cx = Math.cos(am) * 67;
      const cy = Math.sin(am) * 67;
      const text = document.createElementNS(NS, 'text');
      text.setAttribute('x', cx.toFixed(1));
      const words = sl.label.split(' ');
      const lines = [sl.icon, words[0], words.slice(1).join(' ')].filter(Boolean);
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
      // Muhatapsız çarkta (çevrim içi telsiz) ortası kapatır
      if (this.spec.addressees) this.cycle(1);
      else this.close(false);
    });
    svg.appendChild(cg);
    const hint = document.createElement('div');
    hint.className = 'wHint';
    hint.textContent = this.spec.hint;
    this.hint = hint;
    root.append(svg, hint);
    // Menü ekranlarının (duraklatma vb.) altında, dokunmatik düğmelerin üstünde
    const touch = document.getElementById('touch');
    // Dokunmatikte çarkın dışına dokunmak kapatır
    root.addEventListener('pointerdown', () => this.close(false));
    if (touch) touch.after(root);
    else host.appendChild(root);
    this.root = root;
    this.renderAddr();
  }

  renderAddr() {
    const list = this.spec.addressees;
    if (!list) {
      this.addrText.textContent = this.spec.center || '';
      return;
    }
    const a = list[this.addr];
    this.addrText.textContent = a === 'all' ? 'TÜM TİM' : a.toLocaleUpperCase('tr-TR');
    this.game.commands && (this.game.commands.addressee = a);
  }

  cycle(d) {
    const list = this.spec.addressees;
    if (!list) return;
    this.addr = (this.addr + d + list.length) % list.length;
    this.renderAddr();
    this.game.audio.uiClick?.();
  }

  show(touch = false) {
    if (!this.spec.canShow()) return;
    this.open = true;
    this.byTouch = touch;
    this.sel = -1;
    this.vx = 0;
    this.vy = 0;
    this.root.hidden = false;
    this.root.classList.toggle('touch', touch);
    this.hint.textContent = touch ? this.spec.touchHint : this.spec.hint;
    this.highlight();
    this.game.audio.radio?.();
  }

  // apply: seçili dilimi ver
  close(apply) {
    if (!this.open) return;
    this.open = false;
    this.root.hidden = true;
    if (apply && this.sel >= 0) this.spec.apply(this.slices[this.sel].id, this.spec.addressees?.[this.addr]);
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
    if (input.pressed('pause') || (!this.spec.allowDead && (!g.player.alive || g.player.down))) {
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
      const n = this.slices.length;
      const i = ((Math.round((a / (Math.PI * 2)) * n) % n) + n) % n;
      if (i !== this.sel) {
        this.sel = i;
        this.highlight();
        g.audio.uiHover?.();
      }
    }
    if (input.pressed('nextWeapon')) this.cycle(1);
    if (input.pressed('prevWeapon')) this.cycle(-1);
    for (let k = 0; k < (this.spec.addressees?.length || 0); k++) {
      if (input.pressed(`weapon${k + 1}`)) {
        this.addr = k;
        this.renderAddr();
      }
    }
    if (!input.isDown('wheel')) this.close(true);
  }
}
