// Görev haritalarını çevrim içi arenaya çevirir (kullanıcı isteği: "başka alanlarda ekle … bütün hepsi olsun"):
// her harita için doğuş noktalarını (mavi/kırmızı taraf, Ölüm Maçı) ve botların dolaştığı noktaları haritanın kendi
// çarpışma dünyasından hesaplar, src/data/arenas.json'a yazar. Elle konan arenalar (depo) korunur.
// Kurallar:
//  - Nokta, ayakta bir oyuncunun sığdığı boş zemin (0,02–1,9 m arası kutu yok, haritanın kenarından payı var) ve
//    başlangıç noktasıyla aynı yürünebilir bölgede (yol ağı: kapalı avlu ya da duvar arkası seçilmez).
//  - Çatışma alanı, görevin kontrol noktalarından aralığı TARGET'a en yakın iki nokta arası (haritanın tamamı açık;
//    doğuşlar ve bot noktaları bu koridorda). Mavi bir uçta, kırmızı öbür uçta, yüzleri karşıya.
//  - Seçim en uzak nokta örneklemesiyle (deterministik): aynı harita hep aynı noktaları verir.
// Kullanım: cd web && node tools/make-arenas.mjs [--check]   (--check: arenas.json güncel değilse çıkış 1)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CollisionWorld } from '../shared/sim/collision.js';
import { NavGrid } from '../shared/sim/nav.js';
import { buildMission } from '../src/level.js';
import { MAP_BUILDERS, ARENA_BUILDERS } from '../src/maps/index.js';
import { MAPS } from '../src/config.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'src/data/arenas.json');
const check = process.argv.includes('--check');

const TARGET = 80; // m: iki tarafın doğuş merkezleri arası
const EDGE = 4; // m: harita kenarından pay
const CLEAR = 0.6; // m: oyuncunun çevresinde boşluk
const SIDE_R = [3, 16]; // m: taraf doğuşlarının merkezden uzaklığı
const CORRIDOR = 34; // m: Ölüm Maçı doğuşları ve bot noktaları iki merkezi birleştiren hattan en çok bu kadar uzakta
const COUNTS = { side: 10, ffa: 16, hotspots: 16 };
const SPACING = { side: 2.5, ffa: 9, hotspots: 10 };

// Arayüzdeki kısa tanım (ad config.js → MAPS'ten)
const DESC = {
  kizilkum: 'Çöl vadisi, kontrol noktası ve kayalıklar',
  harbor: 'Konteyner limanı, vinçler ve iskeleler',
  ruins: 'Yıkık şehir, dar sokaklar',
  pass: 'Karlı dağ geçidi, sığınaklar',
  refinery: 'Gece rafinerisi, borular ve tanklar',
  forest: 'Kara orman, sık ağaçlar',
  factory: 'Çelik fabrika, atölyeler',
  coast: 'Kıyı, sığınaklar ve kum tepeleri',
  core: 'Son kale, beton surlar',
  municipality: 'Belediye meydanı ve çevresi',
};

// -0 JSON'da 0 olur: üretilen değer dosyadakiyle birebir karşılaştırılabilsin
const r1 = (v) => Math.round(v * 10) / 10 || 0;
const r2 = (v) => Math.round(v * 100) / 100 || 0;
// yaw 0 kuzeye (-Z): yön (dx, dz) → yaw (sim.js → dirFromAngles: x = -sin, z = -cos)
const yawTo = (dx, dz) => Math.atan2(-dx, -dz);

function clearAt(W, x, z) {
  for (const c of W.query(x - CLEAR, z - CLEAR, x + CLEAR, z + CLEAR)) {
    if (c.max.y < 0.02 || c.min.y > 1.9) continue;
    if (x + CLEAR > c.min.x && x - CLEAR < c.max.x && z + CLEAR > c.min.z && z - CLEAR < c.max.z) return false;
  }
  return true;
}

// Başlangıçla aynı yürünebilir bölgedeki boş hücreler
function region(W, nav, start) {
  const [sx, sz] = nav.nearestFree(...nav.cellOf(start.x, start.z), 8) || [];
  if (sx === undefined) throw new Error('başlangıç yürünebilir değil');
  const seen = new Uint8Array(nav.w * nav.h);
  const out = [];
  const q = [sz * nav.w + sx];
  seen[q[0]] = 1;
  const B = W.bounds;
  while (q.length) {
    const i = q.pop();
    const cx = i % nav.w;
    const cz = (i / nav.w) | 0;
    const p = nav.center(cx, cz, { x: 0, y: 0, z: 0 });
    if (p.x > B.minx + EDGE && p.x < B.maxx - EDGE && p.z > B.minz + EDGE && p.z < B.maxz - EDGE && clearAt(W, p.x, p.z)) out.push({ x: p.x, z: p.z });
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const x = cx + dx;
      const z = cz + dz;
      if (x < 0 || z < 0 || x >= nav.w || z >= nav.h) continue;
      const j = z * nav.w + x;
      if (seen[j] || nav.blocked[j]) continue;
      seen[j] = 1;
      q.push(j);
    }
  }
  return out;
}

