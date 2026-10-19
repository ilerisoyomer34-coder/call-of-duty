# Silah nişan kalibrasyonu

18 Ekim 2026. Her silahın son göz mesafesi, görünüm görüş açısı ve avuç noktaları `src/config.js → WEAPON_AIM` tablosundadır. Bu tablo `WEAPONS` kayıtlarının görünüm değerlerini tamamlar; oyun dengesi, atış hızı ve dünya kamerasındaki büyütme değişmez.

AK-47, MP7, ADAR, G95, AR-10, M4 Super 90 ve Desert Eagle'ın gez/arpacık noktaları gerçek GLB geometrisinden ölçüldü. Ithaca'nın boncuğu, Glock ve Remington'ın prosedürel nişangâhları da hizalandı. Elin yönü artık dirsekten bağımsızdır: yatay kundak alttan, dikey tutamak yandan kavranır. Bilek, şarjör/sürgü animasyonunda serbest tutuşa yumuşak geçer. Minigun ve bıçak, nişangâhları olmadığı için hayalî bir gez noktasına taşınmaz.

| Silah | Nişangâh | Göz–gez mesafesi | Silah FOV |
|---|---|---:|---:|
| AKMS | reflex | 0.270 m | 38° |
| MAR-556 | reflex | 0.225 m | 38° |
| HK MP5A3 | reflex | 0.240 m | 44° |
| Remington 870 | iron | 0.320 m | 44° |
| HK MG4 | prism | 0.240 m | 42° |
| Barrett M82A1 | scope | 0.200 m | 40° |
| Glock 17 | iron | 0.380 m | 46° |
| Desert Eagle | iron | 0.430 m | 46° |
| M20 Bazuka | iron | 0.330 m | 46° |
| Colt Canada C8 IUR | iron | 0.245 m | 38° |
| Colt M4A1 | iron | 0.235 m | 38° |
| M4 Karabina (Holografik) | reflex | 0.220 m | 38° |
| Remington ACR | scope | 0.230 m | 40° |
| AK-74M Zenitco | reflex | 0.235 m | 38° |
| CZ Bren 2 | iron | 0.230 m | 42° |
| Accuracy International AWM | scope | 0.180 m | 40° |
| M134 Minigun | none | 0.300 m | 60° |
| Lightning Pompalı Karabina | scope | 0.190 m | 40° |
| Muharebe Bıçağı | none | 0.300 m | 60° |
| AK-47 | iron | 0.400 m | 44° |
| ADAR 2-15 | iron | 0.260 m | 40° |
| HK G95 A1 | iron | 0.255 m | 40° |
| HK MP7 A1 | iron | 0.235 m | 46° |
| STM-556 | reflex | 0.235 m | 40° |
| M4 Super 90 (JW2) | iron | 0.320 m | 44° |
| Armalite AR-10(T) | iron | 0.290 m | 40° |
| Ithaca Model 37 Riot | iron | 0.440 m | 46° |

## Yeniden kontrol

- `npm run test:unit`: gerçek GLB ve el geometrisiyle merkez ışınları; 16:9, 19.5:9 ve 9:16; üç hafif dönüş açısı. Gez merkezde, arpacık aynı hatta ve eller hedefin dışında kalmalı. Demir nişangâhlarda merkez ışını gövdeye çarpmamalı.
- `node tools/aim-inspector.mjs`: http://127.0.0.1:8086/ adresinde oyunun gerçek Viewmodel sınıfı ve modelleri; her silahın kalça/nişan görüntüsü, tümü için karşılaştırma ve animasyon denetimi. Kaynak değişince tarayıcıyı yenile. Bu araç üretim paketine girmez.
- Gerçek oyunda Aç/kapa nişan seçeneğiyle AK-47 görevi, poligonda dürbün, pompalı ve tabanca kontrolü.

Matematik testleri sabit pozdaki hizayı ölçer; oyundaki nefes, geri tepme ve yürüme salınımı korunur.

## Taktik eldiven ve bilek düzeltmesi

`Soldier Full Tactical Gear` (DanlyVostok, CC BY 4.0) eldivenleri ve üniforma ön kolları kullanılır. `tools/prepare-fps-arms.mjs` avuç yönünü orta parmak, işaret ve serçe boğumlarından ortonormal olarak çıkarır. Dirsek/bilek tabanında eksenler birbirine diktir; yan ölçekleme ve bükülme kumaşı sivriltmez. Ön kolun dönüşü el sırtından türetilir. Dirsekler elin dünya konumundan anatomik uzunlukta ofsetlerle kurulur (`HAND_VIEW`).

Hazırlama: `TEXTURE_PYTHON=/path/to/python-with-pillow node tools/prepare-fps-arms.mjs`. Kaynak ve lisans `SourceAssets/Sketchfab/fps_arms_danlyvostok/` içindedir. Yakın denetim: `node tools/arms-inspector.mjs`; gerçek silahlar: `node tools/aim-inspector.mjs`.
