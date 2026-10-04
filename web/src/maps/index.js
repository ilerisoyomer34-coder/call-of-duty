// Görev haritaları kaydı: config.js → MAPS anahtarları buradaki kurucularla eşleşir.
import { build as kizilkum } from './kizilkum.js';
import { build as harbor } from './harbor.js';
import { build as ruins } from './ruins.js';
import { build as pass } from './pass.js';
import { build as refinery } from './refinery.js';
import { build as depo } from './depo.js';

export const MAP_BUILDERS = { kizilkum, harbor, ruins, pass, refinery };

// Çevrim içi maç haritaları (data/arenas.json): görev haritası değil, doğuş ve gezinme verisi JSON'da
export const ARENA_BUILDERS = { depo };
