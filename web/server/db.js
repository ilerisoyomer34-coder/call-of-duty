// Kalıcı veri: Node'un yerleşik SQLite'ı (node:sqlite, yerel derleme gerektirmez).
// Oyuncular (ad + etiket + belirteç özeti), arkadaşlıklar ve bildirimler. Parti ve davetler bellekte (party.js).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes, randomInt, createHash } from 'node:crypto';
import { foldName, TAG_DIGITS } from '../shared/names.js';
import { LIMITS } from './limits.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_fold TEXT NOT NULL,
  tag TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  UNIQUE (name_fold, tag)
);
CREATE INDEX IF NOT EXISTS players_fold ON players (name_fold);
-- a < b (sıralı çift); bekleyen istekte requester isteği gönderen
CREATE TABLE IF NOT EXISTS friendships (
  a TEXT NOT NULL,
  b TEXT NOT NULL,
  status TEXT NOT NULL,
  requester TEXT NOT NULL,
  created INTEGER NOT NULL,
  PRIMARY KEY (a, b)
);
CREATE INDEX IF NOT EXISTS friendships_b ON friendships (b);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  from_id TEXT,
  payload TEXT,
  created INTEGER NOT NULL,
  seen INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS notifications_to ON notifications (to_id, seen);
-- Sunucunun kendi kalıcı değerleri (serverId: bir kez üretilir, veritabanı yaşadıkça aynı kalır)
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export const hashToken = (t) => createHash('sha256').update(String(t)).digest('hex');
const pair = (x, y) => (x < y ? [x, y] : [y, x]);
const pub = (r) => (r ? { id: r.id, name: r.name, tag: r.tag } : null);

