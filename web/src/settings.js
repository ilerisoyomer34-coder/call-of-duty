// Oyuncu ayarları: varsayılanlar, yükleme/kaydetme. Ayarlar ortak kaydın (save.js) settings alanında
// durur; depolama kapalıysa bellekte kalır.
import { getSave } from './save.js';

export const DEFAULT_SETTINGS = {
  sensitivity: 1.0,
  adsSensitivity: 0.85,
  invertY: false,
  fov: 90,
  adsMode: 'hold', // 'hold' | 'toggle'
  crouchMode: 'toggle',
  sprintMode: 'hold',
  quality: 'auto', // 'auto' | 'low' | 'medium' | 'high'
  renderScale: 'auto', // dünya çözünürlüğü: 'auto' ya da '1' | '0.85' | '0.7' | '0.5' (eller ve silah hep tam)
  masterVolume: 0.8,
  sfxVolume: 1.0,
  ambientVolume: 0.6,
  cameraShake: true,
  headBob: true,
  crosshairColor: '#ffffff',
  blood: true,
  damageNumbers: false,
  showFps: false,
  realNames: true, // silahların gerçek adı; kapalıyken kurgusal ad (data/weapons.json → altName)
  wheelSlowMo: 0.3, // komut çarkı açıkken oyun saatinin çarpanı (1 = yavaşlatma yok)
  chatSlowMo: 0.3, // telsiz satırına yazarken oyun saatinin çarpanı
  tts: false, // askerlerin telsiz repliklerini seslendir (speechSynthesis, tr-TR)
  voiceCommands: true, // N basılı sesli komut (tarayıcı desteklemiyorsa arayüzde görünmez)
  rerollBonuses: false, // bitirilmiş bölüm tekrar oynanınca bonus görevler havuzdan rastgele seçilir
  serverUrl: '', // çevrim içi sunucu adresi; boşsa config.js → NET.serverUrl (geliştirme ve test için)
  onlineMode: 'tdm', // takımsızken "Maç ara"nın modu (takımda modu lider seçer)
  bindings: {}, // tuş atamaları: eylem → tuş kodları (input.js → BINDINGS'in üstüne yazılır)
};

export function loadSettings() {
  const saved = getSave().data.settings;
  const s = { ...DEFAULT_SETTINGS, ...(saved && typeof saved === 'object' ? saved : {}) };
  // Yükleme ekranındaki "Düşük grafikle aç" düğmesi: depolama kapalıysa pencere adıyla gelir
  if (typeof window !== 'undefined' && window.name === 'demirsafak-low') s.quality = 'low';
  return s;
}

export function saveSettings(s) {
  getSave().update((d) => (d.settings = { ...s }), { now: true });
}

// Dokunmatikte otomatik seçim "orta": dünya düşük çözünürlükte çizilse de eller ve silah keskin kalır
export function resolveQuality(q, isTouch) {
  if (q !== 'auto') return q;
  if (isTouch) return 'medium';
  const cores = navigator.hardwareConcurrency || 4;
  return cores >= 8 ? 'high' : 'medium';
}
