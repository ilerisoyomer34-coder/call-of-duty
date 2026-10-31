// Rekabetçi: ölen oyuncu raunt sonuna dek canlı bir takım arkadaşının gözünden izler (raunt içinde doğuş yok).
// Ölüm kamerasından COMP_VIEW.spectate.delaySec sonra başlar; ateş (sol tık / dokunmatikte ekrana dokunma) sıradaki
// arkadaşa geçer. Kamera izlenen oyuncunun aralanmış konumu ve bakışıyla (remotePlayers.js), modeli o sırada gizli
// (kafanın içi görünmesin). Yalnız görüntü: komut gönderilmez, maç sunucuda sürer.
import { COMP_VIEW } from '../config.js';
import { lerp } from '../../shared/sim/math.js';

const angleLerp = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

export class Spectator {
  constructor(game) {
    this.game = game;
    this.slot = -1;
    this.target = null;
    this.yaw = 0;
    this.pitch = 0;
    this.deadAt = 0;
    this.tapped = false;
  }

  // Ölüm anı (gameClient → NET_DEATH)
  onDeath() {
    this.deadAt = performance.now();
    this.slot = -1;
  }

  // Dokunmatikte ekrana dokunma sıradaki arkadaşa geçer
  tap() {
    this.tapped = true;
  }

  release() {
    if (this.target?.model) this.target.model.root.visible = true;
    this.target = null;
  }

  get active() {
    return !!this.target;
  }

  // Kamerayı izlenen arkadaşa koy; izlenecek kimse yoksa ya da oyuncu canlıysa null (normal kamera kalır)
  update(dt, input) {
    const g = this.game;
    const net = g.net;
    const S = COMP_VIEW.spectate;
    if (!net?.comp || g.player.alive || performance.now() - this.deadAt < S.delaySec * 1000) {
      this.release();
      return null;
    }
    const RP = net.remotes;
    const mates = [...RP.map.values()].filter((r) => r.alive && r.hasPose && r.model && RP.isFriendly(r.slot)).sort((a, b) => a.slot - b.slot);
    if (!mates.length) {
      this.release();
      return null;
    }
    let i = mates.findIndex((r) => r.slot === this.slot);
    const next = input.pressed('fire') || this.tapped;
    this.tapped = false;
    if (i < 0 || next) {
      i = (i + 1) % mates.length;
      const r = mates[i];
      this.slot = r.slot;
      this.yaw = r.yaw;
      this.pitch = r.pitch;
    }
    const r = mates[i];
    if (this.target && this.target !== r) this.target.model.root.visible = true;
    this.target = r;
    // Bakış yumuşak izler (ağ görüntüsü 32 Hz: ham değer titrer)
    const k = Math.min(1, dt * S.smooth);
    this.yaw = angleLerp(this.yaw, r.yaw, k);
    this.pitch += (r.pitch - this.pitch) * k;
    const cam = g.camera;
    cam.position.set(r.pos.x, r.pos.y + lerp(S.eye[0], S.eye[1], r.crouchT), r.pos.z);
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    r.model.root.visible = false;
    g.audio.setListener(cam.position.x, cam.position.y, cam.position.z, this.yaw);
    return r;
  }
}
