// Statik dünya: kutu çarpıştırıcılar (AABB), ızgara hızlandırması, ışın testi,
// karakter çarpışması ve çizim çağrısını azaltmak için malzemeye göre birleştirilmiş geometri.
import * as THREE from 'three';
import { CollisionWorld } from '../shared/sim/collision.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getTreeProp, getContainerProp, buildMunicipality, addWind, addAlphaBoost } from './models.js';
import { TREES, RENDER, GRASS, WIND } from './config.js';
import { simplifyGeometry, lodAvailable } from './lod.js';

let grassGeo = null; // çimen öbeği geometrisi (haritalar arasında paylaşılır)

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

// Birleştirme kuyruğu: bir malzeme × bir harita hücresi
class Batch {
  constructor(mat) {
    this.mat = mat;
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

const _sphere = new THREE.Sphere();

// Çam tacının yarıçapı / boyu (model: 2,2 m genişlik, 5,3 m boy): hücre sınırının payı
const CROWN_RATIO = 0.21;

// Örnek grubunun yatay sınırı (pay: ağaç tacı ya da öbek yarıçapı kadar)
function cellBounds(items, pad) {
  const c = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity, hi: [], lo: [], all: [], far: false, shadow: true };
  for (const it of items) {
    c.x0 = Math.min(c.x0, it.x - pad);
    c.z0 = Math.min(c.z0, it.z - pad);
    c.x1 = Math.max(c.x1, it.x + pad);
    c.z1 = Math.max(c.z1, it.z + pad);
  }
  return c;
}

function cellDist(c, p) {
  const dx = Math.max(c.x0 - p.x, 0, p.x - c.x1);
  const dz = Math.max(c.z0 - p.z, 0, p.z - c.z1);
  return Math.sqrt(dx * dx + dz * dz);
}

// Örnekleri harita hücrelerine böl (RENDER.instanceCell): her hücre ayrı InstancedMesh, görüş konisi kırpması
// hücre hücre işler (tek dev örnek ağı bütün haritayı kapsar, hiç kırpılmaz)
function groupByCell(items) {
  const cell = RENDER.instanceCell;
  const out = new Map();
  for (const it of items) {
    const k = `${Math.floor(it.x / cell)},${Math.floor(it.z / cell)}`;
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(it);
  }
  return [...out.values()];
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
    this.containers = []; // hazır konteyner modelinin örnekleri { x, y, z, w, h, d, alongX, mat }
  }

  addMunicipality(x, z) {
    const g = buildMunicipality(x, z);
    if (!g) return false;
    this.scene.add(g);
    return true;
  }

  // Harita ağacı (kit.js pine/palm): hazır model yüklendiyse yalnız konumu kaydedilir, prosedürel ağaç çizilmez.
  // Çarpıştırıcıyı kit.js her durumda ekler (sunucu ve Node aynı gövde kutusunu görür)
  addTree(x, z, h, opts = {}) {
    if (!getTreeProp()) return false;
    this.trees.push({ x, z, h, snowy: !!opts.snowy });
    return true;
  }

  // Harita konteyneri (kit.js container): model yüklendiyse ve o renk çeşidi varsa yalnız örnek kaydedilir.
  // w/h/d oyundaki kutunun dünya eksenlerindeki boyutu (çarpıştırıcıyla aynı); y taban yüksekliği
  addContainer(x, y, z, w, h, d, alongX, mat) {
    if (!getContainerProp()?.variants[mat]) return false;
    this.containers.push({ x, y, z, w, h, d, alongX, mat });
    return true;
  }

  // Fizik motoru (physics.js) haritaya bağlıyken sonradan eklenen/kaldırılan kutuları izler (patlayan varil, görev
  // sırasında kurulan düzenekler). Kanca yoksa ortak davranış aynıdır
  addCollider(...args) {
    const c = super.addCollider(...args);
    this.onColliderChange?.('add', c);
    return c;
  }

