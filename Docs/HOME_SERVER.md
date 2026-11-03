# Ev sunucusu: kendi bilgisayarını çevrim içi sunucu yap

Bilgisayarın açık ve internete bağlı olduğu sürece arkadaşların oyunun Çevrim içi bölümünden sana bağlanıp oynar.

- **Ücret:** yok.
- **Hesap:** gerekmez.
- **Modem ayarı:** gerekmez.
- **Ev IP adresin:** kimseye görünmez.

Bağlantı Cloudflare'in ücretsiz "hızlı tünel"i üzerinden şifreli (https) kurulur. Tünel programını başlatıcı kendisi indirir.

> Bu ücretsiz tünel için Cloudflare çalışma garantisi vermez. Arkadaşlarla oynamak için yeterlidir.

## 1. Bir kez yapılacaklar

1. **Node.js kur:** https://nodejs.org → "LTS" sürümü (22 ya da daha yeni). Kurulumda varsayılanlarla ilerle.
2. **Git kur:**
   - Windows: https://git-scm.com/download/win (varsayılanlarla ilerle).
   - macOS: Terminal'de `git --version` yaz; kurulu değilse kurmayı önerir.
3. **Oyunu indir.** Terminal (Windows'ta "Komut İstemi" ya da "PowerShell") aç ve şunu yaz:
   ```
   git clone -b claude/war-game-design-yzxvv6 https://github.com/ilerisoyomer34-coder/call-of-duty.git
   ```
   Masaüstüne ya da Belgeler'e `call-of-duty` adlı bir klasör iner. Depo herkese açık olduğu için giriş istemez.

## 2. Sunucuyu başlat

`call-of-duty` klasöründe:

- **Windows:** `Sunucuyu-Baslat.bat` dosyasına çift tıkla.
  - "Windows kişisel bilgisayarınızı korudu" uyarısı çıkarsa: **Ek bilgi → Yine de çalıştır**.
- **macOS:** `Sunucuyu-Baslat.command` dosyasına çift tıkla.
  - "Açılamıyor" uyarısı çıkarsa: dosyaya sağ tıkla → **Aç** → **Aç**.

İlk açılışta gerekli paket ve tünel programı (yaklaşık 40 MB) bir kez iner. Sonra pencerede şuna benzer bir kutu çıkar:

```
════════════════════════════════════════════════════════
  SUNUCU AÇIK · Ömer'in sunucusu · dışarıdan erişim: tamam

  Arkadaşlarına bu bağlantıyı gönder (WhatsApp vb.):

  https://ilerisoyomer34-coder.github.io/call-of-duty/?sunucu=https://kelime-kelime-kelime.trycloudflare.com
════════════════════════════════════════════════════════
```

- Bağlantı panoya da kopyalanır; WhatsApp'a yapıştırıp gönder.
- Oyun senin tarayıcında bu bağlantıyla kendiliğinden açılır, sen de hemen bağlanırsın.

## 3. Arkadaşların ne yapar

- **Bağlantıya tıklar.** Oyun açılır, sunucuyu hatırlar ve Çevrim içi ekranı açılır.
- Oyunu uygulama olarak yüklediyse ya da tıklamak istemezse: oyunda **Çevrim içi → Sunucu bağlantısı** alanına bağlantıyı yapıştırıp **Bağlan**'a basar.

Çevrim içi ekranında "Bağlı: Ömer'in sunucusu · 3 oyuncu çevrim içi" yazar. Sonra her zamanki gibi arkadaş eklenir, takım kurulur, "Maç ara" ya da "Deneme odası".

## 4. Bilmen gerekenler

- **Pencere açık kaldıkça sunucu çalışır.**
  - Pencere açıkken bilgisayar uyumaz.
  - Kapatmak için pencereyi kapat ya da Ctrl+C.
- **Bağlantı her açılışta değişir.**
  - Sunucuyu kapatıp yeniden açınca yeni bir bağlantı çıkar; onu yeniden gönder.
  - Arkadaşların adı, etiketi (#1234) ve arkadaş listesi kaybolmaz: hesaplar senin bilgisayarındaki veritabanında durur, oyun adrese değil sunucunun kimliğine bakar.
- **Kendiliğinden güncelleme.**
  - Başlatıcı 10 dakikada bir oyunun yeni sürümünü denetler.
  - Yeni sürüm varsa ve süren maç yoksa günceller; sunucu birkaç saniyede yeniden açılır, bağlantı değişmez.
  - Oyunla sunucu hep aynı sürümde kalır.
- **Sunucu adı.**
  - Oyunda görünen adı değiştirmek için `web/server/host.env` dosyasındaki `SERVER_NAME=` satırını düzenle, sonra sunucuyu yeniden başlat.
  - Aynı dosyadaki `SERVER_SECRET` satırına dokunma.

## 5. Yapay zekâlı telsiz (isteğe bağlı)

Oyuncular telsize (Enter) yazdığında ya da mikrofona (N) konuştuğunda Alfa Timi her soruya cevap verir ve her isteği tim emirlerine çevirir: "kaç düşman kaldı", "tahliye nerede", "şu tepedekileri bastırın, Demir de sağdan dolaşsın", "el bombası nasıl atılır"… Bu sunucuya bağlı oyuncular için yapay zekâ senin Claude API hesabınla çalışır.

1. https://console.anthropic.com adresinde bir API anahtarı oluştur (ücretlidir; harcama sınırını oradan koyabilirsin).
2. `web/server/host.env` dosyasını Not Defteri / TextEdit ile aç. `# ANTHROPIC_API_KEY=` satırındaki `#` işaretini sil, `=` işaretinden sonra anahtarını yapıştır:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
   Eski bir `host.env` dosyasında bu satır yoksa en alta kendin ekle.
3. Sunucuyu kapatıp yeniden aç. Pencerede "Yapay zekâlı telsiz açık" yazar.

- **Anahtar yalnız senin bilgisayarında kalır.** Oyunculara, oyuna ya da günlüğe hiç gitmez; kimseyle (Claude dahil) paylaşma, sohbete yapıştırma.
- **Harcama sınırları** (sunucuda sabit, `web/server/limits.js`): oyuncu başına dakikada 12, günde 300 soru; bütün sunucuda dakikada 60.
- **Model:** varsayılan `claude-opus-5-5` (düşük düşünme payıyla). Daha hızlı ve ucuz cevap için `host.env`'e `AI_MODEL=claude-haiku-5-5` ekle. `AI_RADIO=0` yapay zekâyı kapatır.
- **Kısa, tanınan emirler** ("siper alın", "Kaya beni iyileştir") yapay zekâya gitmez, anında uygulanır. Yapay zekâya yalnız sorular, uzun ya da yerel telsizin çözemediği cümleler gider.
- **Yasak içerik koruması:** Claude bir isteği güvenlik nedeniyle reddederse istek sunucu tarafında önerilen yedek modelle yeniden denenir (`fallbacks: "default"`). O da reddederse telsiz kibarca geri çevirir.
- Anahtar yoksa oyun yine çalışır: telsiz kendi ayrıştırıcısıyla emirleri, oyun durumundan sık soruları (kalan düşman, hedef, tahliye, can, mermi, tuşlar) cevaplar.
- claude.ai'deki Artifact sürümünde yapay zekâ sunucusuz çalışır: oyuncunun kendi Claude hesabıyla, ilk soruda izin ister.

## Güvenlik

- **Yalnız oyun sunucusu dışarı açılır** (8790 portu, tünel üzerinden). Dosyaların ve öbür programların açılmaz.
  - Sunucu yalnız bu bilgisayardan erişilebilecek biçimde (127.0.0.1) dinler; dışarıdan yalnız tünel ulaşır.
- **Ev IP adresin görünmez:** oyuncular Cloudflare'in adresini görür.
- **Bağlantı şifrelidir** (https).
- **Paylaşacağın tek şey davet bağlantısıdır.** Şifre, anahtar (Claude API anahtarı dahil) ya da `host.env` dosyası hiç kimseyle (Claude dahil) paylaşılmaz.
  - `host.env` ve indirilen tünel programı git'e girmez.
- Sunucu, oyuncu başına istek ve bağlantı sınırları uygular (gerçek oyuncu IP'si Cloudflare'in `CF-Connecting-IP` başlığından okunur).
- Bağlantıyı yalnız birlikte oynamak istediğin kişilere gönder; bağlantıyı bilen herkes sunucuna girebilir.

## Sorun giderme

| Belirti | Ne yapmalı |
|---|---|
| "Node.js bulunamadı" | Node.js LTS'yi kur, pencereyi kapatıp başlatıcıyı yeniden aç. |
| "Tünel açılamadı" | İnternet bağlantısını denetle. Başlatıcı kendisi yeniden dener. Sürerse pencereyi kapatıp yeniden aç. |
| Kullanıcı klasöründe `.cloudflared/config.yml` var | Bu dosya varsa hızlı tünel çalışmaz. Adını değiştir ya da sil. |
| Oyunda "Oyun güncellendi" / sürüm farkı | Oyuncu sayfayı yenilesin (uygulamada menüdeki **Güncelle**). Sunucu eskiyse birkaç dakikada kendini günceller. |
| "Sunucu kapalı ya da ulaşılamıyor" | Bilgisayar ya da pencere kapalı, ya da bağlantı eski. Sunucuyu başlat, yeni bağlantıyı gönder. |
| "8790 portunda zaten bir sunucu çalışıyor" | Açık kalan başka bir sunucu penceresi var; onu kapat. |
| Bilgisayar yine de uyuyor | Güç ayarlarında "prize takılıyken uyku: asla" seç. |
| "Yapay zekâlı telsiz kapalı" | `host.env`'de `ANTHROPIC_API_KEY=` satırı başında `#` olmadan ve anahtarla dolu mu? Sunucuyu yeniden başlat. |
| "API anahtarı geçersiz ya da yetkisiz" | Anahtarı console.anthropic.com'da denetle (silinmiş ya da kredisi bitmiş olabilir), yenisini yaz. |
| Telsiz "Karargâha ulaşılamadı" diyor | Sunucunun internet bağlantısını denetle; o sırada emir yerel telsizle uygulanır. |

## Gelişmiş

- **Tünelsiz başlatma:** `cd web && node server/host.mjs --no-tunnel`. Yalnız bu bilgisayar ve yerel ağ için; https sayfası yerel ağdaki http sunucuya bağlanamaz.
- **Diğer bayraklar:**
  - `--no-browser`: oyunu açma.
  - `--no-update`: kendiliğinden güncelleme kapalı.
- **Kendi kurduğun cloudflared:** `CLOUDFLARED=/yol/cloudflared` ortam değişkeniyle kullanılır.
- **Kod:**
  - Başlatıcı `web/server/host.mjs`, yardımcıları `web/server/hostLib.js` (testi `web/tests/host.test.mjs`).
  - Oyun tarafı `web/src/net/servers.js` (testi `web/tests/servers.test.mjs`).
  - Yapay zekâlı telsiz: sunucu `web/server/ai.js`, ortak kurallar `web/shared/ai/radio.js`, oyun `web/src/aiRadio.js` (testi `web/tests/airadio.test.mjs`).
- **VPS ya da Oracle Cloud** (bilgisayar kapalıyken de açık kalan sunucu): `Docs/DEPLOY.md`.
