// Görev ve meydan okumalar (Operasyon Güncellemesi §6): her seviyenin ana hedef ödülü ve üç bonus görevi
// data/missions.json'dan gelir. Takip olay tabanlıdır: MissionTracker olay yolunu dinler, oyun kodu görev
// bilmez. Koşul türleri: count (olay sayısı ≥ count), never (olay hiç olmamalı; sonda onaylanır), timer (süre
// ≤ hedef), only (tüm öldürmeler filtreye uymalı). Ödül hesabı (ilk tamamlama/tekrar oranı, zorluk çarpanı,
// teselli, yıldız) saf işlevdir; birim testleri doğrudan dener.
// Not: mission.js haritadaki hedefleri (temizle, patlat, savun…) yürütür; burası yalnız ödül ve bonuslar.
import DATA from './data/missions.json' with { type: 'json' };

export const RULES = DATA.rules;
export const BONUS_POOL = DATA.bonusPool;

// Süre biçimi ("6:00")
export function formatPar(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Havuzdaki tanım + seviye satırının ezdiği alanlar → çözülmüş bonus
function resolveBonus(row, parTimeSec) {
  const base = BONUS_POOL[row.id];
  if (!base) return null;
  const b = { ...base, ...row, filter: row.filter || base.filter };
  b.desc = (b.desc || '').replace('{count}', b.count ?? '').replace('{par}', formatPar(parTimeSec));
  b.events = b.events || (b.event ? [b.event] : []);
  return b;
}

// Seviyenin görev tanımı. reroll: havuzdan rastgele üç farklı bonus (tekrar oynamada ayarla; rnd sınanabilir)
export function levelMission(levelId, { reroll = false, rnd = Math.random } = {}) {
  const L = DATA.levels[String(levelId)];
  if (!L) return null;
  let rows = L.bonus;
  if (reroll) {
    const ids = Object.keys(BONUS_POOL);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    rows = ids.slice(0, L.bonus.length).map((id) => ({ id }));
  }
  return { id: String(levelId), primary: L.primary, parTimeSec: L.parTimeSec, bonus: rows.map((r) => resolveBonus(r, L.parTimeSec)).filter(Boolean) };
}

// Filtre: alan = değer, { gte } / { lte } karşılaştırma, { in: [...] } liste
export function matchFilter(filter, payload) {
  if (!filter) return true;
  for (const [k, want] of Object.entries(filter)) {
    const v = payload?.[k];
    if (want && typeof want === 'object' && !Array.isArray(want)) {
      if ('gte' in want && !(v >= want.gte)) return false;
      if ('lte' in want && !(v <= want.lte)) return false;
      if ('in' in want && !want.in.includes(v)) return false;
    } else if (v !== want) return false;
  }
  return true;
}

// Görev boyunca bonusların durumu. state: { progress, failed, done }
export class MissionTracker {
  constructor(events, mission, onChange = null) {
    this.events = events;
    this.mission = mission;
    this.onChange = onChange;
    this.state = mission.bonus.map(() => ({ progress: 0, failed: false, done: false }));
    this.offs = [];
    const types = new Set();
    for (const b of mission.bonus) for (const t of b.events) types.add(t);
    for (const t of types) {
      const fn = (p) => this.handle(t, p);
      events.on(t, fn);
      this.offs.push(() => events.off(t, fn));
    }
  }

  handle(type, payload) {
    this.mission.bonus.forEach((b, i) => {
      const s = this.state[i];
      if (s.failed || !b.events.includes(type)) return;
      if (b.type === 'count') {
        if (s.done || !matchFilter(b.filter, payload)) return;
        s.progress++;
        if (s.progress >= b.count) s.done = true;
        this.onChange?.(i, s.done ? 'done' : 'progress');
      } else if (b.type === 'never') {
        if (!matchFilter(b.filter, payload)) return;
        s.failed = true;
        this.onChange?.(i, 'failed');
      } else if (b.type === 'only') {
        // Filtreye uymayan tek bir öldürme görevi bozar; uyanlar ilerleme sayılır
        if (matchFilter(b.filter, payload)) s.progress++;
        else {
          s.failed = true;
          this.onChange?.(i, 'failed');
        }
      }
    });
  }

  // Görev sonu: never/timer/only burada onaylanır → [{ id, name, done }]
  finish(success, timeSec) {
    this.dispose();
    return this.mission.bonus.map((b, i) => {
      const s = this.state[i];
      let done = false;
      if (success && !s.failed) {
        if (b.type === 'count') done = s.done;
        else if (b.type === 'never') done = true;
        else if (b.type === 'timer') done = timeSec <= this.mission.parTimeSec;
        else if (b.type === 'only') done = s.progress >= (b.count || 1);
      }
      s.done = done;
      return { id: b.id, name: b.name, done };
    });
  }

  dispose() {
    for (const off of this.offs) off();
    this.offs = [];
  }
}

// Ödül dökümü. record: kayıttaki önceki sonuç ({ completed, bonusDone }) ya da null.
// → { lines: [{ key, label, base, factor, amount, done }], mult, total, stars, firstClear }
export function computeRewards({ mission, success, results, kills = 0, difficulty = 'normal', record = null }) {
  const mult = RULES.difficultyMult[difficulty] ?? 1;
  const lines = [];
  if (!success) {
    const amount = kills * RULES.consolationPerKill;
    lines.push({ key: 'consolation', label: `Teselli (${kills} etkisiz × ${RULES.consolationPerKill} KR)`, base: amount, factor: 1, amount, done: true });
    return { lines, mult: 1, total: amount, stars: 0, firstClear: false };
  }
  const firstClear = !record?.completed;
  const pf = firstClear ? 1 : RULES.repeatPrimary;
  lines.push({ key: 'primary', label: 'Ana hedef', base: mission.primary.reward, factor: pf, amount: Math.round(mission.primary.reward * pf * mult), done: true });
  const before = new Set(record?.bonusDone || []);
  let nDone = 0;
  for (const r of results) {
    const b = mission.bonus.find((x) => x.id === r.id);
    const f = before.has(r.id) ? RULES.repeatBonus : 1;
    if (r.done) nDone++;
    lines.push({ key: r.id, label: b.name, base: b.reward, factor: f, amount: r.done ? Math.round(b.reward * f * mult) : 0, done: r.done });
  }
  // Yıldız: starsForBonuses[k] = k+1 yıldız için gereken en az bonus
  let stars = 0;
  RULES.starsForBonuses.forEach((need, k) => {
    if (nDone >= need) stars = k + 1;
  });
  const total = lines.reduce((s, l) => s + l.amount, 0);
  return { lines, mult, total, stars, firstClear };
}

// Kayda yazılacak yeni sonuç (en iyisi korunur)
export function mergeRecord(record, { success, stars, results, timeSec }) {
  const r = { completed: false, stars: 0, bonusDone: [], bestTimeSec: null, plays: 0, ...(record || {}) };
  r.plays++;
  if (!success) return r;
  r.completed = true;
  r.stars = Math.max(r.stars, stars);
  r.bonusDone = [...new Set([...r.bonusDone, ...results.filter((x) => x.done).map((x) => x.id)])];
  r.bestTimeSec = r.bestTimeSec == null ? Math.round(timeSec) : Math.min(r.bestTimeSec, Math.round(timeSec));
  return r;
}

// Bonusun anlık ödülü (tamamlanma bildirimi için): tekrar oranı ve zorluk çarpanı dahil
export function bonusAmount(b, record, difficulty) {
  const f = record?.bonusDone?.includes(b.id) ? RULES.repeatBonus : 1;
  return Math.round(b.reward * f * (RULES.difficultyMult[difficulty] ?? 1));
}

