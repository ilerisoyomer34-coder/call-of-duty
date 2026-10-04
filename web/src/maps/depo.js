// Depo: çevrim içi maç arenası (S6). 72×72 m konteyner deposu, gün batımı (Liman ortamı).
// Harita merkeze göre nokta simetrik: (x, z) → (−x, −z). İki taraf aynı siperleri ve yolları bulur.
//
// Kuşbakışı (kuzey yukarıda, -Z):
//   z=-36 ══════════════ duvar (önünde istif konteynerler) ══════════════
//   z=-31   KIRMIZI DOĞUŞ · önünde siper hattı (konteyner, beton bariyer)
//   z=-12   batı sokağı        konteyner istifi (doğu)       doğu sokağı
//   z=  0   [OFİS]  ······  [ AMBAR (iki kapı) ]  ······  [OFİS]
//   z= 12   batı sokağı   konteyner istifi (batı)            doğu sokağı
//   z= 31   MAVİ DOĞUŞ · önünde siper hattı
//   z= 36 ══════════════ duvar ══════════════
// Doğuşlar birbirini görmez: orta hat ambarla, yan hatlar istiflerle kesilir. Doğuş ve gezinme noktaları
// veride (data/arenas.json → depo); sunucu aynı dosyayı okur.
import { wall, house, container, sandbags, jersey, crate, lampPost, fuelTank, horizon, skyline, ground, roadLines } from './kit.js';

const HALF = 36;
const WALL_H = 5;

// Kapı/pencere açıklıklarının aynası: kuzey ↔ güney, doğu ↔ batı; duvar boyunca konum da ters döner
const flip = (list) => (list || []).map((o) => ({ ...o, at: -o.at }));
const mirrorOps = (ops) => ({ n: flip(ops.s), s: flip(ops.n), e: flip(ops.w), w: flip(ops.e) });

