import * as THREE from 'three';
import { RoundedBoxGeometry } from './vendor/RoundedBoxGeometry.js';
import { strokeEmblem } from './emblem.js';

// Exterior geometry follows the production hardware. The internal exhibit remains
// deliberately schematic. +Z is the console front and the VMU display face.
const TAU=Math.PI*2;
const material=(color,roughness=.48,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
function mesh(parent,geometry,finish){const m=new THREE.Mesh(geometry,finish);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function roundedRect(w,h,r){const p=new THREE.Shape(),x=-w/2,y=-h/2;p.moveTo(x+r,y);p.lineTo(x+w-r,y);p.quadraticCurveTo(x+w,y,x+w,y+r);p.lineTo(x+w,y+h-r);p.quadraticCurveTo(x+w,y+h,x+w-r,y+h);p.lineTo(x+r,y+h);p.quadraticCurveTo(x,y+h,x,y+h-r);p.lineTo(x,y+r);p.quadraticCurveTo(x,y,x+r,y);return p;}
function contour(w,h,r,n){const p=[];for(const [cx,cy,start] of [[w/2-r,h/2-r,0],[-w/2+r,h/2-r,Math.PI/2],[-w/2+r,-h/2+r,Math.PI],[w/2-r,-h/2+r,Math.PI*1.5]])for(let i=0;i<=n;i++){const a=start+i/n*Math.PI/2;p.push([cx+Math.cos(a)*r,cy+Math.sin(a)*r]);}return p;}
function loft(parent,profiles,finish,{cap=true,low=false}={}){
  const vertices=[],indices=[],rings=profiles.map(([z,w,h,r])=>contour(w,h,r,low?5:12).map(([x,y])=>[x,y,z])),count=rings[0].length;
  for(const ring of rings)for(const p of ring)vertices.push(...p);
  for(let j=0;j<rings.length-1;j++)for(let i=0;i<count;i++){const a=j*count+i,b=j*count+(i+1)%count,c=a+count,d=b+count;indices.push(a,b,d,a,d,c);}
  // Close the back; optionally close the top. Keep the shell open for the roof.
  for(const end of cap?[0,rings.length-1]:[0]){const center=vertices.length/3;vertices.push(0,0,profiles[end][0]);for(let i=0;i<count;i++){const a=end*count+i,b=end*count+(i+1)%count;indices.push(...(end===0?[center,b,a]:[center,a,b]));}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();return mesh(parent,g,finish);
}
function block(parent,w,h,d,finish,x=0,y=0,z=0,r=.035,low=false){const g=Math.min(w,h,d)<.018?new THREE.BoxGeometry(w,h,d):new RoundedBoxGeometry(w,h,d,low?1:3,Math.min(r,w/3,h/3,d/3));const m=mesh(parent,g,finish);m.position.set(x,y,z);return m;}
function disc(parent,r,h,finish,x,y,z,low=false){const m=mesh(parent,new THREE.CylinderGeometry(r,r,h,low?32:72),finish);m.position.set(x,y,z);return m;}
function extrusion(parent,shape,depth,bevel,finish,low=false){return mesh(parent,new THREE.ExtrudeGeometry(shape,{depth,steps:1,bevelEnabled:bevel>0,bevelSize:bevel,bevelThickness:bevel,bevelSegments:low?2:4,curveSegments:low?10:24}),finish);}
function texture(w,h,draw){const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;draw?.(canvas.getContext('2d'),w,h);const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;}
function decal(parent,t,w,h,x,y,z,flat=false){const m=mesh(parent,new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false}));m.position.set(x,y,z);if(flat)m.rotation.x=-Math.PI/2;m.userData.noWire=true;m.castShadow=false;return m;}
function textTexture(text,{size=64,color='#6f7474',font='Arial',weight='',w=512,h=128}={}){return texture(w,h,(c)=>{c.font=`${weight} ${size}px ${font}`;c.fillStyle=color;c.textAlign='center';c.textBaseline='middle';c.fillText(text,w/2,h/2);});}
function line(parent,points,finish,radius=.008,low=false){const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));return mesh(parent,new THREE.TubeGeometry(curve,low?12:32,radius,low?4:8,false),finish);}
function circularHole(shape,x,y,r){const p=new THREE.Path();p.absarc(x,y,r,0,TAU,true);shape.holes.push(p);}
function rectHole(shape,x,y,w,h,r){const p=roundedRect(w,h,r);p.curves.forEach(c=>{for(const k of ['v1','v2','v0'])if(c[k]){c[k].x+=x;c[k].y+=y;}});shape.holes.push(p);}
function flatShape(parent,points,y,finish){const s=new THREE.Shape();points.forEach(([x,z],i)=>i?s.lineTo(x,-z):s.moveTo(x,-z));s.closePath();const m=mesh(parent,new THREE.ShapeGeometry(s),finish);m.rotation.x=-Math.PI/2;m.position.y=y;return m;}

