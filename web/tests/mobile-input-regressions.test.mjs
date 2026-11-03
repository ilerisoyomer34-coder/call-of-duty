// Girdi katmanı (src/input.js) gerileme testleri: yazı alanı, odak kaybı, çoklu dokunuş, fare kilidi, tekerlek,
// gamepad. v1.2 kalite paketinden (DemirSafak_Gelistirilmis_Kod_v1_2) uyarlandı; DOM yerine sahte hedefler.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Input, isTextEditingTarget } from '../src/input.js';

class FakeTarget {
  constructor() {
    this.handlers = new Map();
    this.style = {};
    this.hidden = true;
    this.dataset = {};
    this._classes = new Set();
    this.classList = { add: (c) => this._classes.add(c), remove: (c) => this._classes.delete(c), contains: (c) => this._classes.has(c) };
  }
  addEventListener(type, fn) {
    const a = this.handlers.get(type) || [];
    a.push(fn);
    this.handlers.set(type, a);
  }
  dispatch(type, extra = {}) {
    const event = {
      code: '',
      target: this,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() {},
      changedTouches: [],
      ...extra,
    };
    for (const fn of this.handlers.get(type) || []) fn(event);
    return event;
  }
  hasAttribute(name) { return name === 'data-look' ? !!this.look : false; }
}

function setup(t, touch = false, twoFireButtons = false) {
  const previous = { window: globalThis.window, document: globalThis.document, navigator: globalThis.navigator };
  const win = new FakeTarget();
  const doc = new FakeTarget();
  doc.hidden = false;
  globalThis.window = win;
  globalThis.document = doc;
  Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [] }, configurable: true });
  const canvas = new FakeTarget();
  const zones = { stick: new FakeTarget(), stickKnob: new FakeTarget(), lookZone: new FakeTarget(), moveZone: new FakeTarget() };
  const fire = new FakeTarget();
  fire.dataset.action = 'fire';
  const fire2 = new FakeTarget();
  fire2.dataset.action = 'fire';
  const root = touch ? new FakeTarget() : null;
  if (root) {
    root.querySelector = (sel) => zones[sel.slice(1)];
    root.querySelectorAll = (sel) => (sel === '[data-action]' ? (twoFireButtons ? [fire, fire2] : [fire]) : []);
  }
  const input = new Input(canvas, root);
  input.enabled = true;
  t.after(() => {
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    Object.defineProperty(globalThis, 'navigator', { value: previous.navigator, configurable: true });
  });
  return { input, win, doc, root, zones, canvas, fire, fire2 };
}

const finger = (identifier, clientX = 50, clientY = 50) => ({ identifier, clientX, clientY });

test('yazı alanında tuşlar yürütmez, ateş ettirmez', (t) => {
  const { input, win } = setup(t);
  for (const tagName of ['INPUT', 'SELECT', 'TEXTAREA', 'OPTION']) {
    win.dispatch('keydown', { code: 'KeyW', target: { tagName } });
    assert.equal(input.isDown('forward'), false, `${tagName} içinde yazmak yürütmemeli`);
  }
  win.dispatch('keydown', { code: 'Space', target: { tagName: 'DIV', isContentEditable: true } });
  assert.equal(input.isDown('jump'), false);
  assert.equal(isTextEditingTarget({ tagName: 'SPAN', closest: () => ({}) }), true);
  const evt = win.dispatch('keydown', { code: 'KeyW', target: { tagName: 'BODY' } });
  assert.equal(evt.defaultPrevented, false);
  assert.equal(input.isDown('forward'), true);
});

test('odak kaybı ve arka plan basılı her şeyi bırakır (dokunmatik ateş ve çubuk dahil)', (t) => {
  const { input, win, doc, root, zones, fire } = setup(t, true);
  input.enableTouch(true);
  win.dispatch('keydown', { code: 'KeyW', target: { tagName: 'BODY' } });
  zones.moveZone.dispatch('touchstart', { changedTouches: [finger(1, 50, 50)] });
  // touchmove kökte dinlenir (tarayıcıda çubuk bölgesinden kabarcıklanır)
  root.dispatch('touchmove', { changedTouches: [finger(1, 80, 10)] });
  fire.dispatch('touchstart', { changedTouches: [finger(2)] });
  assert.equal(input.isDown('fire'), true);
  assert.notEqual(input.touch.moveY, 0);
  doc.hidden = true;
  doc.dispatch('visibilitychange');
  assert.equal(input.isDown('fire'), false);
  assert.equal(input.isDown('forward'), false);
  assert.deepEqual(input.move(), { x: 0, y: 0 });
  assert.equal(fire.classList.contains('on'), false);
  assert.equal(zones.stick.hidden, true, 'çubuk gizlendi');
  fire.dispatch('touchstart', { changedTouches: [finger(3)] });
  assert.equal(input.isDown('fire'), true);
  win.dispatch('blur');
  assert.equal(input.isDown('fire'), false);
});

test('düğmede iki parmak: ikisi de kalkana dek ateş sürer', (t) => {
  const { input, fire } = setup(t, true);
  input.enableTouch(true);
  fire.dispatch('touchstart', { changedTouches: [finger(4)] });
  fire.dispatch('touchstart', { changedTouches: [finger(5)] });
  assert.equal(input.isDown('fire'), true);
  fire.dispatch('touchend', { changedTouches: [finger(4)] });
  assert.equal(input.isDown('fire'), true);
  fire.dispatch('touchend', { changedTouches: [finger(5)] });
  assert.equal(input.isDown('fire'), false);
  assert.equal(input.released('fire'), true);
});

