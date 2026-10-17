// Oyun bağlantısının ileti kataloğu (çok oyunculu belge §6.1–6.3). Bayt düzenleri codec.js'te, belgesi
// Docs/PROTOCOL.md'de. İstemci → sunucu kodları 0x01'den, sunucu → istemci 0x81'den başlar: yanlış yöne giden
// ileti ilk baytından ayırt edilir. DOM ve THREE yok.

export const MSG = {
  // İstemci → sunucu
  C_HELLO: 0x01, // el sıkışma: sürüm, derleme özeti, kimlik, oda, teçhizat
  C_INPUT: 0x02, // son 3 komut (yedeklilik) + onaylanan anlık görüntü
  C_PING: 0x03, // saat eşitleme
  C_LOADED: 0x04, // harita yüklendi, doğurulabilir
  C_LEAVE: 0x05, // odadan kendi isteğiyle çıkış
  // Sunucu → istemci
  S_WELCOME: 0x81,
  S_SNAPSHOT: 0x82,
  S_ROSTER: 0x83, // oyuncu listesi, taraflar ve skor tablosu (değişince)
  S_PONG: 0x84,
  S_ERROR: 0x85,
  S_MATCH_END: 0x86,
};

// Bağlantıyı kapatan hata kodları (S_ERROR). Türkçe metinler istemcide (src/net/gameClient.js → NET_ERRORS)
export const ERR = {
  VERSION_MISMATCH: 1, // protokol sürümü farklı
  BUILD_MISMATCH: 2, // paylaşılan kod farklı (oyun güncellendi)
  AUTH_FAILED: 3, // belirteç geçersiz
  ROOM_NOT_FOUND: 4,
  ROOM_FULL: 5,
  NOT_MEMBER: 6, // oda bu oyuncuya açık değil
  BAD_MESSAGE: 7, // bozuk ya da sınır dışı ileti (üç kez → atılır)
  RATE_LIMIT: 8,
  REPLACED: 9, // aynı oyuncu başka sekmeden bağlandı
  ROOM_CLOSED: 10,
  TIMEOUT: 11,
};

// Anlık görüntüdeki olay türleri (S_SNAPSHOT içinde, tick'e bağlı)
export const NEV = {
  SHOT: 1, // biri ateş etti (iz, namlu ışığı, ses); atan oyuncuya gönderilmez
  HIT: 2, // atana: isabet işareti (hasar, bölge, öldürme)
  DAMAGE: 3, // vurulana: hasar ve yön
  KILL: 4, // herkese: öldürme akışı
  SPAWN: 5, // herkese: doğdu (aralama tamponu sıfırlanır)
  MELEE: 6, // yakın dövüş hareketi
  RELOAD: 7, // şarjör değiştirme sesi
  ROUND: 8, // raunt / evre bildirimi (metin anahtarı)
};

// İsabet türü (SHOT olayı)
export const HIT_KIND = { NONE: 0, WORLD: 1, FLESH: 2 };

// Yüzey adları (SHOT olayında indeksle taşınır; bilinmeyen 'concrete')
export const SURFACES = ['concrete', 'metal', 'wood', 'sand', 'sandbag', 'dirt', 'snow', 'glass', 'flesh'];

// Maç evresi
export const PHASE = { WARMUP: 0, LIVE: 1, ENDED: 2, ROUND_END: 3 };

// Taraflar (maç içi; arayüzde "Mavi / Kırmızı taraf"). DM'de herkes NONE
export const SIDE = { BLUE: 0, RED: 1, NONE: 255 };

// Uzak oyuncu bayrakları (S_SNAPSHOT)
export const PF = {
  ALIVE: 1,
  GROUNDED: 2,
  CROUCHED: 4,
  SPRINTING: 8,
  ADS: 16,
  RELOADING: 32,
  PROTECTED: 64, // doğuş koruması
  FIRING: 128,
};

// Roster bayrakları
export const RF = { BOT: 1, CONNECTED: 2, LEADER: 4 };

// Yerel oyuncu durum bayrakları (uzlaştırma kaydı)
export const LF = { GROUNDED: 1, CROUCHED: 2, SPRINTING: 4 };

// Öldürme olayında silah yerine özel değerler
export const WEAPON_MELEE = 254;
export const WEAPON_NONE = 255;
export const SLOT_NONE = 255;

// İstemci iletilerinin sınırları (Ek B): sunucu bunları aşan iletiyi bozuk sayar
export const LIMITS = {
  maxClientBytes: 512,
  maxCmdsPerInput: 3,
  maxShotsPerCmd: 4,
  maxStr: 64,
};