export function paintLidMark(t,color){
  const c=t.image.getContext('2d');c.clearRect(0,0,768,512);strokeEmblem(c,384,166,184,color);
  c.fillStyle='#59605f';c.textAlign='center';c.font='82px Arial';c.fillText('Dreamcast',384,365);t.needsUpdate=true;
}

export function createDreamcastCase({low=false,accent='#e65224'}={}){
  const base=new THREE.Group(),shell=new THREE.Group();
  const plastic=material(0xe0e2db,.43),topPlastic=material(0xe6e7df,.4),lower=material(0xc5cac3,.57),seam=material(0x858e88,.68),socket=material(0x20272a,.62),metal=material(0x8e9698,.32,.78),gold=material(0xc7ad78,.36,.65);
  // Nominal 190 × 195 × 78 mm proportions, including the tapered lower plinth.
  const bottom=loft(base,[[-.67,3.35,3.49,.22],[-.59,3.56,3.69,.16],[-.46,3.65,3.78,.13],[-.23,3.65,3.78,.13]],lower,{low});bottom.rotation.x=-Math.PI/2;
  const split=loft(base,[[-.238,3.65,3.78,.13],[-.218,3.65,3.78,.13]],seam,{low});split.rotation.x=-Math.PI/2;
  const upper=loft(shell,[[-.216,3.66,3.79,.13],[-.15,3.70,3.81,.14],[.47,3.70,3.81,.16],[.66,3.67,3.79,.18],[.76,3.56,3.70,.20]],plastic,{cap:false,low});upper.rotation.x=-Math.PI/2;
  const roof=roundedRect(3.56,3.70,.20);circularHole(roof,0,.13,1.527);
  for(const x of [-1.43,1.43])circularHole(roof,x,-1.39,.225);
  const roofMesh=mesh(shell,new THREE.ShapeGeometry(roof,low?20:48),topPlastic);roofMesh.rotation.x=-Math.PI/2;roofMesh.position.y=.76;
  // A narrow recessed seam surrounds a shallow, domed lid instead of a raised disc.
  disc(shell,1.526,.018,seam,0,.730,-.13,low);
  const lidProfile=[[0,.718],[1.47,.718],[1.505,.735],[1.508,.753],[1.498,.776],[1.47,.792],[1.40,.806],[1.24,.817],[0,.817]].map(([x,y])=>new THREE.Vector2(x,y));
  const lid=mesh(shell,new THREE.LatheGeometry(lidProfile,low?64:144),topPlastic);lid.position.z=-.13;
  const lidTexture=texture(768,512);paintLidMark(lidTexture,accent);decal(shell,lidTexture,1.01,.675,0,.820,-.41,true);
  // Rear hinge panel and the two diagonal joints are characteristic of the case.
  for(const side of [-1,1])line(shell,[[side*1.18,.767,-1.08],[side*1.40,.768,-1.40],[side*1.64,.757,-1.73]],seam,.009,low);
  block(shell,2.56,.055,.23,topPlastic,0,.767,-1.63,.02,low);
  for(const x of [-1.43,1.43]){
    disc(shell,.224,.025,seam,x,.722,1.39,low);
    const cup=mesh(shell,new THREE.LatheGeometry([[.176,.722],[.183,.738],[.204,.752],[.225,.760]].map(p=>new THREE.Vector2(...p)),low?32:72),plastic);cup.position.set(x,0,1.39);cup.material.side=THREE.DoubleSide;
    const button=mesh(shell,new THREE.LatheGeometry([[0,.725],[.167,.725],[.178,.740],[.174,.768],[.157,.784],[0,.787]].map(p=>new THREE.Vector2(...p)),low?32:72),lower);button.position.set(x,0,1.39);
    decal(shell,textTexture(x<0?'POWER':'OPEN',{size:51,color:'#858c86'}),.36,.09,x,.790,1.39,true);
  }
  flatShape(shell,[[-.29,1.13],[.29,1.13],[.125,1.43],[-.125,1.43]],.821,material(0xc1c9c3,.32,.25));
  flatShape(shell,[[-.125,1.46],[.125,1.46],[0,1.69]],.767,seam);
  const led=flatShape(shell,[[-.095,1.48],[.095,1.48],[0,1.65]],.773,new THREE.MeshStandardMaterial({color:0xe69543,roughness:.22,metalness:.12,emissive:0xe97b23,emissiveIntensity:.38}));
  flatShape(shell,[[-.071,1.49],[.071,1.49],[0,1.54]],.775,material(0xffc875,.2,.1));
  // Small molded marks along the raised shoulders.
  for(const side of [-1,1])for(let i=0;i<5;i++){
    const b=mesh(shell,new THREE.SphereGeometry(.032,low?8:16,8),plastic);b.scale.set(1,.23,1.45);b.position.set(side*(1.59+Math.sin(i*.55)*.035),.767,-.62+i*.29);
  }
  // The controller sockets are sunk into one separate front plate, with rounded
  // U-shaped wells, dark socket mouths and a recessed contact tongue.
  block(base,2.57,.64,.035,seam,0,-.12,1.887,.035,low);
  const panel=roundedRect(2.53,.625,.035);
  const portShape=()=>{const s=new THREE.Shape();s.moveTo(-.21,.13);s.quadraticCurveTo(-.215,.20,-.12,.20);s.lineTo(.12,.20);s.quadraticCurveTo(.215,.20,.21,.13);s.lineTo(.19,-.09);s.quadraticCurveTo(.17,-.22,0,-.23);s.quadraticCurveTo(-.17,-.22,-.19,-.09);s.closePath();return s;};
  for(let i=0;i<4;i++){const p=portShape();p.curves.forEach(c=>{for(const k of ['v0','v1','v2'])if(c[k]){c[k].x+=(i-1.5)*.585;c[k].y-=.035;}});panel.holes.push(p);}
  const plate=extrusion(base,panel,.022,.005,plastic,low);plate.position.set(0,-.12,1.947);
  for(let i=0;i<4;i++){
    const x=(i-1.5)*.585;
    const ring=loft(base,[[1.913,.29,.24,.085],[1.925,.32,.28,.10],[1.940,.36,.34,.12],[1.966,.43,.43,.15]],lower,{cap:false,low});ring.position.set(x,-.155,0);ring.material=lower.clone();ring.material.side=THREE.DoubleSide;
    // The open front of this well meets the panel hole, while its mouth sits deep.
    block(base,.29,.24,.015,socket,x,-.10,1.930,.073,low);
    block(base,.207,.105,.018,metal,x,-.075,1.941,.022,low);
    block(base,.192,.055,.012,socket,x,-.055,1.951,.009,low);
    for(let pin=0;pin<5;pin++)block(base,.014,.032,.008,gold,x+(pin-2)*.032,-.025,1.958,.003,low);
    decal(base,textTexture('ABCD'[i],{size:61,color:'#8a918a',font:'serif',w:128}),.11,.12,x,.113,1.976);
  }
  const sega=texture(512,160,c=>{c.textAlign='center';c.textBaseline='middle';c.font='bold 112px Arial';c.lineJoin='round';c.strokeStyle='#848e88';c.lineWidth=9;c.strokeText('SEGA',256,84);c.fillStyle='#e5e8df';c.fillText('SEGA',256,84);c.strokeStyle='#848e88';c.lineWidth=2;c.strokeText('SEGA',256,84);});
  decal(shell,sega,.42,.131,0,.425,1.912);
  const windows=texture(384,128,c=>{c.fillStyle='#78817b';c.textAlign='center';c.font='26px Arial';c.fillText('Compatible with',192,43);c.font='bold italic 35px Arial';c.fillText('Windows CE',192,84);});decal(shell,windows,.44,.147,1.50,.01,1.914);
  // Removable modem housing on the left; cooling slots on the right and rear.
  block(base,.075,.67,1.80,lower,-1.862,-.14,-.68,.035,low);
  for(const side of [-1,1])for(let i=0;i<22;i++)block(base,.012,.13,.041,seam,side*1.827,-.38,-1.34+i*.118,.004,low);
  block(shell,.012,.34,1.00,seam,1.850,.12,-.66,.02,low);
  for(let i=0;i<12;i++)block(shell,.022,.35,.035,plastic,1.863,.12,-1.115+i*.082,.005,low);
  for(let i=0;i<14;i++)block(base,.08,.08,.012,seam,-.59+i*.087,-.39,-1.893,.008,low);
  const rearLabel=(word,x,y,w=.33)=>{const d=decal(shell,textTexture(word,{size:43,color:'#7d877f'}),w,.08,x,y,-1.913);d.rotation.y=Math.PI;};
  // Viewed from the back: LINE at left, AC IN high on the right,
  // AV OUT and SERIAL below. The labels rotate with their physical face.
  block(base,.32,.25,.018,socket,1.51,-.13,-1.917,.025,low);block(base,.22,.16,.014,metal,1.51,-.12,-1.930,.01,low);rearLabel('LINE',1.51,.10,.26);
  block(shell,.48,.25,.02,socket,-1.14,.32,-1.913,.10,low);
  for(const x of [-1.26,-1.02]){const p=disc(shell,.041,.035,metal,x,.32,-1.935,low);p.rotation.x=Math.PI/2;}rearLabel('AC IN',-1.14,.53);
  for(const [x,w,label] of [[-.51,.56,'AV OUT'],[-1.21,.36,'SERIAL']]){block(base,w,.20,.018,metal,x,-.14,-1.913,.022,low);block(base,w-.045,.146,.025,socket,x,-.14,-1.929,.015,low);rearLabel(label,x,.055);}
  for(const x of [-1.35,1.35])for(const z of [-1.35,1.35])disc(base,.115,.06,socket,x,-.69,z,low);
  // Underside fasteners and rating label become visible while orbiting.
  const rating=decal(base,textTexture('SEGA  ·  DREAMCAST  ·  HKT-3000',{size:29,color:'#cbd0c9'}),1.8,.45,0,-.674,0,true);rating.rotation.x=Math.PI/2;
  for(const x of [-1.32,1.32])for(const z of [-1.30,1.30])disc(base,.035,.012,metal,x,-.727,z,low);
  return {base,shell,led,lidTexture};
}

