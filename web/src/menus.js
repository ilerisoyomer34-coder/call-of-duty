import {campaignIndex, campaignUnlocked, nextCampaignLevel, levelLabel} from './campaign.js';
// Menü ekranları: ana menü, seviye ve zorluk, teçhizat, ayarlar, kontroller, emeği geçenler, lisanslar, duraklatma, ölüm, zafer.
import { DIFFICULTY, WEAPONS, WEAPON_ORDER, LEVELS, MAPS, ALLY_TIERS, TACTIC_LABELS, EXTRACT, APP } from './config.js';
import { applyBindingOverrides } from './input.js';
import { BindingsEditor } from './bindingsUi.js';
import { DEFAULT_SETTINGS, saveSettings } from './settings.js';
import { formatTime } from './util.js';
import { PROP_ASSETS, WEAPON_ASSETS, CHARACTER_ASSETS } from './assets.js';
import { formatKR } from './economy.js';
import { EV } from './events.js';
import { StoreScreen } from './storeScreen.js';
import { LoadoutScreen } from './loadoutScreen.js';
import { weaponName } from './weaponInfo.js';
import { levelMission } from './missionSystem.js';
import { renderBriefing, renderRewards, starsText } from './missionUi.js';
import { speechSupported, recognitionCtor } from './radioChat.js';
import { NameScreen, playerDisplay } from './nameScreen.js';
import { parseServerInput } from './net/servers.js';
import { errorText } from './net/social.js';
import { Lobby } from './lobby.js';
import { STORE_BUILD } from './platform.js';

const $ = (id) => document.getElementById(id);
const ACCOUNT_INFO = 'Ad, etiket, arkadaşlar ve bildirimler bu sunucudan kalıcı olarak silinir; cihazdaki ilerleme kalır';
const SCREENS = ['menu', 'nameScreen', 'onlineScreen', 'diffScreen', 'briefScreen', 'loadoutScreen', 'storeScreen', 'settingsScreen', 'controlsScreen', 'creditsScreen', 'licenseScreen', 'pauseScreen', 'deathScreen', 'victoryScreen'];

// Atıfta yazılan değişiklik (CC BY değişikliğin belirtilmesini ister)
// Paketle dağıtılan yazılım kütüphaneleri (Lisanslar ekranının sonunda)
const LIBRARY_CREDITS = [
  ['Fizik motoru', 'Rapier (@dimforge/rapier3d-compat), Dimforge — Apache License 2.0. https://rapier.rs'],
  ['Grafik', 'three.js — MIT lisansı. https://threejs.org'],
  ['Model sadeleştirme', 'meshoptimizer, Arseny Kapoulkine — MIT lisansı. https://github.com/zeux/meshoptimizer'],
];

