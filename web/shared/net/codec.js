// İkili ileti kodlayıcı (çok oyunculu belge §6.2–6.4). Küçük uçlu (little-endian), sabit düzen; JSON yok.
// Nicemleme:
//   - bakış: yaw u16 (tam tur), pitch i16 (±π/2); analog hareket i8 (±127)
//   - uzak oyuncu konumu i16 (1/64 m, ±512 m), yatay hız i16 (1/128 m/s)
//   - yerel oyuncunun uzlaştırma kaydı f32 (simülasyon zaten 1/1024 m'ye nicemli: f32'de kayıpsız)
// Bozuk ya da kısa ileti istisna fırlatmaz, null döner (sunucu bozuk ileti sayacını artırır).
// Komutun bakış değerleri istemcide de bu nicemlemeden geçer (quantizeCmd): tahmin, sunucunun gördüğü
// girdiyle aynı sayılarla çalışır.
import { MSG, NEV, LIMITS } from './protocol.js';
import { QUANT } from '../constants.js';

const TAU = Math.PI * 2;
const HALF_PI = Math.PI / 2;
const POS_Q = 64;
const VEL_Q = 128;
const FRAC_Q = 1024;

const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: false });

// --- Nicemleme yardımcıları (istemci tahmini ve sunucu aynı değerleri kullanır) ---
export function encYaw(y) {
  const q = Math.round((y / TAU) * QUANT.yawSteps) % QUANT.yawSteps;
  return q < 0 ? q + QUANT.yawSteps : q;
}
export const decYaw = (q) => (q * TAU) / QUANT.yawSteps;
export function encPitch(p) {
  const q = Math.round((p / HALF_PI) * QUANT.pitchSteps);
  return q > QUANT.pitchSteps ? QUANT.pitchSteps : q < -QUANT.pitchSteps ? -QUANT.pitchSteps : q;
}
export const decPitch = (q) => (q * HALF_PI) / QUANT.pitchSteps;
export function encMove(v) {
  const q = Math.round(v * QUANT.move);
  return q > QUANT.move ? QUANT.move : q < -QUANT.move ? -QUANT.move : q;
}
export const decMove = (q) => q / QUANT.move;
const i16 = (v) => (v > 32767 ? 32767 : v < -32767 ? -32767 : v);
const encPos = (v) => i16(Math.round(v * POS_Q));
const decPos = (q) => q / POS_Q;

// Komutun ağda taşınan biçimine yuvarla (yerinde): istemci tahmini sunucuyla aynı girdiyi kullansın
export function quantizeCmd(cmd) {
  cmd.yaw = decYaw(encYaw(cmd.yaw));
  cmd.pitch = decPitch(encPitch(cmd.pitch));
  cmd.moveX = decMove(encMove(cmd.moveX));
  cmd.moveY = decMove(encMove(cmd.moveY));
  return cmd;
}

// --- Yazıcı / okuyucu ---
export class Writer {
  constructor(size = 1024) {
    this.buf = new Uint8Array(size);
    this.view = new DataView(this.buf.buffer);
    this.o = 0;
  }
  reset() {
    this.o = 0;
    return this;
  }
  ensure(n) {
    if (this.o + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.o + n) size *= 2;
    const nb = new Uint8Array(size);
    nb.set(this.buf.subarray(0, this.o));
    this.buf = nb;
    this.view = new DataView(nb.buffer);
  }
  u8(v) {
    this.ensure(1);
    this.view.setUint8(this.o, v);
    this.o += 1;
  }
  i8(v) {
    this.ensure(1);
    this.view.setInt8(this.o, v);
    this.o += 1;
  }
  u16(v) {
    this.ensure(2);
    this.view.setUint16(this.o, v, true);
    this.o += 2;
  }
  i16(v) {
    this.ensure(2);
    this.view.setInt16(this.o, v, true);
    this.o += 2;
  }
  u32(v) {
    this.ensure(4);
    this.view.setUint32(this.o, v >>> 0, true);
    this.o += 4;
  }
  f32(v) {
    this.ensure(4);
    this.view.setFloat32(this.o, v, true);
    this.o += 4;
  }
  f64(v) {
    this.ensure(8);
    this.view.setFloat64(this.o, v, true);
    this.o += 8;
  }
  // Uzunluk ön ekli UTF-8 (en çok 255 bayt; fazlası kesilir)
  str(s) {
    let b = enc.encode(String(s ?? ''));
    if (b.length > 255) b = b.subarray(0, 255);
    this.u8(b.length);
    this.ensure(b.length);
    this.buf.set(b, this.o);
    this.o += b.length;
  }
  // Gönderilecek kopya (tampon yeniden kullanılır; ağ katmanı veriyi sonra okuyabilir)
  bytes() {
    return this.buf.slice(0, this.o);
  }
}

