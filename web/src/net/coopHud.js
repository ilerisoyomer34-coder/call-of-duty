// Kampanya Co-op'u arayüzü (matchHud.js kurar; kurallar shared/sim/coop.js, sunucu server/game/coop.js):
//   - Skor çubuğunun altında görev satırı: "AŞAMA 2/5 · Uçaksavar toplarını C4 ile imha et · kalan 2".
//   - Dünyada hedef işaretleri: temizlenecek bölgenin ve varılacak noktanın halkası, C4/istihbarat hedeflerinin
//     küçük halkası ve üstünde uzaklıklı etiket (bitenler kalkar); radarda aynı hedefler.
//   - Hedefin dibinde E basılıyken ilerleme çubuğu (#mhAct, sunucunun saydığı), aşama bitince ve yeni hedefte bant.
// Veri game.net.coop (NEV.COOP → EV.NET_COOP) ve data/coop.json (aşamaların metni ve yerleri).
import * as THREE from 'three';
import { EV } from '../events.js';
import { COOP_LEVELS, COOP_STATE, ACT_HOLD } from '../../shared/sim/coop.js';
import { COMP_VIEW } from '../config.js';

const $ = (id) => document.getElementById(id);
const _v = new THREE.Vector3();
const HOLD_LABEL = { aa: 'C4 KURULUYOR · hareket etme', intel: 'İSTİHBARAT ALINIYOR · hareket etme' };

export class CoopHud {
  constructor(game, matchHud) {
    this.game = game;
    this.mh = matchHud;
    this.net = null;
    this.group = null;
    this.tags = [];
    game.events.on(EV.NET_COOP, (c) => this.onCoop(c));
  }

  get active() {
    return !!this.net;
  }

  get level() {
    return this.net ? COOP_LEVELS[String(this.net.coop.level)] : null;
  }

  levelName(id) {
    const L = COOP_LEVELS[String(id)];
    return L ? `${L.name}` : '';
  }

  start(net) {
    this.stop();
    this.net = net.coop ? net : null;
    document.body.classList.toggle('coop', !!this.net);
    $('mhCoop').hidden = !this.net;
    if (!this.net) return;
    this.group = new THREE.Group();
    this.ringMat = new THREE.MeshBasicMaterial({ color: COMP_VIEW.siteColor, transparent: true, opacity: COMP_VIEW.ringOpacity, depthWrite: false, side: THREE.DoubleSide });
    this.game.scene.add(this.group);
    this.shownStage = -2;
    this.render();
  }

  stop() {
    if (this.group) {
      this.clearRings();
      this.group.removeFromParent();
      this.ringMat.dispose();
    }
    this.group = null;
    for (const t of this.tags) t.remove();
    this.tags = [];
    this.net = null;
    document.body.classList.remove('coop');
    $('mhCoop').hidden = true;
  }

  clearRings() {
    for (const m of [...this.group.children]) {
      m.geometry.dispose();
      m.removeFromParent();
    }
  }

  ring(x, z, r) {
    const m = new THREE.Mesh(new THREE.RingGeometry(Math.max(0.3, r - COMP_VIEW.ringWidth), r, 48), this.ringMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, COMP_VIEW.lift, z);
    m.renderOrder = 2;
    this.group.add(m);
  }

  // Hedefler: aşamanın türüne göre (bitmiş hold hedefi gösterilmez)
  targets() {
    const C = this.net?.coop;
    const st = this.level?.stages[C?.stage];
    if (!st || C.state === COOP_STATE.COMPLETE || C.state === COOP_STATE.FAILED) return [];
    if (st.type === 'hold') return st.targets.map((t, k) => ({ x: t[0], z: t[1], r: 1.6, done: !!(C.mask & (1 << k)) })).filter((t) => !t.done);
    return [{ x: st.pos[0], z: st.pos[1], r: st.r }];
  }

