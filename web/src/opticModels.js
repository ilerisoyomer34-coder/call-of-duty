// Eklenti nişangâhlarının 3B modelleri (kullanıcı isteği: "türbinler falan daha estetik dursun … bir sürü dürbün
// olsun"): kodla kurulur, az üçgenli ama işlenmiş görünür: dönel gövdeler profil çizgisinden (LatheGeometry: pah,
// göz kapağı, objektif çanı), köşeleri yuvarlatılmış kutular, tırtıllı ayar kuleleri, halkalı montaj ve vida başları.
// Köken nişan noktası (göz hizası, optiğin arka ucu), eksen -Z; y = 0 optik eksen. Işık eklenmez.
// Her kurucu { group, below(t), feet } döndürür:
//   below(t): eksenden t (m, öne doğru) uzaklıkta gövdenin altının eksenin ne kadar altında kaldığı (silahın gövdesine
//     girmesin diye yükseklik buna göre ölçülür; attachments3d.js → opticLift)
//   feet: montaj ayakları [{ t, y, w, d }] (y: ayağın üst yüzü, eksene göre): attachments3d.js ayakları silahın
//     gövdesine dek uzatır (boşlukta durmasın)
// Malzemeler paylaşılır; lastik ve vida userData.noCamo (kamuflaj sürülmez), cam MeshBasic (boyanmaz).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { lensMaterial } from './reticles.js';

const Z0 = -0.004; // gövdenin arka ucu (göz merceği) nişan noktasının biraz önünde

let M = null;
export function opticMaterials() {
  if (M) return M;
  const std = (color, roughness, metalness, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, side: THREE.DoubleSide, ...extra });
  M = {
    body: std(0x17181a, 0.36, 0.72), // eloksal siyah
    edge: std(0x2c2f33, 0.26, 0.85), // işlenmiş kenar, kapak (biraz açık: profil okunur)
    knurl: std(0x0f1011, 0.6, 0.5, { flatShading: true }), // tırtıl: düz gölgeli yüzler sırt sırt görünür
    polymer: std(0x1d1f21, 0.78, 0.06),
    rubber: std(0x0b0c0d, 0.92, 0.02),
    screw: std(0x74777a, 0.28, 0.95),
    emitter: new THREE.MeshBasicMaterial({ color: 0xff3a24, toneMapped: false }),
  };
  M.rubber.userData.noCamo = true;
  M.screw.userData.noCamo = true;
  return M;
}

// Dönel parça: pts [[yarıçap, t], ...] (t öne doğru); eksen -Z, t = 0 noktası z0'da. Namlu uçları da kullanır
export function revolve(g, pts, mat, z0 = 0, seg = 32) {
  const geo = new THREE.LatheGeometry(
    pts.map(([r, t]) => new THREE.Vector2(r, t)),
    seg
  );
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, mat);
  m.position.z = z0;
  g.add(m);
  return m;
}

const lathe = (g, pts, mat, seg = 32) => revolve(g, pts, mat, Z0, seg);

export function rbox(g, w, h, d, x, y, z, mat, radius = 0.002) {
  const r = Math.min(radius, w / 2.2, h / 2.2, d / 2.2);
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, r), mat);
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

function cyl(g, r0, r1, h, mat, seg = 24) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, h, seg), mat);
  g.add(m);
  return m;
}

// Cam: arkadaki (göze bakan) daha saydam, öndeki kaplama renkli
function glass(g, r, t, color, opacity) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 28), lensMaterial(color, opacity));
  m.position.z = Z0 - t;
  g.add(m);
  return m;
}

// Ayar kulesi: taban, tırtıllı bilezik, kapak; dir 'up' | 'right' | 'left'. (x, y, z) kulenin dayandığı yüzey noktası
function turret(g, x, y, z, dir, r, h) {
  const T = new THREE.Group();
  const mt = opticMaterials();
  const base = cyl(T, r * 1.12, r * 1.12, h * 0.3, mt.body);
  base.position.y = h * 0.15;
  const band = cyl(T, r, r, h * 0.5, mt.knurl, 18);
  band.position.y = h * 0.3 + h * 0.25;
  const cap = cyl(T, r * 0.92, r * 0.86, h * 0.2, mt.edge);
  cap.position.y = h * 0.9;
  T.position.set(x, y, z);
  if (dir === 'right') T.rotation.z = -Math.PI / 2;
  else if (dir === 'left') T.rotation.z = Math.PI / 2;
  g.add(T);
  return T;
}

