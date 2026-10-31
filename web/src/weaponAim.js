// Nişan ve kavrama matematiği: görünüm modeliyle geometri testleri aynı dönüşümleri kullanır.
import * as THREE from 'three';
import { WEAPONS, WEAPON_AIM, HAND_VIEW } from './config.js';
import HAND_FIT from './data/handFit.json' with { type: 'json' };

const forward = new THREE.Vector3();
const up = new THREE.Vector3();
const right = new THREE.Vector3();
const matrix = new THREE.Matrix4();
const q = new THREE.Quaternion();
const alignQ = new THREE.Quaternion();
const pivot = new THREE.Vector3();
const rotated = new THREE.Vector3();
const NEG_Z = new THREE.Vector3(0, 0, -1);
const along = new THREE.Vector3();

export function sightAlignment(sight, front) {
  if (!sight || !front) return null;
  return new THREE.Quaternion().setFromUnitVectors(forward.subVectors(front, sight).normalize(), NEG_Z);
}

// El modelinin tabanı: +Z bilekten orta parmak köküne, +Y el sırtı, +X sağ elde başparmak, sol elde serçe tarafı.
// side: 1 sağ, −1 sol. frame.index işaret parmağı tarafını gösterdiği için sol elde X onun tersidir; aynı tutuş iki
// elde de parmakları kavranan eksene dik sarar.
export function gripQuaternion(frame, side = 1) {
  right.fromArray(frame.index).normalize().multiplyScalar(side);
  up.fromArray(frame.back).addScaledVector(right, -up.dot(right)).normalize();
  forward.crossVectors(right, up).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(matrix.makeBasis(right, up, forward));
}

// Ön kolun elin tabanındaki yönü (dirsekten bileğe). bend: dirsek el sırtı tarafında (bilek geriye bükülü),
// ulnar: el serçe yönüne bükülü, yani ön kol başparmak tarafından gelir. frame.forearm verilmişse yön silahın
// uzayındadır (dipçik bileği gibi açıların el tabanında anlatılması zor olduğu tutuşlar); grip elin dönüşüdür.
export function forearmLocal(frame, side = 1, grip = null, target = new THREE.Vector3()) {
  if (frame.forearm && grip) return target.fromArray(frame.forearm).normalize().applyQuaternion(q.copy(grip).invert());
  const b = frame.bend || 0, u = frame.ulnar || 0;
  return target.set(side * Math.sin(u) * Math.cos(b), -Math.sin(b), Math.cos(u) * Math.cos(b)).normalize();
}

// Kavrayan elin dirseği: avuç merkezinden bileğe, oradan ön kol boyunca geriye. handQ elin dünya (görünüm) dönüşü.
export function gripElbow(handQ, palm, forearm, out) {
  along.set(0, 0, 1).applyQuaternion(handQ);
  out.copy(palm).addScaledVector(along, -HAND_VIEW.palmCenter);
  along.copy(forearm).applyQuaternion(handQ);
  return out.addScaledVector(along, -HAND_VIEW.forearm);
}

export function calibrateWeapon(id, model, fromGlb) {
  const a = WEAPON_AIM[id], d = WEAPONS[id];
  // GLB gelmeden gösterilen yedek tüfeğin geometrisi farklıdır; ona gerçek modelin noktası uygulanmaz.
  if (d.grip && (fromGlb || d.model !== 'glb')) {
    // Avuç noktaları ve kabza eğimi modelin kendisinden ölçülür (tools/fit-hands.mjs → data/handFit.json); yedek
    // modelde ya da ölçüsüz silahta WEAPON_AIM ipucu
    const fit = (fromGlb || d.model !== 'glb') && HAND_FIT[id] || {};
    const left = { ...d.grip.left, ...(fit.leftIndex && { index: fit.leftIndex }) };
    const right = { ...d.grip.right, ...(fit.rightIndex && { index: fit.rightIndex }) };
    model.leftHand.fromArray(fit.left || left.position);
    model.rightHand.fromArray(fit.right || right.position);
    model.leftGrip = gripQuaternion(left, -1);
    model.rightGrip = gripQuaternion(right, 1);
    model.leftForearm = forearmLocal(left, -1, model.leftGrip);
    model.rightForearm = forearmLocal(right, 1, model.rightGrip);
  }
  if (fromGlb && a.sight) model.sight.fromArray(a.sight);
  if (fromGlb && a.front) model.front = new THREE.Vector3().fromArray(a.front);
  model.adsAlign = sightAlignment(model.sight, model.front);
}

// Dönüş nişangâhın etrafındadır: namlu sallansa da gez hedefin merkezinden kaymaz.
export function placeWeapon(root, position, rotation, sight, alignment, ads) {
  q.setFromEuler(rotation);
  if (alignment) q.multiply(alignQ.identity().slerp(alignment, ads));
  pivot.copy(sight).multiplyScalar(ads);
  root.quaternion.copy(q);
  root.position.copy(position).add(pivot).sub(rotated.copy(pivot).applyQuaternion(q));
  root.updateMatrix();
}
