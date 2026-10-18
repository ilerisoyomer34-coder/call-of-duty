// Nişan ve kavrama matematiği: görünüm modeliyle geometri testleri aynı dönüşümleri kullanır.
import * as THREE from 'three';
import { WEAPONS, WEAPON_AIM } from './config.js';

const forward = new THREE.Vector3();
const up = new THREE.Vector3();
const right = new THREE.Vector3();
const matrix = new THREE.Matrix4();
const q = new THREE.Quaternion();
const alignQ = new THREE.Quaternion();
const pivot = new THREE.Vector3();
const rotated = new THREE.Vector3();
const NEG_Z = new THREE.Vector3(0, 0, -1);

export function sightAlignment(sight, front) {
  if (!sight || !front) return null;
  return new THREE.Quaternion().setFromUnitVectors(forward.subVectors(front, sight).normalize(), NEG_Z);
}

export function gripQuaternion(frame) {
  forward.fromArray(frame.forward).normalize();
  up.fromArray(frame.up).addScaledVector(forward, -up.dot(forward)).normalize();
  right.crossVectors(up, forward).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(matrix.makeBasis(right, up, forward));
}

export function calibrateWeapon(id, model, fromGlb) {
  const a = WEAPON_AIM[id], d = WEAPONS[id];
  // GLB gelmeden gösterilen yedek tüfeğin geometrisi farklıdır; ona gerçek modelin noktası uygulanmaz.
  if (d.grip && (fromGlb || d.model !== 'glb')) {
    model.leftHand.fromArray(d.grip.left.position);
    model.rightHand.fromArray(d.grip.right.position);
    model.leftGrip = gripQuaternion(d.grip.left);
    model.rightGrip = gripQuaternion(d.grip.right);
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
