import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Viewmodel } from '../src/viewmodel.js';
import { WEAPONS, WEAPON_ORDER } from '../src/config.js';
import { loadWeaponAsset, assetIdFor } from '../src/assets.js';
import { sightFor, isScoped, canAim } from '../src/sights.js';
import { scopeSvg } from '../src/reticles.js';
import { weaponName } from '../src/weaponInfo.js';

document.body.innerHTML = `<style>
*{box-sizing:border-box}body{margin:0;background:#161b20;color:#e9e4d8;font:14px system-ui}header{padding:14px;position:sticky;top:0;background:#161b20;z-index:2}label{margin-right:16px}select,button,input{font:inherit}button,select{padding:7px}h1{font-size:20px;margin:0 0 10px}#stage{position:relative;width:100%;aspect-ratio:16/9;max-height:680px;background:#a5b0b2;overflow:hidden}#stage canvas{width:100%;height:100%;object-fit:contain}.target{position:absolute;inset:0;background:linear-gradient(90deg,transparent calc(50% - .5px),#4b5d5f calc(50% - .5px),#4b5d5f calc(50% + .5px),transparent calc(50% + .5px)),linear-gradient(transparent calc(50% - .5px),#4b5d5f calc(50% - .5px),#4b5d5f calc(50% + .5px),transparent calc(50% + .5px));pointer-events:none}.target:after{content:'';position:absolute;width:38px;height:38px;border:2px solid #a14236;border-radius:50%;left:50%;top:50%;transform:translate(-50%,-50%)}#scope{position:absolute;inset:0;pointer-events:none;display:flex;align-items:center;justify-content:center}#scope svg{height:100%;width:auto}#status,#detail{padding:12px}#gallery{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:8px}.card{background:#242c33;padding:6px}.card img{width:100%;display:block;background:#a5b0b2}.card button{width:100%;color:inherit;background:transparent;border:0;text-align:left}.card p{margin:3px;font-size:12px}.fail{color:#ff8a72}pre{display:none;white-space:pre-wrap;padding:12px}
</style><header><h1>Her silah için nişan ve el kontrolü</h1><label>Silah <select id="weapon"></select></label><label>Nişan <input id="aim" type="range" min="0" max="1" step=".05" value="1"></label><label><input type="checkbox" id="hands" checked> Eller</label><button id="refresh">Tümünü tara</button><button id="portrait">Dikey görünüm</button></header><div id="status">Modeller yükleniyor…</div><div id="stage"><div class="target"></div><div id="scope"></div></div><div id="detail"></div><div id="gallery"></div><pre id="report"></pre>`;

