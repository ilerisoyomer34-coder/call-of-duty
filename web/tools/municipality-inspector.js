import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
document.body.style='margin:0;background:#18222a;color:white;font:16px sans-serif';
document.body.innerHTML='<div style="position:absolute;z-index:2"><button id="front">Ön</button><button id="back">Arka</button><button id="top">İç mekân planı</button><button id="inside">Giriş katı</button><span id="report"></span></div>';
const r=new T.WebGLRenderer({antialias:true});r.setSize(innerWidth,innerHeight);r.setPixelRatio(1);document.body.append(r.domElement);r.toneMapping=T.ACESFilmicToneMapping;r.toneMappingExposure=1.25;
const s=new T.Scene();s.background=new T.Color('#6b7980');s.add(new T.HemisphereLight(0xdcecff,0x646051,2));const sun=new T.DirectionalLight(0xffe4c1,3);sun.position.set(8,20,15);s.add(sun);
const c=new T.PerspectiveCamera(55,innerWidth/innerHeight,.03,150);c.position.set(15,10,20);const orbit=new OrbitControls(c,r.domElement);orbit.target.set(0,4,0);orbit.update();
const house=await new GLTFLoader().loadAsync('/assets/props/municipality.glb');s.add(house.scene);
const plane=new T.Mesh(new T.PlaneGeometry(200,200),new T.MeshStandardMaterial({color:'#555b56'}));plane.rotation.x=-Math.PI/2;plane.position.y=-.1;s.add(plane);
r.localClippingEnabled=true;function view(p,t,cut=false){c.position.set(...p);orbit.target.set(...t);orbit.update();house.scene.traverse(o=>{if(!o.isMesh)return;o.visible=true;o.material.clippingPlanes=cut?[new T.Plane(new T.Vector3(0,-1,0),3)]:[];});}
document.querySelector('#front').onclick=()=>view([15,9,20],[0,4,0]);document.querySelector('#back').onclick=()=>view([-15,8,-20],[0,4,0]);document.querySelector('#top').onclick=()=>view([0,24,.01],[0,0,0],true);document.querySelector('#inside').onclick=()=>view([-2,1.8,3.5],[2,1.4,0]);
const axes=new T.AxesHelper(3);s.add(axes);document.querySelector('#report').textContent='X kırmızı · Z mavi · model yüklendi';r.setAnimationLoop(()=>r.render(s,c));
