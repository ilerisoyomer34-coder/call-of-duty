// Bağlamsal işaret (Operasyon Güncellemesi §8.3, Z) ve dünya işaretleri (§8.6). Nişangâhın baktığı şeye göre:
//   düşman → saldır (kırmızı elmas) · yerdeki asker → en yakın sağlam asker gidip kaldırır ·
//   kapalı alan (tavan altı: oda, kapı) → bölgeyi temizle · zemin → oraya git (yerde halka).
// Z'ye kısa sürede iki kez basmak son işareti iptal eder: muhataplar takibe döner.
// İşaretler ışıksız (MeshBasic) basit şekillerdir: sahnedeki ışık sayısı değişmez.
import * as THREE from 'three';

const DOUBLE_TAP = 0.35; // iki basış arası (gerçek saniye)
const RING_SEC = 3; // "oraya git" halkasının görünme süresi
const DIAMOND_SEC = 8; // saldırı hedefi elmasının en uzun süresi
const ROOF_CHECK = 6; // noktanın üstünde bu yükseklikte tavan varsa kapalı alan sayılır (m)
const ASK_DIST = 120;

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _hit = {};
const _hit2 = {};

export class PingSystem {
  constructor(game) {
    this.game = game;
    this.lastT = -10;
    this.last = null; // { addressees }
    this.ring = null;
    this.diamond = null;
    this.ringT = 0;
    this.diamondT = 0;
    this.diamondTarget = null;
  }

  // İşaretleri o anki sahneye kur (sahne her görevde yeniden kurulur)
  ensure() {
    const scene = this.game.scene;
    if (!this.ring) {
      const geo = new THREE.RingGeometry(0.55, 0.75, 32);
      geo.rotateX(-Math.PI / 2);
      this.ring = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x7fd38a, transparent: true, opacity: 0.85, depthWrite: false }));
      this.ring.renderOrder = 3;
      this.diamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), new THREE.MeshBasicMaterial({ color: 0xff3b2e, transparent: true, opacity: 0.9, depthTest: false }));
      this.diamond.scale.y = 1.6;
      this.diamond.renderOrder = 6;
      this.ring.visible = this.diamond.visible = false;
    }
    if (this.ring.parent !== scene) {
      scene.add(this.ring, this.diamond);
    }
  }

  clear() {
    this.ringT = this.diamondT = 0;
    this.diamondTarget = null;
    if (this.ring) this.ring.visible = this.diamond.visible = false;
  }

  showRing(p) {
    this.ensure();
    this.ring.position.set(p.x, (p.y || 0) + 0.05, p.z);
    this.ring.visible = true;
    this.ringT = RING_SEC;
  }

  showDiamond(enemy) {
    this.ensure();
    this.diamondTarget = enemy;
    this.diamond.visible = true;
    this.diamondT = DIAMOND_SEC;
  }

  // Nişangâhın baktığı şey: { kind: 'enemy'|'downed'|'room'|'ground', enemy, ally, point }
  probe() {
    const g = this.game;
    g.camera.getWorldPosition(_o);
    g.camera.getWorldDirection(_d);
    const wh = g.world.raycast(_o, _d, ASK_DIST, _hit);
    const far = wh ? wh.dist : ASK_DIST;
    const eh = g.enemies.raycast(_o, _d, far);
    if (eh?.enemy?.alive) return { kind: 'enemy', enemy: eh.enemy, point: eh.enemy.pos.clone() };
    const ah = g.allies.raycast(_o, _d, far);
    if (ah?.ally?.down && !ah.ally.dead) return { kind: 'downed', ally: ah.ally, point: ah.ally.pos.clone() };
    // Yerdeki askere yakın bir yere bakılıyorsa da onu kastetmiştir (silindir dar)
    const point = wh ? wh.point.clone() : _o.clone().addScaledVector(_d, Math.min(far, 40));
    for (const a of g.allies.list) if (a.down && !a.dead && a.pos.distanceTo(point) < 1.5) return { kind: 'downed', ally: a, point: a.pos.clone() };
    point.y = Math.max(0, wh?.normal?.y > 0.5 ? point.y : 0);
    // Kapalı alan: noktanın biraz yukarısından tavana ışın
    _o.set(point.x, point.y + 0.5, point.z);
    const roof = g.world.raycast(_o, _up, ROOF_CHECK, _hit2);
    return { kind: roof ? 'room' : 'ground', point };
  }

  // Z: tek basış işaretler, çift basış son işareti iptal eder (gerçek saat; yavaşlatmadan etkilenmez)
  press() {
    const g = this.game;
    const now = performance.now() / 1000;
    if (now - this.lastT < DOUBLE_TAP && this.last) {
      this.lastT = -10;
      this.cancel();
      return;
    }
    this.lastT = now;
    const C = g.commands;
    const t = this.probe();
    const who = C.addressee;
    let cmd = null;
    if (t.kind === 'enemy') {
      cmd = C.issue('ATTACK', who, { target: t.enemy, inputMethod: 'ping' });
      if (cmd) this.showDiamond(t.enemy);
    } else if (t.kind === 'downed') {
      // En yakın sağlam asker yerdekine gider ve kaldırır (kaldırma işi mevcut ayıltma düzeninde)
      const helper = g.allies.list.filter((a) => !a.down && a !== t.ally).sort((a, b) => a.pos.distanceTo(t.point) - b.pos.distanceTo(t.point))[0];
      if (helper) {
        cmd = C.issue('MOVE_TO', helper.callsign, { pos: t.point, inputMethod: 'ping', sourceText: `${t.ally.callsign}'i kaldır!` });
        if (cmd) {
          helper.reviving = t.ally;
          helper.reviveT = 0;
          this.showRing(t.point);
        }
      }
    } else if (t.kind === 'room') {
      cmd = C.issue('CLEAR_AREA', who, { pos: t.point, inputMethod: 'ping' });
      if (cmd) this.showRing(t.point);
    } else {
      cmd = C.issue('MOVE_TO', who, { pos: t.point, inputMethod: 'ping' });
      if (cmd) this.showRing(t.point);
    }
    this.last = cmd ? { addressees: cmd.addressees } : null;
    return t.kind;
  }

  // Çift Z: son işaretin muhatapları takibe döner, işaretler kalkar
  cancel() {
    const g = this.game;
    if (!this.last) return;
    g.commands.issue('FOLLOW', this.last.addressees, { inputMethod: 'ping', sourceText: 'İşaret iptal, bana dönün!' });
    this.last = null;
    this.clear();
  }

  update(dt) {
    if (!this.ring) return;
    if (this.ringT > 0) {
      this.ringT -= dt;
      this.ring.material.opacity = 0.85 * Math.min(1, this.ringT / 0.6);
      this.ring.rotation.y += dt * 1.5;
      if (this.ringT <= 0) this.ring.visible = false;
    }
    if (this.diamondT > 0) {
      const e = this.diamondTarget;
      this.diamondT -= dt;
      if (!e || !e.alive || this.diamondT <= 0) {
        this.diamond.visible = false;
        this.diamondT = 0;
        this.diamondTarget = null;
      } else {
        this.diamond.position.set(e.pos.x, e.pos.y + 2.25 + Math.sin(this.diamondT * 5) * 0.06, e.pos.z);
        this.diamond.rotation.y += dt * 2.5;
      }
    }
  }
}
