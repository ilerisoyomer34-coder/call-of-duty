// Ev sunucusu başlatıcısı (server/hostLib.js): tünel adresi, davet bağlantısı, bilgisayara özel ayar dosyası,
// Node sürümü, güncelleme kararı, platforma göre cloudflared dosyası ve uyku engeli komutu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseTunnelUrl, inviteLink, ensureHostEnv, parseEnv, nodeVersionOk, shouldUpdate, cloudflaredAsset, keepAwakeCommand, GAME_URL } from '../server/hostLib.js';
import { parseServerInput } from '../src/net/servers.js';

test('tünel adresi cloudflared çıktısından yakalanır, api.trycloudflare.com sayılmaz', () => {
  const box = '2026-10-06T10:00:00Z INF |  https://brave-lion-river-ocean.trycloudflare.com                                   |';
  assert.equal(parseTunnelUrl(box), 'https://brave-lion-river-ocean.trycloudflare.com');
  assert.equal(parseTunnelUrl('ERR failed to request quick Tunnel: Post "https://api.trycloudflare.com/tunnel": dial tcp'), null);
  assert.equal(parseTunnelUrl('INF Requesting new quick Tunnel on trycloudflare.com...'), null);
  assert.equal(parseTunnelUrl('https://Mixed-Case.trycloudflare.com'), 'https://mixed-case.trycloudflare.com');
});

test('davet bağlantısı oyunun adresine ?sunucu= ekler; oyun onu geri okur', () => {
  const url = 'https://brave-lion.trycloudflare.com';
  const link = inviteLink(url);
  assert.equal(link, `${GAME_URL}?sunucu=${url}`);
  assert.deepEqual(parseServerInput(link), { ok: true, url });
});

test('ayar dosyası ilk açılışta gizli değerle oluşur, sonra değişmez', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ds-host-'));
  const p = join(dir, 'host.env');
  try {
    const a = ensureHostEnv(p, { random: () => 'ab'.repeat(32) });
    assert.equal(a.created, true);
    assert.equal(a.env.SERVER_SECRET, 'ab'.repeat(32));
    assert.equal(parseEnv(readFileSync(p, 'utf8')).SERVER_NAME, "Ömer'in sunucusu");
    if (process.platform !== 'win32') assert.equal(statSync(p).mode & 0o077, 0, 'yalnız sahibi okur');
    writeFileSync(p, readFileSync(p, 'utf8').replace("Ömer'in sunucusu", 'Kartal Üssü'));
    const b = ensureHostEnv(p, { random: () => 'cd'.repeat(32) });
    assert.equal(b.created, false);
    assert.equal(b.env.SERVER_SECRET, 'ab'.repeat(32), 'gizli değer korunur');
    assert.equal(b.env.SERVER_NAME, 'Kartal Üssü', 'elle verilen ad korunur');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.deepEqual(parseEnv('# yorum\nA=1\n\nB = iki = üç\nbozuk\n'), { A: '1', B: 'iki = üç' });
});

test('Node sürümü: node:sqlite için en az 22.5', () => {
  for (const v of ['22.5.0', 'v22.12.1', '23.0.0', '24.11.0']) assert.ok(nodeVersionOk(v), v);
  for (const v of ['22.4.9', '20.18.0', 'v18.0.0']) assert.ok(!nodeVersionOk(v), v);
});

test('güncelleme yalnız geride, maçsız ve elle değişiklik yokken', () => {
  assert.equal(shouldUpdate({ behind: 2, rooms: 0, dirty: false }), true);
  assert.equal(shouldUpdate({ behind: 0, rooms: 0, dirty: false }), false);
  assert.equal(shouldUpdate({ behind: 1, rooms: 1, dirty: false }), false);
  assert.equal(shouldUpdate({ behind: 1, rooms: 0, dirty: true }), false);
});

test('cloudflared dosyası platforma göre (Windows ARM amd64 kullanır, macOS tgz)', () => {
  assert.deepEqual(cloudflaredAsset('win32', 'x64'), { asset: 'cloudflared-windows-amd64.exe', file: 'cloudflared.exe', tgz: false });
  assert.equal(cloudflaredAsset('win32', 'arm64').asset, 'cloudflared-windows-amd64.exe');
  assert.equal(cloudflaredAsset('win32', 'ia32').asset, 'cloudflared-windows-386.exe');
  assert.deepEqual(cloudflaredAsset('darwin', 'arm64'), { asset: 'cloudflared-darwin-arm64.tgz', file: 'cloudflared', tgz: true });
  assert.equal(cloudflaredAsset('darwin', 'x64').asset, 'cloudflared-darwin-amd64.tgz');
  assert.equal(cloudflaredAsset('linux', 'x64').asset, 'cloudflared-linux-amd64');
  assert.equal(cloudflaredAsset('linux', 'arm64').asset, 'cloudflared-linux-arm64');
  assert.equal(cloudflaredAsset('aix', 'ppc64'), null);
});

test('uyku engeli: macOS caffeinate bu sürece bağlı, Windows betiği kodlanmış', () => {
  assert.deepEqual(keepAwakeCommand('darwin', 4242), { cmd: 'caffeinate', args: ['-is', '-w', '4242'] });
  const w = keepAwakeCommand('win32', 4242);
  assert.equal(w.cmd, 'powershell');
  const script = Buffer.from(w.args[w.args.indexOf('-EncodedCommand') + 1], 'base64').toString('utf16le');
  assert.match(script, /SetThreadExecutionState\(0x80000001\)/);
  assert.match(script, /Get-Process -Id 4242/);
  assert.equal(keepAwakeCommand('linux', 1), null);
});
