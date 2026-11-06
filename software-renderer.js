import * as THREE from 'three';

// A small depth-buffered renderer for environments where WebGL is disabled.
// It shares the real scene graph, model geometry, camera and textures with WebGL.
// Transparency/shadows are approximate. It is not a replacement for the GPU path.
export class SoftwareRenderer {
  constructor(canvas){this.domElement=canvas;this.context=canvas.getContext('2d',{alpha:false});if(!this.context)throw Error('No graphics context is available');this.shadowMap={enabled:false};this.info={render:{triangles:0,calls:0}};this.color=new THREE.Color(0xf3f1eb);this.width=innerWidth;this.height=innerHeight;this.viewport={x:0,y:0,w:this.width,h:this.height};this.ratio=1;this.light=new THREE.Vector3(-.45,.8,.65).normalize();this.m=new THREE.Matrix4();this.normal=new THREE.Matrix3();this.v=new THREE.Vector3();this.n=new THREE.Vector3();this.c=new THREE.Color();this.pixelCanvas=document.createElement('canvas');this.pixelContext=this.pixelCanvas.getContext('2d');this.textureCache=new WeakMap();}
  setPixelRatio(){this.ratio=1;}
  setSize(w,h){if(this.domElement.width!==w)this.domElement.width=w;if(this.domElement.height!==h)this.domElement.height=h;this.width=w;this.height=h;}
  setViewport(x,y,w,h){this.viewport={x,y:this.height-y-h,w,h};}
  setScissor(){}
  setScissorTest(){}
  setClearColor(c){this.color.set(c);}
  clear(){this.context.fillStyle=this.color.getStyle();this.context.fillRect(0,0,this.width,this.height);}
  project(point,camera){const p=point.clone().project(camera),v=this.viewport;return[v.x+(p.x*.5+.5)*v.w,v.y+(1-(p.y*.5+.5))*v.h,p.z];}
  grid(camera,dark){
    const c=this.context;c.save();c.lineWidth=.55;c.strokeStyle=dark?'rgba(130,150,140,.15)':'rgba(140,155,142,.14)';
    for(let i=-18;i<=18;i++){for(let axis=0;axis<2;axis++){const a=this.project(new THREE.Vector3(axis?i:-18,-1.65,axis?-18:i),camera),b=this.project(new THREE.Vector3(axis?i:18,-1.65,axis?18:i),camera);c.beginPath();c.moveTo(a[0],a[1]);c.lineTo(b[0],b[1]);c.stroke();}}
    const p=this.project(new THREE.Vector3(2.2,-1.64,0),camera);const g=c.createRadialGradient(p[0],p[1],0,p[0],p[1],170);g.addColorStop(0,dark?'rgba(0,0,0,.18)':'rgba(70,85,72,.12)');g.addColorStop(1,'rgba(80,95,80,0)');c.save();c.translate(p[0],p[1]);c.scale(1,.4);c.fillStyle=g;/* shadow uses a local gradient below */c.restore();
    const sg=c.createRadialGradient(p[0],p[1],0,p[0],p[1],155);sg.addColorStop(0,dark?'rgba(0,0,0,.22)':'rgba(70,85,72,.10)');sg.addColorStop(1,'rgba(80,95,80,0)');c.fillStyle=sg;c.beginPath();c.ellipse(p[0],p[1],190,60,0,0,Math.PI*2);c.fill();c.restore();
  }
  render(scene,camera){
    const ctx=this.context,view=this.viewport;ctx.save();ctx.beginPath();ctx.rect(view.x,view.y,view.w,view.h);ctx.clip();camera.updateMatrixWorld();scene.updateMatrixWorld();this.info.render={triangles:0,calls:0};
    const dark=scene.background&&scene.background.r<.1;if(scene.fog)this.grid(camera,dark);
    const faces=[],lines=[];const pv=new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    scene.traverseVisible(object=>{
      if(object.isLineSegments){const pos=object.geometry.attributes.position;if(!pos||pos.count>1000)return;this.m.multiplyMatrices(pv,object.matrixWorld);const color=object.material.color.clone().convertLinearToSRGB();for(let i=0;i<pos.count-1;i+=2){const a=this.vertex(pos,i,this.m),b=this.vertex(pos,i+1,this.m);lines.push({a,b,rgb:[color.r*255,color.g*255,color.b*255],opacity:object.material.opacity??1});}return;}
      if(!object.isMesh||!object.geometry||!object.material||object.material.isShaderMaterial||object.material.isShadowMaterial)return;
      const material=Array.isArray(object.material)?object.material[0]:object.material;if(material.visible===false)return;const geo=object.geometry,pos=geo.attributes.position,uv=geo.attributes.uv,norm=geo.attributes.normal;if(!pos)return;
      const count=object.isInstancedMesh?object.count:1;const instance=new THREE.Matrix4(),world=new THREE.Matrix4();const instColor=new THREE.Color();
      for(let k=0;k<count;k++){
        if(object.isInstancedMesh){object.getMatrixAt(k,instance);world.multiplyMatrices(object.matrixWorld,instance);if(object.instanceColor)object.getColorAt(k,instColor);else instColor.set(0xffffff);}else{world.copy(object.matrixWorld);instColor.set(0xffffff);}
        this.m.multiplyMatrices(pv,world);this.normal.getNormalMatrix(world);const verts=new Float32Array(pos.count*3);
        for(let i=0;i<pos.count;i++){this.v.fromBufferAttribute(pos,i).applyMatrix4(this.m);verts[i*3]=view.x+(this.v.x*.5+.5)*view.w;verts[i*3+1]=view.y+(1-(this.v.y*.5+.5))*view.h;verts[i*3+2]=this.v.z;}
        const index=geo.index,available=index?index.count:pos.count;const start=Math.max(0,geo.drawRange.start||0),end=Math.min(available,Number.isFinite(geo.drawRange.count)?start+geo.drawRange.count:available);
        const image=material.map?.image;const color=material.color?material.color.clone().multiply(instColor):new THREE.Color(0xffffff);const opacity=material.opacity??1;
        for(let i=start;i<end-2;i+=3){
          const ai=index?index.getX(i):i,bi=index?index.getX(i+1):i+1,ci=index?index.getX(i+2):i+2;const a=ai*3,b=bi*3,c=ci*3;
          const ax=verts[a],ay=verts[a+1],bx=verts[b],by=verts[b+1],cx=verts[c],cy=verts[c+1];const area=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
          if(Math.abs(area)<.025||(area>=0&&material.side!==THREE.DoubleSide))continue;
          const z=(verts[a+2]+verts[b+2]+verts[c+2])/3;if(z< -1||z>1)continue;
          if(Math.max(ax,bx,cx)<view.x||Math.min(ax,bx,cx)>view.x+view.w||Math.max(ay,by,cy)<view.y||Math.min(ay,by,cy)>view.y+view.h)continue;
          let shade=1;if(!material.isMeshBasicMaterial&&norm){this.n.fromBufferAttribute(norm,ai).applyNormalMatrix(this.normal);if(area>=0)this.n.negate();shade=.64+Math.max(0,this.n.dot(this.light))*.52;}
          this.c.copy(color).multiplyScalar(shade);if(material.iridescence){const hue=((ax+ay)*.0007+this.n.x*.16+.25)%1;const rainbow=new THREE.Color().setHSL(hue,.30,.69);this.c.lerp(rainbow,.5);}
          const texture=image&&uv?{pixels:this.texturePixels(material.map),uv:[uv.getX(ai),uv.getY(ai),uv.getX(bi),uv.getY(bi),uv.getX(ci),uv.getY(ci)]}:null;
          const srgb=this.c.clone().convertLinearToSRGB();
          faces.push({z,zs:[verts[a+2],verts[b+2],verts[c+2]],p:[ax,ay,bx,by,cx,cy],color:this.c.getStyle(),rgb:[Math.round(Math.min(1,srgb.r)*255),Math.round(Math.min(1,srgb.g)*255),Math.round(Math.min(1,srgb.b)*255)],opacity,depthWrite:material.depthWrite!==false,wire:material.wireframe,texture});
        }
      }
      this.info.render.calls++;
    });
    faces.sort((a,b)=>((a.opacity===1&&a.depthWrite)?0:1)-((b.opacity===1&&b.depthWrite)?0:1)||b.z-a.z);this.info.render.triangles=faces.length;
    if(this.pixelCanvas.width!==this.width||this.pixelCanvas.height!==this.height){this.pixelCanvas.width=this.width;this.pixelCanvas.height=this.height;this.image=this.pixelContext.createImageData(this.width,this.height);this.depth=new Float32Array(this.width*this.height);}
    this.image.data.fill(0);this.depth.fill(Infinity);
    for(const f of faces)if(!f.wire)this.rasterize(f);
    for(const line of lines)this.rasterLine(line);
    this.pixelContext.putImageData(this.image,0,0);ctx.drawImage(this.pixelCanvas,0,0);
    for(const f of faces)if(f.wire){const p=f.p;ctx.globalAlpha=f.opacity;ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.lineTo(p[2],p[3]);ctx.lineTo(p[4],p[5]);ctx.closePath();ctx.strokeStyle=f.color;ctx.lineWidth=.6;ctx.stroke();}
    ctx.restore();
  }
  vertex(attribute,i,m){this.v.fromBufferAttribute(attribute,i).applyMatrix4(m);const v=this.viewport;return[v.x+(this.v.x*.5+.5)*v.w,v.y+(1-(this.v.y*.5+.5))*v.h,this.v.z];}
  texturePixels(map){const cached=this.textureCache.get(map);if(cached&&cached.version===map.version)return cached;const image=map.image;let pixels;try{pixels=image.getContext('2d').getImageData(0,0,image.width,image.height).data;}catch{const temp=document.createElement('canvas');temp.width=image.width;temp.height=image.height;const tc=temp.getContext('2d');tc.drawImage(image,0,0);pixels=tc.getImageData(0,0,temp.width,temp.height).data;}const result={pixels,width:image.width,height:image.height,version:map.version};this.textureCache.set(map,result);return result;}
  rasterLine(line){const {a,b,rgb}=line,n=Math.ceil(Math.max(Math.abs(b[0]-a[0]),Math.abs(b[1]-a[1]))),data=this.image.data;for(let i=0;i<=n;i++){const t=n?i/n:0,x=Math.round(a[0]+(b[0]-a[0])*t),y=Math.round(a[1]+(b[1]-a[1])*t),z=a[2]+(b[2]-a[2])*t;if(x<0||x>=this.width||y<0||y>=this.height)continue;const p=y*this.width+x;if(z>this.depth[p]+.00002)continue;const d=p*4;data[d]=rgb[0];data[d+1]=rgb[1];data[d+2]=rgb[2];data[d+3]=line.opacity*255;}}
  rasterize(face){
    const p=face.p,zs=face.zs,W=this.width,H=this.height,v=this.viewport;
    const minX=Math.max(0,Math.floor(v.x),Math.floor(Math.min(p[0],p[2],p[4]))),maxX=Math.min(W-1,Math.ceil(v.x+v.w),Math.ceil(Math.max(p[0],p[2],p[4]))),minY=Math.max(0,Math.floor(v.y),Math.floor(Math.min(p[1],p[3],p[5]))),maxY=Math.min(H-1,Math.ceil(v.y+v.h),Math.ceil(Math.max(p[1],p[3],p[5])));
    const den=(p[3]-p[5])*(p[0]-p[4])+(p[4]-p[2])*(p[1]-p[5]);if(Math.abs(den)<.00001)return;
    const a0=(p[3]-p[5])/den,b0=(p[4]-p[2])/den,c0=-(a0*p[4]+b0*p[5]);const a1=(p[5]-p[1])/den,b1=(p[0]-p[4])/den,c1=-(a1*p[4]+b1*p[5]);
    const data=this.image.data,depth=this.depth,texture=face.texture,tex=texture?.pixels,uv=texture?.uv;
    for(let y=minY;y<=maxY;y++){
      let w0=a0*(minX+.5)+b0*(y+.5)+c0,w1=a1*(minX+.5)+b1*(y+.5)+c1;
      for(let x=minX;x<=maxX;x++,w0+=a0,w1+=a1){const w2=1-w0-w1;if(w0<-.00001||w1<-.00001||w2<-.00001)continue;const index=y*W+x,z=w0*zs[0]+w1*zs[1]+w2*zs[2];if(z>depth[index]+.000002)continue;
        let red=face.rgb[0],green=face.rgb[1],blue=face.rgb[2],alpha=face.opacity;
        if(tex){const u=Math.max(0,Math.min(tex.width-1,Math.floor((w0*uv[0]+w1*uv[2]+w2*uv[4])*tex.width))),vv=Math.max(0,Math.min(tex.height-1,Math.floor((1-w0*uv[1]-w1*uv[3]-w2*uv[5])*tex.height))),i=(vv*tex.width+u)*4;alpha*=tex.pixels[i+3]/255;if(alpha<.01)continue;red=tex.pixels[i]*red/255;green=tex.pixels[i+1]*green/255;blue=tex.pixels[i+2]*blue/255;}
        const dest=index*4;if(alpha>.995){data[dest]=red;data[dest+1]=green;data[dest+2]=blue;data[dest+3]=255;}else{const oldAlpha=data[dest+3]/255,outAlpha=alpha+oldAlpha*(1-alpha),mix=oldAlpha*(1-alpha);data[dest]=(red*alpha+data[dest]*mix)/outAlpha;data[dest+1]=(green*alpha+data[dest+1]*mix)/outAlpha;data[dest+2]=(blue*alpha+data[dest+2]*mix)/outAlpha;data[dest+3]=outAlpha*255;}if(face.depthWrite)depth[index]=z;
      }
    }
  }
  textureTriangle(texture,p){
    const {image,uv}=texture,c=this.context;const w=image.width,h=image.height;if(!w||!h)return;const u0=uv[0]*w,v0=(1-uv[1])*h,u1=uv[2]*w,v1=(1-uv[3])*h,u2=uv[4]*w,v2=(1-uv[5])*h;
    const den=u0*(v1-v2)+u1*(v2-v0)+u2*(v0-v1);if(Math.abs(den)<.00001)return;
    const a=(p[0]*(v1-v2)+p[2]*(v2-v0)+p[4]*(v0-v1))/den,b=(p[1]*(v1-v2)+p[3]*(v2-v0)+p[5]*(v0-v1))/den;
    const cc=(p[0]*(u2-u1)+p[2]*(u0-u2)+p[4]*(u1-u0))/den,d=(p[1]*(u2-u1)+p[3]*(u0-u2)+p[5]*(u1-u0))/den;
    const e=(p[0]*(u1*v2-u2*v1)+p[2]*(u2*v0-u0*v2)+p[4]*(u0*v1-u1*v0))/den,f=(p[1]*(u1*v2-u2*v1)+p[3]*(u2*v0-u0*v2)+p[5]*(u0*v1-u1*v0))/den;
    c.save();c.clip();c.transform(a,b,cc,d,e,f);c.imageSmoothingEnabled=false;c.drawImage(image,0,0);c.restore();
  }
}