// Montaj halkası (tüpü saran kelepçe) + üst kapak vidaları; ayak attachments3d.js'te gövdeye uzatılır
function ring(g, r, t, w) {
  const mt = opticMaterials();
  const ro = r + 0.0028;
  lathe(g, [[r * 0.999, t - w / 2], [ro, t - w / 2 + 0.001], [ro, t + w / 2 - 0.001], [r * 0.999, t + w / 2]], mt.body, 28);
  // Kapak vidaları iki yanda
  for (const s of [-1, 1]) {
    const v = cyl(g, 0.0018, 0.0018, 0.003, mt.screw, 10);
    v.rotation.z = Math.PI / 2;
    v.position.set(s * (ro + 0.0008), r * 0.35, Z0 - t);
  }
  return { t, y: -ro + 0.001, w: 0.016, d: w * 0.9 };
}

// --- Kurucular ---

// Mikro nokta: küçük tüp, entegre taban, üstte ve sağda iki küçük kule
function micro(spec, sight) {
  const g = new THREE.Group();
  const mt = opticMaterials();
  const { r, len } = spec;
  lathe(g, [[r * 0.82, 0], [r * 1.08, 0.0015], [r * 1.08, 0.004], [r, 0.006], [r, len - 0.008], [r * 1.12, len - 0.004], [r * 1.12, len], [r * 0.9, len + 0.0005]], mt.body);
  lathe(g, [[r * 1.002, len * 0.42], [r * 1.002, len * 0.58]], mt.edge);
  turret(g, 0, r * 0.94, Z0 - len * 0.5, 'up', 0.0048, 0.006);
  turret(g, r * 0.94, 0, Z0 - len * 0.5, 'right', 0.0048, 0.006);
  // Taban: tüpün altında, öne doğru pahlı
  rbox(g, r * 1.5, r * 0.7, len * 0.72, 0, -r * 1.05, Z0 - len * 0.52, mt.body, 0.0015);
  glass(g, r * 0.84, 0.0015, sight.lens, 0.18);
  glass(g, r * 0.92, len - 0.001, sight.lens, 0.4);
  return { group: g, below: () => r * 1.45, feet: [{ t: len * 0.52, y: -r * 1.4, w: r * 1.4, d: len * 0.6 }] };
}

// Tüp kolimatör (kırmızı nokta, artı kolimatör): ön siperlikli gövde, iki kule, tek halka montaj
function tube(spec, sight) {
  const g = new THREE.Group();
  const mt = opticMaterials();
  const { r, len } = spec;
  lathe(g, [[r * 0.9, 0], [r * 1.12, 0.002], [r * 1.12, 0.006], [r, 0.01], [r, len - 0.018], [r * 1.05, len - 0.014], [r * 1.16, len - 0.006], [r * 1.16, len], [r * 1.02, len + 0.0006]], mt.body);
  // İnce işlenmiş bilezikler (gövde düz bir boru gibi durmasın)
  for (const k of [0.22, 0.27]) lathe(g, [[r * 1.004, len * k], [r * 1.004, len * k + 0.0025]], mt.edge);
  const tz = Z0 - len * 0.45;
  turret(g, 0, r * 0.96, tz, 'up', 0.0062, 0.008);
  turret(g, r * 0.96, 0, tz, 'right', 0.0062, 0.008);
  // Sol yanda pil kapağı
  const bat = cyl(g, 0.0058, 0.0058, 0.006, mt.edge, 18);
  bat.rotation.z = Math.PI / 2;
  bat.position.set(-r - 0.002, 0, tz);
  const foot = ring(g, r, len * 0.45, 0.016);
  glass(g, r * 0.9, 0.002, sight.lens, 0.18);
  glass(g, r * 1.0, len - 0.003, sight.lens, 0.42);
  return { group: g, below: (t) => (t > len * 0.86 ? r * 1.18 : r * 1.12) + 0.003, feet: [foot] };
}

