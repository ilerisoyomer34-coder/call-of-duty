// Harita seçimi: görev haritaları maps/ altında (her biri build(W) → veri), atış poligonu burada.
// Tüm yapılar kutulardan kurulur (gri blockout + prosedürel doku); düşman, hedef ve kontrol noktası
// verileri haritanın kendi dosyasındadır.
import { V, sandbags, container, jersey, crate, horizon, ground } from './maps/kit.js';
import { MAP_BUILDERS } from './maps/index.js';

export function buildMission(W, mapId = 'kizilkum') {
  const build = MAP_BUILDERS[mapId];
  if (!build) throw new Error(`Harita bulunamadı: ${mapId}`);
  return build(W);
}

// ------------------------------------------------------------
// ATIŞ POLİGONU (L_TestGym karşılığı)
// ------------------------------------------------------------
export function buildRange(W) {
  W.bounds = { minx: -34, maxx: 34, minz: -60, maxz: 78 };
  ground(W, 500);
  horizon(W);
  // Atış hattı tezgâhı
  W.block(-10, 0, 62, 14, 1.0, 0.8, 'wood', 'wood');
  W.block(10, 0, 62, 14, 1.0, 0.8, 'wood', 'wood');
  // Mesafe tabelaları: 10/25/50/100 m
  for (const [z, label] of [[52, 10], [37, 25], [12, 50], [-38, 100]]) {
    W.block(-16, 0, z, 0.2, 1.4, 1.2, 'paint', 'concrete', { tint: 0xd8d0b8 });
    W.block(16, 0, z, 0.2, 1.4, 1.2, 'paint', 'concrete', { tint: 0xd8d0b8 });
    void label;
  }
  // Toprak set (arka)
  W.block(0, 0, -50, 60, 5, 4, 'sand', 'sand', { tint: 0xcdb48a });
  // Yan duvarlar
  W.block(-30, 0, 10, 1, 3, 130, 'concrete', 'concrete');
  W.block(30, 0, 10, 1, 3, 130, 'concrete', 'concrete');
  // Yüzey test duvarı: beton / metal / ahşap / kum torbası
  W.block(-24, 0, 44, 3, 2.5, 0.6, 'concrete', 'concrete');
  W.block(-24, 0, 38, 3, 2.5, 0.6, 'metal', 'metal');
  W.block(-24, 0, 32, 3, 2.5, 0.6, 'wood', 'wood');
  W.block(-24, 0, 26, 3, 1.2, 0.9, 'sandbag', 'sandbag');
  // Siper parkuru
  sandbags(W, 22, 48, 3, true);
  container(W, 22, 36, false, 'contRed');
  jersey(W, 22, 26);
  crate(W, 24, 18, 1.1);
  // Merdiven ve rampa: hareket testi
  for (let i = 0; i < 6; i++) W.block(-22, 0, 12 - i * 0.5, 4, 0.25 * (i + 1), 0.5, 'concrete', 'concrete');
  W.block(-22, 0, 7.5, 4, 1.5, 3.5, 'concrete', 'concrete');
  return {
    playerStart: { pos: V(0, 66), yaw: 0 },
    checkpoints: [{ pos: V(0, 66), yaw: 0 }],
    barrels: [V(-6, 24), V(6, 24), V(6.7, 24.6)],
    ammoCrates: [V(4, 64.5)],
    dummies: [
      { pos: V(-8, 52), yaw: Math.PI }, { pos: V(0, 52), yaw: Math.PI }, { pos: V(8, 52), yaw: Math.PI },
      { pos: V(-8, 37), yaw: Math.PI }, { pos: V(8, 37), yaw: Math.PI },
      { pos: V(-6, 12), yaw: Math.PI }, { pos: V(6, 12), yaw: Math.PI },
      { pos: V(0, -38), yaw: Math.PI },
      { pos: V(-10, 44), yaw: Math.PI, patrol: [V(-10, 44), V(10, 44)] },
      { pos: V(10, 20), yaw: Math.PI, patrol: [V(10, 20), V(-10, 20)] },
    ],
  };
}
