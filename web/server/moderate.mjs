// Sunucu sahibinin şikâyet aracı (App Store 1.2: bildirilen içerik 24 saat içinde incelenmeli).
// Kullanım (web/ içinden; ev sunucusunda veritabanı server/data/demirsafak.db, başkasıysa DB_PATH=...):
//   node server/moderate.mjs            → son şikâyetler (en yeni önce)
//   node server/moderate.mjs sil <id>   → oyuncunun hesabını sil (ad, arkadaşlıklar, bildirimler); açık oturumu
//                                          bir sonraki istekte düşer
// Sunucu çalışırken de güvenlidir (SQLite WAL kipi).
import { loadConfig } from './config.js';
import { Store } from './db.js';

const REASON = { name: 'Uygunsuz ad', abuse: 'Taciz / hile' };
const [cmd, arg] = process.argv.slice(2);
const store = new Store(loadConfig().dbPath);

if (!cmd) {
  const list = store.reports(100);
  if (!list.length) console.log('Şikâyet yok.');
  for (const r of list) {
    const when = new Date(r.created).toLocaleString('tr-TR');
    console.log(`${when}  ${REASON[r.reason] || r.reason}  ${r.target_name}  (${r.target}, toplam ${r.total} şikâyet${r.exists ? '' : ', hesap silinmiş'})`);
  }
} else if (cmd === 'sil' && arg) {
  const p = store.player(arg);
  if (!p) console.log(`Oyuncu bulunamadı: ${arg}`);
  else {
    store.deletePlayer(arg);
    console.log(`Silindi: ${p.name}#${p.tag} (${arg})`);
  }
} else {
  console.error('Kullanım: node server/moderate.mjs [sil <oyuncu kimliği>]');
  process.exitCode = 1;
}
store.close();
