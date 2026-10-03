// Harici modeller ve dokular: Blender'dan dışa aktarılan silahlar ve asset kütüphanesinden gelen
// iskeletli asker. Bağımsız sürümde base64 olarak pakete gömülür (tek dosya, çevrimdışı);
// Artifact sürümünde sayfanın yanında yayımlanan dosyalardan okunur. Yüklenemezse prosedürel
// model yerinde kalır, oyun açılmaya devam eder.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import WEAPON_ASSETS from './weaponAssets.json';
import CHARACTER_ASSETS from './characterAssets.json';
import PROP_ASSETS from './propAssets.json';
import GAME_ASSETS from 'virtual:game-assets';
import { warnOnce } from './util.js';

export { WEAPON_ASSETS, CHARACTER_ASSETS, PROP_ASSETS };
const cache = new Map();
const loader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();
const FETCH_TIMEOUT_MS = 20000;
// Donanımın en yüksek anizotropisi (Game kurulurken bildirilir): silah ve asker dokuları eğik açıda keskin kalsın
let maxAniso = 4;
export function setMaxAnisotropy(n) {
  maxAniso = n;
}

function decodeBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

// path: 'assets/weapons/mar556.glb' gibi → ArrayBuffer
async function readBinary(path) {
  const src = GAME_ASSETS.files[path];
  if (!src) throw new Error(`${path} pakette yok`);
  if (GAME_ASSETS.mode === 'embed') return decodeBase64(src);
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ctl?.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(src, ctl ? { signal: ctl.signal } : undefined);
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    // Artifact .glb sunmaz: GLB'ler base64 metin olarak (.glb.txt) yayımlanır
    return src.endsWith('.txt') ? decodeBase64((await res.text()).trim()) : await res.arrayBuffer();
  } finally {
    clearTimeout(timer);
  }
}

function parseGltf(buffer) {
  return new Promise((resolve, reject) => loader.parse(buffer, '', resolve, reject));
}

// Hazır görsel (ör. assets/ui/weapons/<id>.png): pakette varsa <img> adresi, yoksa null
export function assetImageUrl(path) {
  const src = GAME_ASSETS.files[path];
  if (!src) return null;
  if (GAME_ASSETS.mode !== 'embed') return src;
  return `data:${/\.png$/i.test(path) ? 'image/png' : 'image/jpeg'};base64,${src}`;
}

// Doku <img> ile yüklenir (blob/fetch gerektirmez): gömülüde data: adresi, Artifact'ta göreli dosya
export function loadTexture(path, { srgb = true, flipY = false } = {}) {
  const src = GAME_ASSETS.files[path];
  if (!src) return Promise.reject(new Error(`${path} pakette yok`));
  const mime = /\.png$/i.test(path) ? 'image/png' : 'image/jpeg';
  const url = GAME_ASSETS.mode === 'embed' ? `data:${mime};base64,${src}` : src;
  return textureLoader.loadAsync(url).then((t) => {
    t.flipY = flipY; // glTF UV'leri üstten başlar
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = maxAniso;
    t.needsUpdate = true;
    return t;
  });
}

// Malzeme düzeltmeleri: cam/lens saydam olsun, dürbün içinden görülebilsin
function prepareWeapon(scene) {
  scene.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = false;
    o.receiveShadow = false;
    o.frustumCulled = false;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (/cam|glass|lens/i.test(m.name)) {
        m.transparent = true;
        m.opacity = 0.18;
        m.depthWrite = false;
        m.metalness = 0.2;
        m.roughness = 0.05;
      }
      // Blender'da çok koyu tabanlı metaller ortam yansımasıyla okunur hale gelsin
      m.envMapIntensity = 1.0;
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) if (m[k]) m[k].anisotropy = maxAniso;
      if ('transmission' in m) m.transmission = 0;
    }
  });
  return scene;
}

