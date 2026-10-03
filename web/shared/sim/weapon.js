// Silah mantığının saf kısmı (belge §5.5): atış temposu, sapma (bloom), geri tepme deseni, mermi yönü.
// İstemci (src/weapons.js) ve sunucu aynı kuralları uygular. Görsel, ses, iz ve hasar uygulaması çağıranda kalır.
// Rastgelelik yalnız verilen Rng'den: sunucuda tohum hash(serverSecret, matchId, playerId, seq) ("nospread" önlemi).
import { DEG, clamp } from './math.js';
import { inCone } from './rng.js';

// Ardışık atış sayılmaz (desen başa döner): son atıştan bu kadar sonra
export const SHOT_CHAIN_GAP = 0.35;
// Sapma toparlanması son atıştan bu kadar sonra başlar
export const BLOOM_RECOVER_DELAY = 0.06;
// Bir adımda en çok atış (çok uzun karede ani yağmur olmasın)
export const MAX_SHOTS_PER_STEP = 4;

// Silahın atış durumu (src/weapons.js → Weapon bu alanları taşır)
export function createWeaponState(d) {
  return { mag: d.magSize, cooldown: 0, bloom: 0, shotIndex: 0, lastShot: -10, burstLeft: 0, modeIdx: 0 };
}

export const fireInterval = (d) => 60 / d.rpm;

// Atış yokken sapma toparlanır
export function recoverBloom(w, d, time, dt) {
  if (time - w.lastShot > BLOOM_RECOVER_DELAY) w.bloom = Math.max(0, w.bloom - d.spread.recovery * dt);
}

/**
 * Anlık sapma (derece): kalçadan/nişan, hareket, çömelme, havada olma ve bloom.
 * @param {object} s silahın spread tablosu
 * @param {number} bloom birikmiş sapma
 * @param {{ adsT: number, horizSpeed: number, crouched: boolean, grounded: boolean }} p oyuncu duruşu
 */
export function spreadDeg(s, bloom, p) {
  const base = s.hip;
  const ads = p.adsT;
  const speed = p.horizSpeed;
  let mult = 1;
  if (p.crouched) mult *= s.crouchMult;
  mult *= 1 + clamp(speed / 4, 0, 1.4) * (s.moveMult - 1);
  if (!p.grounded) mult *= s.airMult;
  const hipSpread = (base + bloom) * mult;
  const adsSpread = (base * s.adsMult + bloom * 0.45) * (p.grounded ? 1 : s.airMult * 0.6) * (1 + clamp(speed / 4, 0, 1.4) * (s.moveMult - 1) * 0.6);
  return hipSpread + (adsSpread - hipSpread) * ads;
}

/**
 * Tetik temposu: bu adımda kaç atış yapılacağını belirler, her atışta fire() çağrılır.
 * auto: basılı tutuldukça; semi: tampondaki basışla tek; burst: basışla burstCount atış.
 * @param {object} w silah durumu (cooldown, burstLeft, mag)
 * @param {object} d silah verisi
 * @param {string} mode 'auto' | 'semi' | 'burst'
 * @param {boolean} held tetik basılı
 * @param {boolean} buffered kısa süre önce basıldı (yarı otomatikte tıklama hatırlanır)
 * @param {() => boolean} hasAmmo
 * @param {() => void} fire tek atış (şarjörü düşürür, recordShot'u çağırır)
 * @returns {{ shots: number, usedBuffer: boolean }}
 */
export function triggerShots(w, d, mode, held, buffered, hasAmmo, fire) {
  let shots = 0;
  let usedBuffer = false;
  if (mode === 'auto') {
    while (held && w.cooldown <= 0 && hasAmmo() && shots < MAX_SHOTS_PER_STEP) {
      fire();
      w.cooldown += fireInterval(d);
      shots++;
    }
  } else if (mode === 'semi') {
    if (buffered && w.cooldown <= 0) {
      usedBuffer = true;
      fire();
      w.cooldown = Math.max(w.cooldown, 0) + fireInterval(d);
      shots++;
    }
  } else if (mode === 'burst') {
    if (buffered && w.cooldown <= 0 && w.burstLeft === 0) {
      usedBuffer = true;
      w.burstLeft = d.burstCount;
    }
    while (w.burstLeft > 0 && w.cooldown <= 0 && hasAmmo() && shots < MAX_SHOTS_PER_STEP) {
      fire();
      w.burstLeft--;
      w.cooldown += 60 / d.burstRpm;
      if (w.burstLeft === 0) w.cooldown += d.burstDelay;
      shots++;
    }
    if (w.mag <= 0) w.burstLeft = 0;
  }
  return { shots, usedBuffer };
}

// Atış anında: desen sırası (ara verilirse başa), son atış zamanı. Dönüş: bu atışın sırası
export function recordShot(w, time) {
  w.shotIndex = time - w.lastShot > SHOT_CHAIN_GAP ? 0 : w.shotIndex + 1;
  w.lastShot = time;
  return w.shotIndex;
}

// Atıştan sonra sapma birikir
export function addBloom(w, d) {
  w.bloom = Math.min(d.spread.max, w.bloom + d.spread.perShot);
}

/**
 * Geri tepme tekmesi (derece): silaha özgü sabit desen + küçük rastgele pay.
 * Desen bitince son dört adım döner (uzun spreyde aynı salınım).
 * @returns {[number, number]} [pitch, yaw] — out dizisine yazılır
 */
export function recoilKick(d, shotIndex, ads, crouched, rng, out = [0, 0]) {
  const pat = d.recoil.pattern;
  const idx = shotIndex < pat.length ? shotIndex : pat.length - 4 + (shotIndex % 4);
  const [rx, ry] = pat[Math.max(0, idx)];
  const rm = 1 + (d.recoil.adsMult - 1) * ads;
  const rnd = d.recoil.random;
  // Sıra önemli (tekrar oynatmada aynı dizi): önce dikey, sonra yatay rastgele pay
  const rp = rng.range(-rnd, rnd);
  const ry2 = rng.range(-rnd, rnd);
  out[0] = (ry + rp * 0.5) * rm * (crouched ? 0.85 : 1);
  out[1] = (rx + ry2) * rm;
  return out;
}

// Mermi (ya da saçma tanesi) yönü: tek mermide merkeze yığılmalı koni, saçmada geniş ve düz koni
export function pelletDir(fwd, d, spread, rng, out) {
  if (d.pellets > 1) return inCone(fwd, (d.pelletSpread + spread * 0.35) * DEG, out, 0.8, rng);
  return inCone(fwd, spread * DEG, out, 1.3, rng);
}
