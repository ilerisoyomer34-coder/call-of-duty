// Tuş atamaları (Operasyon Güncellemesi §3/6, §5): Kontroller ekranında her eylemin iki tuş yuvası vardır.
// Yuvaya tıkla → "tuşa bas" → yeni tuş atanır. Aynı tuş başka bir eylemdeyse oradan alınır (takas) ve
// uyarılır; Esc iptal, Backspace/Delete yuvayı boşaltır. Değişiklikler kayıtta settings.bindings'te
// (yalnız varsayılandan farklı olanlar) durur ve hemen uygulanır.
import { BINDINGS, DEFAULT_BINDINGS, ACTION_LABELS, keyName, applyBindingOverrides } from './input.js';
import { saveSettings } from './settings.js';

export const BINDING_GROUPS = [
  ['Hareket', ['forward', 'back', 'left', 'right', 'sprint', 'crouch', 'jump', 'leanLeft', 'leanRight']],
  ['Savaş', ['fire', 'ads', 'reload', 'fireMode', 'grenade', 'melee', 'interact', 'weapon1', 'weapon2', 'swapWeapon', 'useItem1', 'useItem2', 'holdBreath', 'tracker', 'scoreboard', 'pause']],
  ['Tim', ['wheel', 'ping', 'chat', 'voice', 'cmdFollow', 'cmdHold', 'cmdSuppress', 'cmdCover', 'cmdHeal', 'cmdHoldFire', 'cmdFreeFire']],
];

// Aynı tuşu paylaşması bilerek serbest olan eylemler (bağlamları ayrı): koşu/nefes tutma (dürbünde Shift),
// poligonun silah tuşları ile görevdeki sarf yuvaları
const SHARED = [
  ['sprint', 'holdBreath'],
  ['useItem1', 'weapon3'],
  ['useItem2', 'weapon4'],
];
const sharedOk = (a, b) => SHARED.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
const MOUSE = { 0: 'Mouse0', 2: 'Mouse2', 3: 'Mouse3' };
const RESERVED = new Set(['Escape']); // menü/duraklat için sabit

// code'u kullanan diğer eylemler (izinli paylaşımlar hariç)
export function conflictsOf(action, code) {
  const out = [];
  for (const [a, codes] of Object.entries(BINDINGS)) if (a !== action && codes.includes(code) && !sharedOk(a, action)) out.push(a);
  return out;
}

// Varsayılandan farklı eylemler → kayda yazılacak nesne
export function diffFromDefaults() {
  const out = {};
  for (const [a, codes] of Object.entries(BINDINGS)) {
    const def = DEFAULT_BINDINGS[a] || [];
    if (codes.length !== def.length || codes.some((c, i) => c !== def[i])) out[a] = [...codes];
  }
  return out;
}

export class BindingsEditor {
  constructor(game, box, note) {
    this.game = game;
    this.box = box;
    this.note = note;
    this.capture = null; // { action, slot, el }
    this.onKey = (e) => this.handleKey(e);
    this.onMouse = (e) => this.handleMouse(e);
    // Sağ tık atanırken tarayıcının bağlam menüsü açılmasın (contextmenu, mousedown'dan sonra gelir)
    this.mouseAt = -1e9;
    document.addEventListener('contextmenu', (e) => {
      if (this.capture || performance.now() - this.mouseAt < 600) e.preventDefault();
    });
  }

