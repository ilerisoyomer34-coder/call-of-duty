// Telsiz / konuşma kutusu (Operasyon Güncellemesi §8.4, §8.7). Telsiz kuyruğundan (mission.radio) çıkan her satır
// burada da bir satır olur: Komutan camgöbeği, askerler kendi renginde, sistem ve karargâh sarı, düşman kırmızı.
// Kapalıyken yalnız TELSİZ AÇ ve yeni mesaj sayacı görünür. Düğme/Enter paneli açar; kapatma/Esc gizler.
// Yazılan ya da söylenen cümle iki yoldan birine gider (radioIntel.js → routeRadio):
//  - kısa, tanınmış komut: yerel ayrıştırıcı (commandParser.js) anında uygular (savaşta beklemek yok);
//  - soru, uzun ya da tanınmayan cümle: yapay zekâlı telsiz (aiRadio.js) cevap verir, istenenleri tim komutlarına
//    çevirir; yapay zekâ yoksa ya da cevap gelmezse yerel cevap (radioIntel.js) ve yerel ayrıştırıcı.
// Hiçbiri olmazsa asker üç öneri sunar ve satır açık kalır. Spam kuralları kuyruktadır (mission.radio, ally.say).
// İsteğe bağlı seslendirme speechSynthesis (tr-TR, askere göre perde/hız); isteğe bağlı sesli komut
// SpeechRecognition (N basılı) — tarayıcı desteklemiyorsa arayüzde görünmez.
import SQUAD from './data/squad.json' with { type: 'json' };
import CMD from './data/commands.tr.json' with { type: 'json' };
import { parseCommand } from './commandParser.js';
import { playerLabel } from './nameScreen.js';
import { AI_RADIO } from './config.js';
import { AI_TEXT, HQ } from '../shared/ai/radio.js';
import { routeRadio, answerLocally, isQuestion } from './radioIntel.js';
import { buildRadioContext } from './radioContext.js';

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
    this.peekT = 0;
    this.aiLine = null; // yapay zekâ cevabı: telsizde görününce önizlenir, sesli soruya sesli cevap
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
    this.commsToggle = $('btnCommsToggle');
    this.commsPanel = $('mobileCommsPanel');
    this.commsBadge = $('commsUnread');
    this.commsToggle?.addEventListener('click', () => {
      const g = this.game;
      if (g.mode !== 'mission' || g.state !== 'playing' || !g.player.alive) return;
      const open = this.commsPanel.hidden;
      if (this.open) this.closeChat();
      this.setCommsOpen(open);
    });
    $('btnMobileRadio')?.addEventListener('click', () => this.openChat());
    $('mobileComms')?.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') this.setCommsOpen(false);
    });
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
    this.input.placeholder = 'Soru sor ya da emir ver · Demir sola 20 metre git';
    this.input.title = 'Soru ya da emir · Türkçe/ASCII · Adla hitap · Yön ve mesafe · En fazla 8 sıralı emir · Yapay zekâ telsizi açıksa her cümle anlaşılır';
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
    // Panel kapalıyken gelen yapay zekâ cevabı kısa süre burada görünür (sorulan sorunun cevabı kaybolmasın)
    this.peekEl = document.createElement('div');
    this.peekEl.className = 'rlPeek';
    this.peekEl.hidden = true;
    this.box.append(bar, this.peekEl, this.list, this.form, this.sugg);
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
    const ai = this.aiLine && this.aiLine.text === body ? this.aiLine : null;
    if (ai) {
      this.aiLine = null;
      if (!this.open) this.peek(who, body, ally?.member.color);
    }
    if (ally) ally.talkUntil = performance.now() + TALK_MS;
    // Sesli soruya cevap seslendirme ayarı kapalı olsa da sesli (oyun sesi açıksa)
    if (ally || ai) this.tts(body, ally?.member.voice, ai?.voice);
  }

  // Kapalı panelin altında son yapay zekâ cevabı (AI_RADIO.peekSec sn)
  peek(who, text, color) {
    const b = document.createElement('b');
    b.textContent = `[${who}]`;
    b.style.color = color || COLORS.system;
    this.peekEl.replaceChildren(b, document.createTextNode(` ${text}`));
    this.peekEl.hidden = false;
    this.peekT = AI_RADIO.peekSec;
  }

  // Satır ekle. kind: 'player' | 'ally' | 'system' | 'warn'. quiet: okunmamış sayacına girmez (geçici satır)
  add(who, text, kind = 'system', color = null, quiet = false) {
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
    if (!this.open && !quiet) { this.unread = Math.min(100, this.unread + 1); this.updateToggle(); }
    this.layout(atBottom);
    return el;
  }

  // Geçici satırı (yapay zekâ bekleniyor) kaldır
  removeLine(el) {
    if (!el) return;
    const i = this.lines.findIndex((l) => l.el === el);
    if (i >= 0) this.lines.splice(i, 1);
    el.remove();
  }

  updateToggle() {
    this.toggleLabel.textContent = this.open ? 'TELSİZ KAPAT' : 'TELSİZ AÇ';
    this.toggle.setAttribute('aria-expanded', String(this.open));
    this.badge.hidden = this.open || !this.unread;
    this.badge.textContent = this.unread > 99 ? '99+' : String(this.unread);
    this.badge.setAttribute('aria-label', `${this.unread} yeni telsiz mesajı`);
    if (this.commsBadge) {
      this.commsBadge.hidden = this.open || !this.unread;
      this.commsBadge.textContent = this.badge.textContent;
      this.commsBadge.setAttribute('aria-label', `${this.unread} yeni telsiz mesajı`);
    }
  }

  setCommsOpen(open) {
    if (!this.commsPanel) return;
    this.commsPanel.hidden = !open;
    this.commsToggle.setAttribute('aria-expanded', String(open));
    if (!open) this.game.voice?.stop();
  }

  // Kapalı panelde mesajlar birikmeye devam eder, ekranı açmaz.
  layout(scrollToEnd = false) {
    if (this.open && scrollToEnd) this.list.scrollTop = this.list.scrollHeight;
  }

  // Seslendirme (ayar açıksa): askere göre perde ve hız
  tts(text, voice, force = false) {
    // Oyun sesi kapalıyken seslendirme de susar
    if (!(this.game.settings.tts || force) || this.game.settings.muted || !speechSupported()) return;
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
    this.setCommsOpen(false);
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
      // Telefonda kapalı düğme sol altta; sol sütunun bonus takipçisi uzayıp aşağı inerse üstüne binmesin: sağına kayar
      let left = '';
      const tr = $('tracker');
      if (!this.open && g.input.touch.active && tr && !tr.hidden && tr.offsetParent) {
        const a = this.toggle.getBoundingClientRect();
        const b = tr.getBoundingClientRect();
        if (b.height && a.top < b.bottom && b.top < a.bottom) left = `${Math.round(b.right + 8)}px`;
      }
      if (st.left !== left) st.left = left;
      return;
    }
    if (st.left) st.left = '';
    const sq = $('squad');
    const ref = sq && !sq.hidden && sq.offsetHeight ? sq : $('health');
    if (!ref?.offsetParent) return;
    const want = `${ref.offsetParent.clientHeight - ref.offsetTop + 8}px`;
    if (this.box.style.bottom !== want) this.box.style.bottom = want;
  }

  closeChat() {
    this.setCommsOpen(false);
    const wasOpen = this.open;
    this.open = false;
    this.updateToggle();
    this.box.classList.remove('open');
    document.body.classList.add('radioCollapsed');
    this.list.hidden = true;
    this.form.hidden = true;
    this.sugg.hidden = true;
    // Odak kutuda kalmasın: gizlenen öneri düğmesi odakta kalınca sonraki Enter onu yeniden tıklıyor (aynı öneri
    // tekrar gidiyor), telsiz satırı açılmıyor ve yazılan harfler oyun tuşu oluyordu
    const f = document.activeElement;
    if (f && f !== document.body && this.box.contains(f)) f.blur();
    this.input.blur();
    this.layout();
    this.place();
    const g = this.game;
    if (wasOpen && g.state === 'playing' && !g.input.touch.active) g.input.requestLock?.();
  }

  // Yazılan ya da söylenen cümle (inputMethod: 'text' | 'voice'): yerel komut, yapay zekâ ya da yerel cevap
  submit(text, inputMethod = 'text') {
    const g = this.game;
    const t = (text || '').trim();
    if (!t) {
      this.closeChat();
      return null;
    }
    const r = parseCommand(t, { ...g.commands.radioContext, defaultAddressees: g.commands.addressee });
    const route = routeRadio(t, r, { aiAvailable: !!g.ai?.available });
    if (route === 'local') {
      this.closeChat();
      g.commands.issuePlan(r, { inputMethod });
      return r;
    }
    this.sugg.hidden = true;
    this.input.value = '';
    this.echo(t, inputMethod);
    if (route === 'ai') this.askAi(t, r, inputMethod);
    else this.fallback(t, r, inputMethod, isQuestion(t) ? AI_TEXT.ui.noAi : null);
    return r;
  }

  // Komutanın sözü telsize (komut sistemi kendi emirlerini ayrıca yazmaz: echo false)
  echo(t, inputMethod) {
    const g = this.game;
    g.mission?.radio(`${playerLabel(g, SQUAD.playerCallsign)} → ${SQUAD.team}`, inputMethod === 'voice' ? `🎤 ${t}` : t, 0, 'player');
  }

  // Yapay zekâya sor; cevap gelene dek "dinliyor" satırı. Görev değişirse cevap atılır
  async askAi(t, parsed, inputMethod) {
    const g = this.game;
    const mission = g.mission;
    const wait = this.add('TELSİZ', AI_TEXT.ui.thinking, 'system', null, true);
    let res = null;
    let err = null;
    try {
      res = await g.ai.ask(t, buildRadioContext(g));
    } catch (e) {
      err = e;
    }
    this.removeLine(wait);
    if (g.mission !== mission || g.mode !== 'mission' || err?.code === 'cancelled') return;
    if (!res) {
      const note = err?.code === 'ai_limit' ? AI_TEXT.ui.limit : err?.code === 'ai_busy' ? AI_TEXT.ui.busy : AI_TEXT.ui.failed;
      this.fallback(t, parsed, inputMethod, note);
      return;
    }
    this.say(res, inputMethod);
    if (res.actions.length) {
      // Cevap onay yerine geçer (silent); emirler yine sırayla ve doğrulanarak (commands.js) yürür
      const steps = res.actions.map((a) => ({ ...a, sourceText: t }));
      g.commands.issuePlan({ ...steps[0], steps }, { inputMethod, echo: false, silent: true });
      if (this.open) this.closeChat();
    }
  }

  // Yapay zekâ cevabını konuşanın ağzından telsize ver
  say(res, inputMethod) {
    const g = this.game;
    const ally = res.speaker !== HQ ? g.allies.list.find((a) => a.callsign === res.speaker && !a.dead && !a.down) : null;
    this.aiLine = { text: res.reply, voice: inputMethod === 'voice' };
    if (!res.reply) this.aiLine = null;
    else if (ally) ally.sayLine(res.reply, true, 'reply');
    else g.mission?.radio(HQ, res.reply, 0, 'system', 'reply');
  }

  // Yapay zekâsız: yerel cevap, olmazsa tanınan komut, o da yoksa öneriler. note: önce söylenecek sistem satırı
  fallback(t, parsed, inputMethod, note = null) {
    const g = this.game;
    const local = answerLocally(t, buildRadioContext(g));
    if (local) {
      this.say(local, inputMethod);
      return;
    }
    if (note) g.mission?.radio('TELSİZ', note, 0, 'system', 'reply');
    if (parsed.commandId !== 'UNKNOWN') {
      this.closeChat();
      g.commands.issuePlan(parsed, { inputMethod, echo: false });
      return;
    }
    const a = g.allies.list.find((x) => !x.down && !x.dead) || g.allies.list[0];
    g.mission?.radio(a?.radioLabel || 'TELSİZ', parsed.message || CMD.unknown.say, 0, a ? 'squad' : 'system', 'reply');
    this.showSuggestions(parsed.suggest);
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
    if (this.peekT > 0) {
      this.peekT -= dt;
      if (this.peekT <= 0 || this.open) {
        this.peekT = 0;
        this.peekEl.hidden = true;
      }
    }
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
    // Yeni görev: yapay zekânın sohbet belleği ve bekleyen sorusu da sıfırlanır
    this.game.ai?.reset();
    this.aiLine = null;
    this.peekT = 0;
    this.peekEl.hidden = true;
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
    this.button = $('tbVoice');
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
        const g = chat.game;
        if (text && g.state === 'playing' && g.mode === 'mission' && g.player.alive) chat.submit(text, 'voice');
      };
      this.rec.onend = () => this.setActive(false);
      // MİKROFON düğmesi: izin istemi dokunuşun içinde başlasın
      this.button?.addEventListener('pointerdown', (e) => {
        const g = chat.game;
        if (g.mode !== 'mission' || g.state !== 'playing' || !g.player.alive || e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        this.button.setPointerCapture(e.pointerId);
        this.start();
      });
      for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) this.button?.addEventListener(event, () => this.stop());
      window.addEventListener('blur', () => this.stop());
      this.rec.onerror = (e) => {
        this.setActive(false);
        // Mikrofon izni verilmediyse ya da hizmet yoksa bir kez söylenir
        if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') chat.add('TELSİZ', 'Mikrofon izni yok: sesli komut kapalı.', 'warn');
      };
    } catch {
      this.supported = false;
    }
  }

  // Bölmede mikrofon hep görünür; kullanılamıyorsa nedeni düğmede yazılır.
  refresh(settings) {
    const enabled = this.supported && !!settings.voiceCommands;
    document.body.classList.toggle('voicecmd', enabled);
    this.hint = !this.supported ? 'Desteklenmiyor' : !settings.voiceCommands ? 'Ayarlarda kapalı' : 'Basılı tut';
    if (this.button) {
      this.button.disabled = !enabled;
      this.button.title = `Mikrofon · ${this.hint}`;
      this.button.querySelector('small').textContent = this.active ? 'Dinleniyor…' : this.hint;
    }
    if (!enabled) this.stop();
  }

  setActive(active) {
    this.active = active;
    this.button?.classList.toggle('on', active);
    this.button?.setAttribute('aria-pressed', String(active));
    if (this.button) this.button.querySelector('small').textContent = active ? 'Dinleniyor…' : this.hint || 'Basılı tut';
  }

  start() {
    if (!this.supported || this.active) return;
    try {
      this.rec.start();
      this.setActive(true);
      this.chat.add('TELSİZ', '🎤 Dinliyorum…', 'system');
    } catch {
      this.setActive(false);
    }
  }

  stop() {
    if (!this.active) return;
    this.setActive(false);
    try {
      this.rec.stop();
    } catch {
      /* zaten durdu */
    }
  }
}
