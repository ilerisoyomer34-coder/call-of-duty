# Demir Şafak

Tarayıcıda oynanan, birinci şahıs bakış açılı bir taktiksel savaş oyunu. Tek oyunculu, görev tabanlı: Kızılkum Vadisi'ne şafak vakti mavi mangan Kartal ekibiyle sızıyorsun, bir kontrol noktasını temizliyorsun, iki uçaksavar topunu C4 ile havaya uçuruyorsun, komuta merkezinden istihbaratı alıyorsun ve helikopter gelene kadar iniş bölgesini tutuyorsun. Beş seviye kolaydan zora sıralı; son seviye operasyonun tamamı.

Oyun, `Docs/MASTER_PROMPT.md`'deki Unreal Engine 5 shooter planının tarayıcıda çalışan dikey kesitidir. Silah hissi, yapay zekâ, görev akışı ve arayüz o plandaki mimariyle kuruldu. Düşman askerleri hazır iskeletli bir karakterdir (Mixamo "Vanguard"); dört silah oyuncunun kendi Blender dosyalarından gelir; harita, diğer modeller, dokular ve sesler kodla üretilir.

## Nasıl oynanır

- **Hemen oyna:** `web/dist/index.html` dosyasını indirip tarayıcıda çift tıklayarak aç. İnternet gerekmez (three.js dosyanın içinde).
- **Kaynaktan derle:**
  ```bash
  cd web
  npm install
  npm run build     # dist/index.html ve dist/artifact.html üretir
  npm run serve     # http://localhost:8080
  npm test          # başsız Chromium'da duman testi + ekran görüntüleri
  ```

Masaüstünde Chrome, Edge veya Firefox önerilir. Telefonda yatay tut; dokunmatik kontroller otomatik açılır.

## Kontroller

