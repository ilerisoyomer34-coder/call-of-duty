// Sunucu ayarları ortam değişkenlerinden (çok oyunculu belge §15.5). Gizli değer yok: kimlik belirteçleri
// rastgele üretilir ve veritabanında yalnız özetleri tutulur. Örnek: server/.env.example
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// Varsayılan izinli kökenler: GitHub Pages yayını; localhost/127.0.0.1 her portta ayrıca izinli (geliştirme)
const DEFAULT_ORIGINS = 'https://ilerisoyomer34-coder.github.io';

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
    quiet: env.QUIET === '1',
  };
}
