import * as THREE from 'three';
import { DreamScene } from './scene.js?v=8';
import { launches, calculateAge } from './clock.js';
import { collection } from './collection-data.js';
import { emblemSvg } from './emblem.js';
import { tracks } from './music-data.js';

const $=(s,root=document)=>root.querySelector(s);
const $$=(s,root=document)=>[...root.querySelectorAll(s)];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const pad=(n,w=2)=>String(n).padStart(w,'0');
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const storage={get(k,d){try{return JSON.parse(localStorage.getItem('dreamcast.'+k))??d;}catch{return d;}},set(k,v){try{localStorage.setItem('dreamcast.'+k,JSON.stringify(v));}catch{}}};
const settings={theme:'dark',spiral:'orange',quality:'auto',motion:!reduced,crt:false,volume:45,...storage.get('settings',{})};
// Apply the new presentation default once, including browsers that saved v1.
// Subsequent explicit light/dark choices remain persistent.
if(settings.presentationVersion!==2){settings.theme='dark';settings.presentationVersion=2;}
const state={view:'home',entered:false,booting:false,bootStart:0,bios:0,article:'security',region:storage.get('region','jp'),wire:false,rotating:true};
let toastTimer=0;
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3300);}

class BiosAudio {
  constructor(){this.enabled=false;this.context=null;this.gain=null;this.buffers={};this.raw={};this.sources=new Set();this.lastSelect=0;this.loading=this.load();}
  async load(){const names=['boot','select','confirmation','back','disc_check','vmu_config','vmu_error'];const results=await Promise.allSettled(names.map(async name=>{const res=await fetch(`./assets/${name}.wav`);if(!res.ok)throw Error(`Audio ${name}: ${res.status}`);this.raw[name]=await res.arrayBuffer();}));return results.filter(r=>r.status==='fulfilled').length;}
  async enable(){try{const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return false;if(!this.context){this.context=new Ctx();this.gain=this.context.createGain();this.gain.gain.value=settings.volume/100;this.gain.connect(this.context.destination);}await this.context.resume();await this.loading;await Promise.all(Object.entries(this.raw).map(async([n,a])=>{if(!this.buffers[n])try{this.buffers[n]=await this.context.decodeAudioData(a.slice(0));}catch{}}));this.enabled=Object.keys(this.buffers).length>0;return this.enabled;}catch(e){console.warn('Audio initialization:',e);return false;}}
  play(name,level=1,pan=0){if(state.view==='vmu'&&settings.motion&&navigator.vibrate&&['confirmation','vmu_error'].includes(name)&&performance.now()-(this.lastHaptic||0)>350){navigator.vibrate(name==='vmu_error'?25:10);this.lastHaptic=performance.now();}if(!this.enabled||!this.context||!this.buffers[name])return;if(name==='select'&&performance.now()-this.lastSelect<100)return;if(name==='select')this.lastSelect=performance.now();const source=this.context.createBufferSource();source.buffer=this.buffers[name];const gain=this.context.createGain();gain.gain.value=level;source.connect(gain);if(this.context.createStereoPanner){const stereo=this.context.createStereoPanner();stereo.pan.value=pan;gain.connect(stereo);stereo.connect(this.gain);source.onended=()=>{this.sources.delete(source);source.disconnect();gain.disconnect();stereo.disconnect();};}else{gain.connect(this.gain);source.onended=()=>{this.sources.delete(source);source.disconnect();gain.disconnect();};}source.start();source._name=name;this.sources.add(source);return source;}
  ambience(active){if(!this.context||!this.enabled)return;if(!this.ambientGain){this.ambientGain=this.context.createGain();this.ambientGain.gain.value=0;this.ambientGain.connect(this.gain);for(const frequency of [110,164.81,220]){const oscillator=this.context.createOscillator();oscillator.type='sine';oscillator.frequency.value=frequency;oscillator.connect(this.ambientGain);oscillator.start();}}this.ambientGain.gain.setTargetAtTime(active?.014:0,this.context.currentTime,.9);}
  stopBoot(){for(const source of this.sources)if(source._name==='boot'){try{source.stop();}catch{}}}
  setVolume(value){if(this.gain)this.gain.gain.setTargetAtTime(value/100,this.context.currentTime,.025);}
}
const audio=new BiosAudio();

const lcd=document.createElement('canvas');lcd.width=48;lcd.height=32;const lcdCtx=lcd.getContext('2d',{alpha:false});lcdCtx.imageSmoothingEnabled=false;
const lcdTexture=new THREE.CanvasTexture(lcd);lcdTexture.magFilter=THREE.NearestFilter;lcdTexture.minFilter=THREE.NearestFilter;lcdTexture.generateMipmaps=false;lcdTexture.colorSpace=THREE.SRGBColorSpace;

