# Demir Şafak — güvenlik tabanı

Bu belge oyunun neyi, nasıl koruduğunu ve **neyi koruyamayacağını** dürüstçe anlatır. Açık bildirme yolu
[`SECURITY.md`](../SECURITY.md), kullanım hakları [`LICENSE`](../LICENSE).

## 1. Kısa özet

| Tehdit | Durum | Nasıl |
| --- | --- | --- |
| Sahte sunucunun oyuncunun hesabını (belirtecini) çalması | **Korunuyor** | Sunucu kimlik kanıtı + anahtar sabitleme (§2) |
| Belirteç tahmini / kaba kuvvet | **Korunuyor** | 256 bit rastgele belirteç, veritabanında SHA-256 özeti, IP başına hatalı deneme sınırı (§3) |
| Sunucuyu istek, bağlantı ya da yavaş istek seliyle düşürmek | **Sınırlı** | IP başı ve toplam sınırlar, zaman aşımları, ileti boyu sınırı (§3) |
| Çevrim içi maçta hız, atış temposu, şarjör hilesi | **Korunuyor** | Sunucu otoriter: hareket ve atışı kendisi hesaplar (§5) |
| Oyun sayfasına betik sokma (XSS) | **Korunuyor** | Kullanıcı metni hep `textContent`; PWA'da içerik güvenlik politikası (§4) |
| Depoya anahtar, şifre, imza dosyası sızması | **Denetleniyor** | `.gitignore` + her push'ta gizli bilgi taraması (§6) |
| Bağımlılıklarda bilinen açık | **Denetleniyor** | Her push'ta `npm audit` (oyun ve sunucu paketleri) (§6) |
| Ev sunucusunun indirdiği programın değiştirilmesi | **Korunuyor** | cloudflared SHA-256 özeti GitHub sürüm bilgisiyle karşılaştırılır (§7) |
| Oyunun kodunun ya da modellerinin kopyalanması | **Teknik olarak engellenemez** | Lisans + telif bildirimi; ayrıntı §8 |
| Tek oyunculu kredinin/ilerlemenin cihazda değiştirilmesi | **Engellenemez, zararsız** | Veri yalnız o cihazda; çevrim içine taşınmaz (§5) |

## 2. Hesaplar ve sunucu kimliği

- Hesap ad#etiket ve sunucunun verdiği opak belirteçtir (32 bayt rastgele). Veritabanında belirtecin kendisi değil
  SHA-256 özeti durur: veritabanı dosyası ele geçse de belirteçler kullanılamaz.
- **Sunucu kimlik kanıtı** (`shared/net/serverProof.js`, `server/db.js → proveIdentity`, `src/net/servers.js`):
  - Her sunucu ilk açılışta bir ECDSA P-256 anahtar çifti üretir (veritabanında, `meta.serverKey`).
  - Oyun bağlanmadan önce rastgele bir meydan okuma gönderir (`/api/health?c=…`); sunucu
    `demirsafak-sunucu-kimligi-v1 \n sunucuKimliği \n meydanOkuma` metnini imzalar.
  - Oyun imzayı tarayıcının kendi kripto kütüphanesiyle (WebCrypto) doğrular ve anahtarı o sunucu kimliği için
    hesaba sabitler (ilk görüşte güven). Sonraki bağlantılarda anahtar değişirse **belirteç gönderilmez**:
    "Güvenlik uyarısı: bu sunucu … kimliğini taklit ediyor" çıkar.
  - Neden: ev sunucusunun tünel adresi her açılışta değişir ve davet bağlantısıyla gelir. Kötü niyetli biri
    kendi sunucusuna davet ederek gerçek sunucunun kimliğini söyleseydi, oyun o sunucunun belirtecini ona
    gönderirdi. Artık kimlik kanıtlanmadan belirteç yola çıkmaz; eski imzayı yeniden oynatmak da işe yaramaz
    (her bağlantıda yeni meydan okuma).
  - Hesap silinse de sabitlenmiş anahtar kayıtta kalır: aynı kimliği taklit eden sunucu yine tanınır.
