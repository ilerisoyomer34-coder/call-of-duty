// Oyuncu ilerlemesi (data/progression.json): rütbe ve XP, art arda giriş ödülü, her gün değişen üç görev.
// Kurallar saf işlevlerde (tests/progression.test.mjs); ProgressionSystem yalnız olay yolunu, krediyi ve kaydı
// bağlar. DOM yok: lobi ve HUD olaylarla günceller.
import DATA from './data/progression.json' with { type: 'json' };
import { matchFilter } from './missionSystem.js';
import { EV } from './events.js';

export const PROG = DATA;

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// Seviye n → n+1 için gereken XP (yuvarlanmış)
export function xpForLevel(n) {
  const L = DATA.levels;
  return Math.round((L.base * Math.pow(L.growth, Math.max(0, n - 1))) / L.round) * L.round;
}

// Toplam XP'den seviye: { level, into (seviyedeki XP), need (sonraki seviyeye gereken), frac 0..1, max }
export function levelFromXp(total) {
  const L = DATA.levels;
  let level = 1;
  let left = Math.max(0, total);
  while (level < L.max && left >= xpForLevel(level)) {
    left -= xpForLevel(level);
    level++;
  }
  const max = level >= L.max;
  const need = max ? 0 : xpForLevel(level);
  return { level, into: max ? 0 : left, need, frac: max ? 1 : left / need, max };
}

// Seviyenin rütbesi: { name, short, from, index }
export function rankFor(level) {
  let r = DATA.ranks[0];
  let index = 0;
  DATA.ranks.forEach((x, i) => {
    if (level >= x.from) {
      r = x;
      index = i;
    }
  });
  return { ...r, index };
}

export function freshProgression() {
  return { xp: 0, daily: { last: null, streak: 0 }, challenges: { day: null, list: [] } };
}

export function normalizeProgression(p) {
  const d = freshProgression();
  if (!isObj(p)) return d;
  const daily = isObj(p.daily) ? { last: typeof p.daily.last === 'string' ? p.daily.last : null, streak: isNum(p.daily.streak) ? Math.max(0, Math.floor(p.daily.streak)) : 0 } : d.daily;
  const ch = isObj(p.challenges) && typeof p.challenges.day === 'string' && Array.isArray(p.challenges.list) ? p.challenges : d.challenges;
  return { ...p, xp: isNum(p.xp) ? Math.max(0, Math.floor(p.xp)) : 0, daily, challenges: { day: ch.day, list: ch.list.filter((c) => isObj(c) && typeof c.id === 'string') } };
}

// Yerel gün anahtarı (YYYY-AA-GG): oyuncunun gün dönümü kendi saatine göre
export function dayKey(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

// İki gün anahtarı arasındaki gün farkı (b - a)
export function dayDiff(a, b) {
  const t = (k) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));
  return Math.round((t(b) - t(a)) / 86400000);
}

// XP ekle; kazanılan seviyeler ve seviye ödülleri: { before, after, levels: [n...], credits }
export function addXp(prog, amount) {
  const before = levelFromXp(prog.xp).level;
  prog.xp += Math.max(0, Math.round(amount));
  const after = levelFromXp(prog.xp).level;
  const levels = [];
  let credits = 0;
  const R = DATA.levelReward;
  for (let n = before + 1; n <= after; n++) {
    levels.push(n);
    credits += R.credits + (n % R.milestone === 0 ? R.milestoneCredits : 0);
  }
  return { before, after, levels, credits };
}

// Günlük ödül durumu: { canClaim, day (1–7, alınacak/alınmış gün), streak }
export function dailyStatus(prog, today) {
  const D = prog.daily;
  const n = DATA.daily.credits.length;
  if (D.last === today) return { canClaim: false, day: ((D.streak - 1) % n) + 1, streak: D.streak };
  const cont = D.last && dayDiff(D.last, today) === 1;
  const streak = cont ? D.streak + 1 : 1;
  return { canClaim: true, day: ((streak - 1) % n) + 1, streak };
}

// Günlük ödülü al (gün başına bir kez): { credits, xp, day } ya da null
export function claimDaily(prog, today) {
  const st = dailyStatus(prog, today);
  if (!st.canClaim) return null;
  prog.daily.last = today;
  prog.daily.streak = st.streak;
  return { credits: DATA.daily.credits[st.day - 1], xp: DATA.daily.xp[st.day - 1], day: st.day };
}

