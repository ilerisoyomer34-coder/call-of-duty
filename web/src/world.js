// Statik dünya: kutu çarpıştırıcılar (AABB), ızgara hızlandırması, ışın testi,
// karakter çarpışması ve çizim çağrısını azaltmak için malzemeye göre birleştirilmiş geometri.
import * as THREE from 'three';
import { CollisionWorld } from '../shared/sim/collision.js';
import { getTreeProp } from './models.js';
import { TREES } from './config.js';

// Zemin kaplamaları gölge düşürmez (gölge haritasında boşa çizilmesin)
const FLAT_MATERIALS = new Set(['sand', 'dirt', 'helipad', 'snow', 'asphalt', 'water']);

const FACES = [
  { n: [1, 0, 0], r: [0, 0, -1], u: [0, 1, 0] },
  { n: [-1, 0, 0], r: [0, 0, 1], u: [0, 1, 0] },
  { n: [0, 1, 0], r: [1, 0, 0], u: [0, 0, -1] },
  { n: [0, -1, 0], r: [1, 0, 0], u: [0, 0, 1] },
  { n: [0, 0, 1], r: [1, 0, 0], u: [0, 1, 0] },
  { n: [0, 0, -1], r: [-1, 0, 0], u: [0, 1, 0] },
];

class Batch {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.col = [];
    this.idx = [];
  }
  get vertexCount() {
    return this.pos.length / 3;
  }
}

// Çarpışma (ızgara, ışın, karakter hareketi, box/block) paylaşılan simülasyonda: shared/sim/collision.js.
// Burada yalnız görsel kısım: malzemeler ve box()'un çağırdığı birleştirilmiş kutu ağları.
export class World extends CollisionWorld {
  constructor(scene, textures) {
    super();
    this.scene = scene;
    this.T = textures;
    this.batches = new Map();
    this.materials = this.createMaterials();
    this.trees = []; // hazır ağaç modelinin örnekleri { x, z, h, snowy } (finalize InstancedMesh kurar)
  }

  // Harita ağacı (kit.js pine/palm): hazır model yüklendiyse yalnız konumu kaydedilir, prosedürel ağaç çizilmez.
  // Çarpıştırıcıyı kit.js her durumda ekler (sunucu ve Node aynı gövde kutusunu görür)
  addTree(x, z, h, opts = {}) {
    if (!getTreeProp()) return false;
    this.trees.push({ x, z, h, snowy: !!opts.snowy });
    return true;
  }

  // Çarpıştırıcı köşeleri ve ışın sonuçları THREE.Vector3 olsun (istemci kodu clone/distanceTo kullanır)
  newVec(x = 0, y = 0, z = 0) {
    return new THREE.Vector3(x, y, z);
  }

