// Geliştirici konsolu (UShooterCheatManager + CVar karşılığı). ` veya F10 ile açılır.
import * as THREE from 'three';
import { WEAPON_ORDER, LEVELS, ALLY_TIERS, BALANCE } from './config.js';
import { HeavyNest } from './hmg.js';
import { formatKR } from './economy.js';
import { ArmorLoadout, ARMOR_DEFS } from './armor.js';
import { CONSUMABLES } from './loadout.js';
import { levelMission, RULES } from './missionSystem.js';
import { COMMANDS } from './commands.js';

const HELP = `Komutlar:
  god                 ölümsüzlük aç/kapa
  ammo                sonsuz cephane aç/kapa
  giveall             tüm silahlar ve tam cephane
  spawn <n> [tür]     önüne n düşman (rifleman|shotgunner|heavy|sniper)
  killall             tüm düşmanları etkisiz bırak
  timescale <x>       zaman ölçeği (0.1–3)
  ai                  yapay zekâyı dondur/çöz
  debug ai            düşman durumlarını konsola yaz
  cp <n>              seviyenin n. hedefine atla
  level <n>           n. seviyeyi başlat (kilidi de açar)
  nest                önüne, sana bakan bir ağır makineli yuvası kur (kum torbasız)
  tier <n>            mangayı n. kademeyle (1 Er … 5 Komando) yeniden kur
  unlock              tüm seviyelerin kilidini aç
  debug allies        dost asker durumlarını yaz
  fps                 FPS göstergesi
  credits [n|set n]   kredi ekle (eksi: harca) ya da bakiyeyi ayarla; boş: bakiyeyi yaz
  econlog             son kredi hareketleri
  armor <yelek|none> [kask|none]   zırh kuşan (ör. armor armor_plate helmet_tactical), satın almış sayılır
  armorfill           zırhı doldur; armor yazınca kuşanılanı gösterir
  give <sarf> [n]     envantere sarf malzemesi ekle (plate_pack, medkit, adrenaline, smoke, frag)
  missions [complete|reset]  bonus görev durumu; tümünü 3 yıldızla tamamla / sıfırla
  down                oyuncuyu yere düşür; aiscores: askerlerin yardım puanı ve kararı
  cmd <KOMUT> [alfa-n|all]   tim komutu (FOLLOW, HOLD, MOVE_TO, ATTACK, SUPPRESS, TAKE_COVER, HEAL_PLAYER, HOLD_FIRE, FREE_FIRE, CLEAR_AREA)
  chat <cümle>        Türkçe cümleyi ayrıştırıcıdan geçir ve komut olarak ver ("chat kaya beni iyileştir")
  dmgpanel            hasar paneli: son 10 sn'deki isabetler (kaynak, mesafe, zırh, can); ttd: yere düşme süreleri
  save                kayıt özeti (sürüm, kredi, envanter, teçhizat)
  resetsave           kaydı sıfırla (kredi, envanter, ilerleme) ve sayfayı yenile
  clear               konsolu temizle`;

