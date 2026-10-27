// Görüntü son işlemi: dünya HDR hedefinden (worldRT, doğrusal, ton eşlemesiz) tuvale. Ayarlar config.js → POST.
//  - Parlama (bloom): eşiği aşan ışık (güneş diski, patlama, alev, namlu ateşi, izli mermi, lambalar) yarım/çeyrek
//    çözünürlükte süzülüp yayılır. Aşağı örnekleme 5 dokunuşlu "dual filter", yukarı örnekleme çadır süzgeci ve
//    toplama: birkaç küçük geçiş, tam çözünürlükte tek okuma.
//  - Keskinleştirme: dünya ekrandan küçük çizilip büyütülüyorsa (dokunmatik, uyarlanır çözünürlük) komşu piksellerin
//    en küçüğü/en büyüğüyle sınırlı keskinlik (kenarda hale oluşmaz).
//  - Ton eşleme (ACES) ve sRGB, ardından renk düzeni (doygunluk, karşıtlık, harita renk tonu), vinyet ve gökyüzü
//    geçişlerinde bantlaşmayı kıran titreşim.
// Işık eklenmez; sahne malzemeleri değişmez (yalnız bu dörtgenlerin gölgelendiricileri derlenir).
import * as THREE from 'three';
import { POST } from './config.js';

const VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

// Eşik: en parlak kanal pozlamadan sonra eşiği aşan kısım (yumuşak diz), çok parlak tek piksel sınırlanır (ateş böceği)
const PREFILTER = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 texel;
uniform float threshold;
uniform float knee;
uniform float exposure;
uniform float clampMax;
varying vec2 vUv;
vec3 pick(vec2 uv) {
  vec3 c = min(texture2D(tSrc, uv).rgb * exposure, vec3(clampMax));
  float br = max(c.r, max(c.g, c.b));
  float rq = clamp(br - threshold + knee, 0.0, 2.0 * knee);
  rq = rq * rq / (4.0 * knee + 1e-4);
  return c * (max(rq, br - threshold) / max(br, 1e-4));
}
void main() {
  vec2 o = texel * 0.5;
  vec3 c = pick(vUv + vec2(-o.x, -o.y)) + pick(vUv + vec2(o.x, -o.y)) + pick(vUv + vec2(-o.x, o.y)) + pick(vUv + vec2(o.x, o.y));
  gl_FragColor = vec4(c * 0.25, 1.0);
}`;

const DOWN = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 texel;
varying vec2 vUv;
void main() {
  vec2 o = texel;
  vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
  c += texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb;
  c += texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb;
  c += texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb;
  c += texture2D(tSrc, vUv + vec2(o.x, o.y)).rgb;
  gl_FragColor = vec4(c / 8.0, 1.0);
}`;

