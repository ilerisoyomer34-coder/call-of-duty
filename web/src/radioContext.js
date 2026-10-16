// Telsiz için oyun durumu özeti (yapay zekâya DURUM olarak gider; yapay zekâ yokken radioIntel.js aynı özetten
// cevaplar). Düz JSON: konum yerine Komutana göre saat yönü + metre. Düşman yeri yalnız Komutanın ya da timin
// gördüğü düşmanlar için verilir (yapay zekâ haritanın tamamını bilip hile yaptırmasın); geri kalanlar yalnız sayılır.
import { AI_RADIO, ENEMY_TYPES, MAPS } from './config.js';
import { COMMANDS } from './commands.js';
import { weaponName } from './weaponInfo.js';
import { ACTION_LABELS, BINDINGS, keyName } from './input.js';

const TAU = Math.PI * 2;
const EYE = 1.5;
const _a = { x: 0, y: 0, z: 0 };
const _b = { x: 0, y: 0, z: 0 };

// Komutanın bakışına göre saat yönü (12 ileri, 3 sağ) ve yatay mesafe
export function relDir(from, yaw, pos) {
  if (!from || !pos) return null;
  const dx = pos.x - from.x;
  const dz = pos.z - from.z;
  const m = Math.round(Math.hypot(dx, dz));
  let c = Math.round((((yaw - Math.atan2(-dx, -dz)) / TAU) * 12) % 12);
  if (c <= 0) c += 12;
  return { clock: c, m };
}

function seenBy(world, eyes, pos) {
  _b.x = pos.x;
  _b.y = pos.y + 1.2;
  _b.z = pos.z;
  for (const e of eyes) {
    _a.x = e.x;
    _a.y = e.y + EYE;
    _a.z = e.z;
    if (world.canSee ? world.canSee(_a, _b) : world.lineOfSight?.(_a, _b)) return true;
  }
  return false;
}

function controlsOf(game) {
  if (game.input?.touch?.active) return ['Dokunmatik ekran: sol taraf hareket çubuğu, sağ taraf bakış; ateş, nişan, şarjör, el bombası, bıçak, telsiz ve mikrofon ekrandaki düğmelerde'];
  const out = [];
  for (const [action, label] of Object.entries(ACTION_LABELS)) {
    const keys = BINDINGS[action];
    if (keys?.length) out.push(`${label}: ${keys.map(keyName).join(' / ')}`);
  }
  return out;
}

export function buildRadioContext(game) {
  const g = game;
  const P = g.player;
  const M = g.mission;
  const at = (pos) => relDir(P?.pos, P?.yaw || 0, pos);
  const ctx = {
    device: g.input?.touch?.active ? 'dokunmatik' : 'klavye ve fare',
    level: g.level ? { no: g.level.id, name: g.level.name, map: MAPS[g.level.map]?.name || g.level.map, difficulty: g.difficulty?.label } : null,
    time: Math.round(M?.time || 0),
  };
  const ot = M?.currentText?.();
  if (ot?.title) {
    const mk = M.current?.marker?.();
    const pt = Array.isArray(mk) ? mk[0] : mk;
    ctx.objective = { text: ot.title, detail: ot.detail || undefined, step: `${ot.index}/${ot.total}`, ...(pt ? at(pt) : {}) };
  }
  const ex = M?.data ? M.extractPoint?.() : null;
  if (ex) ctx.extraction = { ...at(ex), helicopter: M.heli ? (M.heli.landed ? 'indi, bekliyor' : 'yolda') : 'çağrılmadı' };
  if (P) {
    const w = g.weapons?.current;
    const A = P.armor;
    const armorMax = (A?.body?.max || 0) + (A?.helmet?.max || 0);
    ctx.player = {
      hp: Math.round(P.health?.hp ?? 0),
      maxHp: P.health?.max ?? 100,
      armor: armorMax ? Math.round((100 * ((A.body?.points || 0) + (A.helmet?.points || 0))) / armorMax) : 0,
      down: !!P.down,
      weapon: w ? weaponName(w.id) : null,
      mag: w?.mag,
      reserve: w?.reserve,
      grenades: g.weapons?.grenades ?? 0,
      vehicle: g.vehicles?.driving?.name || undefined,
    };
  }
  const allies = g.allies?.list || [];
  ctx.squad = allies.map((a) => ({
    callsign: a.callsign,
    name: a.member?.name,
    role: a.member?.roleLabel,
    state: a.dead ? 'dead' : a.down ? 'down' : 'ok',
    hp: a.health ? Math.round((100 * a.health.hp) / a.health.max) : undefined,
    order: COMMANDS[a.order?.id]?.label || 'Takip',
    fire: a.holdFire ? 'kapalı' : 'serbest',
    ...at(a.pos),
  }));
  // Düşmanlar: sayı her zaman, yer yalnız görülenler (en yakın AI_RADIO.contextEnemies)
  const list = (g.enemies?.list || []).filter((e) => e.alive && !e.dummy);
  const eyes = [P?.pos, ...allies.filter((a) => !a.dead && !a.down).map((a) => a.pos)].filter(Boolean);
  const visible = [];
  if (g.world && P) {
    const near = list.filter((e) => e.pos.distanceTo(P.pos) <= AI_RADIO.contextRange).sort((a, b) => a.pos.distanceToSquared(P.pos) - b.pos.distanceToSquared(P.pos));
    for (const e of near) {
      if (visible.length >= AI_RADIO.contextEnemies) break;
      if (seenBy(g.world, eyes, e.pos)) visible.push({ type: ENEMY_TYPES[e.type]?.name || e.type, ...at(e.pos), armored: e.armor?.points > 0 || undefined });
    }
  }
  const tanks = (M?.tanks || []).filter((t) => !t.destroyed);
  ctx.enemies = {
    alive: list.length,
    robots: list.filter((e) => e.type === 'robot').length || undefined,
    tanks: tanks.filter((t) => t.side === 'enemy').length || undefined,
    emptyTanks: tanks.filter((t) => t.side === 'neutral').length || undefined,
    mounts: (M?.mounts || []).filter((m) => !m.wrecked).length || undefined,
    visible,
  };
  const last = g.commands?.radioContext?.lastOrder;
  if (last) ctx.lastOrder = COMMANDS[last.commandId]?.label || last.commandId;
  ctx.controls = controlsOf(g);
  return ctx;
}