// En uzak nokta örneklemesi: ilk nokta seed'e en yakın aday, sonra seçilenlere en uzak olan (aralık en az spacing)
function farthest(cands, n, seed, spacing) {
  if (!cands.length) return [];
  const d2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
  let first = cands[0];
  for (const c of cands)
    if (d2(c, seed) < d2(first, seed) || (d2(c, seed) === d2(first, seed) && (c.x < first.x || (c.x === first.x && c.z < first.z)))) first = c;
  const picked = [first];
  const best = cands.map((c) => d2(c, first));
  while (picked.length < n) {
    let bi = -1;
    for (let i = 0; i < cands.length; i++) if (bi < 0 || best[i] > best[bi]) bi = i;
    if (bi < 0 || best[bi] < spacing * spacing) break;
    const c = cands[bi];
    picked.push(c);
    for (let i = 0; i < cands.length; i++) best[i] = Math.min(best[i], d2(cands[i], c));
  }
  return picked;
}

function segDist(p, a, b) {
  const vx = b.x - a.x;
  const vz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / (vx * vx + vz * vz)));
  return Math.hypot(p.x - a.x - vx * t, p.z - a.z - vz * t);
}

export function makeArena(id) {
  const W = new CollisionWorld();
  const D = buildMission(W, id);
  const nav = new NavGrid(W, 0.4);
  const cps = D.checkpoints.map((c) => c.pos || c);
  const cells = region(W, nav, cps[0]);
  const near = (p) => cells.reduce((b, c) => ((c.x - p.x) ** 2 + (c.z - p.z) ** 2 < (b.x - p.x) ** 2 + (b.z - p.z) ** 2 ? c : b), cells[0]);
  // Çatışma alanı: kontrol noktaları ve görevdeki düşman yerlerinden (haritanın oynanan, siperli yerleri) aralığı
  // TARGET'a en yakın çift (yürünebilir bölgeye oturtulmuş)
  const anchors = [...cps, ...(D.enemies || []).map((e) => e.pos).filter(Boolean)].map(near);
  let pair = null;
  for (let i = 0; i < anchors.length; i++) {
    for (let j = i + 1; j < anchors.length; j++) {
      const d = Math.hypot(anchors[i].x - anchors[j].x, anchors[i].z - anchors[j].z);
      const score = Math.abs(d - TARGET);
      if (!pair || score < pair.score - 1e-6) pair = { a: anchors[i], b: anchors[j], score, d };
    }
  }
  const { a, b } = pair;
  // İki uç birbirine yürünerek ulaşılabilir olmalı (yol ağı)
  if (!nav.findPath({ x: a.x, y: 0, z: a.z }, { x: b.x, y: 0, z: b.z }, 200000)) throw new Error(`${id}: iki taraf arasında yol yok`);
  const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  const ring = (c) =>
    cells.filter((p) => {
      const d = Math.hypot(p.x - c.x, p.z - c.z);
      return d >= SIDE_R[0] && d <= SIDE_R[1];
    });
  const side = (c, foe) => farthest(ring(c), COUNTS.side, c, SPACING.side).map((p) => [r1(p.x), r1(p.z), r2(yawTo(foe.x - p.x, foe.z - p.z))]);
  const lane = cells.filter((p) => segDist(p, a, b) <= CORRIDOR);
  const ffa = farthest(lane, COUNTS.ffa, a, SPACING.ffa).map((p) => [r1(p.x), r1(p.z), r2(yawTo(mid.x - p.x, mid.z - p.z))]);
  const hotspots = farthest(lane, COUNTS.hotspots, mid, SPACING.hotspots).map((p) => [r1(p.x), r1(p.z)]);
  const arena = {
    name: MAPS[id]?.name || id,
    desc: DESC[id] || '',
    env: id,
    generated: true,
    spawns: { blue: side(a, b), red: side(b, a), ffa },
    hotspots,
  };
  return { arena, info: { dist: Math.round(pair.d), cells: cells.length } };
}

// Komut satırından çalışınca yazar (testler yalnız makeArena'yı alır)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

function main() {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const out = {};
  for (const [k, v] of Object.entries(data)) if (k === '_' || ARENA_BUILDERS[k]) out[k] = v; // elle konanlar
  let stale = 0;
  for (const id of Object.keys(MAP_BUILDERS)) {
    const { arena, info } = makeArena(id);
    const ok =
      arena.spawns.blue.length === COUNTS.side && arena.spawns.red.length === COUNTS.side && arena.spawns.ffa.length >= 8 && arena.hotspots.length >= 8;
    if (!ok)
      throw new Error(
        `${id}: yeterli nokta yok (${JSON.stringify({ b: arena.spawns.blue.length, r: arena.spawns.red.length, f: arena.spawns.ffa.length, h: arena.hotspots.length })})`,
      );
    if (JSON.stringify(data[id]) !== JSON.stringify(arena)) stale++;
    out[id] = arena;
    console.log(
      `${check ? (JSON.stringify(data[id]) === JSON.stringify(arena) ? '✓' : '✗') : '·'} ${id}: taraflar ${info.dist} m arayla, ${arena.spawns.ffa.length} ÖM doğuşu, ${arena.hotspots.length} bot noktası (${info.cells} boş hücre)`,
    );
  }
  if (check) {
    if (stale) {
      console.log(`${stale} arena eski: node tools/make-arenas.mjs`);
      process.exit(1);
    }
  } else {
    // Satır başına bir arena alanı: fark okunur kalsın
    const lines = Object.entries(out).map(([k, v]) => `  ${JSON.stringify(k)}: ${k === '_' ? JSON.stringify(v) : JSON.stringify(v)}`);
    writeFileSync(file, `{\n${lines.join(',\n')}\n}\n`);
    console.log(`→ src/data/arenas.json (${Object.keys(out).length - 1} arena)`);
  }
}
