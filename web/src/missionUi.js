// Görev arayüzü (Operasyon Güncellemesi §6.5): görevde sağ üstte bonus takipçisi (J ile aç/kapa) ve
// tamamlanma/başarısızlık bildirimleri; menüde brifing ekranı; bölüm sonunda kredi dökümü ve yıldızlar.
// Kurallar ve hesap missionSystem.js'te; burası yalnız görünüm.
import { formatKR } from './economy.js';
import { bonusAmount, formatPar, RULES } from './missionSystem.js';
import MISSIONS from './data/missions.json' with { type: 'json' };

const $ = (id) => document.getElementById(id);
const TOAST_SEC = 2.5; // bildirim ekranda kalma süresi
const FLASH_MS = 1000; // ilerleyen satırın parlama süresi
const COUNT_MS = 1100; // sonuç ekranında kredinin sayarak artma süresi

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export function starsText(n, max = RULES.starsForBonuses.length) {
  return '★'.repeat(n) + '☆'.repeat(Math.max(0, max - n));
}

// Görevde bonus takipçisi ve bildirimler
export class MissionHud {
  constructor(game) {
    this.game = game;
    this.root = $('tracker');
    this.toastEl = $('bonusToast');
    this.rows = [];
    this.toastT = 0;
    this.queue = [];
    this.collapsed = false;
  }

  setup(mission, tracker, record, difficulty) {
    this.mission = mission;
    this.tracker = tracker;
    this.record = record;
    this.difficulty = difficulty;
    this.queue.length = 0;
    this.toastT = 0;
    if (this.toastEl) this.toastEl.hidden = true;
    if (!this.root) return;
    this.root.innerHTML = '';
    const head = el('div', 'trHead');
    head.append(el('span', null, 'BONUS GÖREVLER'), el('kbd', 'trKey', 'J'));
    this.list = el('div', 'trList');
    this.rows = mission.bonus.map((b) => {
      const r = el('div', 'trRow');
      const name = el('b', null, b.name);
      const prog = el('span', 'trProg');
      const kr = el('em', null, `+${formatKR(bonusAmount(b, record, difficulty))}`);
      r.append(name, prog, kr);
      this.list.appendChild(r);
      return { r, prog, b, flashUntil: 0 };
    });
    this.root.append(head, this.list);
    this.root.hidden = false;
    this.root.classList.toggle('collapsed', this.collapsed);
    this.refresh();
  }

  hide() {
    if (this.root) this.root.hidden = true;
    if (this.toastEl) this.toastEl.hidden = true;
    this.mission = null;
  }

  toggle() {
    this.collapsed = !this.collapsed;
    this.root?.classList.toggle('collapsed', this.collapsed);
  }

  // Satır metinleri: count → "6/10", never → "korunuyor", timer → kalan süre
  refresh() {
    if (!this.mission) return;
    // Hedef panelinin yüksekliği metne göre değişir: takipçi hep hemen altında dursun. Dokunmatikte can ve silah
    // panelleri de sol sütunda (hedefin altında): takipçi silah panelinin altına iner
    const obj = this.game.input.touch.active ? $('ammo') : $('objective');
    if (obj && this.root && obj.offsetHeight) this.root.style.top = `${obj.offsetTop + obj.offsetHeight + 8}px`;
    const t = this.game.mission?.time || 0;
    this.rows.forEach((row, i) => {
      const s = this.tracker.state[i];
      const b = row.b;
      let text = '';
      if (b.type === 'count') text = `${Math.min(s.progress, b.count)}/${b.count}`;
      else if (b.type === 'never') text = s.failed ? 'başarısız' : 'korunuyor';
      else if (b.type === 'timer') text = t <= this.mission.parTimeSec ? formatPar(this.mission.parTimeSec - t) : 'süre doldu';
      else if (b.type === 'only') text = s.failed ? 'başarısız' : `${s.progress}`;
      row.prog.textContent = text;
      row.r.classList.toggle('done', s.done && b.type === 'count');
      row.r.classList.toggle('failed', s.failed);
    });
  }

  // Tracker değişikliği: satır parlar, tamamlanınca/bozulunca bildirim
  onChange(i, kind) {
    const row = this.rows[i];
    if (!row) return;
    row.flashUntil = performance.now() + FLASH_MS;
    row.r.classList.remove('flash');
    void row.r.offsetWidth;
    row.r.classList.add('flash');
    this.refresh();
    if (kind === 'done') {
      this.toast(`✔ GÖREV TAMAMLANDI — ${row.b.name} +${formatKR(bonusAmount(row.b, this.record, this.difficulty))}`, 'ok');
      this.game.audio.bonusDone?.();
    } else if (kind === 'failed') this.toast(`✖ ${row.b.name} — başarısız`, 'fail');
  }

  // Süre görevi hedefi aşınca bir kez gri bildirim
  timerCheck() {
    if (!this.mission) return;
    const t = this.game.mission?.time || 0;
    this.rows.forEach((row, i) => {
      const s = this.tracker.state[i];
      if (row.b.type === 'timer' && !s.failed && t > this.mission.parTimeSec) {
        s.failed = true;
        this.onChange(i, 'failed');
      }
    });
  }

