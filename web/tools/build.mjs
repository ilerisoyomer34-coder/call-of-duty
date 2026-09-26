// Derleme: src/ modüllerini tek dosyalık oyuna paketler.
//  dist/index.html    → bağımsız (three.js ve tüm modeller gömülü, çevrimdışı çift tıkla açılır)
//  dist/artifact.html → claude.ai Artifact sürümü: three.js CDN'den (jsDelivr, olmazsa unpkg),
//                       modeller ve dokular sayfanın yanında yayımlanan dosyalardan (assets/...) okunur.
//                       Artifact .glb sunmadığı için GLB'ler base64 metin (.glb.txt) olarak yayımlanır;
//                       bunlar dist/artifact-assets/ altına üretilir (depoya girmez, her derlemede yenilenir)
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const THREE_VERSION = JSON.parse(readFileSync(join(root, 'node_modules/three/package.json'), 'utf8')).version;
export const THREE_CDNS = [
  `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/build/three.module.min.js`,
  `https://unpkg.com/three@${THREE_VERSION}/build/three.module.min.js`,
];
// three'nin kendi window.__THREE__ değişkeniyle çakışmasın diye ayrı ad
const THREE_GLOBAL = '__DS_THREE';
const ASSET_EXT = /\.(glb|jpg|jpeg|png)$/i;
const AS_TEXT = /\.glb$/i; // Artifact'ın sunmadığı ikili türler
const publishedPath = (p) => (AS_TEXT.test(p) ? `${p}.txt` : p);

// assets/ altındaki tüm model ve dokular (yol: 'assets/weapons/mar556.glb' gibi)
export function listAssets() {
  const out = [];
  const walk = (dir) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (ASSET_EXT.test(f)) out.push(relative(root, p).split('\\').join('/'));
    }
  };
  if (existsSync(join(root, 'assets'))) walk(join(root, 'assets'));
  return out.sort();
}

// virtual:game-assets → { mode, files }. 'embed': base64 içerik (tek dosya, çevrimdışı);
// 'url': göreli adres (Artifact'ta sayfayla birlikte yayımlanan dosyalar)
function assetsPlugin(mode) {
  return {
    name: 'game-assets',
    setup(b) {
      b.onResolve({ filter: /^virtual:game-assets$/ }, () => ({ path: 'game-assets', namespace: 'assets' }));
      b.onLoad({ filter: /.*/, namespace: 'assets' }, () => {
        const files = {};
        for (const p of listAssets()) files[p] = mode === 'embed' ? readFileSync(join(root, p)).toString('base64') : publishedPath(p);
        return { contents: `export default ${JSON.stringify({ mode, files })};`, loader: 'js' };
      });
    },
  };
}

// 'three' içe aktarımlarını, yükleyicinin küresel değişkene koyduğu modüle bağlar
async function threeGlobalPlugin() {
  const names = Object.keys(await import(pathToFileURL(join(root, 'node_modules/three/build/three.module.js')).href));
  return {
    name: 'three-global',
    setup(b) {
      b.onResolve({ filter: /^three$/ }, () => ({ path: 'three', namespace: 'three-global' }));
      b.onLoad({ filter: /.*/, namespace: 'three-global' }, () => ({
        contents: `const T = globalThis.${THREE_GLOBAL};\nexport const { ${names.join(', ')} } = T;`,
        loader: 'js',
      }));
    },
  };
}

async function bundle(kind) {
  const artifact = kind === 'artifact';
  const plugins = [assetsPlugin(artifact ? 'url' : 'embed')];
  if (artifact) plugins.push(await threeGlobalPlugin());
  const r = await build({
    entryPoints: [join(root, 'src/main.js')],
    bundle: true,
    format: artifact ? 'iife' : 'esm',
    minify: true,
    target: 'es2020',
    write: false,
    legalComments: 'none',
    plugins,
  });
  return r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
}

// Artifact yükleyicisi: three.js'i önce jsDelivr'dan ister, yanıt gecikir ya da hata verirse unpkg'yi
// dener; hangisi önce gelirse oyun onunla başlar. İkisi de olmazsa yükleme ekranında nedenini yazar.
function artifactLoader(game) {
  return `const URLS=${JSON.stringify(THREE_CDNS)};
const B=window.__boot;
function loadThree(){return new Promise((resolve,reject)=>{const errs=[];let settled=false,started=0,failed=0;
const next=()=>{if(settled||started>=URLS.length)return;const u=URLS[started++];
import(u).then((m)=>{if(!settled){settled=true;resolve(m);}},(e)=>{errs.push(new URL(u).host+': '+((e&&e.message)||e));failed++;
if(failed===URLS.length){settled=true;reject(new Error(errs.join(' · ')));}else next();});
setTimeout(next,8000);};next();});}
try{B&&B.step('Grafik kütüphanesi indiriliyor',0.05);globalThis.${THREE_GLOBAL}=await loadThree();}
catch(e){if(B)B.fail('Grafik kütüphanesi indirilemedi',e,'three.js dosyası jsDelivr ve unpkg üzerinden alınamadı. İnternet bağlantını kontrol edip yeniden dene.');else console.error(e);}
if(globalThis.${THREE_GLOBAL}){${game}}`;
}

const shell = readFileSync(join(root, 'src/shell.html'), 'utf8');
const split = shell.indexOf('<div id="app">');
const headPart = shell.slice(0, split);
const bodyPart = shell.slice(split);

mkdirSync(join(root, 'dist'), { recursive: true });

const full = await bundle('standalone');
const standalone = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${headPart}</head>
<body>
${bodyPart.replace('<!--SCRIPT-->', () => `<script type="module">${full}</script>`)}
</body>
</html>
`;
writeFileSync(join(root, 'dist/index.html'), standalone);

const light = artifactLoader(await bundle('artifact'));
const artifactHtml = shell.replace('<!--SCRIPT-->', () => `<script type="module">${light}</script>`);
writeFileSync(join(root, 'dist/artifact.html'), artifactHtml);
// Artifact yayınında sayfanın yanına konacak dosyalar (yayımlanan yol → kaynak yol, depo köküne göre)
const publishFiles = {};
for (const p of listAssets()) {
  const pub = publishedPath(p);
  if (pub === p) publishFiles[pub] = `web/${p}`;
  else {
    const out = join(root, 'dist/artifact-assets', pub);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, readFileSync(join(root, p)).toString('base64'));
    publishFiles[pub] = `web/dist/artifact-assets/${pub}`;
  }
}
writeFileSync(join(root, 'dist/artifact-files.json'), JSON.stringify(publishFiles, null, 2) + '\n');

const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(0)} KB`;
const assetKb = Object.values(publishFiles).reduce((n, p) => n + statSync(join(root, '..', p)).size, 0) / 1024;
console.log(`dist/index.html     ${kb(standalone)}  (three@${THREE_VERSION} ve modeller gömülü)`);
console.log(`dist/artifact.html  ${kb(artifactHtml)} + ${assetKb.toFixed(0)} KB ayrı dosya (three CDN)`);
