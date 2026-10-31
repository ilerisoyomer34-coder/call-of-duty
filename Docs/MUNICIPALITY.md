# Son Emir: Belediye

5. normal görevin ardından gelen özel Belediye Baskını operasyonu (`municipality`). Sıra: 1–5 → Belediye Baskını → 6–10. Kayıt kimliği 11 korunur; eski görev puanları ve ödüller taşınmaz/silinmez. 10. görev sonrası için henüz başka özel operasyon eklenmez.

Meydan ve yaklaşım yollarında 14 muhafız, binanın üç katında 12'şer sabit muhafız, yan sokaklarda 8 muhafız/robot vardır: başlangıçta toplam 58 düşman. İlk hack girişiminde 8 kişilik karşı saldırı başlar. Güneydeki kemerli kapı ile batı kapısı alternatif girişlerdir. Üç kişilik Alfa Timi aynı navigasyon ızgarasını kullanarak içeri girebilir.

Korunan bilgisayar en üst kattaki (zeminden 8,055 m) sunucu salonundadır. Ara katta ve son katta birer güvenlik rölesinde 3 saniye etkileşim gerekir. Röle ve terminal yalnız aynı kattan, açık görüş hattıyla kullanılabilir. Röleler tamamlanmadan ve muhafız grubu temizlenmeden bilgisayar kullanılamaz. Terminalde 8 saniye basılı tutmak kontrolü ele geçirir. İlk erişim girişimi alarmı ve karşı saldırıyı başlatır; etkileşimi bırakmak ilerlemeyi sıfırlar, alarm yeniden takviye üretmez. Röleler kontrol noktasına saklanır; yeniden doğuş alarmı ve sonradan gelen düşmanları tutarlı biçimde geri alır.

## Kaynaklar ve üretim

Kullanıcı dosyası: `house.glb`, SHA ve lisans `SourceAssets/Sketchfab/house_takeandplay/asset_info.json` içinde. 377 MB özgün dosya depoya konmaz. Mimari model açılışta değil yalnız belediye bölümü yüklenirken okunur. Mimari renkler 1024 px, ikincil/veri dokuları 512 px; son GLB yaklaşık 5 MB.

- `TEXTURE_PYTHON=/path/to/python-with-pillow node tools/prepare-municipality.mjs /path/to/house.glb`
- `node tools/municipality-collision.mjs /path/to/house.glb`
- `node tools/prepare-fps-arms.mjs`
- `node tools/export-collision.mjs`
- `npm run test:unit` ve `npm run build`

Çarpışma mimari üçgenlerin eksene paralel yüzlerinden 20 cm hücrelerle üretilir. Dekoratif perdeler ve pencere korkulukları kapı yolunu kapatmaz. Sunucu ve istemci aynı mimari kutuları kullanır. Merdiven açıklıklarında döşeme çarpışmaları omuz payıyla kesilir. `shared/sim/indoorNav.js` yalnız bu binanın bölgesinde, gerçek çarpışmadan üç boyutlu basamak ağı üretir; dışarıdaki normal navigasyon korunur. Manga ve takviyeler katlar arasında merdiven kullanır. Test tüm muhafız/röle/kontrol noktalarına ulaşımı ve gerçek karakter fiziğiyle en üst kata çıkıp geri inişi doğrular.

Görsel denetim: `node tools/municipality-inspector.mjs` (8087) bina kesiti; `node tools/aim-inspector.mjs` (8086) gerçek silahlar ve eller. Bunlar tarayıcı otomasyonu başlatmaz. Yerel oyunda F10 → `level 11`, `god`, `cp 3`, `tp -5 -14` komutlarıyla görev adımları denetlenebilir. `tp` yalnız geliştirme konsolundadır.
