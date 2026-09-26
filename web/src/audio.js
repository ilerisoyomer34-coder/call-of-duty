// Web Audio ile sentezlenen tüm sesler: silahlar, adımlar, çarpmalar, patlamalar, arayüz, ortam.
// Harici ses dosyası yok. Ses sınıfı hiyerarşisi: master > sfx / ambient / ui.
import { clamp, rand } from './util.js';

export class Audio {
  constructor() {
    this.ctx = null;
    this.voices = 0;
    this.maxVoices = 28;
    this.listener = { x: 0, y: 0, z: 0, yaw: 0 };
    this.volumes = { master: 0.8, sfx: 1, ambient: 0.6, ui: 0.8 };
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const ctx = this.ctx;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 10;
    this.comp.ratio.value = 5;
    this.comp.attack.value = 0.002;
    this.comp.release.value = 0.2;
    this.master = ctx.createGain();
    this.master.connect(this.comp);
    this.comp.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.amb = ctx.createGain();
    this.amb.connect(this.master);
    this.ui = ctx.createGain();
    this.ui.connect(this.master);
    // Kısa "yankı": dış mekân slapback'i için geri beslemeli gecikme
    this.verbIn = ctx.createGain();
    this.verbIn.gain.value = 0.35;
    const d1 = ctx.createDelay(1);
    d1.delayTime.value = 0.11;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    this.verbIn.connect(d1);
    d1.connect(lp);
    lp.connect(fb);
    fb.connect(d1);
    lp.connect(this.sfx);
    // Paylaşılan beyaz gürültü tamponu
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.applyVolumes();
  }

  setVolumes(v) {
    Object.assign(this.volumes, v);
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.sfx.gain.value = this.volumes.sfx;
    this.amb.gain.value = this.volumes.ambient;
    this.ui.gain.value = this.volumes.ui;
  }

  get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  setListener(x, y, z, yaw) {
    const L = this.listener;
    L.x = x;
    L.y = y;
    L.z = z;
    L.yaw = yaw;
  }

  // Konumdan kazanç ve stereo pan hesapla.
  spatial(pos, refDist = 6, maxDist = 120) {
    if (!pos) return { gain: 1, pan: 0, dist: 0 };
    const L = this.listener;
    const dx = pos.x - L.x;
    const dz = pos.z - L.z;
    const dy = pos.y - L.y;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    // Dinleyicinin sağ vektörü: yaw=0 → +X
    const rx = Math.cos(L.yaw);
    const rz = -Math.sin(L.yaw);
    const pan = dist > 0.5 ? clamp((dx * rx + dz * rz) / dist, -1, 1) * 0.85 : 0;
    const gain = dist <= refDist ? 1 : Math.max(0, refDist / dist) * (1 - clamp((dist - maxDist) / 20, 0, 1));
    return { gain, pan, dist };
  }

