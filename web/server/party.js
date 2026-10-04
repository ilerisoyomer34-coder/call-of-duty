// Parti ve davetler (bellekte): lider, en çok LIMITS.partyMax üye, seçili mod. Davet yalnız çevrim içi
// arkadaşa gider ve LIMITS.inviteMs içinde yanıtlanmazsa düşer. Bağlantısı kopan üye LIMITS.partyGraceMs
// bekler (sayfa yenileme partiyi bozmasın), sonra çıkarılır. Lider ayrılırsa liderlik en eski üyeye geçer.
import { randomBytes } from 'node:crypto';
import { LIMITS } from './limits.js';
import MODES from '../src/data/modes.json' with { type: 'json' };

export const MODE_IDS = MODES.modes.map((m) => m.id);

export class PartyManager {
  constructor(store, hub) {
    this.store = store;
    this.hub = hub;
    this.parties = new Map(); // parti kimliği → { id, leader, members: [id], mode }
    this.of = new Map(); // oyuncu → parti kimliği
    this.invites = new Map(); // davet kimliği → { id, from, to, expires }
    this.grace = new Map(); // oyuncu → zamanlayıcı
    hub.on('offline', (id) => this.onOffline(id));
    hub.on('online', (id) => this.onOnline(id));
  }

  partyOf(id) {
    const p = this.parties.get(this.of.get(id));
    return p || null;
  }

  view(p) {
    if (!p) return null;
    return {
      id: p.id,
      // Sürüm: her değişiklikte artar; istemci eski görünümü (geç gelen HTTP yanıtı) yenisinin üstüne yazmaz
      rev: p.rev,
      leader: p.leader,
      mode: p.mode,
      members: p.members.map((m) => ({ ...this.store.player(m), status: this.hub.statusOf(m) })),
    };
  }

  push(p) {
    p.rev++;
    const v = this.view(p);
    for (const m of p.members) this.hub.send(m, { t: 'party', party: v });
  }

  create(leader) {
    const p = { id: `pt_${randomBytes(8).toString('hex')}`, rev: 0, leader, members: [leader], mode: MODE_IDS[0] };
    this.parties.set(p.id, p);
    this.of.set(leader, p.id);
    return p;
  }

  // Davet: { ok, invite } ya da { error }
  invite(from, to, now = Date.now()) {
    if (from === to) return { error: 'self' };
    if (this.store.relation(from, to) !== 'friend') return { error: 'not_friend' };
    if (!this.hub.isOnline(to)) return { error: 'offline' };
    const mine = this.partyOf(from);
    if (mine && mine.members.includes(to)) return { error: 'already_member' };
    if (mine && mine.members.length >= LIMITS.partyMax) return { error: 'party_full' };
    for (const inv of this.invites.values()) if (inv.from === from && inv.to === to && inv.expires > now) return { error: 'already_invited' };
    const inv = { id: `iv_${randomBytes(8).toString('hex')}`, from, to, expires: now + LIMITS.inviteMs };
    this.invites.set(inv.id, inv);
    setTimeout(() => {
      if (!this.invites.delete(inv.id)) return;
      this.pruneSolo(from);
    }, LIMITS.inviteMs + 1000).unref?.();
    const p = mine || this.create(from);
    if (!mine) this.push(p);
    this.hub.send(to, { t: 'party_invite', invite: { id: inv.id, from: this.store.player(from), mode: p.mode, expiresIn: LIMITS.inviteMs } });
    return { ok: true, invite: { id: inv.id } };
  }

  respond(to, inviteId, accept, now = Date.now()) {
    const inv = this.invites.get(inviteId);
    if (!inv || inv.to !== to) return { error: 'no_invite' };
    this.invites.delete(inviteId);
    if (inv.expires < now) return { error: 'expired' };
    if (!accept) {
      this.hub.send(inv.from, { t: 'party_invite_declined', by: this.store.player(to) });
      this.pruneSolo(inv.from);
      return { ok: true };
    }
    // Davet edenin partisi (o arada dağıldıysa yeniden kurulur)
    let p = this.partyOf(inv.from);
    if (!p) p = this.create(inv.from);
    if (p.members.length >= LIMITS.partyMax) return { error: 'party_full' };
    if (!p.members.includes(to)) {
      this.leave(to);
      p.members.push(to);
      this.of.set(to, p.id);
    }
    this.push(p);
    return { ok: true, party: this.view(p) };
  }

  // Davet için kurulan tek kişilik parti, bekleyen davet kalmadıysa dağılır (boş panel asılı kalmasın)
  pruneSolo(leader) {
    const p = this.partyOf(leader);
    if (!p || p.members.length > 1) return;
    for (const inv of this.invites.values()) if (inv.from === leader) return;
    this.of.delete(leader);
    this.parties.delete(p.id);
    this.hub.send(leader, { t: 'party', party: null });
  }

  leave(id) {
    const p = this.partyOf(id);
    if (!p) return { ok: true };
    p.members = p.members.filter((m) => m !== id);
    this.of.delete(id);
    this.hub.send(id, { t: 'party', party: null });
    if (p.members.length <= 1) {
      // Tek kişilik parti dağılır
      for (const m of p.members) {
        this.of.delete(m);
        this.hub.send(m, { t: 'party', party: null });
      }
      this.parties.delete(p.id);
      return { ok: true };
    }
    if (p.leader === id) p.leader = p.members[0];
    this.push(p);
    return { ok: true };
  }

  kick(leader, id) {
    const p = this.partyOf(leader);
    if (!p || p.leader !== leader) return { error: 'not_leader' };
    if (!p.members.includes(id) || id === leader) return { error: 'not_member' };
    this.leave(id);
    return { ok: true };
  }

  setMode(leader, mode) {
    const p = this.partyOf(leader);
    if (!p) return { error: 'no_party' };
    if (p.leader !== leader) return { error: 'not_leader' };
    if (!MODE_IDS.includes(mode)) return { error: 'bad_mode' };
    p.mode = mode;
    this.push(p);
    return { ok: true };
  }

  onOffline(id) {
    if (!this.partyOf(id)) return;
    const p = this.partyOf(id);
    this.push(p); // üyeler onu çevrim dışı görsün
    const t = setTimeout(() => {
      this.grace.delete(id);
      if (!this.hub.isOnline(id)) this.leave(id);
    }, LIMITS.partyGraceMs);
    t.unref?.();
    this.grace.set(id, t);
  }

  onOnline(id) {
    const t = this.grace.get(id);
    if (t) {
      clearTimeout(t);
      this.grace.delete(id);
    }
    const p = this.partyOf(id);
    if (p) this.push(p);
  }

  closeAll() {
    for (const t of this.grace.values()) clearTimeout(t);
    this.grace.clear();
  }
}
