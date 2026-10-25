#!/usr/bin/env node
// Mağaza yayını ön denetimi (v1.2 kalite paketinden uyarlandı): Android/Capacitor ayarları, güvenlik bayrakları,
// gizlilik belgeleri ve girdi/kayıt düzeltmelerinin yerinde olduğu. Bağımlılık yok, yalnız dosya okur.
//   node tools/release-audit.mjs [--built]   (--built: mağaza derlemesi ve görselleri de üretilmiş olmalı)
// Bu bir Play Store onayı değildir: gerçek cihaz testleri ve Play Console formları yine elle yapılır.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const built = process.argv.includes('--built');
let failed = 0;
const read = (f) => {
  try {
    return fs.readFileSync(path.join(root, f), 'utf8');
  } catch {
    return null;
  }
};
const exists = (f) => fs.existsSync(path.join(root, f));
function check(ok, name, note = '') {
  if (!ok) failed++;
  console.log(`[${ok ? 'TAMAM' : 'HATA'}] ${name}${note ? ` — ${note}` : ''}`);
}
const num = (s, re) => {
  const m = s?.match(re);
  return m ? Number(m[1]) : null;
};

console.log('DEMİR ŞAFAK — YAYIN ÖN DENETİMİ');
console.log('Bu sonuç Play Store onayı değildir; gerçek cihaz testleri zorunludur.\n');
const variables = read('mobile/android/variables.gradle');
const appGradle = read('mobile/android/app/build.gradle');
const manifest = read('mobile/android/app/src/main/AndroidManifest.xml');
let cap = null;
try {
  cap = JSON.parse(read('mobile/capacitor.config.json'));
} catch {
  /* aşağıda HATA */
}
const targetSdk = num(variables, /targetSdkVersion\s*=\s*(\d+)/);
const compileSdk = num(variables, /compileSdkVersion\s*=\s*(\d+)/);
const versionCode = num(appGradle, /versionCode\s+(\d+)/);
const appId = appGradle?.match(/applicationId\s+["']([^"']+)/)?.[1];
// Google Play: 31 Ağustos 2026'dan sonra yeni uygulama ve güncellemeler API 36 hedeflemeli
check(targetSdk !== null && targetSdk >= 36, 'targetSdkVersion ≥ 36 (Play 2026)', `şu an: ${targetSdk ?? 'yok'}`);
check(compileSdk !== null && compileSdk >= targetSdk, 'compileSdkVersion ≥ targetSdkVersion', `şu an: ${compileSdk ?? 'yok'}`);
check(versionCode !== null && versionCode > 0, 'Android versionCode', `şu an: ${versionCode ?? 'yok'} (her yüklemede artırılmalı)`);
check(!!appId, 'Android applicationId');
check(!!cap?.appId && cap.appId === appId, 'Capacitor appId = Android applicationId');
check(!!manifest?.includes('android:exported="true"'), 'Başlatıcı etkinlik dışa açık (exported)');
check(!!manifest?.includes('android:allowBackup="false"'), 'Android otomatik yedeği kapalı', 'yerel kayıtta çevrim içi hesap belirteci var');
check(!manifest?.includes('android.permission.QUERY_ALL_PACKAGES'), 'Geniş paket listeleme izni yok');
check(!manifest?.includes('android:usesCleartextTraffic="true"'), 'Şifresiz trafik istisnası yok');
check(cap?.android?.allowMixedContent === false, 'Capacitor karışık içerik kapalı');
check(cap?.android?.webContentsDebuggingEnabled === false, 'Capacitor WebView hata ayıklaması kapalı');
// Girdi ve kayıt düzeltmeleri (v1.2): işaret dizgisi değil, işlevin kendisi aranır
const input = read('web/src/input.js') || '';
check(input.includes('clearTransientInput') && input.includes('isTextEditingTarget') && input.includes('actionFingers'), 'Girdi: arka planda bırakma, yazı alanı, çoklu dokunuş');
check(!!read('web/src/save.js')?.includes('SAVE_BACKUP_KEY') && exists('web/src/saveBackup.js'), 'Kayıt: çevrim dışı yedekten kurtarma');
check(exists('web/tests/mobile-input-regressions.test.mjs') && exists('web/tests/save-backup-regressions.test.mjs'), 'Girdi ve kayıt gerileme testleri');
check(exists('web/src/pwa/privacy.html') && exists('store/LISTING.md'), 'Gizlilik politikası ve mağaza metni');
check(exists('CREDITS.md') && exists('SourceAssets'), 'Lisans kayıtları (CREDITS.md, SourceAssets)');
if (built) {
  const webDir = cap?.webDir ? path.join('mobile', cap.webDir) : null;
  check(!!webDir && exists(path.join(webDir, 'index.html')), 'Mağaza derlemesi (dist/app) var', webDir || 'webDir yok');
  check(!!webDir && exists(path.join(webDir, 'assets')), 'Mağaza derlemesinde modeller var');
  check(exists('store/google-play/icon-512.png'), 'Play simgesi 512 px');
  check(exists('store/google-play/feature-graphic.jpg'), 'Play tanıtım görseli');
}
// İmza anahtarı depoya girmemeli (Docs/STORE_RELEASE.md: keystore kullanıcıda)
check(!exists('mobile/android/app/release/upload-key.jks') && !exists('mobile/android/app/release/upload-keystore.jks'), 'Derleme klasöründe imza anahtarı yok');
console.log('\nELLE: gerçek Android cihazda FPS/ısınma/dokunmatik, mikrofon izni, hesap silme, iki cihazla çevrim içi, Data safety ve yaş derecelendirmesi formları.');
console.log(`\nSonuç: ${failed} hata.`);
process.exitCode = failed ? 1 : 0;