// Gün anahtarından tohumlanan seçim: o gün herkes aynı görevleri görür, gün dönünce yenilenir
function seeded(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

export function challengesFor(today) {
  const pool = [...DATA.challenges.pool];
  const rnd = seeded(today);
  const out = [];
  while (out.length < DATA.challenges.perDay && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  return out;
}

// Bugünün görevleri kayıtta yoksa kur (ilerleme gün içinde korunur): değişti mi
export function ensureChallenges(prog, today) {
  if (prog.challenges.day === today && prog.challenges.list.length) return false;
  prog.challenges = { day: today, list: challengesFor(today).map((c) => ({ id: c.id, progress: 0, done: false })) };
  return true;
}

export const challengeDef = (id) => DATA.challenges.pool.find((c) => c.id === id) || null;

// Olay bugünün görevlerini ilerletir; bu olayla tamamlananların tanımları döner
export function challengeEvent(prog, event, payload) {
  const done = [];
  for (const c of prog.challenges.list) {
    if (c.done) continue;
    const def = challengeDef(c.id);
    if (!def || def.event !== event || !matchFilter(def.filter, payload)) continue;
    c.progress = Math.min(def.count, c.progress + 1);
    if (c.progress >= def.count) {
      c.done = true;
      done.push(def);
    }
  }
  return done;
}

// Görev ve maç olaylarından XP (poligon sayılmaz: çağıran mod denetler)
export function xpForEvent(event, p) {
  const X = DATA.xp;
  switch (event) {
    case EV.ENEMY_KILLED:
      if (p.killer !== 'player') return 0;
      return (p.weaponId === 'melee' ? X.melee : X.kill) + (p.headshot ? X.headshot : 0);
    case EV.MISSION_ENDED:
      return p.success ? X.missionComplete + (p.stars || 0) * X.perStar : X.missionFail;
    case EV.ALLY_REVIVED:
      return p.by === 'player' ? X.allyRevive : 0;
    default:
      return 0;
  }
}

// Oyun bağlantısı: olayları dinler, XP ve görev ödüllerini verir, kaydı yazar, sonuç olaylarını yayar.
// Olaylar: XP_GAINED { amount, reason, level, frac }, LEVEL_UP { level, rank, credits },
// CHALLENGE_DONE { id, name, credits, xp }, DAILY_CLAIMED { day, credits, xp }
export class ProgressionSystem {
  // mode(): oyunun kipi ('mission' dışındakiler XP vermez); matchWon(m): çevrim içi maç kazanıldı mı
  constructor({ save, economy, events, mode = () => 'mission', matchWon = () => false, now = () => new Date() }) {
    this.save = save;
    this.economy = economy;
    this.events = events;
    this.mode = mode;
    this.matchWon = matchWon;
    this.now = now;
    if (ensureChallenges(this.data, this.today)) this.persist();
    for (const ev of [EV.ENEMY_KILLED, EV.MISSION_ENDED, EV.ALLY_REVIVED, EV.ARMOR_BROKEN]) {
      events.on(ev, (p) => {
        // Poligondaki mankenler ilerleme vermez (kolay XP çiftliği olmasın)
        if (this.mode() !== 'mission') return;
        this.onEvent(ev, p || {});
      });
    }
    events.on(EV.NET_MATCH_END, (m) => this.onMatchEnd(m || {}));
  }

  get data() {
    return this.save.data.progression;
  }

  get today() {
    return dayKey(this.now());
  }

  persist() {
    this.save.update(null, { now: true });
  }

  get level() {
    return levelFromXp(this.data.xp);
  }

  get rank() {
    return rankFor(this.level.level);
  }

  // Bugünün görevleri tanımlarıyla: [{ id, name, count, progress, done, credits, xp }]
  challenges() {
    if (ensureChallenges(this.data, this.today)) this.persist();
    return this.data.challenges.list.map((c) => ({ ...challengeDef(c.id), ...c }));
  }

  daily() {
    return dailyStatus(this.data, this.today);
  }

  claimDaily() {
    const r = claimDaily(this.data, this.today);
    if (!r) return null;
    this.economy.add(r.credits, 'daily');
    this.grantXp(r.xp, 'daily');
    this.persist();
    this.events.emit(EV.DAILY_CLAIMED, r);
    return r;
  }

  grantXp(amount, reason) {
    if (amount <= 0) return;
    const r = addXp(this.data, amount);
    const L = this.level;
    this.events.emit(EV.XP_GAINED, { amount, reason, level: L.level, frac: L.frac });
    for (const n of r.levels) {
      const per = DATA.levelReward.credits + (n % DATA.levelReward.milestone === 0 ? DATA.levelReward.milestoneCredits : 0);
      this.economy.add(per, 'levelUp');
      this.events.emit(EV.LEVEL_UP, { level: n, rank: rankFor(n), credits: per });
    }
  }

  onEvent(ev, p) {
    if (ensureChallenges(this.data, this.today)) this.persist();
    this.grantXp(xpForEvent(ev, p), ev);
    for (const def of challengeEvent(this.data, ev, p)) this.reward(def);
    // Öldürme gibi sık olaylarda kayıt toplanarak yazılır; görev sonu ve ödüller hemen
    this.save.update(null, { now: ev === EV.MISSION_ENDED });
  }

  onMatchEnd(m) {
    if (ensureChallenges(this.data, this.today)) this.persist();
    const X = DATA.xp;
    this.grantXp(X.onlineMatch + (this.matchWon(m) ? X.onlineWin : 0), 'online');
    for (const def of challengeEvent(this.data, EV.NET_MATCH_END, m)) this.reward(def);
    this.persist();
  }

  reward(def) {
    this.economy.add(def.credits, 'challenge');
    this.grantXp(def.xp, 'challenge');
    this.events.emit(EV.CHALLENGE_DONE, { id: def.id, name: def.name, credits: def.credits, xp: def.xp });
  }
}