class Short extends Error {}
const SHORT = new Short('short');

export class Reader {
  constructor(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    this.buf = u8;
    this.view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    this.o = 0;
  }
  need(n) {
    if (this.o + n > this.buf.length) throw SHORT;
  }
  get left() {
    return this.buf.length - this.o;
  }
  u8() {
    this.need(1);
    return this.view.getUint8(this.o++);
  }
  i8() {
    this.need(1);
    return this.view.getInt8(this.o++);
  }
  u16() {
    this.need(2);
    const v = this.view.getUint16(this.o, true);
    this.o += 2;
    return v;
  }
  i16() {
    this.need(2);
    const v = this.view.getInt16(this.o, true);
    this.o += 2;
    return v;
  }
  u32() {
    this.need(4);
    const v = this.view.getUint32(this.o, true);
    this.o += 4;
    return v;
  }
  f32() {
    this.need(4);
    const v = this.view.getFloat32(this.o, true);
    this.o += 4;
    return v;
  }
  f64() {
    this.need(8);
    const v = this.view.getFloat64(this.o, true);
    this.o += 8;
    return v;
  }
  str(max = 255) {
    const n = this.u8();
    if (n > max) throw SHORT;
    this.need(n);
    const s = dec.decode(this.buf.subarray(this.o, this.o + n));
    this.o += n;
    return s;
  }
}

// Çözme sarmalayıcısı: kısa/bozuk ileti → null; ileti sonunda fazla bayt da bozuk sayılır
function safe(bytes, fn) {
  try {
    const r = new Reader(bytes);
    const out = fn(r);
    if (!out || r.left !== 0) return null;
    return out;
  } catch {
    return null;
  }
}

// ============ İstemci → sunucu ============

export function encodeHello(w, h) {
  w.reset();
  w.u8(MSG.C_HELLO);
  w.u16(h.protocolVersion);
  w.str(h.buildHash);
  w.str(h.token);
  w.str(h.room);
  w.str(h.primary || '');
  w.str(h.secondary || '');
  return w.bytes();
}

// Komut kaydı: seq u16, buttons u16, moveX/moveY i8, yaw u16, pitch i16, weapon u8 (yuva | mod << 4),
// viewTick u32 (oyuncunun gördüğü sunucu zamanı, tick × 256), shots u8 + her atış (yaw u16, pitch i16)
function writeCmd(w, c) {
  w.u16(c.seq & 0xffff);
  w.u16(c.buttons & 0xffff);
  w.i8(encMove(c.moveX));
  w.i8(encMove(c.moveY));
  w.u16(encYaw(c.yaw));
  w.i16(encPitch(c.pitch));
  w.u8(((c.slot & 15) | ((c.fireMode & 15) << 4)) & 0xff);
  w.u32(Math.max(0, Math.round((c.viewTick || 0) * 256)));
  const shots = c.shots || [];
  const n = Math.min(shots.length, LIMITS.maxShotsPerCmd);
  w.u8(n);
  for (let i = 0; i < n; i++) {
    w.u16(encYaw(shots[i].yaw));
    w.i16(encPitch(shots[i].pitch));
  }
}

function readCmd(r) {
  const c = {
    seq: r.u16(),
    buttons: r.u16(),
    moveX: decMove(r.i8()),
    moveY: decMove(r.i8()),
    yaw: decYaw(r.u16()),
    pitch: decPitch(r.i16()),
    slot: 0,
    fireMode: 0,
    viewTick: 0,
    shots: [],
  };
  const sw = r.u8();
  c.slot = sw & 15;
  c.fireMode = sw >> 4;
  c.viewTick = r.u32() / 256;
  const n = r.u8();
  if (n > LIMITS.maxShotsPerCmd) throw SHORT;
  for (let i = 0; i < n; i++) c.shots.push({ yaw: decYaw(r.u16()), pitch: decPitch(r.i16()) });
  return c;
}

