import * as THREE from 'three';
import { DreamScene } from './scene.js';
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
  play(name,level=1){if(!this.enabled||!this.context||!this.buffers[name])return;if(name==='select'&&performance.now()-this.lastSelect<100)return;if(name==='select')this.lastSelect=performance.now();const source=this.context.createBufferSource();source.buffer=this.buffers[name];const gain=this.context.createGain();gain.gain.value=level;source.connect(gain);gain.connect(this.gain);source.start();source._name=name;source.onended=()=>{this.sources.delete(source);source.disconnect();gain.disconnect();};this.sources.add(source);return source;}
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
const game={mode:'ready',x:23,score:0,best:storage.get('best',0),lives:3,objects:[],spawn:0,left:false,right:false,time:0,blink:0};
$('#game-best').textContent=pad(game.best,3);
function clearLcd(){lcdCtx.fillStyle='#9bad8e';lcdCtx.fillRect(0,0,48,32);lcdCtx.fillStyle='#304b3c';}
function drawLcd(){
  clearLcd();
  if(game.mode==='ready'){
    pixelText('SPIRAL',12,3);pixelText('RUN',18,10);for(let i=0;i<65;i++){const a=i/65*Math.PI*4.2,r=1+i/65*4;lcdCtx.fillRect(23+Math.round(Math.cos(a)*r),22+Math.round(Math.sin(a)*r),1,1);}lcdCtx.fillRect(3,29,42,1);
  }else if(game.mode==='over'){pixelText('GAME OVER',6,4);pixelText(pad(game.score,3),18,13);pixelText('PRESS A',10,23);}
  else if(game.mode==='paused'){pixelText('PAUSED',12,9);pixelText('PRESS A',10,20);}
  else{
    pixelText(pad(game.score,3),1,1);for(let i=0;i<game.lives;i++){lcdCtx.fillRect(36+i*4,1,2,3);lcdCtx.fillRect(35+i*4,2,4,1);}
    for(const o of game.objects){const x=Math.round(o.x),y=Math.round(o.y);if(o.bad){lcdCtx.fillRect(x-1,y-1,1,1);lcdCtx.fillRect(x+1,y-1,1,1);lcdCtx.fillRect(x,y,1,1);lcdCtx.fillRect(x-1,y+1,1,1);lcdCtx.fillRect(x+1,y+1,1,1);}else{lcdCtx.fillRect(x,y-2,1,1);lcdCtx.fillRect(x-1,y-1,1,1);lcdCtx.fillRect(x+1,y-1,1,1);lcdCtx.fillRect(x-2,y,1,1);lcdCtx.fillRect(x+2,y,1,1);lcdCtx.fillRect(x-1,y+1,1,1);lcdCtx.fillRect(x+1,y+1,1,1);lcdCtx.fillRect(x,y+2,1,1);}}
    const x=Math.round(game.x);if(game.blink<=0||Math.floor(game.blink*10)%2===0){lcdCtx.fillRect(x-2,29,5,2);lcdCtx.fillRect(x-1,28,3,1);lcdCtx.fillRect(x,27,1,1);}lcdCtx.fillRect(0,31,48,1);
  }
  lcdTexture.needsUpdate=true;
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
const biosItems=[{label:'Play',title:'Meet the machine.',description:'Lift the shell. Follow the silicon. Explore the little box that brought the arcade home.',view:'hardware'},{label:'Memory',title:'Big dreams. Tiny screen.',description:'A memory card with a life of its own. Pick up the VMU and play an original 48 × 32 minigame.',view:'vmu'},{label:'Music',title:'You know this sound.',description:'Seven original BIOS recordings. The startup, the selection chime, and all those little sounds you still remember.',view:'archive'},{label:'Settings',title:'Make it yours.',description:'Orange or European blue. Light or after hours. Scanlines, motion, sound and rendering quality.',view:'settings'}];
$('#bios-labels').innerHTML=biosItems.map((item,i)=>`<button class="bios-label ${i===0?'selected':''}" data-bios="${i}"><small>0${i+1}</small>${item.label}</button>`).join('');
$('#hotspots').innerHTML=specs.map((_,i)=>`<button class="hotspot ${i===0?'selected':''}" data-chip="${i}" aria-label="Inspect ${specs[i].name}">0${i+1}</button>`).join('');
function selectSpec(i){const s=specs[i];$('#selected-spec').innerHTML=`<span class="mono">${s.code}</span><p>${s.text}</p>`;$$('[data-spec]').forEach((b,n)=>{b.classList.toggle('selected',n===i);b.setAttribute('aria-pressed',String(n===i));});$$('[data-chip]').forEach((b,n)=>b.classList.toggle('selected',n===i));scene.selectChip(i);audio.play('select',.45);}
$$('[data-spec]').forEach(b=>b.addEventListener('click',()=>selectSpec(+b.dataset.spec)));
$$('[data-chip]').forEach(b=>b.addEventListener('click',()=>selectSpec(+b.dataset.chip)));

const articles={
 security:()=>`<span class="tag">SECURITY / MIL-CD</span><h2>A music feature became an open door.</h2><p>The Dreamcast’s boot path supported interactive music CDs as well as proprietary GD-ROMs. That alternate path let independently written code run from ordinary CD media on compatible consoles.</p><div class="archive-flow"><span>Boot ROM</span><b>→</b><span>IP.BIN</span><b>→</b><span>Program</span></div><p>Marcus Comstedt documented the bootstrap and the reversible scatter-loading of the program binary. The lesson: an obscure transformation is not a substitute for authenticating executable code.</p><p>Later BIOS research identifies revisions that removed MIL-CD support. Compatibility depends on the actual BIOS; the manufacture date alone is not a universal rule.</p><button class="text-button" id="trace-boot">Trace the boot path <span>→</span></button><div id="trace-readout" class="note mono" aria-live="polite"></div><a class="source-link mono" target="_blank" rel="noreferrer" href="https://mc.pp.se/dc/ip.bin.html">COMSTEDT: BOOTSTRAP RESEARCH ↗</a><a class="source-link mono" target="_blank" rel="noreferrer" href="https://dreamcast.wiki/BIOS">BIOS REVISION RESEARCH ↗</a>`,
 homebrew:()=>`<span class="tag">INDEPENDENT DEVELOPMENT</span><h2>The platform outlived the product.</h2><p>KallistiOS is an independently developed Dreamcast SDK and operating-system library. Its toolchain brings C and C++ to the SH-4, with drivers for graphics, sound, networking and the VMU.</p><p>Developers still have the interesting problems: managing separate memory pools, feeding the PVR, scheduling work and making a 48 × 32 display say something meaningful.</p><div class="archive-flow"><span>C / C++</span><b>→</b><span>SH-4 tools</span><b>→</b><span>Real hardware</span></div><p>Open documentation and original software give the machine a future beyond its commercial life. No leaked Sega SDK is required for KallistiOS development.</p><a class="source-link mono" target="_blank" rel="noreferrer" href="https://github.com/KallistiOS/KallistiOS">KALLISTIOS / SOURCE ↗</a><a class="source-link mono" target="_blank" rel="noreferrer" href="https://kos-docs.dreamcast.wiki/">SDK DOCUMENTATION ↗</a>`,
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
  state.view=view;scene.showView(view);$$('[data-page]').forEach(p=>{p.hidden=p.dataset.page!==view;p.classList.toggle('active',!p.hidden);});$$('.dock [data-view]').forEach(b=>{const active=b.dataset.view===view;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  if(view!=='music'&&$('#music-player iframe'))$('#music-player').innerHTML='<div class="music-player-placeholder"><span class="music-play-icon">▷</span><span>Select a track to load its official stream.</span></div>';
  $('#scene-number').textContent=sceneMeta[view][0];$('#model-code').textContent=sceneMeta[view][1];$('#model-name').textContent=sceneMeta[view][2];$('#bios-labels').hidden=view!=='bios';$('#hotspots').hidden=view!=='hardware'||scene.explodeTarget===0;$('#tile-overlay').hidden=view!=='lab'||$('#render-style').value!=='tiles';
  if(view==='lab')updateLabUi();
  $('#wire-toggle').hidden=view==='bios'||view==='lab';$('#model-hint').hidden=view==='bios';$('#orbit-zone').setAttribute('aria-label',view==='bios'?'Select a 3D BIOS orb, or use the labeled buttons.':'Drag to rotate the 3D model. Scroll to zoom. Use arrow keys to rotate.');
  if(view!=='hardware'){setAssemblyUi(false);}if(window.innerWidth<=800)window.scrollTo({top:0,behavior:'instant'});document.title=`Dreamcast · ${view==='home'?'Never stop dreaming':view==='lab'?'Scene lab':view==='vmu'?'Visual Memory':view[0].toUpperCase()+view.slice(1)}`;
  if(view==='bios')$('#orbit-zone').focus({preventScroll:true});
}
$$('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
$$('.dock button').forEach(b=>b.addEventListener('pointerenter',()=>audio.play('select',.25)));
let collectionKind='classic',collectionIndex=0,collectionOpen=false;
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
  coast:{tag:'ORIGINAL STAGE / OPENING BEACH',title:'Emerald Coast, up close.',description:'The opening shoreline is cropped from the original Dreamcast stage mesh. Its game textures and modeled terrain replace the earlier miniature island.',code:'BEACH / STAGE CROP',name:'Emerald Coast · opening'},
  particles:{tag:'INSTANCED STRESS TEST / MODERN WEBGL',title:'How much can we draw?',description:'One mesh, many transforms. Raise the object count and observe this browser’s FPS, visible triangles and draw calls. The numbers are not Dreamcast benchmarks.',code:'2400 / INSTANCES',name:'Browser stress test'}
};
let activeLab='sonic';
function updateLabUi(){
 const item=labScenes[activeLab];$('#lab-demo-tag').textContent=item.tag;$('#lab-demo-title').textContent=item.title;$('#lab-demo-description').textContent=item.description;
 $('#object-control').hidden=activeLab!=='particles';$('#model-code').textContent=item.code;$('#model-name').textContent=item.name;
 $$('[data-lab-demo]').forEach(b=>{const selected=b.dataset.labDemo===activeLab;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
}
$$('[data-lab-demo]').forEach(b=>b.addEventListener('click',()=>{activeLab=b.dataset.labDemo;scene.setLabDemo(activeLab);updateLabUi();audio.play('confirmation',.42);}));
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

function updateGameUi(){$('#game-score').textContent=pad(game.score,3);$('#game-best').textContent=pad(game.best,3);$('#game-state').textContent=game.mode==='running'?`${game.lives} LIVES`:game.mode.toUpperCase();$('#game-start').innerHTML=`${game.mode==='running'?'Pause game':game.mode==='paused'?'Resume game':game.mode==='over'?'Try again':'Start game'} <span>A</span>`;}
function gameAction(){
  if(game.mode==='running'){game.mode='paused';audio.play('back',.3);}
  else if(game.mode==='paused'){game.mode='running';audio.play('confirmation',.3);}
  else{game.mode='running';game.x=23;game.score=0;game.lives=3;game.objects=[];game.spawn=.30;game.time=0;game.blink=0;audio.play('vmu_config',.45);}
  updateGameUi();drawLcd();
}
$('#game-start').addEventListener('click',gameAction);
for(const [id,key] of [['game-left','left'],['game-right','right']]){
  const b=$('#'+id);b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);game[key]=true;});b.addEventListener('pointerup',()=>game[key]=false);b.addEventListener('pointercancel',()=>game[key]=false);b.addEventListener('lostpointercapture',()=>game[key]=false);
}
function updateGame(dt){
  if(state.view!=='vmu'||game.mode!=='running')return;game.time+=dt;game.blink=Math.max(0,game.blink-dt);game.x=clamp(game.x+((game.right?1:0)-(game.left?1:0))*30*dt,3,44);game.spawn-=dt;
  if(game.spawn<=0){game.spawn=Math.max(.28,.75-game.time*.004);game.objects.push({x:3+Math.random()*42,y:6,bad:Math.random()<.38,dead:false});}
  let changed=false;
  for(const o of game.objects){o.y+=(9+Math.min(10,game.time*.10))*dt;if(o.y>=26&&Math.abs(o.x-game.x)<4){o.dead=true;if(o.bad&&game.blink===0){game.lives--;game.blink=.85;audio.play('vmu_error',.35);changed=true;}else if(!o.bad){game.score+=10;audio.play('select',.18);changed=true;}}else if(o.y>33)o.dead=true;}
  game.objects=game.objects.filter(o=>!o.dead);
  if(game.lives<=0){game.mode='over';game.best=Math.max(game.best,game.score);storage.set('best',game.best);audio.play('vmu_error',.4);changed=true;}
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
async function enableSound(){const enabled=await audio.enable();soundUi();if(!enabled)toast('Audio is unavailable. You can still explore the whole exhibit.');return enabled;}
$('#sound-toggle').addEventListener('click',async()=>{if(audio.enabled){audio.enabled=false;audio.stopBoot();soundUi();toast('Sound off.');}else{await enableSound();audio.play('confirmation',.4);}});

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
    const key=e.key.toLowerCase();if(['arrowleft','a','arrowright','d'].includes(key)){e.preventDefault();game[key==='a'||key==='arrowleft'?'left':'right']=true;}
    if((key===' '||key==='enter')&&e.target.tagName!=='BUTTON'){e.preventDefault();if(!e.repeat)gameAction();}
  }
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
window.dreamcastExhibit={get state(){return{view:state.view,rendering:scene.ready,renderer:scene.isSoftware?'canvas':'webgl',audio:audio.enabled,game:game.mode,objects:scene.objectCount};},ageAt:(iso,region='jp')=>calculateAge(new Date(iso),region)};

$('#brand-spiral').setAttribute('d',emblemSvg());
