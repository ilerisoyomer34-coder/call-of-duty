# NETCODE — paylaşılan simülasyon ve ağ çekirdeği

Bu belge kodla birlikte güncellenir. Kapsam:
- M1: paylaşılan simülasyon.
- S1–S3: sosyal katman.
- S4–S6: oyun bağlantısı, tahmin, uzlaştırma, aralama, sunucu atışı, gecikme telafisi, maç modları, eşleştirme, botlar.

Bayt düzenleri `Docs/PROTOCOL.md`'de.

## Yerleşim

| Yol | İçerik | Kim çalıştırır |
|---|---|---|
| `web/shared/constants.js` | `TICK_RATE` (64), `TICK_DT`, nicemleme adımları (`QUANT`) | istemci, sunucu |
| `web/shared/sim/math.js` | `clamp`, `lerp`, `damp`, `quantize` (`src/util.js` bunları yeniden dışa aktarır) | istemci, sunucu |
| `web/shared/sim/rng.js` | `mulberry32`, `hashSeed`, `Rng`, `inCone` | istemci, sunucu |
| `web/shared/sim/collision.js` | `CollisionWorld`: kutu ızgarası, ışın, görüş, `moveCharacter`, `box/block`, `toJSON/fromJSON` | istemci (`World` genişletir), sunucu |
| `web/shared/sim/movement.js` | `stepPlayer`, `InputCmd`, `BTN`, `SIM_EV`, durum kurucuları | istemci (`Player`), sunucu |
| `web/shared/sim/weapon.js` | tempo (`triggerShots`), sapma (`spreadDeg`, bloom), geri tepme deseni (`recoilKick`), mermi yönü (`pelletDir`) | istemci (`PlayerWeapons`), sunucu |
| `web/shared/sim/hitboxes.js` | pozdan vuruş kutuları ve ışın kesişimi | sunucu (M4), istemci hata ayıklama |
| `web/shared/sim/replay.js` | tohumlu 10.000 komutluk tekrar (determinizm testi) | test |
| `web/shared/sim/nav.js`, `heap.js` | gezinme ızgarası, A* (tek oyunculu yapay zekâ ve sunucu botları) | istemci, sunucu |
| `web/shared/net/` | `protocol`, `codec` (ikili), `clock` (`ClockSync`), `netsim`, `transport` | istemci, sunucu |
| `web/shared/maps/<harita>.collision.json` | haritanın statik çarpıştırıcıları | sunucu |

Kural: `shared/` altında DOM, THREE, `Date.now`, `performance.now` ve `Math.random` yok. Ayar değerleri `src/config.js`'ten gelir. Bu dosyanın içe aktarması yoktur, Node da okur.

## Tick ve nicemleme

- Hareket her zaman `dt = 1/64` sn ile ilerler.
  - Tek oyunculuda `Player.update` kare süresini biriktirir ve tam tick'leri koşturur.
  - Bir karede en çok `SIM.maxTicksPerFrame` (10) tick çalışır; fazlası atılır.
  - Kamera, önceki ve şimdiki tick konumları arasında aralanır (`renderPos`).
  - Konum 2 m'den fazla sıçrarsa ışınlanma sayılır ve aralama yapılmaz.
- Tick sonunda değerler nicemlenir: konum 1/1024 m, hız 1/256 m/s, `crouchT`/`adsT` 1/1024. Böylece JS motorları arasındaki son bit farkları birikmez.
- Konsolda `cl_fixedstep 0` eski kare adımına döner (A/B karşılaştırması). Bu yolda nicemleme yapılmaz.

## `stepPlayer(s, cmd, world, dt)`

- Durumu **yerinde** günceller ve olay bitlerini (`SIM_EV`) döndürür. Belgedeki "yeni durum döndür" biçiminden sapmanın nedeni çalışma sırasında bellek ayırmamaktır. Tahmin geçmişi için `clonePlayerState` kullanılır.
- Adımın sırası:
  1. Koşu/nişan/çömelme kuralları.
  2. Zemin ivmesi ve sürtünme ya da hava ivmesi.
  3. Zıplama.
  4. `moveCharacter` (dikey silindir, kayma, basamak, tavan).
  5. Nicemleme.
