import {test} from 'node:test';import assert from 'node:assert/strict';
import {TerminalSecurity} from '../src/terminalSecurity.js';
import {build} from '../src/maps/municipality.js';import {CollisionWorld} from '../shared/sim/collision.js';import {NavGrid} from '../shared/sim/nav.js';import {LEVELS} from '../src/config.js';
test('belediye bilgisayarı: iki röle, muhafız kilidi, tek alarm ve kontrol noktasına dönüş',()=>{
 const s=new TerminalSecurity([{id:'west'},{id:'server'}]);assert.equal(s.canAccess(0),false);assert.equal(s.disable('invalid'),false);s.disable('west');assert.equal(s.disable('west'),false);const c=s.snapshot();s.disable('server');assert.equal(s.canAccess(1),false);assert.equal(s.canAccess(0),true);assert.equal(s.begin(),true);assert.equal(s.begin(),false);s.restore(c);assert.equal(s.alarm,false);assert.equal(s.canAccess(0),false);s.disable('server');assert.equal(s.begin(),true);
});
test('belediye: terminal, röleler, askerler ve iki giriş manga yoluyla erişilebilir',()=>{
 const w=new CollisionWorld(),d=build(w),nav=new NavGrid(w);
 for(const q of [d.laptop,...d.terminal.relays,...d.enemies,...d.reinforcements,...d.checkpoints]){
  const p=q.pos,path=nav.findPath(d.playerStart.pos,p);assert.ok(path.length,`${q.id||q.type||'hedef'} yolu yok`);const last=path.at(-1);assert.ok(Math.hypot(last.x-p.x,last.z-p.z)<2,`${q.id||q.type||'hedef'} son yol noktası hedefe ulaşmıyor`);
 }
 assert.ok(d.enemies.filter(e=>e.group==='robots'&&Math.abs(e.pos.x)<8&&e.stationary).length>=8,'iç korumalar binada mevzi tutmalı');assert.ok(d.enemies.some(e=>e.type==='robot'));assert.deepEqual(LEVELS.find(l=>l.map==='municipality').objectives,['outpost','robots','intel']);
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
