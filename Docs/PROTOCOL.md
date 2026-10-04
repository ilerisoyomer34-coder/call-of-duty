# PROTOCOL — oyun bağlantısının ikili ileti kataloğu

Kod: `web/shared/net/protocol.js` (sabitler), `web/shared/net/codec.js` (kodlama/çözme), testler `web/tests/codec.test.mjs`.
Sürüm `PROTOCOL_VERSION = 1` (`web/shared/constants.js`). Bayt düzeni değişince sürüm artar.

## Bağlantı

- Adres: sosyal sunucunun adresi, yol `/game` (ikili WebSocket, `binaryType = 'arraybuffer'`). Sosyal katman `/ws` (JSON) ayrı bağlantıdır.
- Sıra:
  1. İstemci `C_HELLO` gönderir (5 sn içinde).
  2. Sunucu sürümü, derleme özetini, kimliği ve oda üyeliğini denetler. Geçerse `S_WELCOME` ve `S_ROSTER`, geçmezse `S_ERROR` + kapanış.
  3. İstemci haritayı kurar, `C_LOADED` gönderir; sunucu oyuncuyu doğurur ve anlık görüntü göndermeye başlar.
  4. İstemci her tick `C_INPUT`, saat eşitleme için `C_PING` gönderir.
- Sınırlar (Ek B, `server/game/gateway.js → GAME_LIMITS`):
  - istemci iletisi en çok 512 bayt;
  - saniyede en çok 80 `C_INPUT`, 120 ileti;
  - 3 bozuk ya da sınır dışı ileti → `S_ERROR BAD_MESSAGE` / `RATE_LIMIT` ve kapanış;
  - IP başına en çok 4 bağlantı.
- Derleme özeti: `server/game/buildhash.js` (`shared/**`, `src/config.js`, maç verisi), istemciye derlemede `__BUILD_HASH__` olarak gömülür. `BUILD_CHECK=0` denetimi kapatır (yalnız geliştirme).

## Genel kurallar

- Küçük uçlu (little-endian). `str` = `u8` uzunluk + UTF-8 bayt (en çok 255).
- Bozuk, kısa ya da fazla baytlı ileti istisna fırlatmaz, `null` döner.
- Nicemleme:

| Alan | Tür | Çözünürlük |
|---|---|---|
| yaw | u16 | tam tur / 65536 |
| pitch | i16 | (π/2) / 32767 |
| analog hareket | i8 | 1/127 |
| uzak oyuncu konumu | i16 | 1/64 m (±512 m) |
| uzak oyuncu yatay hızı | i16 | 1/128 m/s |
| yerel oyuncu konum/hız | f32 | kayıpsız (simülasyon zaten 1/1024 m ve 1/256 m/s nicemli) |
| çömelme/nişan oranı | u16 | 1/1024 |

İstemci tahmini komutu gönderilmeden önce aynı nicemlemeden geçirir (`quantizeCmd`): sunucu ile istemci aynı sayılarla yürür.

## İstemci → sunucu

### `0x01 C_HELLO`
`u16 protocolVersion · str buildHash · str token · str room · str primary · str secondary`

- `token`: sosyal katmanın oturum belirteci.
- `room`: 6 karakterlik oda kodu.
- Teçhizat sunucuda doğrulanır: roket ve tanımsız silah yerine `ONLINE.defaultPrimary` / `defaultSecondary`.

### `0x02 C_INPUT`
`u32 ackSnapshotTick · u8 n (1–3) · n × komut` (en eskiden yeniye; son 3 komut, kayıp telafisi)

Komut:
`u16 seq · u16 buttons · i8 moveX · i8 moveY · u16 yaw · i16 pitch · u8 (slot | fireMode<<4) · u32 viewTick×256 · u8 shots · shots × (u16 yaw · i16 pitch)`

- `buttons`: `BTN` (`shared/sim/movement.js`):
  - `RELOAD`: şarjör değiştirme bu komutta başladı.
  - `MELEE`: yakın dövüş isabet anı.
  - `NO_SPRINT` / `NO_ADS`: istemcinin silah durumundan gelen kısıtlar.
- `viewTick`: oyuncunun o an gördüğü sunucu zamanı (tick, kesirli). Gecikme telafisi buna geri sarar; en çok `ONLINE.maxRewindMs`.
- `shots`: bu komuttaki atışların nişan yönü (en çok 4). Saçılmayı ve isabeti sunucu hesaplar.

### `0x03 C_PING`
`f64 clientTime`

