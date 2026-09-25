// Menü ekranları: ana menü, zorluk, ayarlar, kontroller, emeği geçenler, duraklatma, ölüm, zafer.
import { DIFFICULTY } from './config.js';
import { BINDINGS, ACTION_LABELS, keyName } from './input.js';
import { DEFAULT_SETTINGS, saveSettings } from './settings.js';
import { formatTime } from './util.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['menu', 'diffScreen', 'settingsScreen', 'controlsScreen', 'creditsScreen', 'pauseScreen', 'deathScreen', 'victoryScreen'];

export class Menus {
  constructor(game) {
    this.game = game;
    this.stack = [];
    this.current = null;
    this.bind();
    this.buildControls();
    this.buildDifficulty();
  }

  show(id, push = true) {
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
    click('btnPlay', () => this.show('diffScreen'));
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
    click('btnAgain', () => g.startMode(g.mode, g.difficultyKey));
    click('btnVictoryMenu', () => g.toMenu());
    click('btnResetSettings', () => {
      Object.assign(g.settings, DEFAULT_SETTINGS);
      this.fillSettings();
      g.applySettings();
    });
  }

  buildDifficulty() {
    const list = $('diffList');
    list.innerHTML = '';
    for (const [key, d] of Object.entries(DIFFICULTY)) {
      const b = document.createElement('button');
      b.className = `diff${key === 'normal' ? ' sel' : ''}`;
      b.innerHTML = `<b></b><span></span>`;
      b.firstChild.textContent = d.label;
      b.lastChild.textContent = d.desc;
      b.addEventListener('click', () => {
        this.game.audio.init();
        this.game.audio.uiClick();
        this.game.startMode('mission', key);
      });
      b.addEventListener('mouseenter', () => this.game.audio.uiHover());
      list.appendChild(b);
    }
  }

  buildControls() {
    const groups = [
      ['Hareket', ['forward', 'back', 'left', 'right', 'sprint', 'crouch', 'jump', 'leanLeft', 'leanRight']],
      ['Savaş', ['fire', 'ads', 'reload', 'fireMode', 'grenade', 'melee', 'interact', 'weapon1', 'weapon2', 'weapon3', 'swapWeapon', 'pause']],
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

  showVictory(stats, diffLabel) {
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
    $('victoryRank').append(document.createTextNode('Değerlendirme: '), b, document.createTextNode(` · Zorluk: ${diffLabel}. Kartal-1 istihbaratla birlikte üsse döndü.`));
    this.stack = [];
    this.show('victoryScreen', false);
  }
}
