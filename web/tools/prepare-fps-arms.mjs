// CC BY taktik eldiven ve üniformadan yalnız eller/ön kollar: doğru anatomik taban, kapalı kavrama, korunmuş UV.
import * as T from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {NodeIO,Document} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {prune} from '@gltf-transform/functions';
import {readFileSync,writeFileSync,statSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const source='../SourceAssets/Sketchfab/fps_arms_danlyvostok/original/soldier_full_tactical_gear.glb';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),src=await io.read(source),credit=src.getRoot().getAsset().extras;
const specs={};
for(const [name,id] of [['Mark_Gloves_1','FPSGloves'],['Mark_Kitel_1','FPSSleeves']]){
 const m=src.getRoot().listMaterials().find(m=>m.getName()===name);specs[id]={};
 for(const [slot,t] of [['map',m.getBaseColorTexture()],['normalMap',m.getNormalTexture()],['ormMap',m.getMetallicRoughnessTexture()]]){
  if(!t)continue;const file=`assets/props/${id.toLowerCase()}_${slot}.jpg`;
  const py="import io,sys\nfrom PIL import Image\nim=Image.open(io.BytesIO(sys.stdin.buffer.read()));im.thumbnail((1024,1024),Image.Resampling.LANCZOS);im.convert('RGB').save(sys.stdout.buffer,format='JPEG',quality=94,subsampling=0)";
  const p=spawnSync(process.env.TEXTURE_PYTHON||'python3',['-c',py],{input:Buffer.from(t.getImage()),maxBuffer:20e6});
  if(p.status)throw Error(p.stderr.toString());writeFileSync(file,p.stdout);specs[id][slot]=file;
 }
}
// CPU pozu için dokusuz kopya: görseller ayrı tutulur; Three.js burada tarayıcı gerektirmez.
const mats=new Map();for(const mesh of src.getRoot().listMeshes())for(const p of mesh.listPrimitives()){
 const name=p.getMaterial()?.getName()||'';if(!mats.has(name))mats.set(name,src.createMaterial(name));p.setMaterial(mats.get(name));
}
await src.transform(prune({keepAttributes:true,keepLeaves:true}));const data=await io.writeBinary(src);
const scene=(await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'')).scene;
scene.updateMatrixWorld(true);const bones={};scene.traverse(o=>{if(o.isBone)bones[o.name]=o});
const bone=(side,key)=>Object.values(bones).find(b=>b.name.startsWith(`CC_Base_${side}_${key}_`));
const at=b=>b.getWorldPosition(new T.Vector3()),frames={};
for(const side of ['L','R']){
 const wrist=at(bone(side,'Hand')),elbow=at(bone(side,'Forearm'));
 const fw=at(bone(side,'Mid1')).sub(wrist).normalize();
 const across=at(bone(side,'Index1')).sub(at(bone(side,'Pinky1')));across.addScaledVector(fw,-across.dot(fw)).normalize();
 const x=across.multiplyScalar(side==='R'?1:-1),back=fw.clone().cross(x).normalize();
 const inv=new T.Matrix4().makeBasis(x,back,fw).invert();
 const fz=wrist.clone().sub(elbow).normalize(),fy=back.clone().addScaledVector(fz,-back.dot(fz)).normalize(),fx=fy.clone().cross(fz).normalize();
 frames[side]={wrist,elbow,inv,foreInv:new T.Matrix4().makeBasis(fx,fy,fz).invert(),length:wrist.distanceTo(elbow),scale:.085/wrist.distanceTo(at(bone(side,'Mid1')))};
 // Dönüş eksenleri dinlenme pozunda alınır; ebeveyn bükülmesi çocuğun eksenini değiştirmesin.
 const poses=[];
 for(const [f,angles]of Object.entries({Index:side==='R'?[.25,.55,.35]:[.65,.95,.55],Mid:[.8,1.05,.65],Ring:[.85,1.1,.65],Pinky:[.9,1,.6]}))for(let i=0;i<angles.length;i++){
  const b=Object.values(bones).find(b=>b.name.startsWith(`CC_Base_${side}_${f}${i+1}_`));if(!b)continue;
  const axis=x.clone().applyQuaternion(b.getWorldQuaternion(new T.Quaternion()).invert());poses.push([b,new T.Quaternion().setFromAxisAngle(axis,angles[i])]);
 }
 for(const[b,q]of poses)b.quaternion.multiply(q);
}
scene.updateMatrixWorld(true);scene.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.update()});
const doc=new Document(),buffer=doc.createBuffer(),out=doc.createScene(),materials={};
for(const id of ['FPSGloves','FPSSleeves'])materials[id]=doc.createMaterial(id).setRoughnessFactor(.9).setMetallicFactor(0);
const acc=(type,array)=>doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
const clip=(poly,z,above)=>{const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],ia=above?a.p.z>=z:a.p.z<=z,ib=above?b.p.z>=z:b.p.z<=z;if(ia)out.push(a);if(ia!==ib){const t=(z-a.p.z)/(b.p.z-a.p.z);out.push({p:a.p.clone().lerp(b.p,t),uv:a.uv.clone().lerp(b.uv,t)})}}return out};
let tris=0;
for(const [side,name]of [['L','Left'],['R','Right']])for(const part of ['Hand','Fore']){
 const F=frames[side],P=[],UV=[],I=[],wanted=part==='Hand'?'Mark_Gloves_1':'Mark_Kitel_1';
 scene.traverse(o=>{
  if(!o.isSkinnedMesh||o.material.name!==wanted)return;
  const geo=o.geometry,idx=geo.index,si=geo.attributes.skinIndex,sw=geo.attributes.skinWeight;
  const weight=i=>{let w=0;for(let k=0;k<4;k++){const n=o.skeleton.bones[si.getComponent(i,k)]?.name||'';if(n.startsWith(`CC_Base_${side}_`)&&(part==='Hand'?/_(Hand|Index|Mid|Ring|Pinky|Thumb)/.test(n):/_(Forearm|Elbow)/.test(n)))w+=sw.getComponent(i,k)}return w};
  const local=i=>{const p=new T.Vector3().fromBufferAttribute(geo.attributes.position,i);o.applyBoneTransform(i,p);p.applyMatrix4(o.matrixWorld);if(part==='Hand')return p.sub(F.wrist).applyMatrix4(F.inv).multiplyScalar(F.scale);p.sub(F.elbow).applyMatrix4(F.foreInv);p.z/=F.length;return p};
  for(let t=0;t<idx.count;t+=3){const ids=[0,1,2].map(k=>idx.getX(t+k));if(ids.every(i=>weight(i)<.2))continue;
   let poly=ids.map(i=>({p:local(i),uv:new T.Vector2(geo.attributes.uv.getX(i),geo.attributes.uv.getY(i))}));
   poly=clip(poly,part==='Hand'?-.04:0,true);if(part==='Fore')poly=clip(poly,1,false);
   for(let k=1;k<poly.length-1;k++)for(const v of [poly[0],poly[k],poly[k+1]]){I.push(P.length/3);P.push(...v.p.toArray());UV.push(...v.uv.toArray())}
  }
 });
 let geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(P,3));geo.setAttribute('uv',new T.Float32BufferAttribute(UV,2));geo.setIndex(I);geo=mergeVertices(geo,.000005);geo.computeVertexNormals();
 const prim=doc.createPrimitive().setAttribute('POSITION',acc('VEC3',geo.attributes.position.array)).setAttribute('NORMAL',acc('VEC3',geo.attributes.normal.array)).setAttribute('TEXCOORD_0',acc('VEC2',geo.attributes.uv.array)).setIndices(acc('SCALAR',new Uint16Array(geo.index.array))).setMaterial(materials[part==='Hand'?'FPSGloves':'FPSSleeves']);
 out.addChild(doc.createNode(name+part).setMesh(doc.createMesh(name+part).addPrimitive(prim)));tris+=I.length/3;
 console.log(name,part,I.length/3,new T.Box3().setFromBufferAttribute(geo.attributes.position));
}
await io.write('assets/props/fps-arms.glb',doc);
const cat=JSON.parse(readFileSync('src/propAssets.json'));cat.fpsArms={file:'assets/props/fps-arms.glb',kind:'arms',materials:specs,credit,tris,bytes:statSync('assets/props/fps-arms.glb').size,changes:'Detailed tactical gloves and sleeves extracted; anatomical wrist/palm frames, finger grip, continuous cuff and UVs adapted for first person.'};writeFileSync('src/propAssets.json',JSON.stringify(cat,null,2)+'\n');
writeFileSync('../SourceAssets/Sketchfab/fps_arms_danlyvostok/asset_info.json',JSON.stringify({...credit,sha256:createHash('sha256').update(readFileSync(source)).digest('hex'),changes:cat.fpsArms.changes,tris,bytes:cat.fpsArms.bytes},null,2)+'\n');
