// Oyun bağlantısı (S4–S6, game.net): sunucu odasına bağlanır ve maçı yürütür.
//   - El sıkışma: C_HELLO (protokol, derleme özeti, kimlik, oda, teçhizat) → S_WELCOME → harita yüklenince C_LOADED.
//   - Saat: ClockSync (sunucu saati ve tick'i). Uzak oyuncular sunucu saatinin interpMs gerisinde çizilir;
//     titreşime göre gecikme 60–250 ms arası uyarlanır.
//   - Girdi: her yerel tick bir komut; pakette son 3 komut (kayıp telafisi). Komutun bakış ve hareket değerleri
//     ağ biçimine yuvarlanır (quantizeCmd): tahmin, sunucunun göreceği sayılarla yapılır.
//   - Tahmin + uzlaştırma: her komutun sonrası saklanır; anlık görüntü sunucunun işlediği son komuttaki durumu
//     getirir. Fark yoksa dokunulmaz; varsa sunucu durumundan sonraki komutlar yeniden oynatılır, görüntüdeki
//     sıçrama kısa sürede yumuşatılır (player.netCorr).
//   - Zaman genişletme: sunucunun komut tamponu azalırsa tick biraz hızlanır, birikirse yavaşlar (tickScale).
//   - Atış/şarjör/yakın dövüş istemcide görünür, sunucuya komutla bildirilir; isabet, hasar ve ölüm sunucudan.
import { PROTOCOL_VERSION, TICK_DT, TICK_RATE } from '../../shared/constants.js';
import { MSG, ERR, NEV, PHASE, SIDE, HIT_KIND, SURFACES, SLOT_NONE } from '../../shared/net/protocol.js';
import { Writer, encodeHello, encodeInput, encodePing, encodeSimple, decodeServer, quantizeCmd } from '../../shared/net/codec.js';
import { ClockSync } from '../../shared/net/clock.js';
import { createPlayerState, stepPlayer, applyCmdMods, BTN } from '../../shared/sim/movement.js';
import { lerp } from '../../shared/sim/math.js';
import { ONLINE, WEAPONS, MOVEMENT } from '../config.js';
import { EV } from '../events.js';
import NETSIM from '../data/netsim.json' with { type: 'json' };
import { WsTransport } from './wsTransport.js';
import { RemotePlayers } from './remotePlayers.js';

/* global __BUILD_HASH__ */
export const BUILD_HASH = typeof __BUILD_HASH__ === 'string' ? __BUILD_HASH__ : '';

// Bağlantıyı kapatan hatalar (S_ERROR) → oyuncuya gösterilen metin
export const NET_ERRORS = {
  [ERR.VERSION_MISMATCH]: { title: 'Oyun güncellendi', text: 'Sunucu ile oyunun sürümü farklı. Sayfayı yenile (uygulamada menüdeki Güncelle). Düzelmezse sunucu birkaç dakika içinde kendini günceller.', reload: true },
  [ERR.BUILD_MISMATCH]: { title: 'Oyun güncellendi', text: 'Sunucu ile oyunun sürümü farklı. Sayfayı yenile (uygulamada menüdeki Güncelle). Düzelmezse sunucu birkaç dakika içinde kendini günceller.', reload: true },
  [ERR.AUTH_FAILED]: { title: 'Oturum geçersiz', text: 'Çevrim içi ekranından yeniden bağlan.' },
  [ERR.ROOM_NOT_FOUND]: { title: 'Oda bulunamadı', text: 'Maç bitmiş ya da oda kapanmış olabilir.' },
  [ERR.ROOM_FULL]: { title: 'Oda dolu', text: 'Başka bir maç ara.' },
  [ERR.NOT_MEMBER]: { title: 'Bu odaya katılamazsın', text: 'Oda yalnız eşleşen oyunculara açık.' },
  [ERR.BAD_MESSAGE]: { title: 'Bağlantı kesildi', text: 'Sunucu bozuk ileti aldı.' },
  [ERR.RATE_LIMIT]: { title: 'Bağlantı kesildi', text: 'Çok fazla ileti gönderildi.' },
  [ERR.REPLACED]: { title: 'Başka yerden bağlandın', text: 'Aynı hesapla başka bir sekmeden maça girildi.' },
  [ERR.ROOM_CLOSED]: { title: 'Oda kapandı', text: 'Maç sona erdi.' },
  [ERR.TIMEOUT]: { title: 'Bağlantı zaman aşımı', text: 'Sunucu yanıt vermedi.' },
  lost: { title: 'Bağlantı koptu', text: 'Sunucuyla bağlantı kesildi.' },
  network: { title: 'Sunucuya ulaşılamadı', text: 'İnternet bağlantını ve sunucu adresini denetle.' },
  noserver: { title: 'Sunucu yok', text: 'Çevrim içi sunucu ayarlı değil.' },
};