// cmds: en eskiden yeniye (en çok 3: önceki iki komut kayıp ileti telafisi)
export function encodeInput(w, ackTick, cmds) {
  w.reset();
  w.u8(MSG.C_INPUT);
  w.u32(ackTick);
  const n = Math.min(cmds.length, LIMITS.maxCmdsPerInput);
  w.u8(n);
  for (let i = cmds.length - n; i < cmds.length; i++) writeCmd(w, cmds[i]);
  return w.bytes();
}

export function encodePing(w, clientTime) {
  w.reset();
  w.u8(MSG.C_PING);
  w.f64(clientTime);
  return w.bytes();
}

export function encodeSimple(w, type) {
  w.reset();
  w.u8(type);
  return w.bytes();
}

export function decodeClient(bytes) {
  if (!bytes || bytes.length === 0 || bytes.length > LIMITS.maxClientBytes) return null;
  return safe(bytes, (r) => {
    const type = r.u8();
    switch (type) {
      case MSG.C_HELLO:
        return {
          type,
          protocolVersion: r.u16(),
          buildHash: r.str(LIMITS.maxStr),
          token: r.str(LIMITS.maxStr * 2),
          room: r.str(LIMITS.maxStr),
          primary: r.str(LIMITS.maxStr),
          secondary: r.str(LIMITS.maxStr),
        };
      case MSG.C_INPUT: {
        const ackTick = r.u32();
        const n = r.u8();
        if (n < 1 || n > LIMITS.maxCmdsPerInput) return null;
        const cmds = [];
        for (let i = 0; i < n; i++) cmds.push(readCmd(r));
        return { type, ackTick, cmds };
      }
      case MSG.C_PING:
        return { type, clientTime: r.f64() };
      case MSG.C_LOADED:
      case MSG.C_LEAVE:
        return { type };
      default:
        return null;
    }
  });
}

// ============ Sunucu → istemci ============

export function encodeWelcome(w, m) {
  w.reset();
  w.u8(MSG.S_WELCOME);
  w.u8(m.slot);
  w.u8(m.tickRate);
  w.u8(m.snapshotRate);
  w.u32(m.serverTick);
  w.f64(m.serverTime);
  w.str(m.room);
  w.str(m.mode);
  w.str(m.map);
  w.u16(m.timeLimit);
  w.u16(m.scoreLimit);
  w.str(m.primary);
  w.str(m.secondary);
  return w.bytes();
}

export function encodeRoster(w, players) {
  w.reset();
  w.u8(MSG.S_ROSTER);
  w.u8(players.length);
  for (const p of players) {
    w.u8(p.slot);
    w.str(p.id || '');
    w.str(p.name);
    w.u16(p.tag || 0);
    w.u8(p.side);
    w.u8(p.flags);
    w.u16(p.kills);
    w.u16(p.deaths);
    w.u16(Math.min(65535, p.score));
    w.u16(Math.min(65535, Math.round(p.ping || 0)));
    w.str(p.party || '');
  }
  return w.bytes();
}

export function encodePong(w, clientTime, serverTime, serverTick) {
  w.reset();
  w.u8(MSG.S_PONG);
  w.f64(clientTime);
  w.f64(serverTime);
  w.u32(serverTick);
  return w.bytes();
}

export function encodeError(w, code, detail = '') {
  w.reset();
  w.u8(MSG.S_ERROR);
  w.u8(code);
  w.str(detail);
  return w.bytes();
}

export function encodeMatchEnd(w, m) {
  w.reset();
  w.u8(MSG.S_MATCH_END);
  w.u8(m.winner);
  w.u8(m.reason);
  w.i16(m.scoreA);
  w.i16(m.scoreB);
  return w.bytes();
}

function writeVec16(w, v) {
  w.i16(encPos(v.x));
  w.i16(encPos(v.y));
  w.i16(encPos(v.z));
}
function readVec16(r) {
  return { x: decPos(r.i16()), y: decPos(r.i16()), z: decPos(r.i16()) };
}

