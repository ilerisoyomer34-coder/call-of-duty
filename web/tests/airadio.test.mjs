// Yapay zekâlı telsiz: ortak kurallar (shared/ai/radio.js), yönlendirme ve yerel cevaplar (src/radioIntel.js),
// saat yönü (src/radioContext.js) ve sunucu ucu POST /api/ai/radio (server/ai.js). Sunucu sahte Claude istemcisiyle
// açılır: gerçek API'ye istek gitmez, anahtar gerekmez.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import CMD from '../src/data/commands.tr.json' with { type: 'json' };
import AI from '../src/data/aiRadio.tr.json' with { type: 'json' };
import { aiInstructions, aiReplySchema, aiUserTurn, sanitizeReply, sanitizeHistory, parseReplyText, replyMemo, AI_COMMANDS, HQ } from '../shared/ai/radio.js';
import { isQuestion, routeRadio, answerLocally } from '../src/radioIntel.js';
import { relDir } from '../src/radioContext.js';
import { AiRadio } from '../src/aiRadio.js';
import { parseCommand } from '../src/commandParser.js';
import { startServer } from '../server/index.js';
import { aiEnv, ensureHostEnv, parseEnv } from '../server/hostLib.js';

test('talimat: her tim komutu yapay zekâya anlatılır, şema yalnız bilinen komutları kabul eder', () => {
  for (const id of Object.keys(CMD.commands)) {
    assert.ok(AI.commands[id], `aiRadio.tr.json → commands.${id} eksik`);
    assert.ok(AI_COMMANDS.includes(id));
  }
  const text = aiInstructions();
  for (const id of AI_COMMANDS) assert.ok(text.includes(`- ${id}:`), id);
  assert.match(text, /anlamadım/);
  const schema = aiReplySchema();
  assert.deepEqual(schema.required, ['speaker', 'reply', 'actions']);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.properties.actions.items.properties.command.enum, AI_COMMANDS);
  // Örnek cevaplar da doğrulayıcıdan geçmeli (yapay zekâya gösterilen biçim geçerli)
  for (const [, a] of AI.examples) assert.ok(sanitizeReply(JSON.parse(a)), a);
  const turn = aiUserTurn('kaç düşman kaldı', { enemies: { alive: 3 } });
  assert.ok(turn.includes('"alive":3') && turn.endsWith('kaç düşman kaldı'));
});

test('cevap doğrulama: bilinmeyen komut atılır, muhatap adları çağrı koduna, yön/mesafe kırpılır', () => {
  const r = sanitizeReply({
    speaker: 'alfa-1',
    reply: '  **Anlaşıldı**   komutanım!  ',
    actions: [
      { command: 'move_to', to: ['Demir'], reference: 'none', clock: 9, distance: 20 },
      { command: 'FLY_AWAY', to: ['all'], reference: 'none', clock: 0, distance: 0 },
      { command: 'ATTACK', to: ['hepsi'], reference: 'aim', clock: 3, distance: 50 },
      { command: 'MOVE_TO', to: ['Alfa-2', 'yıldız', 'Alfa-2'], reference: 'extraction', clock: 0, distance: 0 },
      { command: 'HOLD', to: [], reference: 'none', clock: 40, distance: 99999 },
    ],
  });
  assert.equal(r.speaker, 'Alfa-1');
  assert.equal(r.reply, 'Anlaşıldı komutanım!');
  assert.equal(r.actions.length, 4, 'bilinmeyen komut atıldı');
  assert.deepEqual(r.actions[0], { commandId: 'MOVE_TO', addressees: ['Alfa-1'], reference: null, dir: { clock: 9 }, distance: 20 });
  assert.deepEqual(r.actions[1], { commandId: 'ATTACK', addressees: 'all', reference: null, dir: null, distance: null }, 'nişangâhta yön yok sayılır');
  assert.deepEqual(r.actions[2].addressees, ['Alfa-2', 'Alfa-3']);
  assert.deepEqual(r.actions[2].reference, { kind: 'extraction' });
  assert.deepEqual(r.actions[3], { commandId: 'HOLD', addressees: 'all', reference: null, dir: null, distance: null }, 'geçersiz saat yön değil');
  assert.equal(sanitizeReply({ speaker: 'x', reply: '', actions: [] }), null);
  assert.equal(sanitizeReply(null), null);
  assert.equal(sanitizeReply({ reply: 'Tamam', actions: [] }).speaker, HQ, 'konuşan yoksa karargâh');
  assert.equal(sanitizeReply({ reply: '', actions: [{ command: 'FOLLOW', to: ['Kaya'] }] }).speaker, 'Alfa-2', 'emri alan konuşur');
  const long = sanitizeReply({ speaker: 'YUVA', reply: 'kelime '.repeat(200), actions: [] }, { maxReply: 60 });
  assert.ok(long.reply.length <= 60 && long.reply.endsWith('…'));
  const many = sanitizeReply({ reply: 'x', actions: Array.from({ length: 20 }, () => ({ command: 'HOLD', to: ['all'] })) });
  assert.equal(many.actions.length, 8);
  // Bellekteki biçim yeniden okununca aynı eylemler
  assert.deepEqual(sanitizeReply(JSON.parse(replyMemo(r))).actions, r.actions);
});

