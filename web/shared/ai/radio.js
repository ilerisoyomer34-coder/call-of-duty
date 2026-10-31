// Yapay zekâlı telsizin ortak kuralları: talimat metni, çıktı şeması ve cevabın doğrulanması.
// Oyun (src/aiRadio.js, Artifact 'sample' yolu) ve sunucu (server/ai.js, Claude API) aynı dosyayı kullanır;
// böylece iki yolda da yapay zekâ aynı şeyi görür ve oyuna yalnız bilinen komutlar ulaşır.
// Saf modül: DOM, THREE, saat ve rastgelelik yok (shared/ kuralı).
import AI from '../../src/data/aiRadio.tr.json' with { type: 'json' };
import CMD from '../../src/data/commands.tr.json' with { type: 'json' };
import SQUAD from '../../src/data/squad.json' with { type: 'json' };
import { AI_RADIO } from '../../src/config.js';

export const AI_TEXT = AI;
export const HQ = 'YUVA';
export const AI_CALLSIGNS = SQUAD.members.map((m) => m.callsign);
export const AI_SPEAKERS = [...AI_CALLSIGNS, HQ];
// Yapay zekânın verebileceği komutlar: tim komutları + plan iptali (STATUS/HELP sözle cevaplanır)
export const AI_COMMANDS = [...Object.keys(CMD.commands), 'CANCEL_PLAN'];
export const AI_REFERENCES = Object.keys(AI.references);
// commands.js → intentTarget'ın tanıdığı nokta türleri ('none' ve 'aim' oradaki varsayılan: nişangâh)
const TARGET_KINDS = new Set(['previous', 'player', 'objective', 'extraction', 'intel', 'helicopter', 'tank', 'nearest-enemy']);

// Muhatap adları: çağrı kodu, asker adı ("Demir"), ve küçük harf/ASCII yazımları
const fold = (s) => String(s || '').toLocaleLowerCase('tr-TR').replace(/[çğıöşü]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' })[c]).replace(/[^a-z0-9]/g, '');
const WHO = new Map();
for (const m of SQUAD.members) {
  WHO.set(fold(m.callsign), m.callsign);
  WHO.set(fold(m.name), m.callsign);
}

// Sabit talimat (sistem istemi). Komut listesi ve örnekler veriden üretilir: komut eklenince talimat da güncellenir
export function aiInstructions() {
  const lines = [...AI.instructions, '', 'Komutlar (command):'];
  for (const id of AI_COMMANDS) lines.push(`- ${id}: ${AI.commands[id] || CMD.commands[id]?.label || id}`);
  lines.push('', 'Nokta türleri (reference):');
  for (const [k, v] of Object.entries(AI.references)) lines.push(`- ${k}: ${v}`);
  lines.push('', 'Muhatap (to): "all" tüm tim ya da çağrı kodları: ' + SQUAD.members.map((m) => `${m.callsign} ${m.name} (${m.roleLabel || m.role})`).join(', ') + '.');
  lines.push('', ...AI.format, '', 'Örnekler:');
  for (const [q, a] of AI.examples) lines.push(`${AI.player} ${q}`, a);
  return lines.join('\n');
}

// Sunucu yolunda yapılandırılmış çıktı şeması (output_config.format). Sayı/uzunluk kısıtları şemada desteklenmez:
// sanitizeReply kırpar.
export function aiReplySchema() {
  return {
    type: 'object',
    properties: {
      speaker: { type: 'string', enum: AI_SPEAKERS },
      reply: { type: 'string' },
      actions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            command: { type: 'string', enum: AI_COMMANDS },
            to: { type: 'array', items: { type: 'string', enum: ['all', ...AI_CALLSIGNS] } },
            reference: { type: 'string', enum: AI_REFERENCES },
            clock: { type: 'integer' },
            distance: { type: 'number' },
          },
          required: ['command', 'to', 'reference', 'clock', 'distance'],
          additionalProperties: false,
        },
      },
    },
    required: ['speaker', 'reply', 'actions'],
    additionalProperties: false,
  };
}

// Oyuncunun cümlesi + o anki oyun durumu (her istekte değişir; talimat sabit kalır ki önbelleğe girsin)
export function aiUserTurn(text, context) {
  return `${AI.context}\n${JSON.stringify(context ?? {})}\n\n${AI.player} ${String(text || '').trim()}`;
}