test('aynı eyleme bağlı iki düğme: son parmak kalkana dek ateş sürer', (t) => {
  const { input, fire, fire2 } = setup(t, true, true);
  input.enableTouch(true);
  fire.dispatch('touchstart', { changedTouches: [finger(6)] });
  fire2.dispatch('touchstart', { changedTouches: [finger(7)] });
  fire.dispatch('touchend', { changedTouches: [finger(6)] });
  assert.equal(input.isDown('fire'), true);
  assert.equal(fire.classList.contains('on'), false, 'parmağı kalkan düğme sönük');
  fire2.dispatch('touchend', { changedTouches: [finger(7)] });
  assert.equal(input.isDown('fire'), false);
});

test('çubuk tutulurken ikinci parmak merkezi taşımaz; kaçan touchend eski kimliği kilitli bırakmaz', (t) => {
  const { input, zones } = setup(t, true);
  input.enableTouch(true);
  zones.moveZone.dispatch('touchstart', { changedTouches: [finger(1, 50, 50)], touches: [finger(1, 50, 50)] });
  assert.equal(zones.stick.style.left, '50px');
  zones.moveZone.dispatch('touchstart', { changedTouches: [finger(2, 200, 200)], touches: [finger(1, 50, 50), finger(2, 200, 200)] });
  assert.equal(zones.stick.style.left, '50px', 'ikinci parmak çubuğu taşımadı');
  // 1. parmağın touchend'i kaçtı (ekranda yok): yeni dokunuş çubuğu devralır
  zones.moveZone.dispatch('touchstart', { changedTouches: [finger(3, 120, 90)], touches: [finger(3, 120, 90)] });
  assert.equal(zones.stick.style.left, '120px');
});

test('oyun dışında klavye toplanmaz; tuş atama ekranı yine yakalar', (t) => {
  const { input, win } = setup(t);
  input.enabled = false;
  win.dispatch('keydown', { code: 'KeyW', target: { tagName: 'BODY' } });
  assert.equal(input.isDown('forward'), false);
  let seen = null;
  input.onAnyKey = (evt) => {
    seen = evt.code;
    return true;
  };
  win.dispatch('keydown', { code: 'KeyG', target: { tagName: 'BODY' } });
  assert.equal(seen, 'KeyG');
  assert.equal(input.isDown('grenade'), false);
});

test('ilk tık yalnız fareyi yakalar, ateş etmez; kilit yoksa sonraki tık ateş eder', (t) => {
  const { input, canvas, win } = setup(t);
  const first = canvas.dispatch('mousedown', { button: 0 });
  assert.equal(first.defaultPrevented, true);
  assert.equal(input.isDown('fire'), false);
  assert.equal(input.lockFailed, true, 'fare kilidi olmayan ortamda kilitsiz nişan kipine geçer');
  canvas.dispatch('mousedown', { button: 0 });
  assert.equal(input.isDown('fire'), true);
  win.dispatch('mouseup', { button: 0 });
  assert.equal(input.isDown('fire'), false);
});

test('dokunmatik açıkken tık doğrudan ateştir (kilit istenmez)', (t) => {
  const { input, canvas } = setup(t, true);
  input.enableTouch(true);
  canvas.dispatch('mousedown', { button: 0 });
  assert.equal(input.isDown('fire'), true);
  assert.equal(input.lockFailed, false);
});

test('yazı alanındaki keyup hayalet bırakma üretmez; tekerlek yalnız oyun alanında sayfayı kaydırmaz', (t) => {
  const { input, win, canvas } = setup(t);
  win.dispatch('keyup', { code: 'KeyN', target: { tagName: 'TEXTAREA' } });
  assert.equal(input.released('voice'), false);
  const wheel = win.dispatch('wheel', { deltaY: 40, target: canvas });
  assert.equal(wheel.defaultPrevented, true);
  assert.equal(input.pressed('nextWeapon'), true);
  // Duraklatmadaki Ayarlar paneli (kilit yok, hedef panel) tekerlekle kaymalı
  const panel = win.dispatch('wheel', { deltaY: 40, target: { tagName: 'DIV' } });
  assert.equal(panel.defaultPrevented, false);
  const typing = win.dispatch('wheel', { deltaY: 40, target: { tagName: 'TEXTAREA' } });
  assert.equal(typing.defaultPrevented, false);
});

test('fare kilidi düşünce basılı ateş ve yürüme bırakılır', (t) => {
  const { input, doc, canvas, win } = setup(t);
  input.locked = true;
  doc.pointerLockElement = canvas;
  canvas.dispatch('mousedown', { button: 0 });
  win.dispatch('keydown', { code: 'KeyW', target: { tagName: 'BODY' } });
  assert.equal(input.isDown('fire'), true);
  doc.pointerLockElement = null;
  doc.dispatch('pointerlockchange');
  assert.equal(input.isDown('fire'), false);
  assert.equal(input.isDown('forward'), false);
});

test('gamepad çıkarılınca hareket sıfırlanır, takılınca API yeniden denenir', (t) => {
  const { input, win } = setup(t);
  input.gamepad.connected = true;
  input.gamepad.moveX = 1;
  input.gamepad.prev = [true];
  input.gamepadBlocked = true;
  win.dispatch('gamepaddisconnected');
  assert.equal(input.move().x, 0);
  assert.deepEqual(input.gamepad.prev, []);
  win.dispatch('gamepadconnected');
  assert.equal(input.gamepadBlocked, false);
});
