# Demir Şafak: mağaza uygulaması (Capacitor)

`web/dist/app/` (mağaza sürümü) bu kabukla Android ve iOS uygulamasına dönüşür. Yayın adımlarının tamamı `Docs/STORE_RELEASE.md`'de.

```
cd ../web && npm install     # bir kez
cd ../mobile && npm install  # bir kez
npm run sync                 # web'i derle, android/ ve ios/ içine kopyala
npm run android              # Android Studio
npm run ios                  # Xcode (Mac)
npm run assets               # simge ve açılış görsellerini web/src/pwa/icon.svg'den yeniden çiz
```

Elle yapılan ayarlar (Capacitor şablonunun üstüne). `cap add` yeniden çalıştırılırsa bunlar geri konmalı:

- `android/app/src/main/AndroidManifest.xml`: `screenOrientation="sensorLandscape"`, OpenGL ES 3.0 zorunlu (WebGL 2).
- `android/.../MainActivity.java`: sistem çubukları gizli (tam ekran), ekran kararmaz.
- `android/app/src/main/res/values/ic_launcher_background.xml`: simge zemini `#0D1013`.
- `ios/App/App/Info.plist`: yalnız yatay, `UIRequiresFullScreen`, durum çubuğu gizli, mikrofon / konuşma tanıma gerekçeleri, `ITSAppUsesNonExemptEncryption = false`, bölge `tr`.
- `ios/App/App/AppDelegate.swift`: ekran kararmaz (`isIdleTimerDisabled`).
