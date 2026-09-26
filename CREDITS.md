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

## Prosedürel içerik

AR-7 Vanguard, SMG-9 Akrep, SG-12 Breaker, P-9 Sentinel, RK-7 Yıldırım, düşman silahları, harita, dokular ve seslerin tamamı kodla üretilir. Asker modeli yüklenemezse oyun kodla üretilen yedek askerlere döner.

## Yazılım ve yazı tipleri

- three.js — MIT lisansı
- Big Shoulders Stencil Display, Barlow Condensed, Share Tech Mono — SIL Open Font License (Google Fonts)