  render() {
    const C = this.net.coop;
    const L = this.level;
    const st = L?.stages[C.stage];
    if (this.group) {
      this.clearRings();
      for (const t of this.targets()) this.ring(t.x, t.z, t.r);
    }
    if (!st || C.stage < 0) {
      $('mhCoopStage').textContent = 'HAZIRLIK';
      $('mhCoopText').textContent = L ? `${L.name} · takım toplanıyor` : '';
      return;
    }
    if (C.state === COOP_STATE.COMPLETE || C.state === COOP_STATE.FAILED) {
      $('mhCoopStage').textContent = C.state === COOP_STATE.COMPLETE ? 'GÖREV TAMAM' : 'GÖREV BAŞARISIZ';
      $('mhCoopText').textContent = L.name;
      return;
    }
    const left = st.type === 'clear' ? ` · kalan ${C.left}` : st.type === 'hold' ? ` · kalan ${C.left}` : st.type === 'defend' ? ` · ${C.left} sn` : '';
    $('mhCoopStage').textContent = `AŞAMA ${C.stage + 1}/${L.stages.length}`;
    $('mhCoopText').textContent = `${st.text}${left}`;
  }

  onCoop(c) {
    if (!this.net) return;
    const L = this.level;
    if (c.state === COOP_STATE.FAILED) this.mh.banner('GÖREV BAŞARISIZ · süre doldu', 3, 'lose');
    else if (c.state === COOP_STATE.COMPLETE) this.mh.banner('GÖREV TAMAM · takım tahliye edildi', 3, 'win');
    else if (c.state === COOP_STATE.DONE) this.mh.banner(`AŞAMA TAMAM · ${L?.stages[c.stage]?.text || ''}`, 2.2, 'win');
    else if (c.state === COOP_STATE.ACTIVE && c.stage !== this.shownStage) {
      this.shownStage = c.stage;
      const st = L?.stages[c.stage];
      if (st) this.mh.banner(`YENİ HEDEF · ${st.text}`, 2.6);
    }
    this.render();
  }

  update() {
    const net = this.net;
    if (!net) return;
    const C = net.coop;
    const st = this.level?.stages[C.stage];
    const act = this.game.player.alive && C.act === ACT_HOLD;
    $('mhAct').hidden = !act;
    if (act) {
      $('mhActLabel').textContent = HOLD_LABEL[st?.id] || 'HEDEF · hareket etme';
      $('mhActBar').style.width = `${Math.round(C.actProgress * 100)}%`;
    }
  }

  // Hedef etiketleri: uzaklıkla (duvar ardında da)
  updateTags(hud, width, height) {
    if (!this.net) return;
    const P = this.game.player;
    const list = this.targets();
    list.forEach((t, i) => {
      let el = this.tags[i];
      if (!el) {
        el = document.createElement('div');
        el.className = 'siteTag coopTag';
        el.innerHTML = '<b></b><small></small>';
        hud.el.icons.appendChild(el);
        this.tags[i] = el;
      }
      _v.set(t.x, COMP_VIEW.tagHeight, t.z);
      const s = hud.project(_v, {});
      if (s.behind || s.x < 0 || s.x > width || s.y < 0 || s.y > height) {
        el.hidden = true;
        return;
      }
      el.hidden = false;
      el.firstChild.textContent = 'HEDEF';
      el.lastChild.textContent = `${Math.round(Math.hypot(t.x - P.pos.x, t.z - P.pos.z))} m`;
      el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
    });
    for (let i = list.length; i < this.tags.length; i++) this.tags[i].hidden = true;
  }

  // Radar: hedefler sarı halka (menzil dışındaysa kenarda)
  drawRadar(ctx, toMap, R) {
    if (!this.net) return;
    const lim = R - 12;
    ctx.strokeStyle = '#ffc04a';
    ctx.lineWidth = 2.5;
    for (const t of this.targets()) {
      let [mx, mz] = toMap(t.x, t.z);
      const d = Math.hypot(mx, mz);
      if (d > lim) {
        mx = (mx / d) * lim;
        mz = (mz / d) * lim;
      }
      ctx.beginPath();
      ctx.arc(mx, mz, 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
