// Çevrim içi sosyal katman (çok oyunculu S2–S3): kimlik, arkadaşlar, istekler, bildirimler, takım (kodda "party") ve davet.
// REST (fetch) + tek WebSocket. Sunucu adresi: ?server= adres parametresi › Ayarlar (Çevrim içi → Sunucu bağlantısı,
// davet bağlantısının ?sunucu= parametresi buraya yazılır) › config.js NET.serverUrl. Adres yoksa durum 'off'.
// Bağlanmadan önce /api/health okunur: oyun hesabı sunucunun kalıcı kimliğine bağlıdır (servers.js), ev sunucusunun
// tünel adresi değişse de ad#etiket ve arkadaşlar kalır. Bağlantı koparsa NET.reconnectSec aralıklarıyla yeniden
// denenir. Her değişiklik game.events'e (EV.*) yayılır; ekranlar (onlineScreen.js) yalnız olayları dinler.
import { NET } from '../config.js';
import { EV } from '../events.js';
import { displayName } from '../../shared/names.js';
import { saveSettings } from '../settings.js';
import { INVITE_PARAM, parseServerInput, probeServer, selectIdentity, rememberIdentity, forgetIdentity } from './servers.js';

// Sunucu hata kodları → oyuncuya gösterilen metin
export const ERRORS = {
  name_short: 'Ad çok kısa',
  name_long: 'Ad çok uzun',
  name_chars: 'Adda izin verilmeyen karakter var',
  name_letter: 'Adda en az bir harf olmalı',
  name_banned: 'Bu ad kullanılamaz',
  name_full: 'Bu ad için boş etiket kalmadı, başka bir ad dene',
  rate_limited: 'Çok hızlı: biraz bekleyip yeniden dene',
  unauthorized: 'Oturum geçersiz',
  query_short: `En az ${NET.searchMin} harf yaz`,
  self: 'Kendine istek gönderemezsin',
  not_found: 'Oyuncu bulunamadı',
  already_friends: 'Zaten arkadaşsınız',
  already_requested: 'İstek zaten gönderildi',
  friend_limit: 'Arkadaş sınırına ulaşıldı',
  no_request: 'İstek artık geçerli değil',
  not_friend: 'Yalnız arkadaşlarını davet edebilirsin',
  offline: 'Arkadaşın çevrim dışı',
  already_member: 'Zaten takımda',
  party_full: 'Takım dolu',
  already_invited: 'Davet zaten gönderildi',
  no_invite: 'Davet artık geçerli değil',
  expired: 'Davetin süresi doldu',
  not_leader: 'Bunu yalnız takım lideri yapabilir',
  bad_mode: 'Bu mod henüz açık değil',
  party_too_big: 'Takım bu mod için fazla kalabalık',
  no_party: 'Takım yok',
  network: 'Sunucuya ulaşılamadı',
  server: 'Sunucu hatası',
};
export const errorText = (code) => ERRORS[code] || 'Bir sorun oluştu';

export class SocialClient {
  constructor(game) {
    this.game = game;
    this.status = 'off'; // 'off' | 'connecting' | 'online' | 'error'
    this.reason = 'none';
    this.ws = null;
    this.retry = 0;
    this.timer = null;
    this.pingTimer = null;
    this.lists = { friends: [], incoming: [], outgoing: [] };
    this.notifications = [];
    this.invites = []; // gelen takım davetleri { id, from, mode, expires }
    this.party = null;
    this.queue = null; // maç arama { mode, since } (takımın tamamı için)
    this.presence = 'menu';
    this.stopped = true;
    this.info = null; // bağlı sunucunun /api/health bilgisi { name, online, serverId }
    game.events.on(EV.PROFILE_CHANGED, (p) => this.onProfileChanged(p));
  }

  // Davet bağlantısı (?sunucu=adres): adres Ayarlar'a yazılır (hatırlanır), parametre adres çubuğundan silinir
  // (yenileyince yeniden işlenmesin). → kaydedilen adres ya da ''
  consumeInvite() {
    let raw = '';
    try {
      raw = new URLSearchParams(location.search).get(INVITE_PARAM) || '';
    } catch {
      return '';
    }
    if (!raw) return '';
    try {
      const u = new URL(location.href);
      u.searchParams.delete(INVITE_PARAM);
      history.replaceState(history.state, '', u.pathname + (u.search === '?' ? '' : u.search) + u.hash);
    } catch {
      /* adres çubuğu değiştirilemedi */
    }
    const r = parseServerInput(raw);
    if (!r.ok) return '';
    this.game.settings.serverUrl = r.url;
    saveSettings(this.game.settings);
    return r.url;
  }

