// Silah görselleri (Operasyon Güncellemesi §5.4). Kartta görünen silah oyundakiyle birebir aynı olsun diye
// görseller oyunun kendi modellerinden üretilir:
//  1. Hazır PNG: assets/ui/weapons/<id>.png pakette varsa o kullanılır (ör. Blender'dan alınmış çizim).
//  2. Stüdyo çizimi: ayrı bir sahnede, yandan (namlu sağa), hafif önden ve yukarıdan, üç ışık + kenar ışığıyla
//     şeffaf zemine çizilir; iki kat büyük çizilip küçültülür (kenar yumuşatma) ve önbelleğe alınır.
//  3. Hiçbiri olmazsa sınıfa özgü siluet (konsola bir kez uyarı); ekran asla boş ya da kırık kalmaz.
// Çizim ayrı, tembel kurulan ve sayfaya eklenmeyen bir WebGLRenderer'la yapılır: oyunun ana bağlamının
// durumuna ve gölgelendirici önbelleğine dokunulmaz. Aynı tuval sağ paneldeki dönen önizlemeyi de çizer;
// her kare görünür 2B tuvale kopyalanır. Teçhizat ekranı ilk açılana kadar hiçbir şey kurulmaz.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { WEAPONS, WEAPON_VIEW as V } from './config.js';
import { buildWeapon } from './models.js';
import { loadWeaponAsset, assetIdFor, assetImageUrl } from './assets.js';
import { weaponSilhouette } from './weaponInfo.js';
import { warnOnce } from './util.js';

const DEG = Math.PI / 180;
const _box = new THREE.Box3();
const _v = new THREE.Vector3();
const _c = new THREE.Vector3();

// Sınıf siluetleri (yan görünüş, namlu sağa). <img> içinde CSS değişkeni işlemediği için renk sabit.
const SIL_COLOR = '#c9b98f';
const SIL = {
  rifle: 'M8 30h46l4-3h18v6l-14 2-3 3h-6l-3 13h-8l2-13H30l-6 10h-9l5-10H8z',
  smg: 'M14 30h40l3-3h14v6l-12 2-3 3h-5l-2 12h-7l1-12H34l-4 8h-8l3-8h-11z',
  shotgun: 'M6 31h60l3-2h9v5l-11 1v3H40l-3 9h-7l2-9H24l-8 7H8l6-7H6z',
  lmg: 'M6 28h52l3-3h17v6l-16 2-2 4h-8l-2 12h-8l2-12H32l-3 4h-8l-6 6H7l5-6H6z M42 37l-6 14h3l6-14z',
  sniper: 'M4 30h62l2-2h10v5l-12 1-3 3h-6l-3 10h-7l2-10H28l-8 8h-9l6-8H4z M34 22h16v5H34z',
  pistol: 'M24 26h34v8H46l-4 16h-9l3-16h-12z',
  launcher: 'M4 28h70l4 2-4 2H4z M26 32h6l-2 10h-5z M44 32h6l-2 10h-5z',
  knife: 'M10 34h20l4-3h36l-8 6H34l-4-2H10z',
};