const UP = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 texel;
uniform float spread;
varying vec2 vUv;
void main() {
  vec2 o = texel * spread;
  vec3 c = texture2D(tSrc, vUv + vec2(-o.x * 2.0, 0.0)).rgb;
  c += texture2D(tSrc, vUv + vec2(o.x * 2.0, 0.0)).rgb;
  c += texture2D(tSrc, vUv + vec2(0.0, -o.y * 2.0)).rgb;
  c += texture2D(tSrc, vUv + vec2(0.0, o.y * 2.0)).rgb;
  c += (texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb + texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb
     + texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb + texture2D(tSrc, vUv + vec2(o.x, o.y)).rgb) * 2.0;
  gl_FragColor = vec4(c / 12.0, 1.0);
}`;

const FINAL = /* glsl */ `
uniform sampler2D tDiffuse;
uniform sampler2D tBloom;
uniform vec2 texel;
uniform float bloomStrength;
uniform float sharpen;
uniform float saturation;
uniform float contrast;
uniform vec3 tint;
uniform float vignette;
uniform float dither;
varying vec2 vUv;
float rnd(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  if (sharpen > 0.0) {
    vec3 n = texture2D(tDiffuse, vUv + vec2(0.0, texel.y)).rgb;
    vec3 s = texture2D(tDiffuse, vUv - vec2(0.0, texel.y)).rgb;
    vec3 e = texture2D(tDiffuse, vUv + vec2(texel.x, 0.0)).rgb;
    vec3 w = texture2D(tDiffuse, vUv - vec2(texel.x, 0.0)).rgb;
    vec3 mn = min(c, min(min(n, s), min(e, w)));
    vec3 mx = max(c, max(max(n, s), max(e, w)));
    c = clamp(c + (c - (n + s + e + w) * 0.25) * sharpen, mn, mx);
  }
  #ifdef BLOOM
  c += texture2D(tBloom, vUv).rgb * bloomStrength;
  #endif
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #ifdef GRADE
  vec3 g = gl_FragColor.rgb;
  float l = dot(g, vec3(0.2126, 0.7152, 0.0722));
  g = mix(vec3(l), g, saturation);
  g = (g - 0.5) * contrast + 0.5;
  g *= tint;
  vec2 d = vUv - 0.5;
  g *= 1.0 - vignette * dot(d, d) * 2.0;
  gl_FragColor.rgb = g;
  #endif
  gl_FragColor.rgb = clamp(gl_FragColor.rgb + (rnd(gl_FragCoord.xy) - 0.5) * dither, 0.0, 1.0);
}`;

const rtOpts = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };

export class PostFX {
  constructor(renderer) {
    this.r = renderer;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.scene = new THREE.Scene();
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    const pass = (fragmentShader, uniforms, extra = {}) =>
      new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader, depthTest: false, depthWrite: false, toneMapped: false, ...extra });
    const B = POST.bloom;
    this.prefilter = pass(PREFILTER, {
      tSrc: { value: null },
      texel: { value: new THREE.Vector2() },
      threshold: { value: B.threshold },
      knee: { value: B.knee },
      exposure: { value: 1 },
      clampMax: { value: B.clamp },
    });
    this.down = pass(DOWN, { tSrc: { value: null }, texel: { value: new THREE.Vector2() } });
    this.up = pass(UP, { tSrc: { value: null }, texel: { value: new THREE.Vector2() }, spread: { value: B.spread } }, { blending: THREE.AdditiveBlending, transparent: true });
    this.final = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tBloom: { value: null },
        texel: { value: new THREE.Vector2() },
        bloomStrength: { value: B.intensity },
        sharpen: { value: 0 },
        saturation: { value: 1 },
        contrast: { value: 1 },
        tint: { value: new THREE.Vector3(1, 1, 1) },
        vignette: { value: 0 },
        dither: { value: POST.dither },
      },
      vertexShader: VERT,
      fragmentShader: FINAL,
      depthTest: false,
      depthWrite: false,
    });
    this.levels = [];
    this.bloomLevels = 0;
    this.bloomStart = 0.5;
    this.grade = false;
    this.width = 0;
    this.height = 0;
    this.setGrade(null);
  }

  // Kaliteye göre: parlama kademe sayısı ve başlangıç çözünürlüğü, renk düzeni, keskinlik (dünya büyütülüyorsa)
  configure({ quality, isTouch, enabled, sharpen }) {
    const B = POST.bloom;
    const levels = enabled ? (isTouch ? B.touchLevels : B.levels)[quality] || 0 : 0;
    const start = (isTouch ? B.touchStart : B.start)[quality] || 0.5;
    const grade = enabled && quality !== 'low';
    const defs = this.final.defines;
    if (!!defs.BLOOM !== levels > 0 || !!defs.GRADE !== grade) {
      if (levels > 0) defs.BLOOM = '';
      else delete defs.BLOOM;
      if (grade) defs.GRADE = '';
      else delete defs.GRADE;
      this.final.needsUpdate = true;
    }
    this.grade = grade;
    this.final.uniforms.sharpen.value = sharpen;
    if (levels !== this.bloomLevels || start !== this.bloomStart) {
      this.bloomLevels = levels;
      this.bloomStart = start;
      this.allocate();
    }
  }

  // Harita renk düzeni: config.js → POST.grade, haritanın ortam satırındaki grade alanı üstüne yazar
  setGrade(grade) {
    const G = { ...POST.grade, ...(grade || {}) };
    const U = this.final.uniforms;
    U.saturation.value = G.saturation;
    U.contrast.value = G.contrast;
    U.tint.value.set(G.tint[0], G.tint[1], G.tint[2]);
    U.vignette.value = G.vignette;
  }

  // Dünya hedefinin boyu değişince (pencere, kalite, uyarlanır çözünürlük) parlama zinciri yeniden kurulur
  resize(w, h) {
    this.width = w;
    this.height = h;
    this.final.uniforms.texel.value.set(1 / w, 1 / h);
    this.allocate();
  }

  allocate() {
    for (const l of this.levels) l.rt.dispose();
    this.levels = [];
    if (!this.bloomLevels || !this.width) return;
    let w = Math.max(1, Math.round(this.width * this.bloomStart));
    let h = Math.max(1, Math.round(this.height * this.bloomStart));
    for (let i = 0; i < this.bloomLevels && w >= 2 && h >= 2; i++) {
      this.levels.push({ rt: new THREE.WebGLRenderTarget(w, h, rtOpts), w, h });
      w = Math.max(1, w >> 1);
      h = Math.max(1, h >> 1);
    }
    this.final.uniforms.tBloom.value = this.levels[0]?.rt.texture || null;
  }

  pass(material, target) {
    this.quad.material = material;
    this.r.setRenderTarget(target);
    this.r.render(this.scene, this.camera);
  }

  // src: dünya hedefi (çözülmüş MSAA dokusu) → tuval
  render(src) {
    const r = this.r;
    const L = this.levels;
    if (L.length) {
      const P = this.prefilter.uniforms;
      P.tSrc.value = src.texture;
      P.texel.value.set(1 / src.width, 1 / src.height);
      P.exposure.value = r.toneMappingExposure;
      this.pass(this.prefilter, L[0].rt);
      const D = this.down.uniforms;
      for (let i = 1; i < L.length; i++) {
        D.tSrc.value = L[i - 1].rt.texture;
        D.texel.value.set(1 / L[i - 1].w, 1 / L[i - 1].h);
        this.pass(this.down, L[i].rt);
      }
      const U = this.up.uniforms;
      for (let i = L.length - 2; i >= 0; i--) {
        U.tSrc.value = L[i + 1].rt.texture;
        U.texel.value.set(1 / L[i + 1].w, 1 / L[i + 1].h);
        this.pass(this.up, L[i].rt);
      }
    }
    this.final.uniforms.tDiffuse.value = src.texture;
    r.setRenderTarget(null);
    r.clear();
    this.pass(this.final, null);
  }

  // Gölgelendiriciler yükleme ekranında derlensin (ilk karede takılmasın); tuval hedefi bağlıyken çağrılır
  precompile() {
    for (const m of [this.prefilter, this.down, this.up, this.final]) {
      this.quad.material = m;
      this.r.compile(this.scene, this.camera);
    }
  }

  dispose() {
    for (const l of this.levels) l.rt.dispose();
    this.levels = [];
    for (const m of [this.prefilter, this.down, this.up, this.final]) m.dispose();
    this.quad.geometry.dispose();
  }
}