  // Oyuncunun yapıştırdığı bağlantıyla sunucu değiştir → { ok, url } | { ok: false, error }
  async useServer(text) {
    const r = parseServerInput(text);
    if (!r.ok) return r;
    this.game.settings.serverUrl = r.url;
    saveSettings(this.game.settings);
    await this.restart();
    return r;
  }

  get profile() {
    return this.game.save.data.profile;
  }

  // Adres önceliği: adres parametresi (test, geliştirme) › Ayarlar › derlenmiş varsayılan
  get serverUrl() {
    let u = '';
    try {
      u = new URLSearchParams(location.search).get('server') || '';
    } catch {
      /* adres yok */
    }
    return (u || this.game.settings.serverUrl || NET.serverUrl || '').replace(/\/+$/, '');
  }

  get myId() {
    return this.profile.id;
  }

  me() {
    const P = this.profile;
    return P.name ? displayName(P.name, P.tag) : '';
  }

  setStatus(status, reason = '') {
    this.status = status;
    this.reason = reason;
    this.game.events.emit(EV.SOCIAL_STATUS, { status, reason });
  }

  // Açılışta ve ad girilince: adres ve ad varsa sunucuyu tanı, kimlik al, bağlan
  async start() {
    this.stopped = false;
    clearTimeout(this.timer);
    if (!this.serverUrl) return this.setStatus('off', 'none');
    if (!this.profile.name) return this.setStatus('off', 'noname');
    this.setStatus('connecting');
    try {
      await this.identify();
      if (!this.profile.token) await this.register();
      this.connect();
    } catch (e) {
      this.fail(e.code || 'network');
    }
  }

  // Sunucu kapalıysa (bilgisayar kapalı, tünel adresi eskimiş) ağ hatası; açıksa hesabını yükle
  async identify() {
    const url = this.serverUrl;
    const info = await probeServer(url);
    if (url !== this.serverUrl) throw Object.assign(new Error('network'), { code: 'network' });
    if (!info) {
      this.info = null;
      throw Object.assign(new Error('network'), { code: 'network' });
    }
    this.info = info;
    if (info.serverId && this.profile.server !== info.serverId) this.game.save.update((d) => selectIdentity(d.profile, info.serverId), { now: true });
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    clearInterval(this.pingTimer);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('off', 'stopped');
  }

  // Sunucu adresi değişince yeniden bağlan. Hesap silinmez: identify() sunucunun kimliğine göre doğru hesabı
  // yükler (aynı ev sunucusunun yeni tünel adresiyse aynı hesap, başka sunucuysa onun hesabı ya da yenisi)
  async restart() {
    this.stop();
    this.info = null;
    this.retry = 0;
    this.lists = { friends: [], incoming: [], outgoing: [] };
    this.notifications = [];
    this.invites = [];
    this.party = null;
    this.queue = null;
    this.emitAll();
    await this.start();
  }

  fail(code) {
    this.setStatus('error', code);
    this.scheduleReconnect();
  }

  scheduleReconnect() {
    if (this.stopped) return;
    clearTimeout(this.timer);
    const steps = NET.reconnectSec;
    const sec = steps[Math.min(this.retry, steps.length - 1)];
    this.retry++;
    this.timer = setTimeout(() => this.start(), sec * 1000);
  }

  async register() {
    const r = await this.fetch('POST', '/api/session', { name: this.profile.name }, false);
    this.game.save.update((d) => {
      Object.assign(d.profile, { id: r.id, tag: r.tag, token: r.token, name: r.name });
      rememberIdentity(d.profile);
    }, { now: true });
    this.game.events.emit(EV.PROFILE_CHANGED, { name: r.name, tag: r.tag, fromServer: true });
  }

