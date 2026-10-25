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
  // Sarf yuvaları (teçhizat): görevde 1 ana, 2 yan silah, 3 bıçak; sarflar 4 ve 5'te. Poligonda bu tuşlar
  // silah seçer, orada yuva yoktur
  useItem1: ['Digit4'],
  useItem2: ['Digit5'],
  tracker: ['KeyJ'], // bonus görev takipçisini daralt/aç
  // Komut çarkı (basılı tut, bırakınca verilir) ve bağlamsal işaret (Operasyon Güncellemesi §8.3)
  wheel: ['KeyT'],
  ping: ['KeyZ'],
  // Telsiz sohbet satırı (yazılı komut) ve sesli komut (basılı tut, konuş) — §8.3
  chat: ['Enter', 'NumpadEnter'],
  voice: ['KeyN'],
  talk: ['KeyK'], // eller serbest konuşma kipi (aç/kapat): cevap bitince mikrofon yeniden dinler
  // Çevrim içi maç: puan tablosu (basılı tut)
  scoreboard: ['Tab'],
  // Tim komutları (Operasyon Güncellemesi §8.2): F6/F7 bazı tarayıcılarda engellenemediği için F8/F9
  cmdFollow: ['F1'],
  cmdHold: ['F2'],
  cmdSuppress: ['F3'],
  cmdCover: ['F4'],
  cmdHeal: ['F5'],
  cmdHoldFire: ['F8'],
  cmdFreeFire: ['F9'],
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
  grenade: 'El bombası', melee: 'Hızlı bıçak', fireMode: 'Atış modu', leanLeft: 'Sola eğil', leanRight: 'Sağa eğil',
  weapon1: 'Ana silah (poligonda 1–9)', weapon2: 'Yan silah', weapon3: 'Bıçağı eline al', swapWeapon: 'Son silah', pause: 'Duraklat',
  holdBreath: 'Nefesini tut (dürbün)', useItem1: 'Sarf yuvası 1', useItem2: 'Sarf yuvası 2', tracker: 'Görev takipçisi',
  cmdFollow: 'Takip edin', cmdHold: 'Pozisyonu koruyun', cmdSuppress: 'Baskı ateşi (nişangâhın baktığı yere)', cmdCover: 'Siper alın',
  cmdHeal: 'Beni iyileştir (medik)', cmdHoldFire: 'Ateşi kesin', cmdFreeFire: 'Serbest ateş',
  wheel: 'Komut çarkı (basılı tut)', ping: 'İşaretle (çift basış: iptal)',
  chat: 'Telsiz: yazılı komut', voice: 'Sesli komut (basılı tut)', talk: 'Konuşma kipi (eller serbest, aç/kapat)',
  scoreboard: 'Puan tablosu (çevrim içi, basılı tut)',
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

// Yazı alanı mı (telsiz satırı, konsol, ad kutusu, tuş atama dışı her türlü metin girişi): oradaki tuşlar oyun
// komutu değildir; W yazarken asker yürümesin, Boşluk zıplatmasın
export function isTextEditingTarget(target) {
  if (!target) return false;
  const tag = String(target.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'OPTION') return true;
  if (target.isContentEditable) return true;
  return !!target.closest?.('[contenteditable=""], [contenteditable="true"], [role="textbox"]');
}

