// Ellerin her silahın kabzasına/kundağına oturduğu noktaları ölçer → src/data/handFit.json.
// Kullanım: node tools/fit-hands.mjs [--check]. Silah modeli ya da WEAPON_AIM ipucu değişince çalıştırılıp commit'lenir;
// --check güncel değilse çıkış 1 (tests/hand-fit.test.mjs de denetler).
import { readFileSync, writeFileSync } from 'node:fs';
import { fitAll } from './handFitLib.mjs';

const file = new URL('../src/data/handFit.json', import.meta.url);
const fit = await fitAll();
for (const [id, f] of Object.entries(fit)) {
  if (f.notes.length) console.log(`${id}: ${f.notes.join('; ')}`);
  delete f.notes;
}
// Silah başına tek satır: farklar okunur kalsın
const text = `{\n${Object.entries(fit).map(([id, f]) => `  ${JSON.stringify(id)}: ${JSON.stringify(f)}`).join(',\n')}\n}\n`;
if (process.argv.includes('--check')) {
  const same = readFileSync(file, 'utf8') === text;
  console.log(same ? 'handFit.json güncel' : 'handFit.json eski: node tools/fit-hands.mjs');
  process.exit(same ? 0 : 1);
}
writeFileSync(file, text);
console.log(`${Object.keys(fit).length} silahın el noktaları yazıldı`);