// Ayrı JPEG dokuları malzeme adına göre bağla (Sketchfab silahları: renk, normal, pürüz/metal, ortam gölgesi, ışıma).
// GLB dokusuz gelir (Artifact CSP blob adresine izin vermez); doku inmezse malzeme düz renkte kalır
async function applyTextureSpec(scene, materials) {
  if (!materials) return;
  const texCache = new Map();
  const tex = (path, srgb) => {
    if (!path) return Promise.resolve(null);
    const k = `${path}|${srgb}`;
    if (!texCache.has(k)) texCache.set(k, loadTexture(path, { srgb }).catch((e) => (warnOnce(`tex-${path}`, `${path} yüklenemedi (${e.message})`), null)));
    return texCache.get(k);
  };
  const done = new Set();
  const jobs = [];
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    const spec = materials[m.name];
    if (!spec || done.has(m)) return;
    done.add(m);
    const tangents = !!o.geometry.attributes.tangent;
    jobs.push(
      Promise.all([tex(spec.map, true), tex(spec.normalMap, false), tex(spec.ormMap, false), tex(spec.aoMap, false), tex(spec.emissiveMap, true)]).then(([map, normalMap, orm, ao, emissive]) => {
        if (map) m.map = map;
        if (normalMap) {
          m.normalMap = normalMap;
          // glTF normal haritası: teğet yoksa three.js türev teğetlerle Y'yi ters okur (GLTFLoader da böyle düzeltir)
          if (!tangents) m.normalScale.y = -Math.abs(m.normalScale.y);
        }
        if (orm) {
          m.roughnessMap = orm; // yeşil kanal
          m.metalnessMap = orm; // mavi kanal
        }
        if (ao) m.aoMap = ao; // kırmızı kanal
        if (emissive) m.emissiveMap = emissive;
        m.needsUpdate = true;
      })
    );
  });
  await Promise.all(jobs);
}

// assetId → Promise<THREE.Group> (her çağrıda bağımsız kopya)
export function loadWeaponAsset(assetId) {
  const key = `weapon:${assetId}`;
  if (!cache.has(key)) {
    const entry = WEAPON_ASSETS[assetId];
    const p = entry
      ? readBinary(entry.file)
          .then(parseGltf)
          .then(async (g) => {
            await applyTextureSpec(g.scene, entry.materials);
            return prepareWeapon(g.scene);
          })
      : Promise.reject(new Error(`${assetId} kaydı yok`));
    cache.set(key, p);
  }
  return cache.get(key).then((scene) => scene.clone(true));
}

export function assetIdFor(weaponData) {
  return weaponData.asset || weaponData.id;
}

// Görünüm modeli için yardımcı noktalar (oyun koordinatları)
export function rigFor(assetId) {
  const r = WEAPON_ASSETS[assetId];
  if (!r) return null;
  const v = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  return {
    muzzle: v(r.points.muzzle),
    sight: v(r.points.sight),
    leftHand: v(r.points.leftHand),
    eject: v(r.points.eject),
    length: r.length,
  };
}

export function preloadWeapons(weapons, onLoaded) {
  for (const d of Object.values(weapons)) {
    if (d.model !== 'glb') continue;
    const id = assetIdFor(d);
    loadWeaponAsset(id)
      .then((scene) => onLoaded(d.id, scene))
      .catch((e) => warnOnce(`glb-${id}`, `${d.name}: model yüklenemedi, yedek model kullanılıyor (${e.message})`));
  }
}

// İskeletli karakter: { scene, animations } şablonu (kopyalamak için SkeletonUtils.clone kullanılır).
// Dokular malzeme adına göre characterAssets.json'dan bağlanır; doku inmezse model dokusuz kalır.
export function loadCharacterAsset(id) {
  const key = `character:${id}`;
  if (!cache.has(key)) {
    const entry = CHARACTER_ASSETS[id];
    const p = (async () => {
      if (!entry) throw new Error(`${id} kaydı yok`);
      const gltf = await parseGltf(await readBinary(entry.file));
      const texCache = new Map();
      const tex = (path, srgb) => {
        if (!path) return Promise.resolve(null);
        const k = `${path}|${srgb}`;
        if (!texCache.has(k))
          texCache.set(k, loadTexture(path, { srgb }).catch((e) => (warnOnce(`tex-${path}`, `${path} yüklenemedi (${e.message})`), null)));
        return texCache.get(k);
      };
      const jobs = [];
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        const m = o.material;
        const spec = entry.materials[m.name];
        if (!spec) return;
        jobs.push(
          Promise.all([tex(spec.map, true), tex(spec.normalMap, false)]).then(([map, normalMap]) => {
            if (map) {
              m.map = map;
              m.color.setRGB(1, 1, 1);
            }
            if (normalMap) m.normalMap = normalMap;
            m.needsUpdate = true;
          })
        );
      });
      await Promise.all(jobs);
      return { scene: gltf.scene, animations: gltf.animations };
    })();
    cache.set(key, p);
  }
  return cache.get(key);
}

// Hazır araç/eşya modeli (Sketchfab, tools/prepare-prop.mjs): sahne şablonu. İskelet yok; kopyası
// Object3D.clone ile alınır, malzemeler kopyalar arasında paylaşılır
export function loadPropAsset(id) {
  const key = `prop:${id}`;
  if (!cache.has(key)) {
    const entry = PROP_ASSETS[id];
    cache.set(
      key,
      (async () => {
        if (!entry) throw new Error(`${id} kaydı yok`);
        const gltf = await parseGltf(await readBinary(entry.file));
        return gltf.scene;
      })()
    );
  }
  return cache.get(key);
}
