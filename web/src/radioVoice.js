// Sesli telsiz: telsizden geçen her satır (tim, karargâh, pilot, düşman telsizi, yapay zekâ cevabı) konuşanın
// sesiyle okunur. Tarayıcının Türkçe sesleri (speechSynthesis); birden çok ses varsa her konuşmacı ayrı ses, yoksa
// ayrı perde/hız. Satırlar sırayla (bir anda tek ses); acil satır (el bombası uyarısı) okunmakta olanı keser.
// Her satırın başında ve sonunda bas-konuş cızırtısı, konuşma boyunca hafif parazit (audio.js → radio kanalı).
// Oyun sesi kapalıyken de duyulur (kullanıcı isteği: telsiz sesli gelsin); kendi anahtarı ve düzeyi Ayarlar'da.
// Komutanın kendi sözü okunmaz. Saf yardımcılar (sayable, profileFor, rankVoices) testte denenir.
import SQUAD from './data/squad.json' with { type: 'json' };
import { RADIO_VOICE as RV } from './config.js';

export const speechSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

const NUMBER_WORDS = ['sıfır', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'];
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu;

// Ekrandaki satırı okunur metne çevir: simgeler atılır, çağrı kodu ve birimler söylenir, büyük harfli kelime
// (YUVA, HEDEF) harf harf okunmasın diye ilk harfi büyük yazılır
export function sayable(text, maxChars = RV.maxChars) {
  let t = String(text || '')
    .replace(EMOJI, '')
    .replace(/[\[\]{}<>*_#|~^]/g, ' ')
    .replace(/\b(Alfa|Alpha)[-\s]?(\d)\b/gi, (_, a, d) => `Alfa ${NUMBER_WORDS[+d] || d}`)
    .replace(/(\d+(?:[.,]\d+)?)\s?m\b/g, '$1 metre')
    .replace(/(\d+(?:[.,]\d+)?)\s?km\b/g, '$1 kilometre')
    .replace(/(\d+)\s?KR\b/g, '$1 kredi')
    .replace(/\s*(→|->)\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
  t = t.replace(/(^|[^\p{L}])(\p{Lu}{3,})(?=$|[^\p{L}])/gu, (_, pre, w) => pre + w.charAt(0) + w.slice(1).toLocaleLowerCase('tr-TR'));
  if (t.length > maxChars) {
    const cut = t.slice(0, maxChars);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    t = end > maxChars * 0.5 ? cut.slice(0, end + 1) : `${cut.replace(/\s+\S*$/, '')}…`;
  }
  return t;
}

// Konuşmacının ses ayarı: asker (squad.json sırası 0–2, kendi perde/hızı), karargâh, pilot, düşman, sistem
export function profileFor(who, kind) {
  const i = SQUAD.members.findIndex((m) => who && (who === m.callsign || who.startsWith(`${m.callsign} `) || who.includes(m.name)));
  if (i >= 0) {
    const v = SQUAD.members[i].voice || {};
    return { pitch: v.pitch ?? 1, rate: v.rate ?? 1, slot: i };
  }
  if (kind === 'enemy' || kind === 'warn') return RV.speakers.enemy;
  const key = Object.keys(RV.speakers).find((k) => who && who.toLocaleUpperCase('tr-TR').startsWith(k));
  return key ? RV.speakers[key] : RV.speakers.system;
}

// Türkçe sesler kaliteye göre: adında "Natural"/"Google" geçen önce, yerel (cihazda) olan eşitlikte önce
export function rankVoices(voices, prefer = RV.prefer) {
  const score = (v) => {
    const n = (v.name || '').toLowerCase();
    const p = prefer.findIndex((k) => n.includes(k));
    return (p < 0 ? 0 : prefer.length - p) * 2 + (v.localService ? 1 : 0);
  };
  return voices.filter((v) => /^tr(\b|[-_])/i.test(v.lang || '')).sort((a, b) => score(b) - score(a));
}

export class RadioVoice {
  constructor(game) {
    this.game = game;
    this.queue = []; // { text, profile, urgent }
    this.current = null; // { u, endAt }
    this.gapT = 0;
    this.voices = [];
    this.listeners = new Set(); // durum değişince (konuşma kipi mikrofonu bununla açıp kapatır)
    this.supported = speechSupported();
    if (!this.supported) return;
    const load = () => (this.voices = rankVoices(speechSynthesis.getVoices()));
    load();
    speechSynthesis.addEventListener?.('voiceschanged', load);
  }

  get enabled() {
    return this.supported && this.game.settings.radioVoice !== false;
  }

  get speaking() {
    return !!this.current;
  }

  get busy() {
    return !!this.current || this.queue.length > 0;
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of this.listeners) fn(this);
  }

  // who: ekrandaki konuşan ("Alfa-2 Kaya", "YUVA"); kind: telsiz satırının türü. force: ayar kapalıyken de oku
  // (sesli soruya cevap). urgent: okunanı keser, sıranın başına geçer
  say(who, text, { kind = null, urgent = false, force = false } = {}) {
    if (!this.supported || kind === 'player') return false;
    if (!this.enabled && !force) return false;
    const line = sayable(text);
    if (!line) return false;
    const item = { text: line, profile: profileFor(who, kind), urgent: !!urgent };
    if (urgent) {
      this.queue.unshift(item);
      if (this.current) this.stopCurrent();
    } else {
      this.queue.push(item);
      // Sıra uzadıysa en eski acil olmayan atılır
      while (this.queue.length > RV.maxQueue) {
        const i = this.queue.findIndex((q) => !q.urgent);
        this.queue.splice(i >= 0 ? i : 0, 1);
      }
    }
    if (!this.current) this.next();
    return true;
  }

  next() {
    if (this.current || this.gapT > 0) return;
    const item = this.queue.shift();
    if (!item) {
      this.emit();
      return;
    }
    let u;
    try {
      u = new SpeechSynthesisUtterance(item.text);
    } catch {
      this.queue.length = 0;
      return;
    }
    u.lang = 'tr-TR';
    u.pitch = item.profile.pitch;
    u.rate = item.profile.rate;
    u.volume = Math.max(0, Math.min(1, this.game.settings.radioVolume ?? 1));
    const v = this.voices.length ? this.voices[item.profile.slot % this.voices.length] : null;
    if (v) u.voice = v;
    const cur = { u, endAt: performance.now() + (RV.watchdog.base + item.text.length * RV.watchdog.perChar / Math.max(0.5, u.rate)) * 1000 };
    this.current = cur;
    const done = () => {
      if (this.current !== cur) return;
      this.current = null;
      this.game.audio.radioKey?.(false);
      this.game.audio.radioHiss?.(false);
      this.gapT = RV.gapSec;
      this.emit();
    };
    u.onend = done;
    u.onerror = done;
    this.game.audio.radioKey?.(true);
    this.game.audio.radioHiss?.(true);
    try {
      speechSynthesis.speak(u);
    } catch {
      done();
    }
    this.emit();
  }

  stopCurrent() {
    const cur = this.current;
    if (!cur) return;
    this.current = null;
    try {
      speechSynthesis.cancel();
    } catch {
      /* yok */
    }
    this.game.audio.radioHiss?.(false);
  }

  // Menü, duraklatma ya da görev sonu: sıra ve okunan satır biter
  cancel() {
    this.queue.length = 0;
    this.stopCurrent();
    this.gapT = 0;
    this.emit();
  }

  update(dt) {
    if (this.gapT > 0) this.gapT -= dt;
    if (this.current && performance.now() > this.current.endAt) {
      // Bitiş olayı gelmedi (tarayıcı hatası): satır bitmiş sayılır
      this.stopCurrent();
      this.gapT = RV.gapSec;
      this.emit();
    }
    if (!this.current && this.gapT <= 0 && this.queue.length) this.next();
  }
}