test('sohbet belleği ve metinden JSON', () => {
  const h = sanitizeHistory([
    { role: 'assistant', content: 'başta asistan olmaz' },
    { role: 'user', content: 'a' },
    { role: 'assistant', content: 'b' },
    { role: 'system', content: 'yok' },
    { role: 'user', content: 'c' },
  ]);
  assert.deepEqual(h, [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }]);
  const many = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: String(i) }));
  assert.equal(sanitizeHistory(many, { turns: 3 }).length, 6);
  assert.equal(sanitizeHistory('bozuk').length, 0);
  assert.deepEqual(parseReplyText('İşte cevap: {"speaker":"YUVA","reply":"x","actions":[]} tamam'), { speaker: 'YUVA', reply: 'x', actions: [] });
  assert.equal(parseReplyText('json yok'), null);
});

test('yönlendirme: kısa komut yerelde, soru ve uzun cümle yapay zekâya, yapay zekâ yoksa yerel', () => {
  for (const q of ['kaç düşman kaldı?', 'hedef nerede', 'kac dusman var', 'takip eder misiniz', 'ne yapmalıyım']) assert.ok(isQuestion(q), q);
  for (const c of ['siper alın', 'Demir sola 20 metre git', 'ateş et', 'beni iyileştir']) assert.equal(isQuestion(c), false, c);
  const route = (t, ai) => routeRadio(t, parseCommand(t), { aiAvailable: ai });
  assert.equal(route('siper alın', true), 'local');
  assert.equal(route('Demir sola 20 metre git, sonra bekle', true), 'local');
  assert.equal(route('kaç düşman kaldı?', true), 'ai');
  assert.equal(route('durum raporu', true), 'ai');
  assert.equal(route('şu tepedeki keskin nişancıyı Yıldız bastırsın Demir de sağdan dolaşıp arkasına geçsin', true), 'ai');
  assert.equal(route('hava desteği istiyorum', true), 'ai');
  assert.equal(route('siper alın', false), 'local');
  assert.equal(route('durum raporu', false), 'local');
  assert.equal(route('kaç düşman kaldı?', false), 'answer');
  assert.equal(route('hava desteği istiyorum', false), 'answer');
});

const CTX = {
  level: { no: 3, name: 'Liman', map: 'Liman', difficulty: 'Asker' },
  time: 125,
  objective: { text: 'Bölgeyi temizle', detail: 'Kalan düşman: 4', step: '1/2', clock: 2, m: 40 },
  extraction: { clock: 6, m: 120, helicopter: 'çağrılmadı' },
  player: { hp: 60, maxHp: 100, armor: 50, down: false, weapon: 'AK-74', mag: 12, reserve: 90, grenades: 2 },
  enemies: { alive: 7, robots: 1, visible: [{ type: 'Tüfekçi', clock: 11, m: 35 }] },
  controls: ['El bombası: G', 'Şarjör değiştir: R', 'Hızlı bıçak: V / Fare 4'],
};

