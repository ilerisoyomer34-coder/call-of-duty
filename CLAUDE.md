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
- Blender modelleri: `python Tools/blender/export_weapon.py <mg43|mar556|m82|d50> --render` (Python 3.11 + `pip install bpy==5.0.1`). Çıktılar: `web/assets/weapons/*.glb`, `web/src/weaponAssets.json`, `Docs/import_reports/`.
- Asker karakteri: `cd web && node tools/prepare-character.mjs soldier` (kaynak `SourceAssets/Characters/soldier_vanguard/original/Soldier.glb`). Çıktılar: `web/assets/characters/`, `web/src/characterAssets.json`.
- `web/assets/**` bağımsız sürümde base64 gömülür; Artifact sürümünde sayfanın yanında ayrı dosya olarak yayımlanır. Artifact .glb sunmadığı için GLB'ler `dist/artifact-assets/` altına base64 `.glb.txt` olarak üretilir (depoya girmez). `dist/artifact-files.json` yayımlanacak yol → kaynak eşlemesini verir (depo köküne göre); Artifact `files` parametresine bu verilir. three.js Artifact'ta jsDelivr'dan, olmazsa unpkg'den gelir.

## Kurallar
- Kod içi isimler İngilizce, yorumlar Türkçe ve "neden"i anlatır.
- Ayar değerleri `config.js`'de; kodda sihirli sayı bırakma.
- Sistemler arası iletişim `game.events` (Emitter) üzerinden; HUD olaylarla güncellenir.
- Çalışma sırasında bellek ayırmaktan kaçın (efektler havuzlanır, geçici vektörler modül düzeyinde).
- Işık sayısı sabit kalmalı (efekt ışık havuzu); değişirse shader'lar yeniden derlenir.
- Silah adları kurgusal kalmalı; gerçek marka/logo yok. Harici asset eklenirse lisansı `CREDITS.md`, `SourceAssets/.../asset_info.json` ve menüdeki "Emeği geçenler" ekranına yazılmalı.
- İçe aktarılan silahlarda kapalı nişangah gövdeleri `optic` parçası yapılır; nişan alırken gizlenip yerine açık tüp çizilir (`adsRing`).
- Asker görünümü `soldier.js`'te: düşman yapay zekâsı yalnızca duruş/hız/nişan bilgisini verir (`animate(dt, st)`), kemiklere doğrudan dokunmaz. Model yüklenemezse `BlockSoldier` yedeği aynı arayüzle çalışır.
- Seviyeler `config.js` → `LEVELS` (kolaydan zora). Görev hedefleri `mission.js` → `objectiveDefs()` tablosundan seçilir; yeni seviye yeni kod değil, yeni tablo satırıdır. İlerleme `demirsafak.progress.v1` anahtarında.
- Dost askerler (`ally.js`) düşmanın gördüğü hedef arayüzünü (pos, alive, headPos, chestPos, takeDamage…) oyuncuyla aynı biçimde sunar; düşman `foe` alanında oyuncuyu ya da bir dostu tutar. Oyuncunun mermisi ve patlayıcısı dostu yaralamaz.
- Testler: `SMOKE_ONLY=levels,range npm test` gibi yalnızca bazı bölümler koşturulabilir.
- Açılış ve harita yükleme `window.__boot` (shell.html'deki bekçi) üzerinden aşama gösterir; hata yükleme ekranına yazılır, sessizce asılı kalmamalı.
