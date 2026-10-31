// net_graph (çok oyunculu belge Ek C): sağ altta ağ ölçümleri. 1: değerler, 2: ek olarak son 3 sn ping grafiği.
// Değerler game.net.graph()'tan; panel saniyede 4 kez yazılır (her kare DOM'a dokunmasın).
const $ = (id) => document.getElementById(id);

export class NetGraph {
  constructor(game) {
    this.game = game;
    this.level = 0;
    this.t = 0;
    this.fps = 0;
    this.frames = 0;
    this.fpsT = 0;
  }

  set(level) {
    this.level = Math.max(0, Math.min(2, level | 0));
    $('netGraph').hidden = this.level === 0;
    $('netGraphCanvas').hidden = this.level < 2;
  }

  update(dt) {
    if (!this.level) return;
    this.frames++;
    this.fpsT += dt;
    if (this.fpsT >= 0.5) {
      this.fps = this.frames / this.fpsT;
      this.frames = 0;
      this.fpsT = 0;
    }
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.25;
    const net = this.game.net;
    const lines = [`fps ${this.fps.toFixed(0)}`];
    if (!net) lines.push('çevrim dışı');
    else {
      const g = net.graph();
      lines.push(
        `ping ${g.ping} ms ± ${g.jitter}${g.profile ? ` · benzetim ${g.profile}` : ''}`,
        `görüntü ${g.snapHz.toFixed(0)} Hz · aralama ${g.interpMs} ms`,
        `in ${g.inKB.toFixed(1)} KB/s · out ${(g.outKB / 1024).toFixed(0)} KB`,
        `sunucu tick ${g.tickMs.toFixed(2)} ms · tampon ${g.bufDepth}`,
        `saat farkı ${g.offset} ms · sıçrama ${g.spikes}`,
        `tahmin farkı ${g.predErrCm.toFixed(2)} cm · düzeltme ${g.corrections}`
      );
      if (this.level >= 2) this.drawPing(g.pings);
    }
    $('netGraphText').textContent = lines.join('\n');
  }

  drawPing(pings) {
    const c = $('netGraphCanvas');
    const ctx = c.getContext('2d');
    const w = c.width;
    const h = c.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.fillRect(0, 0, w, h);
    if (!pings.length) return;
    const max = Math.max(150, ...pings.map((p) => p[1]));
    const t0 = pings[0][0];
    const t1 = Math.max(t0 + 1, pings[pings.length - 1][0]);
    ctx.strokeStyle = '#5ee7ff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    pings.forEach(([t, v], i) => {
      const x = ((t - t0) / (t1 - t0)) * (w - 4) + 2;
      const y = h - 2 - (v / max) * (h - 4);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = '#cfd8dc';
    ctx.font = '10px monospace';
    ctx.fillText(`${Math.round(max)} ms`, 4, 11);
  }
}