- Dış etkiler `s.mods` ile girer: silah hareketliliği, nişan çarpanı/süresi, zırh hızı, eylem çarpanı, koşu engeli, nişan izni. İstemci her karede doldurur, sunucu kendi silah/zırh durumundan dolduracak.
- Olayların yan etkileri (ses, yapay zekâ gürültüsü, şarjör değiştirme iptali, aç/kapa düğmelerinin sıfırlanması) çağıranda yapılır: `Player.onSimEvents`.

## `InputCmd`

`{ seq, moveX, moveY, yaw, pitch, buttons }`

- `moveX/moveY`: −1…1, ağda i8 (1/127 adım). Telefon joystick'i ve gamepad analog gelir.
- `yaw/pitch`: radyan; ağda yaw u16 (tam tur), pitch i16.
- `buttons` (`BTN`): `JUMP` (basış, bir tick tüketene dek tutulur), `CROUCH`, `SPRINT`, `ADS` (istenen durum; aç/kapa ayarı istemcide çözülür), `FIRE`, `RELOAD`, `USE`, `LEAN_L`, `LEAN_R`, `MELEE`.
- Nişan basış kenarı (koşuyu keser) önceki tick'in düğmelerinden hesaplanır (`s.buttons`).
- İstemci tarafı: `src/inputCmd.js → updateInputCmd`.

## Rastgelelik

- Oyuncu silahı: saçılma, saçma taneleri, geri tepmenin rastgele payı ve roket sapması `PlayerWeapons.rng`'den (`Rng`) gelir.
  - Tek oyunculuda tohum her görev başında yenilenir.
  - Çevrim içide sunucu `hashSeed(serverSecret, matchId, playerId, cmd.seq)` kullanacak (M4). İstemci kendi tohumuyla yalnız kozmetik iz çizer.
- Kozmetik rastgelelik (kan, ışık, duman, kamera vuruş sarsıntısı) ile tek oyunculu düşman ve dost yapay zekâsı `Math.random` ile kalır. Bunlar sunucuya taşınmıyor (`Docs/DECISIONS.md`).

## Çarpışma verisi

- Haritalar (`src/maps/*.js`) yalnız `box`, `block`, `addGeometry`, `addCollider`, `bounds`, `floorSurface` kullanır. Aynı kod Node'da görselsiz `CollisionWorld` ile çalışır.
- `node tools/export-collision.mjs` her harita için `shared/maps/<id>.collision.json` üretir (`--check`: güncel mi).
  - Biçim: `{ map, format, units, bounds, floorSurface, roads, surfaces, hash, boxes: [[minx, miny, minz, maxx, maxy, maxz, yüzeyIndeksi]] }`.
  - Koordinatlar 0,1 mm'ye yuvarlanır. İstemci haritayı kendisi kurar ve farkı en çok 0,05 mm olur. Bu fark uzlaştırma eşiğinin (1 cm) çok altında; ışınlar 1 mm içinde aynı sonucu verir (`tests/collision-export.test.mjs`).
- Yalnız statik ve sahipsiz çarpıştırıcılar dosyaya girer. Tank, mevzi ve kum torbası gibi görev ekleri girmez. `World.mapColliders` haritanın kendi çarpıştırıcı sayısıdır.
- Güncellik iki yerden denetlenir:
  - Birim testi: harita Node'da yeniden kurulup özet karşılaştırılır.
  - Duman `maps` bölümü: tarayıcıda kurulan dünyanın özeti dosyadakiyle aynı olmalı.

## Vuruş kutuları

`hitboxesFor(pose, out)` boy, yaw, pitch ve yürüyüş fazından şu kutuları üretir:

| Parça | Şekil | Bölge (silah / oyuncu çarpanı) |
|---|---|---|
| Baş | küre | `head` / `head` |
| Göğüs | kapsül | `torso` / `torso` |
| Karın | yaw ile dönmüş kutu | `torso` / `torso` |
| İki kol | kapsül (omuzdan nişan yönüne) | `limb` / `torso` |
| İki bacak | kapsül | `limb` / `leg` |

