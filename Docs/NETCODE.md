# NETCODE — paylaşılan simülasyon ve ağ çekirdeği

Bu belge kodla birlikte güncellenir. M1'de yalnız simülasyon kuralları vardır. Tahmin, uzlaştırma, interpolasyon ve gecikme telafisi M3–M4'te eklenecek.

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

## Testler

- Birim:
  - `tests/rng.test.mjs`
  - `tests/collision.test.mjs`
  - `tests/movement.test.mjs`
  - `tests/weapon.test.mjs`
  - `tests/hitboxes.test.mjs`
  - `tests/collision-export.test.mjs`
  - `tests/determinism.test.mjs`
- Duman `determinism`: `shared/sim/replay.js` esbuild ile paketlenip Chromium'da koşar. Kızılkum ve Yıkık Şehir'de 10.000 komut sonrası konum Node ile karşılaştırılır (≤ 1 mm) ve her 1000 tick'in özeti eşleşmelidir.
- Davranış referansı: `Docs/BASELINE.md` (`node tools/baseline.mjs --compare`).