export class Store {
  constructor(path) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.db.exec(SCHEMA);
    const q = (sql) => this.db.prepare(sql);
    this.q = {
      insertPlayer: q('INSERT INTO players (id, name, name_fold, tag, token_hash, created, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?)'),
      byToken: q('SELECT * FROM players WHERE token_hash = ?'),
      byId: q('SELECT * FROM players WHERE id = ?'),
      tagTaken: q('SELECT 1 FROM players WHERE name_fold = ? AND tag = ?'),
      rename: q('UPDATE players SET name = ?, name_fold = ?, tag = ? WHERE id = ?'),
      seen: q('UPDATE players SET last_seen = ? WHERE id = ?'),
      search: q("SELECT id, name, tag FROM players WHERE name_fold LIKE ? ESCAPE '\\' AND id != ? ORDER BY (name_fold = ?) DESC, last_seen DESC LIMIT ?"),
      searchTag: q("SELECT id, name, tag FROM players WHERE name_fold LIKE ? ESCAPE '\\' AND tag LIKE ? AND id != ? ORDER BY (name_fold = ?) DESC, last_seen DESC LIMIT ?"),
      getFriendship: q('SELECT * FROM friendships WHERE a = ? AND b = ?'),
      insertFriendship: q('INSERT INTO friendships (a, b, status, requester, created) VALUES (?, ?, ?, ?, ?)'),
      acceptFriendship: q("UPDATE friendships SET status = 'accepted', created = ? WHERE a = ? AND b = ?"),
      deleteFriendship: q('DELETE FROM friendships WHERE a = ? AND b = ?'),
      relationsOf: q('SELECT * FROM friendships WHERE a = ? OR b = ?'),
      countFriends: q("SELECT COUNT(*) AS n FROM friendships WHERE (a = ? OR b = ?) AND status = 'accepted'"),
      expire: q("DELETE FROM friendships WHERE status = 'pending' AND created < ?"),
      addNote: q('INSERT INTO notifications (to_id, kind, from_id, payload, created) VALUES (?, ?, ?, ?, ?)'),
      notes: q('SELECT * FROM notifications WHERE to_id = ? ORDER BY id DESC LIMIT ?'),
      seenNotes: q('UPDATE notifications SET seen = 1 WHERE to_id = ?'),
      trimNotes: q('DELETE FROM notifications WHERE to_id = ? AND id NOT IN (SELECT id FROM notifications WHERE to_id = ? ORDER BY id DESC LIMIT ?)'),
      getMeta: q('SELECT value FROM meta WHERE key = ?'),
      setMeta: q('INSERT INTO meta (key, value) VALUES (?, ?)'),
    };
    // Ev sunucusunun tünel adresi her açılışta değişir; oyun hesabı (profile.servers) bu kimliğe bağlanır
    this.serverId = this.q.getMeta.get('serverId')?.value;
    if (!this.serverId) {
      this.serverId = `s_${randomBytes(12).toString('hex')}`;
      this.q.setMeta.run('serverId', this.serverId);
    }
  }

  close() {
    this.db.close();
  }

  // Ad için boş rastgele etiket ("0042" gibi 4 hane)
  freeTag(fold, prefer = null) {
    if (prefer && !this.q.tagTaken.get(fold, prefer)) return prefer;
    const max = 10 ** TAG_DIGITS;
    for (let i = 0; i < LIMITS.tagTries; i++) {
      const t = String(randomInt(1, max)).padStart(TAG_DIGITS, '0');
      if (!this.q.tagTaken.get(fold, t)) return t;
    }
    return null;
  }

  createPlayer(name, now = Date.now()) {
    const fold = foldName(name);
    const tag = this.freeTag(fold);
    if (!tag) return null;
    const id = `p_${randomBytes(12).toString('hex')}`;
    const token = randomBytes(32).toString('base64url');
    this.q.insertPlayer.run(id, name, fold, tag, hashToken(token), now, now);
    return { id, name, tag, token };
  }

  playerByToken(token) {
    return token ? this.q.byToken.get(hashToken(token)) || null : null;
  }

  player(id) {
    return pub(this.q.byId.get(id));
  }

  touch(id, now = Date.now()) {
    this.q.seen.run(now, id);
  }

  // Ad değişir; katlanmış ad aynıysa etiket korunur, değilse aynı etiket boşsa o, yoksa yenisi
  rename(id, name) {
    const p = this.q.byId.get(id);
    if (!p) return null;
    const fold = foldName(name);
    const tag = fold === p.name_fold ? p.tag : this.freeTag(fold, p.tag);
    if (!tag) return null;
    this.q.rename.run(name, fold, tag, id);
    return { id, name, tag };
  }

  // Ada göre önek araması; "ad#12" etiketle daraltır
  search(selfId, q) {
    const [n, t] = String(q).split('#');
    const fold = foldName(n.trim()).replace(/[\\%_]/g, (c) => `\\${c}`);
    const lim = LIMITS.searchMax;
    if (t !== undefined && /^\d{1,4}$/.test(t.trim())) return this.q.searchTag.all(`${fold}%`, `${t.trim()}%`, selfId, foldName(n.trim()), lim);
    return this.q.search.all(`${fold}%`, selfId, foldName(n.trim()), lim);
  }

  friendship(x, y) {
    const [a, b] = pair(x, y);
    return this.q.getFriendship.get(a, b) || null;
  }

  // Bir oyuncunun tüm ilişkileri: arkadaşlar, gelen ve giden istekler
  relations(id) {
    const out = { friends: [], incoming: [], outgoing: [] };
    for (const r of this.q.relationsOf.all(id, id)) {
      const other = r.a === id ? r.b : r.a;
      const p = this.player(other);
      if (!p) continue;
      if (r.status === 'accepted') out.friends.push({ ...p, since: r.created });
      else if (r.requester === id) out.outgoing.push({ ...p, created: r.created });
      else out.incoming.push({ ...p, created: r.created });
    }
    return out;
  }

  relation(selfId, otherId) {
    const f = this.friendship(selfId, otherId);
    if (!f) return 'none';
    if (f.status === 'accepted') return 'friend';
    return f.requester === selfId ? 'outgoing' : 'incoming';
  }

  friendCount(id) {
    return this.q.countFriends.get(id, id).n;
  }

  request(from, to, now = Date.now()) {
    const [a, b] = pair(from, to);
    this.q.insertFriendship.run(a, b, 'pending', from, now);
  }

  accept(x, y, now = Date.now()) {
    const [a, b] = pair(x, y);
    this.q.acceptFriendship.run(now, a, b);
  }

  remove(x, y) {
    const [a, b] = pair(x, y);
    this.q.deleteFriendship.run(a, b);
  }

  expireRequests(now = Date.now()) {
    this.q.expire.run(now - LIMITS.requestExpireMs);
  }

  notify(to, kind, from, payload = null, now = Date.now()) {
    const r = this.q.addNote.run(to, kind, from, payload ? JSON.stringify(payload) : null, now);
    this.q.trimNotes.run(to, to, LIMITS.notificationKeep);
    return { id: Number(r.lastInsertRowid), kind, from: this.player(from), payload, created: now, seen: false };
  }

  notifications(to) {
    return this.q.notes.all(to, LIMITS.notificationKeep).map((n) => ({
      id: n.id,
      kind: n.kind,
      from: n.from_id ? this.player(n.from_id) : null,
      payload: n.payload ? JSON.parse(n.payload) : null,
      created: n.created,
      seen: !!n.seen,
    }));
  }

  markSeen(to) {
    this.q.seenNotes.run(to);
  }
}
