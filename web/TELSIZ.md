# Telsiz düzeltmesi

Telefonda İLETİŞİM düğmesiyle küçük bölmeyi açın; bölmede yalnız MİKROFON ve TELSİZ vardır. TELSİZ yazılı komut panelini açar. İLETİŞİM tekrar basılınca bölme kapanır. Mobilde takım arkadaşlarının sağlık listesi, EMİRLER ve İŞARET düğmeleri kaldırılmıştır. Bilgisayarda TELSİZ AÇ düğmesiyle paneli açın; TELSİZ KAPAT veya ✕ ile tamamen gizleyin. Bilgisayarda Enter ile açıp Esc ile kapatabilirsiniz. Komutu yazıp Enter ile gönderin. Panel başlangıçta kapalıdır; yeni mesajlar paneli açmaz, düğmedeki sayaçta birikir. Mobilde açık panel ekran yüksekliğinin en fazla %46’sını kullanır ve geçmiş kendi içinde kaydırılır. Sesli komut açık ve tarayıcı destekliyorsa telefonda bölmedeki MİKROFON düğmesini, bilgisayarda N tuşunu basılı tutarak konuşabilirsiniz. Mikrofon kullanılamıyorsa nedeni düğmede görünür. Yazı ve tanınan konuşma aynı komut sistemine gider.

- `Demir sola 20 metre git, sonra bekle`
- `Kaya beni iyileştir`
- `Yıldız saat üç yönüne baskı ateşi aç`
- `Herkes ateş etmeyin`
- `Ateş serbest`
- `Demir bomba at`
- `Herkes ileri 20 metre bomba at`
- `Yıldız sağa 15 metre bomba at sonra bekle`
- `Görev hedefine ilerleyin`
- `Demir ve Yıldız oraya gidin`
- `Kaya durum raporu ver`
- `Emirleri iptal et`
- `Yardım`
- `Şimdi bekle` — son hitap ettiğiniz askere
- `Devam et` — beklettiğiniz önceki eyleme dön
- `Yıldız aynısını yap` — son emri başka askere ver
- `Aynı yere git` — önceki gerçek hedef noktasını kullan

Türkçe karakter olmadan yazım, yaygın eş anlamlılar ve bazı tek harf hataları desteklenir. Yönler mesaj gönderilirken oyuncunun baktığı yöne göredir. Mesafe 1–120 metredir. Bina, ağaç veya belirli bir düşman için nişangâhla hedefi gösterin.

Bir mesajda en fazla sekiz adım çalışır. Sonraki adım, ilgili askerlerin mevcut adımı tamamlamasını bekler. Yol kapalıysa, hedef yoksa veya süre dolarsa kalan adımlar durur. Yeni bir emir aynı askerin eski planını değiştirir; yardım ve durum sorgusu planı kesmez. “Ateş etme” ateşi keser, “gitme” hareketi durdurur.

Yerel telsiz oyundaki tim eylemlerini geniş ifadelerle anlar; yapay zekâ açıksa (aşağıda) her cümleyi anlar ve her soruyu cevaplar. El bombası ilk seviyeden itibaren telsizle atılabilir. Nişangâhın baktığı yönde en fazla 24 metredeki nokta veya söylenen yön/mesafe kullanılır. Askerin atış menzili 9–28 metre, atışlar arası bekleme 16 saniyedir. Dostlar hedefe 8 metreden yakınsa veya bomba yolu kapalıysa gerekçe bildirilir. Sonraki adım bombanın elden çıkmasını bekler. Araç sürme, C4 yerleştirme veya oyunda bulunmayan başka bir eylem istenirse uygulanmadığını açıkça bildirir.

## Yapay zekâlı telsiz

Telsize (Enter) yazılan ya da mikrofona (N) söylenen her soru cevaplanır, her istek tim emrine çevrilir; "anlamadım" denmez. Örnekler:

- `Kaç düşman kaldı?` · `Tahliye nerede?` · `Görev ne?` · `Kaç mermim var?`
- `Yıldız şu tepedekileri bastırsın, Demir de sağdan dolaşıp arkalarına geçsin`
- `Beni koruyun` → takip + serbest ateş
- `Hava desteği istiyorum` → olmadığını söyler, en yakın işe yarar emri verir (baskı ateşi)
- `El bombası nasıl atılır?` → oyuncunun kendi tuşuyla cevap

- **Karma akış:** kısa ve tanınan emir ("siper alın") eskisi gibi anında yerelde çalışır. Soru, uzun ya da tanınmayan cümle yapay zekâya gider. Cevap gelene dek telsizde "📡 Telsiz dinliyor…" yazar.
- **Konuşan:** cevabı emri alan asker verir (tüm timde Alfa-1, iyileştirmede Kaya), oyun bilgisini YUVA (karargâh).
- **Emirler:** yapay zekânın verdiği emirler aynı komut sisteminden, sırayla ve doğrulanarak geçer. Yalnız oyundaki komutlar kabul edilir, bilinmeyen emir atılır.
- **Gördüğünü bilir:** yapay zekâ oyunun o anki durumunu görür: hedef, tahliye, can/zırh/mermi, tim, tuşlar. Düşman yerini ise yalnız sen ya da tim görüyorsan bilir.
- **Panel kapalıyken:** cevap düğmenin altında 8 saniye görünür. Mikrofonla sorulan soruya cevap, seslendirme ayarı kapalı olsa da sesli okunur (oyun sesi açıksa).
- **Nerede çalışır:**
  - claude.ai'deki Artifact'ta oyuncunun kendi Claude hesabıyla (ilk soruda izin ister, hızlı model).
  - Pages'te ya da uygulamada, yapay zekâsı açık bir sunucuya bağlıyken (ev sunucusu: `Docs/HOME_SERVER.md` → "Yapay zekâlı telsiz").
- **Yapay zekâ yoksa ya da cevap gelmezse:** emir yerel ayrıştırıcıyla uygulanır. Sık sorular (kalan düşman, düşman nerede, hedef, tahliye, can, mermi, silah, bölüm, süre, zorluk, tuşlar) oyun durumundan cevaplanır.

## Doğrulama

`node --test tests/parser.test.mjs tests/commands.test.mjs tests/ally-grenade.test.mjs`: 42 ilgili test geçti. Telsiz testleri adım sırasını, çoklu muhatabı, olumsuz komutları, hedef seçimini, mesafeyi, plan iptalini, yol hatasını, konuşma bağlamını ve yazı/ses girişini kapsar. El bombası testleri gerçek asker mantığından atış üretimini, ilk kademede kullanımı, grup atışını, sıralı planı, uçuş hesabını, iptali, menzili, dost kontrolünü, engelleri ve bekleme süresini doğrular.

`npm run build`: bağımsız HTML, Artifact, PWA ve uygulama paketleri üretildi. Tarayıcıda Demir'in hareketten sonra beklemesi ve Kaya'nın sağlık/emir raporu vermesi kontrol edildi. Mikrofonla gerçek konuşma tanıma bu ortamda denenmedi; tarayıcının konuşma tanıma hizmetine bağlıdır.
