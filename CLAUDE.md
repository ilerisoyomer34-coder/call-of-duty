# Demir Şafak — proje notları

## Durum
- `web/` altında oynanabilir tarayıcı dikey kesiti var (three.js, tek dosyaya paketlenir): 6 seviye, 5 harita (Kızılkum, Liman, Yıkık Şehir, Karlı Geçit, Gece Rafinerisi), ağır makineli mevziler, nişancılı uçaksavarlar, tanklar, rütbesi seviyeyle artan mavi manga. Her seviye helikopterle tahliye + kalkış sahnesiyle biter, sonraki bölüm geri sayımla kendiliğinden açılır.
- Tahliye helikopteri ve dört silah (K8 Bozkurt, KR-4 Atmaca, MK-4 Doğan, KT-9 Kaplan) Sketchfab'den hazır model (CC BY 4.0; kullanıcı oturuma yükledi). Diğer Sketchfab modelleri (askerler ve silahlar dışındaki her şey) planlandı ama ortamın ağ izni `api.sketchfab.com`'u reddediyor ve `SKETCHFAB_API_TOKEN` tanımlı değil; kullanıcı GLB'yi sohbete yükleyebilir (`/root/.claude/uploads/...`). Erişim açılınca: `tools/sketchfab.mjs` (yalnız CC0/CC-BY, indirilebilir), `tools/prepare-prop.mjs`, görsel yer tutucu (`World.prop`, çarpıştırıcılar kutu kalır). Plan: `Docs/SKETCHFAB_PLAN.md`.
- Oyun GitHub Pages'te yüklenebilir uygulama (PWA) olarak yayımlanır: https://ilerisoyomer34-coder.github.io/call-of-duty/ → `web/dist/pwa/`. Ayrıntı aşağıda "PWA" maddesinde.
- Unreal Engine 5 sürümü henüz başlamadı. Ana plan: `Docs/MASTER_PROMPT.md` (Faz 0'dan başlanacak; UE5, Visual Studio ve Windows makine gerekir).
- Web sürümündeki ayar değerleri (`web/src/config.js`) UE5'teki Data Asset'lere taşınacak referans değerlerdir.

## Komutlar (web)
- `cd web && npm install`
- `npm run build` üç çıktı üretir:
  - `dist/index.html`: çevrimdışı, three gömülü.
  - `dist/artifact.html`: three CDN'den.
  - `dist/pwa/`: yüklenebilir uygulama. İçinde three paketli, modeller gerçek dosya; `manifest.webmanifest`, `icons/` ve `sw.js` var.
- PWA simgeleri: `node tools/make-icons.mjs`. `src/pwa/icon.svg` dosyasından `src/pwa/icons/*.png` üretir; çıktılar commit'lenir, derleme bu dosyaları yalnız kopyalar.
- `npm test` → derler, başsız Chromium'da menü/görev/poligon/telefon akışlarını dener; ekran görüntüleri `web/tools/shots/`
- Kaynak değiştiyse `dist/` yeniden derlenip commit'lenmeli.
- Blender modelleri: `python Tools/blender/export_weapon.py <mg43|mar556|m82|d50> --render` (Python 3.11 + `pip install bpy==5.0.1`). Çıktılar: `web/assets/weapons/*.glb`, `web/src/weaponAssets.json`, `Docs/import_reports/`.
- Hazır araç/eşya modeli (Sketchfab): `cd web && node tools/prepare-prop.mjs helicopter` (kaynak `SourceAssets/Sketchfab/<ad>/original/*.glb`, ayarlar dosyadaki `SOURCES` tablosunda). Çıktılar: `web/assets/props/*.glb`, `web/src/propAssets.json` (rotor adları, eksenler, boy, renk, atıf). Sadeleştirme `meshoptimizer` ile.
- Sketchfab silahı: `cd web && node tools/prepare-weapon-glb.mjs <k8|kr4|mk4|kt9> [--preview]` (ayarlar `tools/weapon-glb-map.json`: eksen, boy, el/namlu/nişangah noktaları, parça kalıpları/kutuları, doku boyama kutuları). Çıktılar: `web/assets/weapons/<id>.glb` + `<id>_t<n>.jpg`, `weaponAssets.json` (`materials`, `credit`). `--preview` yönlendirilmiş modeli `tools/shots/_preview-<id>.glb`'ye yazar; `DEBUG_PARTS=1` her mesh'in merkezini basar.
- Asker karakteri: `cd web && node tools/prepare-character.mjs soldier` (kaynak `SourceAssets/Characters/soldier_vanguard/original/Soldier.glb`). Çıktılar: `web/assets/characters/`, `web/src/characterAssets.json`.
- `web/assets/**` bağımsız sürümde base64 gömülür; Artifact sürümünde sayfanın yanında ayrı dosya olarak yayımlanır. Artifact .glb sunmadığı için GLB'ler `dist/artifact-assets/` altına base64 `.glb.txt` olarak üretilir (depoya girmez). `dist/artifact-files.json` yayımlanacak yol → kaynak eşlemesini verir (depo köküne göre); Artifact `files` parametresine bu verilir. three.js Artifact'ta jsDelivr'dan, olmazsa unpkg'den gelir.

## Kurallar
- Kod içi isimler İngilizce, yorumlar Türkçe ve "neden"i anlatır.
- Ayar değerleri `config.js`'de; kodda sihirli sayı bırakma.
- Sistemler arası iletişim `game.events` (Emitter) üzerinden; HUD olaylarla güncellenir.
- Çalışma sırasında bellek ayırmaktan kaçın (efektler havuzlanır, geçici vektörler modül düzeyinde).
- Işık sayısı sabit kalmalı (efekt ışık havuzu); değişirse shader'lar yeniden derlenir.
- Silah adları kurgusal kalmalı; gerçek marka/logo yok. Harici asset eklenirse lisansı `CREDITS.md`, `SourceAssets/.../asset_info.json` ve menüdeki "Emeği geçenler" ekranına yazılmalı.
- İçe aktarılan silahlarda kapalı nişangah gövdeleri `optic` parçası yapılır; nişan alırken gizlenip yerine açık tüp çizilir (`adsRing`). Cam başka parçayla aynı mesh'teyse `splitBoxes` üçgen düzeyinde ayırır.
- Sketchfab silah dokularındaki gerçek marka, seri no ve kişi bilgisi `weapon-glb-map.json` → `textures.<sıra>.paint` ile boyanır; yeni dokuda bu yazılar aranmalı (kırpıp bak). Dokular GLB'de değil ayrı JPEG'dir (`assets.js` → `applyTextureSpec`, glTF normal haritası için `normalScale.y` ters).
- Hazır araç modelleri `assets.js` → `loadPropAsset`; açılışta `Game.loadProps` yükler, `models.js` → `setHelicopterProp`. Yüklenemezse prosedürel model kullanılır (aynı `{ root, rotor, tail }` arayüzü; hazır modelde ek olarak `tailAxis`, `seat`). Hazır helikopter görevde sahnenin altına park edilir (`mission.heliSpare`), gölgelendiricileri açılışta derlensin diye. Atıf `propAssets.json` → emeği geçenler ekranı (`menus.buildPropCredits`).
- Asker görünümü `soldier.js`'te: düşman yapay zekâsı yalnızca duruş/hız/nişan bilgisini verir (`animate(dt, st)`), kemiklere doğrudan dokunmaz. Model yüklenemezse `BlockSoldier` yedeği aynı arayüzle çalışır.
- Seviyeler `config.js` → `LEVELS` (kolaydan zora, 6 seviye). Görev hedefleri `mission.js` → `objectiveDefs()` tablosundan seçilir; yeni seviye yeni kod değil, yeni tablo satırıdır. İlerleme `demirsafak.progress.v1` anahtarında.
- Haritalar `web/src/maps/<id>.js` → `build(W)` veri döndürür (kontrol noktaları [0 başlangıç … 5 iniş], düşmanlar, `obj` hedef metinleri/telsiz, `hmg` mevzi listesi, `heliFrom`, `fires`); ortak yapı yardımcıları `maps/kit.js`. Yeni harita = yeni dosya + `maps/index.js` kaydı + `config.js` → `MAPS` ortam satırı. Ortamda ışık sayısı değişmez (yalnızca renk/şiddet); gece lambası ışımalı malzeme, alev parçacıktır. Oyuncunun başlangıç noktası mevzilerin görüş hattında olmamalı (önüne siper koy).
- Ağır makineli mevzi: `hmg.js` (model, zırh, susturma) + `enemy.js` → `actMounted` (yay, dönüş, tarama, eğil–kalk, kuşatılınca inme). Seviye `enemies.hmg` kadarını haritanın `hmg` listesinden sırayla kurar. Kalkan zırhı `EnemyManager.armor`; oyuncu/dost mermisi orada durur.
- Nişancılı düzenek arayüzü ("mount"): `cfg` (HMG ya da AA_GUN tablosu), `yaw`, `arc`, `aimYaw/aimPitch`, `worldYaw`, `pivot()`, `seatPos()`, `inArc()`, `setAim()`, `muzzleWorld()`, `grips()`, `wrecked`, `warned`, `warnText`, `calloutName`; isteğe bağlı `selfIdle` (çatışma yokken düzenek kendi başına çalışır), `restPitch`, `animPitch`. Yeni düzenek bu arayüzü sunar, `actMounted` değişmez. `mission.mounts` = mevziler + nişancılı uçaksavarlar (manga bastırır, mini harita gösterir).
- Uçaksavar (`mission.js` → `AAGun`): nişancı (`aaGunner`) seviyenin düşman grupları topun grubunu içeriyorsa oturur (Seviye 1'de yok). Uçaksavar mermisi (`ENEMY_WEAPONS.flak`) hedefin yakınından geçerken patlar.
- Tank (`tank.js`): düşman listesinde değildir; kendi algısı (oyuncu öncelikli, dostları da hedefler), ana top `grenades.spawnRocket(..., 'enemy')` (düşman mermisi oyuncu/dost silindirine çarpar, düşman askerlerinin içinden geçer), eş eksenli makineli anlık ışın. Hasar yalnız `mission.onExplosion` → `Tank.onExplosion` (ağır/hafif patlayıcı eşiği `TANK.explosiveHeavy`) ve C4'ten. Çarpıştırıcıları gezinme ağından önce eklenir. Seviye `enemies.tanks` kadarını haritanın `tanks` listesinden kurar; yerleşim başlangıcı ve tahliye yolunu tıkamamalı, yakına roketatar konmalı.
- Tahliye: son hedef `board` (savunmadan sonra) ya da `extract` (haritanın `extract` tablosu, bir önceki hedefin kimliğiyle: `{ pos, radio, cp }`; `cp` tahliye başlarken kaydedilen kontrol noktası). Biniş → `Mission.board()` → kalkış sahnesi (`updateTakeoff`, `takeoffCamera`; oyuncu hasar almaz, manga gizlenir) → `finish()`. Bölüm kartındaki geri sayım gerçek saatle (`EXTRACT.nextDelay`) ilerler; herhangi bir düğme ya da ekran değişimi durdurur.
- Çizim: dünya `worldRT`'ye (ölçekli, MSAA, HalfFloat) çizilir, tam ekran dörtgenle ton eşlenip tuvale aktarılır; eller/silah tuvale tam DPR'de çizilir (`RENDER`, `renderScale` ayarı). Ön derleme `worldRT` bağlıyken yapılır ki gölgelendirici sürümleri eşleşsin.
- Manga kademesi `config.js` → `ALLY_TIERS` (seviyenin `allyTier`'ı): değerler ve açık taktikler; taktik kodu `ally.js`. Manganın el bombası oyuncuyu ve dostları yaralamaz.
- Dost askerler (`ally.js`) düşmanın gördüğü hedef arayüzünü (pos, alive, headPos, chestPos, takeDamage…) oyuncuyla aynı biçimde sunar; düşman `foe` alanında oyuncuyu ya da bir dostu tutar. Oyuncunun mermisi ve patlayıcısı dostu yaralamaz.
- Testler: `SMOKE_ONLY=levels,maps npm test` gibi yalnızca bazı bölümler koşturulabilir (visual, mission, levels, interact, maps, range, artifact, mobile, pwa). `maps` bölümü her seviyede hedeflere ve tahliye noktalarına yol, düşman/tank yerleşimini, mevzi, uçaksavar nişancısı ve tank davranışını, uzaktaki askerin donmadığını ve manga kademelerini dener; `levels` tahliye → kalkış → geri sayımla sonraki bölümü; `mobile` eller/silah ile dünya çözünürlüğünü; `pwa` yerel sunucuda (Pages gibi alt yol) manifest, yüklenebilirlik, önbellek, çevrimdışı açılış, yükleme düğmesi ve güncelleme akışını. Yazılımsal GPU'da oyun saati yavaş ilerler; ölçümleri kare beklemeden doğrudan çağrıyla yap.
- **PWA (`dist/pwa/`):**
  - GitHub Pages depo kökünden, çalışma dalından yayımlanır: https://ilerisoyomer34-coder.github.io/call-of-duty/
    - Kökteki `index.html` → `web/dist/pwa/` yönlendirmesi. `.nojekyll` Jekyll'i kapatır.
    - Pages ayarı kullanıcıdadır: Settings → Pages → Deploy from a branch.
  - Hizmet çalışanı şablonu: `src/pwa/sw.js`.
    - Derleme, dosya listesini ve içerik özetinden sürümü içine yazar.
    - Önce önbellek kullanılır. Kurulum `cache: 'no-cache'` ile yapılır.
    - Yeni sürüm kendiliğinden devreye girmez; menüde "Güncelle" düğmesi çıkar.
  - Oyun tarafı `src/pwa.js`:
    - Yalnız manifest bağlantısı olan http(s) sayfada çalışır. Standalone ve Artifact sürümlerinde `game.pwa === null`.
    - Yükleme düğmesi `#btnInstall`, durum satırı `#pwaStatus`.
  - `web/assets/`'e dosya eklenince PWA listesine kendiliğinden girer.
- Açılış ve harita yükleme `window.__boot` (shell.html'deki bekçi) üzerinden aşama gösterir; hata yükleme ekranına yazılır, sessizce asılı kalmamalı.