### `0x04 C_LOADED` · `0x05 C_LEAVE`
Gövdesiz.

## Sunucu → istemci

### `0x81 S_WELCOME`
`u8 slot · u8 tickRate · u8 snapshotRate · u32 serverTick · f64 serverTime · str room · str mode · str map · u16 timeLimit · u16 scoreLimit · str primary · str secondary`

### `0x82 S_SNAPSHOT` (32 Hz, alıcıya özel, tam görüntü)
Başlık:
`u32 tick · u16 ackSeq · u8 bufDepth · u16 tickUs · u8 phase · u16 phaseLeft×10 · i16 scoreA · i16 scoreB`

Yerel oyuncu:
`u8 flags (1 canlı, 2 kayıt var, 4 korumalı) · u8 hp · u16 respawnIn×10`, kayıt varsa:
`f32 pos×3 · f32 vel×3 · u16 crouchT×1024 · u16 adsT×1024 · f32 sprintOut · u16 buttons · u8 (1 yerde, 2 çömelik, 4 koşuyor)`

Diğer oyuncular:
`u8 n` + her biri `u8 slot · u8 flags (PF) · i16 pos×3 · i16 vel.x · i16 vel.z · u16 yaw · i16 pitch · u8 crouchT×255 · u8 hp · u8 weapon`

Olaylar:
`u8 n` + her biri `u8 tür` + gövde:

| Tür | Gövde | Kime |
|---|---|---|
| `SHOT` 1 | `u8 slot · u8 weapon · i16 end×3 · u8 hit · u8 surface` | atan dışında herkes |
| `HIT` 2 | `u8 victim · u8 dmg · u8 flags (1 kafa, 2 öldürdü, 4 korumalı) · i16 point×3` | atan |
| `DAMAGE` 3 | `u8 attacker · u8 dmg · i16 from.x · i16 from.z` | vurulan |
| `KILL` 4 | `u8 killer (255 dünya) · u8 victim · u8 weapon (254 bıçak) · u8 flags (1 kafa)` | herkes |
| `SPAWN` 5 | `u8 slot · i16 pos×3 · u16 yaw` | herkes |
| `MELEE` 6 / `RELOAD` 7 | `u8 slot` | diğerleri |
| `ROUND` 8 | `u8 code (1 maç başladı, 2 bitti) · u8 value` | herkes |

- `scoreA/scoreB`: taraflı modda mavi/kırmızı. Herkes kendine modunda kendi öldürme sayın ve en iyi rakibinki.
- `weapon`: `WEAPON_ORDER` sırası.

### `0x83 S_ROSTER` (değişince, en sık 4 Hz)
`u8 n` + her biri:
`u8 slot · str id · str name · u16 tag · u8 side (0 mavi, 1 kırmızı, 255 yok) · u8 flags (1 YZ, 2 bağlı) · u16 kills · u16 deaths · u16 score · u16 ping · str party`

### `0x84 S_PONG`
`f64 clientTime · f64 serverTime · u32 serverTick`

### `0x85 S_ERROR`
`u8 code · str detail`

Kodlar:
1. `VERSION_MISMATCH`
2. `BUILD_MISMATCH`
3. `AUTH_FAILED`
4. `ROOM_NOT_FOUND`
5. `ROOM_FULL`
6. `NOT_MEMBER`
7. `BAD_MESSAGE`
8. `RATE_LIMIT`
9. `REPLACED`
10. `ROOM_CLOSED`
11. `TIMEOUT`

Türkçe metinler `src/net/gameClient.js → NET_ERRORS`.

### `0x86 S_MATCH_END`
`u8 winner (taraf ya da yuva; 255 berabere) · u8 reason (1 skor sınırı, 2 süre) · i16 scoreA · i16 scoreB`

## REST (oda açma ve eşleştirme)

| Uç | Gövde | Sonuç |
|---|---|---|
| `POST /api/party/sandbox` | — | Deneme odası. Takımda yalnız lider açar; takım üyelerine sosyal WebSocket'ten `{ t: 'match', match }` gider. |
| `POST /api/match/queue` | `{ mode }` | Takımın tamamı kuyruğa girer. Hatalar: `not_leader`, `bad_mode`, `party_too_big`. Üyelere `{ t: 'queue', queue }`. |
| `POST /api/match/cancel` | — | Takımın araması iptal. |

Eşleşince her üyeye `{ t: 'match', match: { room, kind, mode, map, side } }` gider.
