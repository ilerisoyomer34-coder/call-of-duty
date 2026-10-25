# Demir Şafak: App Store ve Google Play'e yayın

Bu belge oyunun mağaza uygulaması olarak nasıl derlenip yükleneceğini adım adım anlatır.

- **Kod tarafı hazır.** Mağaza sürümü, yerel projeler, simgeler, gizlilik politikası, hesap silme, şikâyet/engelleme ve mağaza görselleri depoda.
- **Senin yapacakların:** geliştirici hesaplarını açmak, imzalayıp derlemek ve mağaza formlarını doldurmak. Bunlar senin bilgisayarında ve hesabında olur; bulut ortamında yapılamaz.

## 0. Yapı (ne nerede)

| Yer | Ne |
| --- | --- |
| `web/dist/app/` | Mağaza sürümü (`npm run build` üretir; depoya girmez). PWA'nın aynısı ama: hizmet çalışanı ve manifest yok, yazı tipleri uygulamanın içinde (Google'a istek yok), silah adları hep kurgusal, Android geri tuşu oyunda. |
| `mobile/` | Capacitor kabuğu: `android/` (Android Studio projesi), `ios/` (Xcode projesi), `capacitor.config.json`. |
| `mobile/tools/make-native-assets.mjs` | Uygulama simgeleri ve açılış görselleri (`npm run assets`). |
| `web/tools/store-assets.mjs` | Mağaza görselleri → `store/` (ekran görüntüleri, Play simgesi, tanıtım görseli). |
| `store/LISTING.md` | Mağaza metinleri (TR/EN), inceleme notu, yaş ve veri formu yanıtları. |
| `web/src/pwa/privacy.html` | Gizlilik politikası → https://ilerisoyomer34-coder.github.io/call-of-duty/privacy.html |

- **Uygulama kimliği** (iki mağazada aynı): `io.github.ilerisoyomer34coder.demirsafak`. İlk yüklemeden sonra **değiştirilemez**.
- **Sürüm:**
  - Android: `mobile/android/app/build.gradle` → `versionCode` (her yüklemede +1) ve `versionName`.
  - iOS: Xcode → App hedefi → General → Version / Build.

## 1. Bir kez: bilgisayarı hazırla

1. **Node.js 22 LTS** ve **Git** kur. Ev sunucusu için kurduysan tamam.
2. Depoyu klonla ya da güncelle (`git pull`), sonra:
   ```
   cd web && npm install
   cd ../mobile && npm install
   ```
