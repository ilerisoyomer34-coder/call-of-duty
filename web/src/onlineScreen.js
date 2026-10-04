// Çevrim içi ekranı (çok oyunculu S2–S3): arkadaşlar, oyuncu arama, istekler, takım paneli ve oyunun her yerinde
// görünen bildirim kartları (arkadaşlık isteği, kabul, takım daveti). Veri social.js'ten, olaylarla gelir.
// Kullanıcı metni hep textContent ile yazılır (adlar sunucudan gelir, HTML olarak yorumlanmaz).
import { NET } from './config.js';
import { EV } from './events.js';
import { displayName } from '../shared/names.js';
import { errorText } from './net/social.js';
import { saveSettings } from './settings.js';
import MODES from './data/modes.json' with { type: 'json' };

const $ = (id) => document.getElementById(id);
const STATUS_TEXT = { menu: 'Menüde', playing: 'Oyunda', offline: 'Çevrim dışı' };
const modeName = (id) => MODES.modes.find((m) => m.id === id)?.name || id;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(text, fn, cls = 'btn small') {
  const b = el('button', cls, text);
  b.type = 'button';
  b.addEventListener('click', fn);
  return b;
}

// Satır: durum noktası, ad, etiket, durum metni, eylem düğmeleri
function row(p, statusText, actions = []) {
  const r = el('div', 'onRow');
  r.dataset.id = p.id;
  r.append(el('i', `dot ${p.status || 'offline'}`), el('span', 'nm', p.name), el('span', 'tg', `#${p.tag}`));
  if (statusText) r.append(el('span', 'st', statusText));
  const a = el('div', 'acts');
  for (const x of actions) a.append(x);
  r.append(a);
  return r;
}

