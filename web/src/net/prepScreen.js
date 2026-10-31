// Maç öncesi teçhizat paneli (kullanıcı isteği: "maça başlarken teçhizat göstersin ve 1 dk süre versin").
// Isınma evresinde (PHASE.WARMUP, modes.json → warmup 60 sn) ana ve yan silah seçilir. Seçim C_LOADOUT ile sunucuya
// gider; sunucu kabul ettiğini NEV.LOADOUT ile döndürür, oyuncu elindeki silahı ancak o zaman değiştirir (gameClient).
// HAZIRIM: bağlı bütün oyuncular hazırsa maç ONLINE.readyStartSec içinde başlar. Süre dolunca panel kendiliğinden
// kapanır, son seçim geçerlidir. "Haritaya bak" paneli gizler, üstteki TEÇHİZAT çipi geri açar.
// Seçilebilir silahlar sunucunun doğrulamasıyla aynı listeden (shared/sim/loadout.js). Son seçim ayarlarda kalır
// (settings.onlineLoadout): sonraki maçta el sıkışmayla gönderilir.
import { PHASE, RF } from '../../shared/net/protocol.js';
import { onlineChoices, validLoadout } from '../../shared/sim/loadout.js';
import { ONLINE } from '../config.js';
import { weaponName, weaponShortName, weaponType, weaponInfoLine, sortByClass } from '../weaponInfo.js';
import { weaponIcon, weaponPlaceholder, releaseStudio } from '../weaponIcons.js';
import { saveSettings } from '../settings.js';