  removeCollider(c) {
    super.removeCollider(c);
    this.onColliderChange?.('remove', c);
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
    // Dünya malzemelerinde ortam yansıması yok: yüksek metallik yalnız kararttığı için (yansıyacak gökyüzü yok)
    // metaller, su ve cam düşük metallikle; gölgede simsiyah kalıyorlardı
    M.metal = std(T.metal, 0x8a8e90, 0.5, 0.4, 1.5);
    M.metalDark = std(T.metal, 0x3c4042, 0.55, 0.35, 1.5);
    M.olive = std(T.metal, 0x6e7a52, 0.75, 0.1, 1.5); // askerî yeşil (çıkarma botunun gölgedeki içi simsiyahtı)
    M.rust = std(T.corrugated, 0x6b4a36, 0.85, 0.3, 2);
    M.wood = std(T.wood, 0xffffff, 0.9, 0, 1.4);
    M.woodDark = std(T.wood, 0x7a6048, 0.9, 0, 1.4);
    M.sandbag = std(T.sandbag, 0xffffff, 1, 0, 1.3);
    M.rock = std(T.rock, 0xffffff, 1, 0, 5);
    M.tarpTan = std(T.canvas, 0xb59e76, 0.95, 0, 2);
    M.tarpGreen = std(T.canvas, 0x5b6446, 0.95, 0, 2);
    M.tarpRed = std(T.canvas, 0x8a3a2e, 0.95, 0, 2);
    M.tire = std(T.metal, 0x1d1d1d, 0.95, 0, 1);
    M.glass = new THREE.MeshStandardMaterial({ color: 0x223038, roughness: 0.15, metalness: 0.25, vertexColors: true });
    M.glass.userData.tile = 1;
    M.burnt = std(T.metal, 0x857a70, 0.95, 0.05, 1.5); // yanmış araç: koyu kömür grisi (eskisi düz siyah bir kütle gibiydi)
    M.helipad = std(T.concrete, 0x6d6a64, 0.95, 0, 2.5);
    M.paint = new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 0.9, vertexColors: true });
    M.paint.userData.tile = 1;
    // Diğer haritalar (yalnızca kullanılan malzemelerin gölgelendiricisi derlenir: birleştirme boş kalanı atlar)
    M.snow = std(T.snow, 0xffffff, 0.9, 0, 6);
    M.asphalt = std(T.asphalt, 0xffffff, 0.95, 0, 4);
    M.brick = std(T.brick, 0xffffff, 0.95, 0, 2);
    M.pine = std(T.canvas, 0x33503a, 0.95, 0, 2);
    M.steelPipe = std(T.metal, 0x8e9398, 0.45, 0.4, 1);
    M.craneYellow = std(T.metal, 0xd6a02a, 0.6, 0.35, 1.5);
    M.hullRed = std(T.corrugated, 0x7a2e24, 0.7, 0.3, 3);
    M.water = new THREE.MeshStandardMaterial({ color: 0x2c5266, roughness: 0.18, metalness: 0.12, vertexColors: true });
    M.water.userData.tile = 1;
    // Işımalı lamba başlığı: gece haritasında ışık kaynağı eklemeden parlak görünür (ışık sayısı sabit)
    M.lampGlow = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffd49a, emissiveIntensity: 3, vertexColors: true });
    M.lampGlow.userData.tile = 1;
    // Orman zemini ve fabrika/çekirdek lambaları (kırmızı uyarı, camgöbeği makine ışığı)
    M.grass = std(T.grass, 0xffffff, 1, 0, 7);
    M.lampRed = new THREE.MeshStandardMaterial({ color: 0x220808, emissive: 0xff3a24, emissiveIntensity: 3.2, vertexColors: true });
    M.lampRed.userData.tile = 1;
    M.lampCyan = new THREE.MeshStandardMaterial({ color: 0x08181c, emissive: 0x3ad8ff, emissiveIntensity: 2.6, vertexColors: true });
    M.lampCyan.userData.tile = 1;
    return M;
  }

  // Statik geometri malzeme × harita hücresi (RENDER.worldCell) başına birleşir: her parça kendi sınır küresiyle
  // görüş ve gölge konisinde ayrı kırpılır; bakılmayan yerin duvarları çizilmez. Tek dev ağ bütün haritayı
  // kapsardı, arkada kalan şehir de her karede çizilirdi. Hücreden büyük parçalar (zemin, uzun duvar) ayrı kuyrukta
  batch(matKey, x = 0, z = 0, size = 0) {
    const C = RENDER.worldCell;
    const key = size > C ? `${matKey}|*` : `${matKey}|${Math.floor(x / C)},${Math.floor(z / C)}`;
    let b = this.batches.get(key);
    if (!b) {
      b = new Batch(matKey);
      this.batches.set(key, b);
    }
    return b;
  }

  addBoxGeometry(cx, cy, cz, w, h, d, mat, rotY = 0, tint = null, uvScale = 1, skipBottom = false) {
    const b = this.batch(mat, cx, cz, Math.max(w, d));
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
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    _sphere.copy(geo.boundingSphere).applyMatrix4(matrix);
    const b = this.batch(mat, _sphere.center.x, _sphere.center.z, _sphere.radius * 2);
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
    for (const b of this.batches.values()) {
      if (!b.idx.length) continue;
      const key = b.mat;
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
    if (this.containers.length) this.buildContainers();
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
    // Gövde/dalların sade kopyası (uzak hücreler): şablonda bir kez; sadeleştirici hazır değilse hep tam model
    for (const part of T.parts) {
      if (!part.foliage && part.lod === undefined && lodAvailable()) part.lod = simplifyGeometry(part.geometry, TREES.trunkLod.ratio, TREES.trunkLod.error);
    }
    this.treeCells = [];
    for (const group of groupByCell(this.trees)) {
      const cell = cellBounds(group, Math.max(...group.map((t) => t.h)) * CROWN_RATIO);
      for (const part of T.parts) {
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, group.length);
        group.forEach((t, i) => {
          const r1 = fract(Math.sin(t.x * 12.9898 + t.z * 78.233) * 43758.5453);
          const r2 = fract(Math.sin(t.x * 39.3468 + t.z * 11.135) * 24634.6345);
          const k = (t.h / modelH) * (1 + (r2 * 2 - 1) * TREES.scaleJitter);
          q.setFromAxisAngle(up, r1 * Math.PI * 2);
          sc.setScalar(k);
          p.set(t.x, -b.min[1] * k, t.z);
          m4.compose(p, q, sc).multiply(part.matrix);
          mesh.setMatrixAt(i, m4);
          if (part.foliage && snowy) mesh.setColorAt(i, t.snowy ? snow : white);
        });
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.prop = 'tree';
        mesh.userData.foliage = part.foliage;
        mesh.computeBoundingSphere();
        this.scene.add(mesh);
        this.meshes.push(mesh);
        cell.all.push(mesh);
        if (part.lod) {
          // Aynı örnek dönüşümleriyle sade gövde; uzak hücrede tam gövdenin yerine görünür (updateDetail)
          const lo = new THREE.InstancedMesh(part.lod, part.material, group.length);
          lo.instanceMatrix.array.set(mesh.instanceMatrix.array);
          lo.castShadow = true;
          lo.receiveShadow = true;
          lo.visible = false;
          lo.userData.prop = 'tree';
          lo.userData.lod = true;
          lo.computeBoundingSphere();
          this.scene.add(lo);
          this.meshes.push(lo);
          cell.hi.push(mesh);
          cell.lo.push(lo);
          cell.all.push(lo);
        }
      }
      this.treeCells.push(cell);
    }
    this.treeMeshes = n;
  }

  // Her karede (drawWorld): ağaç hücreleri uzaklığa göre sade gövdeye geçer ve uzakta gölge düşürmez; uzak çimen
  // hücreleri çizilmez. Uzaklık kameradan hücrenin en yakın noktasına (yatay)
  updateDetail(pos) {
    for (const c of this.treeCells || []) {
      const d = cellDist(c, pos);
      const far = c.far ? d > TREES.lodDist - TREES.lodHyst : d > TREES.lodDist;
      if (far !== c.far) {
        c.far = far;
        for (const m of c.hi) m.visible = !far;
        for (const m of c.lo) m.visible = far;
      }
      const shadow = d < TREES.shadowDist;
      if (shadow !== c.shadow) {
        c.shadow = shadow;
        for (const m of c.all) m.castShadow = shadow;
      }
    }
    for (const c of this.grassCells || []) c.mesh.visible = cellDist(c, pos) < GRASS.drawDist;
  }

  // Çimen öbekleri: haritanın ortam satırındaki sıklıkla (100 m² başına) rastgele ama her açılışta aynı yerlere,
  // yerdeki çarpıştırıcılardan ve kaçınma alanlarından (yol, dere) uzak. Hücre başına bir InstancedMesh (görüş
  // dışı hücre çizilmez); iki çapraz düzlem, yukarı bakan normal (yumuşak ışık), rüzgârda salınır, gölge düşürmez
  scatterGrass(spec, quality, avoid = []) {
    if (!spec) return;
    const q = GRASS.density[quality] ?? 0.55;
    const B = this.bounds;
    if (!q || !B) return;
    if (!grassGeo) {
      // Her düzlemin arka yüzü ayrı (ters dönmüş) bir kopya: çift yüzlü malzemede three.js arka yüzün normalini
      // ters çevirir, yukarı bakan normal aşağı döner ve öbeğin yarısı güneş almayıp simsiyah görünürdü
      const a = new THREE.PlaneGeometry(1, 1);
      a.translate(0, 0.5, 0);
      const planes = [];
      for (const r of [0, Math.PI / 2, Math.PI / 4]) planes.push(a.clone().rotateY(r), a.clone().rotateY(r + Math.PI));
      grassGeo = mergeGeometries(planes);
      const n = grassGeo.attributes.normal;
      for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
      grassGeo.userData.shared = true;
    }
    if (!this.grassMat) {
      this.grassMat = new THREE.MeshStandardMaterial({ map: this.T.grassBlades, alphaTest: 0.45, roughness: 1, metalness: 0 });
      addWind(this.grassMat, WIND.grass, 0, 1);
      addAlphaBoost(this.grassMat);
    }
    const area = (B.maxx - B.minx) * (B.maxz - B.minz);
    const count = Math.round((area / 100) * spec.density * q);
    let st = 7919;
    const rnd = () => ((st = (st * 16807) % 2147483647) / 2147483647);
    const items = [];
    const base = new THREE.Color(spec.color);
    for (let i = 0; i < count * 2 && items.length < count; i++) {
      const x = B.minx + rnd() * (B.maxx - B.minx);
      const z = B.minz + rnd() * (B.maxz - B.minz);
      if (avoid.some((r) => x > r[0] && x < r[2] && z > r[1] && z < r[3])) continue;
      if (this.query(x - 0.4, z - 0.4, x + 0.4, z + 0.4).some((c) => c.min.y < 0.6 && x > c.min.x - 0.3 && x < c.max.x + 0.3 && z > c.min.z - 0.3 && z < c.max.z + 0.3)) continue;
      items.push({ x, z, r: rnd(), s: rnd(), c: 0.8 + rnd() * 0.35 });
    }
    const m4 = new THREE.Matrix4();
    const qq = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    const cells = new Map();
    for (const it of items) {
      const k = `${Math.floor(it.x / GRASS.cell)},${Math.floor(it.z / GRASS.cell)}`;
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(it);
    }
    for (const list of cells.values()) {
      const mesh = new THREE.InstancedMesh(grassGeo, this.grassMat, list.length);
      list.forEach((it, i) => {
        const h = GRASS.height[0] + it.s * (GRASS.height[1] - GRASS.height[0]);
        const w = GRASS.width[0] + it.r * (GRASS.width[1] - GRASS.width[0]);
        qq.setFromAxisAngle(up, it.r * Math.PI * 2);
        m4.compose(p.set(it.x, 0, it.z), qq, sc.set(w, h * (spec.height || 1), w));
        mesh.setMatrixAt(i, m4);
        mesh.setColorAt(i, col.copy(base).multiplyScalar(it.c));
      });
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.scene.add(mesh);
      this.meshes.push(mesh);
      (this.grassCells ||= []).push({ ...cellBounds(list, 1), mesh });
    }
    this.grassCount = items.length;
  }

  // Konteynerler: renk çeşidi ve harita hücresi başına bir InstancedMesh. Model 40 fit; çeşidin kutusu tabanı ortada orijine taşınır ve
  // eksen başına oyundaki kutuya ölçeklenir (uzunlukta ≈ 0,54: 20 fit). Uzunluk modelde z ekseninde; alongX ise
  // 90° döner. Kapılı uç konumdan türeyen yarım turla iki yana dağılır (her açılışta aynı)
  buildContainers() {
    const P = getContainerProp();
    // Renk ve hücre başına bir örnek ağı
    const groups = new Map();
    for (const c of this.containers) {
      const key = `${c.mat}|${Math.floor(c.x / RENDER.instanceCell)},${Math.floor(c.z / RENDER.instanceCell)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(c);
    }
    const m4 = new THREE.Matrix4();
    const base = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const p = new THREE.Vector3();
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (const [key, list] of groups) {
      const v = P.variants[key.split('|')[0]];
      v.box.getSize(size);
      v.box.getCenter(center);
      base.makeTranslation(-center.x, -v.box.min.y, -center.z).multiply(v.matrix);
      const mesh = new THREE.InstancedMesh(v.geometry, v.material, list.length);
      list.forEach((c, i) => {
        const flip = Math.sin(c.x * 12.9898 + c.z * 78.233 + c.y * 3.7) > 0 ? Math.PI : 0;
        const len = c.alongX ? c.w : c.d;
        const wid = c.alongX ? c.d : c.w;
        q.setFromAxisAngle(up, (c.alongX ? Math.PI / 2 : 0) + flip);
        sc.set(wid / size.x, c.h / size.y, len / size.z);
        p.set(c.x, c.y, c.z);
        m4.compose(p, q, sc).multiply(base);
        mesh.setMatrixAt(i, m4);
      });
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.prop = 'container';
      mesh.computeBoundingSphere();
      this.scene.add(mesh);
      this.meshes.push(mesh);
    }
  }
}