  build() {
    const box = this.box;
    box.innerHTML = '';
    for (const [title, actions] of BINDING_GROUPS) {
      const wrap = document.createElement('div');
      const h = document.createElement('h3');
      h.textContent = title;
      wrap.appendChild(h);
      const t = document.createElement('table');
      t.className = 'keys';
      for (const a of actions) {
        if (!BINDINGS[a]) continue;
        const tr = document.createElement('tr');
        const td1 = document.createElement('td');
        td1.textContent = ACTION_LABELS[a] || a;
        const td2 = document.createElement('td');
        for (let slot = 0; slot < 2; slot++) {
          const k = document.createElement('button');
          k.type = 'button';
          k.className = 'kbind';
          k.dataset.action = a;
          k.dataset.slot = String(slot);
          const c = BINDINGS[a][slot];
          k.textContent = c ? keyName(c) : '—';
          if (!c) k.classList.add('empty');
          k.addEventListener('click', (e) => {
            e.preventDefault();
            this.start(a, slot, k);
          });
          td2.appendChild(k);
        }
        tr.append(td1, td2);
        t.appendChild(tr);
      }
      wrap.appendChild(t);
      box.appendChild(wrap);
    }
  }

  say(text, warn = false) {
    if (!this.note) return;
    this.note.textContent = text;
    this.note.classList.toggle('warn', warn);
  }

  start(action, slot, el) {
    this.stop();
    this.capture = { action, slot, el };
    el.classList.add('wait');
    el.textContent = 'Tuşa bas…';
    this.say(`${ACTION_LABELS[action]}: yeni tuşa bas (Esc iptal, Backspace boşalt, sol tık için yuvaya tıkla)`);
    document.addEventListener('keydown', this.onKey, true);
    document.addEventListener('mousedown', this.onMouse, true);
  }

  stop() {
    if (!this.capture) return;
    document.removeEventListener('keydown', this.onKey, true);
    document.removeEventListener('mousedown', this.onMouse, true);
    this.capture = null;
  }

  handleKey(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.code === 'Escape') {
      this.stop();
      this.build();
      this.say('İptal edildi.');
      return;
    }
    if (e.code === 'Backspace' || e.code === 'Delete') this.assign(null);
    else this.assign(e.code);
  }

  handleMouse(e) {
    // Sol tık: bekleyen yuvanın üstündeyse sol tık atanır; başka yere tıklamak iptaldir (tıklanan düğme çalışır).
    // Sağ tık ve yan tuş her yerde atanır
    if (e.button === 0 && e.target !== this.capture?.el) {
      this.stop();
      this.build();
      this.say('İptal edildi.');
      return;
    }
    const code = MOUSE[e.button];
    if (!code) return;
    this.mouseAt = performance.now();
    e.preventDefault();
    e.stopPropagation();
    this.assign(code);
  }

  assign(code) {
    const { action, slot } = this.capture;
    this.stop();
    if (code && RESERVED.has(code)) {
      this.say(`${keyName(code)} menü için ayrılmış.`, true);
      this.build();
      return;
    }
    const cur = [...BINDINGS[action]];
    if (code) {
      // Çakışma: tuş başka eylemden alınır (o eylem tuşsuz kalırsa uyarılır)
      const taken = conflictsOf(action, code);
      for (const other of taken) BINDINGS[other] = BINDINGS[other].filter((c) => c !== code);
      cur[slot] = code;
      const left = taken.filter((o) => !BINDINGS[o].length).map((o) => ACTION_LABELS[o] || o);
      this.say(taken.length ? `${keyName(code)} → ${ACTION_LABELS[action]} (önce ${taken.map((o) => ACTION_LABELS[o] || o).join(', ')} idi)${left.length ? ` · tuşsuz kaldı: ${left.join(', ')}` : ''}` : `${keyName(code)} → ${ACTION_LABELS[action]}`, left.length > 0);
    } else {
      cur.splice(slot, 1);
      this.say(`${ACTION_LABELS[action]}: yuva boşaltıldı`);
    }
    BINDINGS[action] = [...new Set(cur.filter(Boolean))];
    this.commit();
    this.build();
  }

  commit() {
    const S = this.game.settings;
    S.bindings = diffFromDefaults();
    applyBindingOverrides(S.bindings);
    saveSettings(S);
  }

  resetDefaults() {
    this.stop();
    this.game.settings.bindings = {};
    applyBindingOverrides({});
    saveSettings(this.game.settings);
    this.build();
    this.say('Varsayılan tuşlar geri yüklendi.');
  }
}