  toast(text, kind) {
    this.queue.push({ text, kind });
    if (this.toastT <= 0) this.next();
  }

  next() {
    const n = this.queue.shift();
    if (!n || !this.toastEl) return;
    this.toastEl.textContent = n.text;
    this.toastEl.className = n.kind;
    this.toastEl.hidden = false;
    this.toastT = TOAST_SEC;
  }

  update(dt, input) {
    if (!this.mission) return;
    if (input?.pressed('tracker')) this.toggle();
    this.refreshT = (this.refreshT || 0) - dt;
    if (this.refreshT <= 0) {
      this.refreshT = 0.5;
      this.timerCheck();
      this.refresh();
    }
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) {
        this.toastEl.hidden = true;
        this.next();
      }
    }
  }
}

// Brifing: harita ve ana hedef, üç bonus ve ödülleri, daha önce kazanılan yıldızlar
export function renderBriefing(root, { level, mapName, mission, record, difficulty, diffLabel }) {
  root.innerHTML = '';
  const head = el('div', 'brHead');
  const t = el('div');
  t.append(el('div', 'eyebrow', `Brifing · Seviye ${level.id} · ${diffLabel}`), el('h2', null, level.name));
  const st = el('div', 'brStars', starsText(record?.stars || 0));
  st.title = record?.completed ? `En iyi: ${record.stars} yıldız${record.bestTimeSec != null ? ` · ${formatPar(record.bestTimeSec)}` : ''}` : 'Henüz tamamlanmadı';
  head.append(t, st);

  const map = el('div', `brMap map-${level.map}`);
  map.append(el('b', null, mapName), el('span', null, level.tag));
  const main = el('div', 'brMain');
  main.append(el('h3', null, 'Ana hedef'), el('p', 'brText', level.brief));
  const objs = el('ol', 'brObjs');
  for (const id of level.objectives) objs.append(el('li', null, MISSIONS.objectiveLabels?.[id] || id));
  const mult = RULES.difficultyMult[difficulty] ?? 1;
  const pf = record?.completed ? RULES.repeatPrimary : 1;
  main.append(objs, el('p', 'brReward', `Ödül: ${formatKR(mission.primary.reward * pf * mult)}${record?.completed ? ' (tekrar: %50)' : ''} · Hedef süre ${formatPar(mission.parTimeSec)}`));

  const bon = el('div', 'brBonus');
  bon.append(el('h3', null, 'Bonus görevler'));
  for (const b of mission.bonus) {
    const row = el('div', `brRow${record?.bonusDone?.includes(b.id) ? ' had' : ''}`);
    const txt = el('div');
    txt.append(el('b', null, b.name), el('span', null, b.desc));
    row.append(txt, el('em', null, `+${formatKR(bonusAmount(b, record, difficulty))}`));
    bon.append(row);
  }
  bon.append(el('p', 'brNote', `★ ana hedef · ★★ en az ${RULES.starsForBonuses[1]} bonus · ★★★ tüm bonuslar. Zorluk çarpanı ×${String(mult).replace('.', ',')}.`));

  const body = el('div', 'brBody');
  const left = el('div');
  left.append(map, main);
  body.append(left, bon);
  root.append(head, body);
}

// Sonuç ekranı: ✔/✖ satırları, kredi dökümü, sayarak artan toplam, yıldızlar
export function renderRewards(box, rw) {
  box.innerHTML = '';
  box.hidden = false;
  const list = el('div', 'rwList');
  for (const l of rw.lines) {
    const r = el('div', `rwRow${l.done ? '' : ' miss'}`);
    const f = [];
    if (l.factor !== 1) f.push(`×${String(l.factor).replace('.', ',')}`);
    if (rw.mult !== 1 && l.key !== 'consolation') f.push(`×${String(rw.mult).replace('.', ',')}`);
    r.append(el('span', 'rwMark', l.done ? '✔' : '✖'), el('span', 'rwLabel', l.label), el('span', 'rwCalc', l.done && f.length ? `${formatKR(l.base)} ${f.join(' ')}` : ''), el('b', null, l.done ? `+${formatKR(l.amount)}` : '—'));
    list.append(r);
  }
  const tot = el('div', 'rwTotal');
  const val = el('b', null, formatKR(0));
  tot.append(el('span', null, 'Kazanılan kredi'), val);
  const stars = el('div', 'rwStars', starsText(rw.stars));
  if (rw.firstClear) stars.title = 'İlk tamamlama: ödüller tam';
  box.append(stars, list, tot);
  // Sayarak artan toplam (kare hızı düşükse de son değerde biter)
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / COUNT_MS);
    val.textContent = formatKR(rw.total * k);
    if (k < 1 && box.isConnected) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  setTimeout(() => (val.textContent = formatKR(rw.total)), COUNT_MS + 80);
}
