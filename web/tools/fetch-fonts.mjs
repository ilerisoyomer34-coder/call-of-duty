// Mağaza uygulamasının (dist/app) yazı tipleri: Google Fonts'tan bir kez indirilir, src/fonts/ altına yazılır ve
// commit'lenir. Uygulama böylece çevrimdışı açılır ve açılışta Google'a istek gitmez (gizlilik politikası).
// Yalnız Latin ve Latin Genişletilmiş alt kümeleri (Türkçe ş, ğ, İ, ı bu ikisinde). Yazı tiplerinin hepsi
// SIL Open Font License 1.1 (src/fonts/README.md). Tarayıcı ve PWA sürümleri Google Fonts'u kullanmaya devam eder.
// Kullanım (web/ içinden):  node tools/fetch-fonts.mjs
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// shell.html'deki adresle aynı aileler ve kalınlıklar
export const FONTS_CSS_URL = 'https://fonts.googleapis.com/css2?family=Big+Shoulders+Stencil+Display:wght@700;900&family=Barlow+Condensed:wght@400;500;600;700&family=Share+Tech+Mono&display=swap';
const KEEP = new Set(['latin', 'latin-ext']);
// woff2 ve unicode-range'li CSS, güncel bir masaüstü tarayıcısına verilir
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const out = join(root, 'src/fonts');
const css = await (await fetch(FONTS_CSS_URL, { headers: { 'user-agent': UA } })).text();
// Her blok "/* altküme */ @font-face { ... }" biçiminde
const blocks = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g)];
if (!blocks.length) throw new Error('Google Fonts yanıtında @font-face bulunamadı');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
let local = '/* tools/fetch-fonts.mjs üretti (SIL OFL 1.1, README.md). Elle düzenlenmez. */\n';
let bytes = 0;
const seen = new Map();
for (const [, subset, face] of blocks) {
  if (!KEEP.has(subset)) continue;
  const family = face.match(/font-family:\s*'([^']+)'/)[1];
  const weight = face.match(/font-weight:\s*(\d+)/)[1];
  const url = face.match(/url\((https:[^)]+\.woff2)\)/)[1];
  // Aynı dosya birden çok kalınlıkta paylaşılabilir (değişken yazı tipi): bir kez indir
  let file = seen.get(url);
  if (!file) {
    file = `${family.toLowerCase().replace(/\s+/g, '-')}-${subset}-${seen.size}.woff2`;
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    writeFileSync(join(out, file), buf);
    bytes += buf.length;
    seen.set(url, file);
  }
  local += `/* ${subset} */\n${face.replace(url, file)}\n`;
  console.log(`${family} ${weight} ${subset} → ${file}`);
}
writeFileSync(join(out, 'fonts.css'), local);
// Lisans metinleri (OFL dağıtılan yazı tipi dosyalarının yanında lisansı ve telif satırını ister): google/fonts deposundan
const LICENSES = {
  'Barlow Condensed': 'barlowcondensed',
  'Big Shoulders Stencil Display': 'bigshouldersstencildisplay',
  'Share Tech Mono': 'sharetechmono',
};
let readme = '# Yazı tipleri (mağaza uygulaması)\n\n`tools/fetch-fonts.mjs` Google Fonts\'tan indirir; yalnız `dist/app/` kullanır (çevrimdışı, Google\'a istek yok).\nHepsi SIL Open Font License 1.1; lisans ve telif satırları yanındaki `OFL-*.txt` dosyalarında.\n\n';
for (const [family, dir] of Object.entries(LICENSES)) {
  const res = await fetch(`https://raw.githubusercontent.com/google/fonts/main/ofl/${dir}/OFL.txt`);
  if (!res.ok) throw new Error(`${family} lisans metni indirilemedi (${res.status})`);
  const text = await res.text();
  const file = `OFL-${dir}.txt`;
  writeFileSync(join(out, file), text);
  const copyright = text.split('\n').find((l) => /^Copyright/i.test(l.trim())) || '';
  readme += `- **${family}** — ${copyright.trim()} — \`${file}\`\n`;
}
writeFileSync(join(out, 'README.md'), readme);
console.log(`src/fonts/: ${seen.size} dosya, ${(bytes / 1024).toFixed(0)} KB`);
