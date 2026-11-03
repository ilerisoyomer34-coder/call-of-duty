// Çok katlı iç mekân: gerçek çarpışma kutularından ayakta durulabilen yüzeyler ve basamak bağlantıları.
// Yalnız haritanın belirttiği küçük bölgede kurulur; açık alanın mevcut ızgarası değişmez.
import { MinHeap } from './heap.js';
export class IndoorNav {
  constructor(world, region, radius = .35) {
    this.world = world; this.region = region; this.radius = radius; this.cs = .4;
    this.nodes = []; this.cells = new Map();
    const {minx,maxx,minz,maxz,maxy=8.2}=region;
    this.w=Math.ceil((maxx-minx)/this.cs); this.h=Math.ceil((maxz-minz)/this.cs);
    for(let iz=0;iz<this.h;iz++) for(let ix=0;ix<this.w;ix++) {
      const x=minx+(ix+.5)*this.cs,z=minz+(iz+.5)*this.cs;
      const candidates=world.query(x-radius,z-radius,x+radius,z+radius).slice();
      const heights=[0];
      for(const c of candidates) if(c.max.y<=maxy && c.max.y>.01 && x>=c.min.x && x<=c.max.x && z>=c.min.z && z<=c.max.z && !heights.some(y=>Math.abs(y-c.max.y)<.06)) heights.push(c.max.y);
      const cell=[];
      for(const y of heights) {
        const p=world.newVec(x,y,z);
        world.moveCharacter({pos:p,vel:{x:0,y:0,z:0},radius,height:1.8,gravity:15,grounded:true},0,.45);
        if(Math.hypot(p.x-x,p.z-z)>.01 || Math.abs(p.y-y)>.46 || cell.some(id=>Math.abs(this.nodes[id].p.y-p.y)<.08))continue;
        if(!world.canStand(p,radius,.46,1.8))continue;
        const id=this.nodes.length;this.nodes.push({p,ix,iz,edges:[]});cell.push(id);
      }
      this.cells.set(iz*this.w+ix,cell);
    }
    for(let i=0;i<this.nodes.length;i++) {
      const a=this.nodes[i];
      for(const [dx,dz] of [[1,0],[0,1]]) for(const j of this.cells.get((a.iz+dz)*this.w+a.ix+dx)||[]) {
        const b=this.nodes[j];if(b.ix!==a.ix+dx || Math.abs(b.p.y-a.p.y)>.46)continue;
        if(this.canWalk(a.p,b.p)&&this.canWalk(b.p,a.p)){a.edges.push(j);b.edges.push(i);}
      }
    }
  }
  canWalk(a,b) {
    const d=Math.hypot(b.x-a.x,b.z-a.z),n=Math.max(1,Math.ceil(d/.08));
    const s={pos:{...a},vel:{x:(b.x-a.x)/n*60,y:0,z:(b.z-a.z)/n*60},radius:this.radius,height:1.8,gravity:15,grounded:true};
    for(let i=0;i<n;i++)this.world.moveCharacter(s,1/60,.45);
    return Math.hypot(s.pos.x-b.x,s.pos.z-b.z)<.06 && Math.abs(s.pos.y-b.y)<.32;
  }
  nearest(p, limit = 1.5) {
    const {minx, minz} = this.region;
    const cx = Math.floor((p.x-minx)/this.cs), cz = Math.floor((p.z-minz)/this.cs);
    const range = Math.ceil(limit/this.cs);
    let best = -1, dmin = limit*limit;
    for(let z=Math.max(0,cz-range);z<=Math.min(this.h-1,cz+range);z++) {
      for(let x=Math.max(0,cx-range);x<=Math.min(this.w-1,cx+range);x++) {
        for(const id of this.cells.get(z*this.w+x)||[]) {
          const q=this.nodes[id].p;
          if(Math.abs(q.y-p.y)>.55)continue;
          const d=(q.x-p.x)**2+(q.z-p.z)**2+(q.y-p.y)**2;
          if(d<dmin && this.canWalk(p,q)){best=id;dmin=d;}
        }
      }
    }
    return best;
  }
  findPath(a,b) {
    const start=this.nearest(a),end=this.nearest(b);if(start<0||end<0)return null;
    const heap=new MinHeap(),cost=new Map([[start,0]]),from=new Map([[start,-1]]),closed=new Set();heap.push(start,0);
    while(heap.size) {const i=heap.pop();if(closed.has(i))continue;closed.add(i);if(i===end)break;
      for(const j of this.nodes[i].edges){const n=cost.get(i)+this.cs+Math.abs(this.nodes[j].p.y-this.nodes[i].p.y);if(n>=(cost.get(j)??Infinity))continue;
        cost.set(j,n);from.set(j,i);const p=this.nodes[j].p;heap.push(j,n+Math.hypot(p.x-b.x,p.z-b.z)+Math.abs(p.y-b.y));}}
    if(!from.has(end))return null;
    const points=[];for(let i=end;i!==-1;i=from.get(i))points.push(this.nodes[i].p);points.reverse();
    const out=[];let i=0;
    while(i<points.length-1){let j=i+1;while(j+1<points.length && j-i<20 && Math.abs(points[i].y-points[j+1].y)<.08 && this.canWalk(points[i],points[j+1]))j++;out.push(points[j]);i=j;}
    if(this.canWalk(points.at(-1),b))out.push(b);
    out.precise=true;return out.length?out:[points[0]];
  }
}
