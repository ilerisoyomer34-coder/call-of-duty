// Lisanslı manga modelinin anatomik elleri: deriden kavrama pozu pişirilir; aynı nişan çerçevesine yerleşir.
import * as T from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {NodeIO} from '@gltf-transform/core';
import {readFileSync,writeFileSync,statSync} from 'node:fs';
import {SOLDIER_ANIM} from '../src/config.js';
const bytes=readFileSync('assets/characters/squad_forest.glb');
const scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;scene.updateMatrixWorld(true);
const bones={};scene.traverse(o=>{if(o.isBone)bones[o.name]=o});
const at=n=>new T.Vector3().setFromMatrixPosition(bones[n].matrixWorld);
const frames={};
for(const side of ['Left','Right']){
 const wrist=at(side+'Hand'),elbow=at(side+'ForeArm'),fw=at(side+'HandMiddle1').sub(wrist).normalize(),up=new T.Vector3(0,1,0),x=up.clone().cross(fw).normalize();
 const inv=new T.Matrix4().makeBasis(x,up,fw).invert();frames[side]={wrist,elbow,fw,inv};
 const axis=fw.clone().cross(new T.Vector3(0,-1,0)).normalize();
 for(const[f,angles]of Object.entries(SOLDIER_ANIM.gripCurl[side]))for(let i=0;i<angles.length;i++){
 const b=bones[side+'Hand'+f+(i+1)];if(!b)continue;const q=b.getWorldQuaternion(new T.Quaternion()).invert();b.quaternion.multiply(new T.Quaternion().setFromAxisAngle(axis.clone().applyQuaternion(q),angles[i]));
 }
}
scene.updateMatrixWorld(true);scene.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.update()});
const io=new NodeIO();
const {Document}=await import('@gltf-transform/core');const doc=new Document(),buf=doc.createBuffer(),out=doc.createScene();
const makeAcc=(name,type,array)=>doc.createAccessor(name).setType(type).setArray(array).setBuffer(buf);
let count=0;
for(const side of ['Left','Right'])for(const part of ['Hand','Fore']){
 const F=frames[side],P=[],UV=[],I=[];
 scene.traverse(o=>{
 if(!o.isSkinnedMesh||!/body/.test(o.name))return;const geo=o.geometry,si=geo.attributes.skinIndex,sw=geo.attributes.skinWeight,idx=geo.index;
 const weights=(i)=>{let n=0;for(let k=0;k<4;k++){const name=o.skeleton.bones[si.getComponent(i,k)]?.name||'';if(name.startsWith(side+'Hand')||(part==='Fore'&&name===side+'ForeArm'))n+=sw.getComponent(i,k)}return n};
 const point=i=>{const p=new T.Vector3().fromBufferAttribute(geo.attributes.position,i);o.applyBoneTransform(i,p);return p.applyMatrix4(o.matrixWorld)};
 const local=i=>{const p=point(i);if(part==='Hand')return p.sub(F.wrist).applyMatrix4(F.inv);const z=F.wrist.clone().sub(F.elbow).normalize(),y=new T.Vector3(0,1,0),x=y.clone().cross(z).normalize();const v=p.sub(F.elbow);return new T.Vector3(v.dot(x),v.dot(y),v.dot(z)/F.elbow.distanceTo(F.wrist));};
 const clip=(poly,z,keepAbove)=>{
   const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],ina=keepAbove?a.p.z>=z:a.p.z<=z,inb=keepAbove?b.p.z>=z:b.p.z<=z;
     if(ina)out.push(a);if(ina!==inb){const t=(z-a.p.z)/(b.p.z-a.p.z);out.push({p:a.p.clone().lerp(b.p,t),uv:a.uv.clone().lerp(b.uv,t)})}}
   return out;
 };
 for(let t=0;t<idx.count;t+=3){const ids=[idx.getX(t),idx.getX(t+1),idx.getX(t+2)];if(ids.every(i=>weights(i)<.3))continue;
 let poly=ids.map(i=>({p:local(i),uv:new T.Vector2(geo.attributes.uv.getX(i),geo.attributes.uv.getY(i))}));
 poly=clip(poly,part==='Hand'?-.025:0,true);if(part==='Fore')poly=clip(poly,1,false);
 for(let k=1;k<poly.length-1;k++)for(const v of [poly[0],poly[k],poly[k+1]]){I.push(P.length/3);P.push(...v.p.toArray());UV.push(...v.uv.toArray());}
 }
 });
 let tg=new T.BufferGeometry();tg.setAttribute('position',new T.Float32BufferAttribute(P,3));tg.setAttribute('uv',new T.Float32BufferAttribute(UV,2));tg.setIndex(I);
 tg=mergeVertices(tg,.00001);tg.computeVertexNormals();
 const prim=doc.createPrimitive().setAttribute('POSITION',makeAcc('position','VEC3',tg.attributes.position.array)).setAttribute('TEXCOORD_0',makeAcc('uv','VEC2',tg.attributes.uv.array)).setIndices(makeAcc('indices','SCALAR',new Uint16Array(tg.index.array))).setAttribute('NORMAL',makeAcc('normal','VEC3',tg.attributes.normal.array));
 const mesh=doc.createMesh(side+part).addPrimitive(prim);out.addChild(doc.createNode(side+part).setMesh(mesh));console.log(side,part,P.length/3,I.length/3,new T.Box3().setFromBufferAttribute(tg.attributes.position));count+=I.length/3;
}
await io.write('assets/props/fps-arms.glb',doc);
const cat=JSON.parse(readFileSync('src/propAssets.json'));const chars=JSON.parse(readFileSync('src/characterAssets.json'));cat.fpsArms={file:'assets/props/fps-arms.glb',kind:'arms',bytes:statSync('assets/props/fps-arms.glb').size,materials:{'':chars.squad_forest.materials.squad_forest_body},credit:chars.squad_forest.credit,tris:count,changes:'Hands and forearms extracted from licensed squad model; finger grip pose baked; viewmodel coordinate frames adapted.'};writeFileSync('src/propAssets.json',JSON.stringify(cat,null,2)+'\n');