const HIST = 256;
const CONNECT_MS = 8000;

function stateRec() {
  return { px: 0, py: 0, pz: 0, vx: 0, vy: 0, vz: 0, crouchT: 0, adsT: 0, sprintOut: 0, grounded: true, crouched: false, sprinting: false };
}

function saveState(r, s) {
  r.px = s.pos.x;
  r.py = s.pos.y;
  r.pz = s.pos.z;
  r.vx = s.vel.x;
  r.vy = s.vel.y;
  r.vz = s.vel.z;
  r.crouchT = s.crouchT;
  r.adsT = s.adsT;
  r.sprintOut = s.sprintOut;
  r.grounded = s.grounded;
  r.crouched = s.crouched;
  r.sprinting = s.sprinting;
}

// Tahmin ile sunucu aynı mı? (nicemleme adımlarının altında fark yok sayılır)
function near(r, s, eps) {
  return (
    Math.abs(r.px - s.pos.x) <= eps &&
    Math.abs(r.py - s.pos.y) <= eps &&
    Math.abs(r.pz - s.pos.z) <= eps &&
    Math.abs(r.vx - s.vel.x) <= 0.02 &&
    Math.abs(r.vy - s.vel.y) <= 0.02 &&
    Math.abs(r.vz - s.vel.z) <= 0.02 &&
    Math.abs(r.crouchT - s.crouchT) <= 0.002 &&
    Math.abs(r.adsT - s.adsT) <= 0.002 &&
    r.grounded === s.grounded &&
    r.crouched === s.crouched &&
    r.sprinting === s.sprinting
  );
}

export class GameClient {
  constructor(game, match) {
    this.game = game;
    this.match = match; // { room, kind, mode, map, side }
    this.state = 'connecting'; // connecting | loading | playing | ended | closed
    this.w = new Writer(512);
    this.clock = new ClockSync(() => performance.now());
    this.remotes = new RemotePlayers(game);
    this.welcome = null;
    this.slot = -1;
    this.roster = [];
    this.hist = [];
    for (let i = 0; i < HIST; i++) this.hist.push({ seq: -1, buttons: 0, moveX: 0, moveY: 0, yaw: 0, pitch: 0, slot: 0, fireMode: 0, viewTick: 0, shots: [], st: stateRec() });
    this.seq = 0;
    this.out = []; // son gönderilen komutlar (yedeklilik)
    this.pendingShots = [];
    this.pendingButtons = 0;
    this.shotViewTick = 0;
    this.tmp = createPlayerState();
    this.ackSeq = -1;
    this.lastSnapTick = 0;
    this.phase = PHASE.WARMUP;
    this.phaseLeft = 0;
    this.phaseAt = 0;
    this.scoreA = 0;
    this.scoreB = 0;
    this.me = { alive: false, hp: 0, protect: false, respawnIn: 0 };
    this.killedBy = null;
    this.result = null;
    this.tickScale = 1;
    this.interpMs = ONLINE.interpMs;
    this.error = null;
    // net_graph ölçümleri
    this.stats = { snapTimes: [], bytes: [], predErr: 0, corrections: 0, bufDepth: 0, tickUs: 0, pings: [], spikes: 0 };
    this.profileName = '';
  }