- Hesabı silme: Ayarlar → Çevrim içi hesap → "Hesabı sil" (oyuncu, arkadaşlık, bildirim, engel, şikâyet tek işlemde).

## 3. Sunucu sertleştirmesi (`web/server/`)

Değerler `server/limits.js`'te; testler `tests/security.test.mjs`, `tests/server.test.mjs`.

- IP başına bütün REST istekleri dakikada 600, geçersiz belirteç denemesi dakikada 30 (sonra `429` +
  `retry-after`); belirteç en çok 128 karakter (uzun değer özetlenmeden reddedilir).
- Sosyal WebSocket: IP başına 8, sunucuda toplam 2.000 açık bağlantı; yer el sıkışmadan önce ayrılır (yarış yok).
  Oyun bağlantısı (`/game`) da IP başına sınırlı. İleti boyu 2 KB, saniyede 20 ileti, kimlik 5 sn içinde gelmezse
  bağlantı kapanır.
- HTTP zaman aşımları: başlık 10 sn, istek 30 sn, boşta bekleme 5 sn (yavaş istek saldırısı).
- Her yanıtta güvenlik başlıkları: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`,
  `Cross-Origin-Opener-Policy: same-origin`, `Permissions-Policy` (kamera, mikrofon, konum, ödeme kapalı),
  `Cache-Control: no-store`.
- Köken (CORS) izin listesi: yalnız oyunun yayımlandığı adres, yerel geliştirme ve mağaza uygulamasının kökenleri
  (`ALLOWED_ORIGINS`).
- Gerçek istemci IP'si yalnız tünelin yazdığı başlıktan (`CLIENT_IP_HEADER=cf-connecting-ip`); istemcinin
  sahteleyebileceği `X-Forwarded-For` güvenilmez. IP adresi günlüğe yazılmaz, yalnız bellekteki sınır sayacında
  anahtar olur.
- Günlüğe giden kullanıcı metninde denetim karakterleri temizlenir (sahte günlük satırı üretilemez).
- Tek bir bozuk ileti sunucuyu düşürmez: bağlantı başına hata yakalanır, yalnız o bağlantı kapanır.
- Dosyalar: veritabanı `0600`, klasörü `0700`, sunucu süreci `umask 077`; ev sunucusu ayarı `host.env` `0600`.
- Yapay zekâlı telsiz: oyuncu başına dakikada 12, günde 300, bütün sunucuda dakikada 60 istek; metin ve bağlam
  boyu sınırlı; API anahtarı yalnız sunucunun ortamında (`host.env`), oyuncuya hiç gitmez.

## 4. Oyun sayfası

- **İçerik güvenlik politikası** (PWA, `tools/build.mjs → withCsp`; GitHub Pages başlık eklemeye izin vermediği için
  `<meta>`): yalnız sayfanın kendi betikleri çalışır (satır içi betikler SHA-256 karmalarıyla izinli, sonradan
  sokulan betik çalışmaz), dış betik, `eval`, eklenti (`object`), çerçeve yok; `base-uri 'none'`. WebAssembly
  (fizik motoru) için yalnız `wasm-unsafe-eval`. Duman testi (`pwa`) politikanın oyunu engellemediğini denetler.
- Oyuncu adları, arkadaş listesi, telsiz ve yapay zekâ cevapları ekrana hep `textContent` ile yazılır (HTML olarak
  yorumlanmaz). Ad kuralları ve küfür süzgeci sunucu ile oyunda ortak (`shared/names.js`).
- Derleme küçültülmüştür, kaynak haritası (source map) yayımlanmaz; paketin başında telif bildirimi durur.
- `Referrer-Policy: no-referrer`: oyundan dışarı giden isteklerde sayfa adresi (davet bağlantısındaki sunucu
  adresi) sızmaz.
- Mağaza uygulaması: Android otomatik yedeği kapalı (kayıtta hesap belirteci var), WebView hata ayıklaması ve
  karışık içerik kapalı, şifresiz trafik istisnası yok (`npm run audit:release`).

## 5. Hile

- **Çevrim içi maç sunucu otoriterdir** (`server/game/sim.js`): hareket aynı paylaşılan simülasyonla sunucuda
  hesaplanır, tick başına komut bütçesi hızlandırma hilesini keser; atış temposu, şarjör, şarjör değiştirme ve
  silah değiştirme süresi doğrulanır; saçılma sunucunun gizli tohumuyla üretilir; vuruş, oyuncunun gördüğü ana geri
  sarılarak sunucuda hesaplanır. İstemci "vurdum" diyemez.
- Çevrim içinde seçilebilen silahlar sınırlı (`validLoadout`; roket ve özel silah yok), herkes 100 can.
- Geliştirici konsolunun hile komutları (ölümsüzlük, mermi, kredi, ışınlanma…) çevrim içi maçta çalışmaz; mağaza
  sürümünde konsol hiç açılmaz.
- Sunucu, oyunun derleme özetini denetler: eski sürümle maça girilmez ("Oyun güncellendi"). Bu bir hile
  koruması değildir (değiştirilmiş istemci doğru özeti söyleyebilir); koruma yukarıdaki sunucu hesabıdır.
- **Sınır:** tek oyunculu kampanyanın kredisi, açılmış seviyeleri ve mağaza alımları cihazdaki kayıttadır
  (tarayıcı depolaması). Cihaz sahibi bunları değiştirebilir; bu yalnız kendi oyununu etkiler, çevrim içi hesaba
  ya da başka oyuncuya geçmez.

## 6. Depo, gizli bilgiler ve bağımlılıklar

- `.gitignore`: `.env*` (örnek dosyalar hariç), `host.env`, imza anahtarları ve sertifikalar (`*.jks`, `*.keystore`,
  `*.p12`, `*.pem`, `*.key`, `key.properties`…), veritabanları (`*.sqlite`, `*.db`), `.npmrc`, `.netrc`.
- **Gizli bilgi taraması** `web/tools/secret-scan.mjs` (her push'ta `quality-gates.yml`): izlenen dosyalarda API
  anahtarı (Anthropic, GitHub, AWS, Google, Slack, Stripe, npm), özel anahtar bloğu ve değeri yazılmış gizli ortam
  değişkeni arar; izlenmemesi gereken dosya adlarını reddeder. Bulunan değer ekrana yazılmaz. `--history` bütün
  git geçmişini tarar (elle). Testi `tests/secret-scan.test.mjs`. Bugünkü depo ve geçmişi: 0 bulgu.
- **Bağımlılık açıkları:** her push'ta `npm audit --omit=dev --audit-level=high` (oyuna ve sunucuya giden paketler).
  Sürümler kilit dosyasında sabit (`npm ci`), sunucu paketleri tam sürümle (`@anthropic-ai/sdk`, `ws`).
  Geliştirme araçları ayrıca `npm audit` ile elle denetlenir (sharp 0.35.5'e yükseltildi). Mağaza kabuğunun
  (`mobile/`) Capacitor komut satırı aracında orta düzeyli bir `uuid` uyarısı var: yalnız derleme makinesinde
  çalışır, uygulamaya girmez; düzeltmesi Capacitor'ın yeni sürümünü bekliyor.
- GitHub iş akışları en az izinle: kalite kapısı yalnız okur; Pages yayını yalnız `gh-pages` dalına yazar ve
  yalnız depodaki dallara gönderilen commit'lerle (fork'tan gelen istekle değil) çalışır.

## 7. Ev sunucusu (kullanıcının bilgisayarı)

- Sunucu yalnız `127.0.0.1`'de dinler; dışarıdan yalnız Cloudflare tüneliyle erişilir, ev IP'si görünmez, modemde
  port açılmaz.
- `host.env` (sunucu sırrı, isteğe bağlı API anahtarı) yalnız dosya sahibine açık (`0600`) ve git dışında.
- cloudflared ilk açılışta Cloudflare'in GitHub deposundan iner; GitHub'ın verdiği SHA-256 özetiyle tutmazsa
  çalıştırılmaz (özet alınamazsa uyarıyla yalnız https doğrulamasına düşer). Kendi kurduğun programı
  `CLOUDFLARED=/yol` ile verebilirsin.
- **Dikkat:** başlatıcı 10 dakikada bir depodan güncelleme çeker ve yeni kodu çalıştırır. Depoya yazma yetkisi
  olan herkes senin bilgisayarında kod çalıştırabilir demektir: GitHub hesabında **iki adımlı doğrulama** şart.

## 8. Kopyalamaya karşı: ne yapılabilir, ne yapılamaz

- **Yapılamaz:** tarayıcıda çalışan her oyunun kodu ve modelleri, oyunu açan cihaza indirilir. Küçültme ve
  karıştırma okumayı zorlaştırır ama engellemez; "kopyalanamaz" bir web oyunu yoktur. Bunu vaat eden yöntemler
  (sağ tık engeli, kod şifreleme) yalnız caydırıcıdır ve oyunu yavaşlatır, bu yüzden eklenmedi.
- **Depo herkese açık:** kaynak kodun tamamı GitHub'da okunabilir. En büyük kopyalama riski budur.
  Depoyu **özel (private)** yapmak kullanıcının kararıdır; bedelleri:
  - GitHub Pages ücretsiz planda özel depodan yayımlanmaz (GitHub Pro ya da başka bir barındırma gerekir);
  - ev sunucusunun girişsiz `git pull` güncellemesi çalışmaz (bilgisayarda GitHub girişi gerekir).
- **Yapılan:** `LICENSE` (tüm hakları saklıdır: kopyalama, değiştirme, yeniden yayımlama, mağazaya yükleme yasak),
  her derlenmiş paketin başında telif bildirimi, mağaza sürümünde kurgusal silah adları. İzinsiz kopya bulunursa
  GitHub ve uygulama mağazaları telif ihlali (DMCA) bildirimiyle kaldırır; lisans ve commit geçmişi sahipliğin
  kanıtıdır.

## 9. Kullanıcının yapacakları (bu ortamdan yapılamaz)

1. GitHub hesabında **iki adımlı doğrulamayı** aç (Settings → Password and authentication).
2. Depoda **Settings → Code security**: *Private vulnerability reporting*, *Secret scanning* ve *Push protection*,
   *Dependabot alerts* aç. (Push protection anahtar içeren push'u GitHub tarafında da durdurur.)
3. İstersen depoyu özel yap (§8'deki bedellerle) ya da en azından çalışma dalına "branch protection" koy.
4. `web/server/host.env` dosyasını kimseyle paylaşma, ekran görüntüsüne sokma. API anahtarı sızarsa Anthropic
   Console'dan hemen iptal et, yenisini yaz.
5. Android imza anahtarını (keystore) depoya koyma; kendi yedeğinde, parolasıyla ayrı yerde tut.
6. Davet bağlantısını yalnız arkadaşlarına gönder; bağlantıyı bilen herkes sunucuna bağlanabilir.

## 10. Bir şey sızarsa

- **Anahtar ya da belirteç depoya girdiyse:** silmek yetmez (geçmişte kalır). Önce sağlayıcıda iptal et
  (Anthropic Console, GitHub → Settings → Tokens), sonra dosyadan çıkar; `node tools/secret-scan.mjs --history`.
- **Sunucu sırrı (`SERVER_SECRET`, maçlardaki mermi saçılmasının gizli tohumu) sızdıysa:** `host.env`'deki
  değeri başka uzun rastgele bir değerle değiştir (ya da satırı boş bırak: sunucu her açılışta kendisi rastgele
  üretir) ve başlatıcıyı yeniden aç. Hesaplar etkilenmez.
- **Bir oyuncunun belirteci sızdıysa:** oyuncu Ayarlar'dan hesabını silip yeniden açabilir; sunucu sahibi
  `node server/moderate.mjs sil <oyuncu kimliği>` ile siler.
- **Sunucunun kimlik anahtarı** veritabanındadır; veritabanı kaybolursa sunucu yeni kimlikle açılır ve oyuncular
  yeni hesap alır. Veritabanını `node server/backup.mjs <klasör>` ile yedekle.