  out(pan, bus) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      p.connect(bus || this.sfx);
    } else g.connect(bus || this.sfx);
    return g;
  }

  voice(dur) {
    if (this.voices >= this.maxVoices) return false;
    this.voices++;
    setTimeout(() => this.voices--, dur * 1000 + 50);
    return true;
  }

  noiseBurst(dest, t, dur, { type = 'bandpass', freq = 1000, q = 1, gain = 1, attack = 0.001, freqEnd = null, rate = 1 } = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = rate;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
    return g;
  }

  tone(dest, t, dur, { type = 'sine', freq = 440, freqEnd = null, gain = 0.5, attack = 0.002 } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    return g;
  }

  // Silah atışı. profile: rifle/pistol/shotgun/enemyRifle/enemyShotgun/enemyLmg/sniper
  gunshot(profile, pos = null) {
    if (!this.ctx) return;
    const sp = this.spatial(pos, 8, 220);
    if (sp.gain < 0.01) return;
    if (!this.voice(0.8)) return;
    const P = GUN_PROFILES[profile] || GUN_PROFILES.rifle;
    // Uzak atışlar: ses hızı gecikmesi, tiz kaybı
    const far = clamp(sp.dist / 90, 0, 1);
    const t = this.now + (pos ? Math.min(0.4, sp.dist / 343) : 0);
    const dest = this.out(sp.pan);
    dest.gain.value = sp.gain * P.vol;
    const crackGain = (1 - far * 0.85) * P.crack;
    if (crackGain > 0.02)
      this.noiseBurst(dest, t, P.crackDur, { type: 'highpass', freq: P.crackFreq * rand(0.9, 1.1), q: 0.7, gain: crackGain });
    this.noiseBurst(dest, t, P.bodyDur, {
      type: 'lowpass', freq: (P.bodyFreq * (1 - far * 0.6)) * rand(0.9, 1.1), freqEnd: 200, q: 1.2, gain: P.body,
    });
    this.tone(dest, t, P.thumpDur, { type: 'sine', freq: P.thump, freqEnd: 38, gain: P.thumpGain * (1 - far * 0.5) });
    const tail = this.noiseBurst(dest, t + 0.01, P.tail * (1 + far), { type: 'lowpass', freq: 700 - far * 300, gain: P.tailGain, attack: 0.02 });
    tail.connect(this.verbIn);
    if (P.mech && !pos) this.noiseBurst(dest, t + 0.03, 0.03, { type: 'bandpass', freq: 3500, q: 4, gain: P.mech });
  }

  // Oyuncunun yanından geçen mermi vızıltısı
  whiz(pan = 0) {
    if (!this.ctx || !this.voice(0.2)) return;
    const t = this.now;
    const dest = this.out(pan);
    dest.gain.value = 0.55;
    this.noiseBurst(dest, t, 0.14, { type: 'bandpass', freq: 5200, freqEnd: 1200, q: 3, gain: 0.8, attack: 0.01 });
    this.noiseBurst(dest, t, 0.03, { type: 'highpass', freq: 3000, gain: 0.5 });
  }

  impact(surface, pos) {
    if (!this.ctx) return;
    const sp = this.spatial(pos, 3, 50);
    if (sp.gain < 0.03 || !this.voice(0.3)) return;
    const t = this.now;
    const dest = this.out(sp.pan);
    dest.gain.value = sp.gain * 0.6;
    switch (surface) {
      case 'metal':
        this.tone(dest, t, 0.25, { type: 'triangle', freq: rand(1800, 3200), freqEnd: rand(1200, 2000), gain: 0.35 });
        this.noiseBurst(dest, t, 0.05, { type: 'highpass', freq: 3000, gain: 0.6 });
        break;
      case 'wood':
        this.noiseBurst(dest, t, 0.08, { type: 'bandpass', freq: 600, q: 2, gain: 0.8 });
        this.tone(dest, t, 0.06, { freq: 220, freqEnd: 120, gain: 0.4 });
        break;
      case 'flesh':
        this.noiseBurst(dest, t, 0.09, { type: 'lowpass', freq: 500, gain: 0.9 });
        this.tone(dest, t, 0.08, { freq: 140, freqEnd: 60, gain: 0.6 });
        break;
      default:
        this.noiseBurst(dest, t, 0.07, { type: 'bandpass', freq: rand(1400, 2400), q: 1.2, gain: 0.7 });
        this.noiseBurst(dest, t, 0.12, { type: 'lowpass', freq: 400, gain: 0.3, attack: 0.01 });
    }
  }

  footstep(surface, intensity = 1, pos = null) {
    if (!this.ctx) return;
    const sp = this.spatial(pos, 2, 30);
    if (sp.gain < 0.03 || !this.voice(0.2)) return;
    const t = this.now;
    const dest = this.out(sp.pan);
    dest.gain.value = sp.gain * intensity * 0.45;
    switch (surface) {
      case 'metal':
        this.noiseBurst(dest, t, 0.09, { type: 'bandpass', freq: rand(900, 1300), q: 6, gain: 0.8 });
        this.tone(dest, t, 0.12, { type: 'triangle', freq: rand(300, 380), gain: 0.2 });
        break;
      case 'wood':
        this.noiseBurst(dest, t, 0.07, { type: 'lowpass', freq: 700, gain: 0.9 });
        this.tone(dest, t, 0.06, { freq: 110, gain: 0.35 });
        break;
      case 'concrete':
        this.noiseBurst(dest, t, 0.05, { type: 'bandpass', freq: rand(1800, 2600), q: 1.5, gain: 0.7 });
        this.noiseBurst(dest, t, 0.06, { type: 'lowpass', freq: 300, gain: 0.5 });
        break;
      default:
        // kum: hışırtılı ezilme
        this.noiseBurst(dest, t, 0.13, { type: 'bandpass', freq: rand(2500, 3800), q: 0.8, gain: 0.45, attack: 0.015 });
        this.noiseBurst(dest, t, 0.07, { type: 'lowpass', freq: 260, gain: 0.5 });
    }
  }

  land(intensity = 1) {
    if (!this.ctx) return;
    const t = this.now;
    const dest = this.out(0);
    dest.gain.value = 0.5 * intensity;
    this.noiseBurst(dest, t, 0.15, { type: 'lowpass', freq: 400, gain: 0.9 });
    this.noiseBurst(dest, t, 0.1, { type: 'bandpass', freq: 2500, gain: 0.3 });
  }

  explosion(pos, big = 1) {
    if (!this.ctx) return;
    const sp = this.spatial(pos, 15, 400);
    const far = clamp(sp.dist / 150, 0, 1);
    const t = this.now + Math.min(0.6, sp.dist / 343);
    const dest = this.out(sp.pan * 0.6);
    dest.gain.value = Math.max(0.08, sp.gain) * 1.1 * big;
    this.noiseBurst(dest, t, 1.8 * big, { type: 'lowpass', freq: 3500 * (1 - far * 0.8), freqEnd: 120, q: 0.8, gain: 1, attack: 0.004 });
    this.tone(dest, t, 1.0, { freq: 70, freqEnd: 25, gain: 1 });
    if (far < 0.5) this.noiseBurst(dest, t, 0.25, { type: 'highpass', freq: 2000, gain: 0.5 * (1 - far * 2) });
    const tail = this.noiseBurst(dest, t + 0.05, 2.5, { type: 'lowpass', freq: 500, gain: 0.35, attack: 0.08 });
    tail.connect(this.verbIn);
    // Enkaz tıkırtıları
    if (far < 0.4)
      for (let i = 0; i < 5; i++)
        this.noiseBurst(dest, t + 0.4 + Math.random() * 0.9, 0.05, { type: 'bandpass', freq: rand(1500, 4000), q: 2, gain: 0.2 });
  }

  // Tüfek/tabanca reload parçaları
  mech(kind, pos = null) {
    if (!this.ctx) return;
    const sp = this.spatial(pos, 3, 25);
    const t = this.now;
    const dest = this.out(sp.pan);
    dest.gain.value = 0.5 * sp.gain;
    switch (kind) {
      case 'magOut':
        this.noiseBurst(dest, t, 0.05, { type: 'bandpass', freq: 2200, q: 3, gain: 0.6 });
        this.noiseBurst(dest, t + 0.03, 0.12, { type: 'bandpass', freq: 900, q: 1, gain: 0.3, attack: 0.02 });
        break;
      case 'magIn':
        this.noiseBurst(dest, t, 0.06, { type: 'bandpass', freq: 1600, q: 2, gain: 0.7 });
        this.tone(dest, t, 0.05, { freq: 180, gain: 0.4 });
        this.noiseBurst(dest, t + 0.06, 0.03, { type: 'bandpass', freq: 3500, q: 5, gain: 0.5 });
        break;
      case 'bolt':
        this.noiseBurst(dest, t, 0.05, { type: 'bandpass', freq: 2800, q: 3, gain: 0.7 });
        this.noiseBurst(dest, t + 0.12, 0.06, { type: 'bandpass', freq: 2000, q: 3, gain: 0.8 });
        this.tone(dest, t + 0.12, 0.05, { freq: 240, gain: 0.3 });
        break;
      case 'pump':
        this.noiseBurst(dest, t, 0.09, { type: 'bandpass', freq: 1300, q: 2, gain: 0.8, attack: 0.01 });
        this.noiseBurst(dest, t + 0.13, 0.08, { type: 'bandpass', freq: 1700, q: 2, gain: 0.9, attack: 0.01 });
        this.tone(dest, t + 0.2, 0.04, { freq: 300, gain: 0.3 });
        break;
      case 'shell':
        this.noiseBurst(dest, t, 0.05, { type: 'bandpass', freq: 2400, q: 3, gain: 0.5 });
        this.tone(dest, t + 0.03, 0.05, { freq: 200, gain: 0.3 });
        break;
      case 'dry':
        this.noiseBurst(dest, t, 0.025, { type: 'bandpass', freq: 3000, q: 6, gain: 0.8 });
        break;
      case 'switch':
        this.noiseBurst(dest, t, 0.03, { type: 'bandpass', freq: 2600, q: 4, gain: 0.6 });
        this.noiseBurst(dest, t + 0.05, 0.03, { type: 'bandpass', freq: 2000, q: 4, gain: 0.5 });
        break;
      case 'equip':
        this.noiseBurst(dest, t, 0.18, { type: 'bandpass', freq: 800, q: 0.7, gain: 0.35, attack: 0.04 });
        this.noiseBurst(dest, t + 0.15, 0.04, { type: 'bandpass', freq: 2400, q: 3, gain: 0.5 });
        break;
      case 'pin':
        this.tone(dest, t, 0.08, { type: 'triangle', freq: 2400, gain: 0.3 });
        this.noiseBurst(dest, t + 0.02, 0.04, { type: 'bandpass', freq: 3000, q: 3, gain: 0.4 });
        break;
      case 'melee':
        this.noiseBurst(dest, t, 0.16, { type: 'bandpass', freq: 1500, freqEnd: 400, q: 1, gain: 0.5, attack: 0.03 });
        break;
      case 'shellDrop':
        this.tone(dest, t, 0.08, { type: 'triangle', freq: rand(3200, 4200), gain: 0.12 });
        this.tone(dest, t + 0.09, 0.06, { type: 'triangle', freq: rand(3000, 4000), gain: 0.07 });
        break;
      case 'bounce':
        this.tone(dest, t, 0.06, { type: 'triangle', freq: rand(700, 1000), gain: 0.25 });
        break;
      case 'pickup':
        this.noiseBurst(dest, t, 0.1, { type: 'bandpass', freq: 1200, q: 1, gain: 0.5 });
        this.tone(dest, t + 0.05, 0.08, { type: 'triangle', freq: 900, gain: 0.2 });
        break;
      default:
        break;
    }
  }

  hitmarker(kind) {
    if (!this.ctx) return;
    const t = this.now;
    const dest = this.out(0, this.ui);
    dest.gain.value = 0.55;
    if (kind === 'head') {
      this.tone(dest, t, 0.28, { type: 'sine', freq: 2600, gain: 0.35 });
      this.tone(dest, t, 0.22, { type: 'sine', freq: 3900, gain: 0.15 });
      this.noiseBurst(dest, t, 0.03, { type: 'highpass', freq: 4000, gain: 0.4 });
    } else if (kind === 'kill') {
      this.tone(dest, t, 0.06, { type: 'square', freq: 1400, gain: 0.12 });
      this.tone(dest, t + 0.07, 0.1, { type: 'square', freq: 1050, gain: 0.12 });
    } else {
      this.tone(dest, t, 0.035, { type: 'square', freq: 1900, gain: 0.1 });
      this.noiseBurst(dest, t, 0.02, { type: 'highpass', freq: 5000, gain: 0.3 });
    }
  }

  hurt() {
    if (!this.ctx) return;
    const t = this.now;
    const dest = this.out(0);
    dest.gain.value = 0.5;
    this.noiseBurst(dest, t, 0.12, { type: 'lowpass', freq: 380, gain: 0.9 });
    this.tone(dest, t, 0.1, { freq: 90, freqEnd: 50, gain: 0.6 });
  }

  heartbeat() {
    if (!this.ctx) return;
    const t = this.now;
    const dest = this.out(0);
    dest.gain.value = 0.55;
    this.tone(dest, t, 0.12, { freq: 60, freqEnd: 40, gain: 0.8 });
    this.tone(dest, t + 0.18, 0.12, { freq: 55, freqEnd: 38, gain: 0.6 });
  }

  beep(freq = 1800, dur = 0.06, gain = 0.25, pos = null) {
    if (!this.ctx) return;
    const sp = this.spatial(pos, 4, 40);
    const dest = this.out(sp.pan);
    dest.gain.value = sp.gain;
    this.tone(dest, this.now, dur, { type: 'square', freq, gain });
  }

  radio() {
    if (!this.ctx) return;
    const t = this.now;
    const dest = this.out(0, this.ui);
    dest.gain.value = 0.35;
    this.tone(dest, t, 0.05, { type: 'square', freq: 1200, gain: 0.2 });
    this.tone(dest, t + 0.07, 0.05, { type: 'square', freq: 1600, gain: 0.2 });
    this.noiseBurst(dest, t + 0.12, 0.35, { type: 'bandpass', freq: 2200, q: 0.8, gain: 0.12, attack: 0.02 });
  }

  uiClick() {
    if (!this.ctx) return;
    const dest = this.out(0, this.ui);
    dest.gain.value = 0.4;
    this.tone(dest, this.now, 0.04, { type: 'triangle', freq: 1500, gain: 0.25 });
  }

  uiHover() {
    if (!this.ctx) return;
    const dest = this.out(0, this.ui);
    dest.gain.value = 0.2;
    this.tone(dest, this.now, 0.025, { type: 'triangle', freq: 2300, gain: 0.12 });
  }

  siren(dur = 6) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = this.now;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.35;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 180;
    lfo.connect(lfoG);
    lfoG.connect(o.frequency);
    o.frequency.value = 520;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.5);
    g.gain.setValueAtTime(0.06, t + dur - 1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f);
    f.connect(g);
    g.connect(this.amb);
    g.connect(this.verbIn);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.1);
    lfo.stop(t + dur + 0.1);
  }

  // Ortam: rüzgâr döngüsü + uzak topçu ve çatışma sesleri. amb (harita ortamından): wind (süzgeç
  // frekansı: kar fırtınasında tiz, limanda boğuk), gain, distant (uzak çatışma sıklığı çarpanı),
  // sea (dalga uğultusu), hum (rafineri makinelerinin alçak uğultusu)
  startAmbient(amb = {}) {
    if (!this.ctx || this.windSrc) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = amb.wind || 420;
    f.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.value = amb.gain ?? 0.16;
    this.distantRate = amb.distant ?? 1;
    this.ambExtras = [];
    if (amb.sea) this.ambExtras.push(this.loopLayer({ type: 'lowpass', freq: 160, gain: 0.22, lfo: 0.09, lfoDepth: 0.16 }));
    if (amb.hum) this.ambExtras.push(this.humLayer());
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = ctx.createGain();
    lg.gain.value = 180;
    lfo.connect(lg);
    lg.connect(f.frequency);
    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.13;
    const lg2 = ctx.createGain();
    lg2.gain.value = 0.07;
    lfo2.connect(lg2);
    lg2.connect(g.gain);
    src.connect(f);
    f.connect(g);
    g.connect(this.amb);
    src.start();
    lfo.start();
    lfo2.start();
    this.windSrc = src;
    this.windGain = g;
    this.nextDistant = this.now + rand(6, 14);
  }

  // Döngüsel gürültü katmanı (dalga): yavaş genlik dalgalanmasıyla
  loopLayer({ type, freq, gain, lfo, lfoDepth }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.playbackRate.value = 0.7;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = gain;
    const o = ctx.createOscillator();
    o.frequency.value = lfo;
    const og = ctx.createGain();
    og.gain.value = lfoDepth;
    o.connect(og);
    og.connect(g.gain);
    src.connect(f);
    f.connect(g);
    g.connect(this.amb);
    src.start();
    o.start();
    return [src, o];
  }

  // Makine uğultusu: iki alçak ton, hafif vuru (rafineri pompaları)
  humLayer() {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = 0.035;
    g.connect(this.amb);
    const out = [];
    for (const fr of [49, 98.6]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = fr;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 180;
      o.connect(f);
      f.connect(g);
      o.start();
      out.push(o);
    }
    return out;
  }

  stopAmbient() {
    if (this.windSrc) {
      try {
        this.windSrc.stop();
      } catch {
        /* zaten durmuş */
      }
      this.windSrc = null;
    }
    for (const nodes of this.ambExtras || []) {
      for (const n of nodes) {
        try {
          n.stop();
        } catch {
          /* zaten durmuş */
        }
      }
    }
    this.ambExtras = [];
  }

  updateAmbient() {
    if (!this.ctx || !this.windSrc) return;
    if (this.now > this.nextDistant) {
      this.nextDistant = this.now + rand(9, 26) / Math.max(0.2, this.distantRate ?? 1);
      const t = this.now;
      const dest = this.out(rand(-0.8, 0.8), this.amb);
      if (Math.random() < 0.55) {
        // Uzak topçu
        dest.gain.value = rand(0.25, 0.5);
        this.noiseBurst(dest, t, 2.2, { type: 'lowpass', freq: 260, freqEnd: 60, gain: 1, attack: 0.03 });
        this.tone(dest, t, 1.2, { freq: 45, freqEnd: 25, gain: 0.8 });
      } else {
        // Uzak otomatik atış
        dest.gain.value = rand(0.12, 0.25);
        const n = 3 + ((Math.random() * 8) | 0);
        for (let i = 0; i < n; i++) {
          const tt = t + i * rand(0.08, 0.12);
          this.noiseBurst(dest, tt, 0.25, { type: 'lowpass', freq: 500, gain: 0.8, attack: 0.004 });
        }
      }
    }
  }

  // Menü müziği: yavaş minör akor dronu
  startMenuMusic() {
    if (!this.ctx || this.music) return;
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, this.now);
    g.gain.exponentialRampToValueAtTime(0.05, this.now + 3);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 700;
    g.connect(f);
    f.connect(this.amb);
    f.connect(this.verbIn);
    const oscs = [];
    for (const [freq, det] of [[55, 0], [82.4, 4], [110, -5], [130.8, 3], [164.8, -3]]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = det;
      o.connect(g);
      o.start();
      oscs.push(o);
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lg = ctx.createGain();
    lg.gain.value = 300;
    lfo.connect(lg);
    lg.connect(f.frequency);
    lfo.start();
    oscs.push(lfo);
    this.music = { g, oscs };
  }

  stopMenuMusic() {
    if (!this.music) return;
    const { g, oscs } = this.music;
    const t = this.now;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    for (const o of oscs) o.stop(t + 1.3);
    this.music = null;
  }

  // Helikopter rotor sesi (konumlu, sürekli)
  startRotor() {
    if (!this.ctx || this.rotor) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 350;
    const am = ctx.createGain();
    am.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 17;
    const lg = ctx.createGain();
    lg.gain.value = 0.45;
    lfo.connect(lg);
    lg.connect(am.gain);
    const out = ctx.createGain();
    out.gain.value = 0;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    src.connect(f);
    f.connect(am);
    am.connect(out);
    if (pan) {
      out.connect(pan);
      pan.connect(this.sfx);
    } else out.connect(this.sfx);
    src.start();
    lfo.start();
    this.rotor = { src, lfo, out, pan };
  }

  updateRotor(pos) {
    if (!this.rotor) return;
    const sp = this.spatial(pos, 15, 300);
    this.rotor.out.gain.value = sp.gain * 0.9;
    if (this.rotor.pan) this.rotor.pan.pan.value = sp.pan;
  }

  stopRotor() {
    if (!this.rotor) return;
    try {
      this.rotor.src.stop();
      this.rotor.lfo.stop();
    } catch {
      /* zaten durmuş */
    }
    this.rotor = null;
  }
}

