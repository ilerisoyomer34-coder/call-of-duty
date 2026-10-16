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

Sistem oyundaki mevcut tim eylemlerini daha geniş ifadelerle anlar. İnternet üzerinden çalışan sınırsız bir yapay zekâ değildir. El bombası ilk seviyeden itibaren telsizle atılabilir. Nişangâhın baktığı yönde en fazla 24 metredeki nokta veya söylenen yön/mesafe kullanılır. Askerin atış menzili 9–28 metre, atışlar arası bekleme 16 saniyedir. Dostlar hedefe 8 metreden yakınsa veya bomba yolu kapalıysa gerekçe bildirilir. Sonraki adım bombanın elden çıkmasını bekler. Araç sürme, C4 yerleştirme veya oyunda bulunmayan başka bir eylem istenirse uygulanmadığını açıkça bildirir.

## Doğrulama

`node --test tests/parser.test.mjs tests/commands.test.mjs tests/ally-grenade.test.mjs`: 42 ilgili test geçti. Telsiz testleri adım sırasını, çoklu muhatabı, olumsuz komutları, hedef seçimini, mesafeyi, plan iptalini, yol hatasını, konuşma bağlamını ve yazı/ses girişini kapsar. El bombası testleri gerçek asker mantığından atış üretimini, ilk kademede kullanımı, grup atışını, sıralı planı, uçuş hesabını, iptali, menzili, dost kontrolünü, engelleri ve bekleme süresini doğrular.

`npm run build`: bağımsız HTML, Artifact, PWA ve uygulama paketleri üretildi. Tarayıcıda Demir'in hareketten sonra beklemesi ve Kaya'nın sağlık/emir raporu vermesi kontrol edildi. Mikrofonla gerçek konuşma tanıma bu ortamda denenmedi; tarayıcının konuşma tanıma hizmetine bağlıdır.
