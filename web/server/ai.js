// Yapay zekâlı telsiz, sunucu yolu (Claude API). Oyuncu telsize yazar ya da mikrofonla konuşur; oyun cümleyi ve
// o anki oyun durumunu POST /api/ai/radio ile gönderir, burada Claude'a sorulur, cevap { speaker, reply, actions }
// olarak döner (actions oyunda tim komutlarına çevrilir). Talimat ve şema oyunla ortak: shared/ai/radio.js.
//
// Anahtar yalnız sunucunun ortamından okunur (ANTHROPIC_API_KEY; ev sunucusunda server/host.env): oyuna, istemciye
// ve günlüğe hiç çıkmaz. Paket yüklü değilse (eski kurulum, npm install yapılmamış) sunucu yine açılır, yalnız
// yapay zekâ kapalı olur.
import { aiInstructions, aiReplySchema, aiUserTurn, sanitizeReply, sanitizeHistory, parseReplyText, AI_TEXT, HQ } from '../shared/ai/radio.js';

// Yasak/güvenlik nedeniyle reddedilen istek sunucu tarafında önerilen yedek modelle yeniden denenir. Bu başlık
// "default" biçimine özgüdür; Haiku ailesinde sunucu tarafı yedek yok (parametre gönderilmez)
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export class AiError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

// client: testlerde sahte istemci (messages.create / beta.messages.create)
export async function createAiRadio({ config, log = () => {}, client = null }) {
  const cfg = config.ai || {};
  let Anthropic = null;
  try {
    ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
  } catch {
    /* paket yok: aşağıda sahte istemci yoksa kapalı */
  }
  let sdk = client;
  if (!sdk && cfg.enabled) {
    if (!Anthropic) log('Yapay zekâ telsizi kapalı: @anthropic-ai/sdk paketi yüklü değil (cd web && npm install).');
    // Anahtar ortamdan (ANTHROPIC_API_KEY); kodda ya da istekte hiç taşınmaz
    else sdk = new Anthropic({ timeout: cfg.timeoutMs, maxRetries: 1 });
  }
  const model = cfg.model;
  const useFallback = !/haiku/i.test(model || '');
  const system = [{ type: 'text', text: aiInstructions(), cache_control: { type: 'ephemeral' } }];
  const schema = aiReplySchema();

  // SDK'nın türlü hata sınıfları → oyuncuya gösterilen kod (ileti metnine bakılmaz)
  function classify(e) {
    if (e instanceof AiError) return e;
    if (Anthropic) {
      if (e instanceof Anthropic.RateLimitError) return new AiError(429, 'ai_busy');
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
        log('Yapay zekâ telsizi: API anahtarı geçersiz ya da yetkisiz (server/host.env → ANTHROPIC_API_KEY).');
        return new AiError(503, 'ai_off');
      }
      if (e instanceof Anthropic.APIConnectionTimeoutError) return new AiError(504, 'ai_timeout');
      if (e instanceof Anthropic.APIConnectionError) return new AiError(502, 'ai_network');
      if (e instanceof Anthropic.APIError) {
        log('Yapay zekâ telsizi: API hatası', e.status ?? '?');
        return new AiError(e.status === 529 || e.status >= 500 ? 503 : 502, 'ai_busy');
      }
    }
    log('Yapay zekâ telsizi hatası', e?.name || 'Error');
    return new AiError(502, 'ai_error');
  }

  async function ask({ text, context, history }) {
    if (!sdk) throw new AiError(503, 'ai_off');
    const params = {
      model,
      max_tokens: cfg.maxTokens,
      system,
      messages: [...sanitizeHistory(history), { role: 'user', content: aiUserTurn(text, context) }],
      // Telsiz anlık olmalı: düşük düşünme payı; cevap şemaya uygun tek JSON nesnesi
      output_config: { effort: cfg.effort, format: { type: 'json_schema', schema } },
    };
    let res;
    try {
      res = useFallback ? await sdk.beta.messages.create({ ...params, betas: [FALLBACK_BETA], fallbacks: 'default' }) : await sdk.messages.create(params);
    } catch (e) {
      throw classify(e);
    }
    // Yedek model de reddettiyse içerik şemaya uymayabilir: karakter içinde kibarca geri çevrilir, emir yok
    if (res?.stop_reason === 'refusal') return { speaker: HQ, reply: AI_TEXT.ui.refused, actions: [] };
    const block = (res?.content || []).find((b) => b.type === 'text');
    const out = sanitizeReply(parseReplyText(block?.text));
    if (!out) {
      log('Yapay zekâ telsizi: kullanılamayan cevap', res?.stop_reason || '?');
      throw new AiError(502, 'ai_error');
    }
    return out;
  }

  return { available: !!sdk, model, ask };
}
