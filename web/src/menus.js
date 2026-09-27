// Menü ekranları: ana menü, seviye ve zorluk, teçhizat, ayarlar, kontroller, emeği geçenler, duraklatma, ölüm, zafer.
import { DIFFICULTY, WEAPONS, WEAPON_ORDER, LEVELS, MAPS, ALLY_TIERS, TACTIC_LABELS, EXTRACT } from './config.js';
import { BINDINGS, ACTION_LABELS, keyName } from './input.js';
import { DEFAULT_SETTINGS, saveSettings } from './settings.js';
import { formatTime } from './util.js';
import { PROP_ASSETS, WEAPON_ASSETS } from './assets.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['menu', 'diffScreen', 'loadoutScreen', 'settingsScreen', 'controlsScreen', 'creditsScreen', 'pauseScreen', 'deathScreen', 'victoryScreen'];

export class Menus {
  constructor(game) {
    this.game = game;
    this.stack = [];
    this.current = null;
    this.pendingDiff = 'normal';
    this.pendingLevel = 1;
    this.bind();
    this.buildControls();
    this.buildDifficulty();
    this.buildBrief();
    this.buildPropCredits();
  }

  // Hazır araç modellerinin atfı (CC BY: yazar, kaynak, lisans, değişiklik) propAssets.json'dan
  buildPropCredits() {
    const box = $('propCredits');
    if (!box) return;
    const names = { helicopter: 'Tahliye helikopteri' };
    // Sketchfab silahları: oyundaki kurgusal adıyla
    for (const d of Object.values(WEAPONS)) if (d.source === 'sketchfab') names[d.asset || d.id] = d.name;
    const entries = [...Object.entries(PROP_ASSETS), ...Object.entries(WEAPON_ASSETS).filter(([, a]) => a.credit)];
    for (const [id, a] of entries) {
      const c = a.credit || {};
      const p = document.createElement('p');
      const b = document.createElement('b');
      b.textContent = `${names[id] || id}: `;
      const author = (c.author || '').replace(/\s*\(.*\)$/, '');
      const license = (c.license || '').replace(/\s*\(.*\)$/, '');
      const change = WEAPON_ASSETS[id] ? 'Oyun için sadeleştirildi, dokulardaki marka yazıları silindi.' : 'Oyun için sadeleştirildi ve rengi değiştirildi.';
      p.append(b, document.createTextNode(`"${c.title}" — ${author}, Sketchfab (${license}). ${change} ${c.source}`));
      box.appendChild(p);
    }
  }

  show(id, push = true) {
    if (id !== 'victoryScreen') this.stopCountdown();
    if (push && this.current && this.current !== id) this.stack.push(this.current);
    for (const s of SCREENS) $(s).hidden = s !== id;
    this.current = id;
    const first = $(id)?.querySelector('button, .diff');
    if (first && !this.game.input.touch.active) setTimeout(() => first.focus({ preventScroll: true }), 30);
  }

  back() {
    const prev = this.stack.pop();
    if (prev) this.show(prev, false);
    else this.hideAll();
  }

  hideAll() {
    this.stopCountdown();
    for (const s of SCREENS) $(s).hidden = true;
    this.current = null;
    this.stack = [];
  }

  bind() {
    const g = this.game;
    const click = (id, fn) => $(id).addEventListener('click', () => {
      g.audio.init();
      g.audio.uiClick();
      fn();
    });
    for (const b of document.querySelectorAll('[data-back]')) {
      b.addEventListener('click', () => {
        g.audio.uiClick();
        if (this.current === 'settingsScreen') this.saveSettings();
        this.back();
      });
    }
    for (const b of document.querySelectorAll('.mbtn, .btn')) b.addEventListener('mouseenter', () => g.audio.uiHover());
    click('btnPlay', () => this.showLevels());
    click('btnRange', () => g.startMode('range', 'normal'));
    click('btnSettings', () => this.openSettings());
    click('btnControls', () => this.show('controlsScreen'));
    click('btnCredits', () => this.show('creditsScreen'));
    click('btnResume', () => g.resume());
    click('btnPauseSettings', () => this.openSettings());
    click('btnPauseControls', () => this.show('controlsScreen'));
    click('btnRestartCp', () => g.respawn());
    click('btnQuit', () => g.toMenu());
    click('btnRespawn', () => g.respawn());
    click('btnDeathQuit', () => g.toMenu());
    click('btnAgain', () => {
      this.stopCountdown();
      g.startMode(g.mode, g.difficultyKey, g.level.id);
    });
    click('btnNext', () => this.goNext());
    click('btnHold', () => this.stopCountdown());
    click('btnVictoryMenu', () => {
      this.stopCountdown();
      g.toMenu();
    });
    click('btnDeploy', () => {
      const L = this.selLoadout;
      this.game.setLoadout(L.primary, L.secondary);
      this.game.startMode('mission', this.pendingDiff || 'normal', this.pendingLevel);
    });
    click('btnResetSettings', () => {
      Object.assign(g.settings, DEFAULT_SETTINGS);
      this.fillSettings();
      g.applySettings();
    });
  }

