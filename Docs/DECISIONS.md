# Çok oyunculu güncelleme — kararlar

`Docs/MULTIPLAYER_PROMPT.md` belgesinden bilinçli olarak ayrılan noktalar ve nedenleri. Her yeni sapma buraya tarih ve fazla eklenir.

## Kullanıcı kararları (M0 sonrası)

| Konu | Karar | Neden / etkisi |
|---|---|---|
| Barındırma | Kullanıcı bir VPS alacak | Geliştirme ve testler yerelde koşar; M12'de Docker + Caddy ile VPS kurulum belgesi (`Docs/DEPLOY.md`). |
| Platform | Çok oyunculu hem PC'de hem telefonda (dokunmatik) | Belgedeki "mobil kapsam dışı" maddesi geçersiz. Her yeni ekran ve kontrol dokunmatikte çalışır. `InputCmd` analog hareket taşır (aşağıda). |
| Mod sırası | Takım Ölüm Maçı / Ölüm Maçı → Rekabetçi (bomba, round ekonomisi) → Co-op | İlk oynanabilir çevrim içi sürüm M5'te TDM/DM ile çıkar; Rekabetçi aynı fazın ikinci yarısı. |
| Tek oyunculu | Olduğu gibi kalır | Kampanya Web Worker'a ya da LoopbackTransport'a taşınmaz (belge §4.5 uygulanmaz). Yalnız hareket, çarpışma ve silah çekirdeği paylaşılan koda taşınır; tek oyunculu da bu kodu kullanır. Görev, düşman, dost ve tank yapay zekâsı tek oyunculuda istemcide kalır; sunucu botları M7'de ayrı yazılır (mevcut durum makinesinden uyarlanarak). |

## Teknik sapmalar

| Belge | Uygulanan | Neden |
|---|---|---|
| Vite'a geçiş (M1) | esbuild kalır (`web/tools/build.mjs`) | Mevcut derleme üç çıktı üretiyor (bağımsız tek dosya, Artifact, PWA) ve testler bunlara bağlı. Vite bu üç çıktıyı yeniden kurmayı gerektirir, kazanç yok. `web/shared/` göreli içe aktarmayla paketlenir. |
| TypeScript / Vitest | JSDoc + `node:test` | Proje düz JS; mevcut 65+ birim testi `node --test` ile koşuyor. Yeni bağımlılık yok. |
| `three-mesh-bvh` | Kullanılmaz | Dünyanın çarpışması zaten eksen hizalı kutulardan oluşan bir ızgara (`CollisionWorld`, DDA ışın testi). Üçgen ağına gerek yok; sunucu aynı kutuları okur. |
| Klasör yapısı (`client/`, `server/`, `shared/` kökte) | `web/src/` (istemci), `web/shared/`, `web/server/` (M2) | Depo kökü UE5 planını da taşıyor; web projesi `web/` altında tek `package.json` ile kalır. npm workspaces gerekmez. |
| `docs/` | `Docs/` | Depoda mevcut klasör adı. |
| `shared/data/` | Veri `web/src/data/*.json`'da kalır | Esbuild ve Node testleri aynı JSON'u zaten okuyor; taşımak yalnız içe aktarma yollarını değiştirir. Sunucu aynı dosyaları içe aktarır. |
| Çapraz motor determinizm testi (Chromium, Firefox, WebKit) | Node + Chromium | Ortamda yalnız Chromium kurulu. Nicemleme (tick sonu) motorlar arası farkları zaten keser. |
| Tick sonu nicemleme: konum 1/1024 m, hız 1/256 m/s | Aynen | `web/shared/constants.js`. |
| `stepPlayer(s, cmd, world, dt)` yeni durum döndürür | Durumu yerinde günceller ve olay listesini döndürür | Çalışma sırasında bellek ayırmama kuralı (CLAUDE.md). Sunucu ve istemci tahmini gerektiğinde `clonePlayerState` ile kopya alır. |

## Tuş atamaları (çakışma taraması)

Mevcut atamalar: Z bağlamsal işaret, X silah takası, C çömelme, T komut çarkı, Enter telsiz satırı, N sesli komut, F1–F5/F8/F9 tim komutları.

