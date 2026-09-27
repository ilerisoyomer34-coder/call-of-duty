# Demir Şafak

Tarayıcıda oynanan, birinci şahıs bakış açılı bir taktiksel savaş oyunu. Tek oyunculu, görev tabanlı: mavi mangan Kartal ekibiyle beş farklı haritada operasyona çıkıyorsun. Kontrol noktalarını temizliyor, uçaksavarları ve yakıt pompalarını C4 ile patlatıyor, tankları roketatarla vuruyor, istihbarat topluyor ve helikopter gelene kadar iniş bölgesini tutuyorsun. Her bölüm helikoptere binip havalanınca biter, ardından sıradaki bölüm kendiliğinden başlar. Altı seviye kolaydan zora sıralı. İlk ikisi Kızılkum Vadisi'nde geçer; sonrakiler gün batımında bir limanda, yıkık bir şehirde, karlı bir dağ geçidinde ve gece bir rafineride. Zorlaştıkça düşman ağır makineli mevziler ve tanklar kurar, senin mangan da her seviyede daha profesyonel oynar.

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

Bir seviyeyi bitirince sonraki açılır. Her seviye helikopterle tahliyeyle biter: son hedeften sonra Şahin-2 iner, yanına gidip binince manga da biner ve kalkış sahnesi oynar (kabin kapısından geride kalan savaş alanı görünür). Ardından "Bölüm tamamlandı" kartı çıkar; 6 saniyelik geri sayım bitince sıradaki bölüm kendiliğinden başlar. Kartta "Sonraki bölüme geç", "Tekrar oyna", "Ana menü" ve geri sayımı durduran "Beklet" düğmeleri var. Son seviyenin ardından "Operasyon tamamlandı" ekranı gelir. Her seviyenin zorluk ayarı, seçilen temel zorluğun (Acemi / Asker / Gazi) üstüne uygulanır: düşmanın tepki süresi, isabeti, hasarı, görüşü, aynı anda ateş edenlerin sayısı ve el bombası. Gece haritasında düşmanın görüşü ayrıca kısalır.

| # | Seviye | Harita | Zorluk | Hedefler | Makineli yuvası | Tank | Manga |
|---|---|---|---|---|---|---|---|
| 1 | Kontrol Noktası | Kızılkum Vadisi (çöl, şafak) | Kolay | Kontrol noktasını temizle, doğudaki düzlükten tahliye | — | — | 3 × Er |
| 2 | Uçaksavarlar | Kızılkum Vadisi | Kolay-orta | İki topu C4 ile imha et (nişancıları sana ateş eder), köyün kuzeyinden tahliye | — | — | 3 × Onbaşı |
| 3 | Liman | Liman (gün batımı, konteyner sahası) | Orta | Kapıyı temizle, rıhtımdaki iki topu patlat, pisti tut, tahliye | 2 | — | 3 × Çavuş |
| 4 | Yıkık Şehir | Yıkık Şehir (kapalı hava, kül) | Orta-zor | Meydanı temizle, istihbaratı al, stadyumdaki pisti tut | 3 | 1 | 3 × Çavuş |
| 5 | Karlı Geçit | Karlı Dağ Geçidi (kar yağışı) | Zor | Karakol, iki top, sığınaktaki haritalar, platoda tahliye | 4 | 2 | 3 × Uzman Çavuş |
| 6 | Demir Şafak | Gece Rafinerisi | Çok zor | Kapı, üç yakıt pompası, kontrol odası, şafağa kadar savunma | 5 | 2 | 3 × Komando |

- **Ağır makineli mevzi:** kum torbası halkasının içinde sehpalı bir makineli ve başında bir nişancı. Silah yalnızca önündeki yayı (±65°) tarar ve hedefe yavaş döner. Önündeki kalkan mermiyi durdurur, nişancının başı kalkanın üstünde açıkta kalır. Hedefi kaybedince son bilinen noktayı tarar. Karşı hamleler: yandan ya da arkadan dolanmak, el bombası ya da roketle susturmak (başlangıç noktalarında roketatar var), nişancıyı bastırma ateşiyle eğdirip yanaşmak. Yanından kuşatılan nişancı silahı bırakıp tüfekle savaşır. Mevzi ilk ateş açtığında ekranda uyarı çıkar, mini haritada kırmızı üçgenle görünür.
- **Uçaksavar nişancısı:** Seviye 2'den itibaren topların başında bir nişancı durur. Çatışma yokken top göğe ateş eder (izli mermiler yerini belli eder); seni görünce taret sana döner ve hedefin yakınında patlayan mermilerle seri atar. Taret tam döner ama yavaştır, koşarak yandan dolanabilirsin. Nişancı ölünce top susar; C4 hedefi olmaya devam eder.
- **Tank:** Seviye 4'ten itibaren siper arkasında sabit mevzideki tanklar. Taret hedefe yavaş döner; hizalanınca bir an nişan alır ve ana topla ateş eder (patlayıcı mermi), yakındaki hedefe eş eksenli makineliyle seri atar. Mermi zırhı delmez (kıvılcım çıkar); el bombası az, roket çok hasar verir: üç roket isabeti ya da yanına yerleştirilen tek C4 tankı imha eder. Tank seni ilk gördüğünde ekranda "TANK!" uyarısı çıkar, mangan telsizden bildirir, mini haritada namlusunun yönüyle kırmızı işaret belirir. Tank bulunan haritalarda yakına roketatar konmuştur.
- **Profesyonelleşen manga:** her seviyede mangan bir rütbe atlar. Rütbe isabeti, tepki süresini, hasarı ve dayanıklılığı artırır; 25 metredeki bir düşmanı Er ortalama ~24, Komando ~7 mermide düşürür. Yeni taktikler açılır:

  | Rütbe | Yeni taktik |
  |---|---|
  | Er | izler, siper alır, karşılık verir |
  | Onbaşı | siperden eğilip çıkarak ateş, düşmanı telsizle ve ekranda işaretle bildirme ("saat 2 yönünde, 30 metre") |
  | Çavuş | makineli yuvasını bastırma ateşiyle eğdirme, yaralı arkadaşını ayıltma |
  | Uzman Çavuş | el bombası (toplu düşmana, mevziye, siperdeki hedefe), sıçramalı ilerleme (biri örterken diğeri ilerler) |
  | Komando | bir dost mevzinin atış yayının dışına dolanıp nişancıyı yandan vurur |

