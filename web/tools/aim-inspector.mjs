// Gerçek görünüm modelini her silahla aynı hedefte gösterir; tarayıcı otomasyonu başlatmaz.
// Kullanım: node tools/aim-inspector.mjs [port]. Kaynak değişince sayfayı yenile.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = {};
function walk(dir, prefix) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name), key = `${prefix}/${name}`;
    if (statSync(path).isDirectory()) walk(path, key);
    else files[key] = key;
  }
}
walk(join(root, 'assets'), 'assets');
async function bundle() {
  const r = await build({ entryPoints: [join(root, 'tools/aim-inspector-client.js')], bundle: true, format: 'esm', write: false,
    define: { __STORE__: 'false', __BUILD_HASH__: '"aim-inspector"' },
    plugins: [{ name: 'assets', setup(b) {
      b.onResolve({ filter: /^virtual:game-assets$/ }, () => ({ path: 'assets', namespace: 'qa' }));
      b.onLoad({ filter: /.*/, namespace: 'qa' }, () => ({ contents: `export default ${JSON.stringify({ mode: 'url', files })}` }));
    } }],
  });
  return r.outputFiles[0].text;
}
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (req.method === 'POST' && path === '/stop') { res.end('ok'); server.close(); return; }
    res.setHeader('Cache-Control', 'no-store');
    if (path === '/') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<!doctype html><meta charset="utf-8"><title>Silah nişan kontrolü</title><script type="module" src="/inspector.js"></script>');
    } else if (path === '/inspector.js') {
      res.setHeader('Content-Type', 'text/javascript'); res.end(await bundle());
    } else if (path.startsWith('/assets/') && !path.includes('..')) {
      res.setHeader('Content-Type', ({ '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg', '.png': 'image/png' })[extname(path)] || 'application/octet-stream');
      res.end(readFileSync(join(root, path)));
    } else { res.statusCode = 404; res.end('yok'); }
  } catch (e) { res.statusCode = 500; res.end(e.message); }
});
const port = Number(process.argv[2] || 8086);
server.listen(port, '127.0.0.1', () => console.log(`Nişan kontrolü: http://127.0.0.1:${port}/`));
setTimeout(() => server.close(), 60 * 60 * 1000).unref();
