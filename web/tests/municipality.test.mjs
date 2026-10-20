import {test} from 'node:test';import assert from 'node:assert/strict';
import {TerminalSecurity} from '../src/terminalSecurity.js';
import {build} from '../src/maps/municipality.js';import {CollisionWorld} from '../shared/sim/collision.js';import {NavGrid} from '../shared/sim/nav.js';import {LEVELS} from '../src/config.js';
test('belediye bilgisayarı: iki röle, muhafız kilidi, tek alarm ve kontrol noktasına dönüş',()=>{
 const s=new TerminalSecurity([{id:'west'},{id:'server'}]);assert.equal(s.canAccess(0),false);assert.equal(s.disable('invalid'),false);s.disable('west');assert.equal(s.disable('west'),false);const c=s.snapshot();s.disable('server');assert.equal(s.canAccess(1),false);assert.equal(s.canAccess(0),true);assert.equal(s.begin(),true);assert.equal(s.begin(),false);s.restore(c);assert.equal(s.alarm,false);assert.equal(s.canAccess(0),false);s.disable('server');assert.equal(s.begin(),true);
});
test('belediye: üç katta yoğun savunma, erişilebilir terminal ve merdiven yolu',()=>{
 const w=new CollisionWorld(),d=build(w),nav=new NavGrid(w,.38);
 nav.generateCovers();assert.equal(nav.coversNear(d.laptop.pos,20).length,0,'üst kattaki manga alt kattaki sipere gitmez');
 const nearby=nav.randomPointNear(w.newVec(2,8.055,-19),1);assert.ok(nearby && Math.abs(nearby.y-8.055)<.1);
 assert.equal(d.laptop.floor,8.055);assert.ok(d.laptop.pos.y>8.8);
 assert.equal(d.enemies.length,58);assert.equal(d.reinforcements.length,8);
 for(const y of [.025,4.055,8.055]) assert.ok(d.enemies.filter(e=>e.stationary&&Math.abs(e.pos.y-y)<.1).length>=12);
 for(const e of d.enemies.filter(e=>e.stationary))assert.ok(w.canStand(e.pos,.38,.46,1.8),`muhafız duvar içinde: ${JSON.stringify(e.pos)}`);
 for(const q of [...d.enemies,...d.reinforcements,...d.checkpoints]){
  const p=q.pos,path=nav.findPath(d.playerStart.pos,p);assert.ok(path?.length,`${q.type||'hedef'} yolu yok: ${JSON.stringify(p)}`);const last=path.at(-1);assert.ok(Math.hypot(last.x-p.x,last.z-p.z)<2,'son yol noktası hedefe ulaşmıyor');
 }
 for(const r of d.terminal.relays){const floorPos=w.newVec(r.pos.x,r.floor,r.pos.z);assert.ok(nav.findPath(d.playerStart.pos,floorPos)?.length);}
 const approach=w.newVec(d.laptop.pos.x,d.laptop.floor,d.laptop.pos.z+1.5);
 assert.ok(w.lineOfSight(w.newVec(approach.x,approach.y+1.65,approach.z),d.laptop.pos),'ekrandaki terminale masanın önünden erişilir');
 const path=nav.findPath(d.playerStart.pos,approach);assert.ok(path.some(p=>p.y>3&&p.y<5)&&path.some(p=>p.y>6&&p.y<8),'yol iki merdiveni kullanır');
 // Gerçek karakter çarpışması ve yürüyüş ivmesi: çıkış ve geri iniş, ışınlanma olmadan.
 const st={pos:{...d.playerStart.pos},vel:{x:0,y:0,z:0},radius:.38,height:1.8,gravity:15,grounded:true};
 const walk=(route)=>{let i=0;for(let t=0;t<60*180&&i<route.length;t++){
   const p=route[i],dx=p.x-st.pos.x,dz=p.z-st.pos.z,dist=Math.hypot(dx,dz);
   if(dist<.18&&Math.abs(p.y-st.pos.y)<.5){i++;continue;}
   const speed=Math.min(3,dist*4),blend=1-Math.exp(-8/60);st.vel.x+=(dx/dist*speed-st.vel.x)*blend;st.vel.z+=(dz/dist*speed-st.vel.z)*blend;w.moveCharacter(st,1/60,.45);
  }assert.equal(i,route.length,`merdivende takıldı: ${JSON.stringify(st.pos)}`);};
 walk(path);assert.ok(Math.abs(st.pos.y-d.laptop.floor)<.05);walk(nav.findPath(st.pos,d.playerStart.pos));assert.ok(st.pos.y<.1);
 assert.deepEqual(LEVELS.find(l=>l.map==='municipality').objectives,['outpost','robots','intel']);
});

test('gerçek oyuncu etkileşimi: 8 saniyeden önce erişim yok, bırakınca sıfırlanır, alarm tek kez çalar', async()=>{
 const {Player}=await import('../src/player.js');const THREE=await import('three');
 const security=new TerminalSecurity([{id:'west'},{id:'server'}]);security.disable('west');security.disable('server');
 let completed=0,alarms=0,held=true;
 const target={time:8,onStart:()=>{if(security.begin())alarms++},action:()=>completed++};
 const player={game:{camera:new THREE.PerspectiveCamera(),findInteractable:()=>target,events:{emit(){}},weapons:{state:'idle'}},eyePos:new THREE.Vector3(),stopSprint(){},interactT:0,interacting:false,interactTarget:null};
 const input={isDown:()=>held,pressed:()=>false},tick=()=>Player.prototype.updateInteraction.call(player,1/60,input);
 for(let n=0;n<360;n++)tick();assert.equal(completed,0);assert.equal(alarms,1);
 held=false;tick();assert.equal(player.interactT,0);held=true;
 for(let n=0;n<479;n++)tick();assert.equal(completed,0);assert.equal(alarms,1);
 for(let n=0;n<2;n++)tick();assert.equal(completed,1);assert.equal(alarms,1);
});