| Eylem | Klavye / fare | Gamepad |
|---|---|---|
| Hareket / bakış | WASD / fare | Sol / sağ çubuk |
| Ateş / nişan al | Sol tık / sağ tık | RT / LT |
| Koş, çömel, zıpla | Shift, C, Boşluk | L3, B, A |
| Şarjör değiştir | R | X |
| Atış modu (tüfek) | B | D-pad yukarı |
| El bombası (basılı tut: fitil pişir) | G | RB |
| Bıçak | V | R3 |
| Etkileşim (C4, istihbarat, ikmal) | F (basılı tut) | LB |
| Sola / sağa eğil | Q / E | D-pad sol / sağ |
| Silahlar | 1 ana, 2 yan silah (poligonda 1–9), X son silah, tekerlek | Y |
| Dürbünde nefesini tut | Shift | L3 |
| Duraklat | Esc / P | Start |
| Geliştirici konsolu | ` veya F2 | |

Konsol komutları: `god`, `ammo`, `giveall`, `spawn 3 heavy`, `killall`, `timescale 0.5`, `ai`, `debug ai`, `debug allies`, `cp 4`, `level 3`, `unlock`, `fps`.

## Seviyeler

Bir seviyeyi bitirince sonraki açılır. Her seviyenin zorluk ayarı, seçilen temel zorluğun (Acemi / Asker / Gazi) üstüne uygulanır: düşmanın tepki süresi, isabeti, hasarı, görüşü, aynı anda ateş edenlerin sayısı ve el bombası.

| # | Seviye | Zorluk | Hedefler | Düşmanlar | Manga |
|---|---|---|---|---|---|
| 1 | Kontrol Noktası | Kolay | Kontrol noktasını temizle | 6 tüfekçi, yavaş ve az isabetli, bomba yok | 3 dost |
| 2 | Uçaksavarlar | Kolay-orta | İki topu C4 ile imha et | 11: tüfekçi, hücumcu pompalılar, çatıda nöbetçi | 3 dost |
| 3 | Komuta Merkezi | Orta | İstihbaratı al, iniş bölgesine ulaş | 10 + 5 takviye: keskin nişancı ve ağır makineli dahil | 2 dost |
| 4 | İniş Bölgesi | Zor | Helikopter gelene kadar bölgeyi tut | 4 dalga, sonuncusunda iki ağır makineli | 3 dost |
| 5 | Demir Şafak | Çok zor | Operasyonun tamamı | 29 + takviye + 4 dalga, kulede keskin nişancılar | 2 dost |

Seviye ayarları `web/src/config.js` → `LEVELS`, dost asker ayarları → `ALLY`.

## İçerik

- **Dokuz silah:** her birinin kendi RPM'i, geri tepme deseni, sapması, nişan hızı, hareket ağırlığı ve sesi var.

  | Silah | Tür | Model |
  |---|---|---|
  | AR-7 Vanguard | Taarruz tüfeği (otomatik / 3'lü / tek) | prosedürel |
  | MAR-556 | Taarruz tüfeği, red dot | Blender (mar_556_1) |
  | SMG-9 Akrep | Hafif makineli, refleks nişangah | prosedürel |
  | SG-12 Breaker | Pompalı, fişek fişek dolum | prosedürel |
  | MG-43 | Hafif makineli tüfek, 100'lük kutu şarjör | Blender (mg_43_1) |
  | MR-82 Marret | .50 keskin nişancı, dürbün + nefes tutma | Blender (marret_m82) |
  | P-9 Sentinel | Tabanca | prosedürel |
  | D-50 Kartal | .50 ağır tabanca | Blender (golden_dessert_eagle_1) |
  | RK-7 Yıldırım | Roketatar, alan hasarı | prosedürel |

- **Teçhizat:** görevden önce ana ve yan silahı seçersin. Haritada yedi silah daha var; yerdekini F ile alınca aynı türdeki silahının yerine geçer, bıraktığın yere düşer.
- **Silah hissi:** kare hızından bağımsız atış zamanlaması, kameradan hitscan ve namludan engel doğrulaması, oyuncunun karşı hareketini hesaba katan geri tepme toparlanması, sway, bob, nefes, koşu pozu, duvara yaklaşınca geri çekme, prosedürel reload (şarjör düşer, sol el yenisini takar, boş reload'da kurma kolu çekilir), pompa ve sürgü hareketi, namlu alevi, iz mermisi, kovan, yüzeye göre çarpma efekti ve ses, vuruş işaretleri (normal / kafa / öldürme).
- **Askerler:** iskeletli hazır model; bekleme, yürüme ve koşma klipleri hıza göre karışır, adım döngüsü gerçek hıza bağlı olduğu için ayak kaymaz. Alt gövde hareket yönüne döner, üst gövde hedefe bakar; geri geri yürüme, yan adım, çömelme (bacak IK), iki elle silah tutuşu (kol IK), nişan / hazır / rahat duruşları, şarjör değiştirme, atışta geri tepme, isabette sarsılma, ölümde diz çöküp devrilme ve elden düşen silah. Türler renk tonu ve boyla ayrışır. Vuruş bölgeleri kemiklere bağlı kutulardır (kafa, gövde, kol-bacak). Model yüklenemezse kodla üretilen yedek askerler kullanılır.
- **Düşman yapay zekâsı:** devriye, şüphelenme, araştırma, alarm yayma, siper bulma ve siperden göz atma, yan adım, hücum eden pompalılar, bastırma ateşi yapan ağır makineliler, lazerle nişan alan keskin nişancılar, el bombası atma, düşük canda geri çekilme. Adil isabet: mesafe, hareketin, ilk atış ıskası ve zorluk hesaba katılır; aynı anda yalnızca sınırlı sayıda düşman sana ateş eder.
- **Mavi manga (Kartal ekibi):** aynı iskeletli askerin mavi sürümü. Seni gevşek bir düzende izler; sessiz ilerlerken ateş açmaz, çatışma başlayınca ya da sen ateş edince düzen yerinin yakınında siper alıp görünen en yakın düşmana kısa seriler atar. Düşmanlar dostları da hedef alır. Vurulan dost ölmez, bir süre yaralı kalıp toparlanır. Başlarında mavi isim etiketi, mini haritada mavi nokta var; telsizden seslenirler ("Temas!", "Şarjör!", "Düştü!"). Senin mermin ve patlayıcın dostu yaralamaz, ekrana uyarı çıkar.
- **Görev:** kontrol noktaları, telsiz anonsları, patlayıcı variller, düşen mühimmat, ikmal sandıkları, dalga savunması ve helikopterle tahliye. Zorluklar: Acemi, Asker, Gazi.
- **Atış poligonu:** 10 / 25 / 50 / 100 m hedefler, hareketli mankenler, yüzey test duvarı, hasar sayıları.
- **Arayüz:** pusula, mini harita (ateş eden düşmanlar görünür), hedef işaretçisi, hasar yönü, el bombası uyarısı, düşman farkındalık ikonları, ayarlar (hassasiyet, FOV, basılı tut / aç-kapa, grafik kalitesi, ses, kamera sarsıntısı, nişangah rengi, kan).

## Proje yapısı

```
web/
  src/
    main.js        oyun döngüsü, sahne, durum makinesi
    config.js      silah, hareket, düşman ve zorluk verileri (Data Asset karşılığı)
    player.js      hareket, bakış, geri tepme, sağlık, etkileşim
    weapons.js     silah durum makinesi, hitscan, reload, el bombası, bıçak
    viewmodel.js   birinci şahıs silah ve prosedürel animasyon
    enemy.js       düşman yapay zekâsı ve yöneticisi
    ally.js        dost manga: izleme düzeni, siper, ateş, yaralanıp toparlanma, dost ateşi
    soldier.js     asker görünümü: iskeletli model, animasyon karışımı, IK, vuruş kutuları
    assets.js      GLB ve doku yükleme (gömülü ya da yanındaki dosyadan)
    nav.js         ızgara navigasyonu, A*, siper noktaları
    world.js       çarpışma dünyası, ışın testi, geometri birleştirme
    level.js       harita ve atış poligonu
    mission.js     görev akışı, kontrol noktaları, hedefler
    effects.js     parçacık, iz, kovan, çıkartma, patlama
    audio.js       Web Audio ile sentezlenen tüm sesler
    hud.js         HUD, menus.js menüler, devconsole.js konsol
    shell.html     sayfa iskeleti ve arayüz stilleri
  assets/        silah GLB'leri, asker GLB'si ve dokuları
  tools/build.mjs  tek dosyaya paketleme
  tools/prepare-character.mjs  hazır karakteri oyuna hazırlama (UV/klip ayıklama, dokuları ayırma)
  tools/smoke-test.mjs  otomatik oynanış testi