  // --- Bağlantı ---
  url() {
    const base = this.game.social.serverUrl;
    if (!base) return '';
    return base.replace(/^http/, 'ws') + '/game';
  }

  // Karşılama gelince çözülen söz; hata olursa { code, title, text }
  connect() {
    return new Promise((resolve, reject) => {
      const url = this.url();
      if (!url) return reject(this.errorOf('noserver'));
      let t;
      try {
        t = new WsTransport(url);
      } catch {
        return reject(this.errorOf('network'));
      }
      this.transport = t;
      this.applyNetsimFromUrl();
      const timer = setTimeout(() => {
        t.close();
        reject(this.errorOf(ERR.TIMEOUT));
      }, CONNECT_MS);
      this.pumpTimer = setInterval(() => t.pump(), 4);
      t.onopen = () => {
        const L = this.game.loadout;
        t.send(encodeHello(this.w, { protocolVersion: PROTOCOL_VERSION, buildHash: BUILD_HASH, token: this.game.social.profile.token || '', room: this.match.room, primary: L.primary, secondary: L.secondary }));
      };
      this.onWelcome = (m) => {
        clearTimeout(timer);
        resolve(m);
      };
      this.onFail = (e) => {
        clearTimeout(timer);
        reject(e);
      };
      t.onmessage = (b) => this.onMessage(b);
      t.onclose = (code) => {
        clearInterval(this.pumpTimer);
        if (this.state === 'closed') return;
        const e = this.error || this.errorOf(this.welcome ? 'lost' : 'network');
        this.state = 'closed';
        if (!this.welcome) this.onFail(e);
        else this.game.onNetClosed?.(e, code);
      };
    });
  }

  errorOf(code, detail = '') {
    const e = NET_ERRORS[code] || NET_ERRORS.lost;
    return { code, detail, ...e };
  }

  applyNetsimFromUrl() {
    try {
      const k = new URLSearchParams(location.search).get('netsim');
      if (k) this.setProfile(k);
    } catch {
      /* adres yok */
    }
  }

  // Ağ benzetimi profili (konsol net_profile, ?netsim=) ya da elle değerler
  setProfile(name) {
    const p = NETSIM.profiles[name];
    if (!p && name !== 'off') return false;
    this.profileName = p ? name : '';
    this.netsim = p ? { ...p } : null;
    this.transport?.setNetsim(this.netsim);
    return true;
  }

  setNetsim(field, value) {
    this.netsim = { rtt: 0, jitter: 0, loss: 0, ...(this.netsim || {}) };
    this.netsim[field] = value;
    this.profileName = 'elle';
    this.transport?.setNetsim(this.netsim);
  }

  // Harita yüklendi: sunucu oyuncuyu doğurabilir
  ready() {
    this.state = 'playing';
    this.sceneReady = true;
    this.remotes.setRoster(this.roster, this.slot);
    this.send(encodeSimple(this.w, MSG.C_LOADED));
  }

  leave() {
    if (this.state === 'closed') return;
    this.send(encodeSimple(this.w, MSG.C_LEAVE));
    this.close();
  }

  close() {
    this.state = 'closed';
    clearInterval(this.pumpTimer);
    this.transport?.close(1000, 'leave');
    this.remotes.dispose();
  }

  send(bytes) {
    if (this.transport && !this.transport.closed) this.transport.send(bytes);
  }

