// Geliştirici görünümü: sunucunun göreceği basitleştirilmiş vuruş kutuları (shared/sim/hitboxes.js) tel kafes.
// Konsol "sv_showhitboxes 1". Görsel model ile poz arasındaki uyumsuzluk böylece hemen görülür (belge §5.4).
// Tek LineSegments, sabit boyutlu tampon (her kare ayırma yok); ışıksız malzeme, ışık sayısı değişmez.
import * as THREE from 'three';
import { MOVEMENT as M } from './config.js';
import { createHitboxes, hitboxesFor } from '../shared/sim/hitboxes.js';

const SEG = 12; // çember parça sayısı
const MAX_ACTORS = 64;
// Aktör başına çizgi parçası: baş 3 çember, 5 kapsül (2 çember + 4 kenar), karın kutusu 12 kenar
const SEGS_PER_ACTOR = 3 * SEG + 5 * (2 * SEG + 4) + 12;
const COLORS = { head: [1, 0.25, 0.25], torso: [1, 0.85, 0.2], limb: [0.3, 0.8, 1] };

export class HitboxDebug {
  constructor(game) {
    this.game = game;
    this.on = false;
    this.boxes = createHitboxes();
    const n = MAX_ACTORS * SEGS_PER_ACTOR * 2;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.85, fog: false }));
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 999;
    this.pose = { pos: null, yaw: 0, pitch: 0, height: M.standHeight };
    this.v = 0;
  }

  set(on) {
    this.on = on;
    this.lines.visible = on;
    if (!on && this.lines.parent) this.lines.parent.remove(this.lines);
  }

  vert(x, y, z, c) {
    const i = this.v * 3;
    this.pos[i] = x;
    this.pos[i + 1] = y;
    this.pos[i + 2] = z;
    this.col[i] = c[0];
    this.col[i + 1] = c[1];
    this.col[i + 2] = c[2];
    this.v++;
  }

  line(a, b, c) {
    this.vert(a.x, a.y, a.z, c);
    this.vert(b.x, b.y, b.z, c);
  }

  // u, w: çember düzlemini geren birim vektörler
  circle(cx, cy, cz, r, ux, uy, uz, wx, wy, wz, c) {
    for (let i = 0; i < SEG; i++) {
      const a0 = (i / SEG) * Math.PI * 2;
      const a1 = ((i + 1) / SEG) * Math.PI * 2;
      const c0 = Math.cos(a0) * r;
      const s0 = Math.sin(a0) * r;
      const c1 = Math.cos(a1) * r;
      const s1 = Math.sin(a1) * r;
      this.vert(cx + ux * c0 + wx * s0, cy + uy * c0 + wy * s0, cz + uz * c0 + wz * s0, c);
      this.vert(cx + ux * c1 + wx * s1, cy + uy * c1 + wy * s1, cz + uz * c1 + wz * s1, c);
    }
  }

  drawShape(s) {
    const c = COLORS[s.zone];
    if (s.type === 'sphere') {
      const { x, y, z } = s.a;
      this.circle(x, y, z, s.r, 1, 0, 0, 0, 1, 0, c);
      this.circle(x, y, z, s.r, 1, 0, 0, 0, 0, 1, c);
      this.circle(x, y, z, s.r, 0, 1, 0, 0, 0, 1, c);
    } else if (s.type === 'capsule') {
      let ax = s.b.x - s.a.x;
      let ay = s.b.y - s.a.y;
      let az = s.b.z - s.a.z;
      const l = Math.hypot(ax, ay, az) || 1;
      ax /= l;
      ay /= l;
      az /= l;
      // Eksene dik iki yön
      let ux = Math.abs(ay) > 0.9 ? 1 : 0;
      let uy = Math.abs(ay) > 0.9 ? 0 : 1;
      let uz = 0;
      let wx = ay * uz - az * uy;
      let wy = az * ux - ax * uz;
      let wz = ax * uy - ay * ux;
      const wl = Math.hypot(wx, wy, wz) || 1;
      wx /= wl;
      wy /= wl;
      wz /= wl;
      ux = wy * az - wz * ay;
      uy = wz * ax - wx * az;
      uz = wx * ay - wy * ax;
      const r = s.r;
      this.circle(s.a.x, s.a.y, s.a.z, r, ux, uy, uz, wx, wy, wz, c);
      this.circle(s.b.x, s.b.y, s.b.z, r, ux, uy, uz, wx, wy, wz, c);
      for (const [px, py, pz] of [
        [ux, uy, uz],
        [-ux, -uy, -uz],
        [wx, wy, wz],
        [-wx, -wy, -wz],
      ]) {
        this.vert(s.a.x + px * r, s.a.y + py * r, s.a.z + pz * r, c);
        this.vert(s.b.x + px * r, s.b.y + py * r, s.b.z + pz * r, c);
      }
    } else {
      // y ekseninde dönmüş kutu: 8 köşe, 12 kenar
      const cs = Math.cos(s.yaw);
      const sn = Math.sin(s.yaw);
      const h = s.half;
      const k = [];
      for (let i = 0; i < 8; i++) {
        const lx = i & 1 ? h.x : -h.x;
        const ly = i & 2 ? h.y : -h.y;
        const lz = i & 4 ? h.z : -h.z;
        k.push({ x: s.a.x + lx * cs + lz * sn, y: s.a.y + ly, z: s.a.z - lx * sn + lz * cs });
      }
      for (const [i, j] of [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]) this.line(k[i], k[j], c);
    }
  }

  // Asker ve dostlar: duruş (çömelme) ve yaw'dan poz; nişan açısı ve yürüyüş fazı görselde ayrı
  drawList(list) {
    if (!list) return;
    const P = this.pose;
    for (const a of list) {
      if (!a.alive || this.n >= MAX_ACTORS) continue;
      P.pos = a.pos;
      P.yaw = a.yaw || 0;
      P.height = a.crouch ? M.crouchHeight : M.standHeight;
      hitboxesFor(P, this.boxes);
      for (const s of this.boxes) this.drawShape(s);
      this.n++;
    }
  }

  update() {
    if (!this.on) return;
    const g = this.game;
    if (this.lines.parent !== g.scene) g.scene.add(this.lines);
    this.v = 0;
    this.n = 0;
    this.drawList(g.enemies?.list);
    this.drawList(g.allies?.list);
    const geo = this.lines.geometry;
    geo.setDrawRange(0, this.v);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }
}
