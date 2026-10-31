// Oyunun çalıştığı yer: mağaza uygulaması (Capacitor kabuğu içinde dist/app) ya da tarayıcı.
// Mağaza sürümünü derleme belirler (tools/build.mjs → __STORE__); yerel kabuğu Capacitor köprüsü
// (sayfaya window.Capacitor koyar). Node testlerinde ikisi de false.
/* global __STORE__ */
export const STORE_BUILD = typeof __STORE__ !== 'undefined' && __STORE__ === true;

export function isNative() {
  try {
    return !!globalThis.Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
}