Seviye ayarları `web/src/config.js` → `LEVELS`; harita ortamları → `MAPS`; mevzi → `HMG`; uçaksavar → `AA_GUN`; tank → `TANK`; tahliye ve kalkış sahnesi → `EXTRACT`; manga kademeleri → `ALLY_TIERS`; çizim çözünürlüğü → `RENDER`.

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
- **Görüntü:** dünya ölçekli çözünürlükte, kenar yumuşatmalı (MSAA) ayrı bir hedefe çizilir; eller ve silah her zaman tam cihaz çözünürlüğünde, kenar yumuşatmalı çizilir. Telefonda performans korunurken silah ve eller keskin kalır. Ayarlarda "Dünya çözünürlüğü" seçilebilir; dokular kaliteye göre anizotropik süzmeyle örneklenir (yüksekte 16×, ortada 8×, düşükte 4×). Düşük kalite bilinçli performans modudur: tuvalde kenar yumuşatma kapalıdır. Birinci şahıs eller prosedürel eldivenli ellerdir (parmaklar kabzayı ve el kundağını kavrar).
- **Askerler:** iskeletli hazır model; bekleme, yürüme ve koşma klipleri hıza göre karışır, adım döngüsü gerçek hıza bağlı olduğu için ayak kaymaz. Alt gövde hareket yönüne döner, üst gövde hedefe bakar; geri geri yürüme, yan adım, çömelme (bacak IK), iki elle silah tutuşu (kol IK), nişan / hazır / rahat duruşları, şarjör değiştirme, atışta geri tepme, isabette sarsılma, ölümde diz çöküp devrilme ve elden düşen silah. Türler renk tonu ve boyla ayrışır. Vuruş bölgeleri kemiklere bağlı kutulardır (kafa, gövde, kol-bacak). Model yüklenemezse kodla üretilen yedek askerler kullanılır. Uzaktaki askerler donmaz: yer ve yön her karede güncellenir, poz uzaklığa göre saniyede 30/15/8 kez hesaplanır; gölge menzili dışında yumuşak ayak gölgesi, karanlıkta kararmamaları için ortam yansıması alırlar.
- **Düşman yapay zekâsı:** devriye, şüphelenme, araştırma, alarm yayma, siper bulma ve siperden göz atma, yan adım, hücum eden pompalılar, bastırma ateşi yapan ağır makineliler, mevzideki sehpalı makineliler, lazerle nişan alan keskin nişancılar, el bombası atma, düşük canda geri çekilme. Adil isabet: mesafe, hareketin, ilk atış ıskası ve zorluk hesaba katılır; aynı anda yalnızca sınırlı sayıda düşman sana ateş eder.
- **Mavi manga (Kartal ekibi):** aynı iskeletli askerin mavi sürümü (Komando rütbesinde koyu lacivert). Seni gevşek bir düzende izler; sessiz ilerlerken ateş açmaz, çatışma başlayınca ya da sen ateş edince düzen yerinin yakınında siper alıp görünen en yakın düşmana kısa seriler atar. Rütbeyle açılan taktikler yukarıdaki tabloda. Düşmanlar dostları da hedef alır. Vurulan dost ölmez, bir süre yaralı kalıp toparlanır. Başlarında rütbeli mavi isim etiketi, mini haritada mavi nokta var; telsizden seslenirler ("Temas!", "Makineliyi bastırıyorum, yanaş!", "Bomba atıyorum!"). Senin mermin ve patlayıcın dostu yaralamaz, manganın bombası da seni yaralamaz.
- **Haritalar ve ortam:** her haritanın kendi gökyüzü, sis, güneş/ay ışığı, silah yansıması, ortam sesi (rüzgâr, dalga, makine uğultusu) ve hava durumu (kar, kül) var. Işık sayısı sabit; gece lambaları ışımalı malzemedir, baca alevi parçacıktır.
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
    level.js       harita seçimi ve atış poligonu
    maps/          görev haritaları (kizilkum, harbor, ruins, pass, refinery) ve ortak yapı takımı (kit.js)
    hmg.js         ağır makineli mevzi: silah modeli, zırh, susturma
    tank.js        düşman tankı: algı, taret, ana top ve eş eksenli makineli, zırh, C4, enkaz
    mission.js     görev akışı, kontrol noktaları, hedefler, uçaksavar, helikopterle tahliye ve kalkış sahnesi
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
