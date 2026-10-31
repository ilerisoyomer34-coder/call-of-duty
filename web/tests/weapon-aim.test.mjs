// Gerçek GLB'ler + oyunun el geometrisi: merkezde parmak/gövde kalmasını ve hizanın kaymasını yakalar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WEAPONS, WEAPON_ORDER, WEAPON_AIM, HAND_VIEW } from '../src/config.js';
import ASSETS from '../src/weaponAssets.json' with { type: 'json' };
import { buildArms, buildWeapon, poseArm, setFpsArmProp } from '../src/models.js';
import { calibrateWeapon, placeWeapon, gripQuaternion, gripElbow } from '../src/weaponAim.js';
import { canAim, isScoped, sightFor } from '../src/sights.js';

const loader = new GLTFLoader();
const armBytes=readFileSync(new URL('../assets/props/fps-arms.glb', import.meta.url));
setFpsArmProp((await loader.parseAsync(armBytes.buffer.slice(armBytes.byteOffset,armBytes.byteOffset+armBytes.byteLength),'')).scene);
const arms = buildArms();
const rays = new THREE.Raycaster();
const models = new Map();
const v = p => new THREE.Vector3().fromArray(p);
for (const id of WEAPON_ORDER) {
  const d = WEAPONS[id]; let m;
  if (d.model === 'glb') {
    const a = ASSETS[d.asset || id], bytes = readFileSync(new URL(`../${a.file}`, import.meta.url));
    const root = (await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
    m = { root, sight: v(a.points.sight || [0,0,0]), front: a.points.front ? v(a.points.front) : null,
      leftHand: v(a.points.leftHand || [0,0,0]), rightHand: v([0,-.035,.025]) };
  } else m = buildWeapon(id);
  calibrateWeapon(id, m, d.model === 'glb'); models.set(id,m);
}

test('her silahın ayrı nişan mesafesi ve sonlu kavrama çerçevesi var', () => {
  assert.deepEqual(Object.keys(WEAPON_AIM).sort(), [...WEAPON_ORDER].sort());
  for (const id of WEAPON_ORDER) {
    const d = WEAPONS[id];
    assert.ok(d.adsDist >= .14 && d.adsDist <= .6, id);
    assert.ok(d.ads.vmFov >= 30 && d.ads.vmFov <= 60, id);
    if (!d.melee) for (const side of ['left','right']) {
      const frame = d.grip[side], q = gripQuaternion(frame, side === 'left' ? -1 : 1);
      assert.ok(frame.position.every(Number.isFinite), `${id}/${side}`);
      assert.ok(Math.abs(q.length()-1)<1e-10, `${id}/${side}: geçerli dönüş`);
    }
  }
});

for (const id of WEAPON_ORDER.filter(canAim)) test(`${id}: gez, arpacık ve eller masaüstü/telefon nişan hattını açık tutar`, () => {
  const d=WEAPONS[id],m=models.get(id);
  for (const aspect of [16/9, 19.5/9, 9/16]) for (const tilt of [0, -.018, .018]) {
    const position = new THREE.Vector3(-m.sight.x,-m.sight.y,-d.adsDist-m.sight.z);
    placeWeapon(m.root,position,new THREE.Euler(tilt,0,tilt/2),m.sight,m.adsAlign,1);
    m.root.updateMatrixWorld(true);
    const camera = new THREE.PerspectiveCamera(d.ads.vmFov,aspect,.01,10);camera.updateMatrixWorld(true);
    const sight=m.sight.clone().applyMatrix4(m.root.matrixWorld).project(camera);
    assert.ok(Math.hypot(sight.x,sight.y)<1e-12, `${id}: dönünce gez merkezden kaydı`);
    if (m.front && tilt===0) {
      const p=m.front.clone().applyMatrix4(m.root.matrixWorld).project(camera);
      assert.ok(Math.hypot(p.x,p.y)<1e-6, `${id}: gez/arpacık hizalı değil`);
    }
    const right=m.rightHand.clone().applyMatrix4(m.root.matrix), left=m.leftHand.clone().applyMatrix4(m.root.matrix);
    // Oyundaki gibi: dirsek elin tutuş yönünden (gripElbow)
    const rq=m.root.quaternion.clone().multiply(m.rightGrip), lq=m.root.quaternion.clone().multiply(m.leftGrip);
    poseArm(arms.right,gripElbow(rq,right,m.rightForearm,new THREE.Vector3()),right,new THREE.Vector3(.45,1,.1),rq);
    poseArm(arms.left,gripElbow(lq,left,m.leftForearm,new THREE.Vector3()),left,new THREE.Vector3(-.35,-1,0),lq);
    arms.left.g.updateMatrixWorld(true);arms.right.g.updateMatrixWorld(true);
    for(const x of [-.06,-.03,0,.03,.06]) for(const y of [0,.03,.06,.09]) {
      rays.setFromCamera(new THREE.Vector2(x,y),camera);
      assert.equal(rays.intersectObjects([arms.left.g,arms.right.g],true).length,0,`${id}: parmak/kol hedefi kapatıyor (${aspect}, ${x}, ${y})`);
    }
    if (sightFor(id).kind==='iron' && tilt===0) {
      rays.setFromCamera(new THREE.Vector2(0,.004),camera);
      const opaque=[];m.root.traverseVisible(o=>{if(o.isMesh&&!o.material.transparent)opaque.push(o);});
      const hit=rays.intersectObjects(opaque,false)[0];
      assert.ok(!hit,`${id}: nişan çizgisi gövdeye kapalı (${hit?.point.toArray()})`);
    }
    if (isScoped(id)) assert.ok(m.leftGrip && m.rightGrip, `${id}: dürbüne girerken tutuş hazır`);
  }
});

test('sabit tutuşta kol bileğe bağlıdır; dirsek değişince el silahın etrafında dönmez', () => {
  const arm=buildArms().left, hand=new THREE.Vector3(-.03,-.08,-.4), q=gripQuaternion(WEAPONS.ak47.grip.left, -1);
  for(const elbow of [new THREE.Vector3(-.3,-.5,0),new THREE.Vector3(-.4,-.3,-.1)]) {
    poseArm(arm,elbow,hand,new THREE.Vector3(0,-1,0),q);
    arm.g.updateMatrixWorld(true);
    const palm=new THREE.Vector3(0,0,HAND_VIEW.palmCenter).applyMatrix4(arm.hand.matrixWorld);
    assert.ok(palm.distanceTo(hand)<1e-12);
    assert.ok(arm.hand.quaternion.angleTo(q)<1e-7);
    const end=new THREE.Vector3(0,0,1).applyMatrix4(arm.fore.matrixWorld);
    const cuff=new THREE.Vector3(0,0,-(arm.natural ? HAND_VIEW.naturalCuffBack : HAND_VIEW.cuffBack)).applyMatrix4(arm.hand.matrixWorld);
    assert.ok(end.distanceTo(cuff)<1e-12, 'kol ile eldiven arasında boşluk');
  }
});

test('anatomik bilek: ön kolun dönüşü el sırtını izler ve dirsek uzaklığı insan ölçüsünde kalır',()=>{
 for(const [side,offset]of [['left',HAND_VIEW.elbowLeft],['right',HAND_VIEW.elbowRight]]){
  const arm=arms[side],hand=new THREE.Vector3(.03,-.12,-.3),elbow=hand.clone().add(v(offset));
  assert.ok(hand.distanceTo(elbow)>.25&&hand.distanceTo(elbow)<.4,'ön kol fazla uzamamalı');
  for(const turn of [-.7,0,.8]){
   const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(.3,turn,.5));poseArm(arm,elbow,hand,new THREE.Vector3(0,1,0),q);
   const forward=new THREE.Vector3(0,0,1).applyQuaternion(arm.fore.quaternion),back=new THREE.Vector3(0,1,0).applyQuaternion(q);
   back.addScaledVector(forward,-back.dot(forward)).normalize();
   assert.ok(new THREE.Vector3(0,1,0).applyQuaternion(arm.fore.quaternion).dot(back)>.999999,'kumaş bilekten bağımsız dönmemeli');
  }
 }
});