// Önceki dokunuş (id) hâlâ ekranda mı (touches listesi yoksa bilinmez: öyle sayılır). touchend kaçarsa
// (bildirim perdesi, sistem hareketi) eski parmak kimliği çubuğu ve bakışı kilitli bırakmasın diye yeni dokunuşta
// denetlenir. Kimlik yeni başlayan dokunuşlardaysa tarayıcı onu yeniden kullanmıştır: eskisi bitmiş demektir
function touchStillDown(e, id) {
  if (id === null) return false;
  for (const t of e.changedTouches || []) if (t.identifier === id) return false;
  if (!e.touches) return true;
  for (const t of e.touches) if (t.identifier === id) return true;
  return false;
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

  // Basılı tutulan her şeyi bırak (klavye, fare, dokunmatik düğme ve çubuk, gamepad): odak kaybı, arka plana
  // geçiş, fare kilidinin düşmesi ya da ekran dönmesinde tuşun bırakılma olayı gelmeyebilir; ateş ve yürüme
  // takılı kalıyordu. Bırakılan eylemler bir kare "released" görünür (komut çarkı, sesli komut kapanır)
  clearTransientInput() {
    for (const c of this.down) this.releasedCodes.add(c);
    this.down.clear();
    this.pressedCodes.clear();
    this.lookDX = this.lookDY = 0;
    for (const action of this.touch.buttons) this.touch.released.add(action);
    this.touch.buttons.clear();
    this.touch.pressed.clear();
    this.touch.moveX = this.touch.moveY = 0;
    this.touch.sprint = false;
    this.clearGamepad();
    this.resetTouchTracking?.();
  }

  clearGamepad() {
    this.gamepad.cur = [];
    this.gamepad.prev = [];
    this.gamepad.moveX = this.gamepad.moveY = 0;
    this.gamepad.lookX = this.gamepad.lookY = 0;
  }

  bind() {
    window.addEventListener('keydown', (e) => {
      // Tuş atama ekranı her tuşu yakalar (oyun dışındayken de)
      if (this.onAnyKey && this.onAnyKey(e)) return;
      // Menüde oyun tuşu toplanmaz; yazı alanındaki tuşlar komut değildir
      if (!this.enabled || isTextEditingTarget(e.target)) return;
      if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab' || boundFKeys.has(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this.pressedCodes.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      // Yalnız oyunun basılı saydığı tuşun bırakılması olay sayılır: telsiz satırına yazılan N'nin keyup'ı
      // sesli komutu "bırakıldı" diye kapatmasın
      if (this.down.delete(e.code)) this.releasedCodes.add(e.code);
    });
    window.addEventListener('blur', () => this.clearTransientInput());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.clearTransientInput();
    });
    window.addEventListener('pagehide', () => this.clearTransientInput());
    window.addEventListener('orientationchange', () => this.clearTransientInput());
    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      // İlk tık yalnız fareyi yakalar: oyuna girerken/dönerken istemeden ateş edilmesin (kilit alınamazsa
      // lockFailed olur ve sonraki tıklar doğrudan ateş eder). Dokunmatikte kilit hiç istenmez: tık ateştir
      if (!this.locked && !this.lockFailed && !this.touch.active) {
        this.requestLock();
        e.preventDefault();
        return;
      }
      const code = `Mouse${e.button}`;
      if (!this.down.has(code)) this.pressedCodes.add(code);
      this.down.add(code);
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => {
      const code = `Mouse${e.button}`;
      if (this.down.delete(code)) this.releasedCodes.add(code);
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
        if (!this.enabled || isTextEditingTarget(e.target) || !e.deltaY) return;
        // Silah değiştirirken sayfa kaymasın; ama yalnız oyun alanında (kilitliyken olay tuvale gelir).
        // Duraklatmada da enabled açık: oradaki Ayarlar paneli ve telsiz geçmişi tekerlekle kaymalı
        if (this.locked || e.target === this.canvas) e.preventDefault();
        const code = e.deltaY > 0 ? 'WheelDown' : 'WheelUp';
        this.pressedCodes.add(code);
        this.releasedCodes.add(code);
      },
      { passive: false }
    );
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === this.canvas;
      if (this.locked) this.ignoreMoveUntil = performance.now() + 150;
      // Kilidi oyun kendisi bıraktıysa (telsiz satırı, konsol) bu bırakma duraklatmaz: olay eşzamansız gelir,
      // satır o arada kapanmış olabilir (hızlı Enter → Esc)
      const self = !this.locked && this.selfExit;
      this.selfExit = false;
      // Kilit düşünce (Esc, telsiz satırı, konsol) basılı ateş/nişan/yürüme duraklatma ekranından önce bırakılır
      if (was && !this.locked) this.clearTransientInput();
      if (was !== this.locked && this.onLockChange) this.onLockChange(this.locked, self);
    });
    document.addEventListener('pointerlockerror', () => {
      this.lockFailed = true;
    });
    window.addEventListener('gamepadconnected', () => {
      // İzin ya da sürücü yüzünden kapanan gamepad yeni bağlantıda yeniden denenir
      this.gamepadBlocked = false;
      this.gamepad.connected = true;
    });
    window.addEventListener('gamepaddisconnected', () => {
      // Çıkarılan kolun son analog değeri oyuncuyu yürütmeye devam etmesin
      this.gamepad.connected = false;
      this.clearGamepad();
    });
  }

  requestLock() {
    if (this.touch.active) return;
    // Fare kilidi olmayan tarayıcı/WebView: kilitsiz nişan kipine geç (yoksa her tık yalnız kilit isterdi)
    if (typeof this.canvas.requestPointerLock !== 'function') {
      this.lockFailed = true;
      return;
    }
    try {
      const r = this.canvas.requestPointerLock();
      if (r && r.catch) r.catch(() => (this.lockFailed = true));
    } catch {
      this.lockFailed = true;
    }
  }

  exitLock() {
    if (document.pointerLockElement) {
      try {
        this.selfExit = true;
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
    // Aynı eyleme bağlı birden çok düğme olabilir (iki ateş düğmesi): eylem, son parmak kalkana dek basılı
    const actionFingers = new Map();
    const buttonResetters = [];
    this.resetTouchTracking = () => {
      moveId = lookId = null;
      stick.hidden = true;
      knob.style.transform = 'translate(-50%, -50%)';
      for (const set of actionFingers.values()) set.clear();
      for (const reset of buttonResetters) reset();
    };
    moveZone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      // Çubuk tutulurken ikinci parmak çubuğun merkezini kendi yerine taşımasın
      if (touchStillDown(e, moveId) || !e.changedTouches.length) return;
      const t = e.changedTouches[0];
      moveId = t.identifier;
      ox = t.clientX;
      oy = t.clientY;
      stick.style.left = `${ox}px`;
      stick.style.top = `${oy}px`;
      stick.hidden = false;
      knob.style.transform = 'translate(-50%, -50%)';
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
      e.preventDefault();
      // Bakan parmak varken ikinci parmak bakışı devralıp sıçratmasın
      if (touchStillDown(e, lookId) || !e.changedTouches.length) return;
      const t = e.changedTouches[0];
      lookId = t.identifier;
      lx = t.clientX;
      ly = t.clientY;
    }, { passive: false });
    for (const btn of root.querySelectorAll('[data-action]')) {
      const action = btn.dataset.action;
      const drag = btn.hasAttribute('data-look');
      // Düğmedeki parmaklar ve eylemin bütün düğmelerdeki parmakları: ikinci parmak basılıyken ilki kalkınca
      // ateş kesilmez
      const fingers = new Set();
      if (!actionFingers.has(action)) actionFingers.set(action, new Set());
      const all = actionFingers.get(action);
      buttonResetters.push(() => {
        fingers.clear();
        btn.classList.remove('on');
      });
      btn.addEventListener('touchstart', (e) => {
        for (const t of e.changedTouches) {
          if (!all.size) {
            T.buttons.add(action);
            T.pressed.add(action);
          }
          fingers.add(t.identifier);
          all.add(t.identifier);
          // Sürüklenebilir ateş düğmesi (data-look) bakışı da çevirir; bakan parmak yoksa devralır
          if (drag && !touchStillDown(e, lookId)) {
            lookId = t.identifier;
            lx = t.clientX;
            ly = t.clientY;
          }
        }
        btn.classList.add('on');
        e.preventDefault();
        e.stopPropagation();
      }, { passive: false });
      const end = (e) => {
        for (const t of e.changedTouches) {
          if (!fingers.delete(t.identifier)) continue;
          all.delete(t.identifier);
          if (t.identifier === lookId) lookId = null;
        }
        if (!fingers.size) btn.classList.remove('on');
        if (!all.size && T.buttons.delete(action)) T.released.add(action);
      };
      btn.addEventListener('touchend', end);
      btn.addEventListener('touchcancel', end);
    }
  }

  enableTouch(on) {
    // Dokunmatik kapanırken (fare bağlandı, menüye dönüldü) basılı düğme kalmasın
    if (!on && this.touch.active) this.clearTransientInput();
    this.touch.active = on;
    if (this.touchRoot) this.touchRoot.hidden = !on;
  }
}

// Standart gamepad düğme indeksleri
const GP_MAP = {
  jump: 0, crouch: 1, reload: 2, swapWeapon: 3, grenade: 5, melee: 11, ads: 6, fire: 7,
  sprint: 10, holdBreath: 10, pause: 9, fireMode: 12, interact: 4, leanLeft: 14, leanRight: 15,
};
