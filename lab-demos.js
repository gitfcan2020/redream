import * as THREE from 'three';
import { GLTFLoader } from './vendor/GLTFLoader.js';

// Original Dreamcast game meshes. Emerald Coast contains only the opening beach.
export function createLabDemos(low=false){
  const group=new THREE.Group();
  const models={sonic:new THREE.Group(),coast:new THREE.Group()};
  for(const model of Object.values(models))group.add(model);
  const loader=new GLTFLoader();
  let chosen='sonic',wire=false;
  const sources={
    sonic:{url:'./assets/models/sonic-adventure-dc.glb',height:3.6,rotation:Math.PI/2},
    coast:{url:'./assets/models/emerald-coast-start.glb',width:6.2,rotation:0}
  };
  for(const [name,config] of Object.entries(sources)){
    loader.load(config.url,(asset)=>{
      const art=asset.scene;
      const bounds=new THREE.Box3().setFromObject(art);
      const size=bounds.getSize(new THREE.Vector3());
      const center=bounds.getCenter(new THREE.Vector3());
      const scale=config.height?config.height/size.y:config.width/size.x;
      art.scale.setScalar(scale);
      art.position.set(-center.x*scale,-1.42-bounds.min.y*scale,-center.z*scale);
      art.rotation.y=config.rotation;
      art.traverse(o=>{
        if(!o.isMesh)return;
        if(name==='coast'){
          if(o.name==='material_0'){o.visible=false;return;}
          const original=o.material;
          const sand=['material_7','material_8','material_9'].includes(o.name);
          o.material=new THREE.MeshBasicMaterial({map:original.map||null,color:sand?0xcab286:0xb0b9ae,transparent:original.transparent,opacity:original.opacity,side:THREE.DoubleSide,wireframe:wire});
        }
        o.castShadow=!low;o.receiveShadow=!low;
        const materials=Array.isArray(o.material)?o.material:[o.material];
        for(const material of materials){material.side=THREE.DoubleSide;material.wireframe=wire;material.needsUpdate=true;}
      });
      models[name].add(art);
    },undefined,error=>console.warn(`Could not load ${name} model`,error));
  }
  function select(name){chosen=name;for(const [key,model] of Object.entries(models))model.visible=key===name;}
  function setWire(value){wire=value;group.traverse(o=>{if(o.isMesh){const materials=Array.isArray(o.material)?o.material:[o.material];for(const material of materials)material.wireframe=value;}});}
  function update(time){if(chosen==='sonic')models.sonic.rotation.y=Math.sin(time*.25)*.08;}
  select(chosen);
  return{group,models,select,setWire,update};
}
