// İstemci ve sunucunun ortak sabitleri (çok oyunculu belge §4.4, §5.2). DOM ve THREE yok.

// Simülasyon tick hızı: hareket her zaman bu adımla ilerler (kare hızından bağımsız)
export const TICK_RATE = 64;
export const TICK_DT = 1 / TICK_RATE;

// Tick sonu nicemleme: istemci ve sunucu aynı yuvarlamayı yapar, JS motorları arasındaki
// Math.sin/exp son bit farkları birikmez (belge §5.2/3)
export const QUANT = {
  pos: 1 / 1024, // m
  vel: 1 / 256, // m/s
  frac: 1 / 1024, // 0–1 arası oranlar (çömelme, nişan)
  // Bakış açıları komutta tamsayı taşınır: yaw u16 (tam tur), pitch i16 (±π/2)
  yawSteps: 65536,
  pitchSteps: 32767,
  // Analog hareket i8
  move: 127,
};

// Ağ protokolü sürümü (belge §6.1): ikili mesaj düzeni değişince artar; istemci ve sunucu uyuşmazsa bağlantı
// "Oyun güncellendi" hatasıyla kapanır. Derleme özeti (buildHash) ayrıca shared/ kodunun aynı olduğunu doğrular.
export const PROTOCOL_VERSION = 1;
// Sunucunun anlık görüntü hızı (Hz): her iki tick'te bir
export const SNAPSHOT_RATE = 32;