function writeEvent(w, e) {
  w.u8(e.k);
  switch (e.k) {
    case NEV.SHOT:
      w.u8(e.slot);
      w.u8(e.weapon);
      writeVec16(w, e.end);
      w.u8(e.hit);
      w.u8(e.surface);
      break;
    case NEV.HIT:
      w.u8(e.victim);
      w.u8(Math.min(255, Math.round(e.dmg)));
      w.u8(e.flags);
      writeVec16(w, e.point);
      break;
    case NEV.DAMAGE:
      w.u8(e.attacker);
      w.u8(Math.min(255, Math.round(e.dmg)));
      w.i16(encPos(e.from.x));
      w.i16(encPos(e.from.z));
      break;
    case NEV.KILL:
      w.u8(e.killer);
      w.u8(e.victim);
      w.u8(e.weapon);
      w.u8(e.flags);
      break;
    case NEV.SPAWN:
      w.u8(e.slot);
      writeVec16(w, e.pos);
      w.u16(encYaw(e.yaw));
      break;
    case NEV.MELEE:
    case NEV.RELOAD:
      w.u8(e.slot);
      break;
    case NEV.ROUND:
      w.u8(e.code);
      w.u8(e.value);
      break;
    default:
      throw new Error(`bilinmeyen olay ${e.k}`);
  }
}

function readEvent(r) {
  const k = r.u8();
  switch (k) {
    case NEV.SHOT:
      return { k, slot: r.u8(), weapon: r.u8(), end: readVec16(r), hit: r.u8(), surface: r.u8() };
    case NEV.HIT:
      return { k, victim: r.u8(), dmg: r.u8(), flags: r.u8(), point: readVec16(r) };
    case NEV.DAMAGE: {
      const attacker = r.u8();
      const dmg = r.u8();
      return { k, attacker, dmg, from: { x: decPos(r.i16()), y: 0, z: decPos(r.i16()) } };
    }
    case NEV.KILL:
      return { k, killer: r.u8(), victim: r.u8(), weapon: r.u8(), flags: r.u8() };
    case NEV.SPAWN:
      return { k, slot: r.u8(), pos: readVec16(r), yaw: decYaw(r.u16()) };
    case NEV.MELEE:
    case NEV.RELOAD:
      return { k, slot: r.u8() };
    case NEV.ROUND:
      return { k, code: r.u8(), value: r.u8() };
    default:
      throw SHORT;
  }
}

/**
 * Anlık görüntü.
 * s = { tick, ackSeq, bufDepth, tickUs, phase, phaseLeft (sn), scoreA, scoreB,
 *       me: { alive, respawnIn, hp, protect, state? (yaşıyorsa uzlaştırma kaydı) },
 *       players: [{ slot, flags, pos, vel, yaw, pitch, crouchT, hp, weapon }], events: [...] }
 */
export function encodeSnapshot(w, s) {
  w.reset();
  w.u8(MSG.S_SNAPSHOT);
  w.u32(s.tick);
  w.u16(s.ackSeq & 0xffff);
  w.u8(Math.min(255, s.bufDepth));
  w.u16(Math.min(65535, Math.round(s.tickUs)));
  w.u8(s.phase);
  w.u16(Math.min(65535, Math.max(0, Math.round(s.phaseLeft * 10))));
  w.i16(s.scoreA);
  w.i16(s.scoreB);
  const me = s.me;
  w.u8((me.alive ? 1 : 0) | (me.state ? 2 : 0) | (me.protect ? 4 : 0));
  w.u8(Math.max(0, Math.min(255, Math.ceil(me.hp))));
  w.u16(Math.min(65535, Math.max(0, Math.round(me.respawnIn * 10))));
  if (me.state) {
    const st = me.state;
    w.f32(st.pos.x);
    w.f32(st.pos.y);
    w.f32(st.pos.z);
    w.f32(st.vel.x);
    w.f32(st.vel.y);
    w.f32(st.vel.z);
    w.u16(Math.round(st.crouchT * FRAC_Q));
    w.u16(Math.round(st.adsT * FRAC_Q));
    w.f32(st.sprintOut);
    w.u16(st.buttons & 0xffff);
    w.u8((st.grounded ? 1 : 0) | (st.crouched ? 2 : 0) | (st.sprinting ? 4 : 0));
  }
  w.u8(s.players.length);
  for (const p of s.players) {
    w.u8(p.slot);
    w.u8(p.flags);
    writeVec16(w, p.pos);
    w.i16(i16(Math.round(p.vel.x * VEL_Q)));
    w.i16(i16(Math.round(p.vel.z * VEL_Q)));
    w.u16(encYaw(p.yaw));
    w.i16(encPitch(p.pitch));
    w.u8(Math.round(p.crouchT * 255));
    w.u8(Math.max(0, Math.min(255, Math.ceil(p.hp))));
    w.u8(p.weapon);
  }
  const ev = s.events || [];
  const n = Math.min(255, ev.length);
  w.u8(n);
  for (let i = 0; i < n; i++) writeEvent(w, ev[i]);
  return w.bytes();
}

