// Kampanya Co-op'u (kullanıcı isteği "çevrim içini baya geliştir" → Kampanya Co-op): her seviyenin görev akışını
// (config.js → LEVELS[].objectives, harita verisi maps/<id>.js) sunucunun yürütebileceği aşamalara çevirir ve
// src/data/coop.json'a yazar. Sunucu (server/game/coop.js) bu dosyayla takımı görev görev ilerletir, düşmanları
// sunucu botları olarak aşamanın yerinde doğurur. Aşama türleri:
//   - clear: grubu temizle (outpost, robots) — grubun düşmanları, işaret grubun ortası
//   - hold: hedefin dibinde E basılı (aa: uçaksavar/jeneratör C4, intel: dizüstü) — hedef noktaları
//   - reach: noktaya var (lz, board, extract) — final: görev tamam
//   - defend: noktada süre boyunca dalgalara dayan (defend) — dalgalar (sn, birim konumları)
// Kurallar:
//  - Konumlar başlangıçla aynı yürünebilir bölgedeki en yakın boş zemine oturtulur (kule/çatı üstündeki düşman
//    zeminde doğar; sunucu oyuncuyu y = 0'da doğurur).
//  - Bir gruba bağlı olmayan düşmanlar (ör. köy), kendisine en yakın clear dışı aşamanın düşmanı olur.
//  - Tank (capture) ve araç hedefleri çevrim içinde yok: atlanır.
//  - Aşama başına düşman sınırı CAP (hedefe en yakınlar kalır).
// Kullanım: cd web && node tools/make-coop.mjs [--check]   (--check: coop.json güncel değilse çıkış 1)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CollisionWorld } from '../shared/sim/collision.js';
import { NavGrid } from '../shared/sim/nav.js';
import { buildMission } from '../src/level.js';
import { LEVELS } from '../src/config.js';
import { region, farthest } from './make-arenas.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'src/data/coop.json');
const check = process.argv.includes('--check');

const START = { count: 6, ring: [1.5, 9], spacing: 1.8 };
const R = { clear: 14, hold: 1.8, reach: 7, defend: 12 }; // m: aşama yarıçapları (clear: işaretin çevresi, hold: hedefe uzaklık)
const HOLD_SEC = { aa: 3.2, intel: 2.5 };
// Aşama başına en çok düşman (hedefe en yakınlar): çevrim içi takım için uzun temizlik olmasın, geri kalan seyrek
const CAP = { clear: 16, other: 10 };
const TYPE = { rifleman: 'rifleman', shotgunner: 'shotgunner', heavy: 'heavy', sniper: 'sniper', robot: 'heavy', officer: 'rifleman', gunner: 'heavy', aaGunner: 'rifleman' };
const DEFAULT_TEXT = { lz: 'İniş bölgesine ilerle', board: 'Helikoptere bin', extract: 'Tahliye noktasına git', defend: 'İniş bölgesini savun' };

const r1 = (v) => Math.round(v * 10) / 10 || 0;
const r2 = (v) => Math.round(v * 100) / 100 || 0;

