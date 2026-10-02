# Emeği geçenler

## Silah modelleri (SourceAssets/Weapons)

| Oyundaki ad | Kaynak dosya | Sahibi | Lisans |
|---|---|---|---|
| MAR-556 | mar_556_1.blend | Oyuncunun kendi modeli | Kullanıcıya ait (doğrulanmalı) |
| MG-43 | mg_43_1.blend1 | Oyuncunun kendi modeli | Kullanıcıya ait (doğrulanmalı) |
| MR-82 Marret | marret_m82.blend1 | Oyuncunun kendi modeli | Kullanıcıya ait (doğrulanmalı) |
| D-50 Kartal | golden_dessert_eagle_1.blend | Oyuncunun kendi modeli | Kullanıcıya ait (doğrulanmalı) |

Bu dört model başka bir kaynaktan indirildiyse yazar, bağlantı ve lisans bilgisi ilgili `asset_info.json` dosyasına yazılmalı; CC BY-NC, CC BY-ND ve Editorial lisanslı modeller ticari sürümde kullanılamaz (bkz. Docs/MASTER_PROMPT.md §4.2).

## Karakterler (SourceAssets/Characters)

| Oyunda | Kaynak | Sahibi | Lisans |
|---|---|---|---|
| Düşman askerleri (tüm türler) | [three.js örnek deposu — Soldier.glb](https://github.com/mrdoob/three.js/blob/dev/examples/models/gltf/Soldier.glb) | Mixamo (Adobe), "Vanguard" karakteri ve Idle / Walk / Run animasyonları | Adobe Mixamo kullanım koşulları |

Mixamo koşulları özetle: karakter ve animasyonlar kişisel ve ticari projelerde (oyunlar dahil) telifsiz kullanılabilir, ancak tek başına ham dosya olarak satılamaz veya dağıtılamaz. Depo herkese açıksa ham GLB'nin depoda durması bu kısıtla çelişebilir; ticari sürümden önce karakter kendi Adobe hesabıyla Mixamo'dan indirilmeli ya da CC0 bir modelle değiştirilmeli. Ayrıntı: `SourceAssets/Characters/soldier_vanguard/asset_info.json`.

## Araçlar ve eşyalar (SourceAssets/Sketchfab)

| Oyunda | Kaynak | Yazar | Lisans | Değişiklik |
|---|---|---|---|---|
| Tahliye helikopteri (Şahin-2) | [HELICOPTER — Sketchfab](https://sketchfab.com/3d-models/helicopter-c33f1be4708b422e8750d9b1db9894bf) | [pranav27](https://sketchfab.com/pranav27) | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) | 290 bin → 49 bin üçgene sadeleştirildi, konumlar nicemlendi, gövde rengi askerî yeşile çevrildi, pervaneler dönecek şekilde ayrıldı (`web/tools/prepare-prop.mjs`) |

## Silah modelleri (SourceAssets/Sketchfab)

| Oyundaki ad | Kaynak | Yazar | Lisans | Değişiklik |
|---|---|---|---|---|
| K8 Bozkurt | [low-poly C8 IUR](https://sketchfab.com/3d-models/low-poly-c8-iur-0204eaad7005420cb0694d4af81f1485) | [D_U](https://sketchfab.com/DU1701) | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) | Sergi şarjörü ve fişek atıldı, yönlendirildi, ölçeklendi, parçalara ayrıldı |
| KR-4 Atmaca | [low-poly Colt M4A1](https://sketchfab.com/3d-models/low-poly-colt-m4a1-c0313e9f6c164de8903615c4297a2485) | [D_U](https://sketchfab.com/DU1701) | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) | Aynı işlemler |
| MK-4 Doğan | [m4 Carbine Rifle](https://sketchfab.com/3d-models/m4-carbine-rifle-37cafb82ae144484a26e9ab71a0f8f0e) | [Pieter Ferreira](https://sketchfab.com/Badboy17Aiden) | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) | 588 bin → 71 bin üçgen, nişangah gövdesi ayrı, dokudaki model yazısı silindi |
| KT-9 Kaplan | [Gun](https://sketchfab.com/3d-models/gun-a66b52ede9af472a9a9e0946154d603c) | [Dries Deryckere](https://sketchfab.com/deryckeredries) | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) | Dokulardaki gerçek marka, seri no, üretici adresi ve bir kişi fotoğrafı silindi |
| Yakın dövüş bıçağı | [Knife](https://sketchfab.com/3d-models/knife-8374ea78a11c4be5a2f145448c17c90e) | [CG Lab34](https://sketchfab.com/tuandesigner.mtc) | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) | Yönlendirildi, 30 cm'ye ölçeklendi, dokular 2048 px PNG'den 1024 px JPEG'e küçültüldü (dokularda yazı yok) |

Oyundaki silah adları kurgusaldır; kaynak model adlarındaki gerçek markalar oyunda kullanılmaz. Hazırlama: `web/tools/prepare-weapon-glb.mjs` (ayarlar `web/tools/weapon-glb-map.json`).

CC BY 4.0: yazar ve lisans belirtilerek ticari dahil her amaçla kullanılabilir, değiştirilebilir; değişiklikler belirtilmelidir. Oyun içinde "Emeği geçenler" ekranında da listelenir (`web/src/propAssets.json`'dan). Ayrıntı: `SourceAssets/Sketchfab/helicopter_pranav27/asset_info.json`.

## Prosedürel içerik

AR-7 Vanguard, SMG-9 Akrep, SG-12 Breaker, P-9 Sentinel, RK-7 Yıldırım, düşman silahları, tanklar, uçaksavarlar, harita, dokular ve seslerin tamamı kodla üretilir. Helikopter modeli yüklenemezse kodla üretilen yedek helikopter kullanılır. Asker modeli yüklenemezse oyun kodla üretilen yedek askerlere döner.

## Yazılım ve yazı tipleri

- three.js — MIT lisansı
- Big Shoulders Stencil Display, Barlow Condensed, Share Tech Mono — SIL Open Font License (Google Fonts)
