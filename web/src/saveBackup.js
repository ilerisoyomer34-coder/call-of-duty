// Kaydın ikinci, yalnız çevrim dışı kopyası (v1.2 kalite paketi). Ana kayıt (save.js → SAVE_KEY) bozulur ya da
// okunamazsa ilerleme, kredi, envanter ve ayarlar bu kopyadan kurtarılır.
//  - Kimlik yok: oyuncu profili (ad, çevrim içi kimlik, belirteçler) ve sunucu adresi yazılmaz; kurtarılan kayıtta
//    hesap yeniden açılır. Bilinmeyen (gelecekteki) alanlar da yazılmaz: izin listesi, yasak listesi değil.
//  - Aynı cihazın aynı depolamasındadır: bulut kaydı ya da şifreleme değildir, uygulama silinince birlikte gider.
export const SAVE_BACKUP_KEY = 'demirsafak.save.offlineBackup.v1';

// save.js → freshSave alanları; profile bilerek yok (tests/save-backup-regressions.test.mjs eşliği denetler)
export const BACKUP_FIELDS = Object.freeze(['version', 'credits', 'inventory', 'loadout', 'migrated', 'progress', 'missions', 'stats', 'settings', 'econLog', 'progression']);

// settings.js → DEFAULT_SETTINGS; serverUrl (sunucu adresi/davet) ve onlineMode yazılmaz. Yeni ayar buraya da
// eklenmeli, yoksa kurtarılan kayıtta varsayılana döner (test hatırlatır)
export const BACKUP_SETTINGS = Object.freeze([
  'sensitivity', 'adsSensitivity', 'invertY', 'fov', 'adsMode', 'crouchMode', 'sprintMode', 'quality', 'renderScale',
  'muted', 'masterVolume', 'sfxVolume', 'ambientVolume', 'cameraShake', 'headBob', 'crosshairColor', 'blood',
  'damageNumbers', 'showFps', 'realNames', 'wheelSlowMo', 'chatSlowMo', 'radioVoice', 'radioVolume', 'commsCam',
  'physics', 'voiceCommands', 'buttonIcons', 'rerollBonuses', 'bindings',
]);

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const validSave = (v) => isObj(v) && Number.isSafeInteger(v.version) && v.version >= 1;

// Kayıttan yedeğe yalnız izinli alanlar; bozuk kayıt yedeklenmez (iyi yedeğin üstüne yazılmasın)
export function offlineBackup(data) {
  if (!validSave(data)) return null;
  const out = {};
  for (const k of BACKUP_FIELDS) if (Object.hasOwn(data, k)) out[k] = data[k];
  if (isObj(out.settings)) {
    const s = {};
    for (const k of BACKUP_SETTINGS) if (Object.hasOwn(out.settings, k)) s[k] = out.settings[k];
    out.settings = s;
  }
  return out;
}

// Açılışta hangi kayıt okunur: geçerli ana kayıt her zaman kazanır; yoksa geçerli yedek (recovered: true);
// ikisi de yoksa ana kayıt olduğu gibi (ilk açılış, eski anahtarlardan içe aktarma save.js'te)
export function selectResilientSave(primary, backup) {
  if (validSave(primary)) return { raw: primary, recovered: false };
  if (validSave(backup)) return { raw: backup, recovered: true };
  return { raw: primary, recovered: false };
}
