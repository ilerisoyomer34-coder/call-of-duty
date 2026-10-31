// Dost ateşi (oyuncunun mermisi, bıçağı ve patlayıcısı Alfa askerini yaralar): saf kurallar.
// Oyun bağlantısı weapons.js (mermi, bıçak), grenades.js (roket, alan hasarı), ally.js (takeDamage).
import { FRIENDLY_FIRE } from './config.js';
import { playerZoneAt } from './armor.js';

// Bölge: oyuncuda olduğu gibi isabetin askerin ayak seviyesinden yüksekliğinden (kafa / gövde / bacak)
export function allyZoneAt(pointY, ally) {
  return playerZoneAt(pointY - ally.pos.y, ally.state?.height || 1.8);
}

// Mermi: silahın menzile göre düşmüş hasarı × silahın bölge çarpanı (head/torso/limb; bacak limb sayılır)
export function friendlyBulletDamage(damage, zone, zones) {
  const key = zone === 'leg' ? 'limb' : zone;
  return damage * (zones?.[key] ?? 1) * FRIENDLY_FIRE.bulletMult;
}

// Oyuncunun patlayıcısı: alan hasarının dosta düşen payı (oyuncunun kendi bombasındaki oranla)
export function friendlyBlastDamage(damage) {
  return damage * FRIENDLY_FIRE.explosiveMult;
}

// "Bana ateş etme" satırı: otomatik ateşte her mermide değil, en sık complainSec aralıkla
export function shouldComplain(lastAt, now) {
  return now - lastAt >= FRIENDLY_FIRE.complainSec;
}