function readSnapshot(r, type) {
  const s = {
    type,
    tick: r.u32(),
    ackSeq: r.u16(),
    bufDepth: r.u8(),
    tickUs: r.u16(),
    phase: r.u8(),
    phaseLeft: r.u16() / 10,
    scoreA: r.i16(),
    scoreB: r.i16(),
    me: null,
    players: [],
    events: [],
  };
  const mf = r.u8();
  const me = { alive: !!(mf & 1), protect: !!(mf & 4), hp: r.u8(), respawnIn: r.u16() / 10, state: null };
  if (mf & 2) {
    const st = { pos: { x: r.f32(), y: r.f32(), z: r.f32() }, vel: { x: r.f32(), y: r.f32(), z: r.f32() } };
    st.crouchT = r.u16() / FRAC_Q;
    st.adsT = r.u16() / FRAC_Q;
    st.sprintOut = r.f32();
    st.buttons = r.u16();
    const f = r.u8();
    st.grounded = !!(f & 1);
    st.crouched = !!(f & 2);
    st.sprinting = !!(f & 4);
    me.state = st;
  }
  s.me = me;
  const n = r.u8();
  for (let i = 0; i < n; i++) {
    const slot = r.u8();
    const flags = r.u8();
    const pos = readVec16(r);
    const vel = { x: r.i16() / VEL_Q, y: 0, z: r.i16() / VEL_Q };
    s.players.push({ slot, flags, pos, vel, yaw: decYaw(r.u16()), pitch: decPitch(r.i16()), crouchT: r.u8() / 255, hp: r.u8(), weapon: r.u8() });
  }
  const ne = r.u8();
  for (let i = 0; i < ne; i++) s.events.push(readEvent(r));
  return s;
}

export function decodeServer(bytes) {
  if (!bytes || bytes.length === 0) return null;
  return safe(bytes, (r) => {
    const type = r.u8();
    switch (type) {
      case MSG.S_WELCOME:
        return {
          type,
          slot: r.u8(),
          tickRate: r.u8(),
          snapshotRate: r.u8(),
          serverTick: r.u32(),
          serverTime: r.f64(),
          room: r.str(),
          mode: r.str(),
          map: r.str(),
          timeLimit: r.u16(),
          scoreLimit: r.u16(),
          primary: r.str(),
          secondary: r.str(),
        };
      case MSG.S_SNAPSHOT:
        return readSnapshot(r, type);
      case MSG.S_ROSTER: {
        const n = r.u8();
        const players = [];
        for (let i = 0; i < n; i++) {
          players.push({ slot: r.u8(), id: r.str(), name: r.str(), tag: r.u16(), side: r.u8(), flags: r.u8(), kills: r.u16(), deaths: r.u16(), score: r.u16(), ping: r.u16(), party: r.str() });
        }
        return { type, players };
      }
      case MSG.S_PONG:
        return { type, clientTime: r.f64(), serverTime: r.f64(), serverTick: r.u32() };
      case MSG.S_ERROR:
        return { type, code: r.u8(), detail: r.str() };
      case MSG.S_MATCH_END:
        return { type, winner: r.u8(), reason: r.u8(), scoreA: r.i16(), scoreB: r.i16() };
      default:
        return null;
    }
  });
}
