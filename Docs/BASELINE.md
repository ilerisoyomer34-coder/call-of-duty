# BASELINE — tek oyunculu referans ölçümleri

Çok oyunculu güncelleme (Faz M1) hareket, çarpışma ve silah kodunu paylaşılan simülasyona (`web/shared/sim/`) taşıdı.
Bu tablo, taşımadan önceki tek oyunculu davranışı ve taşımadan sonraki ölçümü karşılaştırır. Kabul ölçütü: her satırda fark ≤ %2.
Zaman ölçümleri kare çözünürlüğündedir (1/60 sn): hareket artık 1/64 sn tick ile ilerlediği için bir eşiğin hangi karede aşıldığı bir kare kayabilir; bu yüzden zamanda bir kare, mesafede 1 cm, hızda 0,02 m/s mutlak pay vardır (çok küçük değerlerde yüzde yanıltıcı).

- Ölçüm aracı: `cd web && node tools/baseline.mjs` (ölç ve kaydet), `node tools/baseline.mjs --compare` (karşılaştır).
- Yöntem: poligonda açık bir şerit; çizim kapalı, oyun saati 1/60 sn adımlarla doğrudan ilerletilir; girdi tuş durumuyla verilir. `Math.random` tohumludur, geri tepmenin rastgele payı ölçümde kapalıdır (desenin kendisi karşılaştırılır).
- Referans commit: `4dae2b2`.
- Bot davranışı M1'de değişmedi (düşman/dost kodu taşınmadı); bu yüzden ölçülmedi.
- Yarı otomatik silahlarda "rpm" her iki karede bir basışla ölçülen en yüksek tempodur (1/60 sn kare süresine bağlı).

