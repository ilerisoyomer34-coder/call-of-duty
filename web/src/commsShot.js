// Sinematik telsiz görüntüsünün saf kuralları (commsCam.js; Node testi de buradan okur, three/soldier yüklemez)
import { COMMS_CAM as C } from './config.js';
import { clamp } from '../shared/sim/math.js';

// Telsiz satırının konuşanı → çekim türü. Komutanın kendi sözü ve genel sistem satırları (TELSİZ, POLİGON, İPUCU)
// çekilmez: konuşan biri yok
export function speakerShot(who, kind, ally) {
  if (ally) return 'ally';
  if (kind === 'warn' || kind === 'enemy') return 'enemy';
  const w = String(who || '').toLocaleUpperCase('tr-TR');
  if (w.startsWith('YUVA') || w.startsWith('KARARGÂH')) return 'hq';
  if (w.startsWith('PİLOT')) return 'pilot';
  return null;
}

// Satırın ekranda kalma süresi: okuma hızına göre, alt/üst sınırlı (sesli okuma sürerse uzar)
export function lineSeconds(text) {
  return clamp(C.minSec + String(text || '').length * C.perChar, C.minSec, C.maxSec);
}
