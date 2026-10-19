// Gerçek görev ve oyuncu etkileşimi, çizici/ses/ağ olmadan: alarm, yeniden doğuş ve zafer.
import {test} from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
import {CollisionWorld} from '../shared/sim/collision.js';
const bundled=await build({stdin:{contents:"export {Mission} from './src/mission.js'; export {Player} from './src/player.js'; export * as THREE from 'three'; export {LEVELS} from './src/config.js';",resolveDir:new URL('..',import.meta.url).pathname},bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'test-assets',setup(b){b.onResolve({filter:/^virtual:game-assets$/},()=>({path:'assets',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export default {mode:"url",files:{}}'}))}}]});
const {Mission,Player,THREE:T,LEVELS}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
function fixture(){
 const noop=()=>{},w=new CollisionWorld();w.newVec=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);w.scatterGrass=noop;
 const g={world:w,scene:new T.Scene(),textures:{soft:null},quality:'low',time:1,difficultyKey:'normal',mode:'mission',env:{},events:{emit:noop},audio:new Proxy({},{get:()=>noop}),effects:{},buildNav:noop,vehicles:{register:noop},addScore:noop,loadout:{primary:'ak47',secondary:'pistol',melee:'knife'},allies:{spawnSquad:noop,regroup:noop,respawnDead:()=>0},weapons:{owned:{},state:'idle',reset:noop},grenades:{clear:noop},onMissionComplete(){g.won=true}};
 g.player={pos:new T.Vector3(),alive:true,yaw:0,eyePos:new T.Vector3(),stopSprint:noop,reset(pos,yaw){this.pos.copy(pos);this.eyePos.copy(pos).add(new T.Vector3(0,1.6,0));this.yaw=yaw;this.interactT=0;this.interacting=false;this.interactTarget=null}};g.player.game=g;g.camera=new T.PerspectiveCamera();
 g.enemies={list:[],spawn(s){const e={...s,alive:true,model:{dispose:noop,hide:noop},reset(){this.alive=true},takeDamage(){this.alive=false}};this.list.push(e);return e},aliveInGroup(group){return this.list.filter(e=>e.alive&&e.group===group).length}};
 const m=new Mission(g,'mission',LEVELS.find(l=>l.map==='municipality'));g.mission=m;m.build();return {g,m};
}
function hold(g,target,seconds){g.findInteractable=()=>target.enabled()?target:null;const input={isDown:()=>true,pressed:()=>false};for(let i=0;i<Math.ceil(seconds*60);i++)Player.prototype.updateInteraction.call(g.player,1/60,input)}
test('belediye görevi: korumalar ve röleler kilitler, hack alarmı tek dalga getirir, ölüm geri alır, kontrol zaferle biter',()=>{
 const {g,m}=fixture(),terminal=m.interactables.find(i=>i.id==='intel'),relays=m.interactables.filter(i=>i.id.startsWith('relay-'));
 assert.equal(terminal.enabled(),false);m.killGroup('outpost');m.advance();m.killGroup('robots');m.advance();assert.equal(m.current.id,'intel');assert.equal(terminal.enabled(),false);
 hold(g,relays[0],3.05);assert.equal(m.terminalSecurity.disabled.size,1);hold(g,relays[1],3.05);assert.equal(terminal.enabled(),true);
 hold(g,terminal,4);assert.equal(m.intel,false);assert.equal(g.enemies.list.filter(e=>e.group==='reinf').length,3);
 m.restoreCheckpoint();assert.equal(m.terminalSecurity.disabled.size,2);assert.equal(m.terminalSecurity.alarm,false);assert.equal(g.enemies.list.filter(e=>e.group==='reinf').length,0);assert.equal(terminal.enabled(),true);
 hold(g,terminal,8.05);assert.equal(m.intel,true);assert.equal(m.current,undefined);assert.equal(g.enemies.list.filter(e=>e.group==='reinf').length,3);assert.ok(m.endT>0);m.finish();assert.equal(g.won,true);
});