  // Zorluk: seviyenin kendi ayarının üstüne uygulanan temel çarpan (Asker önerilen)
  buildDifficulty() {
    const list = $('diffList');
    list.innerHTML = '';
    for (const [key, d] of Object.entries(DIFFICULTY)) {
      const b = document.createElement('button');
      b.className = `diff${key === this.pendingDiff ? ' sel' : ''}`;
      b.dataset.key = key;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(key === this.pendingDiff));
      const name = document.createElement('b');
      name.textContent = d.label;
      b.appendChild(name);
      b.addEventListener('click', () => {
        this.game.audio.init();
        this.game.audio.uiClick();
        this.pendingDiff = key;
        for (const x of list.children) {
          x.classList.toggle('sel', x.dataset.key === key);
          x.setAttribute('aria-checked', String(x.dataset.key === key));
        }
        $('diffDesc').textContent = d.desc;
      });
      b.addEventListener('mouseenter', () => this.game.audio.uiHover());
      list.appendChild(b);
    }
    $('diffDesc').textContent = DIFFICULTY[this.pendingDiff].desc;
  }

  // Ana menüdeki seviye özeti
  buildBrief() {
    const box = $('menuBrief');
    box.innerHTML = '';
    for (const L of LEVELS) {
      const b = document.createElement('b');
      b.textContent = String(L.id).padStart(2, '0');
      const sp = document.createElement('span');
      sp.textContent = `${L.name} · ${L.tag}`;
      box.append(b, sp);
    }
  }

  // Seviye kartları: kilitli olanlar seçilemez; en iyi sonuç ve manga büyüklüğü görünür
  showLevels() {
    const g = this.game;
    const box = $('levelList');
    box.innerHTML = '';
    const P = g.progress;
    for (const L of LEVELS) {
      const locked = L.id > P.unlocked;
      const b = document.createElement('button');
      b.className = 'lvl';
      b.disabled = locked;
      b.dataset.level = String(L.id);
      const n = document.createElement('span');
      n.className = 'n';
      n.textContent = String(L.id).padStart(2, '0');
      const top = document.createElement('div');
      top.className = 'top';
      const name = document.createElement('b');
      name.textContent = L.name;
      const meter = document.createElement('span');
      meter.className = 'meter';
      meter.setAttribute('aria-label', `Zorluk ${L.id}/${LEVELS.length}`);
      for (let i = 1; i <= LEVELS.length; i++) {
        const seg = document.createElement('i');
        if (i <= L.id) seg.className = 'on';
        meter.appendChild(seg);
      }
      const tag = document.createElement('span');
      tag.textContent = L.tag;
      meter.appendChild(tag);
      top.append(name, meter);
      const d = document.createElement('div');
      d.className = 'd';
      d.textContent = L.brief;
      const m = document.createElement('div');
      m.className = 'm';
      const tier = ALLY_TIERS[L.allyTier || 1];
      const map = document.createElement('em');
      map.textContent = MAPS[L.map]?.name || '';
      if (locked) m.append('Harita: ', map, ` · Kilitli · önce Seviye ${L.id - 1}'i bitir`);
      else {
        const squad = document.createElement('em');
        squad.textContent = `${L.allies} × ${tier.rank}`;
        m.append('Harita: ', map, ' · Manga: ', squad);
        const hmg = L.enemies.hmg || 0;
        if (hmg) {
          const h = document.createElement('strong');
          h.className = 'hmg';
          h.textContent = `${hmg} makineli yuvası`;
          m.append(' · ', h);
        }
        // Bu kademede açılan yeni taktikler (bir önceki seviyeye göre)
        const prev = ALLY_TIERS[LEVELS.find((l) => l.id === L.id - 1)?.allyTier || 0];
        const fresh = tier.tactics.filter((t) => !prev?.tactics.includes(t)).map((t) => TACTIC_LABELS[t]);
        if (fresh.length) {
          const t = document.createElement('div');
          t.className = 't';
          t.textContent = `Manga yeni taktik öğrendi: ${fresh.join(', ')}`;
          m.append(t);
        }
        const best = P.best[L.id];
        if (best) {
          const st = document.createElement('strong');
          st.textContent = `${best.score} puan · ${formatTime(best.time)}`;
          m.append(' · En iyi: ', st);
        }
      }
      b.append(n, top, d, m);
      if (!locked) {
        b.addEventListener('click', () => {
          g.audio.init();
          g.audio.uiClick();
          this.pendingLevel = L.id;
          this.showLoadout();
        });
        b.addEventListener('mouseenter', () => g.audio.uiHover());
      }
      box.appendChild(b);
    }
    this.show('diffScreen');
  }

  // Silah kartı için 0–1 arası özet değerler
  static gunStats(d) {
    const dmg = d.projectile ? 1 : Math.min(1, Math.pow((d.damage * d.pellets) / 150, 0.6));
    const rate = Math.min(1, d.rpm / 1000);
    const range = d.projectile ? 0.6 : Math.min(1, d.falloff.end / 220);
    const pat = d.recoil.pattern;
    const avg = pat.reduce((s, p) => s + Math.abs(p[1]) + Math.abs(p[0]) * 0.5, 0) / pat.length;
    const control = Math.max(0.06, Math.min(1, 1 - (avg * (1 + d.recoil.random)) / 7));
    const move = Math.min(1, ((d.mobility || 1) * (0.55 + 0.45 * d.ads.moveMult)) / 1.0);
    return [['Hasar', dmg], ['Atış hızı', rate], ['Menzil', range], ['Kontrol', control], ['Hareket', move]];
  }

  showLoadout() {
    const g = this.game;
    this.selLoadout = { ...g.loadout };
    const L = LEVELS.find((l) => l.id === this.pendingLevel) || LEVELS[0];
    document.getElementById('loadoutDiff').textContent = `Seviye ${L.id} · ${L.name} · ${DIFFICULTY[this.pendingDiff || 'normal'].label}`;
    for (const [cat, listId] of [['primary', 'primaryList'], ['secondary', 'secondaryList']]) {
      const box = document.getElementById(listId);
      box.innerHTML = '';
      for (const id of WEAPON_ORDER) {
        const d = WEAPONS[id];
        if (d.category !== cat) continue;
        const b = document.createElement('button');
        b.className = `gun${this.selLoadout[cat] === id ? ' sel' : ''}`;
        b.dataset.id = id;
        const top = document.createElement('div');
        top.className = 'top';
        const name = document.createElement('b');
        name.textContent = d.name;
        top.appendChild(name);
        if (d.model === 'glb') {
          const badge = document.createElement('span');
          badge.className = 'badge';
          badge.textContent = d.source === 'sketchfab' ? 'Sketchfab' : 'Blender';
          top.appendChild(badge);
        }
        const kind = document.createElement('div');
        kind.className = 'kind';
        kind.textContent = d.kind;
        const bars = document.createElement('div');
        bars.className = 'bars';
        for (const [label, v] of Menus.gunStats(d)) {
          const s = document.createElement('span');
          s.textContent = label;
          const i = document.createElement('i');
          i.style.setProperty('--v', `${Math.round(v * 100)}%`);
          bars.append(s, i);
        }
        b.append(top, kind, bars);
        b.addEventListener('click', () => {
          g.audio.uiClick();
          this.selLoadout[cat] = id;
          for (const x of box.children) x.classList.toggle('sel', x.dataset.id === id);
        });
        b.addEventListener('mouseenter', () => g.audio.uiHover());
        box.appendChild(b);
      }
    }
    this.show('loadoutScreen');
  }

  buildControls() {
    const groups = [
      ['Hareket', ['forward', 'back', 'left', 'right', 'sprint', 'crouch', 'jump', 'leanLeft', 'leanRight']],
      ['Savaş', ['fire', 'ads', 'reload', 'fireMode', 'grenade', 'melee', 'interact', 'weapon1', 'weapon2', 'swapWeapon', 'holdBreath', 'pause']],
    ];
    const box = $('keyTables');
    box.innerHTML = '';
    for (const [title, actions] of groups) {
      const wrap = document.createElement('div');
      const h = document.createElement('h3');
      h.textContent = title;
      wrap.appendChild(h);
      const t = document.createElement('table');
      t.className = 'keys';
      for (const a of actions) {
        const tr = document.createElement('tr');
        const td1 = document.createElement('td');
        td1.textContent = ACTION_LABELS[a];
        const td2 = document.createElement('td');
        for (const c of BINDINGS[a].slice(0, 2)) {
          const k = document.createElement('kbd');
          k.textContent = keyName(c);
          td2.appendChild(k);
          td2.appendChild(document.createTextNode(' '));
        }
        tr.append(td1, td2);
        t.appendChild(tr);
      }
      wrap.appendChild(t);
      box.appendChild(wrap);
    }
  }

  openSettings() {
    this.fillSettings();
    this.show('settingsScreen');
  }

  fillSettings() {
    const S = this.game.settings;
    const set = (id, v) => ($(id).value = v);
    const chk = (id, v) => ($(id).checked = !!v);
    set('sSens', S.sensitivity);
    set('sAdsSens', S.adsSensitivity);
    chk('sInvert', S.invertY);
    set('sAdsMode', S.adsMode);
    set('sCrouchMode', S.crouchMode);
    set('sSprintMode', S.sprintMode);
    set('sMaster', S.masterVolume);
    set('sSfx', S.sfxVolume);
    set('sAmb', S.ambientVolume);
    set('sFov', S.fov);
    set('sQuality', S.quality);
    set('sRes', S.renderScale);
    chk('sFps', S.showFps);
    chk('sShake', S.cameraShake);
    chk('sBob', S.headBob);
    set('sCh', S.crosshairColor);
    chk('sBlood', S.blood);
    chk('sDmgNum', S.damageNumbers);
    this.updateOutputs();
    if (!this.settingsBound) {
      this.settingsBound = true;
      for (const el of document.querySelectorAll('#settingsScreen input, #settingsScreen select')) {
        el.addEventListener('input', () => {
          this.readSettings();
          this.updateOutputs();
          this.game.applySettings();
        });
      }
    }
  }

  updateOutputs() {
    const S = this.game.settings;
    $('oSens').textContent = Number(S.sensitivity).toFixed(2);
    $('oAdsSens').textContent = Number(S.adsSensitivity).toFixed(2);
    $('oMaster').textContent = `${Math.round(S.masterVolume * 100)}`;
    $('oSfx').textContent = `${Math.round(S.sfxVolume * 100)}`;
    $('oAmb').textContent = `${Math.round(S.ambientVolume * 100)}`;
    $('oFov').textContent = `${S.fov}°`;
  }

  readSettings() {
    const S = this.game.settings;
    S.sensitivity = parseFloat($('sSens').value);
    S.adsSensitivity = parseFloat($('sAdsSens').value);
    S.invertY = $('sInvert').checked;
    S.adsMode = $('sAdsMode').value;
    S.crouchMode = $('sCrouchMode').value;
    S.sprintMode = $('sSprintMode').value;
    S.masterVolume = parseFloat($('sMaster').value);
    S.sfxVolume = parseFloat($('sSfx').value);
    S.ambientVolume = parseFloat($('sAmb').value);
    S.fov = parseInt($('sFov').value, 10);
    S.quality = $('sQuality').value;
    S.renderScale = $('sRes').value;
    S.showFps = $('sFps').checked;
    S.cameraShake = $('sShake').checked;
    S.headBob = $('sBob').checked;
    S.crosshairColor = $('sCh').value;
    S.blood = $('sBlood').checked;
    S.damageNumbers = $('sDmgNum').checked;
  }

  saveSettings() {
    this.readSettings();
    saveSettings(this.game.settings);
    this.game.applySettings();
  }

  showPause() {
    const o = this.game.mission?.currentText();
    $('pauseObj').textContent = o?.title || 'Duraklatıldı';
    this.stack = [];
    this.show('pauseScreen', false);
  }

  showDeath(tip) {
    $('deathTip').innerHTML = '';
    const b = document.createElement('b');
    b.textContent = 'İpucu: ';
    $('deathTip').append(b, document.createTextNode(tip));
    this.stack = [];
    this.show('deathScreen', false);
  }

  // Bölüm kartından sonraki bölüme geç (geri sayım bitince ya da düğmeyle)
  goNext() {
    const g = this.game;
    this.stopCountdown();
    const next = LEVELS.find((l) => l.id === g.level.id + 1);
    if (next) g.startMode('mission', g.difficultyKey, next.id);
  }

  // Geri sayım: oyun döngüsü zafer ekranında durduğu için gerçek saatle ilerler
  startCountdown(next) {
    this.stopCountdown();
    const total = EXTRACT.nextDelay;
    const t0 = performance.now();
    $('victoryNextText').textContent = `Sonraki bölüm: ${next.name} · ${MAPS[next.map]?.name || ''}`;
    $('victoryNext').hidden = false;
    $('btnHold').hidden = false;
    const tick = () => {
      const left = total - (performance.now() - t0) / 1000;
      $('victoryCount').textContent = Math.max(0, Math.ceil(left));
      $('victoryFill').style.transform = `scaleX(${Math.max(0, left / total)})`;
      if (left <= 0) this.goNext();
    };
    tick();
    this.countdown = setInterval(tick, 100);
  }

  stopCountdown() {
    if (!this.countdown) return;
    clearInterval(this.countdown);
    this.countdown = null;
    $('victoryCount').textContent = '–';
    $('btnHold').hidden = true;
    $('victoryNextText').textContent = 'Otomatik geçiş durduruldu';
  }

  showVictory(stats, diffLabel, level = null, next = null, firstClear = false) {
    $('victoryEyebrow').textContent = level ? `Seviye ${level.id} · ${level.name} · ${MAPS[level.map]?.name || ''}` : 'Tahliye başarılı';
    $('victoryTitle').textContent = next ? 'Bölüm tamamlandı' : 'Operasyon tamamlandı';
    const un = $('victoryUnlock');
    un.hidden = !(firstClear && next);
    if (next) {
      // Sonraki seviyede manga terfi ediyorsa söyle: oyuncu ilerlemenin karşılığını görsün
      const up = (next.allyTier || 1) > (level?.allyTier || 1) ? ` · Manga terfi etti: ${ALLY_TIERS[next.allyTier].rank}` : '';
      un.textContent = `Yeni seviye açıldı: Seviye ${next.id} · ${next.name}, ${MAPS[next.map]?.name} (${next.tag})${up}`;
    }
    $('btnNext').hidden = !next;
    const acc = stats.shots ? Math.round((stats.hits / stats.shots) * 100) : 0;
    const items = [
      [formatTime(stats.time), 'Görev süresi'],
      [stats.kills, 'Etkisiz düşman'],
      [stats.headshots, 'Kafa vuruşu'],
      [`%${acc}`, 'İsabet oranı'],
      [stats.deaths, 'Ölüm'],
      [stats.score, 'Puan'],
    ];
    const box = $('victoryStats');
    box.innerHTML = '';
    for (const [v, l] of items) {
      const d = document.createElement('div');
      const b = document.createElement('b');
      b.textContent = v;
      const s = document.createElement('span');
      s.textContent = l;
      d.append(b, s);
      box.appendChild(d);
    }
    let rank = 'Er';
    if (stats.deaths === 0 && acc >= 35) rank = 'Demir Şafak Nişanı';
    else if (stats.deaths <= 1 && acc >= 25) rank = 'Yüzbaşı';
    else if (stats.deaths <= 3) rank = 'Çavuş';
    $('victoryRank').innerHTML = '';
    const b = document.createElement('b');
    b.textContent = `${rank}`;
    const tail = next ? '' : ' Kartal ekibi istihbaratla birlikte üsse döndü.';
    $('victoryRank').append(document.createTextNode('Değerlendirme: '), b, document.createTextNode(` · Zorluk: ${diffLabel}.${tail}`));
    this.stack = [];
    this.show('victoryScreen', false);
    $('victoryNext').hidden = !next;
    if (next) this.startCountdown(next);
  }
}
