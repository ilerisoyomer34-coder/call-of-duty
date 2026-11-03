// PWA simgeleri: src/pwa/icon.svg → src/pwa/icons/*.png (Playwright'ın Chromium'uyla çizilir).
// Bir kez koşturulup çıktı commit'lenir; böylece derleme (ve GitHub Pages) Chromium istemez.
//  icon-192/512      → yuvarlak köşeli, köşeler saydam ("any")
//  maskable-512      → tam kare zemin, çizim güvenli bölgeye (%80 daire) sığsın diye küçültülür
//  apple-touch-icon  → iOS köşeleri kendisi keser: tam kare zemin
//  favicon-32        → sekme simgesi
// Kullanım (web/ içinden):  node tools/make-icons.mjs
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'src/pwa/icon.svg'), 'utf8');
const outDir = join(root, 'src/pwa/icons');
mkdirSync(outDir, { recursive: true });

// Tam kare zemin ve (isteğe bağlı) merkeze göre küçültülmüş çizim
const variant = (fullBleed, scale) => {
  let s = src;
  if (fullBleed) s = s.replace(/(<rect id="bg"[^>]*?) rx="\d+"/, '$1');
  if (scale !== 1) s = s.replace('<g id="art">', `<g id="art" transform="translate(256 256) scale(${scale}) translate(-256 -256)">`);
  return s;
};

const ICONS = [
  { file: 'icon-192.png', size: 192, svg: variant(false, 1) },
  { file: 'icon-512.png', size: 512, svg: variant(false, 1) },
  { file: 'maskable-512.png', size: 512, svg: variant(true, 0.78) },
  { file: 'apple-touch-icon.png', size: 180, svg: variant(true, 0.9) },
  { file: 'favicon-32.png', size: 32, svg: variant(false, 1) },
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const I of ICONS) {
  await page.setViewportSize({ width: I.size, height: I.size });
  const svg = I.svg.replace('<svg ', `<svg width="${I.size}" height="${I.size}" `);
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`);
  const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: I.size, height: I.size } });
  writeFileSync(join(outDir, I.file), png);
  console.log(`src/pwa/icons/${I.file}  ${I.size}×${I.size}  ${(png.length / 1024).toFixed(1)} KB`);
}
await browser.close();