export function build(W) {
  W.bounds = { minx: -HALF - 2, maxx: HALF + 2, minz: -HALF - 2, maxz: HALF + 2 };
  ground(W, 400, 'asphalt');
  // Ufuk: şehir silueti ve tepeler (çarpışmasız; duvarın üstünden görünür)
  horizon(W, { mat: 'rock', tint: 0x5a4c50, rockTint: 0x4a3e44, mounds: false, r0: 210, peak: 1.2 });
  skyline(W, -200, -110, -200, 200, 18, 11, 0x3c3640);
  skyline(W, 110, 200, -200, 200, 18, 23, 0x3c3640);
  roadLines(W, 0, -30, 24);
  roadLines(W, -20, -30, 24);
  roadLines(W, 20, -30, 24);

  // Nokta simetrik yerleşim: her öğe kendisi ve aynası
  const both = (fn) => {
    fn(1);
    fn(-1);
  };

  // --- Dış duvar ---
  W.block(0, 0, -HALF - 0.5, HALF * 2 + 2, WALL_H, 1, 'concreteDark', 'concrete');
  W.block(0, 0, HALF + 0.5, HALF * 2 + 2, WALL_H, 1, 'concreteDark', 'concrete');
  W.block(-HALF - 0.5, 0, 0, 1, WALL_H, HALF * 2, 'concreteDark', 'concrete');
  W.block(HALF + 0.5, 0, 0, 1, WALL_H, HALF * 2, 'concreteDark', 'concrete');
  // Duvar dibinde istif konteynerler (görünüm ve köşe siperi)
  both((k) => {
    container(W, -20 * k, -34.6 * k, true, k > 0 ? 'contOrange' : 'contGrey');
    container(W, -20 * k, -34.6 * k, true, k > 0 ? 'contGreen' : 'contRed', 2.6);
    container(W, 34.6 * k, -18 * k, false, 'contGrey');
    container(W, 34.6 * k, 6 * k, false, k > 0 ? 'contBlue' : 'contOrange');
    container(W, 34.6 * k, 6 * k, false, 'contGrey', 2.6);
    fuelTank(W, -33.6 * k, -33.6 * k, 1.5, 3.2);
  });

  // --- Orta: ambar (kuzey ve güney kapıları çapraz, doğu–batı pencereler) ---
  house(W, 0, 0, 10, 7, 3.4, 'brick', {
    n: [{ at: -2.2, width: 1.8, type: 'door' }],
    s: [{ at: 2.2, width: 1.8, type: 'door' }],
    e: [{ at: 0, width: 1.6, type: 'window' }],
    w: [{ at: 0, width: 1.6, type: 'window' }],
  });
  both((k) => {
    crate(W, -2.6 * k, 1.4 * k, 1.1);
    crate(W, 3.4 * k, 1.9 * k, 0.8, 0, 0.5);
  });

  // --- Yan ofisler (batıda doğuya ve kuzeye kapı; doğudaki ayna) ---
  const officeOps = {
    e: [{ at: 0, width: 1.8, type: 'door' }],
    n: [{ at: 1.5, width: 1.6, type: 'door' }],
    s: [{ at: -1.5, width: 1.4, type: 'window' }],
    w: [{ at: 2, width: 1.2, type: 'window' }],
  };
  house(W, -27, 0, 8, 9, 3.2, 'plasterWhite', officeOps);
  house(W, 27, 0, 8, 9, 3.2, 'plasterWhite', mirrorOps(officeOps));
  both((k) => crate(W, -28.5 * k, -2.5 * k, 1.0));

  // --- Konteyner istifleri: yan hatları keser ---
  both((k) => {
    container(W, -14 * k, 10 * k, false, k > 0 ? 'contGrey' : 'contRed');
    container(W, -14 * k, 10 * k, false, k > 0 ? 'contGreen' : 'contBlue', 2.6);
    container(W, -14 * k, -13 * k, false, k > 0 ? 'contRed' : 'contGrey');
    container(W, 20 * k, 21 * k, true, 'contOrange');
    container(W, -21 * k, -21 * k, true, k > 0 ? 'contBlue' : 'contGreen');
  });

  // --- Alçak siperler (orta saha ve sokaklar) ---
  both((k) => {
    sandbags(W, -6 * k, 10 * k, 3.2, true);
    jersey(W, 6.5 * k, 9 * k, true);
    jersey(W, -8.5 * k, -3.5 * k, false);
    crate(W, -24 * k, 14 * k, 1.2);
    crate(W, -22.8 * k, 15.4 * k, 0.9, 0, 0.6);
    crate(W, -31 * k, -11 * k, 1.1);
    sandbags(W, 27 * k, 14 * k, 3, true);
    jersey(W, -4 * k, -17 * k, true);
  });

  // --- Doğuş duvarı: doğuş alanını üç geçitle kapatır (mavi güneyde, kırmızı kuzeyde). Geçitler ortadaki
  // yapılarla hizalı değil: bir doğuştan öbürüne düz görüş hattı yok ---
  both((k) => {
    const z = 24.5 * k;
    const gaps = [-20, 4, 22].map((x) => ({ at: x * k, width: 3, type: 'gap' }));
    wall(W, 'x', -HALF, HALF, z, 3, 0.6, 'concrete', 'concrete', gaps);
    crate(W, -9 * k, 27 * k, 1.1);
    crate(W, 12 * k, 27.5 * k, 1.2, 0, 0.3);
    sandbags(W, -28 * k, 27.5 * k, 3, true);
  });

  // --- Aydınlatma direkleri (yalnız görünüm; ışık değil ışımalı malzeme) ---
  both((k) => {
    lampPost(W, -18 * k, 0, 6, k > 0 ? Math.PI / 2 : -Math.PI / 2);
    lampPost(W, 0, -18 * k, 6, k > 0 ? 0 : Math.PI);
  });
  return {};
}
