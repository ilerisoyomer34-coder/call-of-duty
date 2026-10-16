# Telsiz düzeltmesi

Enter ile telsizi açın, komutu yazıp Enter ile gönderin. Sesli komut açık ve tarayıcı destekliyorsa N tuşunu basılı tutarak konuşabilirsiniz. Yazı ve tanınan konuşma aynı komut sistemine gider.

- `Demir sola 20 metre git, sonra bekle`
- `Kaya beni iyileştir`
- `Yıldız saat üç yönüne baskı ateşi aç`
- `Herkes ateş etmeyin`
- `Ateş serbest`
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

Sistem oyundaki mevcut tim eylemlerini daha geniş ifadelerle anlar. İnternet üzerinden çalışan sınırsız bir yapay zekâ değildir. Araç sürme, patlayıcı kullanma veya oyunda bulunmayan başka bir eylem istenirse uygulanmadığını açıkça bildirir.

## Doğrulama

`node --test --test-timeout=60000 tests/*.test.mjs`: 177 test geçti. Telsiz testleri adım sırasını, çoklu muhatabı, olumsuz komutları, hedef seçimini, mesafeyi, plan iptalini, yol hatasını, konuşma bağlamını ve yazı/ses girişini kapsar.

`npm run build`: bağımsız HTML, Artifact, PWA ve uygulama paketleri üretildi. Tarayıcıda Demir'in hareketten sonra beklemesi ve Kaya'nın sağlık/emir raporu vermesi kontrol edildi. Mikrofonla gerçek konuşma tanıma bu ortamda denenmedi; tarayıcının konuşma tanıma hizmetine bağlıdır.
