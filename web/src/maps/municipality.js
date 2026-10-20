// 5. görev sonrası özel operasyon: meydan → üç katlı baskın → en üst katta ağ kontrolü.
import { V, ground, house, sandbags, jersey, crate, car, lampPost, pine } from './kit.js';
import { PointLight } from 'three';
import BUILDING from './municipality-building.json' with { type: 'json' };
export const HALL = { x: 0, z: -18 };
export const HALL_FLOORS = [0.025, 4.055, 8.055];
export function build(W) {
  W.navigationRegion={minx:-11,maxx:11,minz:-29,maxz:-8,maxy:8.15,portals:[{x:-10,z:-18},{x:0,z:-9}]};
  W.bounds = { minx: -44, maxx: 44, minz: -48, maxz: 64 };
  ground(W, 500, 'asphalt'); W.floorSurface = 'concrete';
  W.block(0, .005, -18, 28, .008, 27, 'concrete', 'concrete', { collide: false });
  const imported = W.addMunicipality?.(HALL.x, HALL.z);
  if (!imported && W.scene) house(W, 0, -18, 16, 16, 4, 'plaster', {s:[{at:0,width:6,type:'door'}]});
  for (const b of BUILDING) {
    // Merdiven boşluğunun döşeme kenarı karakterin omuz genişliğine pay bırakır.
    const floor=b[4]-b[1]<.09 && ((b[1]>3.8&&b[4]<4.1)||(b[1]>7.8&&b[4]<8.1));
    const boxes=floor?cutStairOpening(b):[b];
    for(const q of boxes) W.addCollider(q[0],q[1]+.03,q[2]+HALL.z,q[3],q[4]+.03,q[5]+HALL.z,'concrete');
  }
  W.block(0,0,HALL.z,16,.025,16,'concrete','concrete',{visible:false});
  // Danışma bankosu ve arkasındaki rafın çarpışması (özgün modelde x=1.6…4).
  W.block(4.3, 0, -16.4, 2.2, 1.05, 7.2, 'wood', 'wood', { visible: false });
  W.block(7.4, 0, -16.4, 1, 3, 8.6, 'wood', 'wood', { visible: false });
  // Meclis meydanına iki yaklaşım: merkez bulvarı ve ağaçlı batı yolu.
  for (const x of [-34, 34]) for (const z of [-30, -4, 22, 48]) {
    const mat = z % 3 === 0 ? 'brick' : z < 0 ? 'plasterOchre' : 'plasterWhite';
    house(W, x, z, 12, 15, 7, mat);
    const face = x < 0 ? x + 6.02 : x - 6.02;
    for (const y of [1.2,4.5]) for (const dz of [-4.7,0,4.7]) {
      W.block(face,y,z+dz,.08,1.6,1.8,'woodDark','wood',{collide:false});
      W.block(face+(x<0?.05:-.05),y+.12,z+dz,.04,1.35,1.5,'glass','metal',{collide:false});
    }

  }
  for (const x of [-22, 22]) for (const z of [8, 28, 48]) {
    pine(W, x, z, 7.5); W.block(x, 0, z, 3.8, .5, 3.8, 'concrete', 'concrete');
  }
  for (const z of [0, 26, 52]) for (const x of [-16, 16]) lampPost(W, x, z, 6);
  for (const x of [-6, 6]) { jersey(W, x, 16); sandbags(W, x, -4, 3, true); }
  car(W, -10, 32, .4); car(W, 11, 7, -.6); car(W, -25, -35, .3);
  for (const [x,z] of [[-12,44],[12,23],[-16,-10]]) crate(W,x,z,1.05);
  // Terminal masası, sunucu kabinleri ve iki ayrı güvenlik rölesi.
  W.block(2.5, HALL_FLOORS[2], -20.5, 2.5, .84, .85, 'metalDark', 'metal');
  for (const x of [-6.7, -5.3]) {
    W.block(x, 8.055, -19.5, 1.1, 2.7, .8, 'metalDark', 'metal');
    for (let y=.5;y<2.6;y+=.38) W.block(x,y+8.055,-19.06,.8,.035,.025,'lampCyan','metal',{collide:false});
  }
  // Son kattaki komuta masasını tavandaki iki armatür aydınlatır (gölge haritası üretmez).
  for(const [x,z] of [[2.5,-19],[-5,-16]]) {
    W.block(x,11.7,z,1.8,.12,.35,'lampCyan','metal',{collide:false});
    if(W.scene) {
      const light=new PointLight(0xb6dfff,16,12,2);
      light.position.set(x,10.8,z);W.scene.add(light);
    }
  }
  // Katlardaki muhafızlar dış çatışmaya koşup binayı boşaltmaz. Hareketli takviyeler merdiven kullanır.
  const floorGuards = (floor, positions) => positions.map(([x,z,type='rifleman',yaw=0]) => ({group:'robots',type,pos:V(x,z,HALL_FLOORS[floor]),yaw,stationary:true}));
  const guards = [
    ...floorGuards(0,[[-5,-14,'shotgunner'],[-2,-16],[0,-20,'robot'],[-5,-21.5],[2,-13,'shotgunner'],[-6,-17],[-3,-19,'heavy'],[1.7,-17.5],[-5,-12],[-1,-22],[0,-15,'heavy'],[-6.8,-21]]),
    ...floorGuards(1,[[-6,-15,'heavy'],[-4,-12,'shotgunner'],[-2.5,-14],[2,-12],[5,-15,'heavy'],[6,-20],[2,-21,'shotgunner'],[-1,-21],[-6,-21],[-5,-17],[-1,-16,'heavy'],[3,-17]]),
    ...floorGuards(2,[[-6,-12,'heavy'],[-3,-13,'shotgunner'],[2,-15],[3,-13,'heavy'],[6,-15],[6,-21,'heavy'],[3,-22,'shotgunner'],[0,-21],[-4,-21,'heavy'],[-5,-16],[-1,-16],[3,-17,'shotgunner']]),
    ...[[-11,-16,'robot'],[-14,-25,'rifleman'],[13,-22,'robot'],[12,-30,'heavy'],[-18,-33,'rifleman'],[-16,-19,'shotgunner'],[16,-12,'heavy'],[9,-33,'rifleman']].map(([x,z,type])=>({group:'robots',type,pos:V(x,z),yaw:Math.PI})),
  ];
  // Son katta ışıklı sunucu salonu; merdiven sahanlıkları ve geçişler açık kalır.
  for(const x of [4.8,6.4]) {
    W.block(x,HALL_FLOORS[2],-12,1.1,2.5,.8,'metalDark','metal');
    for(let y=.4;y<2.3;y+=.35) W.block(x,HALL_FLOORS[2]+y,-12.42,.78,.045,.025,'lampCyan','metal',{collide:false});
  }
  for(const y of HALL_FLOORS.slice(1)) {
    W.block(0,y+.8,-14,1.8,.12,.6,'metalDark','metal');
    W.block(0,y,-14,.12,.8,.5,'metalDark','metal');
  }
  return {
    playerStart:{pos:V(0,56),yaw:0},checkpoints:[{pos:V(0,56),yaw:0},{pos:V(-9,5),yaw:0},{pos:V(-13,-12),yaw:-Math.PI/2},{pos:V(1,-18.8,HALL_FLOORS[2]),yaw:0}],
    grassAvoid:[[-44,-48,44,64]], aaGuns:[],tanks:[],nests:[],barrels:[V(13,16),V(-18,-31)],
    laptop:{pos:V(2.5,-20.5,HALL_FLOORS[2]+.85),floor:HALL_FLOORS[2],yaw:Math.PI},
    terminal:{holdTime:8,relayTime:3,guardGroup:'robots',relays:[{id:'west',floor:HALL_FLOORS[1],pos:V(-6,-15,HALL_FLOORS[1]+1.1)},{id:'server',floor:HALL_FLOORS[2],pos:V(1,-21.7,HALL_FLOORS[2]+1.1)}]},
    ammoCrates:[V(-5,53),V(-12,7),V(-13,-13),V(6,-17,HALL_FLOORS[1]),V(-6,-13,HALL_FLOORS[2])],weaponPickups:[{id:'rpg',pos:V(-12,44,1.05),rotY:0},{id:'ak47',pos:V(12,23,1.05),rotY:.4}],
    lz:V(0,56),waves:[],reinforcements:[{type:'rifleman',pos:V(-13,-18)},{type:'shotgunner',pos:V(-13,-12)},{type:'robot',pos:V(0,2)},{type:'heavy',pos:V(6,-23,HALL_FLOORS[1])},{type:'rifleman',pos:V(4,-21,HALL_FLOORS[1])},{type:'shotgunner',pos:V(-6,-21,HALL_FLOORS[1])},{type:'rifleman',pos:V(-6,-14,HALL_FLOORS[1])},{type:'heavy',pos:V(12,-17)}],
    enemies:[...[-12,-5,5,12].map((x,i)=>({group:'outpost',type:i%2?'heavy':'rifleman',pos:V(x,19-i*4),yaw:Math.PI})),
      {group:'outpost',type:'rifleman',pos:V(-15,2),yaw:Math.PI},{group:'outpost',type:'shotgunner',pos:V(12,-3),yaw:Math.PI},...[-19,-9,9,19].flatMap((x,i)=>[32,42].map(z=>({group:'outpost',type:i%2?'rifleman':'shotgunner',pos:V(x,z-i*2),yaw:Math.PI}))),...guards],
    obj:{outpost:{text:'Belediye meydanını ekibinle temizle',marker:V(0,12,1.5),group:'outpost',radio:['Belediye merkezinin önündeyiz. Alfa Timi, birlikte ilerleyin; bankolar ve araçlar siperiniz.'],doneLine:'Meydan temiz. '},
      robots:{text:'Üç katı ve robot korumalarını temizle',marker:V(-3,-16,1.5),group:'robots',cp:2,radio:['Her katta muhafız var. Robotlar iki yan sokağı ve giriş katını tutuyor. Kuzeydeki merdivenlerden kat kat ilerleyin; son kat komuta merkezi. Alfa Timi yanında kalsın.'],doneLine:'Koruma çemberi düştü. '},
      intel:{text:'Ara kat ve son kat rölelerini çöz; en üst kattaki bilgisayarı ele geçir',radio:['Bir röle ara katta, diğeri en üst katta. İkisini çözün; bilgisayar son kattaki sunucu salonunda. Bağlantı sırasında takviye merdivenlere yönelecek. Alfa Timi, komuta katını savunun.'],got:'Erişim bizde! Belediye ağı ve robot komuta sistemi kontrolümüz altında. Alfa Timi, operasyon tamamlandı.'}},
  };
}

function cutStairOpening(b) {
  const x0=Math.max(b[0],-3.6),x1=Math.min(b[3],3.2),z0=Math.max(b[2],-8),z1=Math.min(b[5],-5.8);
  if(x0>=x1||z0>=z1)return [b];
  return [[b[0],b[1],b[2],x0,b[4],b[5]],[x1,b[1],b[2],b[3],b[4],b[5]],[x0,b[1],b[2],x1,b[4],z0],[x0,b[1],z1,x1,b[4],b[5]]].filter(q=>q[3]-q[0]>.01&&q[5]-q[2]>.01);
}
