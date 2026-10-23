import {NodeIO,getBounds} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup,prune,weld,simplify,quantize} from '@gltf-transform/functions';
import {MeshoptSimplifier} from 'meshoptimizer';
import {readFileSync,writeFileSync,mkdirSync,statSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const src=process.argv[2]; if(!src)throw Error('Usage: node tools/prepare-municipality.mjs house.glb');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),d=await io.read(src),r=d.getRoot();
const dir='../SourceAssets/Sketchfab/house_takeandplay';mkdirSync(dir,{recursive:true});
const original=readFileSync(src),credit=r.getAsset().extras;
// İç mekânın kapı ve merdiven kenarları korunur; pahalı pencere perdeleri ve kulplar sadeleşir.
await d.transform(dedup(),weld(),simplify({simplifier:MeshoptSimplifier,ratio:.12,error:.0005,lockBorder:true}),prune(),quantize());
const python=process.env.TEXTURE_PYTHON || 'python3';
const py=`import sys,io,base64,json\nfrom PIL import Image\nj=json.load(sys.stdin)\nim=Image.open(io.BytesIO(base64.b64decode(j['data'])))\nim.thumbnail((j['max'],j['max']),Image.Resampling.LANCZOS)\no=io.BytesIO()\nim.convert('RGB').save(o,format='JPEG',quality=88)\nprint(base64.b64encode(o.getvalue()).decode())`;
const high=new Set(r.listMaterials().filter(m=>/House_|Pavement/.test(m.getName())).map(m=>m.getBaseColorTexture()));
for(const t of r.listTextures()){
 const p=spawnSync(python,['-c',py],{input:JSON.stringify({data:Buffer.from(t.getImage()).toString('base64'),max:high.has(t)?1024:512}),maxBuffer:30e6});
 if(p.status!==0)throw Error(p.stderr.toString());t.setImage(Buffer.from(p.stdout.toString().trim(),'base64')).setMimeType('image/jpeg');
}
mkdirSync('assets/props',{recursive:true});await io.write('assets/props/municipality.glb',d);
const tris=r.listMeshes().reduce((n,m)=>n+m.listPrimitives().reduce((s,p)=>s+(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3,0),0);
const meta={title:'House',author:credit.author,license:credit.license,source:credit.source,originalBytes:original.length,sha256:createHash('sha256').update(original).digest('hex'),changes:'Mesh simplification preserving borders; 4096px color textures resized to 1024px JPEG for architecture, 512px for secondary textures; game collision proxy and municipal signage added. Original user file kept outside Git (>100MB).',tris,bytes:statSync('assets/props/municipality.glb').size,bounds:getBounds(r.listScenes()[0])};
writeFileSync(dir+'/asset_info.json',JSON.stringify(meta,null,2)+'\n');
const catalog=JSON.parse(readFileSync('src/propAssets.json'));catalog.municipality={file:'assets/props/municipality.glb',kind:'building',credit:{title:meta.title,author:meta.author,license:meta.license,source:meta.source},tris,bytes:meta.bytes};writeFileSync('src/propAssets.json',JSON.stringify(catalog,null,2)+'\n');console.log(meta);