const ids = WEAPON_ORDER;
const select = document.querySelector('#weapon');
for (const id of ids) select.add(new Option(weaponName(id), id));
select.value = 'ak47';
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setClearColor(0xa5b0b2, 0); renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
const pm = new THREE.PMREMGenerator(renderer);
const env = pm.fromScene(new RoomEnvironment(), .04).texture; pm.dispose();
const game = {
  camera: new THREE.PerspectiveCamera(70, 16 / 9, .01, 100), sunDir: new THREE.Vector3(-.3,.8,.4).normalize(),
  world: { raycast: () => null },
  player: { adsT:1,alive:true,down:false,sprinting:false,grounded:true,horizSpeed:0,stepPhase:0,lookDX:0,lookDY:0,vel:new THREE.Vector3(),yaw:0,landDip:0,crouchT:0 },
  weapons: { state:'idle',stateT:0,time:0,reloadInfo:()=>null,boltInfo:()=>-1 },
};
const view = new Viewmodel(game, {}); view.setEnvironment(env);
await Promise.all(ids.filter(id=>WEAPONS[id].model==='glb').map(id=>loadWeaponAsset(assetIdFor(WEAPONS[id]))));
await Promise.resolve();
document.querySelector('#stage').append(renderer.domElement);
const ray = new THREE.Raycaster();
const metrics = [];
const scopeMarkup = id => `<svg viewBox="-100 -100 200 200" style="height:100%;width:auto;max-width:100%">${scopeSvg(sightFor(id))}</svg>`;
function setWeapon(id, aim=1) {
  const d = WEAPONS[id]; game.weapons.current = { id,data:d,mag:d.magSize,pumpT:-1,spin:0,lastShot:-100 };
  game.player.adsT = aim; view.time=0; view.update(0); view.scene.updateMatrixWorld(true);
  view.arms.left.g.visible &&= document.querySelector('#hands').checked;
  view.arms.right.g.visible = document.querySelector('#hands').checked;
}
function check(id) {
  const m = view.models[id];
  const p = m.sight.clone().applyMatrix4(m.root.matrix).project(view.camera);
  let handHits=0;
  if (canAim(id) && !isScoped(id)) for(const x of [-.035,0,.035]) for(const y of [0,.035,.07]) {
    ray.setFromCamera(new THREE.Vector2(x,y),view.camera);
    handHits += ray.intersectObjects([view.arms.left.g,view.arms.right.g],true).length ? 1:0;
  }
  return {id,name:weaponName(id),kind:sightFor(id).kind,glb:!!m.glb,eyeDistance:WEAPONS[id].adsDist,fov:WEAPONS[id].ads.vmFov,sightErrorPx:Math.hypot(p.x*480,p.y*270),handHits};
}
function draw(w,h) {renderer.setSize(w,h,false);view.resize(w/h);renderer.render(view.scene,view.camera);}
function show(id) {
  select.value=id; setWeapon(id,Number(document.querySelector('#aim').value));
  const stage=document.querySelector('#stage'), w=stage.clientWidth, h=stage.clientHeight; draw(w,h);
  document.querySelector('#scope').innerHTML=isScoped(id)&&game.player.adsT>.86?scopeMarkup(id):'';
  const a=check(id); document.querySelector('#detail').textContent=`${a.name} · Göz ${a.eyeDistance} m · Silah görüş açısı ${a.fov}° · Nişan sapması ${a.sightErrorPx.toFixed(3)} px · Merkezde el ${a.handHits}/9`;
}
async function scan() {
  document.querySelector('#status').textContent='Taranıyor…'; metrics.length=0; document.querySelector('#gallery').replaceChildren();
  for(const id of ids){
    setWeapon(id); draw(640,360); const a=check(id); metrics.push(a);
    const card=document.createElement('article');card.className='card';card.id=`check-${id}`;
    const b=document.createElement('button');b.textContent=`${a.name} · ${a.kind}`;b.onclick=()=>show(id);
    const img=new Image();img.src=renderer.domElement.toDataURL('image/png');
    const p=document.createElement('p');p.textContent=`${a.eyeDistance} m / ${a.fov}° · el ${a.handHits}/9`;if(a.handHits)p.className='fail';
    const frame=document.createElement('div');frame.style.position='relative';frame.append(img);
    if(isScoped(id)) {const overlay=document.createElement('div');overlay.style.cssText='position:absolute;inset:0;display:flex;justify-content:center';overlay.innerHTML=scopeMarkup(id);frame.append(overlay);}
    card.append(b,frame,p);document.querySelector('#gallery').append(card);
    await new Promise(requestAnimationFrame);
  }
  document.querySelector('#report').textContent=JSON.stringify(metrics,null,2);
  document.querySelector('#status').textContent=`${ids.length} silah tarandı · ${metrics.filter(a=>a.handHits).length} silahın nişan hattında el var`;
  show(select.value);
}
select.onchange=()=>show(select.value);document.querySelector('#aim').oninput=()=>show(select.value);
document.querySelector('#hands').onchange=()=>scan();document.querySelector('#refresh').onclick=()=>scan();
document.querySelector('#portrait').onclick=()=>{const e=document.querySelector('#stage');const portrait=e.style.aspectRatio!=='9 / 16';e.style.aspectRatio=portrait?'9 / 16':'16 / 9';e.style.width=portrait?'min(100%, 382px)':'100%';show(select.value);};
window.addEventListener('resize',()=>show(select.value));
const animations=document.createElement('button');animations.textContent='Animasyonları denetle';animations.id='animations';document.querySelector('header').append(animations);
animations.onclick=async()=>{
  const results=[];
  for(const id of ids){
    setWeapon(id,0);const d=WEAPONS[id];let frames=0;
    const step=()=>{view.update(1/60);view.scene.updateMatrixWorld(true);frames++;view.scene.traverse(o=>{if(!o.matrixWorld.elements.every(Number.isFinite))throw new Error(`${id}: sonlu olmayan dönüş (${o.name})`);});};
    game.weapons.state='reloading';
    if(d.reloadType==='shell') for(const phase of ['start','loop','end']) for(let k=0;k<=1;k+=.04){game.weapons.reloadInfo=()=>({type:'shell',phase,k,empty:true});step();}
    else if(!d.melee) for(let k=0;k<=1;k+=.02){game.weapons.reloadInfo=()=>({type:'mag',k,empty:true,insertAt:d.ammoInsertAt});step();}
    game.weapons.reloadInfo=()=>null;game.weapons.state='idle';
    if(!d.melee){view.onFire(game.weapons.current);for(let t=0;t<.8;t+=1/60){game.weapons.current.pumpT=t;game.weapons.boltInfo=()=>d.bolt?t/.8:-1;step();}}
    game.weapons.current.pumpT=-1;game.weapons.boltInfo=()=>-1;
    for(let k=0;k<=1;k+=.025){game.player.adsT=k;step();}
    results.push({id,frames,finite:true});
    await new Promise(requestAnimationFrame);
  }
  document.querySelector('#animationReport')?.remove();const r=document.createElement('pre');r.id='animationReport';r.textContent=JSON.stringify(results);document.body.append(r);
  document.querySelector('#status').textContent=`${results.length} silahın şarjör, fişek, pompa, sürgü ve nişan geçişi denetlendi · tüm dönüşler geçerli`;
  show(select.value);
};
await scan();
