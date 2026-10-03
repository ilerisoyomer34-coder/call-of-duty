// Girdi katmanı (UE5 Enhanced Input karşılığı): klavye/fare, gamepad ve dokunmatik
// kontrolleri soyut eylemlere çevirir. Oyun kodu yalnızca eylem adlarını bilir.

export const BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  crouch: ['KeyC', 'ControlLeft'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  fire: ['Mouse0'],
  ads: ['Mouse2'],
  reload: ['KeyR'],
  interact: ['KeyF'],
  grenade: ['KeyG'],
  melee: ['KeyV', 'Mouse3'],
  fireMode: ['KeyB'],
  leanLeft: ['KeyQ'],
  leanRight: ['KeyE'],
  weapon1: ['Digit1'],
  weapon2: ['Digit2'],
  weapon3: ['Digit3'],
  weapon4: ['Digit4'],
  weapon5: ['Digit5'],
  weapon6: ['Digit6'],
  weapon7: ['Digit7'],
  weapon8: ['Digit8'],
  weapon9: ['Digit9'],
  nextWeapon: ['WheelDown'],
  prevWeapon: ['WheelUp'],
  swapWeapon: ['KeyX'],
  // Sarf yuvaları (teçhizat): görevde 3 ve 4 boştur; poligonda bu tuşlar silah seçer, orada yuva yoktur
  useItem1: ['Digit3'],
  useItem2: ['Digit4'],
  tracker: ['KeyJ'], // bonus görev takipçisini daralt/aç
  holdBreath: ['ShiftLeft', 'ShiftRight'],
  pause: ['Escape', 'KeyP'],
  console: ['Backquote', 'F10'], // F2 tim komutlarına ayrıldı (Operasyon Güncellemesi §8.2)
};

// Varsayılan atamalar (ayarlardaki "varsayılana dön" için) ve tarayıcının kendi işini yapan F tuşları:
// oyunda bağlı bir F tuşunun varsayılanı (F1 yardım, F5 yenile…) engellenir
export const DEFAULT_BINDINGS = Object.freeze(Object.fromEntries(Object.entries(BINDINGS).map(([k, v]) => [k, Object.freeze([...v])])));
const boundFKeys = new Set();
function refreshBoundFKeys() {
  boundFKeys.clear();
  for (const codes of Object.values(BINDINGS)) for (const c of codes) if (/^F\d+$/.test(c)) boundFKeys.add(c);
}
refreshBoundFKeys();

// Kayıttaki tuş atamaları (settings.bindings: eylem → tuş kodları) varsayılanların üstüne yazılır.
// Bilinmeyen eylem ya da hatalı değer yok sayılır; boş liste o eylemi tuşsuz bırakır.
export function applyBindingOverrides(over) {
  for (const [action, def] of Object.entries(DEFAULT_BINDINGS)) BINDINGS[action] = [...def];
  if (over && typeof over === 'object') {
    for (const [action, codes] of Object.entries(over)) {
      if (!(action in BINDINGS) || !Array.isArray(codes)) continue;
      BINDINGS[action] = codes.filter((c) => typeof c === 'string' && c.length > 0);
    }
  }
  refreshBoundFKeys();
}

export const ACTION_LABELS = {
  forward: 'İleri', back: 'Geri', left: 'Sol', right: 'Sağ', jump: 'Zıpla', crouch: 'Çömel',
  sprint: 'Koş', fire: 'Ateş', ads: 'Nişan al', reload: 'Şarjör değiştir', interact: 'Etkileşim',
  grenade: 'El bombası', melee: 'Bıçak', fireMode: 'Atış modu', leanLeft: 'Sola eğil', leanRight: 'Sağa eğil',
  weapon1: 'Ana silah (poligonda 1–9)', weapon2: 'Yan silah', swapWeapon: 'Son silah', pause: 'Duraklat',
  holdBreath: 'Nefesini tut (dürbün)', useItem1: 'Sarf yuvası 1', useItem2: 'Sarf yuvası 2', tracker: 'Görev takipçisi',
};

