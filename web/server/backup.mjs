// Veritabanı yedeği (sunucu çalışırken de güvenli): SQLite "VACUUM INTO" tutarlı bir kopya yazar.
// Kullanım: DB_PATH=/var/lib/demirsafak/demirsafak.db node server/backup.mjs /var/backups/demirsafak
// Hedef klasörde tarihli dosya oluşur; en yeni KEEP tanesi kalır.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from './config.js';

const KEEP = 14;
const dir = process.argv[2];
if (!dir) {
  console.error('Kullanım: node server/backup.mjs <yedek klasörü>');
  process.exit(1);
}
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const target = join(dir, `demirsafak-${stamp}.db`);
const db = new DatabaseSync(loadConfig().dbPath);
db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
db.close();
const old = readdirSync(dir)
  .filter((f) => /^demirsafak-.*\.db$/.test(f))
  .sort()
  .reverse()
  .slice(KEEP);
for (const f of old) rmSync(join(dir, f));
console.log(`Yedek: ${target}`);
