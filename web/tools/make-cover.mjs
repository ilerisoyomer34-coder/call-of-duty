// Kapak görseli: SourceAssets/Cover/original/demir-safak-poster.png → assets/ui/cover.jpg (yükleme ekranı).
// PNG 2,6 MB; oyunda JPEG yeter (her sürümde paketlenir, bağımsız sürümde base64 gömülür). Boy aynı kalır.
// Kullanım (web/ içinden):  node tools/make-cover.mjs
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, '../SourceAssets/Cover/original/demir-safak-poster.png');
const out = join(root, 'assets/ui/cover.jpg');
const QUALITY = 0.84;

const browser = await chromium.launch();
const page = await browser.newPage();
const b64 = await page.evaluate(
  async ({ data, q }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const c = new OffscreenCanvas(img.naturalWidth, img.naturalHeight);
    c.getContext('2d').drawImage(img, 0, 0);
    const buf = new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg', quality: q })).arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  },
  { data: readFileSync(src).toString('base64'), q: QUALITY }
);
await browser.close();
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.from(b64, 'base64'));
console.log(`assets/ui/cover.jpg ${(Buffer.from(b64, 'base64').length / 1024).toFixed(0)} KB`);
