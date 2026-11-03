#!/usr/bin/env node
// Gizli bilgi taraması: depoya giren (git'in izlediği) dosyalarda API anahtarı, belirteç, özel anahtar ya da imza
// dosyası var mı. Depo herkese açık: bir kez gönderilen anahtar geçmişte kalır, silmek yetmez, iptal edilmesi
// gerekir. Bu yüzden her push'ta (quality-gates.yml) ve yayın öncesinde koşar. Bağımlılık yok.
//   node tools/secret-scan.mjs             izlenen dosyalar + işlenmeyi bekleyenler (git add edilmiş)
//   node tools/secret-scan.mjs --history   ayrıca bütün git geçmişi (elle; derlenmiş çıktılar hariç)
// Bulunan değer ekrana yazılmaz (günlüğe sızmasın): yalnız dosya, satır ve tür. Docs/SECURITY_TR.md
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// Değer kalıpları: sağlayıcıların belgelenmiş önekleri. Genel "uzun onaltılık" aranmaz: model karmaları ve
// derleme özetleri yanlış alarm verirdi
export const PATTERNS = [
  ['Anthropic API anahtarı', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['OpenAI API anahtarı', /\bsk-(?:proj-)?[A-Za-z0-9]{32,}/],
  ['GitHub belirteci', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{40,}/],
  ['AWS erişim anahtarı', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['Google API anahtarı', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Slack belirteci', /\bxox[abposr]-[A-Za-z0-9-]{10,}/],
  ['Stripe gizli anahtarı', /\b[rs]k_live_[A-Za-z0-9]{20,}/],
  ['npm belirteci', /\bnpm_[A-Za-z0-9]{36}\b/],
  ['Özel anahtar (PEM)', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED |PGP )?PRIVATE KEY(?: BLOCK)?-----/],
  // Ortam değişkenine elle yazılmış değer: örnek dosyalar (.env.example) ve boş/yer tutucu değerler hariç
  ['Gizli ortam değişkeni', /\b(?:ANTHROPIC_API_KEY|SKETCHFAB_API_TOKEN|SERVER_SECRET|GITHUB_TOKEN|NPM_TOKEN|ANDROID_KEYSTORE_PASSWORD|KEYSTORE_PASSWORD|KEY_PASSWORD)\s*[=:]\s*["']?(?![<{$]|\s|["']|x{3,}|\.\.\.|senin|buraya|your|change)[A-Za-z0-9_+/=-]{16,}/],
];

// Hiç izlenmemesi gereken dosyalar (içeriğine bakmadan): imza anahtarları, sertifikalar, sunucu ayarı ve veritabanı
export const FORBIDDEN_FILES = [
  [/\.(?:jks|keystore|p12|pfx|p8|mobileprovision)$/i, 'imza anahtarı / sertifika'],
  [/\.(?:pem|key)$/i, 'özel anahtar dosyası'],
  [/(?:^|\/)(?:key|keystore|signing)\.properties$/i, 'imza parolaları'],
  [/(?:^|\/)\.env(?:\.(?!example$)[^/]+)?$/i, 'ortam dosyası'],
  [/(?:^|\/)host\.env$/i, 'ev sunucusu gizli ayarı'],
  [/\.(?:sqlite|db)(?:-(?:wal|shm|journal))?$/i, 'veritabanı'],
  [/(?:^|\/)(?:\.netrc|\.npmrc|id_rsa|id_ed25519|id_ecdsa)$/i, 'kimlik dosyası'],
];

// Bilerek kalıp örneği taşıyan dosyalar (bu tarayıcı ve testi)
const SELF = new Set(['web/tools/secret-scan.mjs', 'web/tests/secret-scan.test.mjs']);
const MAX_BYTES = 4 * 1024 * 1024;

export function scanText(text) {
  const hits = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) for (const [kind, re] of PATTERNS) if (re.test(lines[i])) hits.push({ line: i + 1, kind });
  return hits;
}

export function forbiddenReason(path) {
  for (const [re, why] of FORBIDDEN_FILES) if (re.test(path)) return why;
  return null;
}

function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z', '--cached'], { cwd: root, maxBuffer: 64 * 1024 * 1024 });
  return out.toString('utf8').split('\0').filter(Boolean);
}

const isBinary = (buf) => buf.subarray(0, 8000).includes(0);

function scanTree() {
  const findings = [];
  let scanned = 0;
  let skipped = 0;
  for (const f of trackedFiles()) {
    const why = forbiddenReason(f);
    if (why) findings.push({ file: f, line: 0, kind: `izlenmemeli: ${why}` });
    if (SELF.has(f)) continue;
    let st;
    try {
      st = statSync(join(root, f));
    } catch {
      continue; // silinmiş ama henüz işlenmemiş
    }
    if (!st.isFile()) continue;
    if (st.size > MAX_BYTES) {
      skipped++;
      continue;
    }
    const buf = readFileSync(join(root, f));
    if (isBinary(buf)) {
      skipped++;
      continue;
    }
    scanned++;
    for (const h of scanText(buf.toString('utf8'))) findings.push({ file: f, ...h });
  }
  return { findings, scanned, skipped };
}

// Geçmiş: her commit'in eklediği satırlar (git log -p). Derlenmiş çıktılar (kaynaktan üretilir, kaynak taranır) ve
// ikili modeller atlanır
function scanHistory() {
  const findings = [];
  const args = ['log', '-p', '--all', '--no-color', '--no-ext-diff', '-U0', '--diff-filter=AM', '--', '.', ':(exclude)web/dist/**', ':(exclude)*.glb', ':(exclude)*.glb.txt', ':(exclude)*.jpg', ':(exclude)*.png'];
  const out = execFileSync('git', args, { cwd: root, maxBuffer: 2048 * 1024 * 1024 }).toString('utf8');
  let commit = '';
  let file = '';
  for (const line of out.split('\n')) {
    if (line.startsWith('commit ')) commit = line.slice(7, 19);
    else if (line.startsWith('+++ b/')) {
      file = line.slice(6);
      const why = forbiddenReason(file);
      if (why) findings.push({ file, line: 0, kind: `geçmişte: ${why}`, commit });
    } else if (line.startsWith('+') && !SELF.has(file)) {
      for (const [kind, re] of PATTERNS) if (re.test(line)) findings.push({ file, line: 0, kind, commit });
    }
  }
  return findings;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { findings, scanned, skipped } = scanTree();
  if (process.argv.includes('--history')) findings.push(...scanHistory());
  for (const f of findings) console.log(`[GİZLİ] ${f.file}${f.line ? `:${f.line}` : ''}${f.commit ? ` (commit ${f.commit})` : ''} — ${f.kind}`);
  console.log(`Gizli bilgi taraması: ${scanned} metin dosyası tarandı, ${skipped} ikili/büyük dosya atlandı, ${findings.length} bulgu.`);
  if (findings.length) {
    console.log('Bulunan anahtar geçerliyse önce sağlayıcıda İPTAL ET (geçmişte kalır), sonra dosyadan çıkar. Docs/SECURITY_TR.md');
    process.exitCode = 1;
  }
}
