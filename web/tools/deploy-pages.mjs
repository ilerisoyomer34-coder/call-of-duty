// GitHub Pages yayını: commit'lenmiş dist/pwa/ klasörünü 'gh-pages' dalına tek commit'lik anlık görüntü
// olarak gönderir; site https://<kullanıcı>.github.io/<depo>/ adresinde doğrudan oyunu açar.
// Dal yalnız yayın içindir, elle düzenlenmez: her yayında zorla üzerine yazılır ki 1 MB'lık sayfanın eski
// sürümleri tarihçe biriktirmesin. Aynı işi .github/workflows/pages.yml her push'ta kendiliğinden yapar;
// bu betik ilk yayın (GitHub, gh-pages dalı ilk kez gelince Pages'i açar) ve elle yayın içindir.
// Kullanım (web/ içinden, önce npm run build ve commit):  npm run deploy:pages
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(root, '..');
const pwaDir = join(root, 'dist/pwa');
const BRANCH = 'gh-pages';
const REQUIRED = ['index.html', 'sw.js', 'manifest.webmanifest', '.nojekyll'];

const git = (args, cwd = repo) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();

for (const f of REQUIRED) if (!existsSync(join(pwaDir, f))) throw new Error(`dist/pwa/${f} yok: önce npm run build`);
// Yayın, depodaki commit'le aynı olsun (yayımlanan sürüm her zaman bir commit'e karşılık gelir)
if (git(['status', '--porcelain', '--', 'web/dist/pwa'])) throw new Error('web/dist/pwa commit edilmemiş değişiklik içeriyor: önce commit et');

const sha = git(['rev-parse', '--short', 'HEAD']);
const source = git(['rev-parse', '--abbrev-ref', 'HEAD']);
const remote = process.env.PAGES_REMOTE || git(['remote', 'get-url', 'origin']);
const tmp = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'ds-pages-'));
try {
  cpSync(pwaDir, tmp, { recursive: true });
  git(['init', '-q', '-b', BRANCH], tmp);
  git(['add', '-A'], tmp);
  git(['commit', '-q', '-m', `Yayın: ${sha} (${source})`], tmp);
  execFileSync('git', ['push', '--force', remote, `HEAD:${BRANCH}`], { cwd: tmp, stdio: 'inherit' });
  console.log(`${BRANCH} ← web/dist/pwa @ ${sha} (${source})`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