// Silah ses profilleri: her silah farklı hissettirsin (master prompt §5)
const GUN_PROFILES = {
  rifle: { vol: 0.9, crack: 1.0, crackFreq: 2400, crackDur: 0.07, body: 0.9, bodyFreq: 2200, bodyDur: 0.16, thump: 140, thumpGain: 0.9, thumpDur: 0.1, tail: 0.5, tailGain: 0.45, mech: 0.12 },
  pistol: { vol: 0.8, crack: 1.1, crackFreq: 3000, crackDur: 0.05, body: 0.7, bodyFreq: 2800, bodyDur: 0.11, thump: 180, thumpGain: 0.6, thumpDur: 0.07, tail: 0.35, tailGain: 0.35, mech: 0.25 },
  shotgun: { vol: 1.0, crack: 0.9, crackFreq: 1600, crackDur: 0.09, body: 1.0, bodyFreq: 1500, bodyDur: 0.28, thump: 95, thumpGain: 1.0, thumpDur: 0.2, tail: 0.9, tailGain: 0.6, mech: 0 },
  enemyRifle: { vol: 0.8, crack: 0.8, crackFreq: 2000, crackDur: 0.07, body: 0.85, bodyFreq: 1800, bodyDur: 0.16, thump: 125, thumpGain: 0.7, thumpDur: 0.1, tail: 0.55, tailGain: 0.45, mech: 0 },
  enemyShotgun: { vol: 0.85, crack: 0.7, crackFreq: 1500, crackDur: 0.09, body: 0.9, bodyFreq: 1400, bodyDur: 0.26, thump: 90, thumpGain: 0.9, thumpDur: 0.18, tail: 0.8, tailGain: 0.5, mech: 0 },
  enemyLmg: { vol: 0.85, crack: 0.9, crackFreq: 1900, crackDur: 0.07, body: 0.9, bodyFreq: 1700, bodyDur: 0.17, thump: 110, thumpGain: 0.8, thumpDur: 0.1, tail: 0.55, tailGain: 0.5, mech: 0 },
  rifle2: { vol: 0.9, crack: 1.05, crackFreq: 2700, crackDur: 0.06, body: 0.85, bodyFreq: 2400, bodyDur: 0.14, thump: 150, thumpGain: 0.8, thumpDur: 0.09, tail: 0.45, tailGain: 0.42, mech: 0.14 },
  smg: { vol: 0.75, crack: 0.9, crackFreq: 3200, crackDur: 0.045, body: 0.75, bodyFreq: 3000, bodyDur: 0.09, thump: 190, thumpGain: 0.55, thumpDur: 0.06, tail: 0.3, tailGain: 0.32, mech: 0.2 },
  lmg: { vol: 0.95, crack: 1.0, crackFreq: 2100, crackDur: 0.07, body: 1.0, bodyFreq: 1900, bodyDur: 0.17, thump: 120, thumpGain: 1.0, thumpDur: 0.11, tail: 0.6, tailGain: 0.5, mech: 0.1 },
  enemyHmg: { vol: 1.0, crack: 1.1, crackFreq: 1500, crackDur: 0.1, body: 1.05, bodyFreq: 1100, bodyDur: 0.3, thump: 62, thumpGain: 1.15, thumpDur: 0.22, tail: 1.2, tailGain: 0.7, mech: 0.05 },
  bmg50: { vol: 1.1, crack: 1.3, crackFreq: 1800, crackDur: 0.12, body: 1.1, bodyFreq: 1300, bodyDur: 0.4, thump: 70, thumpGain: 1.2, thumpDur: 0.3, tail: 1.6, tailGain: 0.85, mech: 0.1 },
  magnum: { vol: 1.0, crack: 1.25, crackFreq: 2500, crackDur: 0.08, body: 1.0, bodyFreq: 2000, bodyDur: 0.2, thump: 110, thumpGain: 1.0, thumpDur: 0.14, tail: 0.8, tailGain: 0.55, mech: 0.25 },
  rocket: { vol: 1.0, crack: 0.5, crackFreq: 900, crackDur: 0.25, body: 1.0, bodyFreq: 900, bodyDur: 0.7, thump: 60, thumpGain: 1.1, thumpDur: 0.35, tail: 1.2, tailGain: 0.6, mech: 0 },
  sniper: { vol: 1.0, crack: 1.2, crackFreq: 2600, crackDur: 0.1, body: 1.0, bodyFreq: 2000, bodyDur: 0.3, thump: 100, thumpGain: 1.0, thumpDur: 0.2, tail: 1.3, tailGain: 0.7, mech: 0 },
};