export function createVmu({lcd,low=false}={}){
  const group=new THREE.Group(),plastic=material(0xdde2dc,.43),edge=material(0xc5cdc6,.5),joint=material(0x8b9690,.65),purple=material(0x8191b7,.38),buttonDark=material(0x555f78,.55),screen=material(0x45625d,.42);
  const bodyShape=()=>{const s=new THREE.Shape();s.moveTo(-.83,1.29);s.quadraticCurveTo(-.84,1.40,-.71,1.43);s.quadraticCurveTo(0,1.61,.71,1.43);s.quadraticCurveTo(.84,1.40,.83,1.29);s.lineTo(.83,-1.23);s.quadraticCurveTo(.81,-1.36,.65,-1.40);s.quadraticCurveTo(0,-1.59,-.65,-1.40);s.quadraticCurveTo(-.81,-1.36,-.83,-1.23);s.closePath();return s;};
  const back=extrusion(group,bodyShape(),.27,.055,edge,low);back.position.z=-.28;
  const mid=extrusion(group,bodyShape(),.013,.047,joint,low);mid.position.z=.006;
  const frontShape=bodyShape();rectHole(frontShape,0,.39,1.25,1.025,.023);
  const front=extrusion(group,frontShape,.15,.048,plastic,low);front.position.z=.03;
  // Separate face panel with an actual aperture: the LCD sits behind its lip.
  const face=new THREE.Shape();face.moveTo(-.66,1.19);face.quadraticCurveTo(0,1.39,.66,1.19);face.lineTo(.66,-1.37);face.quadraticCurveTo(0,-1.54,-.66,-1.37);face.closePath();rectHole(face,0,.39,1.25,1.025,.023);
  const panel=extrusion(group,face,.035,.008,plastic,low);panel.position.z=.205;
  block(group,1.28,1.055,.015,screen,0,.39,.209,.035,low);
  decal(group,lcd,1.168,.779,0,.39,.221);
  // Side rails, detachable cap and its round finger recess.
  for(const side of [-1,1])line(group,[[side*.681,1.22,.237],[side*.681,.7,.242],[side*.681,-.65,.242],[side*.681,-1.35,.228]],joint,.004,low);
  const cap=new THREE.Shape();cap.moveTo(-.83,1.16);cap.quadraticCurveTo(0,1.44,.83,1.16);cap.lineTo(.83,1.42);cap.quadraticCurveTo(.80,1.48,.66,1.51);cap.quadraticCurveTo(0,1.69,-.66,1.51);cap.quadraticCurveTo(-.80,1.48,-.83,1.42);cap.closePath();
  const capJoint=extrusion(group,cap,.52,.022,joint,low);capJoint.position.z=-.282;
  const capBody=extrusion(group,cap,.52,.019,plastic,low);capBody.position.set(0,.010,-.277);
  const thumb=mesh(group,new THREE.RingGeometry(.164,.17,low?28:64),edge);thumb.position.set(0,1.355,.264);thumb.scale.y=1.12;
  decal(group,textTexture('Dreamcast',{size:89,color:'#707c87',w:768,h:160}),1.30,.271,0,1.025,.252);
  // Circular D-pad base with a raised, softly beveled cross.
  const button=(x,y,r,small=false)=>{
    const well=disc(group,r+.020,.014,buttonDark,x,y,.250,low);well.rotation.x=Math.PI/2;
    const profile=[[0,0],[r*.90,0],[r,.024],[r*.97,small?.048:.068],[r*.78,small?.064:.087],[0,small?.07:.095]].map(p=>new THREE.Vector2(...p));
    const b=mesh(group,new THREE.LatheGeometry(profile,low?28:64),purple);b.rotation.x=Math.PI/2;b.position.set(x,y,.25);return b;
  };
  const dpadWell=disc(group,.306,.014,buttonDark,-.385,-.895,.248,low);dpadWell.rotation.x=Math.PI/2;
  const dpadRound=disc(group,.282,.041,purple,-.385,-.895,.282,low);dpadRound.rotation.x=Math.PI/2;
  const cross=new THREE.Shape(),a=.11,b=.265;cross.moveTo(-a,b);cross.lineTo(a,b);cross.lineTo(a,.16);cross.quadraticCurveTo(a,a,.16,a);cross.lineTo(b,a);cross.lineTo(b,-a);cross.lineTo(.16,-a);cross.quadraticCurveTo(a,-a,a,-.16);cross.lineTo(a,-b);cross.lineTo(-a,-b);cross.lineTo(-a,-.16);cross.quadraticCurveTo(-a,-a,-.16,-a);cross.lineTo(-b,-a);cross.lineTo(-b,a);cross.lineTo(-.16,a);cross.quadraticCurveTo(-a,a,-a,.16);cross.closePath();
  const dpad=extrusion(group,cross,.035,.022,purple,low);dpad.position.set(-.385,-.895,.303);
  const dot=mesh(group,new THREE.SphereGeometry(.015,12,8),edge);dot.scale.z=.35;dot.position.set(-.385,-.895,.365);
  button(.235,-.945,.139);button(.598,-.782,.139);button(.115,-.496,.076,true);button(.425,-.496,.076,true);
  for(const [label,x,y,w,h,size] of [['SLEEP',.115,-.300,.22,.10,60],['MODE',.425,-.300,.22,.10,60],['A',.235,-1.185,.13,.13,80],['B',.598,-1.020,.13,.13,80]])decal(group,textTexture(label,{size,color:'#65716b',w:label.length===1?128:256}),w,h,x,y,.251);
  // Back of the VMU: buzzer grille, CR2032 door, screw and small molded label.
  const rear=new THREE.Group();rear.rotation.y=Math.PI;rear.position.z=-.338;group.add(rear);
  for(const [x,y,r] of [[0,.67,.037],[-.09,.67,.033],[.09,.67,.033],[0,.77,.022],[-.085,.77,.016],[.085,.77,.016],[0,.57,.022],[-.085,.57,.016],[.085,.57,.016],[-.18,.67,.016],[.18,.67,.016]]){const hole=disc(rear,r,.008,joint,x,y,.004,low);hole.rotation.x=Math.PI/2;}
  const doorShape=()=>{const s=new THREE.Shape();s.moveTo(-.43,.05);s.quadraticCurveTo(-.48,.05,-.48,-.02);s.lineTo(-.48,-.79);s.quadraticCurveTo(-.46,-1.19,0,-1.23);s.quadraticCurveTo(.46,-1.19,.48,-.79);s.lineTo(.48,-.02);s.quadraticCurveTo(.48,.05,.43,.05);s.closePath();return s;};
  extrusion(rear,doorShape(),.006,.007,joint,low);const door=extrusion(rear,doorShape(),.012,.005,plastic,low);door.scale.set(.965,.97,1);door.position.z=.009;
  const screw=disc(rear,.056,.012,material(0x8c9695,.3,.8),0,-1.05,.031,low);screw.rotation.x=Math.PI/2;
  block(rear,.066,.012,.008,buttonDark,0,-1.05,.043,.001,low);block(rear,.012,.066,.008,buttonDark,0,-1.05,.044,.001,low);
  const sticker=texture(384,512,c=>{c.fillStyle='#e4e4d7';c.fillRect(0,0,384,512);c.fillStyle='#8d4a46';c.textAlign='left';c.font='bold 38px Arial';c.fillText('CAUTION',28,65);c.font='30px Arial';['Battery harmful if','swallowed.','CR2032 × 2'].forEach((s,i)=>c.fillText(s,28,116+i*44));c.strokeStyle='#8d4a46';c.lineWidth=5;for(let i=0;i<2;i++){c.strokeRect(82,300+i*65,220,47);c.font='28px monospace';c.fillText('CR2032',125,333+i*65);}});
  decal(rear,sticker,.51,.68,0,-.47,.033);
  decal(rear,textTexture('SEGA  HKT-7000',{size:37,color:'#919d91'}),.98,.23,0,.29,.014);
  for(const side of [-1,1])for(const y of [1.04,-1.24]){const s=disc(rear,.042,.012,joint,side*.694,y,.012,low);s.rotation.x=Math.PI/2;}
  for(let i=0;i<3;i++)line(rear,[[-.61,-1.29-i*.045,.011],[0,-1.40-i*.025,.014],[.61,-1.29-i*.045,.011]],edge,.010,low);
  return group;
}
