# Sketchfab modelleri (Aşama B)

Askerler ve silahlar dışındaki her şey (araçlar, binalar, eşyalar, zemin, gökyüzü) Sketchfab'den en yüksek kaliteli
modellerle değiştirilecek. Aşama A (keskin eller/silah, uzaktaki askerler, uçaksavar nişancısı, tanklar, helikopterle
tahliye ve otomatik sonraki bölüm) tamamlandı.

## Başlamadan önce (B0)
- Ortam ayarlarında `*.sketchfab.com` için ağ izni ve `SKETCHFAB_API_TOKEN` ortam değişkeni gerekir; ayarlar yeni oturumda geçerli olur.
- Doğrulama: `env | grep -c SKETCHFAB_API_TOKEN`, sonra
  `curl -H "Authorization: Token $SKETCHFAB_API_TOKEN" "https://api.sketchfab.com/v3/search?type=models&downloadable=true&q=helicopter"`.
- İndirme bağlantısı başka bir alan adından gelirse (depolama sunucusu) o alanın izni de gerekir; adı kullanıcıya söylenir.
- Anahtar yalnızca ortam değişkeninden okunur; sohbete yazılmış bir anahtar asla kullanılmaz.


### B0. Erişim denetimi (ayrıntı)
- `api.sketchfab.com` araması, indirme CDN'i (`media.sketchfab.com` ya da yönlendirildiği alan) ve `SKETCHFAB_API_TOKEN` denenir.
- Engelli olan alan varsa adı söylenir; o sırada A'daki işlere devam edilir.

### B1. İndirme ve hazırlama araçları
- **`tools/sketchfab.mjs`:**
  - Arama filtresi: indirilebilir, lisansı CC0 ya da CC-BY; üçgen sayısı sınırı ve beğeniye göre sıralama.
  - glTF indirilir.
  - Özgün dosya ve `asset_info.json` (yazar, lisans, adres) `SourceAssets/Sketchfab/<id>/` altına kaydedilir.
- **`tools/prepare-prop.mjs`** (`prepare-character.mjs`'in genellemesi):
  - gltf-transform ile dedup, weld ve hedef üçgene sadeleştirme; meshopt sıkıştırması (`three/addons` MeshoptDecoder).
  - Dokular ayrı jpg/webp dosyalarına ayrılır: Artifact'ta 2K–4K, çevrimdışı tek dosyada 2K sınırı (tek HTML'nin açılabilmesi için).
  - Çıktılar: `web/assets/props/*` ve `web/src/propAssets.json` (ölçek, pivot, çarpıştırıcı kutusu; taret, namlu, rotor, koltuk noktaları).
- Gerekirse geliştirme bağımlılıkları: zip açma ve görüntü küçültme için `fflate` ve `sharp`.

### B2. Görsel yer tutucu mimarisi
- `World`'e `prop(id, transform, fitBox)` eklenir. Çarpıştırıcılar bugünkü kutulardan kalır; oynanış, navigasyon ve siper sistemi değişmez. Yalnız görsel GLB olur.
- Statik modeller malzeme başına birleştirilir, sık tekrarlananlar `InstancedMesh` ile çizilir.
- `maps/kit.js`'teki yardımcılar önce modeli dener, model yoksa bugünkü kutuyu çizer. Kapsam: konteyner, kum torbası, hesco, jersey, sandık, kamyon, araba, kule, vinç, gemi, tank, boru, lamba, çam, palmiye, kaya, sığınak, tezgâh, pist.
- **Binalar ve duvarlar:** oynanış için kapı ve pencere yerleri korunur.
  - Duvarlara Sketchfab'den yüksek çözünürlüklü PBR yüzeyler (sıva, tuğla, beton, oluklu metal) ve kapı/pencere çerçeveleri gelir.
  - Arka plan binaları tam modeldir.
  - Zemin: tarama malzemeleri.
  - Gökyüzü: harita başına skybox modeli; ışık sayısı değişmez.

### B3. Araç ve düzenekler
Tank, nakliye helikopteri, uçaksavar, ağır makineli, kamyon, araba, otobüs, vinç ve gemi. Hareketli parçalar (taret, namlu, rotor) `propAssets.json`'daki düğüm adlarıyla eşlenir; A3/A4/A5 kodu bu noktaları kullanır.

### B4. Birinci şahıs kollar
- Sketchfab FPS kolları (2K–4K dokulu) kullanılır.
- Silah tutamaklarına `soldier.js`'teki iki kemikli IK (`solveTwoBone`, `handQuat`; dışa aktarılır) ve parmak kavraması ile bağlanır.
- Model yoksa bugünkü kollar yedek kalır.

### B5. Yükleme ve boyut
- Her harita yalnızca kendi modellerini yükler. Yükleme ekranında "Modeller iniyor %x" aşaması gösterilir (`window.__boot`).
- Artifact'ta dosya başına 16 MB sınırı var: GLB yalnız geometri taşır, dokular ayrı dosyadır; `dist/artifact-files.json` bunları listeler.

### B6. Lisans
- Yalnızca CC0 ve CC-BY modeller kullanılır; gerçek logo ve marka olmaz.
- Kayıt yerleri: `CREDITS.md`, her model için `asset_info.json`, menüdeki "Emeği geçenler" ekranı (`propAssets.json`'dan otomatik).
