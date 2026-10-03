// Haritaların çarpışma verisini dışa aktarır (çok oyunculu belge §5.3): shared/maps/<harita>.collision.json.
// Sunucu render olmadan bu dosyayı yükler (CollisionWorld.fromJSON); istemci haritayı kendi kurar ve aynı
// kutuları üretir (testler özetle karşılaştırır). Harita kodu Node'da görselsiz CollisionWorld ile çalışır.
// Kullanım: cd web && node tools/export-collision.mjs [--check]
//   --check: dosyalar güncel değilse çıkış 1 (harita değişti, aracı çalıştır)
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CollisionWorld } from '../shared/sim/collision.js';
import { buildMission } from '../src/level.js';
import { MAP_BUILDERS } from '../src/maps/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'shared/maps');
mkdirSync(outDir, { recursive: true });
const check = process.argv.includes('--check');

export function exportMap(id) {
  const W = new CollisionWorld();
  buildMission(W, id);
  return W.toJSON(id);
}

let stale = 0;
for (const id of Object.keys(MAP_BUILDERS)) {
  const data = exportMap(id);
  const file = join(outDir, `${id}.collision.json`);
  const old = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  const same = old && old.hash === data.hash;
  if (check) {
    if (!same) stale++;
    console.log(`${same ? '✓' : '✗'} ${id}: ${data.boxes.length} kutu, özet ${data.hash}${same ? '' : ` (dosyada ${old?.hash || 'yok'})`}`);
    continue;
  }
  // Satır başına bir kutu: fark okunur kalsın
  const head = JSON.stringify({ ...data, boxes: undefined, hash: undefined });
  const body = data.boxes.map((b) => `    ${JSON.stringify(b)}`).join(',\n');
  writeFileSync(file, `${head.slice(0, -1)},\n  "hash": "${data.hash}",\n  "boxes": [\n${body}\n  ]\n}\n`);
  console.log(`${id}: ${data.boxes.length} kutu → shared/maps/${id}.collision.json (${data.hash})`);
}
if (check && stale) {
  console.log(`${stale} harita dosyası eski: node tools/export-collision.mjs`);
  process.exit(1);
}