export function makeLevel(L) {
  const W = new CollisionWorld();
  const D = buildMission(W, L.map);
  const nav = new NavGrid(W, 0.4);
  const cells = region(W, nav, D.playerStart.pos);
  // En yakın boş zemin (ızgara araması yerine düz tarama: araç bir kez çalışır)
  const snap = (p) => {
    let best = cells[0];
    let bd = Infinity;
    for (const c of cells) {
      const d = (c.x - p.x) ** 2 + (c.z - p.z) ** 2;
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  };
  const sp = D.playerStart.pos;
  const ring = cells.filter((c) => {
    const d = Math.hypot(c.x - sp.x, c.z - sp.z);
    return d >= START.ring[0] && d <= START.ring[1];
  });
  const start = farthest(ring, START.count, sp, START.spacing).map((c) => [r1(c.x), r1(c.z), r2(D.playerStart.yaw || 0)]);
  const enemy = (e) => {
    const c = snap(e.pos);
    return [r1(c.x), r1(c.z), r2(e.yaw || 0), TYPE[e.type] || 'rifleman'];
  };
  const stages = [];
  let prev = null;
  for (const id of L.objectives) {
    const o = D.obj[id] || {};
    let st = null;
    if (id === 'outpost' || id === 'robots') {
      const group = o.group || id;
      const list = D.enemies.filter((e) => e.group === group);
      if (!list.length) continue;
      const m = o.marker || { x: list.reduce((s, e) => s + e.pos.x, 0) / list.length, z: list.reduce((s, e) => s + e.pos.z, 0) / list.length };
      const c = snap(m);
      st = { id, type: 'clear', text: o.text || 'Bölgeyi temizle', pos: [r1(c.x), r1(c.z)], r: R.clear, enemies: list.map(enemy), group };
    } else if (id === 'aa' || id === 'intel') {
      const pts = id === 'aa' ? (D.aaGuns || []).map((a) => a.pos || a) : D.laptop ? [D.laptop.pos || D.laptop] : [];
      if (!pts.length) continue;
      const targets = pts.map((p) => {
        const c = snap(p);
        return [r1(c.x), r1(c.z)];
      });
      const cx = targets.reduce((s, t) => s + t[0], 0) / targets.length;
      const cz = targets.reduce((s, t) => s + t[1], 0) / targets.length;
      st = { id, type: 'hold', text: o.text || (id === 'aa' ? 'Hedefleri imha et' : 'İstihbaratı al'), pos: [r1(cx), r1(cz)], r: R.hold, holdSec: HOLD_SEC[id], targets, enemies: [] };
    } else if (id === 'lz' || id === 'board') {
      if (!D.lz) continue;
      const c = snap(D.lz);
      st = { id, type: 'reach', text: o.text || DEFAULT_TEXT[id], pos: [r1(c.x), r1(c.z)], r: R.reach, enemies: [] };
    } else if (id === 'extract') {
      const ex = D.extract?.[prev] || Object.values(D.extract || {})[0];
      if (!ex) continue;
      const c = snap(ex.pos);
      st = { id, type: 'reach', text: o.text || DEFAULT_TEXT.extract, pos: [r1(c.x), r1(c.z)], r: R.reach, enemies: [] };
    } else if (id === 'defend') {
      if (!D.lz) continue;
      const c = snap(D.lz);
      const waves = (D.waves || []).map((w) => ({ t: w.t, units: w.units.map((u) => enemy(u)) }));
      st = { id, type: 'defend', text: o.text || DEFAULT_TEXT.defend, pos: [r1(c.x), r1(c.z)], r: R.defend, sec: D.defendTime || 60, waves, enemies: [] };
    }
    if (st) {
      stages.push(st);
      prev = id;
    }
  }
  if (!stages.length) throw new Error(`${L.id}: aşama yok`);
  stages.at(-1).final = true;
  // Gruba bağlı olmayan düşmanlar: en yakın clear dışı aşamaya (yoksa ilk aşamaya)
  const clearGroups = new Set(stages.filter((s) => s.type === 'clear').map((s) => s.group));
  const others = stages.filter((s) => s.type !== 'clear' && s.type !== 'defend');
  for (const e of D.enemies) {
    if (clearGroups.has(e.group)) continue;
    let best = others[0] || stages[0];
    let bd = Infinity;
    for (const s of others) {
      const d = Math.hypot(s.pos[0] - e.pos.x, s.pos[1] - e.pos.z);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    best.enemies.push(enemy(e));
  }
  for (const s of stages) {
    delete s.group;
    const cap = s.type === 'clear' ? CAP.clear : CAP.other;
    if (s.enemies.length > cap) {
      s.enemies.sort((a, b) => Math.hypot(a[0] - s.pos[0], a[1] - s.pos[1]) - Math.hypot(b[0] - s.pos[0], b[1] - s.pos[1]) || a[0] - b[0] || a[1] - b[1]);
      s.enemies.length = cap;
    }
  }
  return { map: L.map, name: L.name, tier: L.allyTier || 1, start, stages };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

function main() {
  const out = { _: 'tools/make-coop.mjs üretir; elle düzenlenmez. Seviye kimliği → harita, başlangıç noktaları [x, z, yaw], aşamalar (tür, metin, konum, yarıçap, hedefler, düşmanlar [x, z, yaw, tür], dalgalar).', levels: {} };
  for (const L of LEVELS) out.levels[L.id] = makeLevel(L);
  const text = `${JSON.stringify(out, null, 0).replace(/,"(\d+)":\{"map"/g, ',\n"$1":{"map"')}\n`;
  if (check) {
    const cur = existsSync(file) ? readFileSync(file, 'utf8') : '';
    const same = cur && JSON.stringify(JSON.parse(cur)) === JSON.stringify(out);
    console.log(same ? '✓ coop.json güncel' : '✗ coop.json eski: node tools/make-coop.mjs');
    if (!same) process.exit(1);
    return;
  }
  writeFileSync(file, text);
  for (const [id, l] of Object.entries(out.levels)) console.log(`· ${id} ${l.map}: ${l.stages.map((s) => `${s.id}(${s.type}${s.enemies.length ? ` ${s.enemies.length}` : ''}${s.waves ? ` ${s.waves.length} dalga` : ''})`).join(' → ')}`);
  console.log('→ src/data/coop.json');
}