| Belge önerisi | Uygulanacak | Neden |
|---|---|---|
| Telsiz komutları Z / X / C menüleri | T komut çarkı (PvP'de telsiz dilimleri) | Z, X, C dolu. Çark dokunmatikte de çalışıyor. |
| Sohbet (herkese / takıma) | Y herkese, U takıma; dokunmatikte SOHBET düğmesi | Y ve U boş. |
| İşaret (ping) | Orta fare tuşu ve Z | Z zaten bağlamsal işaret; orta tuş boş. |

## Ağ protokolü uyarlamaları

- `InputCmd` dokunmatik ve gamepad için analog hareket taşır: `moveX`, `moveY` (i8, −127…127). Klavye ±127 gönderir. Belgedeki yalnız düğme bitleri telefonda yürüme hızını kaybettirirdi.
- Aç/kapa (çömelme, koşu, nişan) istemcinin girdi katmanında çözülür; komut, istenen durumu taşır (sunucu ayar bilmez).

## Rastgelelik (M1)

- Oyuncu silahının saçılması, saçma taneleri, geri tepmenin rastgele payı ve roket sapması tohumlu `Rng`'den gelir (`web/shared/sim/rng.js`). Tek oyunculuda tohum görev başında üretilir; çevrim içide sunucu `hash(serverSecret, matchId, playerId, seq)` kullanır (M4).
- Düşman, dost, el bombası, efekt, ses ve oyuncu vurulunca kameranın sarsılması tek oyunculuda `Math.random` ile kalır: bunlar sunucuya taşınmıyor (sunucu botları M7'de kendi tohumlu üreteciyle yazılır).

## Sosyal katman ve yol haritası (S1–S3, kullanıcı isteği)

Kullanıcı önce ad, sonra arkadaş sistemi, sonra birlikte oynama ve karışık eşleşme istedi. Faz sırası buna göre: **S1** oyuncu adı → **S2** sunucu, kimlik, arkadaşlar, bildirimler → **S3** davet ve parti → S4 (M2) → S5 (M3+M4) → S6 TDM/DM + hızlı maç + botla doldurma (M5 ilk yarı + M7) → S7+ Rekabetçi, Co-op, M8–M12.

| Konu | Karar | Neden |
|---|---|---|
| Sunucu | Henüz VPS yok; `web/server/` yerelde geliştirilir ve test edilir, kurulum `Docs/DEPLOY.md` (Caddy + sslip.io) | Kullanıcı VPS alınca yayına geçer; `NET.serverUrl` boşken canlı sitede "Sunucu henüz kurulmadı" |
| Ad | Ad + 4 haneli etiket ("Ömer#4821"); aynı adı birçok kişi alabilir | Kullanıcı seçimi; arama ada göre, etiketle daraltılır |
| Ad kuralları | Türkçe dahil Latin harfleri, rakam, boşluk, `_`, `-`; 3–16 karakter; rakam hileli küfür filtresi (`shared/names.js`, `data/profanity.tr.json`) | Belge §9.1; başka alfabeler, görünüşü aynı harflerle taklidi zorlaştırmak için kapalı |
| Kimlik | Misafir; 32 baytlık rastgele opak belirteç, veritabanında yalnız SHA-256 özeti (belgedeki JWT yerine) | Gizli anahtar yönetimi gerekmez; belirteç iptali veritabanından |
| Veritabanı | Node'un yerleşik `node:sqlite`'ı (Node ≥ 22.13) | Yerel derleme gerektiren paket (better-sqlite3) yok; tek yeni bağımlılık `ws` |
| Sosyal protokol | REST (JSON) + tek WebSocket (JSON iletiler) | Az ve seyrek ileti; ikili codec oyun trafiği içindir (S4) |
| Köken | İzin listesi (Pages + localhost) ve yerel dosya (`null`) | Kimlik çerez değil taşıyıcı belirteç: tarayıcı kendiliğinden göndermez, CSRF kapısı açılmaz |
| Bildirim | Yalnız oyun içinde (açıkken anında; kapalıyken gelenler açılışta rozet ve İstekler sekmesinde). Web Push yok | Kullanıcı seçimi |
| Parti | Bellekte (en çok 5, 60 sn davet, kopan üye 60 sn bekler); kalıcı değil | Sunucu yeniden başlarsa partiler kurulur; arkadaşlıklar kalıcı |
| Reddetme | İstek silinir, gönderene anlık "reddetti" kartı (kalıcı bildirim değil) | Kullanıcı reddetme düğmesi istedi; geri bildirim görünür olsun |
| Karşılıklı istek | İki taraf birbirine istek gönderirse kendiliğinden arkadaş olur | Gereksiz ikinci adım yok |

## Ev sunucusu (kullanıcı isteği: "benim bilgisayarımı sunucu olarak konumlandır")

| Konu | Karar | Neden |
|---|---|---|
| Sunucu nerede | Kullanıcının bilgisayarı (`Sunucuyu-Baslat` → `web/server/host.mjs`); Oracle/VPS ikinci yol (`Docs/DEPLOY.md`) | Ücretsiz, kurulumu çift tıklama |
| Dışarıdan erişim | Cloudflare hızlı tüneli (hesapsız; `cloudflared` resmî sürümden kendiliğinden iner) | Oyun Pages'te https: tarayıcı yalnız https/wss sunucuya bağlanır. Modem ayarı yok, ev IP'si görünmez. Tailscale Funnel (sabit adres ama hesap ve kurulum) ve port yönlendirme (CGNAT'ta çalışmaz, IP görünür) kullanıcıya sunuldu; "kolay, ücretsiz, güvenli" için bu seçildi |
| Adres her açılışta değişir | Davet bağlantısı (`?sunucu=`) ve Çevrim içi → "Sunucu bağlantısı" alanı (kullanıcının fikri); başlatıcı bağlantıyı panoya kopyalar | Herkese açık bir adres defteri gerekmesin |
| Hesap adrese bağlıydı | Sunucunun kalıcı kimliği (`meta.serverId`, `/api/health`); istemci hesabı `profile.servers[serverId]`'de | Yeni tünel adresiyle girince ad#etiket ve arkadaşlar kaybolmasın |
| Gerçek oyuncu IP'si | `CLIENT_IP_HEADER=cf-connecting-ip` | `X-Forwarded-For`'un ilk değeri istemcice sahtelenebilir; IP başı sınırlar Cloudflare'in yazdığı başlıkla güvenilir |
| Sürüm eşleşmesi | Başlatıcı 10 dk'da bir `git fetch`; geride ve maç yoksa `pull --ff-only` + sunucuyu yeniden başlatma | Derleme özeti denetimi (`BUILD_MISMATCH`) Pages'teki oyunla sunucuyu aynı sürümde ister |

## Oyun bağlantısı ve maç (S4–S6, kullanıcı isteği: "çevrim içiyi tamamla")

| Belge | Uygulanan | Neden |
|---|---|---|
| Arayüzde "Parti" | "Takım" (kodda `party` kalır); maçtaki iki taraf "Mavi / Kırmızı taraf"; Alfa Timi "Tim" | Kullanıcı isteği. Üç kavram karışmasın |
| S4 deneme odası poligonda | Deneme odası da maç arenasında (Depo) | Tek harita yeterli; botlar ve doğuş verisi zaten arenada |
| Delta sıkıştırmalı anlık görüntü (§6.4) | Tam anlık görüntü, alıcıya özel, 32 Hz | En çok 16 oyuncu: 8 oyunculu maçta ~7 KB/s. Delta ve onay karmaşası kazancına değmez; protokol sürümüyle sonra eklenebilir |
| Komut gelmezse son hareket tekrarlanır | Komut yoksa oyuncu o tick durur; komut bütçesi (kredi, en çok 8 tick) gecikmeyi telafi eder | Sunucu ile istemci tahmini aynı komut dizisini işler: tahmin hatası yalnız gerçek olaylarda (ölüm, doğuş) olur. Hızlandırma hilesi bütçeyle sınırlı |
| Atış sunucuda tetik tuşundan zamanlanır | İstemci atış anını ve nişan yönünü komutla bildirir; sunucu tempo, şarjör, şarjör değiştirme ve silah değiştirme süresini doğrular, saçılmayı kendi tohumuyla üretir | Silah durum makinesi (pompalı, seri atış, nişan) istemcide zaten var. Sunucu yalnız sınırları uygular, isabeti ve hasarı kendi hesaplar ("nospread" önlemi korunur) |
| Gecikme telafisi istemci zamanından | Komut, oyuncunun gördüğü sunucu zamanını (`viewTick`) taşır; en çok 200 ms geri sarılır | Belgeyle aynı ilke; üst sınır yüksek pingde haksız isabeti keser |
| Çevrim içi zırh, el bombası, roket | Yok: herkes 100 can, ana + yan silah | Eşit koşul ve sunucu basitliği. El bombası için sunucuda fizik gerekir (sonraki faz) |
| Bot doldurma 45 sn sonra (M7) | Maç hemen başlar, eksik yerler baştan yapay zekâ; insan gelince o taraftan bot çıkar. Kuyrukta tek başına `searchSec` (8 sn) beklenir | Oyuncu boş haritada beklemesin; "oyuncu eksikse yapay zekâ oynar" isteği |
| Co-op: kampanya haritalarında Alfa Timi ile | Şimdilik "Co-op: Yapay Zekâya Karşı" (takım mavi tarafta, karşıda 6 bot) | Görev yapay zekâsını sunucuya taşımak büyük iş; arkadaşlarla birlikte yapay zekâya karşı oynama bugün hazır |
| Rekabetçi (bomba, raunt ekonomisi) | Yakında | Bu turun kapsamı dışında |
| Uzak oyuncu modeli belgedeki gibi kendi rengi | Aynı taraf mavi dost görünümü, rakip düşman üniforması; rakibin adı yalnız nişangâhtayken | Tek oyunculudaki dost/düşman görsel dili korunur |
