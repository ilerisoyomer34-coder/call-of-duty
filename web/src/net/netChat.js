// Çevrim içi maç iletişimi (M8; çok oyunculu belge §11): sohbet kutusu, telsiz çarkı, takım işaretleri, susturma.
//   - Sohbet: Y herkese, U ve Enter takıma (dokunmatikte SOHBET). Yazarken oyuncu durur, imleç serbest; Tab kanalı
//     değiştirir, Esc vazgeçer. Satırlar ONLINE.chat.fadeSec sonra solar (yazarken hepsi görünür). Takım satırı
//     "(TAKIM)", ölünün satırı "*ÖLÜ*", telsiz kalıbı "[Telsiz]" önekli; ad, tarafın rengi. Küfür süzgeci (Ayarlar →
//     "Sohbette küfür süzgeci", settings.chatFilter) yalnız okuyanın ekranında yıldızlar.
//   - Susturma: puan tablosunda oyuncunun satırına tıkla/dokun ya da "/sustur ad" (bu oturum boyunca; kalıpları da).
//   - Telsiz: T basılı (dokunmatikte TELSİZ) kalıp çarkı (commandWheel.js; oyun yavaşlamaz). Kalıp takıma gider;
//     takım arkadaşınınki telsiz sesiyle okunur (radioVoice).
//   - İşaret: Z nişangâhın baktığı yüzeye "buraya bak"; ONLINE.chat.markDoubleSec içinde ikinci basış "düşman
//     burada". Sunucu görüş hattıyla doğrular, takıma gider; dünyada uzaklıklı etiket ve radarda elmas, markSec sonra
//     kalkar. Adlar sunucudan geldiği için hep textContent.
import * as THREE from 'three';
import { EV } from '../events.js';
import { ONLINE } from '../config.js';
import { CHAT_FLAG, MARK_KIND, RADIO_LINES, radioWheel } from '../../shared/net/chat.js';
import { RF } from '../../shared/net/protocol.js';
import { maskProfanity, foldName } from '../../shared/names.js';
import { CommandWheel } from '../commandWheel.js';