const glyphs={
 '0':['111','101','101','101','111'],'1':['010','110','010','010','111'],'2':['111','001','111','100','111'],'3':['111','001','111','001','111'],'4':['101','101','111','001','001'],'5':['111','100','111','001','111'],'6':['111','100','111','101','111'],'7':['111','001','010','010','010'],'8':['111','101','111','101','111'],'9':['111','101','111','001','111'],
 A:['010','101','111','101','101'],B:['110','101','110','101','110'],C:['111','100','100','100','111'],D:['110','101','101','101','110'],E:['111','100','110','100','111'],F:['111','100','110','100','100'],G:['111','100','101','101','111'],H:['101','101','111','101','101'],I:['111','010','010','010','111'],J:['001','001','001','101','111'],K:['101','101','110','101','101'],L:['100','100','100','100','111'],M:['101','111','111','101','101'],N:['101','111','111','111','101'],O:['111','101','101','101','111'],P:['111','101','111','100','100'],Q:['111','101','101','111','001'],R:['110','101','110','101','101'],S:['111','100','111','001','111'],T:['111','010','010','010','010'],U:['101','101','101','101','111'],V:['101','101','101','101','010'],W:['101','101','111','111','101'],X:['101','101','010','101','101'],Y:['101','101','010','010','010'],Z:['111','001','010','100','111'],' ':['000','000','000','000','000'],'-':['000','000','111','000','000'],':':['000','010','000','010','000']
};
function pixelText(text,x,y){for(const ch of text.toUpperCase()){const g=glyphs[ch]||glyphs[' '];for(let row=0;row<5;row++)for(let col=0;col<3;col++)if(g[row][col]==='1')lcdCtx.fillRect(x+col,y+row,1,1);x+=4;}}
const game={kind:'spiral',mode:'ready',x:23,score:0,best:storage.get('best',0),lives:3,objects:[],spawn:0,left:false,right:false,time:0,blink:0,ball:{x:23,y:23,vx:16,vy:-19},bricks:[],memory:{sequence:[],phase:'watch',index:0,answer:0,timer:0}};
const gameMeta={spiral:{description:'Catch the dreams. Dodge the static.',instructions:'← → / A D<br>OR TOUCH TO MOVE',score:'SCORE',best:'BEST'},breaker:{description:'Keep the ball alive. Clear the tiny brick wall.',instructions:'← → / A D<br>MOVE THE PADDLE',score:'BRICKS',best:'BEST'},signal:{description:'Watch the signal. Repeat left and right.',instructions:'← → / A D<br>REPEAT THE PATTERN',score:'ROUND',best:'BEST'}};
$('#game-best').textContent=pad(game.best,3);
function clearLcd(){lcdCtx.fillStyle='#9bad8e';lcdCtx.fillRect(0,0,48,32);lcdCtx.fillStyle='#304b3c';}
function pixelArrow(x,y,direction){lcdCtx.fillRect(x+2,y+5,12,2);for(let i=0;i<5;i++){const head=direction==='left'?x+i:x+15-i;lcdCtx.fillRect(head,y+5-i,2,2);lcdCtx.fillRect(head,y+5+i,2,2);}}
function drawSpiral(){
  pixelText(pad(game.score,3),1,1);for(let i=0;i<game.lives;i++){lcdCtx.fillRect(36+i*4,1,2,3);lcdCtx.fillRect(35+i*4,2,4,1);}
  for(const o of game.objects){const x=Math.round(o.x),y=Math.round(o.y);if(o.bad){lcdCtx.fillRect(x-1,y-1,1,1);lcdCtx.fillRect(x+1,y-1,1,1);lcdCtx.fillRect(x,y,1,1);lcdCtx.fillRect(x-1,y+1,1,1);lcdCtx.fillRect(x+1,y+1,1,1);}else{lcdCtx.fillRect(x,y-2,1,1);lcdCtx.fillRect(x-1,y-1,1,1);lcdCtx.fillRect(x+1,y-1,1,1);lcdCtx.fillRect(x-2,y,1,1);lcdCtx.fillRect(x+2,y,1,1);lcdCtx.fillRect(x-1,y+1,1,1);lcdCtx.fillRect(x+1,y+1,1,1);lcdCtx.fillRect(x,y+2,1,1);}}
  const x=Math.round(game.x);if(game.blink<=0||Math.floor(game.blink*10)%2===0){lcdCtx.fillRect(x-2,29,5,2);lcdCtx.fillRect(x-1,28,3,1);lcdCtx.fillRect(x,27,1,1);}lcdCtx.fillRect(0,31,48,1);
}
function drawBreaker(){
  pixelText(pad(game.score,3),1,1);for(let i=0;i<game.lives;i++)lcdCtx.fillRect(38+i*3,2,2,3);
  for(const brick of game.bricks)if(brick.alive)lcdCtx.fillRect(brick.x,brick.y,4,2);
  lcdCtx.fillRect(Math.round(game.x)-5,28,11,2);lcdCtx.fillRect(Math.round(game.ball.x),Math.round(game.ball.y),2,2);
  lcdCtx.fillRect(0,31,48,1);
}
function drawSignal(){
  const m=game.memory;pixelText(pad(game.score,3),1,1);for(let i=0;i<game.lives;i++)lcdCtx.fillRect(38+i*3,2,2,3);
  if(m.phase==='watch'){pixelText('WATCH',12,8);if(m.index<m.sequence.length&&m.timer>.23)pixelArrow(19,15,m.sequence[m.index]?'right':'left');}
  else if(m.phase==='input'){pixelText('YOUR TURN',6,8);pixelArrow(7,17,'left');pixelArrow(31,17,'right');pixelText(`${m.answer+1}:${m.sequence.length}`,19,25);}
  else{pixelText(m.phase==='success'?'NICE':'RETRY',m.phase==='success'?16:14,8);pixelText(`ROUND ${pad(game.score,2)}`,8,19);}
}
function drawLcd(){
  clearLcd();
  if(game.mode==='ready'){
    if(game.kind==='spiral'){pixelText('SPIRAL',12,3);pixelText('RUN',18,10);for(let i=0;i<65;i++){const a=i/65*Math.PI*4.2,r=1+i/65*4;lcdCtx.fillRect(23+Math.round(Math.cos(a)*r),22+Math.round(Math.sin(a)*r),1,1);}}
    if(game.kind==='breaker'){pixelText('BRICK',14,3);pixelText('BREAK',14,10);for(let i=0;i<7;i++)lcdCtx.fillRect(5+i*6,20,5,3);lcdCtx.fillRect(18,28,12,2);lcdCtx.fillRect(25,24,2,2);}
    if(game.kind==='signal'){pixelText('SIGNAL',12,3);pixelText('MATCH',14,10);pixelArrow(8,18,'left');pixelArrow(33,18,'right');}
    lcdCtx.fillRect(3,31,42,1);
  }else if(game.mode==='over'){pixelText('GAME OVER',6,4);pixelText(pad(game.score,3),18,13);pixelText('PRESS A',10,23);}
  else if(game.mode==='paused'){pixelText('PAUSED',12,9);pixelText('PRESS A',10,20);}
  else if(game.kind==='spiral')drawSpiral();else if(game.kind==='breaker')drawBreaker();else drawSignal();
  lcdTexture.needsUpdate=true;
  const pocket=$('#vmu-pocket-screen');if(pocket)pocket.getContext('2d',{alpha:false}).drawImage(lcd,0,0);
}
drawLcd();
const scene=new DreamScene($('#world'),lcdTexture);
if(!scene.ready){$('#graphics-fallback').hidden=false;$('#asset-status').textContent='ARCHIVE MODE · 3D UNAVAILABLE';}
if(scene.isSoftware){$('.live').lastChild.textContent='CANVAS 3D';$('.live').title='WebGL is disabled in this browser. This is the CPU compatibility renderer.';}

const specs=[
 {name:'Hitachi SH-4',value:'200 MHz / 32-bit RISC',code:'HITACHI / SH7750',text:'A 32-bit RISC CPU with vector-friendly floating-point instructions. The “128-bit” label described its graphics math, not a 128-bit general-purpose CPU.'},
 {name:'PowerVR2',value:'100 MHz / TILE-BASED',code:'NEC + VIDEOLOGIC / CLX2',text:'Opaque surfaces are resolved for visibility before texturing. Tile-based deferred rendering reduces wasted work on hidden pixels and saves external memory bandwidth.'},
 {name:'Yamaha AICA',value:'64 VOICES / PCM + ADPCM',code:'YAMAHA / AICA',text:'A dedicated sound subsystem with an ARM processor, 64 hardware voices and its own 2 MB of sample memory. The little orange spiral had a serious voice.'},
 {name:'Split memory',value:'16 + 8 + 2 MB',code:'MAIN / TEXTURE / AUDIO',text:'16 MB of main memory, 8 MB for textures and framebuffers, and 2 MB for audio. These are separate pools; “26 MB” is not one unified heap.'}
];
$('#spec-list').innerHTML=specs.map((s,i)=>`<button class="spec-row ${i===0?'selected':''}" data-spec="${i}" aria-pressed="${i===0}"><strong>${s.name}</strong><span>${s.value}</span></button>`).join('');
const biosItems=[{label:'Play',title:'Meet the machine.',description:'Lift the shell. Follow the silicon. Explore the little box that brought the arcade home.',view:'hardware'},{label:'Memory',title:'Big dreams. Tiny screen.',description:'A memory card with a life of its own. Pick up the VMU and play three original 48 × 32 minigames.',view:'vmu'},{label:'Music',title:'You know this sound.',description:'Seven original BIOS recordings. The startup, the selection chime, and all those little sounds you still remember.',view:'archive'},{label:'Settings',title:'Make it yours.',description:'Orange or European blue. Light or after hours. Scanlines, motion, sound and rendering quality.',view:'settings'}];
$('#bios-labels').innerHTML=biosItems.map((item,i)=>`<button class="bios-label ${i===0?'selected':''}" data-bios="${i}"><small>0${i+1}</small>${item.label}</button>`).join('');
$('#hotspots').innerHTML=specs.map((_,i)=>`<button class="hotspot ${i===0?'selected':''}" data-chip="${i}" aria-label="Inspect ${specs[i].name}">0${i+1}</button>`).join('');
function selectSpec(i){const s=specs[i];$('#selected-spec').innerHTML=`<span class="mono">${s.code}</span><p>${s.text}</p>`;$$('[data-spec]').forEach((b,n)=>{b.classList.toggle('selected',n===i);b.setAttribute('aria-pressed',String(n===i));});$$('[data-chip]').forEach((b,n)=>b.classList.toggle('selected',n===i));scene.selectChip(i);audio.play('select',.45);}
$$('[data-spec]').forEach(b=>b.addEventListener('click',()=>selectSpec(+b.dataset.spec)));
$$('[data-chip]').forEach(b=>b.addEventListener('click',()=>selectSpec(+b.dataset.chip)));