// Açık pencereli mini refleks: taban plakası, eğik pencere çerçevesi (delikli şekil), arkada ışık yayıcı
function open(spec, sight) {
  const g = new THREE.Group();
  const mt = opticMaterials();
  const { w, h, len } = spec;
  const baseH = 0.0075;
  const yb = -h / 2 - baseH / 2; // taban, pencerenin altında
  rbox(g, w + 0.004, baseH, len, 0, yb, Z0 - len / 2, mt.body, 0.002);
  // Pencere çerçevesi: yuvarlak köşeli dış hat, içi boş
  const sh = new THREE.Shape();
  const W = w / 2 + 0.002;
  const H = h + 0.004;
  const rr = 0.006;
  sh.moveTo(-W, 0);
  sh.lineTo(-W, H - rr);
  sh.quadraticCurveTo(-W, H, -W + rr, H);
  sh.lineTo(W - rr, H);
  sh.quadraticCurveTo(W, H, W, H - rr);
  sh.lineTo(W, 0);
  sh.lineTo(-W, 0);
  const hole = new THREE.Path();
  const iw = W - 0.0028;
  const ih = H - 0.0028;
  hole.moveTo(-iw, 0.002);
  hole.lineTo(-iw, ih - rr * 0.7);
  hole.quadraticCurveTo(-iw, ih, -iw + rr * 0.7, ih);
  hole.lineTo(iw - rr * 0.7, ih);
  hole.quadraticCurveTo(iw, ih, iw, ih - rr * 0.7);
  hole.lineTo(iw, 0.002);
  hole.lineTo(-iw, 0.002);
  sh.holes.push(hole);
  const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0006, bevelSegments: 1, curveSegments: 6 }), mt.body);
  frame.position.set(0, yb + baseH / 2 - 0.0005, Z0 - len * 0.72);
  frame.rotation.x = -0.12; // pencere hafif geriye yatık
  g.add(frame);
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(iw * 2, ih - 0.002), lensMaterial(sight.lens, 0.3));
  pane.position.set(0, (ih - 0.002) / 2 + 0.002, 0.003);
  frame.add(pane);
  // Işık yayıcı (arkada, tabanın üstünde) ve yan düğmeler
  rbox(g, 0.008, 0.005, 0.008, 0, yb + baseH / 2 + 0.0025, Z0 - len * 0.18, mt.edge, 0.001);
  const led = new THREE.Mesh(new THREE.CircleGeometry(0.0012, 10), mt.emitter);
  led.position.set(0, yb + baseH / 2 + 0.0028, Z0 - len * 0.18 - 0.0042);
  led.rotation.y = Math.PI;
  g.add(led);
  for (const s of [-1, 1]) rbox(g, 0.0025, 0.004, 0.007, s * (w / 2 + 0.0028), yb + 0.001, Z0 - len * 0.32, mt.edge, 0.001);
  return { group: g, below: () => -yb + baseH / 2, feet: [{ t: len * 0.5, y: yb - baseH / 2, w: w * 0.8, d: len * 0.8 }] };
}

