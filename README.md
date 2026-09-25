# Demir Şafak

Tarayıcıda oynanan, birinci şahıs bakış açılı bir taktiksel savaş oyunu. Tek oyunculu, görev tabanlı: Kızılkum Vadisi'ne şafak vakti sızıyorsun, bir kontrol noktasını temizliyorsun, iki uçaksavar topunu C4 ile havaya uçuruyorsun, komuta merkezinden istihbaratı alıyorsun ve helikopter gelene kadar iniş bölgesini tutuyorsun. Tek oturuşta 10–15 dakika sürer.

Oyun, `Docs/MASTER_PROMPT.md`'deki Unreal Engine 5 shooter planının tarayıcıda çalışan dikey kesitidir. Silah hissi, yapay zekâ, görev akışı ve arayüz o plandaki mimariyle kuruldu; modellerin, dokuların ve seslerin tamamı kodla üretiliyor, dışarıdan asset yok.

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
| Silahlar | 1 tüfek, 2 pompalı, 3 tabanca, X son silah, tekerlek | Y |
| Duraklat | Esc / P | Start |
| Geliştirici konsolu | ` veya F2 | |

Konsol komutları: `god`, `ammo`, `giveall`, `spawn 3 heavy`, `killall`, `timescale 0.5`, `ai`, `debug ai`, `cp 4`, `fps`.

## İçerik

- **Üç silah, üç his:** AR-7 Vanguard (otomatik / 3'lü seri / tek atış), SG-12 Breaker (fişek fişek dolan pompalı, 9 saçma), P-9 Sentinel (yarı otomatik tabanca). Her birinin kendi RPM'i, geri tepme deseni, sapması, ADS hızı ve sesi var.
- **Silah hissi:** kare hızından bağımsız atış zamanlaması, kameradan hitscan ve namludan engel doğrulaması, oyuncunun karşı hareketini hesaba katan geri tepme toparlanması, sway, bob, nefes, koşu pozu, duvara yaklaşınca geri çekme, prosedürel reload (şarjör düşer, sol el yenisini takar, boş reload'da kurma kolu çekilir), pompa ve sürgü hareketi, namlu alevi, iz mermisi, kovan, yüzeye göre çarpma efekti ve ses, vuruş işaretleri (normal / kafa / öldürme).
- **Düşman yapay zekâsı:** devriye, şüphelenme, araştırma, alarm yayma, siper bulma ve siperden göz atma, yan adım, hücum eden pompalılar, bastırma ateşi yapan ağır makineliler, lazerle nişan alan keskin nişancılar, el bombası atma, düşük canda geri çekilme. Adil isabet: mesafe, hareketin, ilk atış ıskası ve zorluk hesaba katılır; aynı anda yalnızca sınırlı sayıda düşman sana ateş eder.
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
    nav.js         ızgara navigasyonu, A*, siper noktaları
    world.js       çarpışma dünyası, ışın testi, geometri birleştirme
    level.js       harita ve atış poligonu
    mission.js     görev akışı, kontrol noktaları, hedefler
    effects.js     parçacık, iz, kovan, çıkartma, patlama
    audio.js       Web Audio ile sentezlenen tüm sesler
    hud.js         HUD, menus.js menüler, devconsole.js konsol
    shell.html     sayfa iskeleti ve arayüz stilleri
  tools/build.mjs  tek dosyaya paketleme
  tools/smoke-test.mjs  otomatik oynanış testi
Docs/MASTER_PROMPT.md  Unreal Engine 5 ana planı
```
