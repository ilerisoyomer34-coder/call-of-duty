// Son operasyon: belediye meydanı → batı girişi → güvenlik röleleri → korunan komuta terminali.
import { V, ground, house, sandbags, jersey, crate, car, lampPost, pine } from './kit.js';
import BUILDING from './municipality-building.json' with { type: 'json' };
export const HALL = { x: 0, z: -18 };
export function build(W) {
  W.bounds = { minx: -44, maxx: 44, minz: -48, maxz: 64 };
  ground(W, 500, 'asphalt'); W.floorSurface = 'concrete';
  W.block(0, .005, -18, 28, .008, 27, 'concrete', 'concrete', { collide: false });
  const imported = W.addMunicipality?.(HALL.x, HALL.z);
  if (!imported && W.scene) house(W, 0, -18, 16, 16, 4, 'plaster', {s:[{at:0,width:6,type:'door'}]});
  for (const b of BUILDING) W.addCollider(b[0], b[1] + .03, b[2] + HALL.z, b[3], b[4] + .03, b[5] + HALL.z, 'concrete');
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
  W.block(-3.8, 0, -20, 2.5, .84, .85, 'metalDark', 'metal');
  for (const x of [-6.7, -5.3]) {
    W.block(x, 0, -24.7, 1.1, 2.7, .8, 'metalDark', 'metal');
    for (let y=.5;y<2.6;y+=.38) W.block(x,y,-24.26,.8,.035,.025,'lampCyan','metal',{collide:false});
  }
  // İç korumalar mevzilerini terk etmez; dışarıdaki çatışma binayı oyuncu girmeden boşaltmasın.
  const guards = [
    [-5,-14,'shotgunner'],[-2,-16,'rifleman'],[0,-20,'robot'],[-5,-21.5,'rifleman'],[2,-13,'shotgunner'],[-6,-17,'rifleman'],[-3,-19,'heavy'],[1.7,-17.5,'rifleman'],
    [-11,-16,'robot'],[-14,-25,'rifleman'],[13,-22,'robot'],[12,-30,'heavy'],[-18,-33,'rifleman'],
  ].map(([x,z,type])=>({group:'robots',type,pos:V(x,z),yaw:Math.PI,stationary:Math.abs(x)<8}));
  return {
    playerStart:{pos:V(0,56),yaw:0},checkpoints:[{pos:V(0,56),yaw:0},{pos:V(-9,5),yaw:0},{pos:V(-13,-12),yaw:-Math.PI/2},{pos:V(-3,-14),yaw:0}],
    grassAvoid:[[-44,-48,44,64]], aaGuns:[],tanks:[],nests:[],barrels:[V(13,16),V(-18,-31)],
    laptop:{pos:V(-3.8,-20,.85),yaw:Math.PI},
    terminal:{holdTime:8,relayTime:3,guardGroup:'robots',relays:[{id:'west',pos:V(-6,-13.8,1.1)},{id:'server',pos:V(-.5,-21.7,1.1)}]},
    ammoCrates:[V(-5,53),V(-12,7),V(-13,-13)],weaponPickups:[{id:'rpg',pos:V(-12,44,1.05),rotY:0},{id:'ak47',pos:V(12,23,1.05),rotY:.4}],
    lz:V(0,56),waves:[],reinforcements:[{type:'rifleman',pos:V(-13,-18)},{type:'shotgunner',pos:V(-13,-12)},{type:'robot',pos:V(0,2)}],
    enemies:[...[-12,-5,5,12].map((x,i)=>({group:'outpost',type:i%2?'heavy':'rifleman',pos:V(x,19-i*4),yaw:Math.PI})),
      {group:'outpost',type:'rifleman',pos:V(-15,2),yaw:Math.PI},{group:'outpost',type:'shotgunner',pos:V(12,-3),yaw:Math.PI},...guards],
    obj:{outpost:{text:'Belediye meydanını ekibinle temizle',marker:V(0,12,1.5),group:'outpost',radio:['Belediye merkezinin önündeyiz. Alfa Timi, birlikte ilerleyin; bankolar ve araçlar siperiniz.'],doneLine:'Meydan temiz. '},
      robots:{text:'Belediye binasını ve robot korumalarını temizle',marker:V(-3,-16,1.5),group:'robots',cp:2,radio:['İçeride ağır silahlı askerler var. Robotlar iki yan sokağı tutuyor. Batı kapısı ikinci giriş; içeride ekibinden ayrılma.'],doneLine:'Koruma çemberi düştü. '},
      intel:{text:'İki güvenlik rölesini çöz, korunan bilgisayarı ele geçir',radio:['İki röleyi devre dışı bırakmadan terminal açılmaz. Sonra bilgisayarda etkileşim tuşunu basılı tut. Bağlantı başlayınca karşı saldırı gelecek; mangan seni korusun.'],got:'Erişim bizde! Belediye ağı ve robot komuta sistemi kontrolümüz altında. Alfa Timi, operasyon tamamlandı.'}},
  };
}
