// Çevrim içi teçhizat kuralı: sunucu (server/game/sim.js) bildirilen teçhizatı bununla doğrular, istemcinin maç öncesi
// teçhizat paneli (src/net/prepScreen.js) aynı listeyi gösterir; ikisi ayrı yazılırsa panel sunucunun reddedeceği
// silahı seçtirirdi. DOM, THREE ve rastgelelik yok.
import { WEAPONS, WEAPON_ORDER, ONLINE } from '../../src/config.js';

// Roket (çevrim içinde patlayıcı yok) ve çevrim içine kapalı silahlar (online: false: bıçak, minigun) seçilemez
export const ONLINE_WEAPONS = WEAPON_ORDER.filter((id) => WEAPONS[id] && WEAPONS[id].projectile !== 'rocket' && WEAPONS[id].online !== false);

// Bir yuvanın (primary | secondary) seçilebilir silahları, WEAPON_ORDER sırasıyla
export function onlineChoices(category) {
  return ONLINE_WEAPONS.filter((id) => WEAPONS[id].category === category);
}

// İstemcinin bildirdiği teçhizat → [ana, yan]; geçersiz yuva varsayılana döner
export function validLoadout(primary, secondary) {
  const p = ONLINE_WEAPONS.includes(primary) && WEAPONS[primary].category === 'primary' ? primary : ONLINE.defaultPrimary;
  const s = ONLINE_WEAPONS.includes(secondary) && WEAPONS[secondary].category === 'secondary' ? secondary : ONLINE.defaultSecondary;
  return [p, s];
}
