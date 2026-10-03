// Telsiz / konuşma kutusu (Operasyon Güncellemesi §8.4, §8.7). Telsiz kuyruğundan (mission.radio) çıkan her satır
// burada da bir satır olur: Komutan camgöbeği, askerler kendi renginde, sistem ve karargâh sarı, düşman kırmızı.
// Kapalıyken son 6 satır görünür ve 8 sn sonra solar; Enter sohbet satırını açar (tüm geçmiş görünür, kaydırılır).
// Yazılan Türkçe cümle ayrıştırıcıdan (commandParser.js) komuta dönüşür; anlaşılmazsa asker sorar, üç öneri çıkar
// ve satır açık kalır. Spam kuralları kuyruktadır (mission.radio, ally.say); bu kutu yalnız gösterir.
// İsteğe bağlı seslendirme speechSynthesis (tr-TR, askere göre perde/hız); isteğe bağlı sesli komut
// SpeechRecognition (N basılı) — tarayıcı desteklemiyorsa arayüzde görünmez.
import SQUAD from './data/squad.json' with { type: 'json' };
import CMD from './data/commands.tr.json' with { type: 'json' };
import { parseCommand } from './commandParser.js';

const FADE_SEC = 8;
const SHOW_LINES = 6;
const SHOW_LINES_TOUCH = 3; // telefonda ekran dar: son üç satır
const HISTORY = 60;
const TALK_MS = 1000; // konuşan askerin HUD satırı ve etiketi bu kadar parlar
const COLORS = { player: '#5ee7ff', system: '#ffd36a', warn: '#ff6a5a' };
const TOUCH_BAND = 110; // telefonda kutunun kapladığı alt şerit (px): bu şeride inen panel ve düğmelerden kaçılır
const TOUCH_MIN_W = 140;

// Görünen öğenin ekrandaki kutusu (gizliyse null)
function visibleRect(id) {
  const el = document.getElementById(id);
  if (!el || el.hidden || !el.offsetParent) return null;
  const r = el.getBoundingClientRect();
  return r.width ? r : null;
}

const $ = (id) => document.getElementById(id);

export const speechSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
export const recognitionCtor = () => (typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition || null : null);

// Kuyruktaki türden satır türü: 'player' | 'ally' | 'system' | 'warn'
function lineKind(kind) {
  if (kind === 'player') return 'player';
  if (kind === 'ally' || kind === 'squad') return 'ally';
  if (kind === 'enemy') return 'warn';
  return 'system';
}

export class RadioChat {
  constructor(game) {
    this.game = game;
    this.lines = []; // { el, t }
    this.open = false;
    this.time = 0;
    this.suggT = 0;
    this.fadeT = 0;
    this.build();
    game.events.on('radio', (text, kind) => this.onRadio(text, kind));
  }

