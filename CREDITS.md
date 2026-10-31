# Emeği geçenler

- **Tasarım:** Tarık Kerem Öz
- **Yazılım ve işleyiş:** Ömer İlerisoy

Oyundaki "Emeği geçenler" ekranı yalnız bu iki rolü gösterir. Aşağıdaki üçüncü taraf içeriğin lisans atıfları oyunda ayrı "Lisanslar" ekranındadır (Emeği geçenler → Lisanslar).

## Lisanslar ve üçüncü taraf içerik

### Silah modelleri (SourceAssets/Weapons)

| Oyundaki ad | Kaynak dosya | Sahibi | Lisans |
|---|---|---|---|
| MAR-556 | mar_556_1.blend | Oyuncunun kendi modeli | Kullanıcıya ait (doğrulanmalı) |
| MG-43 | mg_43_1.blend1 | Oyuncunun kendi modeli | Kullanıcıya ait (doğrulanmalı) |
| MR-82 Marret | marret_m82.blend1 | Oyuncunun kendi modeli | Kullanıcıya ait (doğrulanmalı) |
| D-50 Kartal | golden_dessert_eagle_1.blend | Oyuncunun kendi modeli | Kullanıcıya ait (doğrulanmalı) |

Bu dört model başka bir kaynaktan indirildiyse yazar, bağlantı ve lisans bilgisi ilgili `asset_info.json` dosyasına yazılmalı; CC BY-NC, CC BY-ND ve Editorial lisanslı modeller ticari sürümde kullanılamaz (bkz. Docs/MASTER_PROMPT.md §4.2).

### Karakterler (SourceAssets/Characters)