const clampInt = (v, lo, hi) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
};

function addresseesOf(to) {
  const list = (Array.isArray(to) ? to : [to]).map((x) => (fold(x) === 'all' || fold(x) === 'hepsi' ? 'all' : WHO.get(fold(x)))).filter(Boolean);
  if (!list.length || list.includes('all')) return 'all';
  return [...new Set(list)];
}

// Telsiz metni: tek satır, biçimlendirme işaretsiz, üst sınırlı
function cleanReply(s, max) {
  let t = String(s ?? '').replace(/[*_`#>]+/g, '').replace(/\s+/g, ' ').trim();
  if (t.length > max) t = `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
  return t;
}

// Yapay zekâ cevabı → { speaker, reply, actions[] } (bilinmeyen komut/muhatap/nokta atılır). Kullanılamazsa null.
// actions: commands.js planının adımları { commandId, addressees, reference, dir, distance }
export function sanitizeReply(raw, { maxReply = AI_RADIO.maxReply, maxActions = AI_RADIO.maxActions, maxDistance = AI_RADIO.maxDistance } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const actions = [];
  for (const a of Array.isArray(raw.actions) ? raw.actions : []) {
    if (actions.length >= maxActions) break;
    if (!a || typeof a !== 'object') continue;
    const commandId = String(a.command ?? a.commandId ?? '').trim().toUpperCase();
    if (!AI_COMMANDS.includes(commandId)) continue;
    const ref = String(a.reference ?? 'none').trim().toLowerCase();
    // Yön yalnız noktasız emirde geçerli: 'aim' nişangâh, adlı nokta kendi yerini taşır
    const clock = ref === 'none' || !AI_REFERENCES.includes(ref) ? clampInt(a.clock, 1, 12) : null;
    actions.push({
      commandId,
      addressees: addresseesOf(a.to ?? a.addressees),
      reference: TARGET_KINDS.has(ref) ? { kind: ref } : null,
      dir: clock ? { clock } : null,
      distance: clock ? clampInt(a.distance, 1, maxDistance) : null,
    });
  }
  const reply = cleanReply(raw.reply, maxReply);
  if (!reply && !actions.length) return null;
  let speaker = AI_SPEAKERS.find((s) => fold(s) === fold(raw.speaker)) || WHO.get(fold(raw.speaker)) || null;
  // Konuşan verilmediyse emri alan ilk asker, yoksa karargâh
  if (!speaker) speaker = actions.length && actions[0].addressees !== 'all' ? actions[0].addressees[0] : actions.length ? AI_CALLSIGNS[0] : HQ;
  return { speaker, reply, actions };
}

// Cevabın sohbet belleğinde saklanan biçimi (yapay zekâ bir sonraki turda kendi önceki cevabını görür)
export function replyMemo(r) {
  return JSON.stringify({
    speaker: r.speaker,
    reply: r.reply,
    actions: r.actions.map((a) => ({ command: a.commandId, to: a.addressees === 'all' ? ['all'] : a.addressees, reference: a.reference?.kind || 'none', clock: a.dir?.clock || 0, distance: a.distance || 0 })),
  });
}

// Sohbet belleği: kullanıcı ile başlar, kullanıcı/asistan sırayla, asistan ile biter (son soru ayrıca eklenir).
// Bozuk ya da fazla uzun girdiler atılır
export function sanitizeHistory(list, { turns = AI_RADIO.historyTurns, maxChars = 1200 } = {}) {
  const out = [];
  for (const m of Array.isArray(list) ? list : []) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') continue;
    const content = m.content.trim().slice(0, maxChars);
    if (!content) continue;
    const want = out.length % 2 === 0 ? 'user' : 'assistant';
    if (m.role !== want) continue;
    out.push({ role: m.role, content });
  }
  if (out.length % 2) out.pop();
  return out.slice(-turns * 2);
}

// Metinden JSON nesnesi çıkar (Artifact yolunda yapay zekâ çevresine bir cümle ekleyebilir)
export function parseReplyText(text) {
  const s = String(text || '');
  for (const cand of [s, s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1)]) {
    try {
      const v = JSON.parse(cand);
      if (v && typeof v === 'object') return v;
    } catch {
      /* sıradaki aday */
    }
  }
  return null;
}