  build() {
    // Dokunmatik düğme katmanının (#touch) üstünde: açıkken yazı alanına ve önerilere dokunulabilsin.
    // Görev dışında (body.playing yokken) CSS gizler
    const host = $('app') || document.body;
    this.box = document.createElement('div');
    this.box.id = 'radioLog';
    this.list = document.createElement('div');
    this.list.className = 'rlList';
    // Sohbet satırı ve öneriler (Enter ya da SOHBET ile açılır)
    this.form = document.createElement('form');
    this.form.className = 'rlForm';
    this.form.hidden = true;
    const tag = document.createElement('b');
    tag.textContent = `${SQUAD.playerCallsign} ›`;
    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.id = 'chatInput';
    this.input.autocomplete = 'off';
    this.input.spellcheck = false;
    this.input.enterKeyHint = 'send';
    this.input.maxLength = 120;
    this.input.placeholder = 'Komut yaz: "Kaya beni iyileştir", "Herkes siper alsın!"';
    this.input.setAttribute('aria-label', 'Telsiz komutu');
    // Dokunmatikte Esc yok: kapatma düğmesi
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'rlClose';
    x.textContent = '✕';
    x.setAttribute('aria-label', 'Telsizi kapat');
    x.addEventListener('click', () => this.closeChat());
    this.form.append(tag, this.input, x);
    this.sugg = document.createElement('div');
    this.sugg.className = 'rlSugg';
    this.sugg.hidden = true;
    this.box.append(this.list, this.form, this.sugg);
    // Menü ekranlarının altında kalsın (onlar #app'te daha sonra gelir)
    const touch = $('touch');
    if (touch) touch.after(this.box);
    else host.appendChild(this.box);
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submit(this.input.value);
    });
    // SOHBET düğmesi: telefonda klavye yalnız dokunuşun içinde odaklanan alana açılır (bir sonraki karede değil)
    $('tbChat')?.addEventListener('touchend', () => {
      const g = this.game;
      if (g.mode === 'mission' && g.state === 'playing' && g.player.alive && !g.wheel?.open) this.openChat();
    });
    // Oyun girdisi yazı alanındaki tuşları zaten yok sayar (input.js); Esc yalnız sohbeti kapatsın, duraklatmasın
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.closeChat();
      }
    });
  }

  // Kuyruktan gösterilen satır: "Kim: metin"
  onRadio(text, kind) {
    const i = text.indexOf(': ');
    const who = i > 0 ? text.slice(0, i) : 'TELSİZ';
    const body = i > 0 ? text.slice(i + 2) : text;
    const k = lineKind(kind);
    const ally = k === 'ally' ? this.game.allies.list.find((a) => a.radioLabel === who) : null;
    this.add(who, body, k, ally?.member.color);
    if (ally) {
      ally.talkUntil = performance.now() + TALK_MS;
      this.tts(body, ally.member.voice);
    }
  }

  // Satır ekle. kind: 'player' | 'ally' | 'system' | 'warn'
  add(who, text, kind = 'system', color = null) {
    const el = document.createElement('div');
    el.className = `rl ${kind}`;
    const b = document.createElement('b');
    b.textContent = `[${who}]`;
    b.style.color = color || COLORS[kind] || '#7fd38a';
    el.append(b, document.createTextNode(` ${text}`));
    this.list.appendChild(el);
    this.lines.push({ el, t: this.time });
    while (this.lines.length > HISTORY) this.lines.shift().el.remove();
    this.layout();
  }

  // Görünür satırlar: kapalıyken son 6 (telefonda 3) ve 8 sn'den yeni olanlar, son 1,5 sn'de solar; açıkken hepsi
  layout() {
    const n = this.lines.length;
    const show = this.game.input.touch.active ? SHOW_LINES_TOUCH : SHOW_LINES;
    for (let i = 0; i < n; i++) {
      const l = this.lines[i];
      const age = this.time - l.t;
      const vis = this.open || (i >= n - show && age < FADE_SEC);
      if (l.el.hidden === vis) l.el.hidden = !vis;
      if (!vis) continue;
      // DOM'a yalnız değişince yaz (tarayıcı "0.50"yi "0.5" diye saklar)
      const op = this.open ? '1' : String(+Math.min(1, Math.max(0, (FADE_SEC - age) / 1.5)).toFixed(2));
      if (l.el.style.opacity !== op) l.el.style.opacity = op;
    }
    if (this.open) this.list.scrollTop = this.list.scrollHeight;
  }

  // Seslendirme (ayar açıksa): askere göre perde ve hız
  tts(text, voice) {
    if (!this.game.settings.tts || !speechSupported()) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'tr-TR';
      u.pitch = voice?.pitch ?? 1;
      u.rate = voice?.rate ?? 1;
      u.volume = Math.min(1, this.game.settings.masterVolume ?? 1);
      const v = speechSynthesis.getVoices().find((x) => /^tr/i.test(x.lang));
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch {
      /* seslendirme yok: altyazı yeter */
    }
  }

  openChat() {
    if (!this.open) {
      this.open = true;
      this.box.classList.add('open');
      this.form.hidden = false;
      this.input.value = '';
      this.layout();
      this.place();
      this.game.input.exitLock?.();
    }
    this.input.focus();
  }

  // Masaüstünde kutu sol altta, tim listesinin (yoksa can panelinin) hemen üstünde. Dokunmatikte altta: soldaki
  // panellerle sağ alttaki başparmak düğmeleri arasındaki boşluğa sığdırılır (açıkken CSS üstte ortalar)
  place() {
    const g = this.game;
    const st = this.box.style;
    if (g.input.touch.active) {
      if (st.bottom) st.bottom = '';
      if (this.open) {
        if (st.left) st.left = st.width = '';
        return;
      }
      const band = innerHeight - TOUCH_BAND;
      let left = 16;
      let right = innerWidth - 16;
      for (const id of ['tracker', 'ammo', 'health', 'squad']) {
        const b = visibleRect(id);
        if (b && b.bottom > band) left = Math.max(left, b.right + 8);
      }
      for (const id of ['tbSwap', 'tbItem1', 'tbItem2', 'tbCrouch', 'tbJump']) {
        const b = visibleRect(id);
        if (b && b.bottom > band && b.left > left) right = Math.min(right, b.left - 8);
      }
      const l = `${Math.round(left)}px`;
      const w = `${Math.round(Math.max(TOUCH_MIN_W, right - left))}px`;
      if (st.left !== l) st.left = l;
      if (st.width !== w) st.width = w;
      return;
    }
    const sq = $('squad');
    const ref = sq && !sq.hidden && sq.offsetHeight ? sq : $('health');
    if (!ref?.offsetParent) return;
    const want = `${ref.offsetParent.clientHeight - ref.offsetTop + 8}px`;
    if (this.box.style.bottom !== want) this.box.style.bottom = want;
  }

  closeChat() {
    if (!this.open) return;
    this.open = false;
    this.box.classList.remove('open');
    this.form.hidden = true;
    this.sugg.hidden = true;
    this.input.blur();
    this.layout();
    this.place();
    const g = this.game;
    if (g.state === 'playing' && !g.input.touch.active) g.input.requestLock?.();
  }

  // Yazılan ya da söylenen cümle → komut (inputMethod: 'text' | 'voice'). Anlaşılmazsa satır açık kalır
  submit(text, inputMethod = 'text') {
    const g = this.game;
    const t = (text || '').trim();
    if (!t) {
      this.closeChat();
      return null;
    }
    const r = parseCommand(t);
    if (r.commandId === 'UNKNOWN') {
      const a = g.allies.list.find((x) => !x.down) || g.allies.list[0];
      g.mission?.radio(`${SQUAD.playerCallsign} → ${SQUAD.team}`, inputMethod === 'voice' ? `🎤 ${t}` : t, 0, 'player');
      if (a) g.mission?.radio(a.radioLabel, CMD.unknown.say, 0, 'squad', 'reply');
      this.input.value = '';
      this.showSuggestions(r.suggest);
      return r;
    }
    this.closeChat();
    let pos = null;
    if (r.dir && g.player) {
      // "saat 2", "sol", "sağ": oyuncunun baktığı yöne göre 15 m ileride
      const yaw = g.player.yaw - (r.dir.clock / 12) * Math.PI * 2;
      pos = g.player.pos.clone();
      pos.x -= Math.sin(yaw) * 15;
      pos.z -= Math.cos(yaw) * 15;
    }
    g.commands.issue(r.commandId, r.addressees, { inputMethod, sourceText: inputMethod === 'voice' ? `🎤 ${t}` : t, pos });
    return r;
  }

  // Anlaşılmayan komutta üç öneri; dokununca o cümle gönderilir
  showSuggestions(list) {
    this.sugg.innerHTML = '';
    for (const s of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = s;
      b.addEventListener('click', () => this.submit(s));
      this.sugg.appendChild(b);
    }
    this.sugg.hidden = false;
    this.suggT = FADE_SEC;
  }

  update(dt) {
    this.time += dt;
    if (this.suggT > 0 && !this.open) {
      this.suggT -= dt;
      if (this.suggT <= 0) this.sugg.hidden = true;
    }
    this.fadeT -= dt;
    if (this.fadeT <= 0) {
      this.fadeT = 0.25;
      this.layout();
      this.place();
    }
  }

  clear() {
    for (const l of this.lines) l.el.remove();
    this.lines = [];
    this.closeChat();
    this.sugg.hidden = true;
  }
}