const $ = (id) => document.getElementById(id);
const SLOTS = [
  { key: 'primary', grid: 'mhPrepPrimary', name: 'mhPrepPrimaryName' },
  { key: 'secondary', grid: 'mhPrepSecondary', name: 'mhPrepSecondaryName' },
];

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class PrepScreen {
  constructor(game) {
    this.game = game;
    this.net = null;
    this.open = false;
    this.dismissed = false; // oyuncu "Haritaya bak" ya da HAZIRIM dedi: kendiliğinden yeniden açılmaz
    this.ready = false;
    this.sel = { primary: ONLINE.defaultPrimary, secondary: ONLINE.defaultSecondary };
    this.cards = { primary: new Map(), secondary: new Map() };
    this.iconsUsed = false;
    $('btnPrepReady').addEventListener('click', () => this.setReady(!this.ready));
    $('btnPrepHide').addEventListener('click', () => this.close(true, true));
    $('mhPrepChip').addEventListener('click', () => this.show());
  }

  start(net) {
    this.net = net;
    this.open = false;
    this.dismissed = false;
    this.ready = false;
    const [p, s] = net.loadout || validLoadout(ONLINE.defaultPrimary, ONLINE.defaultSecondary);
    this.sel.primary = p;
    this.sel.secondary = s;
    // Gerçek/kurgusal ad ayarı maçtan maça değişebilir: kartlar her maçta yeniden kurulur
    for (const S of SLOTS) this.build(S);
    $('mhPrep').hidden = true;
    $('mhPrepChip').hidden = true;
  }

  stop() {
    this.close(false);
    this.net = null;
    $('mhPrepChip').hidden = true;
  }

  build(S) {
    const grid = $(S.grid);
    grid.textContent = '';
    const map = this.cards[S.key];
    map.clear();
    for (const id of sortByClass(onlineChoices(S.key))) {
      const c = el('button', 'mhPrepCard');
      c.type = 'button';
      c.dataset.id = id;
      const img = el('img', 'mhPrepImg');
      img.alt = '';
      img.decoding = 'async';
      img.src = weaponPlaceholder(id);
      c.append(img, el('b', null, weaponShortName(id)), el('small', null, weaponType(id).short));
      c.title = weaponName(id);
      c.addEventListener('click', () => this.choose(S.key, id));
      grid.append(c);
      map.set(id, { card: c, img });
    }
    this.mark(S);
  }

  // Silah görselleri panel ilk açılınca çizilir (ikinci WebGL bağlamı); panel kapanınca bağlam bırakılır
  loadIcons() {
    this.iconsUsed = true;
    for (const S of SLOTS) {
      for (const [id, { img }] of this.cards[S.key]) {
        weaponIcon(id).then((r) => {
          img.src = r.url;
          img.classList.toggle('ready', r.kind !== 'silhouette');
        });
      }
    }
  }

  mark(S) {
    const cur = this.sel[S.key];
    for (const [id, { card }] of this.cards[S.key]) card.classList.toggle('sel', id === cur);
    $(S.name).textContent = `${weaponName(cur)} · ${weaponInfoLine(cur)}`;
  }

  choose(slot, id) {
    if (this.sel[slot] === id) return;
    this.sel[slot] = id;
    for (const S of SLOTS) if (S.key === slot) this.mark(S);
    this.game.audio.uiClick?.();
    this.send();
  }

  setReady(on) {
    this.ready = on;
    this.send();
    this.refreshReady();
    // Hazır olan haritaya bakar (geri sayım bandı görünsün); tıklama bir etkileşim: fare kilidi şimdi istenebilir
    if (on) this.close(true, true);
  }

  send() {
    const [p, s] = validLoadout(this.sel.primary, this.sel.secondary);
    this.net?.setLoadout(p, s, this.ready);
    const S = this.game.settings;
    S.onlineLoadout = { primary: p, secondary: s };
    saveSettings(S);
  }

  show() {
    if (!this.net || this.net.phase !== PHASE.WARMUP) return;
    this.open = true;
    this.dismissed = false;
    $('mhPrep').hidden = false;
    $('mhPrepChip').hidden = true;
    this.game.input.exitLock();
    this.game.input.clearTransientInput();
    if (!this.iconsUsed) this.loadIcons();
    this.refreshReady();
    // Seçili kart görünür olsun (yatay kayan sıra)
    for (const S of SLOTS) this.cards[S.key].get(this.sel[S.key])?.card.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  // byUser: oyuncu kapattı (kendiliğinden yeniden açılmaz); lock: tıklamayla kapandı, fare kilidi şimdi istenebilir
  // (Esc'de istenmez: etkileşimsiz istek reddedilir ve oyun kilitsiz nişan kipine düşerdi; "oyuna dön" katmanı çıkar)
  close(byUser, lock = false) {
    if (!this.open) return;
    this.open = false;
    if (byUser) this.dismissed = true;
    $('mhPrep').hidden = true;
    if (this.iconsUsed) {
      releaseStudio();
      this.iconsUsed = false;
    }
    if (lock && this.game.state === 'playing') this.game.input.requestLock();
  }

  refreshReady() {
    const btn = $('btnPrepReady');
    btn.textContent = this.ready ? 'HAZIR ✓ · VAZGEÇ' : 'HAZIRIM';
    btn.classList.toggle('on', this.ready);
    const net = this.net;
    if (!net) return;
    const hs = net.roster.filter((p) => !(p.flags & RF.BOT) && p.flags & RF.CONNECTED);
    const n = hs.filter((p) => p.flags & RF.READY).length;
    $('mhPrepReady').textContent = hs.length ? `Hazır ${n}/${hs.length}` : '';
  }

  update() {
    const net = this.net;
    if (!net) return;
    const warm = net.phase === PHASE.WARMUP && net.state !== 'closed' && net.state !== 'ended';
    if (!warm) {
      this.close(false);
      $('mhPrepChip').hidden = true;
      return;
    }
    if (!this.open && !this.dismissed) this.show();
    const left = net.timeLeft;
    const t = fmt(Math.ceil(left));
    $('mhPrepTime').textContent = t;
    $('mhPrepTime').classList.toggle('warn', left <= ONLINE.prepWarnSec);
    $('mhPrepChipTime').textContent = t;
    $('mhPrepChip').hidden = this.open;
    $('mhPrepChip').classList.toggle('on', this.ready);
    if (this.open) this.refreshReady();
  }
}
