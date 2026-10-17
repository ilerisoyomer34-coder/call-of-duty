// Oyuncu adı kuralları (çok oyunculu belge §9.1): istemcideki ad ekranı ve sunucu aynı denetimi yapar.
// Ad 3–16 karakter; Türkçe dahil Latin harfleri, rakam, boşluk, "_" ve "-". Başka alfabeler bilerek yok:
// görünüşü aynı harflerle başkasının adını taklit etmek zorlaşsın. Küfür filtresi katlanmış biçimde çalışır.
import PROFANITY from '../src/data/profanity.tr.json' with { type: 'json' };

export const NAME_MIN = 3;
export const NAME_MAX = 16;
// Etiket: aynı adı alan oyuncuları ayırır ("Ömer#4821")
export const TAG_DIGITS = 4;

const ALLOWED = /^[A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛû0-9 _-]+$/;
const HAS_LETTER = /[A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛû]/;
const ASCII = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' };

// Türkçe küçük harf (İ → i, I → ı); toLocaleLowerCase('tr') her motorda aynı değil, elle yapılır
export function turkishLower(s) {
  return s.replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase();
}

// Arama ve karşılaştırma biçimi: Türkçe küçük harf, ASCII'ye katlanmış ("Ömer" → "omer")
export function foldName(s) {
  return turkishLower(String(s || '')).replace(/[çğıöşüâîû]/g, (c) => ASCII[c]);
}

// Boşlukları düzelt: baş/son kırpılır, art arda boşluk teke iner
export function cleanName(s) {
  return String(s || '').trim().replace(/\s+/g, ' ');
}

// Küfür denetimi biçimi: katla, rakam hilelerini harfe çevir, tekrar eden harfleri teke indir
function profanityForm(s) {
  return foldName(s)
    .replace(/[013457@$]/g, (c) => LEET[c])
    .replace(/(.)\1+/g, '$1');
}

const PART = PROFANITY.part.map(profanityForm);
const WORD = new Set(PROFANITY.word.map(profanityForm));

export function isProfane(name) {
  const f = profanityForm(name);
  const joined = f.replace(/[ _-]/g, '');
  if (PART.some((p) => f.includes(p) || joined.includes(p))) return true;
  return f.split(/[ _-]+/).some((w) => WORD.has(w));
}

/**
 * Ad denetimi.
 * @returns {{ ok: boolean, name: string, error: null | 'short' | 'long' | 'chars' | 'letter' | 'banned' }}
 */
export function validateName(raw) {
  const name = cleanName(raw);
  const len = Array.from(name).length;
  let error = null;
  if (len < NAME_MIN) error = 'short';
  else if (len > NAME_MAX) error = 'long';
  else if (!ALLOWED.test(name)) error = 'chars';
  else if (!HAS_LETTER.test(name)) error = 'letter';
  else if (isProfane(name)) error = 'banned';
  return { ok: !error, name, error };
}

// Ekranda gösterilecek hata metni
export const NAME_ERRORS = {
  short: `En az ${NAME_MIN} karakter`,
  long: `En çok ${NAME_MAX} karakter`,
  chars: 'Yalnız harf, rakam, boşluk, _ ve -',
  letter: 'En az bir harf olmalı',
  banned: 'Bu ad kullanılamaz',
};

// "Ömer" + 4821 → "Ömer#4821"; etiket yoksa yalnız ad
export function displayName(name, tag) {
  return tag ? `${name}#${String(tag).padStart(TAG_DIGITS, '0')}` : name;
}