  async fetch(method, path, body, auth = true) {
    let res;
    try {
      res = await fetch(this.serverUrl + path, {
        method,
        headers: { 'content-type': 'application/json', ...(auth && this.profile.token ? { authorization: `Bearer ${this.profile.token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw Object.assign(new Error('network'), { code: 'network' });
    }
    let data = {};
    try {
      data = await res.json();
    } catch {
      /* gövdesiz */
    }
    if (!res.ok) {
      // Belirteç geçersiz (sunucu veritabanı sıfırlandı): yeni kimlik alınır
      if (res.status === 401 && auth) {
        this.game.save.update((d) => forgetIdentity(d.profile), { now: true });
        queueMicrotask(() => this.start());
      }
      throw Object.assign(new Error(data.error || 'server'), { code: data.error || 'server' });
    }
    return data;
  }

  connect() {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
    }
    const url = this.serverUrl.replace(/^http/, 'ws') + '/ws';
    let ws;
    try {
      ws = new WebSocket(url);
    } catch {
      return this.fail('network');
    }
    this.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', token: this.profile.token, status: this.presence }));
    ws.onmessage = (e) => {
      let m;
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      this.onMessage(m);
    };
    ws.onclose = (e) => {
      clearInterval(this.pingTimer);
      this.ws = null;
      if (e.code === 4001) {
        // Kimlik tanınmadı: yeniden kayıt
        this.game.save.update((d) => forgetIdentity(d.profile), { now: true });
      }
      if (!this.stopped) this.fail(this.status === 'online' ? 'lost' : 'network');
    };
  }

  onMessage(m) {
    const ev = this.game.events;
    switch (m.t) {
      case 'welcome':
        this.retry = 0;
        this.lists = { friends: m.friends || [], incoming: m.incoming || [], outgoing: m.outgoing || [] };
        this.notifications = m.notifications || [];
        this.party = m.party || null;
        this.queue = m.queue || null;
        // Sunucudaki ad/etiket esas (başka cihazdan değişmiş olabilir)
        if (m.me && (m.me.tag !== this.profile.tag || m.me.name !== this.profile.name)) {
          this.game.save.update((d) => {
            Object.assign(d.profile, { name: m.me.name, tag: m.me.tag, id: m.me.id });
            rememberIdentity(d.profile);
          }, { now: true });
          ev.emit(EV.PROFILE_CHANGED, { name: m.me.name, tag: m.me.tag, fromServer: true });
        }
        clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => this.send({ t: 'ping', at: Date.now() }), NET.pingSec * 1000);
        this.setStatus('online');
        this.emitAll();
        break;
      case 'friends':
        this.lists = { friends: m.friends || [], incoming: m.incoming || [], outgoing: m.outgoing || [] };
        ev.emit(EV.FRIENDS_CHANGED, this.lists);
        break;
      case 'presence': {
        const f = this.lists.friends.find((x) => x.id === m.id);
        if (f) {
          f.status = m.status;
          ev.emit(EV.FRIENDS_CHANGED, this.lists);
        }
        break;
      }
      case 'notification':
        this.notifications.unshift(m.n);
        ev.emit(EV.NOTIFICATION, { ...m.n, live: true });
        break;
      case 'friend_declined':
        ev.emit(EV.NOTIFICATION, { id: `d${Date.now()}`, kind: 'friend_declined', from: m.by, live: true });
        break;
      case 'party':
        this.applyParty(m.party);
        break;
      case 'party_invite': {
        const inv = { ...m.invite, expires: Date.now() + m.invite.expiresIn };
        this.invites = this.invites.filter((x) => x.from.id !== inv.from.id && x.expires > Date.now());
        this.invites.push(inv);
        ev.emit(EV.NOTIFICATION, { id: inv.id, kind: 'party_invite', from: inv.from, payload: inv, live: true });
        break;
      }
      case 'party_invite_declined':
        ev.emit(EV.NOTIFICATION, { id: `pd${Date.now()}`, kind: 'party_invite_declined', from: m.by, live: true });
        break;
      case 'queue':
        this.queue = m.queue || null;
        ev.emit(EV.QUEUE_CHANGED, { queue: this.queue });
        break;
      case 'match':
        // Eşleşme ya da takım liderinin açtığı deneme odası: oyun katılır (menüde) ya da kart gösterir
        this.queue = null;
        ev.emit(EV.QUEUE_CHANGED, { queue: null });
        ev.emit(EV.MATCH_FOUND, m.match);
        break;
      default:
        break;
    }
  }

  emitAll() {
    const ev = this.game.events;
    ev.emit(EV.FRIENDS_CHANGED, this.lists);
    ev.emit(EV.PARTY_CHANGED, { party: this.party });
    ev.emit(EV.QUEUE_CHANGED, { queue: this.queue });
    ev.emit(EV.NOTIFICATION, null);
  }

  send(msg) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  // Oyuncu menüde mi oyunda mı (arkadaşlar görür)
  setPresence(status) {
    this.presence = status;
    this.send({ t: 'status', status });
  }

  async onProfileChanged(p) {
    if (p?.fromServer) return;
    if (!this.profile.token) {
      if (this.status === 'off' && this.reason === 'noname' && !this.stopped) this.start();
      return;
    }
    try {
      const r = await this.fetch('PATCH', '/api/me', { name: p.name });
      this.game.save.update((d) => {
        Object.assign(d.profile, { name: r.name, tag: r.tag });
        rememberIdentity(d.profile);
      }, { now: true });
      this.game.events.emit(EV.PROFILE_CHANGED, { name: r.name, tag: r.tag, fromServer: true });
    } catch {
      /* çevrim dışı: bir sonraki bağlanışta sunucudaki ad esas alınır */
    }
  }

  // --- Eylemler (hata kodlu istisna fırlatır; ekran errorText ile gösterir) ---
  search(q) {
    return this.fetch('GET', `/api/players?q=${encodeURIComponent(q)}`).then((r) => r.players);
  }
  request(id) {
    return this.fetch('POST', '/api/friends/request', { id });
  }
  respond(id, accept) {
    return this.fetch('POST', '/api/friends/respond', { id, accept });
  }
  remove(id) {
    return this.fetch('POST', '/api/friends/remove', { id });
  }
  async markSeen() {
    if (!this.notifications.some((n) => !n.seen)) return;
    for (const n of this.notifications) n.seen = true;
    this.game.events.emit(EV.NOTIFICATION, null);
    await this.fetch('POST', '/api/notifications/seen', {}).catch(() => {});
  }
  invite(id) {
    return this.fetch('POST', '/api/party/invite', { id });
  }
  async respondInvite(inviteId, accept) {
    this.invites = this.invites.filter((x) => x.id !== inviteId);
    this.game.events.emit(EV.NOTIFICATION, null);
    const r = await this.fetch('POST', '/api/party/respond', { inviteId, accept });
    if (r.party) this.applyParty(r.party);
    return r;
  }

  // Takım görünümü: aynı takımın daha eski sürümü (geç işlenen HTTP yanıtı) yenisinin üstüne yazılmaz
  applyParty(party) {
    const cur = this.party;
    if (party && cur && party.id === cur.id && (party.rev ?? 0) < (cur.rev ?? 0)) return;
    this.party = party;
    this.game.events.emit(EV.PARTY_CHANGED, { party: this.party });
  }
  leaveParty() {
    return this.fetch('POST', '/api/party/leave', {});
  }
  kick(id) {
    return this.fetch('POST', '/api/party/kick', { id });
  }
  setMode(mode) {
    return this.fetch('POST', '/api/party/mode', { mode });
  }

  // --- Maç (S4–S6) ---
  // Deneme odası: lider (ya da takımsız oyuncu) açar; takım üyelerine sunucu bildirir, açan kendisi katılır
  async openSandbox() {
    const r = await this.fetch('POST', '/api/party/sandbox', {});
    this.game.events.emit(EV.MATCH_FOUND, r.match);
    return r;
  }
  async queueMatch(mode) {
    const r = await this.fetch('POST', '/api/match/queue', { mode });
    if (r.queue && !this.queue) {
      this.queue = r.queue;
      this.game.events.emit(EV.QUEUE_CHANGED, { queue: this.queue });
    }
    return r;
  }
  async cancelQueue() {
    const r = await this.fetch('POST', '/api/match/cancel', {});
    this.queue = null;
    this.game.events.emit(EV.QUEUE_CHANGED, { queue: null });
    return r;
  }

  // Rozet sayısı: yanıt bekleyen istekler + geçerli davetler + okunmamış bildirimler
  pendingCount() {
    const now = Date.now();
    const unseen = this.notifications.filter((n) => !n.seen && n.kind !== 'friend_request').length;
    return this.lists.incoming.length + this.invites.filter((x) => x.expires > now).length + unseen;
  }
}