  // --- Gelen iletiler ---
  onMessage(bytes) {
    const m = decodeServer(bytes);
    if (!m) return;
    const st = this.stats;
    const now = performance.now();
    st.bytes.push([now, bytes.length]);
    switch (m.type) {
      case MSG.S_WELCOME:
        this.welcome = m;
        this.slot = m.slot;
        // Saat kaba başlangıç: sunucu zamanı (gidiş-dönüş ölçülünce düzelir)
        this.clock.offset = m.serverTime - now;
        this.onWelcome?.(m);
        break;
      case MSG.S_ROSTER:
        this.roster = m.players;
        // Modeller sahne kurulunca (ready) eklenir: yükleme sırasında eski sahneye düşmesin
        if (this.sceneReady) this.remotes.setRoster(m.players, this.slot);
        this.game.events.emit(EV.NET_ROSTER, m.players);
        break;
      case MSG.S_PONG:
        this.clock.onPong(m.clientTime, m.serverTime, now);
        st.pings.push([now, now - m.clientTime]);
        break;
      case MSG.S_SNAPSHOT:
        st.snapTimes.push(now);
        this.onSnapshot(m);
        break;
      case MSG.S_MATCH_END:
        this.result = m;
        this.state = 'ended';
        this.game.events.emit(EV.NET_MATCH_END, m);
        break;
      case MSG.S_ERROR:
        this.error = this.errorOf(m.code, m.detail);
        if (!this.welcome) this.onFail?.(this.error);
        break;
      default:
        break;
    }
  }

  get frozen() {
    return this.phase !== PHASE.LIVE;
  }

  get mySide() {
    return this.roster.find((p) => p.slot === this.slot)?.side ?? SIDE.NONE;
  }

  onSnapshot(s) {
    const g = this.game;
    const P = g.player;
    this.lastSnapTick = s.tick;
    this.stats.bufDepth = s.bufDepth;
    this.stats.tickUs = s.tickUs;
    if (s.phase !== this.phase) {
      const prev = this.phase;
      this.phase = s.phase;
      g.events.emit(EV.NET_PHASE, { phase: s.phase, prev });
    }
    this.phaseLeft = s.phaseLeft;
    this.phaseAt = performance.now();
    this.scoreA = s.scoreA;
    this.scoreB = s.scoreB;
    // Zaman genişletme: sunucuda bekleyen komut tamponuna göre
    const D = ONLINE.dilation;
    this.tickScale = s.bufDepth < D.low ? D.fast : s.bufDepth > D.high ? D.slow : 1;
    // Önce olaylar (doğuş konumu uzlaştırmadan önce yerleşsin)
    for (const e of s.events) this.onEvent(e);
    const me = s.me;
    const wasAlive = this.me.alive;
    this.me.alive = me.alive;
    this.me.protect = me.protect;
    this.me.respawnIn = me.respawnIn;
    if (me.hp !== this.me.hp) {
      this.me.hp = me.hp;
      P.health.hp = me.hp;
      g.hud.setHealth(me.hp, P.health.max);
    }
    if (wasAlive && !me.alive) this.onLocalDeath();
    if (me.alive && !P.alive) this.onLocalSpawnFallback();
    if (me.alive && me.state) this.reconcile(s.ackSeq, me.state);
    this.remotes.onSnapshot(s);
  }

  // --- Olaylar ---
  onEvent(e) {
    const g = this.game;
    switch (e.k) {
      case NEV.SHOT:
        this.remoteShot(e);
        break;
      case NEV.HIT: {
        const kill = !!(e.flags & 2);
        const head = !!(e.flags & 1);
        const kind = e.flags & 4 ? 'armor' : kill ? 'kill' : head ? 'head' : 'hit';
        g.events.emit('hitmarker', kind, kill && head);
        g.audio.hitmarker(head ? 'head' : kind === 'armor' ? 'armor' : kind);
        if (!(e.flags & 4)) {
          const from = g.player.pos;
          const n = { x: from.x - e.point.x, y: 0.2, z: from.z - e.point.z };
          const l = Math.hypot(n.x, n.y, n.z) || 1;
          g.effects.impact(e.point, { x: n.x / l, y: n.y / l, z: n.z / l }, 'flesh', 1);
          if (g.settings.damageNumbers) g.hud.damageNumber(e.point, e.dmg, head);
        }
        if (kill) g.stats.kills++;
        g.stats.hits++;
        break;
      }
      case NEV.DAMAGE: {
        const P = g.player;
        const ang = Math.atan2(e.from.x - P.pos.x, e.from.z - P.pos.z);
        g.events.emit('damageDir', ang);
        g.audio.hurt();
        P.shake(Math.min(0.5, Math.max(0.1, e.dmg / 60)));
        g.stats.damageTaken += e.dmg;
        break;
      }
      case NEV.KILL: {
        const killer = this.rosterOf(e.killer);
        const victim = this.rosterOf(e.victim);
        g.events.emit(EV.NET_KILL, { killer, victim, weapon: e.weapon, head: !!(e.flags & 1), mine: e.killer === this.slot, me: e.victim === this.slot });
        if (e.victim === this.slot) this.killedBy = killer;
        else this.remotes.onKilled(e.victim, e.killer === this.slot ? g.player.pos : this.remotes.posOf(e.killer));
        break;
      }
      case NEV.SPAWN:
        if (e.slot === this.slot) this.onLocalSpawn(e.pos, e.yaw);
        else this.remotes.onSpawn(e.slot, e.pos, e.yaw);
        break;
      case NEV.MELEE: {
        const p = this.remotes.posOf(e.slot);
        if (p) g.audio.mech('melee', p);
        break;
      }
      case NEV.RELOAD: {
        const p = this.remotes.posOf(e.slot);
        if (p) g.audio.mech('magOut', p);
        break;
      }
      case NEV.ROUND:
        g.events.emit(EV.NET_ROUND, e);
        break;
      default:
        break;
    }
  }

