import * as THREE from 'three';
import { RoundedBoxGeometry } from './vendor/RoundedBoxGeometry.js';
import { SoftwareRenderer } from './software-renderer.js';
import { createDreamcastCase, createVmu, paintLidMark } from './hardware-models.js';
import { CollectionScene } from './collection-scene.js';
import { collection } from './collection-data.js';
import { emblemPoints } from './emblem.js';
import { createLabDemos } from './lab-demos.js';

const TAU = Math.PI * 2;
const lerp = THREE.MathUtils.lerp;
const V = (x=0,y=0,z=0) => new THREE.Vector3(x,y,z);
const palette = { ivory:0xe6e2d6, edge:0xc6c6bc, dark:0x32383a, orange:0xe65224, pcb:0x266d60, gold:0xc3a46c };
let softwareGeometry=false;
const seeded = (n) => { const x=Math.sin(n*127.1+311.7)*43758.5453; return x-Math.floor(x); };
const mat = (color, roughness=.45, metalness=0) => new THREE.MeshStandardMaterial({color,roughness,metalness});

function box(parent,w,h,d,material,x=0,y=0,z=0,r=.045) {
  const geometry=softwareGeometry&&Math.min(w,h,d)<.08?new THREE.BoxGeometry(w,h,d):new RoundedBoxGeometry(w,h,d,softwareGeometry?1:3,Math.min(r,w/4,h/4,d/4));
  const mesh = new THREE.Mesh(geometry,material);
  mesh.position.set(x,y,z); mesh.castShadow=true; mesh.receiveShadow=true; parent.add(mesh); return mesh;
}
function cylinder(parent,r,h,material,x=0,y=0,z=0,segments=64) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,softwareGeometry?Math.min(segments,32):segments),material);
  mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function planeTexture(parent,texture,w,h,x,y,z,flat=false) {
  const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false});
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),material);mesh.position.set(x,y,z);if(flat)mesh.rotation.x=-Math.PI/2;
  mesh.userData.noWire=true;parent.add(mesh);return mesh;
}
function canvasTexture(width,height,draw) {
  const c=document.createElement('canvas');c.width=width;c.height=height;draw(c.getContext('2d'),width,height);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
function spiralPoints(scale=1,z=0) {
  const pts=[];for(let i=0;i<=250;i++){const a=i/250*Math.PI*4.65;const r=.04+a*.080;pts.push(V(Math.cos(a+Math.PI*.05)*r*scale,Math.sin(a+Math.PI*.05)*r*scale,z));}return pts;
}
function drawSpiral(ctx,cx,cy,s,color) {
  ctx.strokeStyle=color;ctx.lineWidth=s*.073;ctx.lineCap='round';ctx.beginPath();
  spiralPoints(.37*s).forEach((p,i)=>i?ctx.lineTo(cx+p.x,cy-p.y):ctx.moveTo(cx+p.x,cy-p.y));ctx.stroke();
}

export class DreamScene {
  constructor(canvas,lcd) {
    this.canvas=canvas;this.lcd=lcd;this.view='home';this.bootMode=true;this.bootTime=-1;this.elapsed=0;this.explosion=0;this.explodeTarget=0;this.autoRotate=true;this.motion=true;this.wire=false;this.drag={down:false,x:0,y:0};this.yaw=-.36;this.tilt=0;this.zoom=1;this.accent=new THREE.Color(palette.orange);this.quality='auto';this.dark=false;this.onBiosPick=null;this.onBiosHover=null;this.onMetric=null;this.ready=false;
    this.raycaster=new THREE.Raycaster();this.mouse=new THREE.Vector2();this.root=new THREE.Group();this.frameCount=0;this.frameTime=0;this.currentFps=60;
    try {
      try{this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});}
      catch(error){this.isSoftware=true;softwareGeometry=true;this.renderer=new SoftwareRenderer(canvas);console.info('Using the Canvas 3D compatibility renderer. WebGL is unavailable.');}
      this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.12;
      this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.autoClear=false;
      this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0xf3f1eb);this.scene.fog=new THREE.FogExp2(0xf3f1eb,.023);
      this.camera=new THREE.OrthographicCamera(-7,7,4,-4,.1,120);this.camera.position.set(0,6.3,12);this.camera.lookAt(0,0,0);
      this.makeLights();this.makeEnvironment();this.makeFloor();this.scene.add(this.root);
      this.makeConsole();this.makeVmu();this.makeBios();this.makeLab();this.labDemo='sonic';this.labDemos=createLabDemos(this.isSoftware);this.root.add(this.labDemos.group);this.makeDisc();this.collection=new CollectionScene(this.root,collection,this.isSoftware);this.makeParticles();this.makeBoot();
      this.ready=true;this.resize();this.showView('home');this.bindControls();
      window.addEventListener('resize',()=>this.resize());
      this.contextLostHandler=(event)=>{event.preventDefault();this.contextLost=true;document.dispatchEvent(new CustomEvent('render-lost'));};
      canvas.addEventListener('webglcontextlost',this.contextLostHandler);
      canvas.addEventListener('webglcontextrestored',()=>{this.contextLost=false;this.resize();document.dispatchEvent(new CustomEvent('render-restored'));});
    } catch(error) {this.error=error;this.ready=false;console.warn('3D initialization:',error);}
  }

  makeLights() {
    this.scene.add(new THREE.HemisphereLight(0xfaf8ef,0x949e9b,3));
    this.key=new THREE.DirectionalLight(0xfff5e5,4.5);this.key.position.set(-3,10,6);this.key.castShadow=true;this.key.shadow.mapSize.set(2048,2048);this.key.shadow.camera.left=-9;this.key.shadow.camera.right=9;this.key.shadow.camera.top=8;this.key.shadow.camera.bottom=-8;this.key.shadow.normalBias=.025;this.key.shadow.bias=-.0002;this.key.shadow.radius=4;this.scene.add(this.key);
    this.rim=new THREE.DirectionalLight(0xc4dbec,2.1);this.rim.position.set(6,5,-5);this.scene.add(this.rim);
    const fill=new THREE.DirectionalLight(0xffb478,.65);fill.position.set(-5,0,-2);this.scene.add(fill);
  }

  makeEnvironment() {
    if(this.isSoftware)return;
    const env=new THREE.Scene();env.background=new THREE.Color(0xb9bebc);
    const panels=[[0,6,0,8,1,7,0xffffff],[-6,2,0,1,6,8,0xf1e6d5],[6,1,-3,1,5,6,0xc4d4e1],[0,-5,0,9,1,9,0x626e71]];
    for(const [x,y,z,w,h,d,c] of panels){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshBasicMaterial({color:c}));m.position.set(x,y,z);env.add(m);}
    const pmrem=new THREE.PMREMGenerator(this.renderer);this.envTarget=pmrem.fromScene(env,.04,.1,50);this.scene.environment=this.envTarget.texture;this.scene.environmentIntensity=.7;
    env.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});pmrem.dispose();
  }

  makeFloor() {
    this.floorMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uColor:{value:new THREE.Color(0xc5c9c2)},uAccent:{value:this.accent},uTime:{value:0},uDark:{value:0}},vertexShader:`varying vec3 w;void main(){vec4 p=modelMatrix*vec4(position,1.);w=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,fragmentShader:`varying vec3 w;uniform vec3 uColor;uniform vec3 uAccent;uniform float uTime;uniform float uDark;void main(){vec2 p=w.xz;vec2 g=abs(fract(p*.65-.5)-.5)/fwidth(p*.65);float line=1.-min(min(g.x,g.y),1.);float dist=length(p-vec2(2.4,0.));float fade=exp(-dist*.13);float ring=1.-smoothstep(.012,.028,abs(fract(dist*.29-uTime*.008)-.5));float alpha=line*fade*.22+ring*fade*.035;gl_FragColor=vec4(mix(uColor,uAccent,ring*.6),alpha);}`});
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(120,120),this.floorMaterial);floor.rotation.x=-Math.PI/2;floor.position.y=-1.65;this.scene.add(floor);
    this.shadowPlane=new THREE.Mesh(new THREE.PlaneGeometry(35,35),new THREE.ShadowMaterial({opacity:.16}));this.shadowPlane.rotation.x=-Math.PI/2;this.shadowPlane.position.y=-1.64;this.shadowPlane.receiveShadow=true;this.scene.add(this.shadowPlane);
    const shadowTex=canvasTexture(128,128,(c,w,h)=>{const g=c.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);g.addColorStop(0,'rgba(30,45,40,.22)');g.addColorStop(.45,'rgba(30,45,40,.10)');g.addColorStop(1,'rgba(30,45,40,0)');c.fillStyle=g;c.fillRect(0,0,w,h);});
    this.contactShadow=planeTexture(this.scene,shadowTex,8,7,2.4,-1.63,0,true);
  }

  makeConsole() {
    const consoleGroup=new THREE.Group();this.consoleGroup=consoleGroup;this.root.add(consoleGroup);
    const plastic=mat(palette.ivory,.36),lowerPlastic=mat(0xcecfc6,.48),edge=mat(palette.edge,.55),black=mat(0x242b2d,.4),metal=mat(0x939a9a,.3,.8),white=mat(0xf0ede3,.4);
    this.consoleMaterials=[plastic,lowerPlastic,edge,black,metal,white];
    const exterior=createDreamcastCase({low:this.isSoftware,accent:this.accent.getStyle()});
    Object.assign(this,exterior);consoleGroup.add(this.base,this.shell);

    this.board=new THREE.Group();consoleGroup.add(this.board);
    box(this.board,3.2,.065,3.3,mat(palette.pcb,.5,.2),0,.31,-.05,.04);
    const traces=[];for(let i=0;i<75;i++){const x=(seeded(i)-.5)*2.85,z=(seeded(i+800)-.5)*2.9;const endx=x+(seeded(i+45)-.5)*.65,endz=z+(seeded(i+80)-.5)*.65;traces.push(x,.35,z,endx,.35,z,endx,.35,z,endx,.35,endz);}
    const tg=new THREE.BufferGeometry();tg.setAttribute('position',new THREE.Float32BufferAttribute(traces,3));const tl=new THREE.LineSegments(tg,new THREE.LineBasicMaterial({color:0xa2b48b,transparent:true,opacity:.55}));this.board.add(tl);
    this.chips=[];
    const chipData=[['SH-4',-.65,-.5,.67,.65],['PowerVR2',.62,-.5,.78,.78],['AICA',.7,.65,.5,.48],['SDRAM',-.65,.65,.45,.7]];
    for(const [label,x,z,w,d] of chipData){const cm=mat(0x303737,.45,.35);const chip=box(this.board,w,.10,d,cm,x,.40,z,.035);this.chips.push(chip);for(let k=0;k<12;k++){const pos=(k-5.5)*d/13;box(this.board,.08,.025,.025,metal,x-w/2-.035,.37,z+pos,.003);box(this.board,.08,.025,.025,metal,x+w/2+.035,.37,z+pos,.003);}const t=canvasTexture(200,180,(c,W,H)=>{c.fillStyle='#bcbdb0';c.textAlign='center';c.font='13px monospace';c.fillText(label==='SH-4'?'HITACHI':label==='PowerVR2'?'NEC':'YAMAHA',W/2,65);c.font='bold 27px monospace';c.fillText(label,W/2,105);c.font='10px monospace';c.fillText('JAPAN · 1998',W/2,135);});planeTexture(this.board,t,w*.9,d*.8,x,.457,z,true);}
    for(let i=0;i<17;i++){const x=(seeded(i+11)-.5)*2.7,z=(seeded(i+122)-.5)*2.8;if(Math.abs(x)<1.15&&Math.abs(z)<1.15)continue;cylinder(this.board,.06,.15,mat(0x66716f,.25,.7),x,.43,z,12);cylinder(this.board,.051,.01,metal,x,.51,z,12);}
    this.shield=new THREE.Group();consoleGroup.add(this.shield);
    box(this.shield,3.2,.035,3.2,mat(0xaab1b0,.4,.8),0,.5,-.1,.04);
    for(let i=0;i<12;i++)box(this.shield,.055,.045,1.55,metal,-1.35+i*.13,.54,-.2,.01);
    this.drive=new THREE.Group();consoleGroup.add(this.drive);
    box(this.drive,2.82,.12,2.8,black,0,.61,-.05,.08);cylinder(this.drive,1.29,.055,mat(0x545b5c,.3,.6),0,.69,-.03);
    this.driveDisc=cylinder(this.drive,1.20,.016,new THREE.MeshPhysicalMaterial({color:0xd7dce0,metalness:.9,roughness:.2,iridescence:1,iridescenceIOR:1.35,iridescenceThicknessRange:[100,600]}),0,.729,-.03);
    cylinder(this.drive,.13,.045,black,0,.75,-.03,32);
    this.controller=this.makeController();this.controller.scale.setScalar(.64);this.controller.rotation.set(-1.0,0,-.22);this.controller.position.set(1.7,-.75,2.7);consoleGroup.add(this.controller);
    // Port A receives a separate Maple connector, with a stepped plastic shell
    // and the cable exiting from its strain relief instead of the socket face.
    this.controllerPlug=new THREE.Group();consoleGroup.add(this.controllerPlug);
    const plugPlastic=mat(0xd6dad3,.55),plugShade=mat(0xa8b0aa,.65),plugMetal=mat(0x747f7c,.38,.55);
    box(this.controllerPlug,.29,.19,.13,plugMetal,-.8775,-.11,1.995,.025);
    box(this.controllerPlug,.39,.32,.22,plugPlastic,-.8775,-.135,2.095,.045);
    box(this.controllerPlug,.35,.29,.18,plugPlastic,-.8775,-.135,2.27,.055);
    box(this.controllerPlug,.31,.035,.11,plugShade,-.8775,.031,2.20,.012);
    box(this.controllerPlug,.18,.16,.17,plugShade,-.8775,-.155,2.43,.04);
    const cableCurve=new THREE.CatmullRomCurve3([V(1.55,-1.01,3.32),V(1.95,-1.55,3.9),V(2.52,-1.40,4.5),V(1.03,-1.37,4.65),V(-.95,-1.30,3.70),V(-1.17,-.80,2.87),V(-.8775,-.155,2.49)]);
    this.cable=new THREE.Mesh(new THREE.TubeGeometry(cableCurve,90,.026,6,false),mat(0x6c726e,.6));this.cable.castShadow=true;consoleGroup.add(this.cable);
    this.miniVmu=this.makeVmuBody();this.miniVmu.scale.setScalar(.42);this.miniVmu.position.set(-1.95,-.60,2.65);this.miniVmu.rotation.set(-.65,.08,-.18);consoleGroup.add(this.miniVmu);
  }

  makeController() {
    const group=new THREE.Group();const shape=new THREE.Shape();
    shape.moveTo(-1.22,.84);shape.quadraticCurveTo(-1.75,.88,-1.91,.38);shape.quadraticCurveTo(-2.03,-.12,-1.73,-.67);shape.lineTo(-1.40,-1.51);shape.quadraticCurveTo(-1.20,-1.78,-.96,-1.50);shape.lineTo(-.51,-.76);shape.quadraticCurveTo(0,-.47,.51,-.76);shape.lineTo(.96,-1.50);shape.quadraticCurveTo(1.20,-1.78,1.40,-1.51);shape.lineTo(1.73,-.67);shape.quadraticCurveTo(2.03,-.12,1.91,.38);shape.quadraticCurveTo(1.75,.88,1.22,.84);shape.quadraticCurveTo(0,1.08,-1.22,.84);
    const body=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.35,bevelEnabled:true,bevelSegments:4,steps:1,bevelSize:.12,bevelThickness:.10,curveSegments:24}),mat(0xdce0d9,.46));body.castShadow=true;body.receiveShadow=true;group.add(body);
    const rim=mat(0xb4c0b7,.6),bay=mat(0x6b7a74,.66),glass=mat(0x4b6157,.5);
    box(group,1.10,1.17,.12,rim,0,.34,.45,.06);
    box(group,.91,.90,.03,bay,0,.43,.52,.022);
    box(group,.73,.54,.07,mat(0xd3dcd2,.45),0,.49,.56,.028);
    box(group,.62,.43,.015,glass,0,.50,.607,.012);
    planeTexture(group,this.lcd,.54,.355,0,.50,.624);
    box(group,.86,.13,.06,mat(0x82918a,.62),0,-.06,.52,.015);
    for(const side of [-1,1])box(group,.43,.11,.16,mat(0xaab5ac,.68),side*1.44,.85,.19,.04);
    const stick=cylinder(group,.24,.16,mat(0x7f8c84,.65),-.96,.42,.47,48);stick.rotation.x=Math.PI/2;
    const stickTop=cylinder(group,.195,.035,mat(0xb6c0b6,.7),-.96,.42,.57,48);stickTop.rotation.x=Math.PI/2;
    box(group,.47,.16,.10,mat(0x737f78,.6),-.87,-.34,.48,.025);box(group,.16,.47,.10,mat(0x737f78,.6),-.87,-.34,.49,.025);
    const buttons=[['Y',.93,.50,0x91b87b],['B',1.20,.24,0x6d9fb3],['A',.93,-.03,0xdd816d],['X',.66,.24,0xd6ba65]];
    for(const [letter,x,y,color] of buttons){const b=cylinder(group,.13,.095,mat(color,.3),x,y,.49,32);b.rotation.x=Math.PI/2;const t=canvasTexture(64,64,(c,w,h)=>{c.fillStyle='#f7f7e9';c.font='bold 27px Arial';c.textAlign='center';c.fillText(letter,w/2,42);});planeTexture(group,t,.14,.14,x,y,.545);}
    const start=box(group,.18,.12,.05,mat(0xe5ad72,.5),0,-.40,.46,.025);start.rotation.z=Math.PI/4;
    const txt=canvasTexture(256,100,(c,w,h)=>{c.fillStyle='#66776e';c.font='16px Arial';c.textAlign='center';c.fillText('DREAMCAST',w/2,43);});planeTexture(group,txt,.55,.21,0,-.24,.49);
    return group;
  }

  makeVmuBody() {return createVmu({lcd:this.lcd,low:this.isSoftware});}

  makeVmu() {this.vmuGroup=new THREE.Group();this.vmuBody=this.makeVmuBody();this.vmuBody.scale.setScalar(1.37);this.vmuGroup.add(this.vmuBody);this.root.add(this.vmuGroup);}

  makeBios() {
    this.biosGroup=new THREE.Group();this.root.add(this.biosGroup);this.biosItems=[];this.biosSelected=0;
    const poses=[[-1.30,1.17],[1.30,1.17],[-1.30,-1.17],[1.30,-1.17]],colors=[0xeaa064,0x9fb9c4,0xbaafd0,0xa9be98];
    for(let i=0;i<4;i++){
      const [x,y]=poses[i];const g=new THREE.Group();g.position.set(x,y,0);this.biosGroup.add(g);g.userData.index=i;
      const orb=new THREE.Mesh(new THREE.SphereGeometry(.78,48,32),new THREE.MeshPhysicalMaterial({color:colors[i],metalness:.13,roughness:.15,clearcoat:1,clearcoatRoughness:.07,transparent:true,opacity:.32,depthWrite:false}));orb.userData.bios=i;g.add(orb);
      const material=new THREE.MeshPhysicalMaterial({color:0xe2e4da,metalness:.65,roughness:.23,clearcoat:.8});
      const inner=new THREE.Group();g.add(inner);
      if(i===0){const d=cylinder(inner,.49,.08,material,0,0,0,64);d.rotation.x=Math.PI/2;cylinder(inner,.08,.10,mat(0x697575,.3,.7));const ring=new THREE.Mesh(new THREE.TorusGeometry(.12,.015,8,48),mat(0xa0a8a3,.3,.7));ring.position.z=.06;inner.add(ring);}
      if(i===1){const vm=this.makeVmuBody();vm.scale.setScalar(.33);inner.add(vm);}
      if(i===2){const a=new THREE.Mesh(new THREE.TorusGeometry(.22,.075,16,40),material);a.position.set(-.15,-.2,.1);inner.add(a);box(inner,.12,.85,.12,material,.06,.12,.1);box(inner,.34,.12,.12,material,.17,.54,.1);}
      if(i===3){const cube=box(inner,.66,.66,.66,material,0,0,0,.07);cube.rotation.set(.4,.4,.1);const edges=new THREE.LineSegments(new THREE.EdgesGeometry(cube.geometry),new THREE.LineBasicMaterial({color:0x84957f}));cube.add(edges);}
      const orbit=new THREE.Mesh(new THREE.TorusGeometry(.94,.007,6,96),mat(colors[i],.3,.5));orbit.rotation.set(.6,.4,-.3);g.add(orbit);
      this.biosItems.push({group:g,inner,orb,orbit,base:V(x,y,0)});
    }
  }

  makeLab() {
    this.labGroup=new THREE.Group();this.root.add(this.labGroup);
    const geometry=new THREE.IcosahedronGeometry(.09,this.isSoftware?0:1);this.labMaterial=new THREE.MeshPhysicalMaterial({color:0xffffff,roughness:.28,metalness:.45,clearcoat:.6});
    this.instances=new THREE.InstancedMesh(geometry,this.labMaterial,2400);this.instances.instanceMatrix.setUsage(THREE.StaticDrawUsage);this.instances.castShadow=false;this.instances.receiveShadow=false;this.labGroup.add(this.instances);this.objectCount=400;this.setObjectCount(400);
    for(let i=0;i<3;i++){const ring=new THREE.Mesh(new THREE.TorusGeometry(2.5+i*.12,.008,6,200),mat(i===0?palette.orange:0xaeb7b1,.4,.6));ring.rotation.set(.2+i*.7,.3+i*.4,i*.6);this.labGroup.add(ring);}
    const nucleus=new THREE.Mesh(new THREE.IcosahedronGeometry(.72,1),new THREE.MeshPhysicalMaterial({color:0xf0ad76,roughness:.17,metalness:.63,iridescence:1,iridescenceIOR:1.25}));this.labGroup.add(nucleus);this.nucleus=nucleus;
  }

  setObjectCount(n) {
    if(!this.instances)return;this.objectCount=Math.max(100,Math.min(2400,Number(n)));const dummy=new THREE.Object3D();const colors=[0xe69560,0xd3d8cc,0x7d9eac,0xb4bda7,0xd9c6a5];
    for(let i=0;i<this.objectCount;i++){
      const t=i/this.objectCount*TAU*5.0,phi=i*2.39996323;const r=1.5+.5*Math.sin(t*3);const cx=Math.cos(t)*r,cy=Math.sin(t*2)*.8,cz=Math.sin(t)*r;
      const spread=.18+seeded(i+31)*.55;dummy.position.set(cx+Math.cos(phi)*spread,cy+Math.sin(phi)*spread,cz+(seeded(i+200)-.5)*spread);dummy.rotation.set(i*.33,i*.29,i*.71);dummy.scale.setScalar(.45+seeded(i+400)*1.6);dummy.updateMatrix();this.instances.setMatrixAt(i,dummy.matrix);this.instances.setColorAt(i,new THREE.Color(colors[i%colors.length]));
    }
    this.instances.count=this.objectCount;this.instances.instanceMatrix.needsUpdate=true;if(this.instances.instanceColor)this.instances.instanceColor.needsUpdate=true;this.instances.computeBoundingSphere();
  }

  makeDisc() {
    this.discGroup=new THREE.Group();this.root.add(this.discGroup);
    const disc=new THREE.Mesh(new THREE.CylinderGeometry(2.1,2.1,.034,160),new THREE.MeshPhysicalMaterial({color:0xe8e4d7,metalness:.86,roughness:.19,iridescence:1,iridescenceIOR:1.4,iridescenceThicknessRange:[100,750],clearcoat:1}));this.discGroup.add(disc);this.archiveDisc=disc;
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.34,.025,12,64),mat(0xb1b9b4,.15,.9));ring.rotation.x=-Math.PI/2;ring.position.y=.03;this.discGroup.add(ring);
    const hole=cylinder(this.discGroup,.19,.04,mat(0x777e77,.2,.7),0,.015,0,48);
    const label=canvasTexture(1024,1024,(c,w,h)=>{c.translate(w/2,h/2);c.fillStyle='#e65224';c.beginPath();c.arc(0,0,470,Math.PI,Math.PI*1.65);c.lineTo(0,0);c.fill();c.globalCompositeOperation='destination-out';c.beginPath();c.arc(0,0,130,0,TAU);c.fill();c.globalCompositeOperation='source-over';c.fillStyle='#fffdf5';c.font='46px Arial';c.textAlign='center';c.rotate(-.4);c.fillText('Dreamcast',-95,-210);c.fillStyle='#59665f';c.font='bold 27px monospace';c.fillText('GD-ROM',0,300);c.font='13px monospace';c.fillText('GIGABYTE DISC · 1998',0,335);});planeTexture(this.discGroup,label,4.10,4.10,0,.034,0,true);
    for(let i=0;i<7;i++){const ring2=new THREE.Mesh(new THREE.TorusGeometry(1.25+i*.10,.002,3,180),new THREE.MeshBasicMaterial({color:0x9da995,transparent:true,opacity:.3}));ring2.rotation.x=-Math.PI/2;ring2.position.y=.037;this.discGroup.add(ring2);}
    this.discGroup.rotation.set(.75,0,-.15);
    this.dataRing=new THREE.Mesh(new THREE.TorusGeometry(2.42,.008,6,180),mat(0xe79d76,.4,.6));this.dataRing.rotation.x=-Math.PI/2;this.discGroup.add(this.dataRing);
  }

  makeParticles() {
    const pos=[];for(let i=0;i<130;i++)pos.push((seeded(i+90)-.5)*17,seeded(i+108)*9-2,(seeded(i+56)-.5)*13);
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    this.particles=new THREE.Points(g,new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{time:{value:0},color:{value:new THREE.Color(0xcaba9c)}},vertexShader:`uniform float time;varying float a;void main(){vec3 p=position;p.y+=sin(time*.19+position.x)*.25;p.x+=cos(time*.1+position.z)*.12;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=2.0;a=.2+.4*abs(sin(position.x+time*.3));}`,fragmentShader:`uniform vec3 color;varying float a;void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;gl_FragColor=vec4(color,a*(1.-d*2.));}`}));this.scene.add(this.particles);
  }

  makeBoot() {
    this.bootScene=new THREE.Scene();this.bootScene.background=new THREE.Color(0xf3f1eb);this.bootCamera=new THREE.OrthographicCamera(-7,7,4,-4,.1,40);this.bootCamera.position.set(0,0,12);this.bootCamera.lookAt(0,0,0);
    this.bootScene.add(new THREE.HemisphereLight(0xffffff,0xb4aa91,3));const light=new THREE.DirectionalLight(0xfff4de,5);light.position.set(-3,5,7);this.bootScene.add(light);
    this.bootRoot=new THREE.Group();this.bootScene.add(this.bootRoot);
    this.bootCurve=new THREE.CatmullRomCurve3(emblemPoints.map(([x,y])=>V(x*.97,y*.97,0)),false,'centripetal',.5);
    this.bootTubeGeometry=new THREE.TubeGeometry(this.bootCurve,400,.057,12,false);
    this.bootMaterial=new THREE.MeshPhysicalMaterial({color:palette.orange,roughness:.25,metalness:.08,clearcoat:1});
    this.bootSpiral=new THREE.Mesh(this.bootTubeGeometry,this.bootMaterial);this.bootSpiral.position.y=.48;this.bootRoot.add(this.bootSpiral);
    this.bootBall=new THREE.Mesh(new THREE.SphereGeometry(.14,32,24),this.bootMaterial);this.bootRoot.add(this.bootBall);
    this.bootLetters=[];
    const word='Dreamcast',letterWidths=[.46,.31,.40,.40,.58,.37,.40,.37,.29],total=letterWidths.reduce((a,b)=>a+b,0)+.045*8;
    let cursor=-total/2;
    for(let i=0;i<word.length;i++){
      const letter=word[i],w=letterWidths[i];
      const tex=canvasTexture(128,160,(c,W,H)=>{c.fillStyle='#ffffff';c.font='500 122px Arial';c.textAlign='center';c.textBaseline='middle';c.fillText(letter,W/2,H/2+5);});
      const plane=planeTexture(this.bootRoot,tex,w*1.6,.82,cursor+w/2,-1.06,.01);
      plane.material.color.set(0x101113);
      plane.userData.targetX=cursor+w/2;this.bootLetters.push(plane);cursor+=w+.045;
    }
    const japanese=canvasTexture(512,96,(c,W,H)=>{c.fillStyle='#fff';c.textAlign='center';c.textBaseline='middle';c.font='38px Arial, sans-serif';c.fillText('ドリームキャスト',W/2,H/2);});
    this.bootJapanese=planeTexture(this.bootRoot,japanese,2.55,.42,0,-1.40,.02);
    this.bootJapanese.material.color.set(0x101113);
    const shadowTexture=canvasTexture(128,128,(c,w,h)=>{const g=c.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(75,61,30,.15)');g.addColorStop(1,'rgba(75,61,30,0)');c.fillStyle=g;c.fillRect(0,0,w,h);});
    this.bootShadow=planeTexture(this.bootScene,shadowTexture,3,1,0,-1.5,-1);this.bootShadow.material.opacity=.4;
  }

  bindControls() {
    const zone=document.getElementById('orbit-zone');
    zone.addEventListener('pointerdown',e=>{if(e.button!==0)return;this.drag={down:true,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY};zone.setPointerCapture(e.pointerId);});
    zone.addEventListener('pointermove',e=>{
      if(this.drag.down&&this.view!=='bios'){this.yaw+=(e.clientX-this.drag.x)*.008;this.tilt=THREE.MathUtils.clamp(this.tilt+(e.clientY-this.drag.y)*.005,-.65,.65);this.drag.x=e.clientX;this.drag.y=e.clientY;}
      else if(this.view==='bios'){const index=this.pickBios(e);if(index!==null&&this.onBiosHover)this.onBiosHover(index);zone.style.cursor=index!==null?'pointer':'grab';}
    });
    zone.addEventListener('pointerup',e=>{const click=Math.hypot(e.clientX-this.drag.startX,e.clientY-this.drag.startY)<8;this.drag.down=false;if(this.view==='bios'&&click){const index=this.pickBios(e);if(index!==null&&this.onBiosPick)this.onBiosPick(index);}});
    zone.addEventListener('pointercancel',()=>{this.drag.down=false;});
    zone.addEventListener('wheel',e=>{if(this.mobile)return;e.preventDefault();this.zoom=THREE.MathUtils.clamp(this.zoom-e.deltaY*.0006,.72,1.35);},{passive:false});
    zone.addEventListener('keydown',e=>{if(this.view==='bios'||this.view==='vmu')return;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();this.yaw+=e.key==='ArrowLeft'?-.13:e.key==='ArrowRight'?.13:0;this.tilt=THREE.MathUtils.clamp(this.tilt+(e.key==='ArrowUp'?-.08:e.key==='ArrowDown'?.08:0),-.65,.65);}});
  }

  pickBios(event) {
    if(!this.ready)return null;const v=this.viewport;this.mouse.set((event.clientX-v.x)/v.w*2-1,-((event.clientY-v.top)/v.h)*2+1);this.raycaster.setFromCamera(this.mouse,this.camera);const hits=this.raycaster.intersectObjects(this.biosItems.map(i=>i.orb));return hits.length?hits[0].object.userData.bios:null;
  }

  showView(view) {
    this.view=view;if(!this.ready)return;
    this.consoleGroup.visible=view==='home'||view==='hardware';this.vmuGroup.visible=view==='vmu';this.biosGroup.visible=view==='bios';this.labGroup.visible=view==='lab'&&this.labDemo==='particles';this.labDemos.group.visible=view==='lab'&&this.labDemo!=='particles';this.discGroup.visible=view==='archive'||view==='music';this.collection.group.visible=view==='collection';
    this.controller.visible=view==='home';this.controllerPlug.visible=view==='home';this.cable.visible=view==='home';this.miniVmu.visible=view==='home';
    this.yaw=view==='hardware'?-.36:view==='vmu'?-.13:view==='bios'?0:view==='archive'?-.3:view==='collection'?-.12:-.36;this.tilt=0;this.zoom=1;
    if(view!=='hardware')this.explodeTarget=0;
    this.resize();
  }

  setExplosion(value) {this.explodeTarget=value?1:0;}
  setCollection(index){if(this.ready)this.collection.select(index);}
  setCollectionOpen(value){if(this.ready)this.collection.setOpen(value);}
  selectChip(index) {if(!this.ready)return;this.chips.forEach((chip,i)=>{chip.material.emissive.set(i===index?this.accent:0x000000);chip.material.emissiveIntensity=i===index?.3:0;});}
  setBiosSelected(index) {this.biosSelected=index;}
  setWire(value) {
    this.wire=value;if(!this.ready)return;
    for(const g of [this.consoleGroup,this.vmuGroup,this.discGroup,this.collection.group])g.traverse(o=>{if(o.isMesh&&!o.userData.noWire&&o.material&&'wireframe'in o.material)o.material.wireframe=value;});
  }
  setLabDemo(name){if(!this.ready||!(name==='particles'||name in this.labDemos.models))return;this.labDemo=name;this.labDemos.select(name==='particles'?'sonic':name);this.labGroup.visible=this.view==='lab'&&name==='particles';this.labDemos.group.visible=this.view==='lab'&&name!=='particles';this.yaw=name==='coast'?-.15:-.10;this.tilt=0;this.zoom=1;}
  setLabStyle(style){if(!this.ready)return;this.labMaterial.wireframe=style==='wire';this.labDemos.setWire(style==='wire');}
  resetCamera(){this.yaw=this.view==='vmu'?-.13:this.view==='bios'?0:-.36;this.tilt=0;this.zoom=1;}
  setQuality(quality){this.quality=quality;if(this.ready){this.renderer.setPixelRatio(quality==='low'?1:quality==='high'?Math.min(2,devicePixelRatio):Math.min(this.mobile?1.5:1.75,devicePixelRatio));this.renderer.shadowMap.enabled=quality!=='low';this.resize();}}
  setTheme(dark) {
    this.dark=dark;if(!this.ready)return;const color=dark?0x181c1e:0xf3f1eb;this.scene.background.set(color);this.scene.fog.color.set(color);this.bootScene.background.set(color);this.bootLetters.forEach(l=>l.material.color.set(dark?0xf3f1eb:0x101113));this.bootJapanese.material.color.set(dark?0xf3f1eb:0x101113);this.floorMaterial.uniforms.uColor.value.set(dark?0x64706b:0xc5c9c2);this.floorMaterial.uniforms.uDark.value=dark?1:0;this.scene.environmentIntensity=dark?.45:.7;this.key.intensity=dark?3.8:4.5;this.rim.intensity=dark?3:2.1;this.contactShadow.material.opacity=dark?.2:1;
  }
  setAccent(color) {const next=new THREE.Color(color);if(this.accent.equals(next))return;this.accent.copy(next);if(!this.ready)return;this.bootMaterial.color.set(color);this.floorMaterial.uniforms.uAccent.value=this.accent;if(this.lidTexture)paintLidMark(this.lidTexture,this.accent.getStyle());}
  startBoot(){this.bootMode=true;this.bootTime=0;this.bootClock=performance.now();}
  finishBoot(){this.bootMode=false;this.bootTime=-1;this.resize();}

  resize() {
    if(!this.ready)return;this.width=window.innerWidth;this.height=window.innerHeight;this.mobile=this.width<=800;
    if(this.quality==='auto')this.renderer.setPixelRatio(Math.min(this.mobile?1.5:1.75,devicePixelRatio));
    this.renderer.setSize(this.width,this.height,false);
    const mobileHeight=310;this.viewport=this.mobile?{x:0,top:108-window.scrollY,w:this.width,h:mobileHeight}:{x:0,top:0,w:this.width,h:this.height};
    this.adjustCamera(this.camera,this.viewport.w/this.viewport.h,this.mobile?5.2:7.8);
    this.adjustCamera(this.bootCamera,this.width/this.height,this.mobile?9:8);
  }
  adjustCamera(camera,aspect,height) {camera.left=-height*aspect/2;camera.right=height*aspect/2;camera.top=height/2;camera.bottom=-height/2;camera.updateProjectionMatrix();}

  project(object,offset=V()) {
    if(!this.ready)return{x:0,y:0};const p=offset.clone();object.localToWorld(p);p.project(this.camera);const v=this.viewport;
    return {x:v.x+(p.x*.5+.5)*v.w,y:(this.mobile?108:v.top)+(1-(p.y*.5+.5))*v.h};
  }

  render(dt) {
    if(!this.ready||this.contextLost)return;const step=this.motion?Math.min(.1,dt):0;this.elapsed+=step;this.frameTime+=dt;
    if(this.isSoftware){this.softwareTime=(this.softwareTime||0)+dt;if(this.softwareTime<1/12)return;dt=Math.min(.15,this.softwareTime);this.softwareTime=0;}
    this.frameCount++;
    if(this.frameTime>=.75){this.currentFps=Math.round(this.frameCount/this.frameTime);this.frameCount=0;this.frameTime=0;if(this.onMetric)this.onMetric({fps:this.currentFps,triangles:this.renderer.info.render.triangles,calls:this.renderer.info.render.calls});}
    const r=this.renderer;r.setScissorTest(false);r.setViewport(0,0,this.width,this.height);r.setClearColor(this.dark?0x181c1e:0xf3f1eb,1);r.clear();
    if(this.bootMode){this.updateBoot(dt);r.render(this.bootScene,this.bootCamera);return;}
    if(this.mobile)this.viewport.top=108-window.scrollY;
    const v=this.viewport;if(v.top+v.h<0||v.top>this.height)return;
    r.setViewport(v.x,this.height-v.top-v.h,v.w,v.h);r.setScissor(v.x,Math.max(0,this.height-v.top-v.h),v.w,Math.min(v.h,this.height-v.top));r.setScissorTest(true);
    const targetX=this.mobile?0:((this.width/this.height)*7.8*.20);
    const viewY=this.view==='hardware'?-.42:this.view==='home'?.30:this.view==='archive'?.1:.1;
    this.root.position.lerp(V(targetX,viewY,0),Math.min(1,dt*4));
    const scale=this.zoom*(this.mobile?(this.view==='home'?.75:this.view==='hardware'?.76-this.explosion*.04:this.view==='vmu'?.91:.87):this.view==='home'?.94:this.view==='hardware'?.93-this.explosion*.075:1);
    this.root.scale.lerp(V(scale,scale,scale),Math.min(1,dt*5));
    const auto=this.autoRotate&&this.motion&&!this.drag.down?Math.sin(this.elapsed*.15)*.13:0;
    this.root.rotation.y=lerp(this.root.rotation.y,this.yaw+auto,Math.min(1,dt*6));this.root.rotation.x=lerp(this.root.rotation.x,this.tilt,Math.min(1,dt*6));
    const cameraPosition=this.view==='home'||this.view==='hardware'?V(0,6.3,12):this.view==='lab'?this.labDemo==='coast'?V(0,5.0,13):V(0,2.7,13):V(0,1.3,13);this.camera.position.lerp(cameraPosition,Math.min(1,dt*3));this.camera.lookAt(0,0,0);
    this.explosion=lerp(this.explosion,this.explodeTarget,Math.min(1,dt*4));
    this.board.position.y=this.explosion*.30;this.shield.position.y=this.explosion*.95;this.drive.position.y=-.18+this.explosion*1.60;this.shell.position.y=this.explosion*2.85;
    this.consoleGroup.position.y=-this.explosion*.44+Math.sin(this.elapsed*.65)*.045;
    this.driveDisc.rotation.y=this.elapsed*.35;
    this.vmuGroup.rotation.z=Math.sin(this.elapsed*.4)*.025;this.vmuGroup.position.y=Math.sin(this.elapsed*.6)*.06;
    this.biosItems.forEach((item,i)=>{const s=i===this.biosSelected?1.09:.91;item.group.scale.lerp(V(s,s,s),Math.min(1,dt*5));item.group.position.y=item.base.y+Math.sin(this.elapsed*.8+i*1.5)*.045;item.inner.rotation.y=Math.sin(this.elapsed*.4+i)*.2;item.orbit.rotation.z+=step*.08;});
    this.labGroup.rotation.y=this.elapsed*.075;this.labGroup.rotation.z=Math.sin(this.elapsed*.17)*.08;this.nucleus.rotation.x=this.elapsed*.2;this.nucleus.rotation.z=this.elapsed*.13;
    this.labDemos.update(this.elapsed);
    this.discGroup.rotation.y=this.elapsed*.12;this.discGroup.position.y=Math.sin(this.elapsed*.5)*.08;
    this.collection.update(dt,this.elapsed);
    this.floorMaterial.uniforms.uTime.value=this.elapsed;this.particles.material.uniforms.time.value=this.elapsed;
    r.render(this.scene,this.camera);r.setScissorTest(false);
  }

  updateBoot(dt) {
    const idle=this.bootTime<0;
    // The supplied GIF drops/condenses frames. Stretch its spatial choreography
    // to the approximately nine-second real startup instead of matching GIF time.
    const t=idle?0:(performance.now()-this.bootClock)/1500;
    this.bootRoot.position.set(idle?(this.mobile?0:2.9):0,idle?(this.mobile?1.45:.15):.63,0);
    this.bootRoot.scale.setScalar(idle?(this.mobile?.91:1.65):(this.mobile?1.12:1.32));
    this.bootRoot.rotation.set(idle?.1:0,idle?Math.sin(this.elapsed*.3)*.09:0,0);
    for(let i=0;i<this.bootLetters.length;i++){
      const l=this.bootLetters[i],p=THREE.MathUtils.clamp((t-(.25+i*.25))/.15,0,1),ease=1-Math.pow(1-p,3);
      l.visible=!idle&&p>0;l.material.opacity=ease;
      l.position.x=l.userData.targetX;l.position.y=-1.06-(1-ease)*.4;l.rotation.y=(1-ease)*.8;
    }
    this.bootJapanese.visible=!idle&&t>=4.05;
    this.bootJapanese.material.opacity=THREE.MathUtils.clamp((t-4.05)/.18,0,1);
    if(idle){this.bootSpiral.visible=true;this.bootTubeGeometry.setDrawRange(0,Infinity);this.bootBall.visible=false;}
    else if(t<3.48){this.bootSpiral.visible=false;this.bootBall.visible=true;
      if(t<2.45){const p=t/2.45;this.bootBall.position.set(-2.1+4.35*p,-.72+Math.abs(Math.sin(p*Math.PI*3.5))*(1-p)*.77,0);}
      else{const p=(t-2.45)/1.03,first=this.bootCurve.getPoint(0);this.bootBall.position.set(2.25+(first.x-2.25)*p,-.72+(first.y+.48+.72)*p+2.35*Math.sin(p*Math.PI),0);}
    }else{this.bootSpiral.visible=true;const p=THREE.MathUtils.clamp((t-3.48)/.68,0,1);
      this.bootTubeGeometry.setDrawRange(0,Math.floor(this.bootTubeGeometry.index.count*p/6)*6);
      this.bootBall.position.copy(this.bootCurve.getPointAt(p));this.bootBall.position.y+=.48;this.bootBall.visible=p<1;
    }
    this.bootShadow.position.set(idle?(this.mobile?0:2.9):0,-1.1,-1);this.bootShadow.material.opacity=idle?.15:.27;
  }
}