- Çarpanlar mevcut veriden gelir (`weapons.zones`, `armor.json → playerZones`), belgedeki CS:GO değerleri değil.
- Konsolda `sv_showhitboxes 1`, asker ve dostların kutularını tel kafes çizer.

## Sosyal katman (S2–S3): REST + WebSocket

- **Sunucu:** `web/server/` (tek süreç).
  - `index.js`: HTTP ve `/ws` aynı port.
  - `api.js`: REST uçları.
  - `hub.js`: çevrim içi bağlantılar, durum.
  - `party.js`: parti ve davet, bellekte.
  - `db.js`: `node:sqlite`.
  - `limits.js`: sınırlar.
  - `ratelimit.js`, `backup.mjs`.
- **Kimlik:**
  - `POST /api/session { name }` → `{ id, name, tag, token }`.
  - Sonraki istekler `Authorization: Bearer <token>`.
  - İstemci belirteci kayıtta tutar (`save.data.profile.token`).
  - 401 alırsa (sunucu veritabanı sıfırlandı) yeni kimlik alır.
- **REST:**
  - Profil: `GET/PATCH /api/me`.
  - Arama: `GET /api/players?q=ad[#etiket]` (önek, Türkçe katlama, en az 2 harf).
  - Arkadaşlık:
    - `GET /api/friends` → `{ friends[{status}], incoming, outgoing }`.
    - `POST /api/friends/request|respond|remove`.
  - Bildirim: `GET /api/notifications`, `POST /api/notifications/seen`.
  - Parti: `GET /api/party`, `POST /api/party/invite|respond|leave|kick|mode`.
  - Sağlık: `GET /api/health`.
  - Hatalar `{ error: kod }`; Türkçe metinler `src/net/social.js → ERRORS`.
- **WebSocket `/ws`:**
  - İstemci → sunucu:
    - İlk ileti `{ t: 'hello', token, status }` (5 sn içinde); sonra `{ t: 'status', status: 'menu'|'playing' }` ve `{ t: 'ping' }`.
    - En çok 2 KB, saniyede 20 ileti.
    - Yanlış kimlik `4001` ile kapanır.
  - Sunucu → istemci:
    - Açılış: `welcome` (ad, listeler, parti, son bildirimler).
    - Liste ve durum: `friends` (ilişki değişince), `presence` (arkadaşın durumu).
    - Arkadaşlık: `notification` (`friend_request`, `friend_accepted`), `friend_declined`.
    - Parti: `party`, `party_invite`, `party_invite_declined`.
- **İstemci `SocialClient`** (`game.social`):
  - Adres önceliği: `?server=` › Ayarlar "Çevrim içi sunucu" › `config.js → NET.serverUrl`.
  - Kopunca `NET.reconnectSec` aralıklarıyla yeniden bağlanır; 25 sn'de bir `ping` gönderir.
  - Olaylar: `EV.SOCIAL_STATUS`, `FRIENDS_CHANGED`, `NOTIFICATION`, `PARTY_CHANGED`, `PROFILE_CHANGED`.
- **Ekran:** `src/onlineScreen.js` (Arkadaşlar / Oyuncu ara / İstekler, parti paneli) ve `#socialToasts` bildirim kartları (menüde ve oyunda; yanıt düğmeli kartlar 30 sn kalır).

## Oyun bağlantısı (S4–S6)

### Sunucu (`web/server/game/`)

**`sim.js` → `MatchSim`** (ağdan bağımsız, testler doğrudan sürer):
- **Komut bütçesi:**
  - Her tick bir komut işlenir; kuyruk 3'ü aşarsa iki.
  - Oyuncunun kredisi tick başına 1 artar, en çok `ONLINE.creditMax`. Gecikip biriken komutlar yetişir ama gerçek zamandan hızlı oynanamaz.
  - Komut yoksa oyuncu o tick durur (son komut tekrarlanmaz). Böylece istemci tahmini ile sunucu aynı komut dizisini işler.
- **Hareket:**
  - `stepPlayer`, modlar `applyCmdMods(md, buttons, silah)`.
  - Zırh, etkileşim ve sarf malzemesi çevrim içinde yok.
