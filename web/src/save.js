// Kalıcı kayıt (Operasyon Güncellemesi §9.3): kredi, envanter, teçhizat, seviye ilerlemesi, görevler,
// istatistikler ve ayarlar tek, sürüm numaralı bir anahtarda tutulur.
//  - Eski sürümün ayrı anahtarları (ayarlar, ilerleme, teçhizat) ilk açılışta içeri aktarılır ve yedek
//    olarak bırakılır (silinmez): yeni sürümde bir sorun çıkarsa oyuncunun ilerlemesi kaybolmaz.
//  - Yazma kısa bir gecikmeyle toplanır (her değişiklikte depolamaya gitmesin); satın alma gibi önemli
//    değişiklikler hemen yazılır. Sayfa kapanırken/arka plana geçerken bekleyen yazma boşaltılır.
//  - Depolama kapalıysa (gizli pencere) oyun bellekteki kayıtla çalışır.
import { storage as browserStorage } from './util.js';
import STORE from './data/store.json' with { type: 'json' };

export const SAVE_KEY = 'demirsafak.save';
export const SAVE_VERSION = 1;
export const LEGACY_KEYS = Object.freeze({
  settings: 'demirsafak.settings.v1',
  progress: 'demirsafak.progress.v1',
  loadout: 'demirsafak.loadout.v1',
  // Oyuncu adı { name }: duman testi adı bununla verir; kayıtta ad yoksa açılışta içe aktarılır
  profile: 'demirsafak.profile.v1',
});
const FLUSH_DELAY_MS = 250;

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export function freshSave(startCredits = STORE.startCredits) {
  return {
    version: SAVE_VERSION,
    credits: startCredits,
    inventory: { armor: [], helmets: [], consumables: {}, upgrades: [], weapons: [] },
    loadout: { primary: null, secondary: null, armor: null, helmet: null, slots: [null, null] },
    progress: { unlocked: 1, best: {} },
    missions: {},
    stats: { revivesGiven: 0, timesDowned: 0, commandsIssued: 0, kills: 0, missionsCompleted: 0 },
    settings: null,
    econLog: [],
    // Oyuncu kimliği: ad yerelde; etiket, kimlik ve belirteç sunucuya ilk bağlanınca gelir
    profile: freshProfile(),
  };
}

// id/tag/token etkin sunucunun (server: kalıcı sunucu kimliği) hesabıdır; öbür sunucularınki servers[serverId]'de
// (net/servers.js → selectIdentity). Ev sunucusunun tünel adresi değişse de hesap kimliğe bağlı kalır
export function freshProfile() {
  return { name: null, tag: null, id: null, token: null, server: null, servers: {} };
}

function normalizeProfile(p) {
  const d = freshProfile();
  if (!isObj(p)) return d;
  const str = (v) => (typeof v === 'string' && v ? v : null);
  const servers = {};
  if (isObj(p.servers)) {
    for (const [k, v] of Object.entries(p.servers)) if (isObj(v) && str(v.token)) servers[k] = { id: str(v.id), tag: str(v.tag), token: str(v.token) };
  }
  return { ...p, name: str(p.name), tag: str(p.tag), id: str(p.id), token: str(p.token), server: str(p.server), servers };
}

// Kaydı varsayılanlarla tamamla: eksik ya da bozuk alan varsayılana döner, bilinmeyen alanlar korunur
// (daha yeni bir sürümün yazdığı kayıt eski sürümde açılırsa veri kaybolmasın)
function normalize(raw, startCredits) {
  const d = freshSave(startCredits);
  const s = { ...d, ...raw };
  s.credits = isNum(raw.credits) ? Math.max(0, Math.round(raw.credits)) : d.credits;
  s.inventory = { ...d.inventory, ...(isObj(raw.inventory) ? raw.inventory : {}) };
  for (const k of ['armor', 'helmets', 'upgrades', 'weapons']) if (!Array.isArray(s.inventory[k])) s.inventory[k] = [];
  if (!isObj(s.inventory.consumables)) s.inventory.consumables = {};
  s.loadout = { ...d.loadout, ...(isObj(raw.loadout) ? raw.loadout : {}) };
  if (!Array.isArray(s.loadout.slots)) s.loadout.slots = [null, null];
  s.progress = isObj(raw.progress) ? { unlocked: isNum(raw.progress.unlocked) ? raw.progress.unlocked : 1, best: isObj(raw.progress.best) ? raw.progress.best : {} } : d.progress;
  s.missions = isObj(raw.missions) ? raw.missions : {};
  s.stats = { ...d.stats, ...(isObj(raw.stats) ? raw.stats : {}) };
  s.settings = isObj(raw.settings) ? raw.settings : null;
  s.econLog = Array.isArray(raw.econLog) ? raw.econLog : [];
  s.profile = normalizeProfile(raw.profile);
  return s;
}

