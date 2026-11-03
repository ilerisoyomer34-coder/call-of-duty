// Telsizin yapay zekâsız aklı (saf, Node testleri: tests/airadio.test.mjs). İki iş:
// 1) Yönlendirme: cümle soru mu, kısa ve tanınmış komut mu? (radioChat.js karma akışı)
// 2) Yerel cevap: yapay zekâ yokken sık sorulan oyun sorularını (kalan düşman, hedef, tahliye, can, mermi,
//    tuşlar…) oyun durumu özetinden (radioContext.js → buildRadioContext) cevaplar.
// Anahtar kelimeler data/aiRadio.tr.json → local (katlanmış: küçük harf, Türkçe harfsiz).
import AI from './data/aiRadio.tr.json' with { type: 'json' };
import { fold } from './commandParser.js';
import { AI_RADIO } from './config.js';

const L = Object.fromEntries(Object.entries(AI.local).map(([k, list]) => [k, list.map(fold)]));
// Kelime başı eşleşmesi: "dusman" → "dusmanlar", "kac" → "kac"; ama "ne" → "neden" değil (tam kelime listesi ayrı)
const has = (body, words) => words.some((w) => new RegExp(`(?:^| )${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(body));
const QUESTION_WORDS = new Set(L.question.filter((w) => !w.includes(' ')));
const QUESTION_PHRASES = L.question.filter((w) => w.includes(' '));

export function isQuestion(text) {
  if (/\?\s*$/.test(String(text || ''))) return true;
  const body = fold(text);
  if (!body) return false;
  if (body.split(' ').some((w) => QUESTION_WORDS.has(w))) return true;
  return QUESTION_PHRASES.some((p) => body.includes(p));
}

export const wordCount = (text) => fold(text).split(' ').filter(Boolean).length;

// Karma akış: tanınmış, soru olmayan ve kısa cümle yerelde anında çalışır (savaşta beklemek yok);
// geri kalanı yapay zekâya gider (yoksa yerel ayrıştırıcı/cevap)
// Dönüş: 'local' (ayrıştırıcının komutu) | 'ai' | 'answer' (yerel cevap dene, olmazsa komut ya da öneriler)
export function routeRadio(text, parsed, { aiAvailable }) {
  const q = isQuestion(text);
  const known = !!parsed && parsed.commandId !== 'UNKNOWN';
  if (!aiAvailable) return known && !q ? 'local' : 'answer';
  // Durum raporu ve yardım da yapay zekâya: oyun durumunu bilerek, soruya özel cevaplar
  const plain = known && !q && parsed.commandId !== 'STATUS' && parsed.commandId !== 'HELP';
  return plain && wordCount(text) <= AI_RADIO.localMaxWords ? 'local' : 'ai';
}

const where = (o) => (o?.clock ? `saat ${o.clock} yönünde ${o.m} metrede` : '');
const pct = (a, b) => Math.round((100 * a) / Math.max(1, b));

// Yerel cevap: { reply, speaker } ya da null (bilinmeyen soru)
export function answerLocally(text, ctx) {
  const body = fold(text);
  if (!body || !ctx) return null;
  const E = ctx.enemies || {};
  const hq = (reply) => ({ speaker: 'YUVA', reply });
  if (has(body, L.controls) && ctx.controls?.length) {
    // "el bombası nasıl atılır" → eylem adı cümlede geçen tuş satırı
    const hit = ctx.controls.find((c) => fold(c.split(':')[0]).split(' ').filter((w) => w.length > 3).some((w) => body.includes(w)));
    if (hit) return hq(`${hit}.`);
  }
  if (has(body, L.extraction)) {
    const x = ctx.extraction;
    if (!x) return hq('Tahliye noktası henüz bildirilmedi.');
    return hq(`Tahliye noktası ${where(x)}.`.replace(/ \./, '.'));
  }
  if (has(body, L.enemies)) {
    const near = E.visible?.[0];
    if (has(body, L.where)) return hq(near ? `En yakın ${near.type} ${where(near)}.` : 'Şu an görüşte düşman yok.');
    const parts = [`Bölgede ${E.alive ?? 0} düşman kaldı`];
    if (E.robots) parts.push(`${E.robots} robot`);
    if (E.tanks) parts.push(`${E.tanks} tank`);
    return hq(`${parts.join(', ')}.${near ? ` En yakını ${where(near)}.` : ''}`);
  }
  if (has(body, L.objective)) {
    const o = ctx.objective;
    if (!o) return hq('Şu an verilmiş bir görev yok.');
    return hq(`Görev: ${o.text}${o.detail ? ` (${o.detail})` : ''}${o.clock ? `, ${where(o)}` : ''}.`);
  }
  if (has(body, L.ammo)) {
    const p = ctx.player;
    if (!p?.weapon) return hq('Elinde ateşli silah yok.');
    return hq(`${p.weapon}: şarjörde ${p.mag ?? 0}, yedekte ${p.reserve ?? 0} mermi. El bombası: ${p.grenades ?? 0}.`);
  }
  if (has(body, L.health)) {
    const p = ctx.player;
    if (!p) return null;
    return hq(`Sağlığın %${pct(p.hp, p.maxHp)}${p.armor ? `, zırh %${p.armor}` : ''}.${p.down ? ' Yerdesin, yardım bekle!' : ''}`);
  }
  if (has(body, L.weapon) && ctx.player?.weapon) return hq(`Elindeki silah: ${ctx.player.weapon}.`);
  if (has(body, L.map) && ctx.level) return hq(`Bölüm ${ctx.level.no}: ${ctx.level.name}, ${ctx.level.map}.`);
  if (has(body, L.time) && Number.isFinite(ctx.time)) return hq(`Görev ${Math.floor(ctx.time / 60)} dakika ${ctx.time % 60} saniyedir sürüyor.`);
  if (has(body, L.difficulty) && ctx.level?.difficulty) return hq(`Zorluk: ${ctx.level.difficulty}.`);
  return null;
}