const $ = (id) => document.getElementById(id);
const C = ONLINE.chat;
const MARK_HEIGHT = 0.4; // m: etiket yüzeyin bu kadar üstünde
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _v = new THREE.Vector3();
const _hit = { dist: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), surface: null, collider: null };

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export class NetChat {
  constructor(game, hud) {
    this.game = game;
    this.hud = hud; // MatchHud (imleç serbest bırakan pencereler: overlayOpen)
    this.net = null;
    this.active = false;
    this.open = false;
    this.team = true;
    this.lines = []; // { el, at }
    this.muted = new Set(); // oyuncu kimlikleri (bu oturum)
    this.marks = []; // { pos, kind, until, el, name }
    this.markPress = null; // çift basış beklemesi: { at, pos }
    this.root = $('mhChat');
    this.logEl = $('mhChatLog');
    this.form = $('mhChatForm');
    this.field = $('mhChatInput');
    this.chanEl = $('mhChatChan');
    this.field.maxLength = C.maxLen;
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submit();
    });
    this.field.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        this.setTeam(!this.team);
      }
    });
    $('btnNetChat').addEventListener('click', () => (this.open ? this.close() : this.openInput(true)));
    $('btnNetRadio').addEventListener('click', () => {
      if (this.wheel.open) this.wheel.close(false);
      else this.wheel.show(true);
    });
    this.comp = false;
    this.wheel = new CommandWheel(game, this.radioSpec(false));
    game.events.on(EV.NET_CHAT, (m) => this.onChat(m));
    game.events.on(EV.NET_MARK, (m) => this.onMark(m));
  }

  // Telsiz kalıp çarkı: muhatapsız (ortası kapatır), oyun yavaşlamaz, seçilen kalıp takıma
  radioSpec(comp) {
    return {
      id: 'netWheel',
      slices: radioWheel(comp).map((i) => ({ id: String(i), icon: RADIO_LINES[i].icon, label: RADIO_LINES[i].label })),
      addressees: null,
      center: 'TELSİZ',
      slowMo: false,
      hint: 'Fareyle kalıp seç · bırakınca takıma gider',
      touchHint: 'Kalıba dokun · ortası: kapat',
      canShow: () => this.active && this.net?.state === 'playing' && this.game.player.alive,
      apply: (id) => this.net?.sendRadio(Number(id)),
    };
  }

  start(net) {
    this.net = net;
    this.active = true;
    this.clear();
    // Rekabetçide bomba kalıpları
    const comp = net.welcome?.mode === 'competitive';
    if (comp !== this.comp) {
      this.comp = comp;
      this.wheel.setSlices(this.radioSpec(comp).slices);
    }
    this.root.hidden = false;
  }

  stop() {
    this.close();
    this.wheel.close(false);
    this.clear();
    this.active = false;
    this.net = null;
    this.root.hidden = true;
  }

  clear() {
    for (const l of this.lines) l.el.remove();
    this.lines = [];
    for (const m of this.marks) m.el.remove();
    this.marks = [];
    this.markPress = null;
  }

  // --- Sohbet ---
  setTeam(team) {
    // Tarafsız modda (ÖM) takım yok: herkese
    this.team = team && !!this.net?.remotes.sided;
    this.chanEl.textContent = this.team ? 'TAKIM' : 'HERKES';
    this.chanEl.className = `ncChan ${this.team ? 'team' : 'all'}`;
  }

  openInput(team) {
    const g = this.game;
    if (!this.active || this.net?.state !== 'playing' || this.hud.overlayOpen) return;
    this.open = true;
    this.setTeam(team);
    this.root.classList.add('typing');
    this.form.hidden = false;
    this.field.value = '';
    g.input.exitLock?.();
    this.field.focus();
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.form.hidden = true;
    this.root.classList.remove('typing');
    this.field.blur();
    const g = this.game;
    if (g.state === 'playing' && !g.input.touch.active && !this.hud.overlayOpen) g.input.requestLock?.();
  }

  submit() {
    const raw = this.field.value;
    // "/sustur ad": o oyuncunun satırları bu oturumda gizlenir (yeniden yazınca açılır)
    const mute = raw.trim().match(/^\/sustur\s+(.+)$/i);
    if (mute) this.toggleMuteByName(mute[1]);
    else this.net?.sendChat(raw, this.team);
    this.close();
  }

  playerOf(slot) {
    return this.net?.roster.find((p) => p.slot === slot) || null;
  }

  onChat(m) {
    const net = this.net;
    if (!this.active || !net) return;
    const p = this.playerOf(m.slot);
    if (p?.id && this.muted.has(p.id)) return;
    const radio = !!(m.flags & CHAT_FLAG.RADIO);
    const text = radio ? RADIO_LINES[m.radio]?.text : m.text;
    if (!text) return;
    const shown = !radio && this.game.settings.chatFilter !== false ? maskProfanity(text) : text;
    const row = el('div', 'ncLine');
    if (m.flags & CHAT_FLAG.DEAD) row.append(el('span', 'ncPre dead', '*ÖLÜ* '));
    if (radio) row.append(el('span', 'ncPre radio', '[Telsiz] '));
    else if (m.flags & CHAT_FLAG.TEAM && net.remotes.sided) row.append(el('span', 'ncPre team', '(TAKIM) '));
    const sided = net.remotes.sided;
    const who = m.slot === net.slot ? 'me' : sided ? (p?.side === net.mySide ? 'ally' : 'enemy') : 'other';
    row.append(el('b', `ncName ${who}`, p ? p.name : '?'), el('span', 'ncText', `: ${shown}`));
    this.logEl.append(row);
    this.lines.push({ el: row, at: performance.now(), id: p?.id || null });
    while (this.lines.length > C.keep) this.lines.shift().el.remove();
    const g = this.game;
    g.audio.uiClick?.();
    // Takım arkadaşının telsiz kalıbı telsiz sesiyle (kendi kalıbın okunmaz)
    if (radio && m.slot !== net.slot && g.settings.radioVoice !== false) g.radioVoice?.say(p?.name || 'Telsiz', text, { kind: 'ally' });
  }

  // --- Susturma ---
  isMuted(id) {
    return this.muted.has(id);
  }

  toggleMute(id) {
    if (!id) return false;
    if (this.muted.has(id)) this.muted.delete(id);
    else this.muted.add(id);
    const on = this.muted.has(id);
    // Susturulan oyuncunun ekrandaki satırları da kalkar
    if (on) {
      this.lines = this.lines.filter((l) => (l.id === id ? (l.el.remove(), false) : true));
      this.game.events.emit('message', 'OYUNCU SUSTURULDU', 'info');
    }
    this.hud.boardSig = '';
    return on;
  }

  toggleMuteByName(name) {
    const f = foldName(name.replace(/#\d+$/, '').trim());
    const p = this.net?.roster.find((r) => r.slot !== this.net.slot && !(r.flags & RF.BOT) && foldName(r.name) === f);
    if (p) this.toggleMute(p.id);
    else this.game.events.emit('message', 'OYUNCU BULUNAMADI', 'warn');
  }

  // --- İşaret ---
  // Nişangâhın baktığı yüzey (kameradan ışın, menzil sınırında); yoksa null
  aimPoint() {
    const g = this.game;
    g.camera.getWorldPosition(_o);
    g.camera.getWorldDirection(_d);
    const hit = g.world.raycast(_o, _d, C.markRange - 1, _hit);
    return hit ? { x: hit.point.x, y: hit.point.y, z: hit.point.z } : null;
  }

  // Z: ilk basış işareti bekletir; markDoubleSec içinde ikinci basış "düşman burada" olarak gönderir
  markPressed() {
    const net = this.net;
    if (!this.active || !net || !net.remotes.sided || !this.game.player.alive) return;
    const now = performance.now() / 1000;
    if (this.markPress && now - this.markPress.at < C.markDoubleSec) {
      net.sendMark(this.markPress.pos, MARK_KIND.ENEMY);
      this.markPress = null;
      return;
    }
    const pos = this.aimPoint();
    if (pos) this.markPress = { at: now, pos };
  }

  onMark(m) {
    const net = this.net;
    if (!this.active || !net) return;
    const p = this.playerOf(m.slot);
    if (p?.id && this.muted.has(p.id) && m.slot !== net.slot) return;
    const enemy = m.kind === MARK_KIND.ENEMY;
    const tag = el('div', `siteTag ncMark ${enemy ? 'enemy' : 'here'}`);
    tag.append(el('b', '', enemy ? 'DÜŞMAN' : 'İŞARET'), el('small', '', ''), el('i', '', p ? p.name : ''));
    this.game.hud.el.icons.appendChild(tag);
    this.marks.push({ pos: new THREE.Vector3(m.pos.x, m.pos.y, m.pos.z), kind: m.kind, until: performance.now() + C.markSec * 1000, el: tag });
    // Aynı anda en çok markShown işaret (eskisi kalkar)
    while (this.marks.length > C.markShown) this.marks.shift().el.remove();
    this.game.audio.beep?.(enemy ? 1200 : 1600, 0.07, 0.18);
  }

  update() {
    const now = performance.now();
    if (this.markPress && now / 1000 - this.markPress.at >= C.markDoubleSec) {
      this.net?.sendMark(this.markPress.pos, MARK_KIND.HERE);
      this.markPress = null;
    }
    // Eski satırlar solar (yazarken hepsi görünür)
    for (const l of this.lines) l.el.classList.toggle('old', !this.open && now - l.at > C.fadeSec * 1000);
  }

  // Dünyadaki işaret etiketleri (her kare): ekran dışındaysa gizli; süresi dolan kalkar
  updateTags(hud, width, height) {
    const now = performance.now();
    const P = this.game.player;
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const mk = this.marks[i];
      if (now > mk.until) {
        mk.el.remove();
        this.marks.splice(i, 1);
        continue;
      }
      _v.copy(mk.pos);
      _v.y += MARK_HEIGHT;
      const s = hud.project(_v, {});
      if (s.behind || s.x < 0 || s.x > width || s.y < 0 || s.y > height) {
        mk.el.hidden = true;
        continue;
      }
      mk.el.hidden = false;
      mk.el.children[1].textContent = `${Math.round(Math.hypot(mk.pos.x - P.pos.x, mk.pos.z - P.pos.z))} m`;
      mk.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
    }
  }

  // Radar: işaretler elmas (sarı / düşman kırmızı), menzil dışındaysa kenarda
  drawRadar(ctx, toMap, R) {
    if (!this.marks.length) return;
    const lim = R - 12;
    for (const mk of this.marks) {
      let [mx, mz] = toMap(mk.pos.x, mk.pos.z);
      const d = Math.hypot(mx, mz);
      if (d > lim) {
        mx = (mx / d) * lim;
        mz = (mz / d) * lim;
      }
      ctx.fillStyle = mk.kind === MARK_KIND.ENEMY ? '#ff5a3c' : '#ffd84a';
      ctx.beginPath();
      ctx.moveTo(mx, mz - 6);
      ctx.lineTo(mx + 5, mz);
      ctx.lineTo(mx, mz + 6);
      ctx.lineTo(mx - 5, mz);
      ctx.closePath();
      ctx.fill();
    }
  }
}