// Holografik: kalın taban, kemerli siperlik, iki cam, sağ önde pil kapağı, arkada düğmeler, solda kilit kolu
function box(spec, sight) {
  const g = new THREE.Group();
  const mt = opticMaterials();
  const { w, len } = spec;
  const h = spec.h;
  const baseH = 0.01;
  const yb = -h / 2 - baseH / 2;
  rbox(g, w + 0.01, baseH, len, 0, yb, Z0 - len / 2, mt.body, 0.0025);
  // Kemer: dış hat yuvarlak tepeli, iç pencere dikdörtgen; pencere boyunca uzanır
  const W = w / 2 + 0.004;
  const H = h + 0.006;
  const sh = new THREE.Shape();
  sh.moveTo(-W, 0);
  sh.lineTo(-W, H - 0.008);
  sh.quadraticCurveTo(-W, H, -W + 0.008, H);
  sh.lineTo(W - 0.008, H);
  sh.quadraticCurveTo(W, H, W, H - 0.008);
  sh.lineTo(W, 0);
  sh.lineTo(-W, 0);
  const hole = new THREE.Path();
  hole.moveTo(-w / 2, 0.001);
  hole.lineTo(-w / 2, h);
  hole.lineTo(w / 2, h);
  hole.lineTo(w / 2, 0.001);
  hole.lineTo(-w / 2, 0.001);
  sh.holes.push(hole);
  const hoodLen = len * 0.86;
  const hood = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: hoodLen, bevelEnabled: true, bevelThickness: 0.001, bevelSize: 0.0008, bevelSegments: 1, curveSegments: 8 }), mt.body);
  hood.position.set(0, yb + baseH / 2 - 0.0005, Z0 - len * 0.04 - hoodLen);
  g.add(hood);
  // Siperliğin ön ve arka ağzı işlenmiş kenar
  for (const z of [Z0 - len * 0.04, Z0 - len * 0.04 - hoodLen]) rbox(g, W * 2 + 0.001, 0.0022, 0.0022, 0, yb + baseH / 2 + H - 0.0008, z, mt.edge, 0.0008);
  const yc = yb + baseH / 2 + h / 2;
  for (const [t, op] of [[len * 0.12, 0.16], [len * 0.82, 0.36]]) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), lensMaterial(sight.lens, op));
    pane.position.set(0, yc, Z0 - t);
    g.add(pane);
  }
  // Pil kapağı (sağ ön, X ekseninde), arkada iki düğme, solda kilit kolu
  const bat = cyl(g, 0.0075, 0.0075, 0.012, mt.edge, 20);
  bat.rotation.z = Math.PI / 2;
  bat.position.set(w / 2 + 0.008, yb + 0.002, Z0 - len * 0.78);
  for (const s of [-1, 1]) rbox(g, 0.006, 0.004, 0.003, s * 0.006, yb - 0.0005, Z0 + 0.001, mt.rubber, 0.001);
  rbox(g, 0.003, 0.006, 0.03, -w / 2 - 0.007, yb - 0.001, Z0 - len * 0.45, mt.edge, 0.0012);
  return { group: g, below: () => -yb + baseH / 2, feet: [{ t: len * 0.5, y: yb - baseH / 2, w: w * 0.75, d: len * 0.8 }] };
}

// Kobra: yan kızağa bağlanan ayak, kutu gövde, eğik pencere, solda pil yuvası ve parlaklık düğmesi
function kobra(spec, sight) {
  const g = new THREE.Group();
  const mt = opticMaterials();
  const { w, h, len } = spec;
  const t = 0.0035;
  rbox(g, w + 2 * t, 0.007, len, 0, -h / 2 - 0.0035, Z0 - len / 2, mt.body, 0.002); // taban
  rbox(g, t, h, len * 0.92, -w / 2 - t / 2, 0, Z0 - len * 0.5, mt.body, 0.0012); // sol duvar
  rbox(g, t, h, len * 0.92, w / 2 + t / 2, 0, Z0 - len * 0.5, mt.body, 0.0012); // sağ duvar
  rbox(g, w + 2 * t, 0.006, len * 0.95, 0, h / 2 + 0.003, Z0 - len * 0.52, mt.body, 0.002); // üst siper
  rbox(g, w + 2 * t + 0.001, 0.0022, 0.003, 0, h / 2 + 0.0055, Z0 - len * 0.04, mt.edge, 0.0009);
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), lensMaterial(sight.lens, 0.32));
  pane.position.set(0, 0, Z0 - len * 0.8);
  pane.rotation.x = 0.18;
  g.add(pane);
  // Yan kızak kolu (solda aşağı inen ayak) ve pil yuvası
  rbox(g, 0.009, h * 0.9, len * 0.7, -w / 2 - 0.009, -h * 0.35, Z0 - len * 0.5, mt.body, 0.002);
  rbox(g, 0.013, 0.022, 0.026, -w / 2 - 0.01, h * 0.12, Z0 - len * 0.78, mt.edge, 0.002);
  turret(g, -w / 2 - 0.0035, h * 0.25, Z0 - len * 0.3, 'left', 0.0055, 0.006);
  return { group: g, below: () => h / 2 + 0.007, feet: [{ t: len * 0.5, y: -h / 2 - 0.007, w: w * 0.7, d: len * 0.75 }] };
}