export class OnlineScreen {
  constructor(game, menus) {
    this.game = game;
    this.menus = menus;
    this.social = game.social;
    this.tab = 'friends';
    this.results = [];
    this.searchTimer = null;
    this.confirmRemove = null;
    $('btnOnline').addEventListener('click', () => {
      game.audio.init();
      game.audio.uiClick();
      this.open();
    });
    for (const t of document.querySelectorAll('.onTab')) t.addEventListener('click', () => this.setTab(t.dataset.tab));
    $('onSearchForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.search(true);
    });
    $('onSearchInput').addEventListener('input', () => {
      clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => this.search(false), NET.searchDebounceMs);
    });
    $('btnOnRetry').addEventListener('click', () => this.social.start());
    $('btnPartyLeave').addEventListener('click', () => this.act(() => this.social.leaveParty(), 'Takımdan ayrıldın'));
    // Maç ara / iptal: takımda lider arar (üyeler iptal edebilir); takımsız oyuncu kendi seçtiği modla
    $('btnPartyFind').addEventListener('click', () => {
      const S = this.social;
      if (S.queue) this.act(() => S.cancelQueue(), 'Arama iptal edildi');
      else this.act(() => S.queueMatch(this.currentMode()));
    });
    $('btnSandbox').addEventListener('click', () => this.act(() => this.social.openSandbox()));
    const ev = game.events;
    ev.on(EV.QUEUE_CHANGED, () => this.renderParty());
    ev.on(EV.SOCIAL_STATUS, () => this.render());
    ev.on(EV.FRIENDS_CHANGED, () => this.render());
    ev.on(EV.PARTY_CHANGED, (e) => this.onParty(e?.party));
    ev.on(EV.PROFILE_CHANGED, () => this.renderHead());
    ev.on(EV.NOTIFICATION, (n) => {
      if (n) this.toast(n);
      this.renderBadges();
      if (this.isOpen) this.renderRequests();
    });
    this.render();
    // Kuyruk süresi saniyede bir (yalnız arama sürerken)
    setInterval(() => {
      if (this.social.queue && !$('partyPanel').hidden) this.renderQueue();
    }, 1000);
  }

  get isOpen() {
    return this.menus.current === 'onlineScreen';
  }

  open(tab) {
    if (tab) this.tab = tab;
    this.menus.show('onlineScreen');
    this.setTab(this.tab);
    this.render();
    this.social.markSeen();
  }

  setTab(tab) {
    this.tab = tab;
    for (const t of document.querySelectorAll('.onTab')) t.classList.toggle('on', t.dataset.tab === tab);
    for (const p of document.querySelectorAll('.onPane')) p.hidden = p.dataset.pane !== tab;
    if (tab === 'search' && !this.game.input.touch.active) setTimeout(() => $('onSearchInput').focus({ preventScroll: true }), 30);
    if (tab === 'requests') this.social.markSeen();
  }

  msg(text, kind = '') {
    const m = $('onMsg');
    m.textContent = text || '';
    m.className = `onMsg ${kind}`;
  }

  // Eylem: düğmeleri kilitlemeden çağır, hata ya da başarı satırı yaz
  async act(fn, okText) {
    try {
      const r = await fn();
      if (okText) this.msg(okText, 'good');
      return r;
    } catch (e) {
      this.msg(errorText(e.code), 'bad');
      return null;
    }
  }

  render() {
    this.renderHead();
    this.renderFriends();
    this.renderRequests();
    this.renderParty();
    this.renderBadges();
    if (this.results.length) this.renderResults();
  }

  renderHead() {
    const S = this.social;
    $('onMeName').textContent = S.me() || 'Adsız';
    const st = S.status;
    $('onDot').className = `dot ${st === 'online' ? 'online' : st}`;
    $('onState').textContent = st === 'online' ? 'çevrim içi' : st === 'connecting' ? 'bağlanıyor…' : st === 'error' ? 'bağlantı yok' : 'çevrim dışı';
    const off = $('onOff');
    off.hidden = st === 'online';
    let title = '';
    let text = '';
    let retry = false;
    if (st === 'off' && S.reason === 'noname') {
      title = 'Önce oyuncu adını gir.';
    } else if (st === 'off') {
      title = 'Sunucu henüz kurulmadı.';
      text = 'Arkadaşlar ve çevrim içi oyun, sunucu yayına alınınca açılacak. Adın ve tek oyunculu ilerlemen bu cihazda saklı.';
    } else if (st === 'connecting') {
      title = 'Sunucuya bağlanılıyor…';
    } else if (st === 'error') {
      title = 'Sunucuya ulaşılamadı.';
      text = S.reason === 'lost' ? 'Bağlantı koptu, yeniden deneniyor.' : 'Birkaç saniyede bir yeniden denenecek.';
      retry = true;
    }
    $('onOffTitle').textContent = title;
    $('onOffText').textContent = text;
    $('btnOnRetry').hidden = !retry;
    const sub = $('btnOnlineSub');
    if (sub) sub.textContent = st === 'online' ? `${S.lists.friends.filter((f) => f.status !== 'offline').length} arkadaş çevrim içi` : 'Arkadaşlar, istekler ve takım';
  }

  renderBadges() {
    const n = this.social.pendingCount();
    for (const id of ['onBadge', 'cntRequests']) {
      const b = $(id);
      b.hidden = !n;
      b.textContent = String(n);
    }
    $('cntFriends').textContent = this.social.lists.friends.length ? String(this.social.lists.friends.length) : '';
  }

  renderFriends() {
    const box = $('onFriends');
    box.textContent = '';
    const S = this.social;
    if (S.status !== 'online') return;
    const list = [...S.lists.friends].sort((a, b) => (a.status === 'offline') - (b.status === 'offline') || a.name.localeCompare(b.name, 'tr'));
    if (!list.length) {
      box.append(el('div', 'onEmpty', 'Henüz arkadaşın yok. "Oyuncu ara" sekmesinden arkadaşının adını yazıp istek gönder.'));
      return;
    }
    const inParty = new Set(S.party?.members.map((m) => m.id) || []);
    for (const f of list) {
      const acts = [];
      if (f.status !== 'offline' && !inParty.has(f.id)) acts.push(button('Davet et', () => this.act(() => this.social.invite(f.id), `${f.name} takıma davet edildi`)));
      if (inParty.has(f.id)) acts.push(el('span', 'st', 'Takımda'));
      const sure = this.confirmRemove === f.id;
      acts.push(
        button(sure ? 'Emin misin?' : 'Çıkar', () => {
          if (!sure) {
            this.confirmRemove = f.id;
            this.renderFriends();
            return;
          }
          this.confirmRemove = null;
          this.act(() => this.social.remove(f.id), `${f.name} arkadaşlıktan çıkarıldı`);
        })
      );
      box.append(row(f, STATUS_TEXT[f.status] || '', acts));
    }
  }

  async search(force) {
    const q = $('onSearchInput').value.trim();
    if (this.social.status !== 'online') return;
    if (q.replace('#', '').length < NET.searchMin) {
      if (force) this.msg(errorText('query_short'), 'bad');
      this.results = [];
      $('onResults').textContent = '';
      return;
    }
    const r = await this.act(() => this.social.search(q));
    if (!r) return;
    this.results = r;
    this.msg(r.length ? '' : 'Bu adla oyuncu bulunamadı');
    this.renderResults();
  }

  // Arama sonuçları ilişkiye göre: istek gönder / gönderildi · iptal / kabul et · reddet / arkadaşsın
  renderResults() {
    const box = $('onResults');
    box.textContent = '';
    const S = this.social;
    const rel = (p) => {
      if (S.lists.friends.some((f) => f.id === p.id)) return 'friend';
      if (S.lists.outgoing.some((f) => f.id === p.id)) return 'outgoing';
      if (S.lists.incoming.some((f) => f.id === p.id)) return 'incoming';
      return 'none';
    };
    for (const p of this.results) {
      const r = rel(p);
      const acts = [];
      if (r === 'none') acts.push(button('İstek gönder', () => this.act(() => S.request(p.id), `${displayName(p.name, p.tag)} kişisine istek gönderildi`), 'btn small primary'));
      else if (r === 'outgoing') {
        const sent = el('span', 'st', 'İstek gönderildi');
        acts.push(sent, button('İptal', () => this.act(() => S.remove(p.id), 'İstek geri alındı')));
      } else if (r === 'incoming') {
        acts.push(button('Kabul et', () => this.act(() => S.respond(p.id, true), `${p.name} ile artık arkadaşsınız`), 'btn small primary'), button('Reddet', () => this.act(() => S.respond(p.id, false), 'İstek reddedildi')));
      } else acts.push(el('span', 'st', 'Arkadaşsın'));
      box.append(row(p, STATUS_TEXT[p.status] || '', acts));
    }
  }

  renderRequests() {
    const box = $('onRequests');
    box.textContent = '';
    const S = this.social;
    if (S.status !== 'online') return;
    const now = Date.now();
    const invites = S.invites.filter((x) => x.expires > now);
    for (const inv of invites) {
      box.append(row({ ...inv.from, status: 'menu' }, `Takım daveti · ${modeName(inv.mode)}`, [button('Katıl', () => this.act(() => S.respondInvite(inv.id, true), 'Takıma katıldın'), 'btn small primary'), button('Reddet', () => this.act(() => S.respondInvite(inv.id, false)))]));
    }
    for (const p of S.lists.incoming) {
      box.append(row({ ...p, status: 'offline' }, 'Arkadaşlık isteği', [button('Kabul et', () => this.act(() => S.respond(p.id, true), `${p.name} ile artık arkadaşsınız`), 'btn small primary'), button('Reddet', () => this.act(() => S.respond(p.id, false), 'İstek reddedildi'))]));
    }
    for (const p of S.lists.outgoing) {
      box.append(row({ ...p, status: 'offline' }, 'Yanıt bekleniyor', [button('İptal', () => this.act(() => S.remove(p.id), 'İstek geri alındı'))]));
    }
    // Son bildirimler (kabul edilen istekler)
    for (const n of S.notifications.filter((x) => x.kind === 'friend_accepted' && x.from).slice(0, 5)) {
      box.append(row({ ...n.from, status: 'offline' }, 'isteğini kabul etti'));
    }
    if (!box.children.length) box.append(el('div', 'onEmpty', 'Bekleyen istek ya da davet yok.'));
  }

  onParty(party) {
    const before = this.lastPartyId;
    this.lastPartyId = party?.id || null;
    if (party && party.id !== before && party.leader !== this.social.myId) this.toast({ id: `pj${party.id}`, kind: 'party_joined', live: true, payload: party });
    this.renderParty();
    this.renderFriends();
  }

  // Takımda mod liderin seçimi; takımsızken oyuncunun kendi seçimi (ayar)
  currentMode() {
    const S = this.social;
    if (S.party) return S.party.mode;
    const m = this.game.settings.onlineMode;
    return MODES.modes.some((x) => x.id === m && x.available) ? m : MODES.modes.find((x) => x.available)?.id || MODES.modes[0].id;
  }

  setSoloMode(id) {
    this.game.settings.onlineMode = id;
    saveSettings(this.game.settings);
    this.renderParty();
  }

  // Oyun paneli: çevrim içiyken hep görünür. Takımdaysa üyeler, modu lider seçer; takımsızken tek başına
  renderParty() {
    const S = this.social;
    const online = S.status === 'online';
    $('partyPanel').hidden = !online;
    if (!online) return;
    const p = S.party;
    const leader = !p || p.leader === S.myId;
    const modeId = this.currentMode();
    $('ppTitle').textContent = p ? 'Takım' : 'Oyna';
    $('ppCount').textContent = p ? `${p.members.length} kişi · ${modeName(p.mode)}` : `Tek başına · ${modeName(modeId)}`;
    const box = $('ppMembers');
    box.textContent = '';
    if (p) {
      for (const m of p.members) {
        const acts = [];
        if (m.id === p.leader) acts.push(el('span', 'st', '★ Lider'));
        if (leader && m.id !== S.myId) acts.push(button('Çıkar', () => this.act(() => S.kick(m.id))));
        box.append(row(m, m.id === S.myId ? 'sen' : STATUS_TEXT[m.status] || '', acts));
      }
    }
    box.hidden = !p;
    const modes = $('ppModes');
    modes.textContent = '';
    for (const md of MODES.modes) {
      const b = el('button', `ppMode${md.id === modeId ? ' on' : ''}`);
      b.type = 'button';
      b.dataset.mode = md.id;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(md.id === modeId));
      b.append(document.createTextNode(md.name), el('small', '', `${md.players} · ${md.available ? 'hazır' : 'yakında'}`));
      b.disabled = !leader || !!S.queue;
      b.addEventListener('click', () => (p ? this.act(() => S.setMode(md.id)) : this.setSoloMode(md.id)));
      modes.append(b);
    }
    const mode = MODES.modes.find((m) => m.id === modeId);
    const find = $('btnPartyFind');
    find.textContent = S.queue ? 'İptal' : 'Maç ara';
    find.disabled = S.queue ? false : !(leader && mode?.available);
    $('btnSandbox').disabled = !leader || !!S.queue;
    $('btnPartyLeave').hidden = !p;
    this.renderQueue();
    $('ppNote').textContent = mode?.available
      ? leader
        ? `"Maç ara": karışık oyuncularla eşleşirsin${p ? 'iz; takımın aynı tarafta' : ''}, eksik yerleri yapay zekâ doldurur. "Deneme odası": ${p ? 'takımınla' : 'tek başına'} serbest atış alanı.`
        : 'Maçı ve deneme odasını takım lideri başlatır.'
      : `${mode?.name || 'Bu mod'} çok yakında. Şimdilik Takım Ölüm Maçı, Ölüm Maçı ve Co-op hazır.`;
  }

  renderQueue() {
    const q = this.social.queue;
    $('ppQueue').hidden = !q;
    if (!q) return;
    const sec = Math.max(0, Math.floor((Date.now() - q.since) / 1000));
    $('ppQueueText').textContent = `Maç aranıyor · ${modeName(q.mode)} · ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  }

  // --- Bildirim kartları (menüde ve görevde) ---
  toast(n) {
    const S = this.social;
    const box = $('socialToasts');
    const who = n.from ? displayName(n.from.name, n.from.tag) : '';
    const t = el('div', 'sToast');
    const text = el('div');
    const strong = (s) => el('b', '', s);
    const acts = el('div', 'row');
    let action = false;
    const close = () => t.remove();
    switch (n.kind) {
      case 'friend_request':
        text.append(strong(who), document.createTextNode(' arkadaşlık isteği gönderdi'));
        acts.append(
          button('Kabul et', async () => {
            close();
            await this.act(() => S.respond(n.from.id, true), `${n.from.name} ile artık arkadaşsınız`);
          }, 'btn small primary'),
          button('Reddet', async () => {
            close();
            await this.act(() => S.respond(n.from.id, false));
          })
        );
        action = true;
        break;
      case 'friend_accepted':
        text.append(strong(who), document.createTextNode(' arkadaşlık isteğini kabul etti'));
        break;
      case 'friend_declined':
        text.append(strong(who), document.createTextNode(' arkadaşlık isteğini reddetti'));
        break;
      case 'party_invite':
        text.append(strong(who), document.createTextNode(` seni takımına çağırıyor · ${modeName(n.payload?.mode)}`));
        acts.append(
          button('Katıl', async () => {
            close();
            await this.act(() => S.respondInvite(n.payload.id, true), 'Takıma katıldın');
          }, 'btn small primary'),
          button('Reddet', async () => {
            close();
            await this.act(() => S.respondInvite(n.payload.id, false));
          })
        );
        action = true;
        break;
      case 'party_invite_declined':
        text.append(strong(who), document.createTextNode(' takım davetini reddetti'));
        break;
      case 'party_joined':
        text.append(document.createTextNode('Takıma katıldın · '), strong(modeName(n.payload?.mode)));
        break;
      case 'match_found': {
        const m = n.payload;
        text.append(strong(m.kind === 'sandbox' ? 'Deneme odası açıldı' : 'Maç bulundu'), document.createTextNode(` · ${m.kind === 'sandbox' ? 'takımın bekliyor' : modeName(m.mode)}`));
        acts.append(
          button('Katıl', () => {
            close();
            this.game.joinMatch(m);
          }, 'btn small primary')
        );
        action = true;
        break;
      }
      default:
        return;
    }
    // Kayıttan gelen eski bildirim kart olarak açılmaz; yalnız rozet ve İstekler sekmesi
    if (!n.live) return;
    t.dataset.kind = n.kind;
    t.append(text);
    if (action) t.append(acts);
    box.prepend(t);
    while (box.children.length > NET.toastMax) box.lastElementChild.remove();
    setTimeout(close, (action ? NET.toastActionSec : NET.toastSec) * 1000);
  }
}