  rosterOf(slot) {
    if (slot === SLOT_NONE) return null;
    return this.roster.find((p) => p.slot === slot) || { slot, name: '?', tag: 0, side: SIDE.NONE, flags: 0 };
  }

  // Uzak atış: namludan isabet noktasına iz, ışık, ses; dünyaya çarptıysa kıvılcım/toz
  remoteShot(e) {
    const g = this.game;
    const d = this.remotes.weaponOf(e.slot);
    this.muzzle = this.muzzle || g.world.newVec();
    const muzzle = this.remotes.muzzleOf(e.slot, this.muzzle);
    if (!muzzle) return;
    const end = e.end;
    const surface = SURFACES[e.surface] || 'concrete';
    if (Math.hypot(end.x - muzzle.x, end.y - muzzle.y, end.z - muzzle.z) > 2) g.effects.tracer(muzzle, end, 380, 0.014);
    g.effects.flashLight(muzzle, 0xffb566, 10, 6, 0.05);
    g.audio.gunshot(d.sound, muzzle);
    if (e.hit === HIT_KIND.WORLD) {
      const n = { x: muzzle.x - end.x, y: muzzle.y - end.y, z: muzzle.z - end.z };
      const l = Math.hypot(n.x, n.y, n.z) || 1;
      g.effects.impact(end, { x: n.x / l, y: n.y / l, z: n.z / l }, surface, 0.7);
    } else if (e.hit === HIT_KIND.FLESH) {
      g.effects.impact(end, { x: 0, y: 1, z: 0 }, 'flesh', 0.8);
    }
  }

  onLocalDeath() {
    const g = this.game;
    const P = g.player;
    P.alive = false;
    P.deathT = 0;
    P.health.hp = 0;
    g.audio.hurt();
    g.events.emit(EV.NET_DEATH, { killer: this.killedBy });
  }

  onLocalSpawn(pos, yaw) {
    const g = this.game;
    const P = g.player;
    P.reset(g.world.newVec(pos.x, pos.y, pos.z), yaw);
    P.health.hp = ONLINE.hp;
    g.hud.setHealth(ONLINE.hp, P.health.max);
    g.weapons.reset(g.onlineLoadout());
    this.me.alive = true;
    this.me.hp = ONLINE.hp;
    this.killedBy = null;
    g.events.emit(EV.NET_SPAWN, { pos, yaw });
  }

  // Doğuş olayı kaçırıldıysa (yeniden bağlanma): sunucu kaydından kur
  onLocalSpawnFallback() {
    const P = this.game.player;
    P.alive = true;
    this.game.weapons.reset(this.game.onlineLoadout());
  }

