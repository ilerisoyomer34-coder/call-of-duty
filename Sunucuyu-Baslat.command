#!/bin/bash
# Demir Şafak ev sunucusu (macOS): çift tıkla. Ayrıntı: Docs/HOME_SERVER.md
cd "$(dirname "$0")/web" || exit 1
# Finder'dan açılınca PATH kısa olur: Homebrew ve resmî Node kurulum yolları eklenir
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js bulunamadı. https://nodejs.org adresinden LTS sürümünü kur, sonra bu dosyayı yeniden aç."
  read -r -p "Kapatmak için Enter'a bas…"
  exit 1
fi
if [ ! -d node_modules/ws ]; then
  echo "Gerekli paket kuruluyor, bir kez yapılır…"
  npm install --omit=dev --no-audit --no-fund || { read -r -p "Paket kurulamadı. Enter…"; exit 1; }
fi
node server/host.mjs "$@"
