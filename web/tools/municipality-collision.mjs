// Mimari üçgenlerin düz yüzlerini 20 cm hücrelerle örter; kapı boşluğu ve merdiven basamakları korunur.
import {NodeIO} from '@gltf-transform/core';import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import * as T from 'three';import {writeFileSync} from 'node:fs';
const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(process.argv[2]);
const planes=new Map(),step=.2;
for(const node of doc.getRoot().listNodes()){
 if(!node.getMesh()||!/^(House_House|Wall_|Stairs_|Pavement_)/.test(node.getName()))continue;
 const matrix=new T.Matrix4().fromArray(node.getWorldMatrix());
 for(const p of node.getMesh().listPrimitives()){
 const a=p.getAttribute('POSITION'),idx=p.getIndices(),point=i=>new T.Vector3().fromArray(a.getArray(),i*3).applyMatrix4(matrix).multiply(new T.Vector3(2,1,2)).add(new T.Vector3(0,-.132425,0));
 for(let i=0;i<idx.getCount();i+=3){
 const vs=[0,1,2].map(k=>point(idx.getScalar(i+k))),normal=vs[1].clone().sub(vs[0]).cross(vs[2].clone().sub(vs[0])).normalize();
 const ns=normal.toArray().map(Math.abs),axis=ns.indexOf(Math.max(...ns));if(ns[axis]<.999)continue;
 const other=[0,1,2].filter(n=>n!==axis),height=Math.round(vs[0].getComponent(axis)*100)/100;
 const key=axis+':'+height;let pl=planes.get(key);if(!pl){pl={axis,other,height,cells:new Set()};planes.set(key,pl)}
 const points=vs.map(v=>other.map(n=>v.getComponent(n))),min=other.map(n=>Math.min(...vs.map(v=>v.getComponent(n)))),max=other.map(n=>Math.max(...vs.map(v=>v.getComponent(n))));
 const sign=(p,a,b)=>(p[0]-b[0])*(a[1]-b[1])-(a[0]-b[0])*(p[1]-b[1]);
 for(let x=Math.floor(min[0]/step);x<Math.ceil(max[0]/step);x++)for(let y=Math.floor(min[1]/step);y<Math.ceil(max[1]/step);y++){
 const q=[(x+.5)*step,(y+.5)*step],d=[sign(q,points[0],points[1]),sign(q,points[1],points[2]),sign(q,points[2],points[0])];
 if(!(d.some(v=>v<-.005)&&d.some(v=>v>.005)))pl.cells.add(`${x},${y}`);
 }
 }
 }
}
const boxes=[];for(const pl of planes.values()){
 while(pl.cells.size){const[x,y]=pl.cells.values().next().value.split(',').map(Number);let w=1,h=1;while(pl.cells.has(`${x+w},${y}`))w++;outer:while(true){for(let xx=x;xx<x+w;xx++)if(!pl.cells.has(`${xx},${y+h}`))break outer;h++;}
 for(let xx=x;xx<x+w;xx++)for(let yy=y;yy<y+h;yy++)pl.cells.delete(`${xx},${yy}`);
 const lo=[0,0,0],hi=[0,0,0];lo[pl.axis]=pl.height-.025;hi[pl.axis]=pl.height+.025;lo[pl.other[0]]=x*step;hi[pl.other[0]]=(x+w)*step;lo[pl.other[1]]=y*step;hi[pl.other[1]]=(y+h)*step;
 if(hi[1]>.03)boxes.push([...lo,...hi].map(v=>+v.toFixed(3)));
 }
}
writeFileSync('src/maps/municipality-building.json',JSON.stringify(boxes)+'\n');console.log(boxes.length,'architectural boxes');