const KEY_NAMES = {
  Mouse0: 'Sol tık', Mouse2: 'Sağ tık', Mouse3: 'Fare 4', WheelUp: 'Tekerlek ↑', WheelDown: 'Tekerlek ↓',
  Space: 'Boşluk', ShiftLeft: 'Shift', ShiftRight: 'Sağ Shift', ControlLeft: 'Ctrl', Escape: 'Esc',
  Backquote: '`', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
};
export function keyName(code) {
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

export class Input {
  constructor(canvas, touchRoot) {
    this.canvas = canvas;
    this.down = new Set(); // basılı fiziksel tuşlar
    this.pressedCodes = new Set();
    this.releasedCodes = new Set();
    this.lookDX = 0;
    this.lookDY = 0;
    this.locked = false;
    this.lockFailed = false;
    this.ignoreMoveUntil = 0;
    this.enabled = false; // oyun sırasında true
    this.onLockChange = null;
    this.onAnyKey = null;
    this.touch = { active: false, moveX: 0, moveY: 0, sprint: false, buttons: new Set(), pressed: new Set(), released: new Set() };
    this.gamepad = { connected: false, prev: [], moveX: 0, moveY: 0, lookX: 0, lookY: 0 };
    this.codeToActions = new Map();
    this.rebuildMap();
    this.bind();
    if (touchRoot) this.buildTouch(touchRoot);
  }

  rebuildMap() {
    this.codeToActions.clear();
    for (const [action, codes] of Object.entries(BINDINGS)) {
      for (const c of codes) {
        if (!this.codeToActions.has(c)) this.codeToActions.set(c, []);
        this.codeToActions.get(c).push(action);
      }
    }
  }

  bind() {
    window.addEventListener('keydown', (e) => {
      if (this.onAnyKey && this.onAnyKey(e)) return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      if (this.enabled && (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab' || boundFKeys.has(e.code))) e.preventDefault();
      if (!this.down.has(e.code)) this.pressedCodes.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.releasedCodes.add(e.code);
    });
    window.addEventListener('blur', () => {
      for (const c of this.down) this.releasedCodes.add(c);
      this.down.clear();
    });
    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.locked && !this.lockFailed) this.requestLock();
      const code = `Mouse${e.button}`;
      if (!this.down.has(code)) this.pressedCodes.add(code);
      this.down.add(code);
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => {
      const code = `Mouse${e.button}`;
      this.down.delete(code);
      this.releasedCodes.add(code);
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.locked || this.lockFailed) {
        // Kilit alınırken tarayıcılar tek seferlik dev bir sıçrama gönderebilir: yut
        if (performance.now() < this.ignoreMoveUntil) return;
        const mx = e.movementX || 0;
        const my = e.movementY || 0;
        if (Math.abs(mx) > 280 || Math.abs(my) > 280) return;
        this.lookDX += mx;
        this.lookDY += my;
      }
    });
    window.addEventListener(
      'wheel',
      (e) => {
        if (!this.enabled) return;
        const code = e.deltaY > 0 ? 'WheelDown' : 'WheelUp';
        this.pressedCodes.add(code);
        this.releasedCodes.add(code);
      },
      { passive: true }
    );
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === this.canvas;
      if (this.locked) this.ignoreMoveUntil = performance.now() + 150;
      if (was !== this.locked && this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => {
      this.lockFailed = true;
    });
    window.addEventListener('gamepadconnected', () => (this.gamepad.connected = true));
    window.addEventListener('gamepaddisconnected', () => (this.gamepad.connected = false));
  }

  requestLock() {
    if (this.touch.active) return;
    try {
      const r = this.canvas.requestPointerLock?.();
      if (r && r.catch) r.catch(() => (this.lockFailed = true));
    } catch {
      this.lockFailed = true;
    }
  }

  exitLock() {
    if (document.pointerLockElement) {
      try {
        document.exitPointerLock();
      } catch {
        /* yoksay */
      }
    }
  }

  // --- Sorgular ---
  isDown(action) {
    if (this.touch.buttons.has(action)) return true;
    if (this.gpDown(action)) return true;
    const codes = BINDINGS[action];
    for (const c of codes) if (this.down.has(c)) return true;
    return false;
  }

  pressed(action) {
    if (this.touch.pressed.has(action)) return true;
    if (this.gpPressed(action)) return true;
    const codes = BINDINGS[action];
    for (const c of codes) if (this.pressedCodes.has(c)) return true;
    return false;
  }

  released(action) {
    if (this.touch.released.has(action)) return true;
    if (this.gpReleased(action)) return true;
    const codes = BINDINGS[action];
    for (const c of codes) if (this.releasedCodes.has(c)) return true;
    return false;
  }

  move() {
    let x = 0;
    let y = 0;
    if (this.isDown('forward')) y += 1;
    if (this.isDown('back')) y -= 1;
    if (this.isDown('right')) x += 1;
    if (this.isDown('left')) x -= 1;
    if (this.touch.active) {
      x += this.touch.moveX;
      y += this.touch.moveY;
    }
    if (this.gamepad.connected) {
      x += this.gamepad.moveX;
      y += this.gamepad.moveY;
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  consumeLook() {
    const dx = this.lookDX;
    const dy = this.lookDY;
    this.lookDX = 0;
    this.lookDY = 0;
    return { dx, dy };
  }

  endFrame() {
    this.pressedCodes.clear();
    this.releasedCodes.clear();
    this.touch.pressed.clear();
    this.touch.released.clear();
    this.gamepad.prev = this.gamepad.cur || [];
  }

  // --- Gamepad (standart eşleme) ---
  pollGamepad(dt, sens) {
    // Gömülü sayfalarda izin politikası gamepad'i kapatabilir; getGamepads o zaman her karede hata fırlatır
    let pads = [];
    if (!this.gamepadBlocked && navigator.getGamepads) {
      try {
        pads = navigator.getGamepads();
      } catch {
        this.gamepadBlocked = true;
      }
    }
    const gp = pads && [...pads].find((p) => p && p.connected);
    if (!gp) {
      this.gamepad.connected = false;
      this.gamepad.cur = [];
      return;
    }
    this.gamepad.connected = true;
    const dz = (v) => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85);
    this.gamepad.moveX = dz(gp.axes[0] || 0);
    this.gamepad.moveY = -dz(gp.axes[1] || 0);
    const lx = dz(gp.axes[2] || 0);
    const ly = dz(gp.axes[3] || 0);
    // Kübik eğri: küçük hareketlerde hassas nişan
    this.lookDX += Math.sign(lx) * lx * lx * 900 * dt * sens;
    this.lookDY += Math.sign(ly) * ly * ly * 650 * dt * sens;
    this.gamepad.cur = gp.buttons.map((b) => b.pressed || b.value > 0.4);
  }

  gpIdx(action) {
    return GP_MAP[action];
  }

  gpDown(action) {
    const i = GP_MAP[action];
    return i !== undefined && !!(this.gamepad.cur && this.gamepad.cur[i]);
  }

  gpPressed(action) {
    const i = GP_MAP[action];
    return i !== undefined && !!(this.gamepad.cur && this.gamepad.cur[i]) && !this.gamepad.prev[i];
  }

  gpReleased(action) {
    const i = GP_MAP[action];
    return i !== undefined && !(this.gamepad.cur && this.gamepad.cur[i]) && !!this.gamepad.prev[i];
  }

  // --- Dokunmatik kontroller ---
  buildTouch(root) {
    this.touchRoot = root;
    const T = this.touch;
    const stick = root.querySelector('#stick');
    const knob = root.querySelector('#stickKnob');
    const lookZone = root.querySelector('#lookZone');
    const moveZone = root.querySelector('#moveZone');
    let moveId = null;
    let lookId = null;
    let ox = 0;
    let oy = 0;
    let lx = 0;
    let ly = 0;
    const R = 60;
    moveZone.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      moveId = t.identifier;
      ox = t.clientX;
      oy = t.clientY;
      stick.style.left = `${ox}px`;
      stick.style.top = `${oy}px`;
      stick.hidden = false;
      knob.style.transform = 'translate(-50%, -50%)';
      e.preventDefault();
    }, { passive: false });
    const onMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === moveId) {
          let dx = t.clientX - ox;
          let dy = t.clientY - oy;
          const len = Math.hypot(dx, dy);
          if (len > R) {
            dx *= R / len;
            dy *= R / len;
          }
          T.moveX = dx / R;
          T.moveY = -dy / R;
          T.sprint = len > R * 1.35 && -dy > Math.abs(dx);
          knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        } else if (t.identifier === lookId) {
          this.lookDX += (t.clientX - lx) * 2.2;
          this.lookDY += (t.clientY - ly) * 2.2;
          lx = t.clientX;
          ly = t.clientY;
        }
      }
      e.preventDefault();
    };
    const onEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === moveId) {
          moveId = null;
          T.moveX = T.moveY = 0;
          T.sprint = false;
          stick.hidden = true;
        } else if (t.identifier === lookId) {
          lookId = null;
        }
      }
    };
    root.addEventListener('touchmove', onMove, { passive: false });
    root.addEventListener('touchend', onEnd);
    root.addEventListener('touchcancel', onEnd);
    lookZone.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      lookId = t.identifier;
      lx = t.clientX;
      ly = t.clientY;
      e.preventDefault();
    }, { passive: false });
    for (const btn of root.querySelectorAll('[data-action]')) {
      const action = btn.dataset.action;
      const drag = btn.hasAttribute('data-look');
      btn.addEventListener('touchstart', (e) => {
        const t = e.changedTouches[0];
        T.buttons.add(action);
        T.pressed.add(action);
        btn.classList.add('on');
        if (drag) {
          lookId = t.identifier;
          lx = t.clientX;
          ly = t.clientY;
        }
        e.preventDefault();
        e.stopPropagation();
      }, { passive: false });
      const end = (e) => {
        T.buttons.delete(action);
        T.released.add(action);
        btn.classList.remove('on');
        for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null;
      };
      btn.addEventListener('touchend', end);
      btn.addEventListener('touchcancel', end);
    }
  }

  enableTouch(on) {
    this.touch.active = on;
    if (this.touchRoot) this.touchRoot.hidden = !on;
  }
}

// Standart gamepad düğme indeksleri
const GP_MAP = {
  jump: 0, crouch: 1, reload: 2, swapWeapon: 3, grenade: 5, melee: 11, ads: 6, fire: 7,
  sprint: 10, holdBreath: 10, pause: 9, fireMode: 12, interact: 4, leanLeft: 14, leanRight: 15,
};