export class DevConsole {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('console');
    this.log = document.getElementById('consoleLog');
    this.input = document.getElementById('consoleInput');
    this.open = false;
    this.history = [];
    this.hIdx = 0;
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const cmd = this.input.value.trim();
        this.input.value = '';
        if (cmd) {
          this.history.push(cmd);
          this.hIdx = this.history.length;
          this.print(`> ${cmd}`);
          this.run(cmd);
        }
      } else if (e.key === 'Escape' || e.key === '`' || e.key === 'F10') {
        e.preventDefault();
        this.toggle(false);
      } else if (e.key === 'ArrowUp') {
        this.hIdx = Math.max(0, this.hIdx - 1);
        this.input.value = this.history[this.hIdx] || '';
      } else if (e.key === 'ArrowDown') {
        this.hIdx = Math.min(this.history.length, this.hIdx + 1);
        this.input.value = this.history[this.hIdx] || '';
      }
    });
    this.print('Demir Şafak geliştirici konsolu. "help" yaz.');
  }

  toggle(on = !this.open) {
    this.open = on;
    this.el.hidden = !on;
    const g = this.game;
    if (on) {
      g.input.exitLock();
      setTimeout(() => this.input.focus(), 10);
    } else {
      this.input.blur();
      if (g.state === 'playing') g.input.requestLock();
    }
  }

  print(text) {
    this.log.textContent += `${text}\n`;
    this.log.scrollTop = this.log.scrollHeight;
  }

  run(line) {
    const g = this.game;
    const [cmd, ...args] = line.split(/\s+/);
    const C = g.cheats;
    switch (cmd.toLowerCase()) {
      case 'help':
        this.print(HELP);
        break;
      case 'god':
        C.god = !C.god;
        this.print(`Ölümsüzlük: ${C.god ? 'AÇIK' : 'KAPALI'}`);
        break;
      case 'ammo':
      case 'infiniteammo':
        C.infiniteAmmo = !C.infiniteAmmo;
        g.events.emit('ammo', g.weapons.current);
        this.print(`Sonsuz cephane: ${C.infiniteAmmo ? 'AÇIK' : 'KAPALI'}`);
        break;
      case 'giveall':
        for (const id of WEAPON_ORDER) g.weapons.give(id, true);
        g.weapons.refill();
        this.print('Tüm silahlar verildi.');
        break;
      case 'spawn': {
        const n = Math.min(12, parseInt(args[0] || '1', 10) || 1);
        const type = args[1] || 'rifleman';
        const P = g.player;
        for (let i = 0; i < n; i++) {
          const fwd = new THREE.Vector3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
          const pos = P.pos.clone().addScaledVector(fwd, 14 + i * 1.5).add(new THREE.Vector3((i % 3 - 1) * 2, 0, 0));
          const p = g.nav.randomPointNear(pos, 3) || pos;
          g.enemies.spawn({ type, pos: p, yaw: P.yaw + Math.PI, group: 'debug' });
        }
        this.print(`${n} × ${type} oluşturuldu.`);
        break;
      }
      case 'killall':
        g.enemies.killAll();
        this.print('Tüm düşmanlar etkisiz.');
        break;
      case 'timescale': {
        const v = Math.max(0.1, Math.min(3, parseFloat(args[0]) || 1));
        g.timeScale = v;
        this.print(`Zaman ölçeği: ${v}`);
        break;
      }
      case 'ai':
      case 'toggleai':
        C.aiOff = !C.aiOff;
        this.print(`Yapay zekâ: ${C.aiOff ? 'DONDURULDU' : 'AKTİF'}`);
        break;
      case 'unlock':
        g.unlockAllLevels();
        this.print('Tüm seviyeler açıldı.');
        break;
      case 'level': {
        const n = parseInt(args[0], 10);
        const L = LEVELS.find((l) => l.id === n);
        if (!L) {
          this.print(`Seviye 1–${LEVELS.length} arasında olmalı.`);
          break;
        }
        g.progress.unlocked = Math.max(g.progress.unlocked, n);
        this.toggle();
        g.startMode('mission', g.difficultyKey, n);
        break;
      }
      case 'nest': {
        if (g.mode !== 'mission') {
          this.print('Yalnızca görevde.');
          break;
        }
        const P = g.player;
        const fwd = new THREE.Vector3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
        const pos = P.pos.clone().addScaledVector(fwd, 18).setY(0);
        const M = g.mission;
        M.nests = M.nests || [];
        M.nests.push(new HeavyNest(g, { pos, yaw: P.yaw + Math.PI, group: 'debug' }, M.nests.length));
        this.print('Ağır makineli yuvası kuruldu (18 m önünde).');
        break;
      }
      case 'tier': {
        const n = parseInt(args[0], 10);
        if (!ALLY_TIERS[n] || g.mode !== 'mission') {
          this.print('Kullanım: tier 1–5 (görevde)');
          break;
        }
        g.allies.spawnSquad(g.allies.list.length || 3, g.player.pos, g.player.yaw, n);
        this.print(`Manga kademesi: ${ALLY_TIERS[n].rank} (${ALLY_TIERS[n].tactics.join(', ') || 'temel'})`);
        break;
      }
      case 'debug':
        if (args[0] === 'allies') {
          for (const a of g.allies.list) {
            this.print(`${a.rankName} can=${Math.round(a.health.hp)} yaralı=${a.down} hedef=${a.target?.id || '-'} görüyor=${a.targetVisible} mesafe=${a.pos.distanceTo(g.player.pos).toFixed(1)}m`);
          }
          break;
        }
        if (args[0] === 'ai') {
          for (const e of g.enemies.list) {
            if (!e.alive) continue;
            this.print(`${e.id} ${e.type} durum=${e.aiState} farkındalık=${e.awareness.toFixed(2)} görüyor=${e.visible} mesafe=${e.pos.distanceTo(g.player.pos).toFixed(1)}m`);
          }
        } else this.print('Kullanım: debug ai | debug allies');
        break;
      case 'cp': {
        const n = parseInt(args[0], 10);
        if (g.mission && g.mode === 'mission' && n >= 1) {
          g.debugSkipTo(n);
          this.print(`${n}. hedefe atlandı.`);
        }
        break;
      }
      case 'fps':
        g.settings.showFps = !g.settings.showFps;
        g.applySettings();
        break;
      case 'credits': {
        const E = g.economy;
        if (args[0] === 'set') E.set(parseInt(args[1], 10) || 0, 'konsol');
        else if (args[0]) {
          const n = parseInt(args[0], 10) || 0;
          if (n >= 0) E.add(n, 'konsol');
          else if (!E.spend(-n, 'konsol')) this.print('Yetersiz kredi.');
        }
        this.print(`Kredi: ${formatKR(E.credits)}`);
        break;
      }
      case 'armor': {
        const ids = [...ARMOR_DEFS.keys()];
        if (!args.length) {
          const a = g.player.armor;
          this.print(`Yelek: ${a.body ? `${a.body.def.name} ${a.body.points.toFixed(1)}/${a.body.max}` : 'yok'} · Kask: ${a.helmet ? `${a.helmet.def.name} ${a.helmet.points.toFixed(1)}/${a.helmet.max}` : 'yok'}`);
          this.print(`Seçenekler: ${ids.join(', ')}, none`);
          break;
        }
        const pick = (v, slot) => (v === 'none' ? null : ARMOR_DEFS.get(v)?.slot === slot ? v : undefined);
        const body = pick(args[0], 'body');
        const helmet = args[1] !== undefined ? pick(args[1], 'helmet') : g.save.data.loadout.helmet;
        if (body === undefined || helmet === undefined) {
          this.print(`Bilinmeyen zırh. Seçenekler: ${ids.join(', ')}, none`);
          break;
        }
        g.save.update((d) => {
          d.loadout.armor = body;
          d.loadout.helmet = helmet;
          for (const [id, list] of [[body, d.inventory.armor], [helmet, d.inventory.helmets]]) if (id && !list.includes(id)) list.push(id);
        }, { now: true });
        g.player.armor = new ArmorLoadout(body, helmet);
        g.events.emit('armor', g.player.armor);
        this.print(`Kuşanıldı: ${body || 'yeleksiz'} / ${helmet || 'kasksız'}`);
        break;
      }
      case 'give': {
        // give <sarf kimliği> [adet]: envantere ekler (görevdeyse yuvalar da dolar)
        const id = args[0];
        const n = Math.max(1, parseInt(args[1] || '1', 10) || 1);
        if (!CONSUMABLES.has(id)) {
          this.print(`Kimlikler: ${[...CONSUMABLES.keys()].join(', ')}`);
          break;
        }
        g.save.update((d) => (d.inventory.consumables[id] = (d.inventory.consumables[id] || 0) + n), { now: true });
        for (const s of g.kit.slots) if (s?.id === id) s.left = Math.min(s.def.maxStack, s.left + n);
        if (id === 'frag') g.weapons.kitFrags = g.kit.count('frag');
        g.kit.emit();
        this.print(`${id}: envanterde ${g.save.data.inventory.consumables[id]}`);
        break;
      }
      case 'down': {
        // Oyuncuyu yere düşür (Modül D denemesi)
        if (g.player.down || !g.player.alive) break;
        g.player.health.hp = 0;
        g.player.goDown();
        this.print(`Yerde: kan kaybı ${g.player.bleed.total.toFixed(1)} sn (${g.stats.downs}. düşüş)`);
        break;
      }
      case 'aiscores': {
        // Askerlerin yardım puanı ve kararı (her 0,5 sn güncellenir)
        for (const a of g.allies.list) this.print(`${a.callsign}: ${a.assist ? `${a.assist.score.toFixed(0)} → ${a.assist.decision}` : a.dead ? 'öldü' : a.down ? 'yerde' : '-'}`);
        this.print(`Karar: ${g.allies.rescue.decision}${g.allies.rescue.reviver ? ` · canlandıran ${g.allies.rescue.reviver.callsign}` : ''}`);
        break;
      }
      case 'cmd': {
        // cmd <KOMUT> [all|alfa-1|alfa-2|alfa-3]: tim komutu ver (hedef/nokta nişangâhtan)
        const id = (args[0] || '').toUpperCase();
        const who = args[1] && args[1].toLowerCase() !== 'all' ? args[1].replace(/^alfa-?/i, 'Alfa-') : 'all';
        const c = g.commands.issue(id, who, { inputMethod: 'console' });
        this.print(c ? `${id} → ${c.addressees.join(', ')}` : `Verilemedi (komutlar: ${Object.keys(COMMANDS).join(', ')})`);
        break;
      }
      case 'dmgpanel':
        g.debugDmg = !g.debugDmg;
        this.print(`Hasar paneli ${g.debugDmg ? 'açık' : 'kapalı'}`);
        break;
      case 'ttd': {
        // Yere düşme süresi (§10): bu görev ve kayıttaki son örnekler
        const T = g.stats.ttd || [];
        const S = g.save.data.stats;
        this.print(`Bu görev: ${T.length ? T.map((v) => `${v} sn`).join(', ') : 'yok'}`);
        this.print(`Kayıt: ort. ${S.ttdAvg ?? '—'} sn (${(S.ttdSamples || []).length} örnek) · hedef tek düşman ≥ ${BALANCE.ttdTarget.one} sn, iki ≥ ${BALANCE.ttdTarget.two} sn`);
        break;
      }
      case 'chat': {
        // Yazılı komutu konsoldan dene: ayrıştırma sonucu yazdırılır, komut telsiz kutusunda görünür
        const text = args.join(' ');
        const r = g.chat.submit(text);
        this.print(r ? `${r.commandId} → ${Array.isArray(r.addressees) ? r.addressees.join(', ') : r.addressees}${r.target ? ' · nişangâh' : ''}${r.dir ? ` · saat ${r.dir.clock}` : ''} (puan ${r.score.toFixed(2)})` : 'Boş cümle');
        break;
      }
      case 'missions': {
        // missions [complete|reset]: bonus görev durumu, hepsini tamamla (3 yıldız) ya da sıfırla
        const sub = (args[0] || '').toLowerCase();
        if (sub === 'complete') {
          g.save.update((d) => {
            for (const L of LEVELS) {
              const m = levelMission(L.id);
              d.missions[String(L.id)] = { completed: true, stars: RULES.starsForBonuses.length, bonusDone: m.bonus.map((b) => b.id), bestTimeSec: m.parTimeSec, plays: 1 };
            }
          }, { now: true });
          g.unlockAllLevels();
          this.print('Tüm görevler 3 yıldızla tamamlandı, seviyeler açık.');
        } else if (sub === 'reset') {
          g.save.update((d) => (d.missions = {}), { now: true });
          this.print('Görev ilerlemesi sıfırlandı.');
        } else if (g.run) {
          g.run.mission.bonus.forEach((b, i) => {
            const st = g.run.tracker.state[i];
            this.print(`${b.name}: ${b.type} ${st.progress}/${b.count ?? '-'}${st.done ? ' ✔' : ''}${st.failed ? ' ✖' : ''}`);
          });
        } else this.print(`Kayıt: ${JSON.stringify(g.save.data.missions)}`);
        break;
      }
      case 'armorfill':
        g.player.armor.refill();
        g.events.emit('armor', g.player.armor);
        this.print('Zırh dolduruldu.');
        break;
      case 'econlog': {
        const log = g.economy.log.slice(-10);
        if (!log.length) this.print('Kredi hareketi yok.');
        for (const e of log) this.print(`${new Date(e.t).toLocaleTimeString('tr-TR')}  ${e.delta >= 0 ? '+' : ''}${e.delta}  ${e.reason || '—'}  → ${formatKR(e.balance)}`);
        break;
      }
      case 'save': {
        const d = g.save.data;
        this.print(`Kayıt sürüm ${d.version} · ${formatKR(d.credits)} · açık seviye ${d.progress.unlocked}`);
        this.print(`Envanter: ${JSON.stringify(d.inventory)}`);
        this.print(`Teçhizat: ${JSON.stringify(d.loadout)}`);
        break;
      }
      case 'resetsave':
        g.save.reset();
        this.print('Kayıt sıfırlandı, sayfa yenileniyor…');
        setTimeout(() => location.reload(), 600);
        break;
      case 'clear':
        this.log.textContent = '';
        break;
      default:
        this.print(`Bilinmeyen komut: ${cmd}`);
    }
  }
}
