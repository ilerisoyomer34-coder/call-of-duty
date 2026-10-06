# DEPLOY — çevrim içi sunucuyu VPS'e kurma

> **En kolay yol kendi bilgisayarın:** `Sunucuyu-Baslat` dosyasına çift tıkla. Ücretsiz, hesapsız, modem ayarsız; ayrıntı `Docs/HOME_SERVER.md`. Bu belge, bilgisayar kapalıyken de açık kalan bir sunucu (Oracle Cloud ya da VPS) isteyenler içindir.

Oyunun kendisi GitHub Pages'te kalır. Arkadaşlar, bildirimler, parti ve ileride çevrim içi maçlar için bir sunucu gerekir (`web/server/`, Node 22). Bu belge onu bir VPS'e kurmayı adım adım anlatır.

Kısaca:
- **Sunucu:** Node süreci yalnız yerel adreste dinler.
- **Caddy:** önünde durur, HTTPS sertifikasını kendisi alır.
- **Adres:** alan adı yoksa ücretsiz `sslip.io` adresi kullanılır.

Docker ve çok süreçli yapı M12'de eklenecek. Şimdiki sosyal katman için tek süreç yeter.

## 0. Ücretsiz: Oracle Cloud Always Free (önerilen)

Oracle'ın "Always Free" kotası kalıcı ücretsiz bir Linux sunucu verir. Bizim sunucu için fazlasıyla yeter. Kayıtta kart yalnız kimlik doğrulaması için istenir; ücretsiz kotada para çekilmez. Koşullar zamanla değişebilir, kayıttan önce sitedeki güncel duruma bak.

### 0.1 Hesap
1. https://www.oracle.com/cloud/free/ → "Start for free".
2. **Home Region** olarak **Germany Central (Frankfurt)** seç. Sonradan değişmez ve ücretsiz makine yalnız bu bölgede açılır. Türkiye'ye yakın olduğu için ping düşük olur.
3. E-posta doğrulaması ve kart adımını bitir. Hesap birkaç dakikada açılır.

### 0.2 Makine
1. Menü → **Compute → Instances → Create instance**.
2. **Image:** "Change image" → Canonical Ubuntu → **24.04** (aarch64 sürümü kendiliğinden seçilir).
3. **Shape:** "Change shape" → Ampere → **VM.Standard.A1.Flex**, **2 OCPU / 12 GB** (Always Free sınırı içinde).
4. **SSH keys:** "Generate a key pair for me" → **Save private key**. Dosyayı (`ssh-key-….key`) sakla; kaybolursa makineye giremezsin. Bu dosyayı kimseyle paylaşma, sohbete de yapıştırma.
5. **Create.** Birkaç dakikada "Running" olur. Sayfadaki **Public IP address** değerini not al (aşağıda örnek `203.0.113.7`).
6. "Out of capacity" hatası alırsan bu bölgede o an boş ücretsiz makine yok demektir:
   - başka bir "Availability domain" seç;
   - ya da 1 OCPU / 6 GB ile dene;
   - ya da birkaç saat sonra yeniden dene.

### 0.3 Ağ: 80 ve 443 portlarını aç (iki yerde)
1. **Oracle panelinde:** makinenin sayfası → "Primary VNIC"teki **Subnet** → **Security List** (Default) → **Add Ingress Rules**:
   - Source CIDR `0.0.0.0/0`, IP Protocol TCP, Destination Port Range `80`;
   - aynı kuralı `443` için de ekle.
2. **Makinenin içinde:** Oracle'ın Ubuntu imajı kendi iptables kurallarıyla bu portları kapatır. Bağlandıktan sonra (0.4) şunu çalıştır:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

Bu imajda aşağıdaki 3. adımdaki `ufw` satırlarını **atla**: ufw, Oracle'ın kurallarıyla çakışır.

### 0.4 Bağlanma (Windows)
- Windows 10/11'de PowerShell'de `ssh` hazır gelir. Anahtar dosyasının bulunduğu klasörde:

```powershell
ssh -i .\ssh-key-2026-10-04.key ubuntu@203.0.113.7
```

