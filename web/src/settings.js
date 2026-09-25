// Oyuncu ayarları: varsayılanlar, yükleme/kaydetme (tarayıcı depolaması yoksa bellekte kalır).
import { storage } from './util.js';

const KEY = 'demirsafak.settings.v1';

export const DEFAULT_SETTINGS = {
  sensitivity: 1.0,
  adsSensitivity: 0.85,
  invertY: false,
  fov: 90,
  adsMode: 'hold', // 'hold' | 'toggle'
  crouchMode: 'toggle',
  sprintMode: 'hold',
  quality: 'auto', // 'auto' | 'low' | 'medium' | 'high'
  masterVolume: 0.8,
  sfxVolume: 1.0,
  ambientVolume: 0.6,
  cameraShake: true,
  headBob: true,
  crosshairColor: '#ffffff',
  blood: true,
  damageNumbers: false,
  showFps: false,
};

export function loadSettings() {
  const saved = storage.get(KEY, {});
  return { ...DEFAULT_SETTINGS, ...(saved && typeof saved === 'object' ? saved : {}) };
}

export function saveSettings(s) {
  storage.set(KEY, s);
}

export function resolveQuality(q, isTouch) {
  if (q !== 'auto') return q;
  if (isTouch) return 'low';
  const cores = navigator.hardwareConcurrency || 4;
  return cores >= 8 ? 'high' : 'medium';
}