const articles={
 architecture:()=>`<span class="tag">SYSTEM TOPOLOGY / SEGA HARDWARE OUTLINE</span><h2>Follow the bytes.</h2><p>The SH-4 talks through HOLLY, the system ASIC. The paths to disc, audio, graphics and controllers are distinct; the console is much more interesting than a single MHz number.</p><div class="archive-flow"><span>SH-4</span><b>→</b><span>HOLLY</span><b>→</b><span>G1 / G2 / MAPLE / PVR</span></div><div class="fact"><b>G1 / DISC AND BOOT ROM</b><p>HOLLY’s G1 interface connects the GD-ROM drive and ROM/flash. The drive uses a CAV read scheme; Sega lists roughly 1 GB for the high-density format.</p></div><div class="fact"><b>G2 / SOUND AND MODEM</b><p>The G2 side connects the AICA sound chip, modem and optional expansion. AICA has its own ARM7DI control CPU, 2 MB sample RAM and a 128-step DSP in Sega’s outline.</p></div><div class="fact"><b>MAPLE / CONTROLLERS AND VMU</b><p>Four front ports carry Sega’s serial peripheral protocol. The hardware outline gives 2 Mb/s maximum signaling and 128 KB/s effective port throughput; the controller exposes accessory slots for the VMU and vibration pack.</p></div><div class="fact"><b>MEMORY / THREE POOLS</b><p>The 16 MB main, 8 MB graphics and 2 MB audio pools have separate jobs. Moving data is a design constraint; adding the figures does not create a unified 26 MB heap.</p></div><div class="fact"><b>GRAPHICS / TILED WORK</b><p>Geometry reaches the Tile Accelerator, which builds tile lists before the PowerVR2 resolves visibility for opaque surfaces. Fewer hidden pixels need texture work; transparent geometry follows other rules.</p></div><a class="source-link mono" target="_blank" rel="noreferrer" href="https://segaretro.org/images/8/8b/Dreamcast_Hardware_Specification_Outline.pdf">SEGA / HARDWARE OUTLINE (PDF) ↗</a><a class="source-link mono" target="_blank" rel="noreferrer" href="https://www.sega.jp/history/hard/dreamcast/">SEGA / CONSOLE SPECS ↗</a>`,
 security:()=>`<span class="tag">SECURITY / MIL-CD</span><h2>A music feature became an open door.</h2><p>The Dreamcast’s boot path supported interactive music CDs as well as proprietary GD-ROMs. That alternate path let independently written code run from ordinary CD media on compatible consoles.</p><div class="archive-flow"><span>Boot ROM</span><b>→</b><span>IP.BIN</span><b>→</b><span>Program</span></div><p>Marcus Comstedt documented the bootstrap and the reversible scatter-loading of the program binary. The lesson: an obscure transformation is not a substitute for authenticating executable code.</p><p>Later BIOS research identifies revisions that removed MIL-CD support. Compatibility depends on the actual BIOS; the manufacture date alone is not a universal rule.</p><button class="text-button" id="trace-boot">Trace the boot path <span>→</span></button><div id="trace-readout" class="note mono" aria-live="polite"></div><a class="source-link mono" target="_blank" rel="noreferrer" href="https://mc.pp.se/dc/ip.bin.html">COMSTEDT: BOOTSTRAP RESEARCH ↗</a><a class="source-link mono" target="_blank" rel="noreferrer" href="https://dreamcast.wiki/BIOS">BIOS REVISION RESEARCH ↗</a>`,
 homebrew:()=>`<span class="tag">INDEPENDENT DEVELOPMENT</span><h2>The platform outlived the product.</h2><p>KallistiOS is an independently developed Dreamcast SDK and operating-system library. Its C and C++ toolchain targets the SH-4, with drivers for graphics, audio, networking and the VMU.</p><div class="fact"><b>DREAMSNES / SUPER NINTENDO</b><p>An SNES emulator with VMU SRAM saves and support for up to four Dreamcast controllers. A reminder that emulation also has to solve input, timing, sound and storage.</p></div><div class="fact"><b>NESTERDC / NES</b><p>A Dreamcast NES emulator with its own history of ports and improvements. Nintendo games are not included here; this exhibit documents the emulator itself.</p></div><div class="fact"><b>DCPLAYA / MEDIA PLAYER</b><p>A Dreamcast audio player with plugins, a Lua scripting layer and a window manager. The console could be an interactive media machine beyond retail games.</p></div><p>Open documentation and original software gave the machine a future beyond its commercial life. No leaked Sega SDK is required for KallistiOS development.</p><a class="source-link mono" target="_blank" rel="noreferrer" href="https://github.com/KallistiOS/KallistiOS">KALLISTIOS / SOURCE ↗</a><a class="source-link mono" target="_blank" rel="noreferrer" href="https://mc.pp.se/dc/dreamsnes/">DREAMSNES / AUTHORS ↗</a><a class="source-link mono" target="_blank" rel="noreferrer" href="https://nesterdc.pqrs.org/">NESTERDC ↗</a><a class="source-link mono" target="_blank" rel="noreferrer" href="https://sourceforge.net/projects/dcplaya/">DCPLAYA ↗</a>`,
 aica:()=>`<span class="tag">YAMAHA AICA / AUDIO HARDWARE</span><h2>64 voices. One little room.</h2><p>The Dreamcast’s audio subsystem couples the Yamaha AICA sound chip with a dedicated ARM7 control processor and 2 MB of sound RAM. Its 64 hardware channels mix samples while the main SH-4 keeps the game moving.</p><div class="archive-flow"><span>SH-4</span><b>→</b><span>ARM7 / AICA</span><b>→</b><span>STEREO OUT</span></div><div class="fact"><b>PCM OR ADPCM</b><p>KallistiOS exposes 16-bit PCM, 8-bit PCM and 4-bit Yamaha ADPCM sample formats. ADPCM trades fidelity for storage when music, speech and effects compete for the 2 MB pool.</p></div><div class="fact"><b>THE OTHER MEMORY BUS</b><p>Sound RAM is separate from 16 MB main RAM and 8 MB video RAM. Drivers can DMA samples to audio memory.</p></div><div class="fact"><b>DESIGN THE MIX</b><p>64 channels are a hardware ceiling, not a promise of 64 full-length songs. Voice allocation, streaming and sample memory still matter.</p></div><a class="source-link mono" target="_blank" rel="noreferrer" href="https://www.sega.jp/history/hard/dreamcast/">SEGA / HARDWARE ↗</a><a class="source-link mono" target="_blank" rel="noreferrer" href="https://kos-docs.dreamcast.wiki/group__audio.html">KOS / AUDIO DRIVERS ↗</a>`,
 sound:()=>`<span class="tag">ORIGINAL BIOS / WAV ARCHIVE</span><h2>Muscle memory, in waveform.</h2><p>Original recordings from the system BIOS. Select a sound to listen. All files are served locally with this exhibit.</p>${[['boot','Startup sequence','7.88 s'],['select','Menu selection','0.35 s'],['confirmation','Confirmation','0.84 s'],['back','Return','1.05 s'],['disc_check','Disc check','1.33 s'],['vmu_config','VMU configuration','0.51 s'],['vmu_error','VMU error','0.63 s']].map(([key,label,d])=>`<div class="sound-row"><span>${label} <small class="mono">/ ${d}</small></span><button data-sound="${key}" aria-label="Play ${label}">▷</button><a class="source-link mono" href="./assets/${key}.wav" download>WAV ↓</a></div>`).join('')}<p class="note">BIOS audio © Sega. Preserved by The Sounds Resource; Ultimate NitroZ / dashiznit.</p><a class="source-link mono" target="_blank" rel="noreferrer" href="https://sounds.spriters-resource.com/dreamcast/systembios/asset/410755/">AUDIO SOURCE & CREDITS ↗</a>`,
 myths:()=>`<span class="tag">ENGINEERING / CONTEXT MATTERS</span><h2>A few things worth getting right.</h2><div class="fact"><b>“128-BIT CPU”</b><p>The SH-4 is a 32-bit architecture. The headline refers to graphics-oriented vector operations, not 128-bit general-purpose registers.</p></div><div class="fact"><b>“MORE MHZ = FASTER GAMES”</b><p>Clock speed alone cannot compare different architectures. Memory traffic, visibility, parallelism and the workload decide how the machine behaves.</p></div><div class="fact"><b>“THE VMU IS JUST STORAGE”</b><p>Its own 8-bit processor, buttons, monochrome LCD and buzzer let it run little programs away from the controller. The future was already in your pocket.</p></div><button class="text-button" id="article-compare">Compare the generations <span>↗</span></button><a class="source-link mono" target="_blank" rel="noreferrer" href="https://mc.pp.se/dc/hw.html">HARDWARE RESEARCH ↗</a>`
};
function showArticle(name){if(!articles[name])name='security';state.article=name;$('#article').innerHTML=articles[name]();$('#article').scrollTop=0;$$('[data-article]').forEach(b=>{const selected=b.dataset.article===name;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;});}
showArticle('security');
$$('[data-article]').forEach(b=>b.addEventListener('click',()=>{audio.play('select',.45);showArticle(b.dataset.article);}));
$('.archive-tabs').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const buttons=$$('[data-article]');let i=buttons.findIndex(b=>b.dataset.article===state.article);i=e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowLeft'?-1:1)+buttons.length)%buttons.length;showArticle(buttons[i].dataset.article);buttons[i].focus();});
let traceStep=0;
$('#article').addEventListener('click',async e=>{
  const sound=e.target.closest('[data-sound]');
  if(sound){if(!audio.enabled)await enableSound();audio.play(sound.dataset.sound,.85);return;}
  if(e.target.closest('#article-compare')){$('#compare-dialog').showModal();audio.play('confirmation',.45);}
  if(e.target.closest('#trace-boot')){const steps=['01 / ROM: Select the supported media boot path.','02 / IP.BIN: Read the bootstrap from the data track’s reserved area.','03 / PROGRAM: Load the named binary, then transfer control.','04 / TRUST: A reversible loading transform is not a digital signature.'];$('#trace-readout').textContent=steps[traceStep%steps.length];traceStep++;audio.play('disc_check',.30);}
});

