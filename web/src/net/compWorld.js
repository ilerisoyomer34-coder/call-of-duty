// Rekabetçi modun dünyadaki işaretleri: bomba bölgeleri (yerde halka + üstünde "A"/"B" etiketi ve uzaklık), yerdeki ya
// da kurulmuş bomba (kırmızı ışığı yanıp söner, kurulunca bip sesi patlamaya yaklaştıkça sıklaşır) ve radardaki
// bölge harfleri ile bomba. Işık eklenmez (MeshBasic: gölgelendirici ve ışık sayısı değişmez). Veri game.net.comp'tan.
import * as THREE from 'three';
import { BOMB, SITE_NAMES, COMP_RULES } from '../../shared/sim/competitive.js';
import { PHASE } from '../../shared/net/protocol.js';
import { COMP_VIEW } from '../config.js';
import ARENAS from '../data/arenas.json' with { type: 'json' };

const _v = new THREE.Vector3();

export class CompWorld {
  constructor(game) {
    this.game = game;
    this.net = null;
    this.group = null;
    this.tags = [];
    this.blinkT = 0;
    this.beepAt = 0;
  }

  start(net) {
    this.stop();
    this.net = net;
    const sites = ARENAS[net.welcome.map]?.sites || [];
    this.sites = sites;
    const V = COMP_VIEW;
    const g = new THREE.Group();
    const ringMat = new THREE.MeshBasicMaterial({ color: V.siteColor, transparent: true, opacity: V.ringOpacity, depthWrite: false, side: THREE.DoubleSide });
    const fillMat = new THREE.MeshBasicMaterial({ color: V.siteColor, transparent: true, opacity: V.fillOpacity, depthWrite: false, side: THREE.DoubleSide });
    for (const [x, z, r] of sites) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r - V.ringWidth, r, 56), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, V.lift, z);
      const fill = new THREE.Mesh(new THREE.CircleGeometry(r - V.ringWidth, 40), fillMat);
      fill.rotation.x = -Math.PI / 2;
      fill.position.set(x, V.lift * 0.5, z);
      for (const m of [ring, fill]) {
        m.renderOrder = 2;
        m.castShadow = m.receiveShadow = false;
        g.add(m);
      }
    }
    // Bomba: koyu gövde, sarı bant, kırmızı ışık (yanıp söner)
    const bomb = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.24), new THREE.MeshBasicMaterial({ color: 0x2b2d2a }));
    body.position.y = 0.07;
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.05, 0.08), new THREE.MeshBasicMaterial({ color: 0xc9a23a }));
    band.position.y = 0.1;
    this.lamp = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
    this.lamp.position.set(0.1, 0.16, 0);
    bomb.add(body, band, this.lamp);
    bomb.visible = false;
    g.add(bomb);
    this.bomb = bomb;
    this.group = g;
    this.game.scene.add(g);
  }

  stop() {
    if (this.group) {
      this.group.traverse((o) => {
        if (o.isMesh) {
          o.geometry.dispose();
          o.material.dispose();
        }
      });
      this.group.removeFromParent();
    }
    this.group = null;
    for (const t of this.tags) t.remove();
    this.tags = [];
    this.net = null;
  }

  update(dt) {
    const C = this.net?.comp;
    if (!C || !this.group) return;
    const B = C.bomb;
    const shown = B.state === BOMB.DROPPED || B.state === BOMB.PLANTED;
    this.bomb.visible = shown;
    if (!shown) return;
    this.bomb.position.set(B.x, B.y, B.z);
    if (B.state === BOMB.DROPPED) {
      this.lamp.visible = true;
      return;
    }
    // Kurulu bomba: kalan süre azaldıkça bip sıklaşır (sayaç sunucunun raunt süresi: kurulunca bombanın süresi)
    const left = this.net.phase === PHASE.LIVE ? this.net.timeLeft : 0;
    const k = Math.max(0, Math.min(1, left / COMP_RULES.bomb.timerSec));
    const period = COMP_VIEW.beepFast + (COMP_VIEW.beepSlow - COMP_VIEW.beepFast) * k;
    this.blinkT += dt;
    if (this.blinkT >= period) {
      this.blinkT = 0;
      this.game.audio.beep(COMP_VIEW.beepFreq, 0.07, 0.35, this.bomb.position);
    }
    this.lamp.visible = this.blinkT < Math.min(0.12, period * 0.5);
  }

  // Bölge etiketleri: her zaman, uzaklıkla (duvarın ardında da: bölge yeri bilinir)
  updateTags(hud, width, height) {
    if (!this.net?.comp || !this.sites) return;
    const P = this.game.player;
    const cam = this.game.camera.position;
    this.sites.forEach(([x, z], i) => {
      let el = this.tags[i];
      if (!el) {
        el = document.createElement('div');
        el.className = 'siteTag';
        el.innerHTML = '<b></b><small></small>';
        hud.el.icons.appendChild(el);
        this.tags[i] = el;
      }
      _v.set(x, COMP_VIEW.tagHeight, z);
      const s = hud.project(_v, {});
      if (s.behind || s.x < 0 || s.x > width || s.y < 0 || s.y > height) {
        el.hidden = true;
        return;
      }
      el.hidden = false;
      const C = this.net.comp;
      el.classList.toggle('planted', C.bomb.state === BOMB.PLANTED && C.bomb.site === i);
      el.firstChild.textContent = SITE_NAMES[i];
      const from = P.alive ? P.pos : cam;
      el.lastChild.textContent = `${Math.round(Math.hypot(x - from.x, z - from.z))} m`;
      el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
    });
  }

  hideTags() {
    for (const t of this.tags) t.hidden = true;
  }

  // Radar: bölge harfleri (menzil dışındaysa kenarda), bomba (kurulu kırmızı yanıp söner, yerde turuncu)
  drawRadar(ctx, toMap, R, yaw) {
    const C = this.net?.comp;
    if (!C || !this.sites) return;
    const lim = R - 12;
    const at = (x, z) => {
      const [mx, mz] = toMap(x, z);
      const d = Math.hypot(mx, mz);
      return d > lim ? [(mx / d) * lim, (mz / d) * lim] : [mx, mz];
    };
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    this.sites.forEach(([x, z, r], i) => {
      const [mx, mz] = at(x, z);
      ctx.save();
      ctx.translate(mx, mz);
      ctx.rotate(-yaw);
      ctx.fillStyle = 'rgba(255, 192, 74, 0.22)';
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(7, r * (R / 60)), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.bomb.state === BOMB.PLANTED && C.bomb.site === i ? '#ff5a3c' : '#ffc04a';
      ctx.fillText(SITE_NAMES[i], 0, 0.5);
      ctx.restore();
    });
    const B = C.bomb;
    if (B.state === BOMB.PLANTED || B.state === BOMB.DROPPED) {
      // Kurulu bomba radarda yanıp söner
      if (B.state === BOMB.PLANTED && performance.now() % COMP_VIEW.radarBlinkMs < COMP_VIEW.radarBlinkMs / 2) return;
      const [mx, mz] = at(B.x, B.z);
      ctx.fillStyle = B.state === BOMB.PLANTED ? '#ff3b2a' : '#f0a33a';
      ctx.fillRect(mx - 4, mz - 4, 8, 8);
    }
  }
}