- **Atış:**
  - İstemci atış anını ve nişan yönünü komutla bildirir (`shots`). Sunucu doğrular:
    - tempo kredisi (`fireTolerance`);
    - şarjör ve şarjör değiştirme süresi (`reloadTolerance`);
    - silah değiştirme süresi.
  - Saçılmayı kendi tohumuyla üretir: `hashSeed(gizli, maç, oyuncu, seq, atış)`.
  - Işını önce dünyaya, sonra rakiplerin geri sarılmış vuruş kutularına atar.
  - Dost ateşi kapalı; mermi dosttan geçer.
- **Gecikme telafisi:**
  - Her tick her oyuncunun pozu `ONLINE.historyTicks` derinliğinde saklanır.
  - Atış komutun `viewTick`'ine (oyuncunun gördüğü sunucu zamanı) aralanarak sarılır.
  - En çok `ONLINE.maxRewindMs` (200 ms) geri.
- **Can:**
  - 100.
  - Yenilenme `regenDelay` / `regenRate`.
  - Doğuş koruması `protectSec`; ateş edince biter.
- **Doğuş:** kendi tarafının noktalarından (herkes kendine modunda `ffa`), rakibe en uzak ve görüş dışında olanı.
- **Evreler:** `WARMUP` (geri sayım, hareket ve atış yok) → `LIVE` → `ENDED` (sonuç, `endScreenSec` sonra oda kapanır).
- **Botlar:** `rules.bots = 'fill'` ise eksik yerler yapay zekâyla dolar; insan gelince o taraftan bir bot çıkar.

**`bot.js` → `BotBrain`:**
- İnsan gibi her tick bir `InputCmd` üretir; hareket ve atış doğrulaması aynı yoldan geçer.
- Algı: görüş açısı ve mesafe, duvar arkası değil; yakında ateş eden duyulur.
- Tepki süresi, ilk nişanda sapma (zamanla oturur), dönüş hızı sınırı, seri atış ve ara.
- Çatışmada yana kayar, uzaksa yaklaşır.
- Boşta gezinme noktalarına ya da rakiplerin bölgesine yol bulur; takılırsa zıplar ve hedef değiştirir.
- Beceri `rules.botSkill`, aralıklar `data/bots.json`.

**`room.js` → `Room`:**
- 64 Hz döngü (gerçek saate göre, gerideyse yetişir; çok gerideyse saat kaydırılır).
- Anlık görüntü her 2 tick'te, alıcıya özel: yerel uzlaştırma kaydı + diğer oyuncular + aradaki olaylar.
- Liste (`S_ROSTER`) değişince gönderilir.
- Ping, onaylanan anlık görüntünün gönderilme anından ölçülür.
- Boş oda 30 sn sonra kapanır.

**`rooms.js`:**
- `RoomManager`:
  - oda kodu, 31 sembolden 6 karakter;
  - arena çarpışma verisi `shared/maps/<arena>.collision.json`.
- `Matchmaker`:
  - takım (party) birlikte ve aynı tarafa konur;
  - önce yeri olan süren maça katılır: bot yeri insana açılır, oyuncular karışık;
  - yoksa `searchSec` bekler, bekleyen takımları bir maçta toplar, kalan yerler yapay zekâ.

**`gateway.js`:** `/game`, el sıkışma ve sınırlar. `NETSIM=<profil>` sunucu tarafı gecikme benzetimi.

### İstemci (`web/src/net/`)

**`gameClient.js` → `GameClient` (`game.net`):**
- El sıkışma, `ClockSync`, komut gönderimi (her pakette son 3 komut).
- **Tahmin:**
  - `Player` her tick `prepareCmd` (komut ağ biçimine yuvarlanır, modlar doldurulur), sonra `stepPlayer`, sonra `commitCmd` çağırır.
  - `commitCmd` komutu ve sonraki durumu 256'lık halkaya yazar ve gönderir.
- **Uzlaştırma:**
  - Anlık görüntü sunucunun işlediği son komuttaki (`ackSeq`) durumu getirir.
  - Halkadaki tahmin aynıysa (`reconcileEps`) dokunulmaz.
  - Değilse sunucu durumundan sonraki komutlar yeniden oynatılır.
  - Görüntüdeki fark `player.netCorr` ile yumuşar (`correctionHalfLife`).
