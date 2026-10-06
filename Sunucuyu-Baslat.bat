@echo off
rem Demir Safak ev sunucusu (Windows): cift tikla. Ayrinti: Docs\HOME_SERVER.md
chcp 65001 >nul
title Demir Safak sunucusu
cd /d "%~dp0web"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js bulunamadi. https://nodejs.org adresinden LTS surumunu kur, sonra bu dosyayi yeniden ac.
  pause
  exit /b 1
)
if not exist "node_modules\ws" (
  echo Gerekli paket kuruluyor, bir kez yapilir...
  call npm install --omit=dev --no-audit --no-fund
  if errorlevel 1 (
    echo Paket kurulamadi. Internet baglantisini denetle.
    pause
    exit /b 1
  )
)
node server\host.mjs %*
pause