const CREDIT_CHANGES = {
  fpsArms: 'El ve ön kollar ayrıldı, parmaklar kavrama pozuna büküldü ve birinci şahıs görünümüne uyarlandı.',
  municipality: 'Geometri sadeleştirildi, dokular küçültüldü; belediye tabelası ve çarpışma modeli eklendi.',
  helicopter: 'Oyun için sadeleştirildi ve rengi değiştirildi.',
  pine: 'Oyun için sadeleştirildi, dokuları küçültüldü.',
  containers: 'Oyun için 20 fit boya ölçeklendi, dokulardaki firma yazısı ve logosu silindi.',
  knife: 'Oyun için ölçeklendi, dokuları küçültüldü.',
  ak74: 'Oyun için ölçeklendi, sergi şarjörü ve fişekler atıldı, parçalara ayrıldı.',
  bren2: 'Oyun için ölçeklendi, sergi şarjörü ve fişek atıldı, parçalara ayrıldı.',
  awm: 'Oyun için ölçeklendi, sürgüsü ayrıldı, dokuları küçültüldü.',
  uar10: 'Oyun için ölçeklendi, sergi şarjörü ve fişek atıldı, şarjör, kurma kolu ve dürbün ayrı parçaya ayrıldı.',
  squad: 'Üç asker ayrıldı, oyunun asker iskeletine taşındı (A pozundan T pozuna bükülüp kemikler yeniden adlandırıldı), sadeleştirildi.',
  robot: 'Kaide atıldı, parçalar eklemlere ayrılıp hareketlendirildi, sadeleştirildi, dokular küçültüldü.',
};

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
    // Mağaza: ana menü, teçhizat ve bölüm sonu ekranından açılır (görevde açılmaz)
    this.storeScreen = new StoreScreen(game, this);
    // Teçhizat: yuvalar, gerçek adlı silah kartları, dönen önizleme (loadoutScreen.js)
    this.loadoutScreen = new LoadoutScreen(game, this, this.storeScreen.store);
    // Lobi: oyuncu kartı, günün görevleri, günlük ödül, BAŞLA (lobby.js)
    this.lobby = new Lobby(game, this);
    // Kredi bakiyesi: her harcama/kazançta güncellenir
    this.updateCredits();
    game.events.on(EV.CREDITS_CHANGED, () => this.updateCredits());
    // Oyuncu adı: ilk açılışta sorulur, menüde selamlanır; etiket sunucudan gelince güncellenir
    this.nameScreen = new NameScreen(game, this);
    this.refreshHello();
    game.events.on(EV.PROFILE_CHANGED, () => this.refreshHello());
  }

  refreshHello() {
    const name = playerDisplay(this.game);
    $('menuHello').hidden = !name;
    $('menuHelloName').textContent = name;
    const sn = $('sPlayerName');
    if (sn) sn.textContent = name || '—';
    this.refreshAccount();
  }

  // Ayarlar → Çevrim içi hesap: yalnız sunucuda hesap varken görünür. Silme iki basışlıdır (yanlışlıkla
  // dokunuş hesabı götürmesin); App Store 5.1.1(v) ve Google Play hesabın uygulama içinden silinmesini ister
  refreshAccount(info = ACCOUNT_INFO) {
    const row = $('setAccount');
    if (!row) return;
    clearTimeout(this.deleteTimer);
    const has = !!this.game.save.data.profile.token;
    // Silindikten sonra satır sonucu göstermek için açık kalır (düğmesiz)
    row.hidden = !has && info === ACCOUNT_INFO;
    this.deleteArmed = false;
    const b = $('btnDeleteAccount');
    b.hidden = !has;
    b.disabled = false;
    b.textContent = 'Hesabı sil';
    $('sAccountInfo').textContent = info;
  }

  async deleteAccount() {
    const b = $('btnDeleteAccount');
    if (!this.deleteArmed) {
      this.deleteArmed = true;
      b.textContent = 'Emin misin? Kalıcı · yeniden bas';
      clearTimeout(this.deleteTimer);
      this.deleteTimer = setTimeout(() => this.refreshAccount(), APP.confirmSec * 1000);
      return;
    }
    clearTimeout(this.deleteTimer);
    b.disabled = true;
    b.textContent = 'Siliniyor…';
    const r = (await this.game.social?.deleteAccount()) || { ok: false, error: 'network' };
    if (r.ok) $('sServerUrl').value = '';
    this.refreshAccount(r.ok ? 'Çevrim içi hesabın silindi. Bir sunucuya yeniden bağlanırsan yeni hesap açılır.' : `Silinemedi: ${errorText(r.error)}. Sunucuya bağlıyken yeniden dene.`);
  }

  // Ana menü açılırken: ad yoksa önce ad ekranı
  needName() {
    if (this.game.save.data.profile.name) return false;
    this.nameScreen.open(true);
    return true;
  }

  // Ana menüde tek satırlık bildirim (ör. görev yarıda kaldı → teselli ödülü)
  notice(text) {
    const n = $('menuNotice');
    if (!n) return;
    n.textContent = text || '';
    n.hidden = !text;
  }

  updateCredits() {
    const el = $('menuCreditsVal');
    if (el) el.textContent = formatKR(this.game.economy.credits);
  }

  // Hazır modellerin atfı (CC BY: yazar, kaynak, lisans, değişiklik) propAssets.json'dan; Lisanslar ekranında.
  // Emeği geçenler ekranı yalnız iki rolü gösterir, başka isim eklenmez (kullanıcı isteği)
  buildPropCredits() {
    const box = $('propCredits');
    if (!box) return;
    box.innerHTML = '';
    const names = { fpsArms: 'Birinci şahıs elleri', municipality: 'Belediye binası', helicopter: 'Tahliye helikopteri', knife: 'Yakın dövüş bıçağı', pine: 'Ağaçlar', containers: 'Konteynerler', squad: 'Alfa Timi askerleri', robot: 'Savaş robotu' };
    // Sketchfab silahları: oyundaki kurgusal adıyla
    for (const d of Object.values(WEAPONS)) if (d.source === 'sketchfab') names[d.asset || d.id] = weaponName(d.id);
    // Karakterler: Alfa Timi'nin üç askeri tek modelden (bir satır), savaş robotu
    const chars = Object.entries(CHARACTER_ASSETS).filter(([, a]) => a.credit?.title);
    const squad = chars.find(([id]) => id.startsWith('squad_'));
    const charEntries = [...(squad ? [['squad', squad[1]]] : []), ...chars.filter(([id]) => !id.startsWith('squad_'))];
    const entries = [...Object.entries(PROP_ASSETS), ...charEntries, ...Object.entries(WEAPON_ASSETS).filter(([, a]) => a.credit)];
    for (const [id, a] of entries) {
      const c = a.credit || {};
      const p = document.createElement('p');
      const b = document.createElement('b');
      b.textContent = `${names[id] || id}: `;
      const author = (c.author || '').replace(/\s*\(.*\)$/, '');
      const license = (c.license || '').replace(/\s*\(.*\)$/, '');
      const change = CREDIT_CHANGES[id] || (WEAPON_ASSETS[id] ? 'Oyun için sadeleştirildi, dokulardaki marka yazıları silindi.' : 'Oyun için sadeleştirildi.');
      p.append(b, document.createTextNode(`"${c.title}" — ${author}, Sketchfab (${license}). ${change} ${c.source}`));
      box.appendChild(p);
    }
    // Yazılım kütüphaneleri (paketle dağıtılan)
    for (const [name, text] of LIBRARY_CREDITS) {
      const p = document.createElement('p');
      const b = document.createElement('b');
      b.textContent = `${name}: `;
      p.append(b, document.createTextNode(text));
      box.appendChild(p);
    }
  }

  show(id, push = true) {
    if (id !== 'victoryScreen') this.stopCountdown();
    // Tuş bekleyen yuva ekrandan çıkınca bırakılır; dönüşte tablo güncel atamalarla yeniden çizilir
    if (this.bindings) {
      this.bindings.stop();
      if (id === 'controlsScreen') {
        this.bindings.build();
        this.bindings.say('');
      }
    }
    if (push && this.current && this.current !== id) this.stack.push(this.current);
    // Mağazadan teçhizata dönünce sahiplik ve kredi değişmiş olabilir
    if (!push && id === 'loadoutScreen') this.loadoutScreen?.refresh();
    for (const s of SCREENS) $(s).hidden = s !== id;
    this.current = id;
    if (id === 'menu') this.lobby?.refresh();
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
    click('btnBriefNext', () => this.showLoadout());
    click('btnVictoryStore', () => {
      this.stopCountdown();
      this.storeScreen.open();
    });
    click('btnRange', () => g.startMode('range', 'normal'));
    click('btnStore', () => this.storeScreen.open());
    click('btnSettings', () => this.openSettings());
    click('btnControls', () => this.show('controlsScreen'));
    click('btnCredits', () => this.show('creditsScreen'));
    click('btnLicenses', () => {
      this.buildPropCredits();
      this.show('licenseScreen');
    });
    click('btnResume', () => g.resume());
    click('btnPauseSound', () => g.toggleSound());
    click('btnDeleteAccount', () => this.deleteAccount());
    const priv = $('lnkPrivacy');
    if (priv) priv.href = APP.privacyUrl;
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
    click('btnResetSettings', () => {
      // Tuş atamaları Kontroller ekranındaki kendi düğmesiyle sıfırlanır
      Object.assign(g.settings, DEFAULT_SETTINGS, { bindings: g.settings.bindings });
      applyBindingOverrides(g.settings.bindings);
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
        // Lobinin BAŞLA düğmesi son seçilen zorlukla açar
        this.game.save.data.progress.lastDiff = key;
        this.game.save.update(null);
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
      b.textContent = L.special ? '★' : String(L.id).padStart(2, '0');
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
      const locked = !campaignUnlocked(L.id,P);
      const b = document.createElement('button');
      b.className = 'lvl';
      b.disabled = locked;
      b.dataset.level = String(L.id);
      const n = document.createElement('span');
      n.className = 'n';
      n.textContent = L.special ? '★' : String(L.id).padStart(2, '0');
      const top = document.createElement('div');
      top.className = 'top';
      const name = document.createElement('b');
      name.textContent = L.name;
      const meter = document.createElement('span');
      meter.className = 'meter';
      meter.setAttribute('aria-label', `Görev sırası ${campaignIndex(L.id)+1}/${LEVELS.length}`);
      for (let i = 1; i <= LEVELS.length; i++) {
        const seg = document.createElement('i');
        if (i <= campaignIndex(L.id)+1) seg.className = 'on';
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
      if (locked) m.append('Harita: ', map, ` · Kilitli · önce ${levelLabel(LEVELS[campaignIndex(L.id)-1])} tamamlanmalı`);
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
        const prev = ALLY_TIERS[LEVELS[campaignIndex(L.id)-1]?.allyTier || 0];
        const fresh = tier.tactics.filter((t) => !prev?.tactics.includes(t)).map((t) => TACTIC_LABELS[t]);
        if (fresh.length) {
          const t = document.createElement('div');
          t.className = 't';
          t.textContent = `Manga yeni taktik öğrendi: ${fresh.join(', ')}`;
          m.append(t);
        }
        const rec = g.save.data.missions[String(L.id)];
        if (rec?.completed) {
          const st = document.createElement('strong');
          st.className = 'stars';
          st.textContent = starsText(rec.stars);
          m.append(' · ', st);
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
          this.showBriefing();
        });
        b.addEventListener('mouseenter', () => g.audio.uiHover());
      }
      box.appendChild(b);
    }
    this.show('diffScreen');
  }

  // Brifing (§6.5): ana hedef, üç bonus ve ödülleri, kazanılmış yıldızlar → Teçhizat
  showBriefing() {
    const g = this.game;
    const L = LEVELS.find((l) => l.id === this.pendingLevel) || LEVELS[0];
    const diff = this.pendingDiff || 'normal';
    const record = g.save.data.missions[String(L.id)] || null;
    renderBriefing($('briefRoot'), {
      level: L,
      mapName: MAPS[L.map]?.name || '',
      // Tekrarda farklı bonus ayarı açıksa havuz görev başında karışır; brifing seviyenin kendi listesini gösterir
      mission: levelMission(L.id),
      record,
      difficulty: diff,
      diffLabel: DIFFICULTY[diff].label,
    });
    this.show('briefScreen');
  }

  showLoadout() {
    const L = LEVELS.find((l) => l.id === this.pendingLevel) || LEVELS[0];
    this.loadoutScreen.open(`Teçhizat · ${levelLabel(L)} · ${MAPS[L.map]?.name || L.name} · ${DIFFICULTY[this.pendingDiff || 'normal'].label}`);
  }

  // Kontroller: her eylemin iki tuş yuvası; tıkla → yeni tuşa bas (bindingsUi.js). Kayıt yalnız farkları tutar
  buildControls() {
    this.bindings = new BindingsEditor(this.game, $('keyTables'), $('keyNote'));
    this.bindings.build();
    $('btnKeysReset')?.addEventListener('click', () => {
      this.game.audio.uiClick();
      this.bindings.resetDefaults();
    });
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
    chk('sMuted', S.muted);
    set('sMaster', S.masterVolume);
    set('sSfx', S.sfxVolume);
    set('sAmb', S.ambientVolume);
    set('sFov', S.fov);
    set('sQuality', S.quality);
    set('sRes', S.renderScale);
    set('sFpsCap', S.fpsCap);
    chk('sPostFx', S.postFx !== false);
    chk('sFps', S.showFps);
    chk('sShake', S.cameraShake);
    chk('sBob', S.headBob);
    set('sCh', S.crosshairColor);
    chk('sBlood', S.blood);
    chk('sPhysics', S.physics);
    chk('sCommsCam', S.commsCam);
    chk('sDmgNum', S.damageNumbers);
    chk('sRealNames', S.realNames);
    $('sRealNames').closest('.set').hidden = STORE_BUILD;
    chk('sReroll', S.rerollBonuses);
    set('sWheelSlow', String(S.wheelSlowMo));
    set('sChatSlow', String(S.chatSlowMo));
    set('sServerUrl', S.serverUrl || '');
    this.refreshAccount();
    chk('sRadioVoice', S.radioVoice);
    set('sRadioVol', S.radioVolume);
    chk('sVoiceCmd', S.voiceCommands);
    chk('sButtonIcons', S.buttonIcons);
    // Tarayıcı desteklemiyorsa seslendirme / sesli komut satırı görünmez (§8.3/5)
    for (const id of ['sRadioVoice', 'sRadioVol']) $(id).closest('.set').hidden = !speechSupported();
    $('sVoiceCmd').closest('.set').hidden = !recognitionCtor();
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
    $('oRadioVol').textContent = `${Math.round(S.radioVolume * 100)}`;
    $('oFov').textContent = `${S.fov}°`;
  }

  readSettings() {
    const S = this.game.settings;
    const prevServer = S.serverUrl || '';
    // Davet bağlantısının tamamı da yapıştırılabilir; geçersiz metin eski adresi değiştirmez
    const raw = $('sServerUrl').value.trim();
    const parsed = parseServerInput(raw);
    S.serverUrl = !raw ? '' : parsed.ok ? parsed.url : prevServer;
    // Sunucu adresi değiştiyse çevrim içi bağlantı yeni adrese kurulur
    if (S.serverUrl !== prevServer) queueMicrotask(() => this.game.social?.restart());
    S.sensitivity = parseFloat($('sSens').value);
    S.adsSensitivity = parseFloat($('sAdsSens').value);
    S.invertY = $('sInvert').checked;
    S.adsMode = $('sAdsMode').value;
    S.crouchMode = $('sCrouchMode').value;
    S.sprintMode = $('sSprintMode').value;
    S.muted = $('sMuted').checked;
    S.masterVolume = parseFloat($('sMaster').value);
    S.sfxVolume = parseFloat($('sSfx').value);
    S.ambientVolume = parseFloat($('sAmb').value);
    S.fov = parseInt($('sFov').value, 10);
    S.quality = $('sQuality').value;
    S.renderScale = $('sRes').value;
    S.fpsCap = $('sFpsCap').value;
    S.postFx = $('sPostFx').checked;
    S.showFps = $('sFps').checked;
    S.cameraShake = $('sShake').checked;
    S.headBob = $('sBob').checked;
    S.crosshairColor = $('sCh').value;
    S.blood = $('sBlood').checked;
    S.physics = $('sPhysics').checked;
    S.commsCam = $('sCommsCam').checked;
    S.damageNumbers = $('sDmgNum').checked;
    S.realNames = $('sRealNames').checked;
    S.rerollBonuses = $('sReroll').checked;
    S.wheelSlowMo = parseFloat($('sWheelSlow').value) || 1;
    S.chatSlowMo = parseFloat($('sChatSlow').value) || 1;
    S.radioVoice = $('sRadioVoice').checked;
    S.radioVolume = parseFloat($('sRadioVol').value);
    S.voiceCommands = $('sVoiceCmd').checked;
    S.buttonIcons = $('sButtonIcons').checked;
  }

  saveSettings() {
    this.readSettings();
    saveSettings(this.game.settings);
    this.game.applySettings();
  }

  showPause() {
    const g = this.game;
    const o = g.mission?.currentText();
    // Çevrim içinde oyun durmaz (maç sürer): kontrol noktası yok, çıkış "Maçtan ayrıl"
    const online = !!g.net;
    $('pauseObj').textContent = online ? g.matchTitle() : o?.title || 'Duraklatıldı';
    $('btnRestartCp').hidden = online;
    $('btnQuit').textContent = online ? 'Maçtan ayrıl' : 'Ana menüye dön';
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
    const next = nextCampaignLevel(g.level.id);
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

  showVictory(stats, diffLabel, level = null, next = null, firstClear = false, rewards = null) {
    const rb = $('victoryRewards');
    if (rewards) renderRewards(rb, rewards);
    else rb.hidden = true;
    $('victoryEyebrow').textContent = level ? `${levelLabel(level)} · ${level.name} · ${MAPS[level.map]?.name || ''}` : 'Tahliye başarılı';
    // Rapor oyuncunun adıyla: "Bölüm tamamlandı · Ömer"
    const who = this.game.save.data.profile.name;
    $('victoryTitle').textContent = `${next ? 'Bölüm tamamlandı' : 'Operasyon tamamlandı'}${who ? ` · ${who}` : ''}`;
    const un = $('victoryUnlock');
    un.hidden = !(firstClear && next);
    if (next) {
      // Sonraki seviyede manga terfi ediyorsa söyle: oyuncu ilerlemenin karşılığını görsün
      const up = (next.allyTier || 1) > (level?.allyTier || 1) ? ` · Manga terfi etti: ${ALLY_TIERS[next.allyTier].rank}` : '';
      un.textContent = `Yeni görev açıldı: ${levelLabel(next)} · ${next.name}, ${MAPS[next.map]?.name} (${next.tag})${up}`;
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
    const tail = next ? '' : ' Alfa Timi istihbaratla birlikte üsse döndü.';
    $('victoryRank').append(document.createTextNode('Değerlendirme: '), b, document.createTextNode(` · Zorluk: ${diffLabel}.${tail}`));
    this.stack = [];
    this.show('victoryScreen', false);
    $('victoryNext').hidden = !next;
    if (next) this.startCountdown(next);
  }
}
