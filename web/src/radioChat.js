// Telsiz / konuşma kutusu (Operasyon Güncellemesi §8.4, §8.7). Telsiz kuyruğundan (mission.radio) çıkan her satır
// burada da bir satır olur: Komutan camgöbeği, askerler kendi renginde, sistem ve karargâh sarı, düşman kırmızı.
// Kapalıyken yalnız TELSİZ AÇ ve yeni mesaj sayacı görünür. Düğme/Enter paneli açar; kapatma/Esc gizler.
// Yazılan Türkçe cümle ayrıştırıcıdan (commandParser.js) komuta dönüşür; anlaşılmazsa asker sorar, üç öneri çıkar
// ve satır açık kalır. Spam kuralları kuyruktadır (mission.radio, ally.say); bu kutu yalnız gösterir.
// İsteğe bağlı seslendirme speechSynthesis (tr-TR, askere göre perde/hız); isteğe bağlı sesli komut
// SpeechRecognition (N basılı) — tarayıcı desteklemiyorsa arayüzde görünmez.
import SQUAD from './data/squad.json' with { type: 'json' };
import CMD from './data/commands.tr.json' with { type: 'json' };
import { parseCommand } from './commandParser.js';
import { playerLabel } from './nameScreen.js';

const FADE_SEC = 8;
const HISTORY = 60;
const TALK_MS = 1000; // konuşan askerin HUD satırı ve etiketi bu kadar parlar
const COLORS = { player: '#5ee7ff', system: '#ffd36a', warn: '#ff6a5a' };

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
    this.unread = 0;
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
    this.box.addEventListener('keydown', (e) => e.stopPropagation());
    const bar = document.createElement('div');
    bar.className = 'rlBar';
    this.toggle = document.createElement('button');
    this.toggle.type = 'button';
    this.toggle.id = 'btnRadioToggle';
    this.toggle.setAttribute('aria-controls', 'radioMessages chatInput');
    this.toggle.title = 'Telsizi aç / kapat · Enter ile aç, Esc ile kapat';
    this.toggleLabel = document.createElement('span');
    this.badge = document.createElement('span');
    this.badge.className = 'rlBadge';
    this.toggle.append(this.toggleLabel, this.badge);
    this.toggle.addEventListener('click', () => {
      const g = this.game;
      if (this.open) this.closeChat();
      else if (g.mode === 'mission' && g.state === 'playing' && g.player.alive && !g.wheel?.open) this.openChat();
    });
    bar.appendChild(this.toggle);
    this.list = document.createElement('div');
    this.list.id = 'radioMessages';
    this.list.className = 'rlList';
    this.list.hidden = true;
    // Sohbet satırı ve öneriler (Enter ya da TELSİZ AÇ ile açılır)
    this.form = document.createElement('form');
    this.form.className = 'rlForm';
    this.form.hidden = true;
    const tag = document.createElement('b');
    tag.textContent = `${SQUAD.playerCallsign} ›`;
    this.tag = tag;
    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.id = 'chatInput';
    this.input.autocomplete = 'off';
    this.input.spellcheck = false;
    this.input.enterKeyHint = 'send';
    this.input.maxLength = 360;
    this.input.placeholder = 'Demir sola 20 metre git, sonra bekle · yardım';
    this.input.title = 'Türkçe/ASCII komut · Adla hitap · Yön ve mesafe · En fazla 8 sıralı emir · “yardım” / “durum raporu”';
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
    this.box.append(bar, this.list, this.form, this.sugg);
    // Menü ekranlarının altında kalsın (onlar #app'te daha sonra gelir)
    const overlay = $('clickToPlay') || $('touch');
    if (overlay) overlay.after(this.box);
    else host.appendChild(this.box);
    document.body.classList.add('radioCollapsed');
    this.updateToggle();
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submit(this.input.value);
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
    const atBottom = this.list.scrollHeight - this.list.scrollTop - this.list.clientHeight < 24;
    const el = document.createElement('div');
    el.className = `rl ${kind}`;
    const b = document.createElement('b');
    b.textContent = `[${who}]`;
    b.style.color = color || COLORS[kind] || '#7fd38a';
    el.append(b, document.createTextNode(` ${text}`));
    this.list.appendChild(el);
    this.lines.push({ el, t: this.time });
    while (this.lines.length > HISTORY) this.lines.shift().el.remove();
    if (!this.open) { this.unread = Math.min(100, this.unread + 1); this.updateToggle(); }
    this.layout(atBottom);
  }

  updateToggle() {
    this.toggleLabel.textContent = this.open ? 'TELSİZ KAPAT' : 'TELSİZ AÇ';
    this.toggle.setAttribute('aria-expanded', String(this.open));
    this.badge.hidden = this.open || !this.unread;
    this.badge.textContent = this.unread > 99 ? '99+' : String(this.unread);
    this.badge.setAttribute('aria-label', `${this.unread} yeni telsiz mesajı`);
  }

  // Kapalı panelde mesajlar birikmeye devam eder, ekranı açmaz.
  layout(scrollToEnd = false) {
    if (this.open && scrollToEnd) this.list.scrollTop = this.list.scrollHeight;
  }

  // Seslendirme (ayar açıksa): askere göre perde ve hız
  tts(text, voice) {
    // Oyun sesi kapalıyken seslendirme de susar
    if (!this.game.settings.tts || this.game.settings.muted || !speechSupported()) return;
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
      this.unread = 0;
      this.updateToggle();
      // Satırın başında oyuncunun adı (ad sonradan değişebilir)
      this.tag.textContent = `${playerLabel(this.game, SQUAD.playerCallsign)} ›`;
      this.box.classList.add('open');
      document.body.classList.remove('radioCollapsed');
      this.list.hidden = false;
      this.form.hidden = false;
      this.input.value = '';
      this.layout(true);
      this.place();
      this.game.input.exitLock?.();
    }
    this.input.focus();
  }

  // Masaüstünde tim listesinin üstü; telefonda kapalı düğme sol altta,
  // açık ve yüksekliği sınırlı panel klavyenin üstünde (CSS).
  place() {
    const g = this.game;
    const st = this.box.style;
    if (g.input.touch.active || (this.open && matchMedia('(max-width: 900px), (max-height: 520px)').matches)) {
      if (st.bottom) st.bottom = '';
      return;
    }
    const sq = $('squad');
    const ref = sq && !sq.hidden && sq.offsetHeight ? sq : $('health');
    if (!ref?.offsetParent) return;
    const want = `${ref.offsetParent.clientHeight - ref.offsetTop + 8}px`;
    if (this.box.style.bottom !== want) this.box.style.bottom = want;
  }

  closeChat() {
    const wasOpen = this.open;
    this.open = false;
    this.updateToggle();
    this.box.classList.remove('open');
    document.body.classList.add('radioCollapsed');
    this.list.hidden = true;
    this.form.hidden = true;
    this.sugg.hidden = true;
    this.input.blur();
    this.layout();
    this.place();
    const g = this.game;
    if (wasOpen && g.state === 'playing' && !g.input.touch.active) g.input.requestLock?.();
  }

  // Yazılan ya da söylenen cümle → komut (inputMethod: 'text' | 'voice'). Anlaşılmazsa satır açık kalır
  submit(text, inputMethod = 'text') {
    const g = this.game;
    const t = (text || '').trim();
    if (!t) {
      this.closeChat();
      return null;
    }
    const r = parseCommand(t, { ...g.commands.radioContext, defaultAddressees: g.commands.addressee });
    if (r.commandId === 'UNKNOWN') {
      const a = g.allies.list.find((x) => !x.down) || g.allies.list[0];
      g.mission?.radio(`${playerLabel(g, SQUAD.playerCallsign)} → ${SQUAD.team}`, inputMethod === 'voice' ? `🎤 ${t}` : t, 0, 'player');
      g.mission?.radio(a?.radioLabel || 'TELSİZ', r.message || CMD.unknown.say, 0, a ? 'squad' : 'system', 'reply');
      this.input.value = '';
      this.showSuggestions(r.suggest);
      return r;
    }
    this.closeChat();
    g.commands.issuePlan(r, { inputMethod });
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
      this.place();
    }
  }

  clear() {
    for (const l of this.lines) l.el.remove();
    this.lines = [];
    this.unread = 0;
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
