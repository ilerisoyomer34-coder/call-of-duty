// Görsel efektler: parçacıklar (tek çizim çağrısında), mermi izleri, kovanlar,
// çıkartmalar (decal), ışık patlamaları ve patlamalar. Hepsi havuzlanır; çalışma sırasında bellek ayrılmaz.
import * as THREE from 'three';
import { rand, randSign } from './util.js';
import { SURFACES } from './config.js';

const VERT = /* glsl */ `
attribute float size;
attribute float alpha;
attribute vec3 color;
attribute float rot;
varying float vAlpha;
varying vec3 vColor;
varying float vRot;
uniform float scale;
#include <fog_pars_vertex>
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = min(512.0, size * scale / max(0.1, -mvPosition.z));
  vAlpha = alpha;
  vColor = color;
  vRot = rot;
  #include <fog_vertex>
}`;
const FRAG = /* glsl */ `
uniform sampler2D map;
varying float vAlpha;
varying vec3 vColor;
varying float vRot;
#include <fog_pars_fragment>
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float c = cos(vRot), s = sin(vRot);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
  vec4 t = texture2D(map, p);
  gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
  if (gl_FragColor.a < 0.004) discard;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

class Particles {
  constructor(scene, max, map, additive) {
    this.max = max;
    this.count = 0;
    const geo = new THREE.BufferGeometry();
    this.aPos = new Float32Array(max * 3);
    this.aCol = new Float32Array(max * 3);
    this.aSize = new Float32Array(max);
    this.aAlpha = new Float32Array(max);
    this.aRot = new Float32Array(max);
    geo.setAttribute('position', new THREE.BufferAttribute(this.aPos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.aCol, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.aSize, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.aAlpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('rot', new THREE.BufferAttribute(this.aRot, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: map }, scale: { value: 500 } }]),
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: true,
    });
    this.mat.uniforms.map.value = map;
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
    scene.add(this.points);
    // CPU tarafı
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.c = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.a0 = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.rot = new Float32Array(max);
    this.spin = new Float32Array(max);
    this.fadeIn = new Float32Array(max);
  }

  spawn(x, y, z, vx, vy, vz, life, s0, s1, color, alpha = 1, grav = 0, drag = 0, spin = 0, fadeIn = 0) {
    let i = this.count;
    if (i >= this.max) i = (Math.random() * this.max) | 0; // dolunca rastgele birini değiştir
    else this.count++;
    const i3 = i * 3;
    this.p[i3] = x;
    this.p[i3 + 1] = y;
    this.p[i3 + 2] = z;
    this.v[i3] = vx;
    this.v[i3 + 1] = vy;
    this.v[i3 + 2] = vz;
    this.c[i3] = color.r;
    this.c[i3 + 1] = color.g;
    this.c[i3 + 2] = color.b;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.s0[i] = s0;
    this.s1[i] = s1;
    this.a0[i] = alpha;
    this.grav[i] = grav;
    this.drag[i] = drag;
    this.rot[i] = Math.random() * 6.28;
    this.spin[i] = spin;
    this.fadeIn[i] = fadeIn;
  }

  update(dt) {
    let n = this.count;
    for (let i = 0; i < n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // son elemanla yer değiştir
        n--;
        if (i !== n) this.copy(n, i);
        i--;
        continue;
      }
      const i3 = i * 3;
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.v[i3] *= dr;
      this.v[i3 + 1] = this.v[i3 + 1] * dr - this.grav[i] * dt;
      this.v[i3 + 2] *= dr;
      this.p[i3] += this.v[i3] * dt;
      this.p[i3 + 1] += this.v[i3 + 1] * dt;
      this.p[i3 + 2] += this.v[i3 + 2] * dt;
      if (this.p[i3 + 1] < 0.02) {
        this.p[i3 + 1] = 0.02;
        this.v[i3 + 1] *= -0.3;
      }
      this.rot[i] += this.spin[i] * dt;
      const t = 1 - this.life[i] / this.maxLife[i];
      this.aPos[i3] = this.p[i3];
      this.aPos[i3 + 1] = this.p[i3 + 1];
      this.aPos[i3 + 2] = this.p[i3 + 2];
      this.aCol[i3] = this.c[i3];
      this.aCol[i3 + 1] = this.c[i3 + 1];
      this.aCol[i3 + 2] = this.c[i3 + 2];
      this.aSize[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      const fi = this.fadeIn[i] > 0 ? Math.min(1, t / this.fadeIn[i]) : 1;
      this.aAlpha[i] = this.a0[i] * (1 - t) * fi;
      this.aRot[i] = this.rot[i];
    }
    this.count = n;
    this.geo.setDrawRange(0, n);
    const g = this.geo.attributes;
    g.position.needsUpdate = true;
    g.color.needsUpdate = true;
    g.size.needsUpdate = true;
    g.alpha.needsUpdate = true;
    g.rot.needsUpdate = true;
  }

  copy(from, to) {
    const f3 = from * 3;
    const t3 = to * 3;
    for (let k = 0; k < 3; k++) {
      this.p[t3 + k] = this.p[f3 + k];
      this.v[t3 + k] = this.v[f3 + k];
      this.c[t3 + k] = this.c[f3 + k];
    }
    this.life[to] = this.life[from];
    this.maxLife[to] = this.maxLife[from];
    this.s0[to] = this.s0[from];
    this.s1[to] = this.s1[from];
    this.a0[to] = this.a0[from];
    this.grav[to] = this.grav[from];
    this.drag[to] = this.drag[from];
    this.rot[to] = this.rot[from];
    this.spin[to] = this.spin[from];
    this.fadeIn[to] = this.fadeIn[from];
  }

  clear() {
    this.count = 0;
    this.geo.setDrawRange(0, 0);
  }
}

// Halka tampon çıkartma havuzu (InstancedMesh)
class DecalPool {
  constructor(scene, max, map, { opacity = 1, sizeJitter = 0.3 } = {}) {
    this.max = max;
    this.i = 0;
    const mat = new THREE.MeshStandardMaterial({
      map,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      opacity,
      roughness: 1,
    });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 1;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let k = 0; k < max; k++) this.mesh.setMatrixAt(k, zero);
    this.sizeJitter = sizeJitter;
    scene.add(this.mesh);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._q2 = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._p = new THREE.Vector3();
  }
  add(point, normal, size) {
    const s = size * (1 + (Math.random() - 0.5) * this.sizeJitter);
    this._q.setFromUnitVectors(Z, normal);
    this._q2.setFromAxisAngle(Z, Math.random() * Math.PI * 2);
    this._q.multiply(this._q2);
    this._p.copy(point).addScaledVector(normal, 0.012 + Math.random() * 0.004);
    this._m.compose(this._p, this._q, this._s.set(s, s, s));
    this.mesh.setMatrixAt(this.i, this._m);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.i = (this.i + 1) % this.max;
  }
  clear() {
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let k = 0; k < this.max; k++) this.mesh.setMatrixAt(k, zero);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
const Z = new THREE.Vector3(0, 0, 1);
const UP = new THREE.Vector3(0, 1, 0);

export class Effects {
  constructor(scene, textures, audio, quality = 'high') {
    this.scene = scene;
    this.audio = audio;
    const pmax = quality === 'low' ? 600 : 1800;
    this.add = new Particles(scene, pmax, textures.soft, true);
    this.smoke = new Particles(scene, pmax, textures.smoke, false);
    this.holes = new DecalPool(scene, quality === 'low' ? 80 : 220, textures.bulletHole, { sizeJitter: 0.4 });
    this.bloodDecals = new DecalPool(scene, 60, textures.blood, { sizeJitter: 0.6 });
    this.scorch = new DecalPool(scene, 24, textures.scorch, { sizeJitter: 0.2 });
    this.bloodOn = true;
    this._c = new THREE.Color();

    // Mermi izleri
    const tg = new THREE.BoxGeometry(1, 1, 1);
    tg.translate(0, 0, -0.5);
    this.tracerMesh = new THREE.InstancedMesh(
      tg,
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.8, 0.45).multiplyScalar(3), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
      64
    );
    this.tracerMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.tracerMesh.frustumCulled = false;
    scene.add(this.tracerMesh);
    this.tracers = [];
    for (let i = 0; i < 64; i++) this.tracers.push({ active: false, start: new THREE.Vector3(), dir: new THREE.Vector3(), dist: 0, total: 0, speed: 0, len: 0, width: 0.02 });
    this.hideAllInstances(this.tracerMesh, 64);

    // Kovanlar
    const sg = new THREE.CylinderGeometry(0.0055, 0.0055, 0.024, 6);
    sg.rotateZ(Math.PI / 2);
    this.shellMesh = new THREE.InstancedMesh(sg, new THREE.MeshStandardMaterial({ color: 0xc9a13a, metalness: 0.9, roughness: 0.3 }), 48);
    this.shellMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shellMesh.frustumCulled = false;
    scene.add(this.shellMesh);
    this.shells = [];
    for (let i = 0; i < 48; i++)
      this.shells.push({ active: false, p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(), life: 0, floor: 0, bounced: false });
    this.hideAllInstances(this.shellMesh, 48);

    // Işık havuzu: sayı sabit kalmalı yoksa shader yeniden derlenir
    this.lights = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffb060, 0, 10, 2);
      l.castShadow = false;
      scene.add(l);
      this.lights.push({ light: l, t: 0, dur: 1, peak: 0 });
    }
    this.nextLight = 0;
    this.emitters = [];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._e = new THREE.Euler();
  }

  hideAllInstances(mesh, n) {
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < n; i++) mesh.setMatrixAt(i, zero);
    mesh.instanceMatrix.needsUpdate = true;
  }

  setScale(height, fovDeg) {
    const s = height / (2 * Math.tan((fovDeg * Math.PI) / 360));
    this.add.mat.uniforms.scale.value = s;
    this.smoke.mat.uniforms.scale.value = s;
  }

  color(hex) {
    return this._c.setHex(hex);
  }

  flashLight(pos, color = 0xffb060, intensity = 30, range = 8, dur = 0.06) {
    const L = this.lights[this.nextLight];
    this.nextLight = (this.nextLight + 1) % this.lights.length;
    L.light.position.copy(pos);
    L.light.color.setHex(color);
    L.light.distance = range;
    L.peak = intensity;
    L.t = 0;
    L.dur = dur;
    L.light.intensity = intensity;
  }

  tracer(start, end, speed = 420, width = 0.02) {
    const t = this.tracers.find((x) => !x.active);
    if (!t) return;
    t.active = true;
    t.start.copy(start);
    t.dir.subVectors(end, start);
    t.total = t.dir.length();
    if (t.total < 1) {
      t.active = false;
      return;
    }
    t.dir.divideScalar(t.total);
    t.dist = 0;
    t.speed = speed;
    t.len = Math.min(5, t.total * 0.5);
    t.width = width;
  }

  ejectShell(pos, right, up, floorY, soundDelay = true) {
    const s = this.shells.find((x) => !x.active) || this.shells[(Math.random() * this.shells.length) | 0];
    s.active = true;
    s.p.copy(pos);
    s.v.copy(right).multiplyScalar(rand(1.8, 2.8)).addScaledVector(up, rand(1.2, 2.2));
    s.w.set(rand(-20, 20), rand(-20, 20), rand(-20, 20));
    s.q.identity();
    s.life = 2.5;
    s.floor = floorY;
    s.bounced = !soundDelay;
  }

  // Yüzeye göre çarpma efekti
  impact(point, normal, surface, strength = 1, withDecal = true) {
    const S = SURFACES[surface] || SURFACES.concrete;
    const col = this.color(S.color);
    const n = normal;
    const x = point.x + n.x * 0.03;
    const y = point.y + n.y * 0.03;
    const z = point.z + n.z * 0.03;
    if (S.impact === 'sparks') {
      const c2 = this._c.setRGB(1, 0.7, 0.35);
      for (let i = 0; i < 9 * strength; i++) {
        this.add.spawn(x, y, z, n.x * 4 + rand(-3, 3), n.y * 4 + rand(-1, 4), n.z * 4 + rand(-3, 3), rand(0.12, 0.3), 0.035, 0.01, c2, 1, 9, 1.5);
      }
      this.add.spawn(x, y, z, 0, 0, 0, 0.05, 0.3, 0.1, this._c.setRGB(1, 0.8, 0.5), 1);
      this.smoke.spawn(x, y, z, n.x * 0.5, 0.3, n.z * 0.5, 0.6, 0.15, 0.5, this.color(0x777777), 0.35, 0, 2);
    } else if (S.impact === 'blood') {
      if (!this.bloodOn) {
        this.smoke.spawn(x, y, z, 0, 0.3, 0, 0.4, 0.1, 0.4, this.color(0x999999), 0.4, 0, 2);
        return;
      }
      const c = this.color(0x6d0b0b);
      for (let i = 0; i < 10 * strength; i++)
        this.smoke.spawn(x, y, z, n.x * rand(1, 3) + rand(-1.2, 1.2), rand(-0.2, 1.8), n.z * rand(1, 3) + rand(-1.2, 1.2), rand(0.25, 0.5), 0.07, 0.03, c, 0.95, 9, 1.2);
      this.smoke.spawn(x, y, z, n.x * 0.6, 0.1, n.z * 0.6, 0.35, 0.12, 0.55, this.color(0x7a1010), 0.55, 0, 3);
      return;
    } else {
      // toz/kıymık
      const base = S.impact === 'splinter' ? this.color(0x8b6a45) : col;
      const r = base.r;
      const g = base.g;
      const b = base.b;
      for (let i = 0; i < 4 * strength; i++) {
        this._c.setRGB(r, g, b);
        this.smoke.spawn(x, y, z, n.x * rand(0.6, 1.6) + rand(-0.4, 0.4), n.y * rand(0.6, 1.6) + rand(0.1, 0.8), n.z * rand(0.6, 1.6) + rand(-0.4, 0.4), rand(0.5, 1.1), 0.12, rand(0.45, 0.8), this._c, 0.6, 0.4, 2.5, rand(-1, 1));
      }
      this._c.setRGB(r * 0.6, g * 0.6, b * 0.6);
      for (let i = 0; i < 5 * strength; i++)
        this.smoke.spawn(x, y, z, n.x * 3 + rand(-2, 2), n.y * 3 + rand(0, 3), n.z * 3 + rand(-2, 2), rand(0.3, 0.6), 0.03, 0.02, this._c, 1, 12, 0.5);
      this.add.spawn(x, y, z, 0, 0, 0, 0.04, 0.12, 0.05, this._c.setRGB(1, 0.85, 0.6), 0.8);
    }
    if (withDecal && surface !== 'sand') this.holes.add(point, normal, 0.09);
    else if (withDecal) this.holes.add(point, normal, 0.07);
  }

  bloodSplat(point, normal, size = 0.5) {
    if (this.bloodOn) this.bloodDecals.add(point, normal, size);
  }

  muzzleSmoke(pos, dir) {
    this.smoke.spawn(pos.x, pos.y, pos.z, dir.x * 0.6, dir.y * 0.6 + 0.25, dir.z * 0.6, rand(0.4, 0.7), 0.05, 0.35, this.color(0xbbbbbb), 0.22, -0.3, 2);
  }

  enemyMuzzle(pos, dir) {
    const c = this._c.setRGB(1, 0.75, 0.4);
    this.add.spawn(pos.x, pos.y, pos.z, 0, 0, 0, 0.05, 0.45, 0.2, c, 1);
    this.add.spawn(pos.x + dir.x * 0.15, pos.y + dir.y * 0.15, pos.z + dir.z * 0.15, dir.x, dir.y, dir.z, 0.04, 0.3, 0.1, c, 0.8);
    this.smoke.spawn(pos.x, pos.y, pos.z, dir.x * 0.5, 0.2, dir.z * 0.5, 0.5, 0.1, 0.4, this.color(0xaaaaaa), 0.2, -0.2, 2);
  }

  explosion(pos, scale = 1) {
    const x = pos.x;
    const y = pos.y + 0.3;
    const z = pos.z;
    // Ateş topu
    for (let i = 0; i < 26 * scale; i++) {
      const c = this._c.setRGB(1, rand(0.45, 0.75), rand(0.1, 0.3));
      this.add.spawn(x + rand(-0.4, 0.4), y + rand(0, 0.6), z + rand(-0.4, 0.4), rand(-6, 6) * scale, rand(1, 8) * scale, rand(-6, 6) * scale, rand(0.35, 0.75), 1.2 * scale, 3.2 * scale, c, 1, -1, 4, rand(-2, 2));
    }
    // Kıvılcımlar
    for (let i = 0; i < 40 * scale; i++) {
      const c = this._c.setRGB(1, 0.75, 0.35);
      this.add.spawn(x, y, z, rand(-18, 18), rand(3, 20), rand(-18, 18), rand(0.5, 1.4), 0.08, 0.03, c, 1, 14, 0.6);
    }
    // Duman
    for (let i = 0; i < 22 * scale; i++) {
      const g = rand(0.12, 0.28);
      const c = this._c.setRGB(g, g * 0.95, g * 0.9);
      this.smoke.spawn(x + rand(-1, 1), y + rand(0, 1.5), z + rand(-1, 1), rand(-2.5, 2.5), rand(1.5, 4.5), rand(-2.5, 2.5), rand(2.5, 5), 1.5 * scale, rand(5, 8) * scale, c, 0.8, -0.3, 0.8, rand(-0.4, 0.4), 0.08);
    }
    // Zemin tozu halkası
    for (let i = 0; i < 18 * scale; i++) {
      const a = (i / 18) * Math.PI * 2;
      const c = this.color(0xb89a70);
      this.smoke.spawn(x, 0.3, z, Math.cos(a) * rand(6, 10), rand(0.2, 1), Math.sin(a) * rand(6, 10), rand(1.2, 2.2), 0.8, 3.5 * scale, c, 0.6, 0, 2.2);
    }
    this.flashLight(new THREE.Vector3(x, y + 1, z), 0xff8a3a, 900 * scale, 30 * scale, 0.45);
    if (pos.y < 1.5) this.scorch.add(new THREE.Vector3(x, 0.01, z), UP, 4.5 * scale);
  }

  // Sürekli yayıcı: yanan enkaz, helikopter tozu vb.
  addEmitter(e) {
    e.acc = 0;
    this.emitters.push(e);
    return e;
  }

  removeEmitter(e) {
    const i = this.emitters.indexOf(e);
    if (i >= 0) this.emitters.splice(i, 1);
  }

  update(dt, camPos) {
    this.add.update(dt);
    this.smoke.update(dt);
    // Işıklar
    for (const L of this.lights) {
      if (L.light.intensity <= 0) continue;
      L.t += dt;
      const k = 1 - L.t / L.dur;
      L.light.intensity = k > 0 ? L.peak * k * k : 0;
    }
    // İzler
    const tm = this.tracerMesh;
    let anyT = false;
    for (let i = 0; i < this.tracers.length; i++) {
      const t = this.tracers[i];
      if (!t.active) continue;
      anyT = true;
      t.dist += t.speed * dt;
      if (t.dist - t.len > t.total) {
        t.active = false;
        tm.setMatrixAt(i, this._m.makeScale(0, 0, 0));
        continue;
      }
      const head = Math.min(t.dist, t.total);
      const tail = Math.max(0, t.dist - t.len);
      const len = head - tail;
      // Geometri kökten -Z yönüne uzanır; kökü kuyruğa koy
      this._v.copy(t.start).addScaledVector(t.dir, tail);
      const camDist = camPos ? this._v.distanceTo(camPos) : 10;
      const w = t.width + camDist * 0.0012;
      this._q.setFromUnitVectors(NEGZ, t.dir);
      this._m.compose(this._v, this._q, this._s.set(w, w, Math.max(0.01, len)));
      tm.setMatrixAt(i, this._m);
    }
    if (anyT || this._hadTracers) tm.instanceMatrix.needsUpdate = true;
    this._hadTracers = anyT;
    // Kovanlar
    const sm = this.shellMesh;
    let anyS = false;
    for (let i = 0; i < this.shells.length; i++) {
      const s = this.shells[i];
      if (!s.active) continue;
      anyS = true;
      s.life -= dt;
      if (s.life <= 0) {
        s.active = false;
        sm.setMatrixAt(i, this._m.makeScale(0, 0, 0));
        continue;
      }
      s.v.y -= 11 * dt;
      s.p.addScaledVector(s.v, dt);
      if (s.p.y < s.floor + 0.01) {
        s.p.y = s.floor + 0.01;
        if (s.v.y < -1 && !s.bounced) {
          s.bounced = true;
          this.audio.mech('shellDrop', s.p);
        }
        s.v.y *= -0.35;
        s.v.x *= 0.5;
        s.v.z *= 0.5;
        s.w.multiplyScalar(0.6);
      }
      this._q.setFromEuler(this._e.set(s.w.x * dt, s.w.y * dt, s.w.z * dt));
      s.q.multiply(this._q);
      this._m.compose(s.p, s.q, this._s.set(1, 1, 1));
      sm.setMatrixAt(i, this._m);
    }
    if (anyS || this._hadShells) sm.instanceMatrix.needsUpdate = true;
    this._hadShells = anyS;
    // Yayıcılar
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i];
      if (e.life !== undefined) {
        e.life -= dt;
        if (e.life <= 0) {
          this.emitters.splice(i, 1);
          continue;
        }
      }
      e.acc += dt * e.rate;
      while (e.acc >= 1) {
        e.acc -= 1;
        e.spawn(this);
      }
    }
  }

  clear() {
    this.add.clear();
    this.smoke.clear();
    this.holes.clear();
    this.bloodDecals.clear();
    this.scorch.clear();
    for (const t of this.tracers) t.active = false;
    for (const s of this.shells) s.active = false;
    this.hideAllInstances(this.tracerMesh, 64);
    this.hideAllInstances(this.shellMesh, 48);
    for (const L of this.lights) L.light.intensity = 0;
    this.emitters.length = 0;
  }
}
const NEGZ = new THREE.Vector3(0, 0, -1);

export { randSign };