- Bağlanınca `sudo -i` ile root ol. Aşağıdaki 2–7. adımlar aynen geçerli: Node 22 ve Caddy'nin ARM (arm64) paketleri var. 3. adımda yalnız `ufw` satırlarını atla.

### 0.5 Bitince
- Tarayıcıda `https://203-0-113-7.sslip.io/api/health` `{"ok":true,…}` dönmeli (kendi IP'nle).
- Claude'a sunucunun **IP adresini** yaz. Oyunun varsayılan sunucu adresi o adrese çevrilir ve yayımlanır; o andan sonra canlı sitede arkadaşlar, takım ve "Maç ara" doğrudan çalışır.
- Şifre, SSH anahtarı ya da belirteç **gönderme**: gerekmez.

### 0.6 Boşta kalan makine
- Oracle, uzun süre neredeyse hiç kullanılmayan ücretsiz makineleri geri alabileceğini duyurmuştu.
- Bunu önlemenin yolu hesabı **Pay As You Go**'ya yükseltmek. Ücretsiz kotanın içinde kaldıkça ücret çıkmaz, ama kart bağlıdır; kotayı aşan bir kaynak açmamaya dikkat et.
- Güncel koşulu Oracle'ın "Always Free Resources" sayfasından kontrol et.

## 1. VPS seçimi (ücretli seçenek)

- **Sistem:** Ubuntu 24.04 LTS.
- **Boyut:** 1 vCPU ve 1 GB bellek yeter. Çevrim içi maçlar (S6) gelince 2 vCPU önerilir.
- **Konum:** Türkiye'ye yakın olsun (Frankfurt ya da İstanbul). Ping düşük olur.
- **Kurulumdan önce not al:** sunucunun IPv4 adresi (aşağıda örnek `203.0.113.7`) ve SSH ile bağlanma bilgisi.

## 2. Adres: alan adı yoksa sslip.io

- `sslip.io` IP'den türeyen ücretsiz bir ad verir: `203.0.113.7` için `203-0-113-7.sslip.io`. Bu ad doğrudan sunucuna çözülür. Caddy bu adla Let's Encrypt sertifikası alabilir.
- Alan adın varsa (`oyun.ornek.com`), DNS'te sunucunun IP'sine bir `A` kaydı aç ve aşağıda sslip.io adresi yerine onu yaz.

## 3. Kurulum (sunucuda, root olarak)

```bash
# Güvenlik duvarı: SSH, HTTP (sertifika için) ve HTTPS
apt update && apt -y upgrade
apt -y install ufw git curl debian-keyring debian-archive-keyring apt-transport-https
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable

# Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt -y install nodejs
node -v   # v22.13 ya da üstü olmalı (yerleşik SQLite)

# Caddy (resmî depo)
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
apt update && apt -y install caddy

# Oyun kullanıcısı, kod ve veri klasörü
useradd --system --home /opt/demirsafak --shell /usr/sbin/nologin demirsafak
git clone https://github.com/ilerisoyomer34-coder/call-of-duty.git /opt/demirsafak
cd /opt/demirsafak/web && npm ci --omit=dev     # yalnız sunucu bağımlılığı (ws)
mkdir -p /var/lib/demirsafak /var/backups/demirsafak
chown -R demirsafak: /opt/demirsafak /var/lib/demirsafak /var/backups/demirsafak
```

Depo özelse `git clone` için GitHub'da salt okunur bir "deploy key" ekle. Ayrıntısı GitHub → Settings → Deploy keys'te.

## 4. Servis (systemd)

`/etc/systemd/system/demirsafak.service`:

```ini
[Unit]
Description=Demir Şafak çevrim içi sunucusu
After=network.target

[Service]
User=demirsafak
WorkingDirectory=/opt/demirsafak/web
Environment=PORT=8790
Environment=HOST=127.0.0.1
Environment=DB_PATH=/var/lib/demirsafak/demirsafak.db
Environment=TRUST_PROXY=1
ExecStart=/usr/bin/node --disable-warning=ExperimentalWarning server/index.js
Restart=always
RestartSec=2
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/demirsafak /var/backups/demirsafak

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload && systemctl enable --now demirsafak
systemctl status demirsafak --no-pager
curl -s http://127.0.0.1:8790/api/health    # {"ok":true,...}
```

Ortam değişkenlerinin tamamı `web/server/.env.example`'da. Gizli anahtar yok: oturum belirteçleri rastgele üretilir, veritabanında yalnız özetleri durur.

## 5. HTTPS (Caddy)

`/etc/caddy/Caddyfile` (adresi kendi IP'ne göre yaz):

```
203-0-113-7.sslip.io {
	encode gzip
	reverse_proxy 127.0.0.1:8790
}
```

```bash
systemctl reload caddy
curl -s https://203-0-113-7.sslip.io/api/health
```

Caddy sertifikayı ilk istekte alır ve kendisi yeniler. WebSocket'ler (`/ws` sosyal, `/game` oyun odası) için ek ayar gerekmez.

Oyun odaları sunucuda 64 Hz koşar (8 kişilik botlu maç tek çekirdekte tick başına ~0,5 ms). `SERVER_SECRET` boşsa mermi saçılması tohumunun gizli parçası her açılışta rastgele üretilir; sabit istenirse uzun rastgele bir değer verilir (git'e girmez). Derleme özeti denetimi açıktır: sunucu ile Pages'teki oyun aynı commit'ten olmalı, değilse oyuncu "Oyun güncellendi" görür. Sunucuyu güncellerken `git pull` sonrası `systemctl restart demirsafak` yeterli.

## 6. Oyunu sunucuya bağlama

- **Hızlı deneme:** derleme gerekmez. Oyunda Ayarlar → "Çevrim içi sunucu" alanına `https://203-0-113-7.sslip.io` yaz. Ya da adresin sonuna `?server=https://203-0-113-7.sslip.io` ekle.
- **Kalıcı:** `web/src/config.js` → `NET.serverUrl` alanına adresi yaz, `cd web && npm run build`, commit ve push. Pages yayını kendiliğinden güncellenir. Bunu benden de isteyebilirsin; adresi söylemen yeter.
- **Köken izni:** sunucu varsayılan olarak yalnız GitHub Pages yayınına (`https://ilerisoyomer34-coder.github.io`), localhost'a ve yerel dosyadan açılan tek dosyalık sürüme izin verir. Başka bir adresten açacaksan `ALLOWED_ORIGINS` değişkenine ekle.

## 7. Yedek ve güncelleme

```bash
# Her gece 04:00 yedek (en yeni 14 dosya kalır)
cat >/etc/cron.d/demirsafak-backup <<'CRON'
0 4 * * * demirsafak cd /opt/demirsafak/web && DB_PATH=/var/lib/demirsafak/demirsafak.db /usr/bin/node --disable-warning=ExperimentalWarning server/backup.mjs /var/backups/demirsafak >/dev/null
CRON

# Güncelleme (yeni sürüm push edildikten sonra)
cd /opt/demirsafak && sudo -u demirsafak git pull && cd web && sudo -u demirsafak npm ci --omit=dev && systemctl restart demirsafak
```

Geri yükleme: servisi durdur, yedeği `/var/lib/demirsafak/demirsafak.db` olarak kopyala (yanındaki `-wal` ve `-shm` dosyalarını sil), servisi başlat.

## 8. Sorun giderme

| Belirti | Bakılacak yer |
|---|---|
| Oyunda "Sunucuya ulaşılamadı" | `curl https://ADRES/api/health`; `journalctl -u demirsafak -n 50` |
| Sertifika alınamadı | 80 ve 443 portları açık mı (`ufw status`; Oracle'da Security List ve `sudo iptables -L INPUT -n`); adres IP'ye çözülüyor mu |
| `origin` hatası (403) | Oyunu açtığın adres `ALLOWED_ORIGINS`'te mi |
| Arkadaş listesi boşaldı | Veritabanı yolu (`DB_PATH`) değişmiş olabilir; yedekten geri yükle |
