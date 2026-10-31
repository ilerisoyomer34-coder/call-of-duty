# Demir Şafak — yayın öncesi kalite kapıları

Kaynak: kullanıcının yüklediği **v1.2 geliştirme paketi** (`DemirSafak_Gelistirilmis_Kod_v1_2.zip`, 25 Ekim 2026; `7444741` commit'ine göre yazılmış). Paket bir kurulum betiğiyle (`apply.py`) dosyaları yamalıyordu. Burada değişiklikler doğrudan koda uygulandı. Yorumlar Türkçe; iki yerde oyunun gerçek davranışına göre uyarlandı (aşağıda "Uyarlamalar").

## Koda giren düzeltmeler

1. **Yazı alanı** (`web/src/input.js → isTextEditingTarget`): Telsiz satırında, konsolda, ad kutusunda (`input`, `select`, `textarea`, `option`, `contenteditable`, `role="textbox"`) basılan tuşlar oyun komutu sayılmaz. Bu alanlardaki `keyup` da "bırakıldı" olayı üretmez: yazılan N sesli komutu kapatmaz.
2. **Menüde girdi toplanmaz:** Oyun dışında (`input.enabled` kapalı) tuşlar kaydedilmez. Tuş atama ekranı (`onAnyKey`) yine her tuşu yakalar.
3. **Takılı girdi temizliği** (`clearTransientInput`): Şu durumlarda basılı ateş, nişan, yürüme, dokunmatik düğme, çubuk, bakış ve gamepad değerleri bırakılır:
   - pencere odağı kaybolunca (`blur`);
   - uygulama arka plana geçince (`visibilitychange`, `pagehide`);
   - ekran dönünce (`orientationchange`);
   - fare kilidi düşünce;
   - dokunmatik kapanınca.
4. **Çoklu dokunuş:**
   - Ateş düğmesinde ikinci parmak basılıyken ilki kalkınca ateş kesilmez.
   - Aynı eyleme bağlı birden çok düğmede eylem, son parmak kalkana dek sürer.
   - Çubuk ve bakış tutulurken ikinci parmak onları devralmaz.
5. **Fare:**
   - Kilit alınırken ilk tık ateş etmez.
   - Fare kilidi olmayan tarayıcı ya da WebView kilitsiz nişan kipine geçer.
   - Tekerlek silah değiştirirken oyun alanında sayfayı kaydırmaz.
6. **Gamepad:** Kol çıkarılınca analog değerler sıfırlanır. Yeniden takılınca daha önce engellenmiş gamepad API'si tekrar denenir.
7. **Kayıt kurtarma** (`web/src/saveBackup.js`, `save.js`):
   - Her yazmada ikinci, yalnız çevrim dışı bir kopya yazılır (`demirsafak.save.offlineBackup.v1`).
   - Ana kayıt bozulursa açılışta bu kopyadan kurtarılır. Ana kayıt yeniden yazılır, menüde bildirim çıkar.
   - Kopyada oyuncu profili (ad, hesap kimliği, belirteçler) ve sunucu adresi yoktur. İzin listesidir: bilinmeyen yeni alanlar da yazılmaz.
   - Aynı cihazdadır: bulut kaydı değildir.
8. **Android:**
   - Geri tuşu açık geliştirici konsolunu kapatır (`native.js`).
   - Otomatik yedek kapalı (`allowBackup="false"`): yerel kayıttaki hesap belirteci başka cihaza taşınmasın.
9. **Ön denetim** (`web/tools/release-audit.mjs`, `npm run audit:release`). Denetlenenler:
   - API 36;
   - `versionCode` ve uygulama kimliği;
   - Capacitor'da karışık içerik ve WebView hata ayıklaması kapalı;
   - şifresiz trafik ve geniş paket izni yok;
   - otomatik yedek kapalı;
   - gizlilik belgesi ve mağaza metni var;
   - lisans kayıtları var;
   - imza anahtarı depoda yok;
   - yukarıdaki düzeltmelerin yerinde olması.
   - `--built` ile mağaza derlemesine ve görsellere de bakar.
10. **CI** (`.github/workflows/quality-gates.yml`): Her push'ta sırayla `npm ci`, birim testleri, derleme ve ön denetim çalışır. Yayın yapmaz. Duman testleri 30 dakikayı aştığı için burada koşmaz.
11. **Testler:**
    - `web/tests/mobile-input-regressions.test.mjs`
    - `web/tests/save-backup-regressions.test.mjs`. Kayıt alanları ve ayarlar izin listesiyle eşleşmezse bu test düşer: yeni ayar `BACKUP_SETTINGS`'e de eklenmeli.

## Uyarlamalar (paketten farklar)

- **Tekerlek:** Paket oyun açıkken her tekerlek olayını engelliyordu. Duraklatmada da `enabled` açık kaldığı için bu, duraklatmadaki Ayarlar panelinin ve telsiz geçmişinin fareyle kaymasını bozardı. Şimdi sayfa kaymasını yalnız fare kilitliyken ya da olay tuvaldeyken engelliyor.
- **İlk tık:** Dokunmatikte kilit hiç istenmediği için ilk tık kuralı dokunmatikte uygulanmaz. Kural uygulansaydı fareli tablette tık hiç ateş etmezdi.
- **Takılı parmak kimliği:** `touchend` kaçarsa (bildirim perdesi) eski kimlik çubuğu ya da bakışı kilitlemesin diye yeni dokunuşta `touches` listesine bakılır.
- **Paketin testi:** Testteki `touchmove` olayı çubuk bölgesine gönderiliyordu. Oyunda bu dinleyici kök öğededir (olay oraya kabarcıklanır), bu yüzden test gerçek olay yoluna göre düzeltildi.
- **Yedek sırası:** Paket yedeği ana kayıttan önce yazıyordu. Burada ana kayıt önce yazılır: depolama dolarsa önemli olan yazılmış olsun.
- **İşaret dizgileri:** `DS_QA_V1_2` gibi işaretler konmadı. Denetim işlevin kendisini arar.
- **Kurulum betikleri** (`apply.py`, `KUR_VE_TEST_ET_MAC.command`, `patch-selftest.py`): Değişiklik zaten depoda olduğu için alınmadı.

## Henüz tamamlanmayan yayın kapıları (elle)

- **Android cihaz testi:** En az 2 gerçek cihazda düşük, orta ve yüksek kalitede FPS ve bellek ölçülmeli. 10 dakikalık görev ve en az 20 ölüm/yeniden deneme.
- **Dokunmatik:** Farklı ekran oranları, çentik/güvenli alan, geri tuşu ve bildirim perdesinden dönüş denenmeli.
- **Çevrim içi:** İki ayrı internet bağlantısıyla bağlanma, bağlantı kopması ve yeniden bağlanma denenmeli.
- **Play Console formları** (`Docs/STORE_RELEASE.md`, `store/LISTING.md`): Veri güvenliği, hesap silme ve içerik derecelendirmesi doldurulmalı. Hedef kitle 18+.
- **Lisans ve marka:** Model, ses ve yazı tiplerinin lisansları teyit edilmeli. Depo adındaki `call-of-duty` için marka değerlendirmesi yapılmalı (`Docs/STORE_RELEASE.md` → Depo adı).
- **Paket:** Gerçek AAB oluşturulup imzalanmalı. Her yüklemede `versionCode` artırılmalı. Kapalı test (12 kişi, 14 gün) tamamlanmalı.
- **API:** Google Play 31 Ağustos 2026'dan sonra API 36 istiyor. Depo zaten 36'da, ön denetim bunu doğrular.