function silhouetteUrl(id) {
  const path = SIL[weaponSilhouette(id)] || SIL.rifle;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 60"><path d="${path}" fill="${SIL_COLOR}" fill-opacity=".55" stroke="${SIL_COLOR}" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const nextFrame = () => new Promise((r) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : setTimeout(r, 16)));

// Stüdyo: ışıklar, ortam, kamera ve tek tuval. Kurulamazsa (WebGL yok, bağlam sınırı) null.
class Studio {
  constructor() {
    const canvas = document.createElement('canvas');
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power', preserveDrawingBuffer: false });
    this.r.setPixelRatio(1);
    this.r.setClearColor(0x000000, 0);
    this.r.toneMapping = THREE.ACESFilmicToneMapping;
    this.r.toneMappingExposure = V.exposure;
    this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(this.r);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = V.envIntensity;
    pm.dispose();
    // Üç nokta ışık: sıcak ana ışık önden-üstten, soğuk dolgu karşıdan, arkadan ince kenar ışığı
    const key = new THREE.DirectionalLight(0xfff0dc, 2.4);
    key.position.set(3, 4, -2);
    const fill = new THREE.DirectionalLight(0xc8d8ff, 0.8);
    fill.position.set(2, 0.5, 4);
    const rim = new THREE.DirectionalLight(0xffffff, 2.6);
    rim.position.set(-4, 2.5, 0.5);
    this.scene.add(key, fill, rim, new THREE.HemisphereLight(0xdfe6ef, 0x3a342c, 0.35));
    this.camera = new THREE.PerspectiveCamera(V.fov, 2, 0.01, 50);
    this.slot = new THREE.Group(); // o anda çizilen model
    this.scene.add(this.slot);
  }

  // Kamerayı modelin yanına (namlu sağa) koy; bakış yönü yaw/pitch ile hafif önden ve üstten
  aim(dist, yaw = V.yawDeg * DEG, pitch = V.pitchDeg * DEG) {
    this.camera.position.set(Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.sin(yaw) * Math.cos(pitch)).multiplyScalar(dist);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld(true);
  }

  // Modeli ortala ve izdüşümü çerçevenin `fill` oranını dolduracak uzaklığı bul (iki yinelemeli yaklaşım)
  frame(obj, aspect) {
    this.slot.clear();
    const holder = new THREE.Group();
    holder.add(obj);
    this.slot.add(holder);
    holder.updateMatrixWorld(true);
    _box.setFromObject(holder);
    _box.getCenter(_c);
    holder.position.sub(_c);
    holder.updateMatrixWorld(true);
    _box.setFromObject(holder);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    let dist = _box.getSize(_v).length() * 2;
    for (let k = 0; k < 3; k++) {
      this.aim(dist);
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < 8; i++) {
        _v.set(i & 1 ? _box.max.x : _box.min.x, i & 2 ? _box.max.y : _box.min.y, i & 4 ? _box.max.z : _box.min.z).project(this.camera);
        minX = Math.min(minX, _v.x);
        maxX = Math.max(maxX, _v.x);
        minY = Math.min(minY, _v.y);
        maxY = Math.max(maxY, _v.y);
      }
      const ext = Math.max((maxX - minX) / 2, (maxY - minY) / 2);
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const d0 = dist;
      dist *= ext / V.fill;
      // İzdüşüm merkezi kaymasın: modeli kameranın sağ/üst eksenleri boyunca ters yöne it
      if (k === 2) break;
      const tanH = Math.tan((V.fov * DEG) / 2);
      const right = _v.setFromMatrixColumn(this.camera.matrixWorld, 0);
      holder.position.addScaledVector(right, -cx * d0 * tanH * aspect);
      const up = _v.setFromMatrixColumn(this.camera.matrixWorld, 1);
      holder.position.addScaledVector(up, -cy * d0 * tanH);
      holder.updateMatrixWorld(true);
      _box.setFromObject(holder);
    }
    this.aim(dist);
    return holder;
  }

  render(w, h) {
    if (this.r.domElement.width !== w || this.r.domElement.height !== h) this.r.setSize(w, h, false);
    this.r.render(this.scene, this.camera);
  }
}

let studio; // undefined: kurulmadı · null: kurulamadı
function getStudio() {
  if (studio !== undefined) return studio;
  try {
    studio = new Studio();
  } catch (e) {
    studio = null;
    warnOnce('weapon-studio', `Silah görselleri çizilemiyor, siluet kullanılıyor (${e.message})`);
  }
  return studio;
}

// Modelin kendisi: GLB silah (yüklenemezse oyundaki gibi prosedürel yedek) ya da prosedürel model
async function modelFor(id) {
  const d = WEAPONS[id];
  if (d.model === 'glb') {
    try {
      return await loadWeaponAsset(assetIdFor(d));
    } catch (e) {
      warnOnce(`icon-glb-${id}`, `${id}: model yüklenemedi, yedek modelle çiziliyor (${e.message})`);
    }
  }
  return buildWeapon(id).root;
}

// Simgeler sırayla, karede bir tane üretilir: ekran açılırken takılma olmasın
const icons = new Map(); // id → Promise<{ url, kind: 'png' | 'render' | 'silhouette' }>
let queue = Promise.resolve();

async function renderIcon(id) {
  const S = getStudio();
  if (!S) return { url: silhouetteUrl(id), kind: 'silhouette' };
  await nextFrame();
  const { width: W, height: H, supersample: k } = V.icon;
  S.frame(await modelFor(id), W / H);
  S.render(W * k, H * k);
  // Çizim tamponu aynı görev içinde geçerli: hemen küçültülerek 2B tuvale kopyalanır
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(S.r.domElement, 0, 0, W, H);
  S.slot.clear();
  // data: adresi (blob: değil): Artifact'ın içerik güvenliği kuralı blob görsellerine izin vermeyebilir.
  // WebP saydamlığı korur ve PNG'den küçüktür; desteklemeyen tarayıcı kendiliğinden PNG verir.
  return { url: c.toDataURL('image/webp', 0.92), kind: 'render' };
}