// Prizmatik 2×: köşeleri yuvarlak prizma gövdesi, arkada lastik göz kapaklı merceği, önde objektif; üstte kule
function prism(spec, sight) {
  const g = new THREE.Group();
  const mt = opticMaterials();
  const { w, h, r, len } = spec;
  const bodyLen = len * 0.55;
  const bz = Z0 - len * 0.28 - bodyLen / 2;
  rbox(g, w, h, bodyLen, 0, -h * 0.08, bz, mt.body, 0.005);
  lathe(g, [[r * 0.9, 0], [r * 1.18, 0.002], [r * 1.18, 0.014], [r * 1.05, 0.02], [r * 1.0, len * 0.28 + 0.004]], mt.rubber);
  lathe(g, [[r * 1.0, len * 0.8], [r * 1.18, len * 0.84], [r * 1.24, len - 0.004], [r * 1.24, len], [r * 1.08, len + 0.0005]], mt.body);
  turret(g, 0, h * 0.42, bz, 'up', 0.0065, 0.008);
  turret(g, w / 2, -h * 0.05, bz, 'right', 0.0058, 0.006);
  rbox(g, w * 0.7, 0.008, bodyLen * 0.9, 0, -h * 0.58 - 0.002, bz, mt.body, 0.002);
  glass(g, r * 0.95, 0.002, sight.lens, 0.18);
  glass(g, r * 1.12, len - 0.003, sight.lens, 0.42);
  return { group: g, below: (t) => (t > len * 0.8 ? r * 1.24 : h * 0.58 + 0.006), feet: [{ t: len * 0.5, y: -h * 0.58 - 0.006, w: w * 0.6, d: bodyLen * 0.8 }] };
}

// ACOG tipi 3×: lastik göz kapağı, öne doğru genişleyen gövde, üstte fiber toplayıcı, alt montaj ve kelebek somunlar
function acog(spec, sight) {
  const g = new THREE.Group();
  const mt = opticMaterials();
  const { r, len } = spec;
  lathe(g, [[r * 0.92, 0], [r * 1.22, 0.003], [r * 1.22, len * 0.16], [r * 1.08, len * 0.19]], mt.rubber);
  lathe(g, [[r * 1.08, len * 0.19], [r * 1.05, len * 0.22], [r * 1.05, len * 0.66], [r * 1.18, len * 0.72], [r * 1.36, len * 0.9], [r * 1.38, len], [r * 1.2, len + 0.0006]], mt.body);
  lathe(g, [[r * 1.384, len * 0.94], [r * 1.384, len * 0.97]], mt.edge);
  // Fiber optik toplayıcı (üst sırt) ve ayar kapakları
  const fiber = new THREE.MeshStandardMaterial({ color: 0x9a3c18, roughness: 0.4, metalness: 0.1 });
  fiber.userData.noCamo = true;
  rbox(g, 0.008, 0.005, len * 0.45, 0, r * 1.05 + 0.003, Z0 - len * 0.44, fiber, 0.0018);
  rbox(g, 0.012, 0.004, len * 0.5, 0, r * 1.05 + 0.0005, Z0 - len * 0.44, mt.body, 0.0015);
  turret(g, r * 1.02, 0, Z0 - len * 0.44, 'right', 0.0062, 0.006);
  // Alt montaj ve sol yanda iki kelebek somun
  rbox(g, 0.018, 0.012, len * 0.42, 0, -r * 1.05 - 0.004, Z0 - len * 0.44, mt.body, 0.002);
  for (const k of [0.34, 0.54]) {
    const n = cyl(g, 0.0042, 0.0042, 0.006, mt.screw, 12);
    n.rotation.z = Math.PI / 2;
    n.position.set(-0.012, -r * 1.05 - 0.006, Z0 - len * k);
  }
  glass(g, r * 0.95, 0.003, sight.lens, 0.18);
  glass(g, r * 1.22, len - 0.003, sight.lens, 0.45);
  return { group: g, below: (t) => (t > len * 0.72 ? r * 1.4 : r * 1.05 + 0.01), feet: [{ t: len * 0.44, y: -r * 1.05 - 0.01, w: 0.016, d: len * 0.36 }] };
}