- **Zaman genişletme:** sunucudaki komut tamponu 1'in altındaysa tick %3 hızlanır, 4'ün üstündeyse %3 yavaşlar.
- **Atış, şarjör, yakın dövüş:**
  - İstemcide görünür; `weapons.js` `net.onShot / onReload / onMelee` ile komuta ekler.
  - İsabet işareti, kan, hasar yönü ve ölüm sunucu olaylarından gelir.

**`remotePlayers.js`:**
- Uzak oyuncular sunucu saatinin `interpMs` gerisinde çizilir (titreşime göre 60–250 ms) ve iki görüntü arası aralanır.
- Görüntü gecikirse en çok `extrapolateMs` ileri tahmin edilir.
- Aynı taraf mavi görünüm ve ad etiketi, rakip düşman görünümü; rakibin adı yalnız nişangâhtayken.

**`matchHud.js`:** skor çubuğu ve süre, geri sayım, öldürme akışı, puan tablosu (Tab; dokunmatikte skora dokun), ölüm kartı, maç sonu.

**`wsTransport.js`:** ikili WebSocket. Konsol `net_fakelag` / `net_profile` ya da `?netsim=` iki yönde `NetSim` uygular.

**Konsol:** `net_graph 0|1|2`, `net_profile`, `net_fakelag`, `net_fakejitter`, `net_fakeloss`, `net_status`.

### Modlar (`src/data/modes.json`)

| Mod | Kural |
|---|---|
| Takım Ölüm Maçı | 4v4, 40 öldürme ya da 8 dk |
| Ölüm Maçı | 6 oyuncu, 20 öldürme ya da 6 dk |
| Co-op: Yapay Zekâya Karşı | Takım mavi tarafta (en çok 4), karşıda 6 bot; 50 öldürme ya da 8 dk |
| Deneme odası | Botsuz, süresiz |
| Rekabetçi | Yakında |

Arena: Depo (`src/maps/depo.js`, `data/arenas.json`; nokta simetrik, doğuşlar birbirini görmez).

## Testler

- Birim:
  - `tests/rng.test.mjs`
  - `tests/collision.test.mjs`
  - `tests/movement.test.mjs`
  - `tests/weapon.test.mjs`
  - `tests/hitboxes.test.mjs`
  - `tests/collision-export.test.mjs`
  - `tests/determinism.test.mjs`
  - `tests/names.test.mjs`
  - `tests/server.test.mjs` (sunucu bellek içi veritabanıyla; kimlik, arama, istek, anlık bildirim, durum, parti, dayanıklılık)
  - `tests/codec.test.mjs` (gidiş-dönüş, nicemleme sınırları, bozuk ileti)
  - `tests/clock.test.mjs` (saat farkı < 5 ms; ağ benzetimi sıra ve gecikme)
  - `tests/room.test.mjs` (sunucu hareketi tahminle bit düzeyinde aynı, komut bütçesi, gecikme telafisi, atış doğrulaması, botlu TDM/ÖM)
  - `tests/game-server.test.mjs` (gerçek sunucu: el sıkışma ve retler, deneme odası, hızlı maç)
- Duman `online`: sunucu alt süreçte; iki sayfa arasında arama, istek, kart, kabul, "Oyunda" durumu, davet, mod, çevrim dışı istek ve telefon görünümü.
- Duman `netplay`:
  - takım kurulur; deneme odasına üye kendiliğinden katılır;
  - hareket öbür ekranda < 0,3 m farkla izlenir; tahmin farkı < 1 cm;
  - net_graph ve Orta benzetim;
  - olmayan oda için hata ekranı;
  - hızlı TDM: takım aynı tarafta, 6 YZ, skor, öldürme akışı, puan tablosu;
  - telefonda ÖM.
- Duman `determinism`: `shared/sim/replay.js` esbuild ile paketlenip Chromium'da koşar. Kızılkum ve Yıkık Şehir'de 10.000 komut sonrası konum Node ile karşılaştırılır (≤ 1 mm) ve her 1000 tick'in özeti eşleşmelidir.
- Davranış referansı: `Docs/BASELINE.md` (`node tools/baseline.mjs --compare`).
