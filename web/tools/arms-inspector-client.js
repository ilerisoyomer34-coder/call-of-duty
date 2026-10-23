import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {loadPropAsset} from '../src/assets.js';
import {setFpsArmProp,buildArms,poseArm} from '../src/models.js';
document.body.style='margin:0;background:#39454f;color:#eee;font:16px sans-serif';
document.body.innerHTML='<div style="position:absolute;z-index:2;padding:12px"><button id="left">Sol el</button> <button id="right">Sağ el</button> <button id="back">El sırtı</button> <button id="palm">Avuç</button> <button id="wrist">Bilek bağlantısı</button> <span id="status">Yükleniyor…</span></div>';
const r=new T.WebGLRenderer({antialias:true});r.setSize(innerWidth,innerHeight);document.body.append(r.domElement);r.toneMapping=T.ACESFilmicToneMapping;r.toneMappingExposure=1.4;
const s=new T.Scene();s.background=new T.Color('#65727b');s.add(new T.HemisphereLight(0xdcecff,0x41403b,2));const l=new T.DirectionalLight(0xffe7c6,3);l.position.set(.3,.5,.3);s.add(l);
const c=new T.PerspectiveCamera(35,innerWidth/innerHeight,.001,10),orbit=new OrbitControls(c,r.domElement);
setFpsArmProp(await loadPropAsset('fpsArms'));const arms=buildArms();for(const a of Object.values(arms)){poseArm(a,new T.Vector3(-.08,-.12,-.23),new T.Vector3(0,0,.05),new T.Vector3(0,1,0),new T.Quaternion());s.add(a.g)}
function resize(){r.setSize(innerWidth,innerHeight);c.aspect=innerWidth/innerHeight;c.updateProjectionMatrix()}
addEventListener('resize',resize);resize();
function choose(side){arms.left.g.visible=side==='left';arms.right.g.visible=side==='right';document.querySelector('#status').textContent=side==='left'?'Sol el':'Sağ el'}
function view(p,t=[0,0,.025]){c.position.set(...p);orbit.target.set(...t);orbit.update()}
document.querySelector('#left').onclick=()=>choose('left');document.querySelector('#right').onclick=()=>choose('right');document.querySelector('#back').onclick=()=>view([.04,.4,.29]);document.querySelector('#palm').onclick=()=>view([.04,-.4,.29]);document.querySelector('#wrist').onclick=()=>view([.56,.32,.45],[0,-.04,-.06]);
choose('right');view([.45,.32,.54],[0,-.03,-.05]);r.setAnimationLoop(()=>r.render(s,c));