// Saf yükseltme işlevi (birim testleri bunu dener).
//  raw: kayıtlı nesne ya da null · legacy(key): eski anahtarın değeri ya da null
//  → { save, migrated }  migrated: eski anahtarlardan veri alındı mı
export function migrateSave(raw, legacy, startCredits = STORE.startCredits) {
  if (isObj(raw) && isNum(raw.version)) {
    const save = normalize(raw, startCredits);
    // Sonraki sürümler burada adım adım yükseltilir: if (save.version < 2) { …; save.version = 2; }
    save.version = Math.max(save.version, SAVE_VERSION);
    return { save, migrated: false };
  }
  const save = freshSave(startCredits);
  let migrated = false;
  const p = legacy(LEGACY_KEYS.progress);
  if (isObj(p)) {
    save.progress = { unlocked: isNum(p.unlocked) ? p.unlocked : 1, best: isObj(p.best) ? p.best : {} };
    migrated = true;
  }
  const l = legacy(LEGACY_KEYS.loadout);
  if (isObj(l)) {
    save.loadout.primary = typeof l.primary === 'string' ? l.primary : null;
    save.loadout.secondary = typeof l.secondary === 'string' ? l.secondary : null;
    migrated = true;
  }
  const st = legacy(LEGACY_KEYS.settings);
  if (isObj(st)) {
    save.settings = st;
    migrated = true;
  }
  return { save, migrated };
}

export class SaveSystem {
  // store: { get(key, fallback), set(key, value) } — tarayıcıda util.storage, testlerde bellek
  constructor({ store = browserStorage, startCredits = STORE.startCredits, flushDelayMs = FLUSH_DELAY_MS } = {}) {
    this.store = store;
    this.startCredits = startCredits;
    this.flushDelayMs = flushDelayMs;
    this.timer = null;
    const raw = store.get(SAVE_KEY, null);
    const { save, migrated } = migrateSave(raw, (k) => store.get(k, null), startCredits);
    this.data = save;
    this.migrated = migrated;
    // Eski anahtardaki ad, kayıtta ad yokken alınır (kimlik alanları sunucudan gelir)
    const lp = store.get(LEGACY_KEYS.profile, null);
    if (!save.profile.name && isObj(lp) && typeof lp.name === 'string' && lp.name) save.profile.name = lp.name;
    // İlk açılış ya da yükseltme: yeni biçim hemen yazılsın
    if (!isObj(raw) || migrated) this.flush();
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      window.addEventListener('pagehide', () => this.flush());
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') this.flush();
      });
    }
  }

  // fn(data) kaydı yerinde değiştirir. now: hemen yaz (satın alma, görev sonu)
  update(fn, { now = false } = {}) {
    if (fn) fn(this.data);
    if (now) this.flush();
    else if (!this.timer) this.timer = setTimeout(() => this.flush(), this.flushDelayMs);
  }

  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.store.set(SAVE_KEY, this.data);
  }

  // Geliştirici konsolu: kaydı sıfırla (eski anahtarlar yine içe aktarılmaz). Oyuncu adı ve çevrim içi kimlik
  // korunur: kimlik silinirse arkadaş listesi de kaybolur
  reset() {
    const profile = this.data.profile;
    this.data = freshSave(this.startCredits);
    this.data.profile = normalizeProfile(profile);
    this.flush();
  }
}

// Oyunun paylaşılan kaydı (ayarlar, ilerleme, ekonomi aynı nesneyi kullanır)
let shared = null;
export function getSave() {
  if (!shared) shared = new SaveSystem();
  return shared;
}
