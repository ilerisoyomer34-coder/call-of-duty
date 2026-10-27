// Gizli bilgi tarayıcısı (tools/secret-scan.mjs): gerçek biçimli anahtarları yakalar, örnek/yer tutucu değerlere ve
// derleme özetlerine alarm vermez, imza dosyalarını adından tanır. Sahte anahtarlar parça parça kurulur ki bu dosya
// da taramadan geçsin
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanText, forbiddenReason } from '../tools/secret-scan.mjs';

const fake = (prefix, n, ch = 'a') => prefix + ch.repeat(n);
const kinds = (t) => scanText(t).map((h) => h.kind);

test('gerçek biçimli anahtar ve belirteçler yakalanır', () => {
  assert.deepEqual(kinds(`const k = "${fake('sk-' + 'ant-api03-', 40, 'Q')}";`), ['Anthropic API anahtarı']);
  assert.deepEqual(kinds(fake('gh' + 'p_', 36, 'Z')), ['GitHub belirteci']);
  assert.deepEqual(kinds(fake('AK' + 'IA', 16, '7')), ['AWS erişim anahtarı']);
  assert.deepEqual(kinds('-----BEGIN ' + 'OPENSSH PRIVATE KEY-----'), ['Özel anahtar (PEM)']);
  assert.deepEqual(kinds(`ANTHROPIC_API_KEY=${fake('', 30, 'k')}`), ['Gizli ortam değişkeni']);
  assert.deepEqual(kinds(`SERVER_SECRET: "${fake('', 48, 'f')}"`), ['Gizli ortam değişkeni']);
  const hits = scanText('ilk satır\n\n' + fake('xo' + 'xb-', 20, '1'));
  assert.equal(hits[0].line, 3);
});

test('örnek, boş ve yer tutucu değerler ile karmalar alarm vermez', () => {
  for (const t of [
    'ANTHROPIC_API_KEY=',
    'ANTHROPIC_API_KEY=<senin-anahtarın>',
    'SERVER_SECRET=${SERVER_SECRET}',
    'ANTHROPIC_API_KEY=xxxxxxxxxxxxxxxxxxxxxx',
    "process.env.ANTHROPIC_API_KEY || ''",
    'const VERSION = "6ffe21905d61";',
    "'sha256-zFMPfUrG7zSGCASHPSDEj+bkmqa4CtkmD9vG3cuCaFo='",
    'sk-ant-kısa',
  ])
    assert.deepEqual(kinds(t), [], t);
});

test('imza anahtarı, ortam ve veritabanı dosyaları adından tanınır', () => {
  assert.ok(forbiddenReason('mobile/android/app/release/upload-key.jks'));
  assert.ok(forbiddenReason('mobile/android/key.properties'));
  assert.ok(forbiddenReason('web/server/host.env'));
  assert.ok(forbiddenReason('.env'));
  assert.ok(forbiddenReason('web/.env.production'));
  assert.ok(forbiddenReason('web/server/data/demirsafak.sqlite'));
  assert.ok(forbiddenReason('web/server/data/demirsafak.sqlite-wal'));
  assert.ok(forbiddenReason('certs/server.pem'));
  assert.equal(forbiddenReason('web/server/.env.example'), null);
  assert.equal(forbiddenReason('web/src/keys.js'), null);
  assert.equal(forbiddenReason('web/assets/weapons/ak47.glb'), null);
});