| Ölçüt | Birim | Önce | M1 sonrası | Fark | Durum |
|---|---|---:|---:|---:|---|
| walk.topSpeed | m/s | 4.000 | 4.000 | 0.00 % | ✓ |
| walk.t95 | s | 0.083 | 0.083 | 0.00 % | ✓ |
| walk.stopDist | m | 0.100 | 0.104 | 3.52 % | ✓ mutlak pay |
| walk.stopTime | s | 0.067 | 0.083 | 25.00 % (+1 kare) | ✓ mutlak pay |
| sprint.topSpeed | m/s | 6.500 | 6.500 | 0.00 % | ✓ |
| sprint.t95 | s | 0.117 | 0.117 | 0.00 % | ✓ |
| crouch.topSpeed | m/s | 2.000 | 2.000 | 0.00 % | ✓ |
| crouch.t95 | s | 0.050 | 0.050 | 0.00 % | ✓ |
| strafe.topSpeed | m/s | 4.000 | 4.000 | 0.00 % | ✓ |
| strafe.t95 | s | 0.083 | 0.083 | 0.00 % | ✓ |
| back.topSpeed | m/s | 4.000 | 4.000 | 0.00 % | ✓ |
| back.t95 | s | 0.083 | 0.083 | 0.00 % | ✓ |
| ads.topSpeed | m/s | 2.800 | 2.801 | 0.03 % | ✓ |
| ads.t95 | s | 0.050 | 0.067 | 33.33 % (+1 kare) | ✓ mutlak pay |
| jump.height | m | 0.728 | 0.732 | 0.56 % | ✓ |
| jump.airTime | s | 0.633 | 0.617 | -2.63 % (−1 kare) | ✓ mutlak pay |
| sprintJump.dist | m | 2.698 | 2.653 | -1.67 % | ✓ |
| walk.dist1s | m | 3.886 | 3.884 | -0.06 % | ✓ |
| crouchDown.t95 | s | 0.250 | 0.267 | 6.67 % (+1 kare) | ✓ mutlak pay |
| rifle.spread.hip0 | ° | 2.600 | 2.600 | 0.00 % | ✓ |
| rifle.spread.ads0 | ° | 0.260 | 0.260 | 0.00 % | ✓ |
| rifle.rpm | rpm | 720 | 720 | 0.00 % | ✓ |
| rifle.spread.after10 | ° | 3.100 | 3.100 | 0.00 % | ✓ |
| rifle.recoil.pitch10 | ° | 6.800 | 6.800 | 0.00 % | ✓ |
| rifle.recoil.yaw10 | ° | -0.100 | -0.100 | 0.00 % | ✓ |
| rifle.recoil.after05 | ° | 0.201 | 0.201 | 0.00 % | ✓ |
| shotgun.spread.hip0 | ° | 1.200 | 1.200 | 0.00 % | ✓ |
| shotgun.spread.ads0 | ° | 0.720 | 0.720 | 0.00 % | ✓ |
| shotgun.rpm | rpm | 90 | 90 | 0.00 % | ✓ |
| shotgun.recoil.after05 | ° | 0.116 | 0.116 | 0.00 % | ✓ |
| pistol.spread.hip0 | ° | 1.800 | 1.800 | 0.00 % | ✓ |
| pistol.spread.ads0 | ° | 0.270 | 0.270 | 0.00 % | ✓ |
| pistol.rpm | rpm | 420 | 420 | 0.00 % | ✓ |
| pistol.spread.after10 | ° | 2.700 | 2.700 | 0.00 % | ✓ |
| pistol.recoil.pitch10 | ° | 2.522 | 2.522 | 0.00 % | ✓ |
| pistol.recoil.yaw10 | ° | -0.011 | -0.011 | 0.00 % | ✓ |
| pistol.recoil.after05 | ° | 0.075 | 0.075 | 0.00 % | ✓ |
| mar556.spread.hip0 | ° | 2.800 | 2.800 | 0.00 % | ✓ |
| mar556.spread.ads0 | ° | 0.224 | 0.224 | 0.00 % | ✓ |
| mar556.rpm | rpm | 810 | 810 | 0.00 % | ✓ |
| mar556.spread.after10 | ° | 3.433 | 3.433 | 0.00 % | ✓ |
| mar556.recoil.pitch10 | ° | 4.578 | 4.578 | 0.00 % | ✓ |
| mar556.recoil.yaw10 | ° | 0.163 | 0.163 | 0.00 % | ✓ |
| mar556.recoil.after05 | ° | 0.061 | 0.061 | 0.00 % | ✓ |
| lmg.spread.hip0 | ° | 4.000 | 4.000 | 0.00 % | ✓ |
| lmg.spread.ads0 | ° | 0.560 | 0.560 | 0.00 % | ✓ |
| lmg.rpm | rpm | 900 | 900 | 0.00 % | ✓ |
| lmg.spread.after10 | ° | 5.300 | 5.300 | 0.00 % | ✓ |
| lmg.spread.after30 | ° | 7.700 | 7.700 | 0.00 % | ✓ |
| lmg.recoil.pitch10 | ° | 5.070 | 5.070 | 0.00 % | ✓ |
| lmg.recoil.yaw10 | ° | 0.550 | 0.550 | 0.00 % | ✓ |
| lmg.recoil.after05 | ° | 0.663 | 0.663 | 0.00 % | ✓ |
| sniper.spread.hip0 | ° | 7.000 | 7.000 | 0.00 % | ✓ |
| sniper.spread.ads0 | ° | 0.000 | 0.000 | 0 | ✓ |
| sniper.rpm | rpm | 90 | 90 | 0.00 % | ✓ |
| sniper.recoil.after05 | ° | 0.306 | 0.306 | 0.00 % | ✓ |
| d50.spread.hip0 | ° | 2.400 | 2.400 | 0.00 % | ✓ |
| d50.spread.ads0 | ° | 0.288 | 0.288 | 0.00 % | ✓ |
| d50.rpm | rpm | 180 | 180 | 0.00 % | ✓ |
| d50.recoil.after05 | ° | 0.077 | 0.077 | 0.00 % | ✓ |
| smg.spread.hip0 | ° | 2.000 | 2.000 | 0.00 % | ✓ |
| smg.spread.ads0 | ° | 0.360 | 0.360 | 0.00 % | ✓ |
| smg.rpm | rpm | 960 | 960 | 0.00 % | ✓ |
| smg.spread.after10 | ° | 4.100 | 4.100 | 0.00 % | ✓ |
| smg.spread.after30 | ° | 7.000 | 7.000 | 0.00 % | ✓ |
| smg.recoil.pitch10 | ° | 4.430 | 4.430 | 0.00 % | ✓ |
| smg.recoil.yaw10 | ° | 0.250 | 0.250 | 0.00 % | ✓ |
| smg.recoil.after05 | ° | 0.089 | 0.089 | 0.00 % | ✓ |
| rpg.spread.hip0 | ° | 3.000 | 3.000 | 0.00 % | ✓ |
| rpg.spread.ads0 | ° | 0.300 | 0.300 | 0.00 % | ✓ |
| k8.spread.hip0 | ° | 2.900 | 2.900 | 0.00 % | ✓ |
| k8.spread.ads0 | ° | 0.232 | 0.232 | 0.00 % | ✓ |
| k8.rpm | rpm | 720 | 720 | 0.00 % | ✓ |
| k8.spread.after10 | ° | 3.200 | 3.200 | 0.00 % | ✓ |
| k8.recoil.pitch10 | ° | 6.473 | 6.473 | 0.00 % | ✓ |
| k8.recoil.yaw10 | ° | -0.105 | -0.105 | 0.00 % | ✓ |
| k8.recoil.after05 | ° | 0.256 | 0.256 | 0.00 % | ✓ |
| kr4.spread.hip0 | ° | 2.500 | 2.500 | 0.00 % | ✓ |
| kr4.spread.ads0 | ° | 0.250 | 0.250 | 0.00 % | ✓ |
| kr4.rpm | rpm | 450 | 450 | 0.00 % | ✓ |
| kr4.spread.after10 | ° | 2.800 | 2.800 | 0.00 % | ✓ |
| kr4.recoil.pitch10 | ° | 0.625 | 0.625 | 0.00 % | ✓ |
| kr4.recoil.yaw10 | ° | -0.236 | -0.236 | 0.00 % | ✓ |
| kr4.recoil.after05 | ° | 0.009 | 0.009 | 0.00 % | ✓ |
| mk4.spread.hip0 | ° | 2.600 | 2.600 | 0.00 % | ✓ |
| mk4.spread.ads0 | ° | 0.182 | 0.182 | 0.00 % | ✓ |
| mk4.rpm | rpm | 840 | 840 | 0.00 % | ✓ |
| mk4.spread.after10 | ° | 3.200 | 3.200 | 0.00 % | ✓ |
| mk4.recoil.pitch10 | ° | 4.182 | 4.182 | 0.00 % | ✓ |
| mk4.recoil.yaw10 | ° | 0.146 | 0.146 | 0.00 % | ✓ |
| mk4.recoil.after05 | ° | 0.049 | 0.049 | 0.00 % | ✓ |
| kt9.spread.hip0 | ° | 4.500 | 4.500 | 0.00 % | ✓ |
| kt9.spread.ads0 | ° | 0.090 | 0.090 | 0.00 % | ✓ |
| kt9.rpm | rpm | 330 | 330 | 0.00 % | ✓ |
| kt9.spread.after10 | ° | 9.300 | 9.300 | 0.00 % | ✓ |
| kt9.recoil.pitch10 | ° | 4.841 | 4.841 | 0.00 % | ✓ |
| kt9.recoil.yaw10 | ° | -0.025 | -0.025 | 0.00 % | ✓ |
| kt9.recoil.after05 | ° | 0.399 | 0.399 | 0.00 % | ✓ |

**Sonuç:** 98 ölçümün tamamı sınır içinde.