// Bilek kırık görünmesin: kavrayan elin ön kolu elin ekseninden en çok bilek sınırı kadar sapar; dirsek kalçada ve
// nişanda elin altında, kameraya doğru ve dışta (sol el solda, sağ el sağda) kalır: kollar ekranın alt köşelerinden gelir.
for (const id of WEAPON_ORDER.filter((id) => !WEAPONS[id].melee)) test(`${id}: kavrayan bilek anatomik, ön kol alttan ve dıştan gelir`, () => {
  const d=WEAPONS[id],m=models.get(id);
  for (const ads of [0,1]) {
    const position=ads ? new THREE.Vector3(-m.sight.x,-m.sight.y,-d.adsDist-m.sight.z) : new THREE.Vector3(...d.hip.pos);
    placeWeapon(m.root,position,ads ? new THREE.Euler() : new THREE.Euler(...(d.hip.rot || [0,0,0])),m.sight,m.adsAlign,ads);
    for (const [side,local,grip,fore] of [[-1,m.leftHand,m.leftGrip,m.leftForearm],[1,m.rightHand,m.rightGrip,m.rightForearm]]) {
      const hand=local.clone().applyMatrix4(m.root.matrix), q=m.root.quaternion.clone().multiply(grip);
      const elbow=gripElbow(q,hand,fore,new THREE.Vector3());
      const fingers=new THREE.Vector3(0,0,1).applyQuaternion(q), wrist=hand.clone().addScaledVector(fingers,-HAND_VIEW.palmCenter);
      const forearm=wrist.clone().sub(elbow).normalize();
      assert.ok(forearm.angleTo(fingers)<1.05,`${id}/${side}: bilek ${forearm.angleTo(fingers).toFixed(2)} rad bükük`);
      assert.ok(elbow.y<wrist.y,`${id}/${side}: dirsek elin üstünde`);
      assert.ok(elbow.z>wrist.z,`${id}/${side}: dirsek elin önünde`);
      assert.ok(side*(elbow.x-wrist.x)>-.02,`${id}/${side}: ön kol içeriden geliyor`);
    }
  }
});