test('yerel cevaplar: düşman, hedef, tahliye, can, mermi, tuşlar; bilinmeyen soru null', () => {
  assert.match(answerLocally('kaç düşman kaldı', CTX).reply, /7 düşman kaldı, 1 robot.*saat 11 yönünde 35 metrede/);
  assert.match(answerLocally('düşman nerede?', CTX).reply, /En yakın Tüfekçi saat 11/);
  assert.match(answerLocally('görev ne', CTX).reply, /Bölgeyi temizle \(Kalan düşman: 4\), saat 2 yönünde 40 metrede/);
  assert.match(answerLocally('tahliye nerede', CTX).reply, /saat 6 yönünde 120 metrede/);
  assert.match(answerLocally('canım kaç', CTX).reply, /%60, zırh %50/);
  assert.match(answerLocally('kaç mermim kaldı', CTX).reply, /şarjörde 12, yedekte 90/);
  assert.equal(answerLocally('el bombası nasıl atılır', CTX).reply, 'El bombası: G.');
  assert.equal(answerLocally('şarjör nasıl değiştirilir', CTX).reply, 'Şarjör değiştir: R.');
  assert.match(answerLocally('neredeyiz', CTX).reply, /Bölüm 3: Liman/);
  assert.match(answerLocally('ne kadar süre oldu', CTX).reply, /2 dakika 5 saniye/);
  assert.equal(answerLocally('hava nasıl yarın', CTX), null);
  assert.equal(answerLocally('kac dusman', { ...CTX, enemies: { alive: 0, visible: [] } }).reply, 'Bölgede 0 düşman kaldı.');
  assert.ok(answerLocally('tahliye', { ...CTX, extraction: null }).reply.includes('henüz'));
});

test('saat yönü: 12 ileri, 3 sağ, 6 arka, 9 sol (bakış yönü hesaba katılır)', () => {
  const o = { x: 0, z: 0 };
  // yaw 0: ileri -z, sağ +x (three.js kamera düzeni)
  assert.deepEqual(relDir(o, 0, { x: 0, z: -10 }), { clock: 12, m: 10 });
  assert.equal(relDir(o, 0, { x: 10, z: 0 }).clock, 3);
  assert.equal(relDir(o, 0, { x: 0, z: 10 }).clock, 6);
  assert.equal(relDir(o, 0, { x: -10, z: 0 }).clock, 9);
  // 90° sola dönmüş (yaw +π/2: ileri -x): -x ileri, -z sağ
  assert.equal(relDir(o, Math.PI / 2, { x: -10, z: 0 }).clock, 12);
  assert.equal(relDir(o, Math.PI / 2, { x: 0, z: -10 }).clock, 3);
  assert.equal(relDir(null, 0, { x: 1, z: 1 }), null);
});

test('oyun: Artifact görünümünde sample yolu, yoksa sunucu; izin verilmezse sample bir daha denenmez', async () => {
  const calls = [];
  const stub = Object.assign(async () => ({}), {
    json: async (input, opts) => {
      calls.push({ input, opts });
      if (calls.length === 2) throw { code: 'not_granted', message: 'x' };
      return { speaker: 'YUVA', reply: '7 düşman kaldı.', actions: [] };
    },
  });
  globalThis.window = { claude: { use: async (n) => (n === 'sample' ? stub : null) } };
  try {
    const game = { social: null };
    const ai = new AiRadio(game);
    assert.equal(ai.available, false, 'use() sonradan çözülür');
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(ai.backend, 'artifact');
    const r = await ai.ask('kaç düşman', { enemies: { alive: 7 } });
    assert.equal(r.reply, '7 düşman kaldı.');
    assert.equal(calls[0].opts.modelTier, 'quick');
    assert.equal(calls[0].opts.cache, false, 'sohbet: her soru yeniden sorulur');
    assert.equal(calls[0].input[0].role, 'user');
    assert.ok(calls[0].input.at(-1).content.includes('"alive":7'));
    assert.equal(ai.turns.length, 2);
    await assert.rejects(ai.ask('x', {}), (e) => e.code === 'ai_error');
    assert.equal(ai.backend, null, 'izin verilmedi: sample kapandı');
    game.social = { aiReady: true, aiRadio: async (body) => (calls.push({ server: body }), { speaker: 'Alfa-1', reply: 'Bekliyoruz.', actions: [{ command: 'HOLD', to: ['all'] }] }) };
    assert.equal(ai.backend, 'server');
    const s = await ai.ask('olduğunuz yerde bekleyin', {});
    assert.equal(s.actions[0].commandId, 'HOLD');
    assert.equal(calls.at(-1).server.history.length, 2, 'sohbet belleği sunucuya da gider');
    // Yeni soru eskisini iptal eder: eski soru 'cancelled' (yerel yedeğe düşülmez)
    game.social.aiRadio = (body, signal) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('network'), { code: 'network' }))));
    const first = ai.ask('birinci', {});
    game.social.aiRadio = async () => ({ speaker: 'YUVA', reply: 'İkinci', actions: [] });
    const second = await ai.ask('ikinci', {});
    await assert.rejects(first, (e) => e.code === 'cancelled');
    assert.equal(second.reply, 'İkinci');
    ai.reset();
    assert.equal(ai.turns.length, 0);
  } finally {
    delete globalThis.window;
  }
});

