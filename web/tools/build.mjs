// Derleme: src/ modüllerini tek dosyalık oyuna paketler.
//  dist/index.html    → bağımsız (three.js gömülü, çevrimdışı çift tıkla açılır)
//  dist/artifact.html → claude.ai Artifact sürümü (three.js jsDelivr'dan, iskelet etiketsiz)
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const THREE_VERSION = JSON.parse(readFileSync(join(root, 'node_modules/three/package.json'), 'utf8')).version;
export const THREE_CDN = `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/build/three.module.min.js`;

async function bundle(externalThree) {
  const plugins = externalThree
    ? [
        {
          name: 'three-cdn',
          setup(b) {
            b.onResolve({ filter: /^three$/ }, () => ({ path: THREE_CDN, external: true }));
          },
        },
      ]
    : [];
  const r = await build({
    entryPoints: [join(root, 'src/main.js')],
    bundle: true,
    format: 'esm',
    minify: true,
    target: 'es2020',
    write: false,
    legalComments: 'none',
    plugins,
  });
  return r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
}

const shell = readFileSync(join(root, 'src/shell.html'), 'utf8');
const split = shell.indexOf('<div id="app">');
const headPart = shell.slice(0, split);
const bodyPart = shell.slice(split);

mkdirSync(join(root, 'dist'), { recursive: true });

const full = await bundle(false);
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

const light = await bundle(true);
writeFileSync(join(root, 'dist/artifact.html'), shell.replace('<!--SCRIPT-->', () => `<script type="module">${light}</script>`));

const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(0)} KB`;
console.log(`dist/index.html     ${kb(standalone)}  (three@${THREE_VERSION} gömülü)`);
console.log(`dist/artifact.html  ${kb(shell)} + ${kb(light)} kod (three CDN)`);
