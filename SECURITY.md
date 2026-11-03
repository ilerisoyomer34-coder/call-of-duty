# Güvenlik politikası

## Açık bildirmek

Demir Şafak'ta (oyun, çevrim içi sunucu, ev sunucusu başlatıcısı, mağaza uygulaması) bir güvenlik açığı bulduysan
**herkese açık issue açma**: açığın ayrıntısı düzeltilmeden herkesin eline geçer.

- GitHub'da deponun **Security → Report a vulnerability** düğmesiyle gizli bildir.
- Bildirime şunları yaz: etkilenen bölüm (oyun sayfası, `/api`, `/ws`, `/game`, ev sunucusu, uygulama), adım adım
  yeniden üretme, beklenen ve gerçekleşen sonuç, varsa etki (hesap ele geçirme, hile, sunucuyu düşürme…).
- Başkasının hesabına, verisine ya da sunucusuna erişme; denemeyi kendi hesabın ve kendi açtığın yerel sunucuyla
  (`cd web && npm run server`) yap. Hizmeti aksatan yük denemesi yapma.

Bildirim alındığında doğrulanır, düzeltilir ve düzeltme yayımlandıktan sonra (istersen adınla) teşekkür edilir.

## Desteklenen sürüm

Yalnız en son yayın: GitHub Pages'teki oyun, depodaki sunucu kodu ve mağazadaki son sürüm.

## Kapsam dışı

- Tek oyunculu ilerlemenin (kredi, açılan seviye) kendi cihazında değiştirilmesi: veri yalnız o cihazda durur,
  başka oyuncuyu etkilemez.
- Tarayıcıda çalışan oyun kodunun indirilip okunabilmesi: her web oyunu için geçerlidir; kopyalamaya karşı koruma
  lisanstır (`LICENSE`).

Ayrıntılı tehdit modeli ve alınan önlemler: [`Docs/SECURITY_TR.md`](Docs/SECURITY_TR.md).