test('ev sunucusu: host.env yapay zekâ satırı yorumlu, anahtar yalnız sunucu ortamına geçer', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ds-ai-'));
  const path = join(dir, 'host.env');
  ensureHostEnv(path, { random: () => 'gizli' });
  const text = readFileSync(path, 'utf8');
  assert.match(text, /^# ANTHROPIC_API_KEY=$/m, 'şablonda yorumlu satır');
  assert.equal(parseEnv(text).ANTHROPIC_API_KEY, undefined, 'yorum satırı değer değil');
  assert.deepEqual(aiEnv({ ANTHROPIC_API_KEY: ' k1 ', AI_MODEL: '' }, { AI_MODEL: 'claude-haiku-5-5', PATH: '/bin' }), { ANTHROPIC_API_KEY: 'k1', AI_MODEL: 'claude-haiku-5-5' });
  assert.deepEqual(aiEnv({}, {}), {});
});

// --- Sunucu ucu (sahte Claude istemcisi) ---
const calls = [];
let nextReply = null;
const fakeClient = {
  messages: { create: async (p) => (calls.push({ beta: false, p }), nextReply(p)) },
  beta: { messages: { create: async (p) => (calls.push({ beta: true, p }), nextReply(p)) } },
};
const textReply = (obj, extra = {}) => () => ({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj) }], ...extra });

