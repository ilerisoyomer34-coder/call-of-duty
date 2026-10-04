// Derleme özeti (çok oyunculu belge §6.1): istemci ve sunucunun aynı paylaşılan kodu çalıştırdığını doğrular.
// Özet: shared/ altındaki her dosya + hareket/silah/maç ayarları (src/config.js, maç verisi). Derleme
// (tools/build.mjs) bunu __BUILD_HASH__ olarak istemciye gömer; sunucu açılışta aynısını hesaplar.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = fileURLToPath(new URL('../../', import.meta.url));
const EXTRA = ['src/config.js', 'src/data/arenas.json', 'src/data/modes.json', 'src/data/bots.json'];

function walk(dir, out) {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

export function computeBuildHash(root = WEB) {
  const files = [...walk(join(root, 'shared'), []), ...EXTRA.map((f) => join(root, f))];
  const h = createHash('sha256');
  for (const f of files) {
    // Satır sonları farkı (Windows çıkışı) özeti bozmasın
    h.update(relative(root, f).split(sep).join('/'));
    h.update('\0');
    h.update(readFileSync(f, 'utf8').replace(/\r\n/g, '\n'));
    h.update('\0');
  }
  return h.digest('hex').slice(0, 12);
}