3. **Android için:** [Android Studio](https://developer.android.com/studio) kur. Java ve Android SDK içinde gelir. İlk açılışta SDK kurulumunu kabul et.
4. **iOS için:** **Mac ve Xcode** (App Store'dan, güncel sürüm) gerekir. Mac yoksa bulutta Mac kiralanabilir (MacinCloud gibi) ya da Codemagic gibi bir derleme servisi kullanılabilir. Apple, Windows'tan yüklemeye izin vermez.

## 2. Her sürümde: derle ve kopyala

```
cd mobile
npm run sync        # web'i derler (dist/app) ve android/ ile ios/ içine kopyalar
npm run android     # sync + Android Studio'yu açar
npm run ios         # sync + Xcode'u açar (Mac)
```

Simgeyi değiştirirsen önce `web/src/pwa/icon.svg` dosyasını değiştir, sonra `npm run assets` çalıştır.

Yüklemeden önce ön denetim (API 36, Capacitor güvenlik bayrakları, otomatik yedek kapalı, gizlilik belgeleri, imza anahtarı depoda değil; `--built` derleme ve mağaza görsellerini de arar). Aynı denetim her push'ta GitHub'da da koşar (`.github/workflows/quality-gates.yml`):

```
cd web
npm run audit:release            # ya da: node tools/release-audit.mjs --built
```

Ayrıntılı yayın kapıları ve elle yapılacak cihaz testleri: `Docs/RELEASE_QA_TR.md`.

## 3. Google Play

1. **Geliştirici hesabı:** https://play.google.com/console. Kayıt ücreti bir kez 25 $. Kimlik doğrulaması istenir.
   > Yeni **kişisel** hesaplarda Google, üretime çıkmadan önce **kapalı test** ister. Şu an kural: en az **12 test kullanıcısı**, kesintisiz **14 gün**. Başvururken Console'daki güncel kuralı kontrol et.
2. **İmzalı paket (.aab):**
   1. Android Studio'da **Build → Generate Signed App Bundle / APK → Android App Bundle**.
   2. **Create new…** ile *yükleme anahtarı* (keystore) oluştur.
   3. Bu dosyayı ve şifresini **güvenli yere yedekle**. Kaybedersen güncelleme yükleyemezsin. **Asla depoya koyma, kimseyle paylaşma.**
   4. **release** seç. Çıktı: `mobile/android/app/release/app-release.aab`.
   5. Console'da **Play App Signing** açık kalsın. Google asıl anahtarı kendisi saklar.
3. **Uygulama oluştur:** ad `Demir Şafak`, varsayılan dil Türkçe, tür **Oyun**, **Ücretsiz**.
4. **Mağaza kaydı** (`store/LISTING.md` → Türkçe; İngilizceyi çeviri olarak ekle):
   - uygulama simgesi `store/google-play/icon-512.png`
   - tanıtım görseli `store/google-play/feature-graphic.jpg`
   - telefon ekran görüntüleri `store/google-play/screenshots/*.jpg`
   - kategori **Aksiyon**
5. **Uygulama içeriği** formları:
   - **Gizlilik politikası:** yukarıdaki adres.
   - **Uygulama erişimi:** giriş gerekmez.
   - **Reklamlar:** Hayır.
   - **İçerik derecelendirmesi (IARC):** anketi dürüst doldur. Gerçekçi şiddet var; kumar ve sohbet yok. Ayrıntı `store/LISTING.md`.
   - **Hedef kitle:** 18+.
   - **Veri güvenliği:** `store/LISTING.md` tablosu.
   - **Hesap silme:** uygulama içi yol ve gizlilik sayfası adresi.
6. **Test → yayın:**
   1. **Dahili test**e `.aab`'yi yükle, kendi telefonunda dene.
   2. **Kapalı test**e geç; 12 kişi, 14 gün.
   3. **Üretim**e gönder. İnceleme genelde birkaç gün sürer.

## 4. App Store

1. **Geliştirici hesabı:** https://developer.apple.com/programs. Yıllık 99 $. Kimlik doğrulaması istenir.
2. **Xcode** (`npm run ios`):
   1. **App** hedefi → **Signing & Capabilities** → **Team** olarak kendi hesabını seç. Bundle ID yukarıdaki kimlik.
   2. **General → Minimum Deployments:** iOS 15. WebGL 2 için yeterli.
   3. Gerçek bir iPhone'da dene: kabloyla bağla → ▶ Run.
   4. **Product → Archive** → **Distribute App → App Store Connect → Upload**.
3. **App Store Connect** (https://appstoreconnect.apple.com) → **Uygulamalar → +**:
   - **Yeni uygulama:** ad, birincil dil Türkçe, bundle ID, SKU (`demirsafak`).
   - **Ekran görüntüleri:**
     - iPhone 6,9" → `store/app-store/iphone-6.9/*.jpg`
     - iPad 13" → `store/app-store/ipad-13/*.jpg`
   - **Metinler:** `store/LISTING.md` (alt başlık, anahtar kelimeler, açıklama).
   - **Destek adresi (Support URL):** gizlilik sayfası ya da kendi sayfan. **Gizlilik politikası adresi:** yukarıdaki.
   - **Yaş derecelendirmesi** anketi. **Uygulama gizliliği** (App Privacy) → `store/LISTING.md` tablosu.
   - **Şifreleme:** sorulmaz; `Info.plist`'te `ITSAppUsesNonExemptEncryption = false` var.
   - **App Review notu:** `store/LISTING.md` → "İnceleme notu".
4. **TestFlight** ile kendin dene, sonra **Submit for Review**. İnceleme genelde 1–3 gün.

## 5. Uygunluk denetim listesi (reddedilmemek için)

- [x] **Marka:** Ad, açıklama, anahtar kelime ve görsellerde "Call of Duty" ya da başka bir oyunun adı yok. Mağaza sürümünde silah adları kurgusal (`STORE_BUILD`), "Gerçek silah adları" anahtarı gizli. Silah dokularındaki logolar boyandı.
- [ ] **Depo adı:** Gizlilik sayfasının adresinde `call-of-duty` geçiyor (GitHub Pages depo adını kullanır). İncelemeye girmeden önce depoyu yeniden adlandırman önerilir (GitHub → Settings → Repository name, ör. `demir-safak`).
  - Sonra bana söyle: `NET.gameUrl`, `APP.privacyUrl` ve belgelerdeki adresleri güncelleyeyim.
  - Eski Pages adresi yönlenmez; davet bağlantıları yeni adrese geçer.
- [x] **Hesap silme** (Apple 5.1.1(v), Google Play): Ayarlar → Çevrim içi hesap → Hesabı sil. Sunucuda ad, etiket, arkadaşlık, bildirim, engel ve yapılan şikâyetler silinir.
- [x] **Kullanıcı içeriği** (Apple 1.2):
  - Ad süzgeci (`shared/names.js`).
  - Her oyuncu satırında **⋯ → Adı bildir / Taciz-hile bildir / Engelle**.
  - Engellenenler İstekler sekmesinde, engel oradan kaldırılır.
- [ ] **Şikâyetlere bakmak (senin işin):** Sunucuyu sen çalıştırıyorsan şikâyetleri en geç 24 saatte incele:
  ```
  cd web
  node server/moderate.mjs              # son şikâyetler
  node server/moderate.mjs sil <kimlik> # uygunsuz hesabı sil
  ```
- [x] **Gizlilik politikası** (uygulamada Ayarlar → Gizlilik ve Pages'te): reklam yok, izleme yok, yerel kayıt, çevrim içi veri, silme yolu.
- [x] **Üçüncü taraf içerik:**
  - Sketchfab modelleri CC BY 4.0; ticari kullanım serbest, atıf Emeği geçenler → Lisanslar ekranında.
  - Yazı tipleri SIL OFL (`web/src/fonts/`).
  - CC BY-NC ve "Sketchfab Standard" lisanslı dosyalar alınmadı.
- [x] **Asgari işlev** (Apple 4.2): Oyunun tamamı uygulamanın içinde, internetsiz oynanır. Web sitesi sarmalayıcısı değil.
- [x] **Otomatik yedek kapalı** (Android `allowBackup="false"`): yerel kayıtta çevrim içi hesap belirteci var, Google yedeğiyle başka cihaza taşınmasın. Bedeli: uygulama silinip kurulunca ilerleme kendiliğinden geri gelmez. Aynı cihazda ana kayıt bozulursa ilerleme çevrim dışı yedekten (`web/src/saveBackup.js`, kimliksiz) kurtarılır. Veri güvenliği formunda "yedeklenmez" de.
- [x] **İzinler:**
  - Android'de yalnız İnternet.
  - iOS'ta mikrofon ve konuşma tanıma gerekçe metinleri var (sesli komut isteğe bağlı, varsayılan kapalı).
- [x] **Yatay ve tam ekran:**
  - Android: `sensorLandscape`, sistem çubukları gizli.
  - iOS: yalnız yatay, `UIRequiresFullScreen`, durum çubuğu gizli.
  - Oynarken ekran kararmaz.
- [ ] **Cihazda deneme (senin işin):**
  - Orta seviye bir Android telefonda ve bir iPhone'da görev oyna. Ayarlar → Görüntü kalitesi düşük/orta dene.
  - Çentikli ekranda kenardaki düğmelerin kesilmediğine bak.
  - Android geri tuşunu dene: görevde duraklatır, menüde bir ekran geri gider, ana ekranda iki basış uygulamadan çıkar.
- [ ] **Satın alma / reklam eklenirse:** Dijital içerik satışı mağazanın kendi ödeme sistemiyle olmalı (StoreKit / Play Billing). Gizlilik politikası ve formlar güncellenmeli.

## 6. Çevrim içi oyun ve mağaza uygulaması

- Mağaza sürümünde varsayılan sunucu yoktur. Oyuncu, arkadaşının paylaştığı davet bağlantısını Çevrim içi ekranındaki alana yapıştırır.
  - Uygulamadaki tıklanabilir `?sunucu=` bağlantıları tarayıcıda açılır; uygulamaya doğrudan bağlantı (deep link) henüz yok.
- Sunucu, uygulamanın kökenlerini kabul eder:
  - Android `https://localhost`
  - iOS `capacitor://localhost`
- Sabit bir sunucu adresi istersen `web/src/config.js` → `NET.serverUrl` alanına yaz ve yeniden derle. VPS kurulumu `Docs/DEPLOY.md`'de.
- **Sürüm uyumu:**
  - Sunucu, istemcinin derleme özetini (`BUILD_HASH`) denetler.
  - Mağazadaki uygulama güncellenene dek eski sürümler yeni sunucuya bağlanamaz ("sürüm farkı").
  - Ev sunucusu kendini depodan günceller. Mağazaya yeni sürüm gönderdiğinde sunucu da aynı koda geçer.
  - Yani **uygulama güncellemesini ve sunucu güncellemesini birlikte yap.**
