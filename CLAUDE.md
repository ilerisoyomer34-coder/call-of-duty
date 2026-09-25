# Demir Şafak — proje notları

## Durum
- `web/` altında oynanabilir tarayıcı dikey kesiti var (three.js, tek dosyaya paketlenir).
- Unreal Engine 5 sürümü henüz başlamadı. Ana plan: `Docs/MASTER_PROMPT.md` (Faz 0'dan başlanacak; UE5, Visual Studio ve Windows makine gerekir).
- Web sürümündeki ayar değerleri (`web/src/config.js`) UE5'teki Data Asset'lere taşınacak referans değerlerdir.

## Komutlar (web)
- `cd web && npm install`
- `npm run build` → `dist/index.html` (çevrimdışı, three gömülü) ve `dist/artifact.html` (three CDN'den)
- `npm test` → derler, başsız Chromium'da menü/görev/poligon/telefon akışlarını dener; ekran görüntüleri `web/tools/shots/`
- Kaynak değiştiyse `dist/` yeniden derlenip commit'lenmeli.

## Kurallar
- Kod içi isimler İngilizce, yorumlar Türkçe ve "neden"i anlatır.
- Ayar değerleri `config.js`'de; kodda sihirli sayı bırakma.
- Sistemler arası iletişim `game.events` (Emitter) üzerinden; HUD olaylarla güncellenir.
- Çalışma sırasında bellek ayırmaktan kaçın (efektler havuzlanır, geçici vektörler modül düzeyinde).
- Işık sayısı sabit kalmalı (efekt ışık havuzu); değişirse shader'lar yeniden derlenir.
- Silah adları kurgusal kalmalı; gerçek marka/logo yok. Harici asset eklenirse lisansı `CREDITS` ve menüdeki "Emeği geçenler" ekranına yazılmalı.