function setBios(index){state.bios=(index+4)%4;const item=biosItems[state.bios];$('#bios-type').textContent=`0${state.bios+1} / ${item.label.toUpperCase()}`;$('#bios-title').textContent=item.title;$('#bios-description').textContent=item.description;$$('[data-bios]').forEach((b,i)=>b.classList.toggle('selected',i===state.bios));scene.setBiosSelected(state.bios);}
function openBios(index){setBios(index);audio.play('confirmation',.55);const item=biosItems[state.bios];if(item.view==='settings'){$('#settings-dialog').showModal();return;}if(index===2)showArticle('sound');setView(item.view);}
$$('[data-bios]').forEach(b=>{b.addEventListener('pointerenter',()=>{setBios(+b.dataset.bios);audio.play('select',.3);});b.addEventListener('click',()=>openBios(+b.dataset.bios));});
$('#bios-confirm').addEventListener('click',()=>openBios(state.bios));
scene.onBiosHover=index=>{if(index!==state.bios){setBios(index);audio.play('select',.3);}};
scene.onBiosPick=index=>openBios(index);

const sceneMeta={home:['01 / THE DREAM','HKT-3000','Sega Dreamcast'],bios:['02 / THE SYSTEM MENU','SYSTEM / 3D INTERFACE','Four icons. Endless possibilities.'],hardware:['03 / UNDER THE SHELL','ENGINEERING / 1998','The architecture of a dream'],vmu:['04 / VISUAL MEMORY','HKT-7000','Visual Memory Unit'],lab:['05 / REAL-TIME EXPERIMENT','POWERVR / INSPIRED','Doing more with less'],archive:['06 / THE DREAM KEPT GOING','GD-ROM / APPROX. 1 GB','A different kind of silver disc'],collection:['07 / THE LIVING LIBRARY','GD-ROM / COMMUNITY','Games and independent software'],music:['08 / NOW PLAYING','AICA / 64 VOICES','The sound of a generation']};
function setView(view){
  if(!sceneMeta[view])return;
  if(view!==state.view)audio.play('confirmation',.35);
  if(state.view==='vmu'&&view!=='vmu'&&game.mode==='running'){game.mode='paused';updateGameUi();drawLcd();}
  state.view=view;document.body.dataset.view=view;if(scene.view!==view)scene.transitionTo(view);$$('[data-page]').forEach(p=>{p.hidden=p.dataset.page!==view;p.classList.toggle('active',!p.hidden);});$$('.dock [data-view]').forEach(b=>{const active=b.dataset.view===view;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  audio.ambience(view==='bios'||view==='music');if(view!=='lab'&&scene.exhibit)closeExhibit();
  if(view!=='music'&&$('#music-player iframe'))$('#music-player').innerHTML='<div class="music-player-placeholder"><span class="music-play-icon">▷</span><span>Select a track to load its official stream.</span></div>';
  $('#scene-number').textContent=sceneMeta[view][0];$('#model-code').textContent=sceneMeta[view][1];$('#model-name').textContent=sceneMeta[view][2];$('#bios-labels').hidden=view!=='bios';$('#hotspots').hidden=view!=='hardware'||scene.explodeTarget===0;$('#tile-overlay').hidden=view!=='lab'||$('#render-style').value!=='tiles';
  if(view==='lab')updateLabUi();else $('#exhibit-open').hidden=true;
  $('#wire-toggle').hidden=view==='bios'||view==='lab';$('#model-hint').hidden=view==='bios';$('#orbit-zone').setAttribute('aria-label',view==='bios'?'Select a 3D BIOS orb, or use the labeled buttons.':'Drag to rotate the 3D model. Scroll to zoom. Use arrow keys to rotate.');
  if(view!=='hardware'){setAssemblyUi(false);}if(window.innerWidth<=800)window.scrollTo({top:0,behavior:'instant'});document.title=`Dreamcast · ${view==='home'?'Never stop dreaming':view==='lab'?'Scene lab':view==='vmu'?'Visual Memory':view[0].toUpperCase()+view.slice(1)}`;
  if(view==='bios')$('#orbit-zone').focus({preventScroll:true});
}
$$('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
$$('.dock button').forEach(b=>b.addEventListener('pointerenter',()=>audio.play('select',.25,clamp((b.getBoundingClientRect().x/window.innerWidth)*2-1,-.8,.8))));
let collectionKind='classic',collectionIndex=0,collectionOpen=false;
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
$$('[data-kind]').forEach(button=>{const label=button.textContent.split('/')[0].trim();button.textContent=`${label} / ${pad(collection.filter(item=>item.kind===button.dataset.kind).length)}`;});
const entries=()=>collection.map((item,index)=>({item,index})).filter(({item})=>item.kind===collectionKind);
function updateCollection(){
  const list=entries(),found=list.findIndex(({index})=>index===collectionIndex),position=Math.max(0,found);
  if(found<0)collectionIndex=list[0].index;
  const item=collection[collectionIndex];scene.setCollection(collectionIndex);scene.setCollectionOpen(collectionOpen);
  $('#collection-index').textContent=`${pad(position+1)} / ${pad(list.length)} · ${item.tag.toUpperCase()}`;
  $('#collection-title').textContent=item.title;$('#collection-meta').textContent=`${item.studio} · ${item.year}`;
  $('#collection-description').textContent=item.deck;$('#collection-technical').textContent=item.technical;
  $('#collection-open').textContent=collectionOpen?'Close jewel case ↙':'Open jewel case ↗';$('#collection-open').setAttribute('aria-pressed',String(collectionOpen));
  $('#collection-filmstrip').innerHTML=list.map(({item:entry,index})=>`<button data-collection="${index}" class="${index===collectionIndex?'selected':''}" aria-label="Select ${escapeHtml(entry.title)}" aria-pressed="${index===collectionIndex}"><img src="${entry.image}" alt="" loading="lazy"><span>${escapeHtml(entry.title)}</span></button>`).join('');
  $$('[data-kind]').forEach(b=>{const selected=b.dataset.kind===collectionKind;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
}
function stepCollection(direction){const list=entries(),at=list.findIndex(({index})=>index===collectionIndex);collectionIndex=list[(at+direction+list.length)%list.length].index;collectionOpen=false;updateCollection();audio.play('select',.5);}
$$('[data-kind]').forEach(b=>b.addEventListener('click',()=>{collectionKind=b.dataset.kind;collectionIndex=entries()[0].index;collectionOpen=false;updateCollection();audio.play('confirmation',.4);}));
$('#collection-prev').addEventListener('click',()=>stepCollection(-1));$('#collection-next').addEventListener('click',()=>stepCollection(1));
$('#collection-open').addEventListener('click',()=>{collectionOpen=!collectionOpen;updateCollection();audio.play(collectionOpen?'disc_check':'back',.4);});
$('#collection-filmstrip').addEventListener('click',e=>{const b=e.target.closest('[data-collection]');if(!b)return;collectionIndex=Number(b.dataset.collection);collectionOpen=false;updateCollection();audio.play('select',.4);});
$('#collection-more').addEventListener('click',()=>{
 const item=collection[collectionIndex];
 $('#collection-dialog-content').innerHTML=`<h2>${escapeHtml(item.title)}</h2><p class="collection-dialog-meta mono">${escapeHtml(item.studio)} · ${escapeHtml(item.year)} · ${escapeHtml(item.tag)}</p><img class="collection-dialog-cover" src="${item.image}" alt="${escapeHtml(item.artworkType)} for ${escapeHtml(item.title)}"><p>${escapeHtml(item.deck)}</p><p>${escapeHtml(item.technical)}</p>${item.shots.map(s=>`<figure><img src="${s.image}" alt="${escapeHtml(s.caption)}"><figcaption>${escapeHtml(s.caption)} · ${escapeHtml(s.credit)}</figcaption></figure>`).join('')}<p class="note">${escapeHtml(item.credit)} ${escapeHtml(item.artworkType)}. Unofficial tribute.</p><div class="collection-sources">${item.sources.map((url,i)=>`<a class="source-link mono" target="_blank" rel="noreferrer" href="${url}">SOURCE ${pad(i+1)} ↗</a>`).join('')}</div>`;
 $('#collection-dialog').showModal();audio.play('confirmation',.4);
});
updateCollection();
let musicIndex=0;
function selectMusic(index,loadPlayer=false){
  musicIndex=index;const track=tracks[index];
  $('#music-index').textContent=`${pad(index+1)} / ${pad(tracks.length)} · ${track.game}`;
  $('#music-title').textContent=track.title;$('#music-artist').textContent=`${track.artist} · ${track.year}`;$('#music-note').textContent=track.note;
  const url=`https://open.spotify.com/${track.kind}/${track.id}`;$('#music-source').href=url;
  $$('#music-list button').forEach((button,i)=>{button.classList.toggle('selected',i===index);button.setAttribute('aria-pressed',String(i===index));});
  if(loadPlayer){audio.stopBoot();$('#music-player').innerHTML=`<iframe title="Spotify player: ${escapeHtml(track.title)}" src="https://open.spotify.com/embed/${track.kind}/${track.id}?utm_source=generator&theme=0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="eager" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;audio.play('confirmation',.3);}
}
$('#music-list').innerHTML=tracks.map((track,i)=>`<button data-music="${i}" aria-pressed="false"><img src="./assets/collection/${track.cover}" alt="" loading="lazy"><span class="music-item-title">${escapeHtml(track.title)}<small class="mono">${escapeHtml(track.game)}</small></span><span class="music-item-play" aria-hidden="true">▷</span></button>`).join('');
$('#music-list').addEventListener('click',e=>{const button=e.target.closest('[data-music]');if(button)selectMusic(+button.dataset.music,true);});
selectMusic(0);
function setAssemblyUi(exploded){$('#assembled').classList.toggle('selected',!exploded);$('#exploded').classList.toggle('selected',exploded);$('#assembled').setAttribute('aria-pressed',String(!exploded));$('#exploded').setAttribute('aria-pressed',String(exploded));$('#hotspots').hidden=!exploded||state.view!=='hardware';}
function assemble(exploded){scene.setExplosion(exploded);setAssemblyUi(exploded);audio.play(exploded?'disc_check':'back',.4);}
$('#assembled').addEventListener('click',()=>assemble(false));$('#exploded').addEventListener('click',()=>assemble(true));
$('#rotate-toggle').addEventListener('click',()=>{state.rotating=!state.rotating;scene.autoRotate=state.rotating;$('#rotate-toggle').textContent=state.rotating?'Ⅱ':'▷';$('#rotate-toggle').setAttribute('aria-pressed',String(state.rotating));$('#rotate-toggle').setAttribute('aria-label',state.rotating?'Pause automatic rotation':'Resume automatic rotation');audio.play('select',.3);});
$('#reset-camera').addEventListener('click',()=>{scene.resetCamera();audio.play('back',.3);toast('Camera reset.');});
$('#wire-toggle').addEventListener('click',()=>{state.wire=!state.wire;scene.setWire(state.wire);$('#wire-toggle').setAttribute('aria-pressed',String(state.wire));audio.play('select',.3);});
$('#object-slider').addEventListener('input',e=>{$('#object-count').textContent=e.target.value;scene.setObjectCount(+e.target.value);});
const labScenes={
  sonic:{tag:'ORIGINAL DREAMCAST MESH / SONIC ADVENTURE',title:'The real Dreamcast Sonic.',description:'Extracted character geometry and textures from Sonic Adventure. Orbit the original low-poly silhouette or turn on wireframe to inspect its construction.',code:'SONIC / GAME MESH',name:'Sonic Adventure · 1998'},
  sonic2:{tag:'ORIGINAL DREAMCAST MESH / SONIC ADVENTURE 2',title:'A sharper blue blur.',description:'The Dreamcast cutscene model from Sonic Adventure 2, converted from an archived game mesh. Inspect the proportions and materials from the original release.',code:'SONIC / SA2 CUTSCENE',name:'Sonic Adventure 2 · 2001'},
  vyse:{tag:'ORIGINAL DREAMCAST MESH / SKIES OF ARCADIA',title:'Take to the skies.',description:'Vyse’s high-poly in-game model and textures from the Dreamcast original. Orbit the Blue Rogue and inspect the geometry in wireframe.',code:'VYSE / GAME MESH',name:'Skies of Arcadia · 2000'},
  ryo:{tag:'ORIGINAL DREAMCAST MESH / SHENMUE PASSPORT',title:'A face from Passport.',description:'Ryo Hazuki’s detailed Shenmue Passport character model, converted from an archived Dreamcast asset. Passport gave characters closer portraits than the main game camera.',code:'RYO / PASSPORT',name:'Shenmue Passport · 1999'},
  coast:{tag:'ORIGINAL STAGE / OPENING BEACH',title:'Emerald Coast, up close.',description:'The opening shoreline is cropped from the original Dreamcast stage mesh. Its game textures and modeled terrain replace the earlier miniature island.',code:'BEACH / STAGE CROP',name:'Emerald Coast · opening'},
  ulala:{tag:'ORIGINAL DREAMCAST MESH / SPACE CHANNEL 5',title:'Reporting from space.',description:'Ulala’s original Dreamcast character mesh from Space Channel 5. Rotate and zoom into the late-1990s texture work.',code:'ULALA / GAME MESH',name:'Space Channel 5 · 1999'},
  nights:{tag:'ORIGINAL DREAMCAST MESH / SONIC SHUFFLE',title:'A visitor from dreams.',description:'NiGHTS as they appear in Sonic Shuffle on Dreamcast. The low-poly guest model is an archived game asset.',code:'NiGHTS / SHUFFLE',name:'Sonic Shuffle · 2000'},
  jsr:{tag:'ORIGINAL DREAMCAST STAGE / JET SET RADIO',title:'Tokyo-to in polygons.',description:'A complete, unmodified Dreamcast Jet Set Radio stage file from the archived map set. It loads only when selected; orbit and zoom to inspect the urban geometry.',code:'TOKYO-TO / STAGE',name:'Jet Set Radio · 2000'},
  shadow:{tag:'ORIGINAL DREAMCAST MESH / SONIC ADVENTURE 2',title:'The ultimate life form.',description:'Shadow’s game mesh and textures from the original Dreamcast release. Orbit the sharp quills, hover shoes and tiny texture atlas.',code:'SHADOW / GAME MESH',name:'Sonic Adventure 2 · 2001'},
  pudding:{tag:'ORIGINAL DREAMCAST MESH / SPACE CHANNEL 5',title:'A rival reporter enters.',description:'Pudding’s archived Space Channel 5 model, complete with the original face and outfit textures. Turn the mesh to inspect the broadcast-era styling.',code:'PUDDING / GAME MESH',name:'Space Channel 5 · 1999'},
  sataro:{tag:'ORIGINAL DREAMCAST MESH / SHENMUE',title:'A capsule from Yokosuka.',description:'An original Shenmue collectible figure. The little Sataro toy is an unrigged in-game mesh, preserved with its textures from the Dreamcast release.',code:'SATARO / GASHAPON',name:'Shenmue · 1999'},
  particles:{tag:'INSTANCED STRESS TEST / MODERN WEBGL',title:'How much can we draw?',description:'One mesh, many transforms. Raise the object count and observe this browser’s FPS, visible triangles and draw calls. The numbers are not Dreamcast benchmarks.',code:'2400 / INSTANCES',name:'Browser stress test'}
};
let activeLab='sonic';
function openExhibit(){if(state.view!=='lab'||activeLab==='particles')return;scene.exhibit=true;scene.resize();document.body.classList.add('exhibit-mode');$('#exhibit').hidden=false;$('#exhibit-code').textContent=labScenes[activeLab].code;$('#exhibit-title').textContent=labScenes[activeLab].name;$('#exhibit-notes').textContent=labScenes[activeLab].description;$('#exhibit-notes').hidden=true;$('#exhibit-info').setAttribute('aria-expanded','false');audio.play('confirmation',.35);}
function closeExhibit(){scene.exhibit=false;scene.resize();document.body.classList.remove('exhibit-mode');$('#exhibit').hidden=true;}
$('#exhibit-open').addEventListener('click',openExhibit);$('#exhibit-close').addEventListener('click',()=>{closeExhibit();audio.play('back',.3);});
$('#exhibit-info').addEventListener('click',()=>{const notes=$('#exhibit-notes');notes.hidden=!notes.hidden;$('#exhibit-info').setAttribute('aria-expanded',String(!notes.hidden));audio.play('select',.2);});
let tapStart=null;$('#orbit-zone').addEventListener('pointerdown',e=>{tapStart=[e.clientX,e.clientY];});$('#orbit-zone').addEventListener('pointerup',e=>{if(tapStart&&Math.hypot(e.clientX-tapStart[0],e.clientY-tapStart[1])<8&&scene.pickLab(e))openExhibit();tapStart=null;});
const secretFacts={hardware:['SH-4 / VECTOR MATH','The SH-4 used a 128-bit vector floating-point unit for graphics-friendly work.'],vmu:['VMU / LCD','Only 48 × 32 pixels, yet it could run its own tiny games away from the console.'],lab:['TEXTURE ATLAS','Original game meshes squeezed character details into tiny texture atlases.'],archive:['MIL-CD / SCENE','A multimedia disc format helped independent software reach the Dreamcast.']};
const foundSecrets=new Set(storage.get('secrets',[]));
function discoverSecret(){if(!(state.view in secretFacts))return;const [title,fact]=secretFacts[state.view];foundSecrets.add(state.view);storage.set('secrets',[...foundSecrets]);toast(`${title} · ${fact}${foundSecrets.size===4?' All four discoveries found.':''}`);audio.play('confirmation',.32);}
const modelPlacard=$('#model-label');modelPlacard.tabIndex=0;modelPlacard.setAttribute('role','button');modelPlacard.setAttribute('aria-label','Inspect model placard');modelPlacard.addEventListener('click',discoverSecret);modelPlacard.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();discoverSecret();}});
function updateLabUi(){
 const item=labScenes[activeLab];$('#lab-demo-tag').textContent=item.tag;$('#lab-demo-title').textContent=item.title;$('#lab-demo-description').textContent=item.description;
 $('#object-control').hidden=activeLab!=='particles';$('#model-code').textContent=item.code;$('#model-name').textContent=item.name;
 $('#lab-zoom-control').hidden=activeLab==='particles';
 $('#exhibit-open').hidden=activeLab==='particles'||state.view!=='lab';if(scene.exhibit)closeExhibit();
 $$('[data-lab-demo]').forEach(b=>{const selected=b.dataset.labDemo===activeLab;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
}
$$('[data-lab-demo]').forEach(b=>b.addEventListener('click',()=>{activeLab=b.dataset.labDemo;scene.setLabDemo(activeLab);updateLabUi();audio.play('confirmation',.42);}));
scene.onLabZoom=value=>{$('#lab-zoom-slider').value=Math.round(value*100);$('#lab-zoom-value').textContent=value.toFixed(2).replace(/0$/,'')+'×';};
$('#lab-zoom-slider').addEventListener('input',e=>scene.setLabZoom(+e.target.value/100));
$('#lab-zoom-in').addEventListener('click',()=>scene.setLabZoom(scene.zoom+.2));
$('#lab-zoom-out').addEventListener('click',()=>scene.setLabZoom(scene.zoom-.2));
$('#lab-zoom-reset').addEventListener('click',()=>scene.setLabZoom(1.2));
const pvrStages=[
 'The Tile Accelerator groups submitted primitives into 32 × 32 pixel tile lists. A 640 × 480 frame has 300 tile positions.',
 'The ISP resolves visibility for opaque surfaces in each tile. Hidden pixels need not fetch textures or consume later shading work.',
 'The TSP applies textures and shading to the visible opaque fragments. Transparency has its own ordering and processing rules.',
 'Tile-local results are written to the video framebuffer. Local buffers reduce repeated external memory traffic.'
];
$$('[data-pvr-stage]').forEach(b=>b.addEventListener('click',()=>{const index=+b.dataset.pvrStage;$('#pvr-stage-detail').textContent=pvrStages[index];$$('[data-pvr-stage]').forEach(x=>{const selected=x===b;x.classList.toggle('selected',selected);x.setAttribute('aria-pressed',String(selected));});audio.play('select',.25);}));
$('#render-style').addEventListener('change',e=>{scene.setLabStyle(e.target.value);$('#tile-overlay').hidden=state.view!=='lab'||e.target.value!=='tiles';audio.play('select',.4);});
scene.onMetric=m=>{$('#live-fps').textContent=m.fps;$('#live-triangles').textContent=m.triangles.toLocaleString('en-US');$('#live-calls').textContent=m.calls;};
$('#compare-open').addEventListener('click',()=>{$('#compare-dialog').showModal();audio.play('confirmation',.4);});

function updateGameUi(){$('#game-score').textContent=pad(game.score,3);$('#game-best').textContent=pad(game.best,3);$('#game-state').textContent=game.mode==='running'?game.kind==='signal'&&game.memory.phase==='watch'?'WATCH':`${game.lives} LIVES`:game.mode.toUpperCase();$('#game-start').innerHTML=`${game.mode==='running'?'Pause game':game.mode==='paused'?'Resume game':game.mode==='over'?'Try again':'Start game'} <span>A</span>`;}
function setGame(kind){if(!(kind in gameMeta)||game.kind===kind)return;game.kind=kind;game.mode='ready';game.left=game.right=false;game.score=0;game.lives=3;game.best=storage.get(kind==='spiral'?'best':`best.${kind}`,0);const meta=gameMeta[kind];$('#game-description').textContent=meta.description;$('#game-instructions').innerHTML=meta.instructions;$('#game-score-label').firstChild.textContent=meta.score+' ';$('#game-best-label').firstChild.textContent=meta.best+' ';$$('[data-vmu-game]').forEach(button=>{const selected=button.dataset.vmuGame===kind;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));});audio.play('select',.35);updateGameUi();drawLcd();}
$$('[data-vmu-game]').forEach(button=>button.addEventListener('click',()=>setGame(button.dataset.vmuGame)));
function resetBricks(){game.bricks=[];for(let row=0;row<3;row++)for(let col=0;col<8;col++)game.bricks.push({x:3+col*5,y:7+row*3,alive:true});}
function startSignalWatch(){const m=game.memory;m.phase='watch';m.index=0;m.answer=0;m.timer=.72;updateGameUi();}
function finishGame(){game.mode='over';game.best=Math.max(game.best,game.score);storage.set(game.kind==='spiral'?'best':`best.${game.kind}`,game.best);audio.play('vmu_error',.4);updateGameUi();drawLcd();}
function gameAction(){
  if(game.mode==='running'){game.mode='paused';audio.play('back',.3);}
  else if(game.mode==='paused'){game.mode='running';audio.play('confirmation',.3);}
  else{game.mode='running';game.x=23;game.score=0;game.lives=3;game.objects=[];game.spawn=.30;game.time=0;game.blink=0;game.left=game.right=false;
    if(game.kind==='breaker'){resetBricks();game.ball={x:23,y:23,vx:16,vy:-19};}
    if(game.kind==='signal'){game.memory.sequence=[Math.random()<.5?0:1,Math.random()<.5?0:1];startSignalWatch();}
    audio.play('vmu_config',.45);}
  updateGameUi();drawLcd();
}
$('#game-start').addEventListener('click',gameAction);
function handleDirection(key){
  if(game.kind!=='signal'){game[key]=true;return;}
  const m=game.memory;if(game.mode!=='running'||m.phase!=='input')return;
  const value=key==='left'?0:1;
  if(m.sequence[m.answer]===value){m.answer++;audio.play('select',.3);if(m.answer>=m.sequence.length){game.score++;m.phase='success';m.timer=.82;m.sequence.push(Math.random()<.5?0:1);audio.play('confirmation',.32);updateGameUi();}}
  else{game.lives--;audio.play('vmu_error',.35);if(game.lives<=0){finishGame();return;}m.phase='fail';m.timer=.82;updateGameUi();}
  drawLcd();
}
for(const [id,key] of [['game-left','left'],['game-right','right']]){
  const b=$('#'+id);b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);handleDirection(key);});b.addEventListener('pointerup',()=>game[key]=false);b.addEventListener('pointercancel',()=>game[key]=false);b.addEventListener('lostpointercapture',()=>game[key]=false);
}
function updateGame(dt){
  if(state.view!=='vmu'||game.mode!=='running')return;game.time+=dt;
  if(game.kind==='signal'){
    const m=game.memory;if(m.phase==='watch'||m.phase==='success'||m.phase==='fail'){m.timer-=dt;if(m.timer<=0){if(m.phase==='watch'){m.index++;if(m.index>=m.sequence.length){m.phase='input';m.answer=0;updateGameUi();}else m.timer=.72;}else startSignalWatch();}}return;
  }
  game.x=clamp(game.x+((game.right?1:0)-(game.left?1:0))*30*dt,6,42);
  if(game.kind==='breaker'){
    const b=game.ball;b.x+=b.vx*dt;b.y+=b.vy*dt;
    if(b.x<1||b.x>45){b.x=clamp(b.x,1,45);b.vx*=-1;}
    if(b.y<6){b.y=6;b.vy=Math.abs(b.vy);}
    if(b.vy<0){const brick=game.bricks.find(t=>t.alive&&b.x>=t.x-1&&b.x<=t.x+4&&b.y>=t.y-1&&b.y<=t.y+2);if(brick){brick.alive=false;b.vy=Math.abs(b.vy);game.score++;audio.play('select',.18);updateGameUi();if(game.bricks.every(t=>!t.alive))resetBricks();}}
    if(b.vy>0&&b.y>=27&&b.y<=30&&Math.abs(b.x-game.x)<6){b.y=26;b.vy=-Math.abs(b.vy);b.vx=clamp((b.x-game.x)*3.2,-23,23);audio.play('confirmation',.17);}
    if(b.y>32){game.lives--;if(game.lives<=0){finishGame();return;}b.x=game.x;b.y=23;b.vx=game.lives%2?16:-16;b.vy=-19;audio.play('vmu_error',.25);updateGameUi();}
    return;
  }
  game.blink=Math.max(0,game.blink-dt);game.spawn-=dt;
  if(game.spawn<=0){game.spawn=Math.max(.28,.75-game.time*.004);game.objects.push({x:3+Math.random()*42,y:6,bad:Math.random()<.38,dead:false});}
  let changed=false;
  for(const o of game.objects){o.y+=(9+Math.min(10,game.time*.10))*dt;if(o.y>=26&&Math.abs(o.x-game.x)<4){o.dead=true;if(o.bad&&game.blink===0){game.lives--;game.blink=.85;audio.play('vmu_error',.35);changed=true;}else if(!o.bad){game.score+=10;audio.play('select',.18);changed=true;}}else if(o.y>33)o.dead=true;}
  game.objects=game.objects.filter(o=>!o.dead);
  if(game.lives<=0){finishGame();return;}
  if(changed)updateGameUi();
}
window.addEventListener('blur',()=>{game.left=false;game.right=false;});
document.addEventListener('visibilitychange',()=>{game.left=false;game.right=false;if(document.hidden&&game.mode==='running'){game.mode='paused';updateGameUi();drawLcd();}});

if(!launches[state.region])state.region='jp';$('#region').value=state.region;
$('#region').title='Elapsed age from the regional launch date at 00:00 UTC. This is a date convention, not a documented launch hour.';
function clock(now=new Date()){
  const age=calculateAge(now,state.region),{years,days,hours,minutes,seconds,total,nextBirthdayDays,isBirthday}=age;
  for(const [id,n] of [['years',years],['days',days],['hours',hours],['minutes',minutes],['seconds',seconds]])$('#age-'+id).textContent=pad(n);
  $('#days-total').textContent=`${total.toLocaleString('en-US')} DAYS OF DREAMING`;
  $('#next-birthday').textContent=isBirthday?'TODAY, WE CELEBRATE.':`${nextBirthdayDays}D TO THE NEXT BIRTHDAY`;
  $('#birthday-title').textContent=isBirthday?`HAPPY ${years}${years%100>=11&&years%100<=13?'TH':years%10===1?'ST':years%10===2?'ND':years%10===3?'RD':'TH'} BIRTHDAY, DREAMCAST.`:'HAPPY BIRTHDAY, DREAMCAST.';
  $('#scene-date').textContent=launches[state.region].label;$('#current-year').textContent=now.getUTCFullYear();return age;
}
clock();setInterval(()=>clock(),1000);
$('#region').addEventListener('change',e=>{state.region=e.target.value;storage.set('region',state.region);clock();audio.play('select',.35);});

function applySettings(){
  document.body.classList.toggle('dark',settings.theme==='dark');$('meta[name="theme-color"]').content=settings.theme==='dark'?'#181c1e':'#f3f1eb';document.body.classList.toggle('scanlines',!!settings.crt);document.documentElement.style.setProperty('--accent',settings.spiral==='blue'?'#3564b2':'#e65224');scene.motion=!!settings.motion;scene.setTheme(settings.theme==='dark');scene.setAccent(settings.spiral==='blue'?0x3564b2:0xe65224);scene.setQuality(settings.quality);audio.setVolume(settings.volume);
  $('#theme-setting').value=settings.theme;$('#spiral-setting').value=settings.spiral;$('#quality-setting').value=settings.quality;$('#motion-setting').checked=settings.motion;$('#crt-setting').checked=settings.crt;$('#volume-setting').value=settings.volume;storage.set('settings',settings);
}
applySettings();
for(const [id,key,event] of [['theme-setting','theme','change'],['spiral-setting','spiral','change'],['quality-setting','quality','change'],['motion-setting','motion','change'],['crt-setting','crt','change'],['volume-setting','volume','input']])$('#'+id).addEventListener(event,e=>{settings[key]=e.target.type==='checkbox'?e.target.checked:e.target.type==='range'?+e.target.value:e.target.value;applySettings();if(key!=='volume')audio.play('select',.35);});
$('#settings-open').addEventListener('click',()=>{$('#settings-dialog').showModal();audio.play('confirmation',.35);});
$('#credits-open').addEventListener('click',()=>{$('#credits-dialog').showModal();audio.play('confirmation',.35);});
$$('.close-dialog').forEach(b=>b.addEventListener('click',()=>{b.closest('dialog').close();audio.play('back',.35);}));
$$('dialog').forEach(d=>{d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});d.addEventListener('cancel',()=>audio.play('back',.25));});
function soundUi(){$('#sound-toggle').setAttribute('aria-pressed',String(audio.enabled));$('#sound-toggle').setAttribute('aria-label',audio.enabled?'Mute sound':'Enable sound');$('#sound-slash').style.display=audio.enabled?'none':'';}
async function enableSound(){const enabled=await audio.enable();soundUi();if(enabled)audio.ambience(state.view==='bios'||state.view==='music');else toast('Audio is unavailable. You can still explore the whole exhibit.');return enabled;}
$('#sound-toggle').addEventListener('click',async()=>{if(audio.enabled){audio.ambience(false);audio.enabled=false;audio.stopBoot();soundUi();toast('Sound off.');}else{await enableSound();audio.play('confirmation',.4);}});

async function startBoot(withSound=true){
  if(state.booting||state.starting)return;state.starting=true;$('#power').disabled=true;$('#silent-enter').disabled=true;
  if(withSound){$('#asset-status').textContent='WAKING UP THE SOUND CHIP…';await enableSound();}
  else audio.enabled=false;
  soundUi();state.starting=false;state.booting=true;state.bootStart=performance.now();$('#boot').hidden=false;$('#boot').classList.remove('logo','leaving');$('#boot').classList.add('running');$('#boot-intro').setAttribute('aria-hidden','true');$('#skip-boot').hidden=false;$('#experience').hidden=true;scene.startBoot();audio.play('boot',.85);
  if(!withSound)finishBoot();else $('#skip-boot').focus({preventScroll:true});
}
function finishBoot(natural=false){
  if(!state.booting&&!state.entered)return;if(!natural)audio.stopBoot();state.booting=false;state.entered=true;scene.finishBoot();$('#boot').classList.add('leaving');$('#experience').hidden=false;setView(state.view);setTimeout(()=>{$('#boot').hidden=true;$('#power').disabled=false;$('#silent-enter').disabled=false;$('#boot-intro').removeAttribute('aria-hidden');},900);
  $('.brand').focus({preventScroll:true});
}
$('#power').addEventListener('click',()=>startBoot(true));$('#silent-enter').addEventListener('click',()=>startBoot(false));$('#skip-boot').addEventListener('click',()=>finishBoot());
$('#replay-boot').addEventListener('click',()=>{$('#settings-dialog').close();startBoot(true);});
audio.loading.then(count=>{if(!state.booting)$('#asset-status').textContent=count===7?'ORIGINAL BIOS AUDIO / HEADPHONES RECOMMENDED':'PRESS POWER TO BEGIN';});

window.addEventListener('keydown',e=>{
  const editing=['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName);if(editing)return;
  if(state.booting&&e.key==='Escape'){e.preventDefault();finishBoot();return;}
  if(!state.entered&&e.key==='Enter'&&e.target===document.body){e.preventDefault();startBoot(true);return;}
  if($('dialog[open]')||!state.entered)return;
  if(state.view==='bios'&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter'].includes(e.key)&&(e.key!=='Enter'||e.target.tagName!=='BUTTON')){
    e.preventDefault();if(e.key==='Enter'){openBios(state.bios);return;}const next=e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:2;setBios(state.bios+next);audio.play('select',.3);
  }
  if(state.view==='vmu'){
    const key=e.key.toLowerCase();if(['arrowleft','a','arrowright','d'].includes(key)){e.preventDefault();if(!e.repeat)handleDirection(key==='a'||key==='arrowleft'?'left':'right');}
    if((key===' '||key==='enter')&&e.target.tagName!=='BUTTON'){e.preventDefault();if(!e.repeat)gameAction();}
  }
  if(e.key==='Escape'&&scene.exhibit){closeExhibit();audio.play('back',.3);return;}
  if(e.key==='Escape'&&state.view!=='home'){setView('home');audio.play('back',.4);}
});
window.addEventListener('keyup',e=>{const key=e.key.toLowerCase();if(['a','arrowleft'].includes(key))game.left=false;if(['d','arrowright'].includes(key))game.right=false;});
document.addEventListener('render-lost',()=>{$('#graphics-fallback').hidden=false;toast('3D paused. Waiting for the graphics context to recover.');});
document.addEventListener('render-restored',()=>{$('#graphics-fallback').hidden=true;toast('3D rendering restored.');});

function updateLabels(){
  if(!scene.ready)return;
  if(state.view==='bios')$$('[data-bios]').forEach((b,i)=>{const p=scene.project(scene.biosItems[i].group,new THREE.Vector3(0,-.90,0));b.style.left=p.x+'px';b.style.top=p.y+'px';});
  if(state.view==='hardware'&&scene.explodeTarget)$$('[data-chip]').forEach((b,i)=>{const p=scene.project(scene.chips[i],new THREE.Vector3(0,.10,0));b.style.left=p.x+'px';b.style.top=p.y+'px';});
}
let last=performance.now(),lcdTime=0;
function animate(now){
  requestAnimationFrame(animate);const frameDt=Math.min(1,(now-last)/1000),dt=Math.min(.05,frameDt);last=now;if(document.hidden)return;
  if(state.booting){const elapsed=(now-state.bootStart)/1000;if(elapsed>9.0)finishBoot(true);}
  updateGame(dt);lcdTime+=dt;if(lcdTime>1/30&&game.mode==='running'){drawLcd();lcdTime=0;}
  scene.render(frameDt);if(state.entered)updateLabels();
}
requestAnimationFrame(animate);
// A small, read-only diagnostic surface for inspecting this technical exhibit.
window.dreamcastExhibit={get state(){return{view:state.view,rendering:scene.ready,renderer:scene.isSoftware?'canvas':'webgl',audio:audio.enabled,game:game.mode,gameKind:game.kind,score:game.score,objects:scene.objectCount};},ageAt:(iso,region='jp')=>calculateAge(new Date(iso),region)};

$('#brand-spiral').setAttribute('d',emblemSvg());