export function weaponIcon(id) {
  if (!icons.has(id)) {
    const png = assetImageUrl(`assets/ui/weapons/${id}.png`);
    let p;
    if (png) p = Promise.resolve({ url: png, kind: 'png' });
    else {
      p = queue.then(() => renderIcon(id)).catch((e) => {
        warnOnce(`icon-${id}`, `${id} görseli çizilemedi, siluet kullanılıyor (${e.message})`);
        return { url: silhouetteUrl(id), kind: 'silhouette' };
      });
      queue = p;
    }
    icons.set(id, p);
  }
  return icons.get(id);
}

// Hemen gösterilecek yer tutucu (çizim gelene kadar)
export function weaponPlaceholder(id) {
  return silhouetteUrl(id);
}

// Sağ paneldeki dönen önizleme: görünür bir 2B tuvale her kare stüdyo çizimi kopyalanır.
// Kendiliğinden yavaşça döner; fare/parmakla sürüklenince çevrilir, bırakınca bir süre sonra döner.
export class WeaponPreview {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.id = null;
    this.holder = null;
    this.yaw = 0;
    this.pitch = 0;
    this.idleT = V.previewResume;
    this.drag = null;
    this.running = false;
    this.token = 0;
    this.last = 0;
    this.dist = 1;
    this.rH = 1;
    this.rV = 1;
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', (e) => {
      this.drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
      canvas.setPointerCapture?.(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.drag || e.pointerId !== this.drag.id) return;
      this.yaw += (e.clientX - this.drag.x) * V.dragSens;
      this.pitch = Math.max(-V.maxPitchDeg * DEG, Math.min(V.maxPitchDeg * DEG, this.pitch + (e.clientY - this.drag.y) * V.dragSens));
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
      this.idleT = 0;
    });
    const end = () => {
      this.drag = null;
      this.idleT = 0;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  get available() {
    return !!getStudio();
  }

  async show(id) {
    this.id = id;
    const t = ++this.token;
    const S = getStudio();
    if (!S) return false;
    const obj = await modelFor(id);
    if (t !== this.token) return true; // bu arada başka silah seçildi
    this.obj = obj;
    this.yaw = 0;
    this.pitch = 0;
    this.idleT = V.previewResume;
    this.fitted = false;
    this.start();
    return true;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      // Ekran gizlendiyse ya da tuval sayfadan çıktıysa döngü durur (açılınca start() yeniden çağrılır)
      if (!this.canvas.isConnected || this.canvas.closest('[hidden]')) {
        this.running = false;
        return;
      }
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.draw(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
  }

  // Modeli kendi tutucusunda merkezle (tutucu döner, model ekseni merkezden geçer)
  place(S) {
    const h = this.holder || (this.holder = new THREE.Group());
    if (this.obj.parent !== h) {
      h.clear();
      h.rotation.set(0, 0, 0);
      h.add(this.obj);
      this.obj.position.set(0, 0, 0);
      h.updateMatrixWorld(true);
      _box.setFromObject(h);
      this.obj.position.copy(_box.getCenter(_c)).negate();
      _box.getSize(_v);
      // Dikey eksende döndüğü için yatayda yarı uzunluk, dikeyde yarı yükseklik + eğilmeyle açılan pay
      this.rH = Math.hypot(_v.x, _v.z) / 2;
      this.rV = _v.y / 2 + this.rH * Math.sin((V.maxPitchDeg + V.pitchDeg) * DEG);
    }
    S.slot.clear();
    S.slot.add(h);
    this.fitted = true;
  }

  draw(dt) {
    const S = getStudio();
    if (!S || !this.obj) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    let h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    const k = Math.min(1, V.previewMaxPx / Math.max(w, h));
    w = Math.round(w * k);
    h = Math.round(h * k);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.fitted = false;
    }
    // Stüdyo arada simge çizmiş olabilir: önizleme tutucusu yuvada değilse yeniden yerleştir
    if (!this.fitted || S.slot.children[0] !== this.holder) this.place(S);
    // Dönerken hiçbir açıda taşmasın: yatay yarıçap yatay görüşe, dikey pay dikey görüşe sığar;
    // namlu kameraya dönünce yakın uç büyüyeceği için yatay yarıçap kadar geri çekilir
    const tanV = Math.tan((V.fov * DEG) / 2);
    this.dist = Math.max(this.rH / (V.fill * tanV * (w / h)), this.rV / (V.fill * tanV)) + this.rH * 0.5;
    if (!this.drag) {
      this.idleT += dt;
      if (this.idleT >= V.previewResume) this.yaw += V.previewSpin * dt;
    }
    this.holder.rotation.set(0, this.yaw, 0);
    S.camera.aspect = w / h;
    S.camera.updateProjectionMatrix();
    S.aim(this.dist, V.yawDeg * DEG, V.pitchDeg * DEG + this.pitch);
    S.render(w, h);
    this.ctx.clearRect(0, 0, w, h);
    this.ctx.drawImage(S.r.domElement, 0, 0);
  }
}