let srv;
let off;
let ip = 0;
async function call(s, method, path, body, token) {
  const res = await fetch(`http://127.0.0.1:${s.port}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.9.0.${++ip}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}
const session = async (s, name) => (await call(s, 'POST', '/api/session', { name })).body.token;
const AI_CFG = { enabled: false, model: 'claude-opus-5-5', effort: 'low', timeoutMs: 1000, maxTokens: 2048 };

before(async () => {
  srv = await startServer({ port: 0, host: '127.0.0.1', dbPath: ':memory:', quiet: true, trustProxy: true, aiClient: fakeClient, ai: AI_CFG });
  off = await startServer({ port: 0, host: '127.0.0.1', dbPath: ':memory:', quiet: true, trustProxy: true, ai: AI_CFG });
});
after(async () => {
  await srv.close();
  await off.close();
});

test('sunucu: health ai bayrağı; anahtarsız sunucuda ai_off, kimliksiz 401', async () => {
  assert.equal((await call(srv, 'GET', '/api/health')).body.ai, true);
  assert.equal((await call(off, 'GET', '/api/health')).body.ai, false);
  const t = await session(off, 'Kapalı');
  assert.deepEqual(await call(off, 'POST', '/api/ai/radio', { text: 'merhaba' }, t), { status: 503, body: { error: 'ai_off' } });
  assert.equal((await call(srv, 'POST', '/api/ai/radio', { text: 'merhaba' })).status, 401);
});

test('sunucu: soru + durum Claude\'a gider (yedek model, şema, düşük düşünme), cevap doğrulanır', async () => {
  const t = await session(srv, 'Soran');
  nextReply = textReply({ speaker: 'Alfa-3', reply: 'Bastırıyorum!', actions: [{ command: 'SUPPRESS', to: ['Alfa-3'], reference: 'aim', clock: 0, distance: 0 }, { command: 'NUKE', to: ['all'], reference: 'none', clock: 0, distance: 0 }] });
  const history = [{ role: 'user', content: 'önceki soru' }, { role: 'assistant', content: '{"speaker":"YUVA","reply":"önceki","actions":[]}' }];
  const r = await call(srv, 'POST', '/api/ai/radio', { text: 'Yıldız şuraya baskı yap', context: { enemies: { alive: 5 } }, history }, t);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { speaker: 'Alfa-3', reply: 'Bastırıyorum!', actions: [{ commandId: 'SUPPRESS', addressees: ['Alfa-3'], reference: null, dir: null, distance: null }] });
  const { beta, p } = calls.at(-1);
  assert.ok(beta, 'yedek model için beta isteği');
  assert.equal(p.model, 'claude-opus-5-5');
  assert.deepEqual(p.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(p.fallbacks, 'default');
  assert.equal(p.output_config.effort, 'low');
  assert.equal(p.output_config.format.type, 'json_schema');
  assert.deepEqual(p.output_config.format.schema, aiReplySchema());
  assert.equal(p.system[0].cache_control.type, 'ephemeral');
  assert.ok(p.system[0].text.includes('Alfa-2 Kaya'));
  assert.equal(p.messages.length, 3);
  assert.deepEqual(p.messages.slice(0, 2), history);
  assert.ok(p.messages[2].content.includes('"alive":5') && p.messages[2].content.endsWith('Yıldız şuraya baskı yap'));
  assert.ok(!JSON.stringify(p).includes(t), 'oyuncu belirteci Claude isteğine girmez');
});

test('sunucu: ret karakter içinde geri çevrilir; bozuk cevap ve API hataları koda çevrilir', async () => {
  const t = await session(srv, 'Hatalı');
  nextReply = textReply('', { stop_reason: 'refusal', content: [] });
  assert.deepEqual((await call(srv, 'POST', '/api/ai/radio', { text: 'x' }, t)).body, { speaker: HQ, reply: AI.ui.refused, actions: [] });
  nextReply = textReply('json değil');
  assert.deepEqual(await call(srv, 'POST', '/api/ai/radio', { text: 'x' }, t), { status: 502, body: { error: 'ai_error' } });
  nextReply = () => {
    throw Object.create(Anthropic.RateLimitError.prototype);
  };
  assert.deepEqual(await call(srv, 'POST', '/api/ai/radio', { text: 'x' }, t), { status: 429, body: { error: 'ai_busy' } });
  nextReply = () => {
    throw Object.create(Anthropic.APIConnectionTimeoutError.prototype);
  };
  assert.deepEqual(await call(srv, 'POST', '/api/ai/radio', { text: 'x' }, t), { status: 504, body: { error: 'ai_timeout' } });
});

test('sunucu: metin/durum/gövde sınırları ve oyuncu başına dakikalık hak', async () => {
  const t = await session(srv, 'Sınır');
  nextReply = textReply({ speaker: 'YUVA', reply: 'Tamam', actions: [] });
  assert.deepEqual(await call(srv, 'POST', '/api/ai/radio', { text: '' }, t), { status: 400, body: { error: 'bad_text' } });
  assert.deepEqual(await call(srv, 'POST', '/api/ai/radio', { text: 'a'.repeat(401) }, t), { status: 400, body: { error: 'bad_text' } });
  assert.deepEqual(await call(srv, 'POST', '/api/ai/radio', { text: 'x', context: { pad: 'a'.repeat(9500) } }, t), { status: 413, body: { error: 'too_large' } });
  assert.equal((await call(srv, 'POST', '/api/ai/radio', { text: 'x', context: { pad: 'a'.repeat(20000) } }, t)).status, 413);
  // Önceki dört istek de sayıldı (sınır ayrıştırmadan önce): 12'lik dakikalık hakkın kalanı
  let last = null;
  for (let i = 0; i < 12; i++) last = await call(srv, 'POST', '/api/ai/radio', { text: `soru ${i}` }, t);
  assert.deepEqual(last, { status: 429, body: { error: 'rate_limited' } });
});

test('sunucu: Haiku modelinde sunucu tarafı yedek yok (düz istek)', async () => {
  const s = await startServer({ port: 0, host: '127.0.0.1', dbPath: ':memory:', quiet: true, trustProxy: true, aiClient: fakeClient, ai: { ...AI_CFG, model: 'claude-haiku-5-5' } });
  try {
    const t = await session(s, 'Hızlı');
    nextReply = textReply({ speaker: 'YUVA', reply: 'Hazır', actions: [] });
    assert.equal((await call(s, 'POST', '/api/ai/radio', { text: 'hazır mısınız' }, t)).status, 200);
    const { beta, p } = calls.at(-1);
    assert.equal(beta, false);
    assert.equal(p.fallbacks, undefined);
    assert.equal(p.model, 'claude-haiku-5-5');
  } finally {
    await s.close();
  }
});
