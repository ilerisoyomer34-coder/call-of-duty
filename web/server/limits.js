// Sunucu sınırları tek yerde (belge Ek B, §13.3). Değer değişikliği kod değil buradaki tablodur.
export const LIMITS = {
  bodyBytes: 4096, // REST gövdesi
  wsPayloadBytes: 2048, // WebSocket iletisi
  helloTimeoutMs: 5000, // bağlanınca kimlik bu sürede gelmezse kapat
  wsMsgPerSec: 20,
  session: { max: 5, windowMs: 60_000 }, // IP başına yeni kimlik
  rename: { max: 5, windowMs: 3_600_000 },
  search: { max: 10, windowMs: 10_000 },
  friendRequest: { max: 30, windowMs: 3_600_000 },
  invite: { max: 20, windowMs: 60_000 },
  general: { max: 120, windowMs: 60_000 }, // kimlik başına tüm REST
  friendMax: 200,
  requestExpireMs: 30 * 24 * 3_600_000, // bekleyen istek 30 günde düşer
  searchMin: 2,
  searchMax: 20,
  notificationKeep: 50,
  tagTries: 60, // boş etiket arama denemesi
  partyMax: 5,
  inviteMs: 60_000,
  partyGraceMs: 60_000, // bağlantısı kopan üye partide bu kadar bekler
  room: { max: 12, windowMs: 60_000 }, // deneme odası açma ve maç arama
  block: { max: 30, windowMs: 3_600_000 },
  report: { max: 10, windowMs: 3_600_000 },
  // Yapay zekâlı telsiz: her istek sunucu sahibinin API hesabından harcar
  aiRadio: { max: 12, windowMs: 60_000 }, // oyuncu başına dakikada
  aiDaily: { max: 300, windowMs: 86_400_000 }, // oyuncu başına günde
  aiGlobal: { max: 60, windowMs: 60_000 }, // bütün sunucuda dakikada
  aiBodyBytes: 16_384, // oyun durumu + sohbet belleği REST gövdesinden büyük
  aiTextMax: 400,
  aiContextChars: 9000,
};