  // --- Girdi (Player sabit tick döngüsünden) ---
  // Komutu ağ biçimine getir ve hareket modlarını doldur (adımdan önce)
  prepareCmd(cmd, W) {
    cmd.buttons &= ~(BTN.RELOAD | BTN.MELEE | BTN.NO_SPRINT | BTN.NO_ADS);
    const w = W.current;
    if (W.state === 'melee' || W.state === 'cooking' || W.state === 'throwing') cmd.buttons |= BTN.NO_SPRINT;
    if (!W.canAds) cmd.buttons |= BTN.NO_ADS;
    if (this.frozen || !this.game.player.alive) {
      cmd.moveX = cmd.moveY = 0;
      cmd.buttons &= BTN.CROUCH | BTN.ADS | BTN.NO_ADS | BTN.NO_SPRINT;
    }
    cmd.slot = Math.max(0, W.slots.indexOf(W.currentId));
    cmd.fireMode = w ? w.modeIdx : 0;
    quantizeCmd(cmd);
    return applyCmdMods(this.game.player.state.mods, cmd.buttons, w ? w.data : null);
  }

  // Adımdan sonra: komutu ve tahmin edilen durumu sakla, gönder
  commitCmd(cmd, state) {
    const seq = (this.seq + 1) & 0xffff;
    this.seq = seq;
    const e = this.hist[seq % HIST];
    e.seq = seq;
    e.buttons = cmd.buttons | this.pendingButtons;
    e.moveX = cmd.moveX;
    e.moveY = cmd.moveY;
    e.yaw = cmd.yaw;
    e.pitch = cmd.pitch;
    e.slot = cmd.slot;
    e.fireMode = cmd.fireMode;
    e.shots.length = 0;
    const n = Math.min(4, this.pendingShots.length);
    for (let i = 0; i < n; i++) e.shots.push(this.pendingShots.shift());
    e.viewTick = n ? this.shotViewTick : this.remotes.renderTick;
    this.pendingButtons = 0;
    saveState(e.st, state);
    this.out.push(e);
    if (this.out.length > ONLINE.inputRedundancy) this.out.shift();
    this.send(encodeInput(this.w, this.lastSnapTick, this.out));
  }

  // Silah sistemi bildirir
  onShot(dir) {
    if (this.pendingShots.length >= 8) return;
    this.pendingShots.push({ yaw: Math.atan2(-dir.x, -dir.z), pitch: Math.asin(Math.max(-1, Math.min(1, dir.y))) });
    this.shotViewTick = this.remotes.renderTick;
  }
  onReload() {
    this.pendingButtons |= BTN.RELOAD;
  }
  onMelee() {
    this.pendingButtons |= BTN.MELEE;
    this.shotViewTick = this.remotes.renderTick;
  }

