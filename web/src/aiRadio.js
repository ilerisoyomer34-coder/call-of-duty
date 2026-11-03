// Yapay zekâlı telsizin oyun tarafı (game.ai). Cümleyi ve oyun durumunu (radioContext.js) Claude'a sorar, cevabı
// doğrulanmış { speaker, reply, actions } olarak döndürür. İki yol, ilk çalışan kullanılır:
//  1) claude.ai Artifact'ı: 'sample' yeteneği (izleyicinin kendi Claude hesabı; anahtar yok, ilk soruda izin ister)
//  2) Yapay zekâsı açık oyun sunucusu: POST /api/ai/radio (anahtar sunucu sahibinde, server/ai.js)
// İkisi de yoksa available false: telsiz yerel ayrıştırıcı + yerel cevaplarla (radioIntel.js) çalışır.
// Sohbet belleği son AI_RADIO.historyTurns soru-cevap; görev başında sıfırlanır.
import { AI_RADIO } from './config.js';
import { aiInstructions, aiUserTurn, sanitizeReply, sanitizeHistory, parseReplyText, replyMemo, AI_TEXT, HQ } from '../shared/ai/radio.js';

// Bu kodlar 'sample' yolunun bu görünümde hiç çalışmayacağını söyler: bir daha denenmez (izin sorusu tekrarlanmaz)
const SAMPLE_DEAD = new Set(['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed']);

export class AiRadio {
  constructor(game) {
    this.game = game;
    this.sample = null;
    this.sampleOff = false;
    this.turns = [];
    this.ctl = null;
    this.instructions = null;
    // Artifact görünümünde window.claude vardır; başka yerde (Pages, uygulama, yerel dosya) yoktur
    const use = typeof window !== 'undefined' ? window.claude?.use : null;
    if (typeof use === 'function') {
      Promise.resolve()
        .then(() => window.claude.use('sample'))
        .then((s) => (this.sample = typeof s === 'function' ? s : null))
        .catch(() => {});
    }
  }

  get backend() {
    if (this.sample && !this.sampleOff) return 'artifact';
    if (this.game.social?.aiReady) return 'server';
    return null;
  }

  get available() {
    return !!this.backend;
  }

  get busy() {
    return !!this.ctl;
  }

  reset() {
    this.cancel();
    this.turns = [];
  }

  cancel() {
    this.ctl?.abort();
    this.ctl = null;
  }

  // Sor: { speaker, reply, actions } döner; olmazsa { code } ile reddeder ('ai_off', 'ai_busy', 'network'…)
  async ask(text, context) {
    const backend = this.backend;
    if (!backend) throw { code: 'ai_off' };
    this.cancel();
    const ctl = new AbortController();
    this.ctl = ctl;
    try {
      const raw = backend === 'artifact' ? await this.askSample(text, context, ctl.signal) : await this.askServer(text, context, ctl.signal);
      const out = sanitizeReply(raw);
      if (!out) throw { code: 'ai_error' };
      this.turns.push({ role: 'user', content: String(text).slice(0, 400) }, { role: 'assistant', content: replyMemo(out) });
      this.turns = sanitizeHistory(this.turns);
      return out;
    } catch (e) {
      // Yeni soru eskisini iptal etti: eski soru sessizce düşer (ağ hatası sayılıp yerel yedeğe geçilmez)
      throw { code: ctl.signal.aborted ? 'cancelled' : e?.code || 'ai_error' };
    } finally {
      if (this.ctl === ctl) this.ctl = null;
    }
  }

  async askSample(text, context, signal) {
    this.instructions ??= `${aiInstructions()}\n\nBundan sonraki her mesaj ${AI_TEXT.context} ve ${AI_TEXT.player} satırlarını taşır. Yalnız JSON nesnesiyle cevap ver.`;
    const input = [{ role: 'user', content: this.instructions }, ...sanitizeHistory(this.turns), { role: 'user', content: aiUserTurn(text, context) }];
    try {
      const v = await this.sample.json(input, { modelTier: AI_RADIO.modelTier, cache: false, signal });
      return v && typeof v === 'object' ? v : parseReplyText(String(v));
    } catch (e) {
      if (SAMPLE_DEAD.has(e?.code)) this.sampleOff = true;
      // Reddedilen soru: karakterden çıkmadan kibarca geri çevrilir
      if (e?.code === 'refused') return { speaker: HQ, reply: AI_TEXT.ui.refused, actions: [] };
      if (e?.code === 'invalid_json' && e.text) {
        const v = parseReplyText(e.text);
        if (v) return v;
      }
      throw { code: e?.code === 'rate_limited' ? 'ai_busy' : e?.code === 'cancelled' ? 'cancelled' : 'ai_error' };
    }
  }

  askServer(text, context, signal) {
    // Sunucu takılırsa oyuncu beklemesin: süre dolunca yerel telsize düşülür
    const timeout = AbortSignal.timeout ? AbortSignal.any?.([signal, AbortSignal.timeout(AI_RADIO.timeoutMs)]) || signal : signal;
    return this.game.social.aiRadio({ text, context, history: sanitizeHistory(this.turns) }, timeout);
  }
}
