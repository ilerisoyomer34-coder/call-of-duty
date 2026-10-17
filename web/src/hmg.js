// Ağır makineli mevzi: sehpalı silah + başındaki nişancı (enemy.js'te 'gunner' türü, mount alanı bu nesne).
// Silahın yönünü nişancının yapay zekâsı belirler (Enemy.actMounted); burada model, zırh (kalkan mermiyi
// durdurur), susturma (patlayıcı ya da nişancının ölümü) ve kontrol noktası geri yüklemesi var.
import * as THREE from 'three';
import { HMG } from './config.js';
import { buildHeavyMG, mat } from './models.js';
import { rand } from './util.js';

const DEG = Math.PI / 180;
const _v = new THREE.Vector3();

export class HeavyNest {
  constructor(game, def, idx) {
    this.game = game;
    this.def = def;
    this.id = `hmg${idx}`;
    this.pos = def.pos.clone();
    this.yaw = def.yaw; // mevzinin baktığı merkez yön
    this.arc = HMG.arcDeg * DEG;
    this.cfg = HMG; // nişancının düzenek ayarları (enemy.js → actMounted)
    this.warnText = 'AĞIR MAKİNELİ ATEŞİ · SİPER AL';
    this.calloutName = 'Makineli yuvası';
    const m = buildHeavyMG(HMG);
    this.model = m;
    m.root.position.set(this.pos.x, this.pos.y, this.pos.z);
    m.root.rotation.y = this.yaw;
    game.scene.add(m.root);
    // Zırh ışın testi dünya matrisini kullanır: ilk çizimden önce de doğru olsun
    m.root.updateMatrixWorld(true);
    for (const a of m.armor) {
      a.userData.nest = this;
      game.enemies.armor.push(a);
    }
    this.mats = [];
    m.root.traverse((o) => {
      if (o.isMesh && o.visible) this.mats.push([o, o.material]);
    });
    this.aimYaw = 0; // merkez yöne göre (rad)
    this.aimPitch = 0;
    this.wrecked = false;
    this.warned = false;
    // Nişancı: silahın arkasında; yönü ve yeri silahla birlikte döner
    this.gunner = game.enemies.spawn({
      id: `${this.id}g`, type: 'gunner', group: def.group || 'hmg', pos: this.seatPos(new THREE.Vector3()), yaw: this.yaw, mount: this,
    });
  }

  // Silahın dünya uzayındaki yönü (merkez + dönüş)
  get worldYaw() {
    return this.yaw + this.aimYaw;
  }

  pivot(out) {
    return out.set(this.pos.x, this.pos.y + HMG.pivotH, this.pos.z);
  }

  // Nişancının durduğu yer: silah ekseninin arkası (silah dönerken nişancı da etrafında döner)
  seatPos(out, yaw = this.worldYaw) {
    return out.set(this.pos.x + Math.sin(yaw) * HMG.gunnerBack, this.pos.y, this.pos.z + Math.cos(yaw) * HMG.gunnerBack);
  }

  // Merkeze göre açı yay içinde mi?
  inArc(worldYaw) {
    let d = worldYaw - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    return Math.abs(d) <= this.arc;
  }

  // Nişancının çevirdiği açıları modele uygula
  setAim(relYaw, pitch) {
    this.aimYaw = relYaw;
    this.aimPitch = pitch;
    this.model.yaw.rotation.y = relYaw;
    this.model.pitch.rotation.x = pitch;
    this.model.yaw.updateMatrixWorld(true); // kalkan zırhı aynı karede doğru yerde olsun
  }

  muzzleWorld(out) {
    this.model.pitch.updateMatrixWorld(true);
    return this.model.pitch.localToWorld(out.copy(this.model.points.muzzle));
  }

  // Nişancının elleri için tutamak noktaları (dünya)
  grips(outL, outR) {
    this.model.pitch.updateMatrixWorld(true);
    this.model.pitch.localToWorld(outL.copy(this.model.points.gripL));
    this.model.pitch.localToWorld(outR.copy(this.model.points.gripR));
  }

  update(dt) {
    // Başında kimse yoksa namlu yavaşça aşağı sarkar
    if (this.wrecked || !this.gunner.alive || this.gunner.mount !== this) {
      const p = this.model.pitch.rotation;
      p.x += (-0.22 - p.x) * Math.min(1, dt * 2);
    }
  }

  // Patlayıcı yakında patladı: silah susar, nişancı (sağsa) iner
  silence() {
    if (this.wrecked) return;
    this.wrecked = true;
    const g = this.game;
    const burnt = mat(0x1f1c1a, 0.95, 0.2);
    for (const [o] of this.mats) o.material = burnt;
    this.model.pitch.rotation.x = -0.3;
    this.model.yaw.rotation.z = 0.15;
    if (this.gunner.alive && this.gunner.mount === this) this.gunner.dismount();
    const p = this.pivot(_v).clone();
    this.smoke = g.effects.addEmitter({
      rate: 4,
      life: 60,
      spawn: (fx) => {
        const gg = rand(0.1, 0.2);
        fx.smoke.spawn(p.x + rand(-0.3, 0.3), p.y, p.z + rand(-0.3, 0.3), rand(-0.2, 0.2), rand(1, 2), rand(-0.2, 0.2), rand(3, 5), 0.6, 3, fx._c.setRGB(gg, gg, gg), 0.5, -0.1, 0.1);
      },
    });
    g.events.emit('message', 'MAKİNELİ SUSTURULDU', 'info');
  }

  // Kontrol noktasına dönüş: susturulmamış silah yerinde, açı sıfır
  restore(wasWrecked) {
    if (wasWrecked) return;
    if (this.wrecked) {
      this.wrecked = false;
      for (const [o, m] of this.mats) o.material = m;
      this.model.yaw.rotation.z = 0;
      if (this.smoke) this.game.effects.removeEmitter(this.smoke);
      this.smoke = null;
    }
    this.setAim(0, 0);
    this.warned = false;
  }
}
