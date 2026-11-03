// Yapay zekâ navigasyonu paylaşılan kodda (shared/sim/nav.js; sunucu botları da kullanır). Tek oyunculu
// yapay zekâ rastgeleliği Math.random'dan alır (Docs/DECISIONS.md "Rastgelelik").
import { NavGrid as SharedNavGrid } from '../shared/sim/nav.js';

export class NavGrid extends SharedNavGrid {
  constructor(world, agentRadius = 0.4) {
    super(world, agentRadius, Math.random);
  }
}
