// Sunucu ayarları ortam değişkenlerinden (çok oyunculu belge §15.5). Gizli değer yok: kimlik belirteçleri
// rastgele üretilir ve veritabanında yalnız özetleri tutulur. Örnek: server/.env.example
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// Varsayılan izinli kökenler: GitHub Pages yayını; localhost/127.0.0.1 her portta ayrıca izinli (geliştirme)
const DEFAULT_ORIGINS = 'https://ilerisoyomer34-coder.github.io';

// İstemci IP'si (hız sınırları ve IP başı bağlantı sayısı): vekile güvenilmiyorsa soket adresi
export function makeIpOf(config) {
  return (req) => {
    if (config.trustProxy) {
      if (config.clientIpHeader) {
        const v = req.headers[config.clientIpHeader];
        if (v) return String(v).trim();
      } else if (req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',')[0].trim();
    }
    return req.socket.remoteAddress || '?';
  };
}

export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT ?? 8790),
    host: env.HOST || '0.0.0.0',
    // ':memory:' testler için; yayında kalıcı dosya (yedeklenir, Docs/DEPLOY.md)
    dbPath: env.DB_PATH || join(here, 'data', 'demirsafak.db'),
    allowedOrigins: (env.ALLOWED_ORIGINS || DEFAULT_ORIGINS)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    // Yerel dosyadan açılan tek dosyalık sürüm "null" kökeniyle gelir. Kimlik çerez değil taşıyıcı belirteç
    // olduğu için (tarayıcı kendiliğinden göndermez) bu, siteler arası istek sahteciliğine kapı açmaz.
    allowNullOrigin: env.ALLOW_FILE_ORIGIN !== '0',
    // Caddy arkasında gerçek istemci adresi X-Forwarded-For'dan (hız sınırı için)
    trustProxy: env.TRUST_PROXY === '1',
    // Vekilin kendi yazdığı tek adres başlığı (Cloudflare tüneli: cf-connecting-ip). X-Forwarded-For'un ilk değeri
    // istemcinin gönderdiği sahte değer olabilir; vekilin yazdığı başlık IP başı sınırları güvenilir kılar
    clientIpHeader: (env.CLIENT_IP_HEADER || '').trim().toLowerCase(),
    // Oyunda görünen sunucu adı (Çevrim içi → Sunucu kutusu)
    serverName: (env.SERVER_NAME || '').trim().slice(0, 40),
    quiet: env.QUIET === '1',
    // Oyun odaları: mermi saçılması tohumunun gizli parçası (boşsa her açılışta rastgele; dışarı verilmez)
    serverSecret: env.SERVER_SECRET || '',
    // Derleme özeti denetimi (0: kapalı, yalnız geliştirmede)
    buildCheck: env.BUILD_CHECK !== '0',
    // Sunucu tarafı ağ benzetimi: lan | iyi | orta | kotu | uc (src/data/netsim.json)
    netsim: env.NETSIM || '',
    // Eşleştirme: tek başına bu kadar sn beklenince maç yapay zekâyla dolarak başlar (boşsa modes.json)
    searchSec: env.MATCH_SEARCH_SEC ? Number(env.MATCH_SEARCH_SEC) : null,
    // Testler: maç başı geri sayımı (sn) ve maç süresi kısaltılabilir
    warmupSec: env.MATCH_WARMUP ? Number(env.MATCH_WARMUP) : null,
    timeLimitSec: env.MATCH_TIME ? Number(env.MATCH_TIME) : null,
  };
}
