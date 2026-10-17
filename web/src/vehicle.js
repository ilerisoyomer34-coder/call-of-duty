// Araçlar: oyuncunun binip sürdüğü taşıtlar (şimdilik tank; helikopter aynı arayüzle eklenecek).
// Araç arayüzü (tank.js → Tank):
//   kind, name, pos, yaw, hp, model.root, destroyed, canEnter(), drive(dt, input, aimPoint),
//   reloadT (ana silah dolumu), cols (çarpıştırıcılar), rebuildColliders()
// Bu sınıf yalnız ortak işi yapar: bin/in (E), oyuncuyu araca bağlar, üçüncü şahıs kamera, nişan noktası
// (kameranın baktığı yer), araç göstergesi (#vehicleHud), motor sesi. Araç imha olursa oyuncu fırlar ve yaralanır.
import * as THREE from 'three';
import { TANK, VEHICLE } from './config.js';
import { EV } from './events.js';
import { clamp, damp, DEG } from './util.js';

const _fwd = new THREE.Vector3();
const _piv = new THREE.Vector3();
const _cam = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _hit = {};

export class VehicleSystem {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.driving = null;
    this.hud = document.getElementById('vehicleHud');
    this.hudT = 0;
    this.camDist = TANK.drive.camDist;
  }

  // Görev kurulurken: araçlar ve "bin" etkileşimleri (mission.interactables)
  register(v) {
    const g = this.game;
    this.list.push(v);
    g.mission.interactables.push({
      id: `${v.id}-enter`,
      pos: v.c4Spot,
      radius: VEHICLE.enterRadius,
      prompt: `${v.name === 'TANK' ? 'Tanka' : v.name} bin`,
      time: VEHICLE.enterTime,
      enabled: () => !this.driving && v.canEnter() && g.player.alive && !g.player.down,
      action: () => this.enter(v),
    });
  }

  // Sahne değişirken: oyuncu araçtan sessizce ayrılır (dünya yeniden kurulduğu için iniş yeri aranmaz)
  clear() {
    if (this.driving) {
      this.game.player.vehicle = null;
      this.driving = null;
      document.body.classList.remove('inVehicle');
      if (this.hud) this.hud.hidden = true;
      this.game.audio.engine?.(false);
    }
    this.list.length = 0;
  }

  enter(v) {
    const g = this.game;
    const P = g.player;
    if (this.driving || !v.canEnter()) return;
    this.driving = v;
    v.side = 'player';
    v.vel = 0;
    v.reloadT = Math.min(v.reloadT, 0.5);
    P.vehicle = v;
    P.stopSprint();
    g.weapons.cancelReload?.();
    if (g.weapons.state === 'cooking' || g.weapons.state === 'throwing') g.weapons.state = 'idle';
    // Kamera aracın arkasından başlar: bakış aracın yönüne
    P.yaw = v.yaw + v.aimYaw;
    P.pitch = -0.08;
    document.body.classList.add('inVehicle');
    if (this.hud) this.hud.hidden = false;
    g.audio.engine?.(true);
    g.audio.mech('equip');
    g.events.emit('message', 'TANKTASIN · WASD sür, fare kule, sol tık top, sağ tık makineli, E in', 'info');
    g.events.emit(EV.VEHICLE_ENTERED, { vehicle: v });
  }

  // destroyed: araç patladı (oyuncu fırlar); quiet: görev sıfırlanırken (ses, mesaj yok)
  exit(destroyed = false, quiet = false) {
    const g = this.game;
    const P = g.player;
    const v = this.driving;
    if (!v) return;
    this.driving = null;
    P.vehicle = null;
    if (!v.destroyed) v.side = 'neutral';
    v.vel = 0;
    // İniş yeri: gövdenin solu, olmazsa sağı ya da arkası (duvar içine inilmesin)
    const out = this.exitSpot(v);
    P.teleport(out, P.yaw);
    document.body.classList.remove('inVehicle');
    if (this.hud) this.hud.hidden = true;
    g.audio.engine?.(false);
    if (!quiet) {
      if (destroyed) {
        P.takeDamage(VEHICLE.ejectDamage, v.pos, { zone: 'torso', source: 'explosion' });
        P.shake(1);
      }
      g.events.emit(EV.VEHICLE_EXITED, { vehicle: v, destroyed });
    }
  }

  onDestroyed(v) {
    if (this.driving === v) this.exit(true);
  }

  exitSpot(v) {
    const g = this.game;
    const W = g.world;
    const c = Math.cos(v.yaw);
    const s = Math.sin(v.yaw);
    const side = TANK.hullWidth / 2 + TANK.drive.exitDist;
    const back = TANK.hullLen / 2 + TANK.drive.exitDist;
    const tries = [
      [-c * side, s * side],
      [c * side, -s * side],
      [s * back, c * back],
      [-s * back, -c * back],
    ];
    for (const [dx, dz] of tries) {
      const p = W.newVec(v.pos.x + dx, v.pos.y, v.pos.z + dz);
      if (W.canStand(p, 0.4, 0.1, 1.8)) return p;
    }
    return W.newVec(v.pos.x + tries[0][0], v.pos.y, v.pos.z + tries[0][1]);
  }

  // Sürüş karesi (main.js → updatePlaying, oyuncunun yerine): bakış fareden, araç girdiden, kamera arkadan
  drive(dt, I) {
    const g = this.game;
    const P = g.player;
    const v = this.driving;
    if (!v) return;
    const S = g.settings;
    const look = I.consumeLook();
    const k = 0.0022 * S.sensitivity;
    P.yaw -= look.dx * k;
    P.pitch = clamp(P.pitch - look.dy * k * (S.invertY ? -1 : 1), VEHICLE.pitchMin, VEHICLE.pitchMax);
    // Nişan noktası: kameranın tam ortasından giden ışının çarptığı yer (yoksa uzakta)
    const cam = g.camera;
    this.placeCamera(cam, v, dt);
    cam.getWorldDirection(_fwd);
    const wh = g.world.raycast(cam.position, _fwd, VEHICLE.aimRange, _hit);
    let t = wh ? wh.dist : VEHICLE.aimRange;
    const eh = g.enemies.raycast(cam.position, _fwd, t);
    if (eh) t = eh.dist;
    // Kendi gövdesine çarpan ışın (kamera aracın arkasında) nişanı bozmasın: en az kamera–taret mesafesi
    t = Math.max(t, this.camDist + 4);
    _aim.copy(cam.position).addScaledVector(_fwd, t);
    v.drive(dt, I, _aim);
    // Oyuncu aracın içinde: konum gövdenin ortası (düşmanların hedefi), kamera hep arkada
    P.pos.copy(v.pos);
    P.state.vel.set(0, 0, 0);
    P.renderPos.copy(v.pos);
    P.prevPos.copy(v.pos);
    this.placeCamera(cam, v, 0);
    P.trauma = Math.max(0, P.trauma - dt * 1.6);
    P.shakeT += dt;
    if (I.pressed('interact')) this.exit();
    g.audio.updateEngine?.(v.engine, v.pos);
    this.updateHud(dt, v);
  }

  // Üçüncü şahıs kamera: taretin üstündeki bakış noktasının arkasında; duvara girmesin diye ışınla kısalır
  placeCamera(cam, v, dt) {
    const g = this.game;
    const P = g.player;
    const D = TANK.drive;
    _piv.set(v.pos.x, v.pos.y + D.camPivot, v.pos.z);
    const cp = Math.cos(P.pitch);
    _fwd.set(-Math.sin(P.yaw) * cp, Math.sin(P.pitch), -Math.cos(P.yaw) * cp);
    let dist = D.camDist;
    _cam.copy(_fwd).negate();
    const h = g.world.raycast(_piv, _cam, dist + 0.5, _hit);
    if (h && h.collider?.owner !== v) dist = Math.max(2.5, h.dist - 0.5);
    this.camDist = dt > 0 ? damp(this.camDist, dist, dist < this.camDist ? 20 : 4, dt) : Math.min(this.camDist, dist);
    cam.position.copy(_piv).addScaledVector(_fwd, -this.camDist);
    cam.position.y += D.camHeight * 0.4;
    // Sarsıntı (atış, çarpma)
    const s = P.trauma * P.trauma * (g.settings.cameraShake ? 1 : 0.15);
    const t = P.shakeT;
    cam.rotation.set(P.pitch + s * 1.4 * DEG * Math.sin(t * 37), P.yaw + s * 1.4 * DEG * Math.sin(t * 29 + 1), 0, 'YXZ');
    // Görüş açısı: ayardaki yatay FOV'un dikeye çevrilmişi (oyuncu kamerasıyla aynı)
    const aspect = Math.max(cam.aspect, 1.2);
    const vf = (2 * Math.atan(Math.tan((g.settings.fov * DEG) / 2) / aspect)) / DEG;
    if (Math.abs(cam.fov - vf) > 0.05) {
      cam.fov = vf;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
    g.audio.setListener(cam.position.x, cam.position.y, cam.position.z, P.yaw);
  }

  // Gösterge: zırh, top dolumu, hız (DOM her karede değil, 10 Hz)
  updateHud(dt, v) {
    this.hudT -= dt;
    if (!this.hud || this.hudT > 0) return;
    this.hudT = 0.1;
    const hp = Math.max(0, v.hp / TANK.hp);
    const ready = v.reloadT <= 0;
    this.hud.querySelector('.vhArmor i').style.width = `${(hp * 100).toFixed(0)}%`;
    this.hud.querySelector('.vhArmor b').textContent = `%${Math.round(hp * 100)}`;
    this.hud.classList.toggle('low', hp < 0.3);
    const gun = this.hud.querySelector('.vhGun');
    gun.textContent = ready ? 'TOP HAZIR' : `DOLUYOR ${Math.max(0, v.reloadT).toFixed(1)} sn`;
    gun.classList.toggle('ready', ready);
    this.hud.querySelector('.vhSpeed').textContent = `${Math.round(Math.abs(v.vel) * 3.6)} km/s`;
  }
}