| Oyunda | Kaynak | Sahibi | Lisans |
|---|---|---|---|
| Düşman askerleri (tüm türler) | [three.js örnek deposu — Soldier.glb](https://github.com/mrdoob/three.js/blob/dev/examples/models/gltf/Soldier.glb) | Mixamo (Adobe), "Vanguard" karakteri ve Idle / Walk / Run animasyonları | Adobe Mixamo kullanım koşulları |

Mixamo koşulları özetle: karakter ve animasyonlar kişisel ve ticari projelerde (oyunlar dahil) telifsiz kullanılabilir, ancak tek başına ham dosya olarak satılamaz veya dağıtılamaz. Depo herkese açıksa ham GLB'nin depoda durması bu kısıtla çelişebilir; ticari sürümden önce karakter kendi Adobe hesabıyla Mixamo'dan indirilmeli ya da CC0 bir modelle değiştirilmeli. Ayrıntı: `SourceAssets/Characters/soldier_vanguard/asset_info.json`.

### Alfa Timi askerleri ve savaş robotu (SourceAssets/Characters)

| Oyunda | Kaynak | Yazar | Lisans | Değişiklik |
|---|---|---|---|---|
| Alfa Timi askerleri (Demir, Kaya, Yıldız) ve lobideki operatör | [3 soldier low poly (outdated) — Sketchfab](https://sketchfab.com/3d-models/3-soldier-low-poly-outdated-9b5bd75966764a87ae09c8b77e21f4c2) | [buh](https://sketchfab.com/buh-late) | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) | Üç asker ayrıldı, A pozundan oyunun asker iskeletinin T pozuna bükülüp kemikleri yeniden adlandırıldı (animasyonlar oyunun klipleriyle), ~16 bin üçgene sadeleştirildi, dokular JPEG (`web/tools/prepare-squad.mjs`) |
| Savaş robotu (7–10. bölümler) | [Combat Robot — Sketchfab](https://sketchfab.com/3d-models/combat-robot-55fe65bbb4074979ac0cb44850df4ddc) | [ILUSHANDRO](https://sketchfab.com/ILUSHANDRO) | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) | Kaide atıldı, parçalar eklemlere ayrılıp kodla hareketlendirildi, 122 bin → 35 bin üçgen, 2,9 m'ye ölçeklendi, dokular 1024 px JPEG (`web/tools/prepare-robot.mjs`) |

Aynı oturumda yüklenen "Haze Light Skirmisher Mech", "Pelter – Artillery Mech" ve "Centurion Heavy Assault Mech" (Lagst) Sketchfab Standard lisanslı: ham model oyunla birlikte dağıtılamayacağı için alınmadı.

### Araçlar ve eşyalar (SourceAssets/Sketchfab)

| Oyunda | Kaynak | Yazar | Lisans | Değişiklik |
|---|---|---|---|---|
| Konteynerler | [containers estilo ps1/ps2 — Sketchfab](https://sketchfab.com/3d-models/containers-estilo-ps1ps2-c4e722648a024585ba4dbfdb36c65f7c) | [PauloWardson](https://sketchfab.com/PauloWardson) | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) | Sarı çeşit atıldı, yan panellerdeki firma yazısı ve logosu silindi, dokular 512 px'e küçültüldü, 40 fitlik model oyunda 20 fit boya ölçeklenir (`web/tools/prepare-prop.mjs`) |
| Ağaçlar (çam) | [Pine Tree — Sketchfab](https://sketchfab.com/3d-models/pine-tree-d45218a3fab349e5b1de040f29e7b6f9) | [evolveduk](https://sketchfab.com/evolveduk) | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) | 5,6 bin → 2,3 bin üçgen (yaprak kartları korunarak), dokular 512 px'e küçültüldü, konumlar nicemlendi (`web/tools/prepare-prop.mjs`) |
| Tahliye helikopteri (Şahin-2) | [HELICOPTER — Sketchfab](https://sketchfab.com/3d-models/helicopter-c33f1be4708b422e8750d9b1db9894bf) | [pranav27](https://sketchfab.com/pranav27) | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) | 290 bin → 49 bin üçgene sadeleştirildi, konumlar nicemlendi, gövde rengi askerî yeşile çevrildi, pervaneler dönecek şekilde ayrıldı (`web/tools/prepare-prop.mjs`) |

### Silah modelleri (SourceAssets/Sketchfab)

| Oyundaki ad | Kaynak | Yazar | Lisans | Değişiklik |
|---|---|---|---|---|
| K8 Bozkurt | [low-poly C8 IUR](https://sketchfab.com/3d-models/low-poly-c8-iur-0204eaad7005420cb0694d4af81f1485) | [D_U](https://sketchfab.com/DU1701) | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) | Sergi şarjörü ve fişek atıldı, yönlendirildi, ölçeklendi, parçalara ayrıldı |
| KR-4 Atmaca | [low-poly Colt M4A1](https://sketchfab.com/3d-models/low-poly-colt-m4a1-c0313e9f6c164de8903615c4297a2485) | [D_U](https://sketchfab.com/DU1701) | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) | Aynı işlemler |
| MK-4 Doğan | [m4 Carbine Rifle](https://sketchfab.com/3d-models/m4-carbine-rifle-37cafb82ae144484a26e9ab71a0f8f0e) | [Pieter Ferreira](https://sketchfab.com/Badboy17Aiden) | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) | 588 bin → 138 bin üçgen, dokular 2048 px JPEG, nişangah gövdesi ve şarjör ayrı, dokudaki model yazısı silindi |
| KT-9 Kaplan | [Gun](https://sketchfab.com/3d-models/gun-a66b52ede9af472a9a9e0946154d603c) | [Dries Deryckere](https://sketchfab.com/deryckeredries) | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) | Dokulardaki gerçek marka, seri no, üretici adresi ve bir kişi fotoğrafı silindi; şarjör üçgen düzeyinde ayrı parça (şarjör değiştirme animasyonu) |
| AK-74 Poyraz | [low-poly AK-74M Zenitco](https://sketchfab.com/3d-models/low-poly-ak-74m-zenitco-35ad8e37a513453cbbbd04064fa5fb79) | [D_U](https://sketchfab.com/DU1701) | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) | Sergi şarjörü ve fişekler atıldı, yönlendirildi, 0,94 m'ye ölçeklendi; şarjör, sürgü taşıyıcı ve kolimatör ayrı parça |
| BR-2 Şimşek | [low-poly CZ Bren 2](https://sketchfab.com/3d-models/low-poly-cz-bren-2-90b2de2d55e9458f9c7d8ffeac9003af) | [D_U](https://sketchfab.com/DU1701) | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) | Sergi şarjörü ve fişek atıldı, yönlendirildi, 0,70 m'ye ölçeklendi; şarjör ve kurma kolu ayrı parça |
| NT-33 Şahin | [Sniper](https://sketchfab.com/3d-models/sniper-cdefd833b4b5407ba32c53c9e7f50cae) | [DJMaesen](https://sketchfab.com/bumstrum) | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) | Yönlendirildi, 1,20 m'ye ölçeklendi; şarjör ve sürgü ayrı parça (sürgü animasyonu), dokular 2048 px PNG'den 2048 px JPEG'e çevrildi (dokularda yazı yok) |
| Muharebe Bıçağı (elde tutulan bıçak ve hızlı bıçak) | [Knife](https://sketchfab.com/3d-models/knife-8374ea78a11c4be5a2f145448c17c90e) | [CG Lab34](https://sketchfab.com/tuandesigner.mtc) | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) | Yönlendirildi, 30 cm'ye ölçeklendi, dokular 2048 px PNG'den 2048 px JPEG'e çevrildi (dokularda yazı yok) |
| BZ-20 Yıldırım (bazuka) | [Bazooka M20](https://sketchfab.com/3d-models/bazooka-m20-a53d6716c9c24302a6fdd71ff70a7d63) | [Melvin Stubbe](https://sketchfab.com/MelvinEbbuts) | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) | Yönlendirildi, 1,35 m'ye ölçeklendi; eski "specular-glossiness" malzemesi metal/pürüz düzenine çevrildi, dokular 1024 px JPEG (dokularda yazı yok) |

M134 Kasırga (minigun) kullanıcının kendi Blender modelidir (`SourceAssets/Weapons/minigun/`, `Tools/blender/export_weapon.py`).

Oyundaki silah adları kurgusaldır; kaynak model adlarındaki gerçek markalar oyunda kullanılmaz. Hazırlama: `web/tools/prepare-weapon-glb.mjs` (ayarlar `web/tools/weapon-glb-map.json`).

CC BY 4.0: yazar ve lisans belirtilerek ticari dahil her amaçla kullanılabilir, değiştirilebilir; değişiklikler belirtilmelidir. Oyun içinde "Lisanslar" ekranında da listelenir (`web/src/propAssets.json`'dan). Ayrıntı: `SourceAssets/Sketchfab/helicopter_pranav27/asset_info.json`.

### Prosedürel içerik

AR-7 Vanguard, SMG-9 Akrep, SG-12 Breaker, P-9 Sentinel, PR-10 Tayfun, bazukanın yedek modeli ve roketi, şarjör değiştirmede elde görünen fişekler, düşman silahları, tanklar, uçaksavarlar, harita, dokular ve seslerin tamamı kodla üretilir. Helikopter modeli yüklenemezse kodla üretilen yedek helikopter kullanılır. Asker modeli yüklenemezse oyun kodla üretilen yedek askerlere döner.

### Kapak görseli

Google Play tanıtım görselindeki "Demir Şafak" posteri proje sahibine aittir (`SourceAssets/Cover/`); üçüncü taraf lisansı yoktur.

### Yazılım ve yazı tipleri

- three.js — MIT lisansı
- meshoptimizer (Arseny Kapoulkine) — MIT lisansı. Oyunda uzak ağaç gövdesi ve tim askerinin elindeki/yerde duran silahın sade kopyası tarayıcıda bununla üretilir (`web/src/lod.js`); araçlarda (`tools/prepare-*.mjs`) model sadeleştirme. Oyunda Emeği geçenler → Lisanslar ekranında da yazar.
- Rapier fizik motoru (`@dimforge/rapier3d-compat`, Dimforge) — Apache License 2.0. PWA ve mağaza uygulamasında `vendor/rapier.js` yanında `vendor/rapier-LICENSE.txt`; Artifact sürümü CDN'den (jsDelivr/unpkg) yükler. Oyunda Emeği geçenler → Lisanslar ekranında da yazar.
- Big Shoulders Stencil Display, Barlow Condensed, Share Tech Mono — SIL Open Font License (Google Fonts). Mağaza uygulaması (`web/dist/app`) bunları kendi içinde taşır: `web/src/fonts/` (lisans metinleri `OFL-*.txt`, `tools/fetch-fonts.mjs`)

Pompalı nişancı tüfeği PR-10 Tayfun kodla üretilir (`web/src/models.js → buildPumpRifle`). Yüklenen "Lightning pump action rifle" modeli Sketchfab Standard lisanslı olduğu için (ham dosya oyunla dağıtılamaz), lokeig'in önceki AK-47 modeli CC BY-NC olduğu için (ticari kullanım yok) alınmadı. Aşağıda eklenen Billy Jackman AK-47 modeli farklıdır ve CC BY 4.0 lisanslıdır.

### Eklenen silahlar (17 Ekim 2026)
Oyun için yön ve ölçek düzenlendi; tutuş/nişan noktaları tanımlandı, şarjör ve hareketli parçalar ayrıldı, dokular paketlendi.
- **AK-47  - Game Ready Assault Rifle Weapon** — Billy Jackman (https://sketchfab.com/billyjackman3d); [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). [Kaynak](https://sketchfab.com/3d-models/ak-47-game-ready-assault-rifle-weapon-dc58144409534abbb60970638d171f9f).
- **low-poly ADAR 2-15** — D_U (https://sketchfab.com/DU1701); [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). [Kaynak](https://sketchfab.com/3d-models/low-poly-adar-2-15-fb58636c7cf74912b86f0dab6fe63099).
- **low-poly G95 A1** — D_U (https://sketchfab.com/DU1701); [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). [Kaynak](https://sketchfab.com/3d-models/low-poly-g95-a1-6e66f2cb28234868b06940669c7d388a).
- **low-poly HK MP7 A1** — D_U (https://sketchfab.com/DU1701); [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). [Kaynak](https://sketchfab.com/3d-models/low-poly-hk-mp7-a1-4715a09c0d054bdba7c0fbf0929a9878).
- **low-poly STM-556** — D_U (https://sketchfab.com/DU1701); [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). [Kaynak](https://sketchfab.com/3d-models/low-poly-stm-556-bd1b7c5385724474b6efff71b0b0bb1a).
- **M4 Super 90 (JW2) Brand-Friendly version** — 8sianDude (https://sketchfab.com/haoliu95); [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). [Kaynak](https://sketchfab.com/3d-models/m4-super-90-jw2-brand-friendly-version-7e472e24152246708cac8b6f1613c7a8).
- **Armalite AR-10(T) Battle Rifle** — 8sianDude (https://sketchfab.com/haoliu95); [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). [Kaynak](https://sketchfab.com/3d-models/armalite-ar-10t-battle-rifle-415a20e0f50c4e1a9c2da542857c4737).
- **Ithaca Model 37 "Riot" Shotgun** — 8sianDude (https://sketchfab.com/haoliu95); [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). [Kaynak](https://sketchfab.com/3d-models/ithaca-model-37-riot-shotgun-8caca0af16a74184bb63758f7b58c22a).
- **low-poly UAR-10** — D_U (https://sketchfab.com/DU1701); [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). [Kaynak](https://sketchfab.com/3d-models/low-poly-uar-10-759c7788575c468d908a59c7a7405c05). Sergi şarjörü ve fişek atıldı; dürbün ayrı parça (tam nişanda dürbün kaplaması çizilir).

AR-10(T) dokularındaki üretici amblemi, adresi ve seri no; M4 Super 90 dokularındaki marka benzeri yazılar `weapon-glb-map.json → textures.paint` ile boyandı.

### Belediye binası ve final görevi

- **House**, Thomas Visonà (TakeAndPlay), [Sketchfab](https://sketchfab.com/3d-models/house-256adc61a3c04654a056d75a48a69d60), **CC BY 4.0**. Kullanıcının verdiği `house.glb` dosyası kullanıldı. Mimari geometri kenarları korunarak sadeleştirildi; mimari renk dokuları 1024, ikincil dokular 512 piksele indirildi. Belediye tabelası, çarpışma modeli ve görev düzeni eklendi. Özgün 377 MB dosyanın SHA-256 özeti `SourceAssets/Sketchfab/house_takeandplay/asset_info.json` içinde; özgün dosya Git'e eklenmez.
- Birinci şahıs taktik eldivenleri ve kolları: **Soldier Full Tactical Gear**, **DanlyVostok**, [Sketchfab](https://sketchfab.com/3d-models/soldier-full-tactical-gear-850593a8c7114c188395ba1849a66eb9), **CC BY 4.0**. Kullanıcının verdiği özgün modelden eldiven ve üniforma ön kolları çıkarıldı. Anatomik avuç/bilek çerçeveleri kuruldu, parmaklar kavrama pozuna büküldü, UV ve PBR dokuları korundu; görünüm modeli koordinatlarına uyarlandı.
- Mevcut **Pine Tree**, **evolveduk**, [Sketchfab](https://sketchfab.com/3d-models/pine-tree-d45218a3fab349e5b1de040f29e7b6f9), **CC BY 4.0**: kaynak modelden daha ayrıntılı 3977 üçgenlik sürüm ve 1024 piksel dokular yeniden üretildi.
