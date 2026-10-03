// Türkçe doğal dil komut ayrıştırıcı (Operasyon Güncellemesi §8.5). Sözlük data/commands.tr.json'da:
// kökler (ekleri yakalar: siper → sipere, siperde), çok kelimeli ifadeler (önce denenir), ağırlıklar,
// eşitlikte öncelik sırası, muhatap adları ve işaret kelimeleri. Saf işlev: birim testleri doğrudan dener.
//   parseCommand("Demir ve Yıldız oraya gidin") → { commandId: 'MOVE_TO', addressees: ['Alfa-1', 'Alfa-3'], target: 'aim', … }
import CMD from './data/commands.tr.json' with { type: 'json' };

const NUMBER_WORDS = new Set(['bir', 'iki', 'üç', '1', '2', '3']);

// Türkçe küçük harf (I → ı, İ → i), noktalama yok, tire boşluk, fazla boşluk tek
export function normalize(text) {
  return String(text || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[-–—_/]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Sözlüğün normalleştirilmiş kopyası (bir kez)
const NORM = (() => {
  const commands = {};
  for (const [id, c] of Object.entries(CMD.commands)) {
    commands[id] = {
      roots: (c.roots || []).map(normalize),
      phrases: (c.phrases || []).map(normalize).sort((a, b) => b.length - a.length),
      weight: c.weight || 1,
    };
  }
  const addr = [];
  for (const [who, list] of Object.entries(CMD.addressees)) {
    // Yalın sayı ("bir", "üç") ancak "alfa" ile birlikte muhatap sayılır: cümle içinde çok geçer
    for (const a of list) {
      const n = normalize(a);
      if (!NUMBER_WORDS.has(n)) addr.push({ who, alias: n });
    }
  }
  // Uzun takma adlar önce: "alfa 3" "alfa"dan (tüm tim) önce eşleşsin
  addr.sort((a, b) => b.alias.length - a.alias.length);
  return { commands, addr, targets: new Set(CMD.targetWords.map(normalize)), priority: CMD.priority };
})();

// Kelime sınırında başlayan ifade (sonuna ek gelebilir: "ateşi kes" ⊂ "ateşi kesin")
function phraseAt(text, phrase) {
  let i = text.indexOf(phrase);
  while (i >= 0) {
    if (i === 0 || text[i - 1] === ' ') return i;
    i = text.indexOf(phrase, i + 1);
  }
  return -1;
}

const CLOCK_RE = /saat (\d{1,2})/;

export function parseCommand(text) {
  const norm = normalize(text);
  let rest = ` ${norm} `;
  // 1) Muhataplar: eşleşen takma adlar metinden çıkarılır (niyet aramasını kirletmesin)
  const who = new Set();
  let all = false;
  for (const { who: w, alias } of NORM.addr) {
    const i = phraseAt(rest.trim(), alias);
    if (i < 0) continue;
    const re = new RegExp(`(^| )${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\p{L}*`, 'u');
    if (!re.test(rest.trim())) continue;
    rest = ` ${rest.trim().replace(re, ' ')} `;
    if (w === 'all') all = true;
    else who.add(w);
  }
  const words = rest.trim().split(' ').filter(Boolean);
  const body = words.join(' ');
  // 2) Niyet: ifadeler 1,5 puan, kök eşleşmeleri 1 puan; ağırlıkla çarpılır
  let best = null;
  let bestScore = 0;
  for (const id of NORM.priority) {
    const c = NORM.commands[id];
    if (!c) continue;
    let s = 0;
    let used = body;
    for (const p of c.phrases) {
      if (phraseAt(used, p) >= 0) {
        s += 1.5;
        used = used.replace(p, ' ');
      }
    }
    const toks = used.split(' ').filter(Boolean);
    for (const r of c.roots) if (toks.some((t) => t.startsWith(r))) s += 1;
    s *= c.weight;
    // Eşitlikte öncelik sırası (döngü öncelik sırasıyla gider, eşit puan yerini korur)
    if (s > bestScore) {
      bestScore = s;
      best = id;
    }
  }
  // 3) Hedef: işaret kelimesi (şu, oraya…) → nişangâh; "saat 2", "sol", "sağ" → göreli yön
  const target = words.some((w) => NORM.targets.has(w)) ? 'aim' : null;
  let dir = null;
  const m = norm.match(CLOCK_RE);
  if (m) dir = { clock: Number(m[1]) % 12 };
  else if (/(^| )sol/.test(norm)) dir = { clock: 9 };
  else if (/(^| )sağ/.test(norm)) dir = { clock: 3 };
  // 4) Güven eşiği
  if (!best || bestScore < CMD.minScore) {
    return { commandId: 'UNKNOWN', addressees: who.size ? [...who] : 'all', target: null, dir: null, score: bestScore, sourceText: text, suggest: CMD.unknown.suggest };
  }
  return { commandId: best, addressees: who.size && !all ? [...who] : who.size ? [...who] : 'all', target, dir, score: bestScore, sourceText: text };
}