  createMaterials() {
    const T = this.T;
    const M = {};
    const std = (map, color, rough = 0.9, metal = 0, tile = 2) => {
      const m = new THREE.MeshStandardMaterial({ map, color, roughness: rough, metalness: metal, vertexColors: true });
      m.userData.tile = tile;
      return m;
    };
    M.sand = std(T.sand, 0xffffff, 1, 0, 6);
    M.dirt = std(T.dirt, 0xffffff, 1, 0, 4);
    M.concrete = std(T.concrete, 0xffffff, 0.92, 0, 2.5);
    M.concreteDark = std(T.concrete, 0x8a8680, 0.95, 0, 2.5);
    M.plaster = std(T.plaster, 0xffffff, 0.95, 0, 3);
    M.plasterWhite = std(T.plaster, 0xf2efe6, 0.95, 0, 3);
    M.plasterOchre = std(T.plaster, 0xe0b98a, 0.95, 0, 3);
    M.contRed = std(T.corrugated, 0x8e3b2c, 0.7, 0.35, 2.4);
    M.contBlue = std(T.corrugated, 0x2f5470, 0.7, 0.35, 2.4);
    M.contGreen = std(T.corrugated, 0x4d5d3a, 0.7, 0.35, 2.4);
    M.contOrange = std(T.corrugated, 0xa8622a, 0.7, 0.35, 2.4);
    M.contGrey = std(T.corrugated, 0x7b7f80, 0.7, 0.35, 2.4);
    M.metal = std(T.metal, 0x8a8e90, 0.5, 0.7, 1.5);
    M.metalDark = std(T.metal, 0x3c4042, 0.55, 0.6, 1.5);
    M.olive = std(T.metal, 0x55603f, 0.75, 0.25, 1.5);
    M.rust = std(T.corrugated, 0x6b4a36, 0.85, 0.3, 2);
    M.wood = std(T.wood, 0xffffff, 0.9, 0, 1.4);
    M.woodDark = std(T.wood, 0x7a6048, 0.9, 0, 1.4);
    M.sandbag = std(T.sandbag, 0xffffff, 1, 0, 1.3);
    M.rock = std(T.rock, 0xffffff, 1, 0, 5);
    M.tarpTan = std(T.canvas, 0xb59e76, 0.95, 0, 2);
    M.tarpGreen = std(T.canvas, 0x5b6446, 0.95, 0, 2);
    M.tarpRed = std(T.canvas, 0x8a3a2e, 0.95, 0, 2);
    M.tire = std(T.metal, 0x1d1d1d, 0.95, 0, 1);
    M.glass = new THREE.MeshStandardMaterial({ color: 0x223038, roughness: 0.15, metalness: 0.6, vertexColors: true });
    M.glass.userData.tile = 1;
    M.burnt = std(T.metal, 0x4d4540, 0.95, 0.2, 1.5);
    M.helipad = std(T.concrete, 0x6d6a64, 0.95, 0, 2.5);
    M.paint = new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 0.9, vertexColors: true });
    M.paint.userData.tile = 1;
    // Diğer haritalar (yalnızca kullanılan malzemelerin gölgelendiricisi derlenir: birleştirme boş kalanı atlar)
    M.snow = std(T.snow, 0xffffff, 0.9, 0, 6);
    M.asphalt = std(T.asphalt, 0xffffff, 0.95, 0, 4);
    M.brick = std(T.brick, 0xffffff, 0.95, 0, 2);
    M.pine = std(T.canvas, 0x33503a, 0.95, 0, 2);
    M.steelPipe = std(T.metal, 0x8e9398, 0.45, 0.7, 1);
    M.craneYellow = std(T.metal, 0xd6a02a, 0.6, 0.35, 1.5);
    M.hullRed = std(T.corrugated, 0x7a2e24, 0.7, 0.3, 3);
    M.water = new THREE.MeshStandardMaterial({ color: 0x1c3644, roughness: 0.18, metalness: 0.35, vertexColors: true });
    M.water.userData.tile = 1;
    // Işımalı lamba başlığı: gece haritasında ışık kaynağı eklemeden parlak görünür (ışık sayısı sabit)
    M.lampGlow = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffd49a, emissiveIntensity: 3, vertexColors: true });
    M.lampGlow.userData.tile = 1;
    return M;
  }

  batch(matKey) {
    let b = this.batches.get(matKey);
    if (!b) {
      b = new Batch();
      this.batches.set(matKey, b);
    }
    return b;
  }

  addBoxGeometry(cx, cy, cz, w, h, d, mat, rotY = 0, tint = null, uvScale = 1, skipBottom = false) {
    const b = this.batch(mat);
    const tile = (this.materials[mat]?.userData.tile || 2) / uvScale;
    const hx = w / 2;
    const hy = h / 2;
    const hz = d / 2;
    const cr = Math.cos(rotY);
    const sr = Math.sin(rotY);
    const col = tint ? new THREE.Color(tint) : null;
    const cR = col ? col.r : 1;
    const cG = col ? col.g : 1;
    const cB = col ? col.b : 1;
    for (let f = 0; f < 6; f++) {
      if (skipBottom && f === 3) continue;
      const F = FACES[f];
      const n = F.n;
      const r = F.r;
      const u = F.u;
      const hn = Math.abs(n[0]) * hx + Math.abs(n[1]) * hy + Math.abs(n[2]) * hz;
      const hr = Math.abs(r[0]) * hx + Math.abs(r[1]) * hy + Math.abs(r[2]) * hz;
      const hu = Math.abs(u[0]) * hx + Math.abs(u[1]) * hy + Math.abs(u[2]) * hz;
      const base = b.vertexCount;
      const corners = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ];
      // Dönüşten sonra dünya uzayındaki normal
      const nxw = n[0] * cr + n[2] * sr;
      const nzw = -n[0] * sr + n[2] * cr;
      for (const [sx, sy] of corners) {
        const lx = n[0] * hn + r[0] * hr * sx + u[0] * hu * sy;
        const ly = n[1] * hn + r[1] * hr * sx + u[1] * hu * sy;
        const lz = n[2] * hn + r[2] * hr * sx + u[2] * hu * sy;
        const wx = cx + lx * cr + lz * sr;
        const wy = cy + ly;
        const wz = cz - lx * sr + lz * cr;
        b.pos.push(wx, wy, wz);
        b.nor.push(nxw, n[1], nzw);
        // Dünya uzayında UV: bitişik kutularda dikişsiz döşeme
        const rx = r[0] * cr + r[2] * sr;
        const rz = -r[0] * sr + r[2] * cr;
        const ux = u[0] * cr + u[2] * sr;
        const uz = -u[0] * sr + u[2] * cr;
        b.uv.push((wx * rx + wy * r[1] + wz * rz) / tile, (wx * ux + wy * u[1] + wz * uz) / tile);
        // Basit ortam kapatma: tabana yakın köşeleri hafifçe karart
        const ao = wy < 0.15 ? 0.78 : 1;
        b.col.push(cR * ao, cG * ao, cB * ao);
      }
      b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  // Hazır bir BufferGeometry'yi matrisle dönüştürüp birleştirme kuyruğuna ekler.
  addGeometry(geo, mat, matrix, tint = null) {
    const b = this.batch(mat);
    const g = geo.index ? geo : geo;
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const uv = g.attributes.uv;
    const base = b.vertexCount;
    const v = new THREE.Vector3();
    const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    const col = tint ? new THREE.Color(tint) : new THREE.Color(1, 1, 1);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      b.pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
      b.nor.push(v.x, v.y, v.z);
      b.uv.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
      b.col.push(col.r, col.g, col.b);
    }
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) b.idx.push(base + g.index.getX(i));
    } else {
      for (let i = 0; i < pos.count; i++) b.idx.push(base + i);
    }
  }

  finalize() {
    this.meshes = [];
    for (const [key, b] of this.batches) {
      if (!b.idx.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      geo.setIndex(b.vertexCount > 65535 ? new THREE.Uint32BufferAttribute(b.idx, 1) : new THREE.Uint16BufferAttribute(b.idx, 1));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, this.materials[key]);
      mesh.castShadow = !FLAT_MATERIALS.has(key);
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.scene.add(mesh);
      this.meshes.push(mesh);
    }
    this.batches.clear();
    if (this.trees.length) this.buildTrees();
  }

  // Bütün ağaçlar model mesh'i başına tek InstancedMesh (gövde + yaprak: iki çizim çağrısı). Gövde tabanı y=0'a
  // oturur, boy istenen yüksekliğe ölçeklenir; dönüş ve küçük boy farkı konumdan türer (her açılışta aynı)
  buildTrees() {
    const T = getTreeProp();
    const b = T.info.bounds;
    const modelH = b.max[1] - b.min[1];
    const n = this.trees.length;
    const snowy = this.trees.some((t) => t.snowy);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const snow = new THREE.Color().setRGB(...TREES.snowTint);
    const white = new THREE.Color(1, 1, 1);
    const fract = (v) => v - Math.floor(v);
    for (const part of T.parts) {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, n);
      for (let i = 0; i < n; i++) {
        const t = this.trees[i];
        const r1 = fract(Math.sin(t.x * 12.9898 + t.z * 78.233) * 43758.5453);
        const r2 = fract(Math.sin(t.x * 39.3468 + t.z * 11.135) * 24634.6345);
        const k = (t.h / modelH) * (1 + (r2 * 2 - 1) * TREES.scaleJitter);
        q.setFromAxisAngle(up, r1 * Math.PI * 2);
        sc.setScalar(k);
        p.set(t.x, -b.min[1] * k, t.z);
        m4.compose(p, q, sc).multiply(part.matrix);
        mesh.setMatrixAt(i, m4);
        if (part.foliage && snowy) mesh.setColorAt(i, t.snowy ? snow : white);
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.scene.add(mesh);
      this.meshes.push(mesh);
    }
    this.treeMeshes = n;
  }
}
