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
  C_LOADOUT: 0x06, // maç öncesi teçhizat seçimi (ana + yan silah) ve "hazırım"
  C_VOTE: 0x07, // maç sonu harita oyu (modes.json → matchmaking.maps dizini)
  C_BUY: 0x08, // Rekabetçi: satın alma (shared/sim/competitive.js → BUY_ITEMS dizini + silahın eklentileri)
  C_CHAT: 0x09, // maç içi sohbet: takım/herkes bayrağı + metin ya da telsiz kalıbının dizini (shared/net/chat.js)
  C_MARK: 0x0a, // takım işareti: dünya noktası ve türü (sunucu görüş hattıyla doğrular)
  // Sunucu → istemci
  S_WELCOME: 0x81,
  S_SNAPSHOT: 0x82,
  S_ROSTER: 0x83, // oyuncu listesi, taraflar ve skor tablosu (değişince)
  S_PONG: 0x84,
  S_ERROR: 0x85,
  S_MATCH_END: 0x86,
  S_VOTE: 0x87, // maç sonu oylamasının durumu: kalan süre, harita başına oy, kazanan (oylama bitince)
  S_NEXT: 0x88, // sıradaki maçın odası ve haritası (aynı oyuncular, aynı taraflar)
  S_CHAT: 0x89, // sohbet satırı: gönderenin yuvası, bayraklar (takım, telsiz, ölü), metin ya da kalıp dizini
  S_MARK: 0x8a, // takım işareti: koyanın yuvası, türü, noktası
};

// S_VOTE: oylama sürerken kazanan yok
export const VOTE_NONE = 255;

// Sohbet bayrakları (C_CHAT/S_CHAT): takım kanalı, telsiz kalıbı (metin yerine dizin), gönderen öldüğünde yazdı
// (yalnız sunucu koyar). İşaret türü (C_MARK/S_MARK): "buraya bak" / "düşman burada" (çift basış)
export const CHAT_FLAG = { TEAM: 1, RADIO: 2, DEAD: 4 };
export const MARK_KIND = { HERE: 0, ENEMY: 1 };

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
  LOADOUT: 9, // seçene: sunucunun kabul ettiği teçhizat (şimdi kuşanıldı mı, sonraki doğuşta mı)
  NADE: 10, // herkese: el bombası/sis atıldı (yörünge istemcide aynı adımla yürür)
  BLAST: 11, // herkese: bomba patladı / sis açıldı (konum sunucudan)
  ROUND_STATE: 12, // Rekabetçi: raunt durumu (sayı, satın alma/raunt/sonu, saldıran taraf, kazanan, neden)
  BOMB: 13, // Rekabetçi: bombanın durumu (taşınıyor, yerde, kuruldu, imha, patladı), kim, bölge, konum
  STREAK: 14, // seri ödülü: hazır (yalnız sahibine) ya da kullanıldı (herkese: tür, hedef, bakış yönü)
  COOP: 15, // Kampanya Co-op'u: aşama, durumu (sürüyor/bitti/görev tamam/başarısız), kalan, bitmiş hedefler
};

// BLAST olayının türü: el bombası / sis (shared/sim/grenade.js → NADE_KIND) ve seri ödülü patlaması
export const BLAST_STRIKE = 2;

// İsabet türü (SHOT olayı)
export const HIT_KIND = { NONE: 0, WORLD: 1, FLESH: 2 };

// Yüzey adları (SHOT olayında indeksle taşınır; bilinmeyen 'concrete')
export const SURFACES = ['concrete', 'metal', 'wood', 'sand', 'sandbag', 'dirt', 'snow', 'glass', 'flesh'];

// Maç evresi
// BUY: Rekabetçi raunt başı (satın alma, hareket yok); ROUND_END: raunt sonu
export const PHASE = { WARMUP: 0, LIVE: 1, ENDED: 2, ROUND_END: 3, BUY: 4 };

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
// READY: maç öncesi teçhizat panelinde "hazırım" dedi (herkes hazırsa geri sayım kısalır)
export const RF = { BOT: 1, CONNECTED: 2, LEADER: 4, READY: 8 };

// Yerel oyuncu durum bayrakları (uzlaştırma kaydı)
export const LF = { GROUNDED: 1, CROUCHED: 2, SPRINTING: 4 };

// Öldürme olayında silah yerine özel değerler
export const WEAPON_MELEE = 254;
export const WEAPON_FRAG = 253; // öldürme akışında el bombası
export const WEAPON_AIRSTRIKE = 252; // seri ödülü: hava saldırısı
export const WEAPON_ARTILLERY = 251; // seri ödülü: topçu
// SHOT olayında silah dizininin üst biti: susturuculu atış (dizin < 128)
export const WEAPON_SUPPRESSED = 0x80;
export const WEAPON_NONE = 255;
export const SLOT_NONE = 255;

// İstemci iletilerinin sınırları (Ek B): sunucu bunları aşan iletiyi bozuk sayar
export const LIMITS = {
  maxClientBytes: 512,
  maxCmdsPerInput: 3,
  maxShotsPerCmd: 4,
  maxStr: 64,
  maxMods: 8, // silah başına eklenti (kategori sayısı)
  maxChatBytes: 255, // sohbet metninin UTF-8 bayt sınırı (sunucu ayrıca ONLINE.chat.maxLen harfe kırpar)
};
