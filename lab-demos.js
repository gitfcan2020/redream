import * as THREE from 'three';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { FBXLoader } from './vendor/FBXLoader.js';

// Original Dreamcast game meshes. Emerald Coast contains only the opening beach.
export function createLabDemos(low=false){
  const group=new THREE.Group();
  const stage=new THREE.Group();
  const floor=new THREE.Mesh(new THREE.CircleGeometry(1.12,64),new THREE.MeshBasicMaterial({color:0x505b59,transparent:true,opacity:.12,depthWrite:false,side:THREE.DoubleSide}));
  floor.rotation.x=-Math.PI/2;floor.position.y=-1.51;stage.add(floor);
  const rim=new THREE.Mesh(new THREE.RingGeometry(1.1,1.12,64),new THREE.MeshBasicMaterial({color:0xe65224,transparent:true,opacity:.28,depthWrite:false,side:THREE.DoubleSide}));
  rim.rotation.x=-Math.PI/2;rim.position.y=-1.5;stage.add(rim);
  group.add(stage);
  const models={sonic:new THREE.Group(),sonic2:new THREE.Group(),vyse:new THREE.Group(),ryo:new THREE.Group(),coast:new THREE.Group(),ulala:new THREE.Group(),nights:new THREE.Group(),jsr:new THREE.Group(),shadow:new THREE.Group(),pudding:new THREE.Group(),sataro:new THREE.Group()};
  for(const model of Object.values(models))group.add(model);
  const loader=new GLTFLoader();
  const fbxLoader=new FBXLoader();
  let chosen='sonic',wire=false;
  const sources={
    sonic:{url:'./assets/models/sonic-adventure-dc.glb',height:3.6,rotation:Math.PI/2},
    sonic2:{url:'./assets/models/sonic-adventure-2-dc.glb',height:3.6,rotation:Math.PI/2},
    vyse:{url:'./assets/models/vyse-skies-of-arcadia-dc-uvfix.glb',height:3.6,rotation:0,flipV:true},
    ryo:{url:'./assets/models/ryo-shenmue-passport-dc.glb',height:3.7,rotation:Math.PI,rx:-Math.PI/2},
    coast:{url:'./assets/models/emerald-coast-start.glb',width:6.2,rotation:0},
    ulala:{url:'./assets/models/ulala-space-channel-5-dc-uvfix.glb',height:3.6,rotation:0,flipV:true},
    nights:{url:'./assets/models/nights-sonic-shuffle-dc.glb',height:3.6,rotation:0},
    jsr:{url:'./assets/models/jsr-stage6-dc.glb',width:4.0,rotation:Math.PI},
    shadow:{url:'./assets/models/shadow-source/Shadow.fbx',height:3.6,rotation:Math.PI/2},
    pudding:{url:'./assets/models/pudding-space-channel-5-dc.glb',height:3.6,rotation:0},
    sataro:{url:'./assets/models/sataro-shenmue-dc.glb',height:2.5,rotation:0,flipV:true}
  };
  const loaded=new Set();
  function load(name){
    if(loaded.has(name))return;
    loaded.add(name);
    const config=sources[name];
    (name==='shadow'?fbxLoader:loader).load(config.url,(asset)=>{
      const art=asset.scene||asset;
      if(config.rx)art.rotation.order='YXZ';
      art.rotation.set(config.rx||0,config.rotation||0,0);
      art.updateMatrixWorld(true);
      const bounds=new THREE.Box3().setFromObject(art);
      const size=bounds.getSize(new THREE.Vector3());
      const center=bounds.getCenter(new THREE.Vector3());
      const scale=config.height?config.height/size.y:config.width/size.x;
      // The source FBX binds its skeleton in inches (1 / 39.37). The Canvas
      // renderer draws raw geometry; WebGL applies the bind pose and would
      // shrink Shadow to a speck unless the imported rig is compensated here.
      art.scale.setScalar(scale*(name==='shadow'&&!low?39.37:1));
      art.position.set(-center.x*scale,-1.42-bounds.min.y*scale,-center.z*scale);
      const flippedGeometry=new WeakSet();
      art.traverse(o=>{
        if(!o.isMesh)return;
        // Some archived meshes use the opposite texture origin. Apply the
        // correction only to the corresponding geometry and only once.
        const flipUv=config.flipV;
        if(flipUv&&!flippedGeometry.has(o.geometry)){
          const uv=o.geometry.attributes.uv;
          if(uv){for(let i=0;i<uv.count;i++)uv.setY(i,1-uv.getY(i));uv.needsUpdate=true;}
          flippedGeometry.add(o.geometry);
        }
        if(name==='coast'){
          if(o.name==='material_0'){o.visible=false;return;}
          const original=o.material;
          const sand=['material_7','material_8','material_9'].includes(o.name);
          o.material=new THREE.MeshBasicMaterial({map:original.map||null,color:sand?0xcab286:0xb0b9ae,transparent:original.transparent,opacity:original.opacity,side:THREE.DoubleSide,wireframe:wire});
        }
        o.castShadow=!low&&name!=='jsr';o.receiveShadow=!low&&name!=='jsr';
        const materials=Array.isArray(o.material)?o.material:[o.material];
        for(const material of materials){material.side=THREE.DoubleSide;material.wireframe=wire;if(material.map){material.map.magFilter=THREE.LinearFilter;material.map.minFilter=THREE.LinearMipmapLinearFilter;material.map.anisotropy=4;}material.needsUpdate=true;}
      });
      models[name].add(art);
    },undefined,error=>{loaded.delete(name);console.warn(`Could not load ${name} model`,error);});
  }
  function select(name){chosen=name;stage.visible=name!=='coast'&&name!=='jsr';load(name);for(const [key,model] of Object.entries(models))model.visible=key===name;}
  function setWire(value){wire=value;for(const model of Object.values(models))model.traverse(o=>{if(o.isMesh){const materials=Array.isArray(o.material)?o.material:[o.material];for(const material of materials)material.wireframe=value;}});}
  function update(time){if(chosen!=='coast'&&chosen!=='jsr'&&models[chosen])models[chosen].rotation.y=Math.sin(time*.25)*.08;}
  select(chosen);
  return{group,models,select,setWire,update};
}