// Tüfek dürbünü: lastik göz kapağı, oküler çan, 1"/30 mm tüp, kule yuvası (yükseltme üstte, rüzgâr sağda,
// aydınlatma solda), objektif çanı, ön kenar; iki halkalı montaj
function scope(spec, sight) {
  const g = new THREE.Group();
  const mt = opticMaterials();
  const { r, eye, obj, len } = spec;
  const oc = 0.032; // göz kapağı + oküler boyu
  const objLen = Math.min(0.08, len * 0.26);
  lathe(g, [[eye * 0.84, 0], [eye * 1.02, 0.003], [eye * 1.02, 0.024], [eye * 0.98, oc]], mt.rubber);
  lathe(g, [[eye * 0.98, oc], [eye, oc + 0.004], [eye * 0.97, oc + 0.03], [r * 1.18, oc + 0.046], [r, oc + 0.056]], mt.body);
  // Oküler üzerinde odak bileziği çizgisi
  lathe(g, [[eye * 1.005, oc + 0.008], [eye * 1.005, oc + 0.013]], mt.knurl, 24);
  const tubeEnd = len - objLen;
  lathe(g, [[r, oc + 0.056], [r, tubeEnd]], mt.body);
  // Kule yuvası (eyer)
  const ts = oc + 0.056 + (tubeEnd - oc - 0.056) * 0.45;
  lathe(g, [[r, ts - 0.03], [r * 1.34, ts - 0.022], [r * 1.38, ts - 0.012], [r * 1.38, ts + 0.012], [r * 1.34, ts + 0.022], [r, ts + 0.03]], mt.body);
  turret(g, 0, r * 1.3, Z0 - ts, 'up', 0.0105, 0.016);
  turret(g, r * 1.3, 0, Z0 - ts, 'right', 0.0098, 0.013);
  turret(g, -r * 1.3, 0, Z0 - ts, 'left', 0.0115, 0.009);
  // Objektif çanı ve ön kenar
  lathe(g, [[r, tubeEnd], [r * 1.06, tubeEnd + 0.006], [obj * 0.97, len - 0.024], [obj, len - 0.016], [obj, len], [obj * 0.9, len + 0.0006]], mt.body);
  lathe(g, [[obj * 1.006, len - 0.014], [obj * 1.006, len - 0.005]], mt.edge);
  // Halkalar: oküler ile eyer arası ve eyer ile objektif arası
  const f1 = ring(g, r, oc + 0.056 + (ts - 0.03 - oc - 0.056) * 0.5, 0.015);
  const f2 = ring(g, r, ts + 0.03 + (tubeEnd - ts - 0.03) * 0.5, 0.015);
  glass(g, eye * 0.82, 0.0015, sight.lens, 0.16);
  glass(g, obj * 0.9, len - 0.002, sight.lens, 0.46);
  const below = (t) => (t < oc + 0.05 ? eye : t > tubeEnd ? r + (obj - r) * Math.min(1, (t - tubeEnd) / Math.max(0.001, objLen - 0.016)) : r + 0.003);
  return { group: g, below, feet: [f1, f2] };
}

const BUILDERS = { micro, tube, open, box, kobra, prism, acog, scope };
export const OPTIC_SHAPES = Object.keys(BUILDERS);

// Optiğin boyu (m): yükseklik ölçümünün silah boyunca bakacağı aralık
export const opticLength = (spec) => spec.len || 0.06;

/** spec: attachments.json → model; sight: sights.json türü (cam rengi). → { group, below, feet } */
export function buildOpticModel(spec, sight) {
  const b = BUILDERS[spec.shape] || BUILDERS.tube;
  return b(spec, sight || {});
}