Docs/MASTER_PROMPT.md  Unreal Engine 5 ana planı
Docs/import_reports/   her içe aktarılan model için rapor ve önizleme
SourceAssets/Weapons/  özgün .blend dosyaları ve asset_info.json (lisans kaydı)
SourceAssets/Characters/  özgün karakter dosyası ve asset_info.json
Tools/blender/         model inceleme ve oyuna dönüştürme betikleri
```

## Blender modeli ekleme

1. `.blend` dosyasını `SourceAssets/Weapons/<ad>/original/` altına koy, yanına `asset_info.json` yaz.
2. `Tools/blender/inspect_model.py` ile nesneleri ve üçgen sayılarını listele.
3. `Tools/blender/weapon_rig_map.json` içine eksen, sağ el noktası, namlu/nişan/sol el noktalarını ve animasyonlu parça adlarını ekle.
4. `python Tools/blender/export_weapon.py <ad> --render` (bpy kurulu Python ile) → `web/assets/weapons/<ad>.glb`, `web/src/weaponAssets.json` ve `Docs/import_reports/<ad>.md`.
5. `web/src/config.js` içinde silah verisine `model: 'glb'` ekle, `npm run build`.

## Hazır karakter ekleme

1. Kaynak dosyayı `SourceAssets/Characters/<ad>/original/` altına koy, yanına lisansıyla `asset_info.json` yaz.
2. `web/tools/prepare-character.mjs` içindeki `SOURCES` tablosuna bir satır ekle (klip ve doku adları).
3. `cd web && node tools/prepare-character.mjs <ad>` → `web/assets/characters/<ad>.glb`, dokular ve `web/src/characterAssets.json`.
4. Klip adları `Idle`, `Walk`, `Run`, kemikler Mixamo adlandırmasında olmalı (`Hips`, `Spine2`, `RightArm`…). Adım boyları `config.js` → `SOLDIER_ANIM`'de.
