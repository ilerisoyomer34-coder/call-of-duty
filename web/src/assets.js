// Blender'dan dışa aktarılan silah modelleri (GLB). Derlemede base64 olarak gömülür
// (tek dosyalık oyun çevrimdışı çalışsın diye); yüklenemezse prosedürel model yerinde kalır.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import WEAPON_ASSETS from './weaponAssets.json';
import GLB_DATA from 'virtual:weapon-glbs';
import { warnOnce } from './util.js';

export { WEAPON_ASSETS };
const cache = new Map();
const loader = new GLTFLoader();

function decodeBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

// Malzeme düzeltmeleri: cam/lens saydam olsun, dürbün içinden görülebilsin
function prepare(scene) {
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
      if ('transmission' in m) m.transmission = 0;
    }
  });
  return scene;
}

// assetId → Promise<THREE.Group> (her çağrıda bağımsız kopya)
export function loadWeaponAsset(assetId) {
  if (!cache.has(assetId)) {
    const b64 = GLB_DATA[assetId];
    const p = new Promise((resolve, reject) => {
      if (!b64) {
        reject(new Error(`${assetId}.glb bulunamadı`));
        return;
      }
      loader.parse(decodeBase64(b64), '', (gltf) => resolve(prepare(gltf.scene)), reject);
    });
    cache.set(assetId, p);
  }
  return cache.get(assetId).then((scene) => scene.clone(true));
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
