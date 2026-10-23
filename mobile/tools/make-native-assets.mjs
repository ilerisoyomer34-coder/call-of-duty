// Yerel projelerin simge ve açılış görselleri: web/src/pwa/icon.svg'den, Capacitor şablonundaki her PNG'nin kendi
// boyutunda yeniden çizilir (dosya adları ve klasörler şablondaki gibi kalır; yeni boyut gelirse kendiliğinden).
//  Android  mipmap-*/ic_launcher.png         → köşeleri yuvarlak simge (eski Android)
//           mipmap-*/ic_launcher_round.png   → yuvarlak simge
//           mipmap-*/ic_launcher_foreground  → uyarlanabilir simgenin ön yüzü (zemin rengi values/ic_launcher_background.xml);
//                                              çizim güvenli bölgeye (108 dp içinde 66 dp) sığar
//           drawable*/splash.png             → koyu zemin, ortada simge
//  iOS      AppIcon-512@2x.png (1024)        → tam kare, saydamlık kanalı YOK (App Store saydam simgeyi reddeder)
//           Splash.imageset/*.png            → koyu zemin, ortada simge (saydamlık yok)
// Çizim Chromium'daki tuvalde yapılır, PNG burada (zlib) yazılır: böylece RGB/RGBA kanal sayısı denetimde.
// Kullanım (mobile/ içinden, web/ içinde bir kez npm install yapılmış olmalı):  npm run assets
import { chromium } from '../../web/node_modules/playwright/index.mjs';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const mobile = join(here, '..');
const svg = readFileSync(join(mobile, '../web/src/pwa/icon.svg'), 'utf8');
const INK = '#0d1013'; // web/src/shell.html → --ink

// SVG çeşitleri (web/tools/make-icons.mjs ile aynı kurallar): tam kare zemin, çizim ölçeği, zeminsiz
function variant({ fullBleed = true, scale = 1, noBg = false }) {
  let s = svg;
  if (noBg) s = s.replace(/<rect id="bg"[^>]*\/>/, '');
  else if (fullBleed) s = s.replace(/(<rect id="bg"[^>]*?) rx="\d+"/, '$1');
  if (scale !== 1) s = s.replace('<g id="art">', `<g id="art" transform="translate(256 256) scale(${scale}) translate(-256 -256)">`);
  return s;
}

// PNG boyutu (IHDR)
function pngSize(file) {
  const b = readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

// RGBA piksellerden PNG; alpha false → RGB (renk türü 2)
const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const x of buf) c = CRC[(c ^ x) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(w, h, rgba, alpha) {
  const ch = alpha ? 4 : 3;
  const raw = Buffer.alloc((w * ch + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * ch + 1);
    raw[row] = 0; // süzgeç yok
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const o = row + 1 + x * ch;
      raw[o] = rgba[i];
      raw[o + 1] = rgba[i + 1];
      raw[o + 2] = rgba[i + 2];
      if (alpha) raw[o + 3] = rgba[i + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = alpha ? 6 : 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      if (f !== 'public' && f !== 'build' && f !== 'node_modules') walk(p, out);
    } else if (f.endsWith('.png')) out.push(p);
  }
  return out;
}

// Her dosya için çizim tarifi: { svg, kind: 'icon'|'round'|'splash', alpha, fit (çizim kenarı / kısa kenar) }
function recipe(file) {
  const name = basename(file);
  if (name === 'ic_launcher.png') return { svg: variant({ fullBleed: false }), kind: 'icon', alpha: true };
  if (name === 'ic_launcher_round.png') return { svg: variant({ scale: 0.92 }), kind: 'round', alpha: true };
  // Uyarlanabilir simge: sistem maskesi çapı 72/108; çizim (dürbün dairesi, 342/512) onun içinde kalsın
  if (name === 'ic_launcher_foreground.png') return { svg: variant({ noBg: true, scale: 0.78 }), kind: 'icon', alpha: true };
  if (name.startsWith('AppIcon')) return { svg: variant({ scale: 0.9 }), kind: 'icon', alpha: false };
  if (name.startsWith('splash')) return { svg: variant({ noBg: true }), kind: 'splash', alpha: false, fit: 0.42 };
  return null;
}

const files = [...walk(join(mobile, 'android/app/src/main/res')), ...walk(join(mobile, 'ios/App/App/Assets.xcassets'))];
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<!doctype html><html><body></body></html>');
let n = 0;
for (const file of files) {
  const r = recipe(file);
  if (!r) continue;
  const { w, h } = pngSize(file);
  const pixels = await page.evaluate(
    async ({ svgText, w, h, kind, fit, ink }) => {
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      if (kind === 'splash') {
        g.fillStyle = ink;
        g.fillRect(0, 0, w, h);
        const s = Math.round(Math.min(w, h) * fit);
        g.drawImage(img, (w - s) / 2, (h - s) / 2, s, s);
      } else {
        if (kind === 'round') {
          g.beginPath();
          g.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
          g.clip();
        }
        g.drawImage(img, 0, 0, w, h);
      }
      const d = g.getImageData(0, 0, w, h).data;
      // Düz dizi olarak (Playwright yazılabilir türleri aktarır)
      let s = '';
      for (let i = 0; i < d.length; i += 32768) s += String.fromCharCode.apply(null, d.subarray(i, i + 32768));
      return btoa(s);
    },
    { svgText: r.svg, w, h, kind: r.kind, fit: r.fit || 1, ink: INK }
  );
  writeFileSync(file, encodePng(w, h, Buffer.from(pixels, 'base64'), r.alpha));
  console.log(`${relative(mobile, file)}  ${w}×${h}${r.alpha ? '' : '  (saydamlıksız)'}`);
  n++;
}
await browser.close();
console.log(`${n} görsel yazıldı.`);
