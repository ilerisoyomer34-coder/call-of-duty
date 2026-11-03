// Yerel Türkçe telsiz ayrıştırıcısı. Ağ bağlantısı gerektirmez; desteklenmeyen bir
// eylemi yapılmış gibi onaylamaz. steps, sırayla uygulanacak emirleri taşır.
import CMD from './data/commands.tr.json' with { type: 'json' };

export function normalize(text) {
  return String(text || '').toLocaleLowerCase('tr-TR')
    .replace(/[-–—_/]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ').trim();
}

// Türkçe klavyesi olmayan oyuncular ve konuşma tanımanın ASCII çıktısı.
export const fold = (text) => normalize(text).replace(/[çğıöşü]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' })[c]);
const NUMBER_WORDS = new Set(['bir', 'iki', 'uc', '1', '2', '3']);
const COUNTS = { bir: 1, iki: 2, uc: 3, dort: 4, bes: 5, alti: 6, yedi: 7, sekiz: 8, dokuz: 9, on: 10, onbir: 11, oniki: 12, onbes: 15, yirmi: 20, otuz: 30, kirk: 40, elli: 50, altmis: 60, yetmis: 70, seksen: 80, doksan: 90, yuz: 100 };
const NUMBER_PATTERN = '(?:\\d+|(?:yuz(?: |$))?(?:(?:on|yirmi|otuz|kirk|elli|altmis|yetmis|seksen|doksan)(?: |$))?(?:bir|iki|uc|dort|bes|alti|yedi|sekiz|dokuz)?|onbir|oniki|onbes)';
const escapeRE = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NORM = {
  commands: Object.fromEntries(Object.entries(CMD.commands).map(([id, c]) => [id, {
    roots: (c.roots || []).map(fold), phrases: (c.phrases || []).map(fold).sort((a, b) => b.length - a.length), weight: c.weight || 1,
  }])),
  addr: Object.entries(CMD.addressees).flatMap(([who, aliases]) => aliases.map(fold)
    .filter((alias) => !NUMBER_WORDS.has(alias)).map((alias) => ({ who, alias }))).sort((a, b) => b.alias.length - a.alias.length),
  targets: CMD.targetWords.map(fold),
};

function hasPhrase(body, phrase) {
  return new RegExp(`(?:^| )${escapeRE(phrase)}(?:[a-z]*)(?= |$)`).test(body);
}

// Tek harf hatası yalnız uzun komut köklerinde denenir; kısa rastgele kelimeler
// (ör. "ara"/"araba") bir askere istemeden emir vermez.
function oneEdit(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0; let j = 0; let errors = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++errors > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return errors + Number(i < a.length || j < b.length) <= 1;
}

function rootMatches(word, root) {
  if (word.startsWith(root)) return 1;
  if (root.length < 5 || word.length < 5) return 0;
  return [root.length - 1, root.length, root.length + 1].some((n) => oneEdit(word.slice(0, n), root)) ? 0.75 : 0;
}

function addresses(body) {
  let rest = body; let all = false;
  const who = new Set();
  for (const { who: w, alias } of NORM.addr) {
    const re = new RegExp(`(?:^| )${escapeRE(alias)}${w === 'all' ? '[a-z]*' : ''}(?= |$)`);
    if (!re.test(rest)) continue;
    rest = rest.replace(re, ' ').replace(/\s+/g, ' ').trim();
    if (w === 'all') all = true;
    else who.add(w);
  }
  return { body: rest, addressees: all || !who.size ? 'all' : [...who], explicitAddressees: all || !!who.size };
}

const unknown = (text, base, reason = 'unknown', message = CMD.unknown.say) => ({
  ...base, commandId: 'UNKNOWN', target: null, dir: null, score: 0, sourceText: text, reason, message, suggest: CMD.unknown.suggest,
});

function parseSingle(text) {
  const norm = fold(text);
  const { body, ...base } = addresses(norm);
  const common = { ...base, target: null, dir: null, score: 2, sourceText: text };
  const request = body.replace(/^lutfen /, '').replace(/ (?:lutfen|misin|misiniz|verir misin|verir misiniz)$/, '');
  const action = body.replace(/^(?:(?:simdi|peki|tamam|o halde|lutfen) )+/, '');
  if (/^(?:yardim|komutlar|ne yapabilirsin|neler yapabiliyorsunuz|telsiz yardim)(?: et| goster)?$/.test(request)) return { ...common, commandId: 'HELP' };
  if (/^(?:durum|rapor|durum raporu|durumunuz|saglik durumu|ne durumdasiniz|nasilsiniz)(?: ver| verin| nasil| nedir)?$/.test(request)) return { ...common, commandId: 'STATUS' };
  if (/(?:^| )(?:emirleri iptal|komutlari iptal|plani iptal|iptal et|vazgectim|emri unut)(?:[a-z]*)(?= |$)/.test(body)) return { ...common, commandId: 'CANCEL_PLAN' };
  if (/^(?:aynisini yap|ayni emri uygula|emri tekrarla|tekrar yap|tekrarla|sen de aynisini yap)(?:in)?$/.test(action)) return { ...common, commandId: 'REPEAT' };
  if (/^(?:devam et|devam edin|kaldigin yerden devam et|eski emre don)$/.test(action)) return { ...common, commandId: 'CONTINUE' };
  // Nesne adı tek başına engellenmez: "tankın yanına git" hareket emridir.
  const unsupported = CMD.unsupported.find((item) => item.patterns.some((pattern) => new RegExp(pattern).test(body)));
  if (unsupported) return unknown(text, base, 'unsupported', unsupported.say);

  // Olumsuz emirler olumlu kökü içerir; puanlamadan önce çözülmelidir.
  if (/(?:^| )silah[a-z]* (?:indir|birak)[a-z]*(?= |$)/.test(body)) return { ...common, commandId: 'HOLD_FIRE' };
  for (const id of ['HOLD', 'FOLLOW', 'TAKE_COVER', 'HOLD_FIRE']) {
    if (NORM.commands[id].phrases.some((phrase) => /(?:ma|me)$/.test(phrase) && hasPhrase(body, phrase))) return { ...common, commandId: id };
  }
  if (/(?:^| )(?:ates etm|ates acm|ateslem|vurm|saldirm|oldurm|hucum etm|tetige basm)/.test(body)) return { ...common, commandId: 'HOLD_FIRE' };
  if (/(?:^| )(?:gitme|ilerleme|hareket etme|gelme|takip etme|izleme|yurume|kosma|gecme|girme|yaklasma)/.test(body)) return { ...common, commandId: 'HOLD' };
  if (/(?:bomba[a-z]*|patlayici[a-z]*) (?:atma|atmay|firlatma|kullanma|yollama|gonderme)|(?:atma|atmay|firlatma)[a-z]* (?:el )?bomba/.test(body)) return unknown(text, base, 'negated-order', 'Bu olumsuz emri bomba atışına çevirmiyorum. Hazırlanan atışı durdurmak için “emirleri iptal et” deyin.');
  if (/(?:^| )(?:siper alma|saklanma|gizlenme|comelme|egilme|iyilestirme|tedavi etme|temizleme|tarama|bastirma|bekleme|durma|serbest birakma)/.test(body)) return unknown(text, base, 'negated-order', 'Bu olumsuz emri tersine çevirmiyorum. Yapmamı istediğiniz eylemi söyleyin; hareketi durdurmak için “bekle”, ateşi durdurmak için “ateş etme” diyebilirsiniz.');

  let best = null; let bestScore = 0;
  for (const id of CMD.priority) {
    const c = NORM.commands[id];
    let used = body; let score = 0;
    for (const phrase of c.phrases) {
      if (!hasPhrase(used, phrase)) continue;
      score += 2.5;
      used = used.replace(new RegExp(`(?:^| )${escapeRE(phrase)}[a-z]*(?= |$)`), ' ');
    }
    const words = used.split(' ').filter(Boolean);
    for (const root of c.roots) score += Math.max(0, ...words.map((word) => rootMatches(word, root)));
    score *= c.weight;
    if (score > bestScore) { best = id; bestScore = score; }
  }
  // Kısa yön cevabı da bir hareket emridir: “Demir, sola 10 metre”. İçinde
  // düşman/ateş gibi başka niyet taşıyan serbest bir cümleyi buraya çekmeyiz.
  if (!best && /^(?:(?:simdi|biraz|daha) )*(?:(?:sola|saga|ileri|geriye|geri|one|arkaya)(?: dogru)?(?: .+ (?:metre|m))?|saat .+ yonune(?: .+ (?:metre|m))?)$/.test(body)) { best = 'MOVE_TO'; bestScore = 1; }
  if (!best || bestScore < CMD.minScore) return unknown(text, base);

  const result = { ...common, commandId: best, score: bestScore };
  if (NORM.targets.some((word) => hasPhrase(body, word))) result.target = 'aim';
  const clock = body.match(/(?:^| )saat (\d+|on iki|on bir|oniki|onbir|bir|iki|uc|dort|bes|alti|yedi|sekiz|dokuz|on)(?= |$)/);
  if (clock) {
    const value = /^\d+$/.test(clock[1]) ? Number(clock[1]) : COUNTS[clock[1].replace(/ /g, '')];
    if (value < 1 || value > 12) return unknown(text, base, 'invalid-direction', 'Saat yönünü 1 ile 12 arasında söyleyin.');
    result.dir = { clock: value % 12 };
  } else if (/(?:sol on|on sol)/.test(body)) result.dir = { clock: 10.5 };
  else if (/(?:sag on|on sag)/.test(body)) result.dir = { clock: 1.5 };
  else if (/(?:sol arka|arka sol)/.test(body)) result.dir = { clock: 7.5 };
  else if (/(?:sag arka|arka sag)/.test(body)) result.dir = { clock: 4.5 };
  else if (/(?:^| )sol[a-z]*(?= |$)/.test(body)) result.dir = { clock: 9 };
  else if (/(?:^| )sag[a-z]*(?= |$)/.test(body)) result.dir = { clock: 3 };
  else if (/(?:^| )(?:geri|geriye|arkaniza|arkaya)(?= |$)/.test(body)) result.dir = { clock: 6 };
  else if (/(?:^| )(?:ileri|one|onumuze)(?= |$)/.test(body)) result.dir = { clock: 0 };
  const distance = body.match(new RegExp(`(?:^| )(${NUMBER_PATTERN})\\s*(?:metre[a-z]*|m)(?= |$)`));
  if (distance) {
    result.distance = /^\d+$/.test(distance[1]) ? Number(distance[1]) : distance[1].trim().split(/ +/).reduce((sum, word) => sum + (COUNTS[word] || 0), 0);
    if (!Number.isFinite(result.distance) || result.distance < 1 || result.distance > 120 || /-\s*\d+\s*(?:metre|m)\b/i.test(text)) return unknown(text, base, 'invalid-distance', 'Hareket mesafesini 1–120 metre arasında söyleyin.');
    if (!result.dir) result.dir = { clock: 0 };
  }
  if (/(?:ayni yer|ayni nokta|onceki yer|onceki nokta)/.test(body)) result.reference = { kind: 'previous' };
  else if (/(?:gorev hedef|isaretli hedef|hedef nokta|gorev nokta)/.test(body)) result.reference = { kind: 'objective' };
  else if (/(?:tahliye nokta|inis bolge|tahliyeye)/.test(body)) result.reference = { kind: 'extraction' };
  else if (/(?:istihbarat|dizustu|laptop)/.test(body)) result.reference = { kind: 'intel' };
  else if (/helikopter[a-z]*(?= |$)/.test(body) && ['MOVE_TO', 'SUPPRESS', 'CLEAR_AREA'].includes(best)) result.reference = { kind: 'helicopter' };
  else if (/tank[a-z]*(?= |$)/.test(body) && ['MOVE_TO', 'SUPPRESS', 'CLEAR_AREA', 'THROW_GRENADE'].includes(best)) result.reference = { kind: 'tank' };
  else if (/en yakin[a-z]* dusman/.test(body)) result.reference = { kind: 'nearest-enemy' };
  else if (/(?:^| )(?:buraya|burada|bulundugum|oldugum yer)(?:[a-z]*)(?= |$)/.test(body)) result.reference = { kind: 'player' };
  else if (/(?:^| )(?:bina|ev|agac|kaya|kapi|depo|duvar|konteyner)[a-z]*(?= |$)/.test(body)) result.target = 'aim';
  return result;
}

function splitAnd(text) {
  for (const match of text.matchAll(/\s+(?:ve|ama|fakat|ayrıca|ayrica)\s+/gi)) {
    const left = text.slice(0, match.index); const right = text.slice(match.index + match[0].length);
    if (parseSingle(left).commandId !== 'UNKNOWN' && parseSingle(right).commandId !== 'UNKNOWN') return [...splitAnd(left), ...splitAnd(right)];
  }
  return [text];
}

export function parseCommand(text, context = {}) {
  const raw = String(text || '').trim();
  const parts = raw.split(/(?:\s*[,;.!?\n]+\s*|\s+(?:ve\s+)?(?:daha\s+sonra|sonra|ardından|ardindan|sonrasında|sonrasinda)\s+)/i).filter(Boolean);
  // "Demir, Kaya ve Yıldız, oraya gidin" gibi hitap virgülleri emir bölmez.
  const clauses = [];
  let prefix = '';
  for (const part of parts) {
    const candidate = `${prefix} ${part}`.trim();
    const parsed = parseSingle(candidate);
    if (parsed.commandId === 'UNKNOWN' && parsed.reason === 'unknown' && addresses(fold(candidate)).body.replace(/\b(?:ve|lutfen)\b/g, '').trim() === '') { prefix = candidate; continue; }
    clauses.push(...splitAnd(candidate)); prefix = '';
  }
  if (prefix) clauses.push(prefix);
  if (!clauses.length) return parseSingle(raw);
  const followup = /^(?:simdi|peki|tamam|o halde|bu kez|biraz daha|ayni|tekrar|yeniden|devam et|kaldigin)/.test(fold(raw));
  let inherited = (followup ? context.addressees : context.defaultAddressees) || 'all';
  let lastOrder = context.lastOrder, resumeOrder = context.resumeOrder;
  const steps = clauses.map((clause) => {
    let result = parseSingle(clause);
    if (result.commandId === 'REPEAT' || result.commandId === 'CONTINUE') {
      const previous = result.commandId === 'CONTINUE' ? resumeOrder : lastOrder;
      if (!previous) return unknown(clause, result, 'missing-context', 'Tekrarlanacak bir emir yok. Önce ne yapmamı istediğinizi söyleyin.');
      result = { ...previous, ...result, commandId: previous.commandId, reference: NEEDS_PREVIOUS_POINT.has(previous.commandId) ? { kind: 'previous' } : previous.reference };
      if (!result.explicitAddressees) inherited = lastOrder?.addressees || context.addressees || inherited;
    }
    if (!result.explicitAddressees) result.addressees = inherited;
    else inherited = result.addressees;
    if (CMD.commands[result.commandId]) {
      lastOrder = result;
      if (!['HOLD', 'HOLD_FIRE', 'FREE_FIRE'].includes(result.commandId)) resumeOrder = result;
    }
    return result;
  });
  // Belirsiz bir alt emri atlayarak planın kalanını çalıştırma.
  const invalid = steps.find((step) => step.commandId === 'UNKNOWN');
  if (invalid) return { ...invalid, sourceText: raw };
  if (steps.length > 8) return unknown(raw, { addressees: 'all' }, 'too-many-steps', 'Bir telsiz mesajında en fazla 8 sıralı emir verebilirsiniz.');
  return { ...steps[0], sourceText: raw, ...(steps.length > 1 ? { steps } : {}) };
}

const NEEDS_PREVIOUS_POINT = new Set(['MOVE_TO', 'ATTACK', 'SUPPRESS', 'CLEAR_AREA', 'THROW_GRENADE']);