// Sesli komut (N basılı): tanınan metin yazılı komutla aynı ayrıştırıcıdan geçer
export class VoiceCommand {
  constructor(chat) {
    this.chat = chat;
    this.rec = null;
    this.active = false;
    const Ctor = recognitionCtor();
    this.supported = !!Ctor;
    if (!Ctor) return;
    try {
      this.rec = new Ctor();
      this.rec.lang = 'tr-TR';
      this.rec.interimResults = false;
      this.rec.maxAlternatives = 1;
      this.rec.onresult = (e) => {
        const text = e.results?.[0]?.[0]?.transcript;
        if (text) chat.submit(text, 'voice');
      };
      this.rec.onend = () => (this.active = false);
      // MİKROFON düğmesi: izin istemi dokunuşun içinde başlasın
      $('tbVoice')?.addEventListener('touchstart', () => this.start());
      $('tbVoice')?.addEventListener('touchend', () => this.stop());
      this.rec.onerror = (e) => {
        this.active = false;
        // Mikrofon izni verilmediyse ya da hizmet yoksa bir kez söylenir
        if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') chat.add('TELSİZ', 'Mikrofon izni yok: sesli komut kapalı.', 'warn');
      };
    } catch {
      this.supported = false;
    }
  }

  // Dokunmatik MİKROFON düğmesi yalnız destek varken ve ayar açıkken görünür
  refresh(settings) {
    document.body.classList.toggle('voicecmd', this.supported && !!settings.voiceCommands);
  }

  start() {
    if (!this.supported || this.active) return;
    try {
      this.rec.start();
      this.active = true;
      this.chat.add('TELSİZ', '🎤 Dinliyorum…', 'system');
    } catch {
      this.active = false;
    }
  }

  stop() {
    if (!this.active) return;
    try {
      this.rec.stop();
    } catch {
      /* zaten durdu */
    }
  }
}