  // --- Uzlaştırma ---
  reconcile(ack, srv) {
    const P = this.game.player;
    const st = P.state;
    const e = this.hist[ack % HIST];
    if (e.seq === ack && near(e.st, srv, ONLINE.reconcileEps)) {
      this.stats.predErr = Math.hypot(e.st.px - srv.pos.x, e.st.pz - srv.pos.z);
      return;
    }
    // Sunucu durumundan sonraki komutları yeniden oynat
    const t = this.tmp;
    t.pos.x = srv.pos.x;
    t.pos.y = srv.pos.y;
    t.pos.z = srv.pos.z;
    t.vel.x = srv.vel.x;
    t.vel.y = srv.vel.y;
    t.vel.z = srv.vel.z;
    t.crouchT = srv.crouchT;
    t.adsT = srv.adsT;
    t.sprintOut = srv.sprintOut;
    t.buttons = srv.buttons;
    t.grounded = srv.grounded;
    t.crouched = srv.crouched;
    t.sprinting = srv.sprinting;
    t.height = lerp(MOVEMENT.standHeight, MOVEMENT.crouchHeight, t.crouchT);
    const W = this.game.weapons;
    let s = (ack + 1) & 0xffff;
    const end = (this.seq + 1) & 0xffff;
    let n = 0;
    while (s !== end && n < HIST) {
      const h = this.hist[s % HIST];
      if (h.seq !== s) break;
      const id = W.slots[h.slot];
      applyCmdMods(t.mods, h.buttons, id ? WEAPONS[id] : null);
      stepPlayer(t, h, this.game.world, TICK_DT);
      saveState(h.st, t);
      s = (s + 1) & 0xffff;
      n++;
    }
    const dx = st.pos.x - t.pos.x;
    const dy = st.pos.y - t.pos.y;
    const dz = st.pos.z - t.pos.z;
    const err = Math.hypot(dx, dy, dz);
    this.stats.predErr = e.seq === ack ? Math.hypot(e.st.px - srv.pos.x, e.st.pz - srv.pos.z) : err;
    if (err > ONLINE.reconcileEps) this.stats.corrections++;
    // Görüntüdeki sıçrama yumuşatılır (büyükse ışınlanma: doğrudan)
    if (err < 2) {
      P.netCorr.x += dx;
      P.netCorr.y += dy;
      P.netCorr.z += dz;
    }
    P.prevPos.x -= dx;
    P.prevPos.y -= dy;
    P.prevPos.z -= dz;
    st.pos.x = t.pos.x;
    st.pos.y = t.pos.y;
    st.pos.z = t.pos.z;
    st.vel.x = t.vel.x;
    st.vel.y = t.vel.y;
    st.vel.z = t.vel.z;
    st.crouchT = t.crouchT;
    st.adsT = t.adsT;
    st.sprintOut = t.sprintOut;
    st.grounded = t.grounded;
    st.crouched = t.crouched;
    st.sprinting = t.sprinting;
    st.height = t.height;
    st.buttons = t.buttons;
  }

  // --- Her kare ---
  frame(dt) {
    const t = this.transport;
    if (!t || this.state === 'closed') return;
    t.pump();
    const now = performance.now();
    if (this.clock.due(now)) this.send(encodePing(this.w, now));
    // Aralama gecikmesi: iki görüntü aralığı + titreşim payı
    const want = Math.max(ONLINE.interpMinMs, Math.min(ONLINE.interpMaxMs, 2 * (1000 / 32) + this.clock.jitter * 2 + 20));
    this.interpMs += (want - this.interpMs) * Math.min(1, dt * 0.5);
    const renderTick = this.clock.serverTickNow(now) - (this.interpMs / 1000) * TICK_RATE;
    this.remotes.update(dt, renderTick);
    // Ölçüm pencereleri (son 5 sn; ping grafiği 3 sn)
    const S = this.stats;
    while (S.snapTimes.length && now - S.snapTimes[0] > 5000) S.snapTimes.shift();
    while (S.bytes.length && now - S.bytes[0][0] > 5000) S.bytes.shift();
    while (S.pings.length && now - S.pings[0][0] > ONLINE.graphPingSec * 1000) S.pings.shift();
  }

  // Maç süresi (kare kare geri sayar)
  get timeLeft() {
    if (!this.phaseLeft) return 0;
    return Math.max(0, this.phaseLeft - (performance.now() - this.phaseAt) / 1000);
  }

  // net_graph değerleri
  graph() {
    const S = this.stats;
    const t = this.transport;
    const now = performance.now();
    const win = (arr) => (arr.length ? Math.max(0.5, (now - (arr[0][0] ?? arr[0])) / 1000) : 1);
    const inKB = S.bytes.reduce((a, b) => a + b[1], 0) / 1024 / win(S.bytes);
    return {
      ping: Math.round(this.clock.rtt),
      jitter: Math.round(this.clock.jitter),
      offset: Math.round(this.clock.offset),
      snapHz: S.snapTimes.length / win(S.snapTimes.map((x) => [x])),
      inKB,
      outKB: t ? t.stats.bytesOut : 0,
      bufDepth: S.bufDepth,
      tickMs: S.tickUs / 1000,
      predErrCm: S.predErr * 100,
      corrections: S.corrections,
      interpMs: Math.round(this.interpMs),
      spikes: (t?.out.spikes || 0) + (t?.inn.spikes || 0),
      profile: this.profileName,
      pings: S.pings,
    };
  }
}

