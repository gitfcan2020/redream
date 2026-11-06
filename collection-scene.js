import * as THREE from 'three';
const skin=(color,opacity=1)=>new THREE.MeshStandardMaterial({color,roughness:.35,transparent:opacity<1,opacity,depthWrite:opacity===1,side:THREE.DoubleSide});
function part(parent,geo,mat,x=0,y=0,z=0){const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m;}
function cube(parent,w,h,d,mat,x=0,y=0,z=0){return part(parent,new THREE.BoxGeometry(w,h,d),mat,x,y,z);}
function artTexture(entry,tex){const canvas=tex.image,c=canvas.getContext('2d');c.fillStyle='#e7e9e5';c.fillRect(0,0,512,512);c.fillStyle='#273238';c.font='34px Arial';c.fillText(entry.title,20,240,480);tex.needsUpdate=true;tex.userData.path=entry.image;const img=new Image();img.onload=()=>{if(tex.userData.path!==entry.image)return;c.fillStyle='#f5f5ef';c.fillRect(0,0,512,512);const f=Math.min(512/img.width,512/img.height);c.drawImage(img,(512-img.width*f)/2,(512-img.height*f)/2,img.width*f,img.height*f);tex.needsUpdate=true;};img.src=entry.image;}
function caseModel(low){
 const root=new THREE.Group(),tray=new THREE.Group();root.add(tray);const ivory=skin(0xe1e7e4),dark=skin(0x292f32),silver=skin(0xc7d3d8),glaze=skin(0xb9d7de,.12);
 cube(tray,2.78,2.78,.16,ivory,0,0,-.06);cube(tray,2.57,2.59,.065,dark,0,0,.045);
 // The entire disc assembly has one rotor. Rotating the disc mesh after its
 // X-axis tilt would gradually tip it out of the case and cause clipping.
 const rotor=new THREE.Group();tray.add(rotor);
 const disc=part(rotor,new THREE.CylinderGeometry(1.09,1.09,.018,low?48:96),silver,0,0,.13);disc.rotation.x=Math.PI/2;
 part(rotor,new THREE.RingGeometry(.25,.53,low?32:64),skin(0xe36a37),0,0,.145);
 part(rotor,new THREE.RingGeometry(.10,.14,low?24:48),dark,0,0,.148);
 const hinge=new THREE.Group();hinge.position.set(-1.39,0,.115);root.add(hinge);
 const lid=new THREE.Group();lid.position.x=1.39;hinge.add(lid);
 cube(lid,2.70,2.72,.052,ivory,0,0,.015);
 const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
 const art=part(lid,new THREE.PlaneGeometry(2.57,2.58),new THREE.MeshBasicMaterial({map:tex,toneMapped:false,side:THREE.DoubleSide,depthWrite:true}),0,0,.043);art.userData.noWire=true;
 // Cover highlights stop before the disc surface and keep the art legible.
 for(const x of [-1.335,1.335])cube(lid,.029,2.73,.068,ivory,x,0,.056);
 for(const y of [-1.34,1.34])cube(lid,2.70,.029,.068,ivory,0,y,.056);
 const glare=part(lid,new THREE.PlaneGeometry(2.53,2.54),glaze,0,0,.063);glare.userData.noWire=true;
 cube(root,.12,2.73,.26,ivory,-1.37,0,.12);
 return{root,hinge,rotor,tex};
}
export class CollectionScene{
 constructor(root,entries,low){this.entries=entries;this.group=new THREE.Group();root.add(this.group);this.cases=[caseModel(low),caseModel(low),caseModel(low)];this.cases.forEach(c=>this.group.add(c.root));this.index=0;this.open=0;this.target=0;this.select(0);}
 select(index){this.index=(index+this.entries.length)%this.entries.length;this.target=0;this.cases.forEach((c,i)=>artTexture(this.entries[(this.index+i-1+this.entries.length)%this.entries.length],c.tex));}
 setOpen(value){this.target=value?1:0;}
 update(dt,time){this.open=THREE.MathUtils.lerp(this.open,this.target,Math.min(1,dt*5));this.cases.forEach((c,i)=>{const offset=i-1,main=i===1;c.root.visible=main||this.open<.75;c.root.position.set(offset*2.05,main?.12:0,main?.50:-1.1);c.root.scale.setScalar(main?1:.67*(1-this.open*.3));c.root.rotation.set(.04,main?-.11:-offset*.38,main?Math.sin(time*.35)*.025:offset*.09);c.hinge.rotation.y=main?-this.open*1.14:0;if(main)c.rotor.rotation.z+=dt*.11;});}
}
