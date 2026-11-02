import * as THREE from './assets/three.module.js';

const $ = (id) => document.getElementById(id);
const state = { role: 'Knight', device: 'desktop', moment: 'explore', depth: 14 };
const messages = {
  explore: ['A BREATH OF SPACE', 'Explore with your eyes up.', 'Health settles into two quiet marks. Abilities stay compact. A small prompt appears only when you approach something useful.', 'Knight · explore'],
  combat: ['READ THE FIGHT', 'Only useful information gets louder.', 'Damage briefly wakes the life indicators. Cooldowns show on their own tokens. A boss bar appears only during a boss fight. Routine attacks never shake the HUD.', 'Defend the grove'],
  prayer: ['ONE VOICE, ONE CEREMONY', 'Your beloved has the floor.', 'A lotus opens on the prayer token. One short status line says who is speaking. A second prayer press does not open a microphone or restart the first ceremony.', 'Your beloved is praying'],
  heal: ['A SMALL ACT OF CARE', 'Healing can be intimate.', 'A little lotus, a short ribbon around the recipient and one clear health gain. No levitation, giant crystals or camera kick. Let the miracle keep its scale.', 'Beloved restored · +55 HP'],
  downed: ['MAKE THE IMPORTANT THING OBVIOUS', 'Your partner needs you.', 'Their life indicator changes shape and pulses gently. A direction cue guides you if they leave the view. Prayer explains when you are close enough; it never hides the fight behind a modal.', 'Partner down · draw closer']
};
const info = {
  attack: ['Strike', 'Attack: the token depresses. The final game must let a native swing complete; extra taps buffer one follow-up.'],
  evade: ['Evade', 'Evade: immediate escape feedback, with a stable camera. Cancel a recording deliberately; do not punish a technical cancellation.'],
  jump: ['Jump', 'Jump: a simple touch action. On desktop its icon is hidden because Space already owns the input.'],
  ward: ['E', 'Partner skill: shield for the Knight; infusion/healing for the Mage. Same position, role-specific behavior.'],
  ultimate: ['Q', 'Shared ultimate: one shared readiness state. Two simultaneous presses must resolve to one activation and one cost.'],
  prayer: ['R', 'Commune: hold to record, release to submit. The full game owns microphone and judging; this page never accesses either.'],
  frost: ['1', 'Frost Lance: a clear ice silhouette, with a radial cooldown on this token only.'],
  spear: ['2', 'Shatterlance: a long spear silhouette so two blue spells are still distinguishable.'],
  fire: ['3', 'Cinder Fall: one meteor silhouette. Its ordinary infusion is the Knight’s fire blade.'],
  storm: ['4', 'Storm Lance: a lightning silhouette. Readable without depending on color alone.']
};
const stage = $('stage');
const canvas = $('hud-canvas');
const targets = $('hit-targets');
let renderer, scene, camera, tokens = [], health = [], sceneHeight = 625, prayerTimer, resultTimer;
let cooldownTimer, currentDown = null;
let lastAction = 0;
const geometries = new Set();
const materials = {};

function material(name, color, metalness = 0, roughness = .8) {
  const m = new THREE.MeshStandardMaterial({ color, metalness, roughness });
  materials[name] = m; return m;
}
function mesh(geo, mat, parent, x = 0, y = 0, z = 0) {
  geometries.add(geo); const m = new THREE.Mesh(geo, mat); m.position.set(x,y,z); parent.add(m); return m;
}
function polygon(points, mat, parent, scale = 1, x = 0, y = 0, z = 6) {
  const s = new THREE.Shape(); points.forEach((p,i) => i ? s.lineTo(p[0]*scale,p[1]*scale) : s.moveTo(p[0]*scale,p[1]*scale)); s.closePath();
  return mesh(new THREE.ExtrudeGeometry(s,{depth:2.5,bevelEnabled:true,bevelThickness:.7,bevelSize:.6,bevelSegments:1,steps:1}),mat,parent,x,y,z);
}
function baseToken(icon, r, x, y) {
  const g = new THREE.Group(); scene.add(g); g.position.set(x,-y,0);
  const sculpture = new THREE.Group(); g.add(sculpture);
  const disc = mesh(new THREE.CylinderGeometry(r,r*.92,6,8),materials.stone,sculpture,0,0,-1); disc.rotation.x = Math.PI/2;
  mesh(new THREE.TorusGeometry(r*.91,.9,4,8),materials.brass,sculpture,0,0,2.3);
  const face=mesh(new THREE.CylinderGeometry(r*.77,r*.77,1,8),materials.face,sculpture,0,0,3); face.rotation.x=Math.PI/2;
  const sc = r/25;
  if(icon==='attack') {
    const b = new THREE.Group(); sculpture.add(b); b.rotation.z=-.6;
    polygon([[-3,-4],[-3,12],[0,20],[3,12],[3,-4]],materials.ivory,b,sc);
    mesh(new THREE.BoxGeometry(17*sc,3*sc,3),materials.brass,b,0,-5*sc,7);
    mesh(new THREE.BoxGeometry(3*sc,9*sc,3),materials.wood,b,0,-11*sc,7);
  } else if(icon==='ward') {
    polygon([[-11,13],[0,9],[11,13],[10,-1],[6,-10],[0,-16],[-6,-10],[-10,-1]],materials.brass,sculpture,sc);
    polygon([[-7,8],[0,5],[7,8],[6,-1],[0,-10],[-6,-1]],materials.jade,sculpture,sc,0,0,9);
  } else if(icon==='prayer') {
    for(let i=0;i<5;i++) { const p=mesh(new THREE.SphereGeometry(1,8,6),i%2?materials.rose:materials.ivory,sculpture,0,0,7); const a=(i-2)*.43;p.scale.set(4.5*sc,12*sc,2*sc); p.rotation.z=-a;p.position.x=Math.sin(a)*8*sc;p.position.y=Math.cos(a)*6*sc-2*sc; }
    mesh(new THREE.SphereGeometry(3*sc,8,6),materials.brass,sculpture,0,-7*sc,8);
  } else if(icon==='ultimate') {
    const ring = new THREE.TorusGeometry(8*sc,2*sc,5,16);
    mesh(ring,materials.brass,sculpture,-5*sc,0,7);mesh(ring,materials.ivory,sculpture,5*sc,0,8);
  } else if(icon==='evade'||icon==='jump') {
    polygon(icon==='jump'?[[-13,-7],[0,13],[13,-7],[0,1]]:[[-16,-7],[-8,5],[8,13],[15,11],[4,2],[-3,-7]],materials.ivory,sculpture,sc);
  } else if(icon==='frost') {
    for(let i=-1;i<=1;i++) polygon([[-4,-10],[-4,5],[0,16],[4,5],[4,-10]],materials.ice,sculpture,sc*.7,i*8*sc,-Math.abs(i)*3*sc,6+Math.abs(i));
  } else if(icon==='spear') {
    const b=new THREE.Group();sculpture.add(b);b.rotation.z=-.45;
    polygon([[-2,-15],[-2,8],[-5,8],[0,20],[5,8],[2,8],[2,-15]],materials.ice,b,sc);
  } else if(icon==='fire') {
    polygon([[-12,-4],[-9,7],[-4,2],[0,18],[4,6],[9,10],[12,-4],[8,-12],[0,-15],[-8,-12]],materials.fire,sculpture,sc);
    polygon([[-4,-6],[0,7],[4,-6],[0,-11]],materials.ivory,sculpture,sc,0,0,10);
  } else if(icon==='storm') polygon([[2,18],[-12,-2],[-1,-2],[-5,-17],[13,5],[2,5]],materials.brass,sculpture,sc);
  const arc=mesh(new THREE.TorusGeometry(r*.99,1.8,4,40,Math.PI*1.45),materials.ice,sculpture,0,0,4);arc.rotation.z=Math.PI/2;
  arc.visible=icon==='ultimate';
  const record={id:icon,g,sculpture,r,x,y,arc}; tokens.push(record); return record;
}
function lifeBar(x,y,fill,role) {
  const g=new THREE.Group();scene.add(g);g.position.set(x,-y,0);
  mesh(new THREE.BoxGeometry(155,10,5),materials.brass,g);
  mesh(new THREE.BoxGeometry(150,7,6),materials.face,g,0,0,1);
  const filled=mesh(new THREE.BoxGeometry(1,5,3),fill, g,-74+148*.78/2,0,6);filled.scale.x=148*.78;
  const gem=mesh(new THREE.OctahedronGeometry(8),role==='Mage'?materials.rose:materials.ivory,g,-88,0,3);gem.rotation.z=.2;
  health.push({g,filled,role});
}
function rebuild() {
  if(!scene) return;
  for(const t of tokens) scene.remove(t.g);
  for(const h of health) scene.remove(h.g);
  for(const geo of geometries) geo.dispose();geometries.clear();
  tokens=[];health=[];targets.replaceChildren();
  sceneHeight=1000*stage.clientHeight/stage.clientWidth;
  camera.left=0;camera.right=1000;camera.top=0;camera.bottom=-sceneHeight;camera.updateProjectionMatrix();
  renderer.setSize(stage.clientWidth,stage.clientHeight,false);
  lifeBar(120,state.device==='tablet'?45:sceneHeight-65,materials.jade,'Knight');lifeBar(120,state.device==='tablet'?73:sceneHeight-37,materials.jade,'Mage');
  if(state.device==='tablet') {
    baseToken('attack',34,922,sceneHeight-57);baseToken('evade',23,826,sceneHeight-41);
    baseToken('jump',23,963,sceneHeight-143);baseToken('ward',24,822,sceneHeight-123);
    baseToken('prayer',24,895,sceneHeight-179);baseToken('ultimate',25,742,sceneHeight-68);
    if(state.role==='Mage') ['frost','spear','fire','storm'].forEach((id,i)=>baseToken(id,22,452+i*57,sceneHeight-38));
  } else {
    baseToken('ward',24,805,sceneHeight-38);baseToken('ultimate',26,872,sceneHeight-38);baseToken('prayer',24,939,sceneHeight-38);
    if(state.role==='Mage') ['frost','spear','fire','storm'].forEach((id,i)=>baseToken(id,23,430+i*59,sceneHeight-38));
  }
  stage.classList.toggle('tablet',state.device==='tablet');
  tokens.forEach(t=>{
    const b=document.createElement('button');b.className='hud-target';b.setAttribute('aria-label',info[t.id][1].split(':')[0]);
    b.dataset.action=t.id;b.style.left=t.x/10+'%';b.style.top=(t.y/sceneHeight*100)+'%';
    b.style.width=(t.r*2.3/10)+'%';b.style.height=(t.r*2.3/sceneHeight*100)+'%';
    const label=document.createElement('span');label.textContent=state.device==='desktop'?info[t.id][0]:({attack:'Strike',evade:'Evade',jump:'Jump',ward:'Partner',ultimate:'Together',prayer:'Commune',frost:'1',spear:'2',fire:'3',storm:'4'})[t.id];b.append(label);
    b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);press(t);});
    b.addEventListener('pointerup',()=>release(t));b.addEventListener('pointercancel',()=>release(t,true));
    b.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&!e.repeat){e.preventDefault();press(t);}});
    b.addEventListener('keyup',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();release(t);}});
    b.addEventListener('blur',()=>{if(currentDown===t.id)release(t,true);});targets.append(b);
  });
  applyMoment();render();
}
function render() {
  if(!renderer)return;
  for(const t of tokens){t.sculpture.rotation.x=.13;t.sculpture.rotation.y=THREE.MathUtils.degToRad(state.depth);}
  renderer.render(scene,camera);
}
function clearTimers(){clearTimeout(prayerTimer);clearTimeout(resultTimer);clearTimeout(cooldownTimer);tokens.forEach(t=>{t.arc.visible=t.id==='ultimate';t.sculpture.position.z=0;});currentDown=null;}
function press(t){
  clearTimers();lastAction++;currentDown=t.id;t.sculpture.position.z=-3;
  $('demo-readout').textContent=info[t.id][1];
  if(t.id==='prayer'){
    if(state.moment==='prayer'){$('demo-readout').textContent='Your beloved is already praying. In the proposed game your mic stays off; the active prayer continues.';}
    else {$('stage-message').textContent='Listening · release to submit';$('prayer-progress').hidden=false;}
  }
  render();
}
function release(t,cancel=false){
  if(currentDown!==t.id)return;currentDown=null;t.sculpture.position.z=0;render();
  if(t.id==='prayer'&&state.moment!=='prayer'){
    if(cancel){$('prayer-progress').hidden=true;applyMoment();return;}
    const action=lastAction;$('stage-message').textContent='Judging · demonstration only';
    prayerTimer=setTimeout(()=>{if(action!==lastAction)return;$('stage-message').textContent='Beloved restored · +55 HP';$('prayer-progress').hidden=true;$('demo-readout').textContent='Illustrative result only. No audio was recorded or sent. A real simple heal should stay this small and clear.';},1100);
  }else if(['frost','spear','fire','storm','ward'].includes(t.id)){
    t.arc.visible=true;render();cooldownTimer=setTimeout(()=>{t.arc.visible=false;render();},1200);
  }
}
function applyMoment(){
  const m=messages[state.moment];$('stage-message').textContent=state.moment==='explore'?state.role+' · explore':m[3];
  $('prayer-progress').hidden=state.moment!=='prayer';
  health.forEach(h=>{const down=state.moment==='downed'&&h.role!==state.role;const frac=down ? 0.04 : state.moment==='heal' ? 0.96 : 0.78;h.filled.scale.x=148*frac;h.filled.position.x=-74+148*frac/2;h.filled.material=down?materials.fire:materials.jade;});
  render();
}
function init3D(){
  try{
    renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
    scene=new THREE.Scene();camera=new THREE.OrthographicCamera(0,1000,0,-625,.1,2000);camera.position.z=800;
    scene.add(new THREE.HemisphereLight('#fff4d5','#566452',2.1));const sun=new THREE.DirectionalLight('#fff2c9',3);sun.position.set(-250,450,900);scene.add(sun);
    material('stone','#7a7b66',.05);material('face','#585f50',.05);material('brass','#d9b566',.5,.48);material('ivory','#fff2ce');material('wood','#695139');material('jade','#84ca71');material('rose','#e7a4b2');material('ice','#78c8ed',.1);material('fire','#ef9862');
    new ResizeObserver(rebuild).observe(stage);rebuild();
    window.__UI_STUDY__={state,getTokenCount:()=>tokens.length,renderer,render,rebuild};
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();$('fallback').hidden=false;});
  }catch(e){$('fallback').hidden=false;$('demo-readout').textContent='The 3D preview could not start. The rest of this design guide works without WebGL.';console.warn('3D UI study unavailable:',e.message);}
}
document.querySelectorAll('[data-role],[data-device]').forEach(b=>b.addEventListener('click',()=>{
  clearTimers();lastAction++;
  const key=b.dataset.role?'role':'device';state[key]=b.dataset[key];
  document.querySelectorAll('[data-'+key+']').forEach(x=>{const on=x===b;x.classList.toggle('selected',on);x.setAttribute('aria-pressed',String(on));});
  $('demo-readout').textContent=key==='role'?state.role+' layout: only the abilities this player owns.':state.device==='tablet'?'Tablet adds thumb controls; desktop removes them.':'Desktop hides learned movement/attack controls.';rebuild();
}));
document.querySelectorAll('[data-moment]').forEach(b=>b.addEventListener('click',()=>{
  clearTimers();lastAction++;state.moment=b.dataset.moment;$('moment-select').value=state.moment;
  document.querySelectorAll('[data-moment]').forEach(x=>{const on=x===b;x.classList.toggle('selected',on);x.setAttribute('aria-pressed',String(on));});
  const m=messages[state.moment];$('moment-kicker').textContent=m[0];$('moment-title').textContent=m[1];$('moment-copy').textContent=m[2];$('moment-art').className='moment-art '+state.moment;
  $('moment-art').firstElementChild.textContent=({explore:'❧',combat:'✦',prayer:'❧',heal:'❧',downed:'♡'})[state.moment];applyMoment();
}));
$('moment-select').addEventListener('change',e=>document.querySelector('[data-moment="'+e.target.value+'"]').click());
$('depth').addEventListener('input',e=>{state.depth=Number(e.target.value);$('depth-value').value=state.depth+'°';render();});
$('pause').addEventListener('click',()=>{$('pause-menu').hidden=false;$('resume').focus();});
$('resume').addEventListener('click',()=>{$('pause-menu').hidden=true;$('pause').focus();});
window.addEventListener('keydown',e=>{if(e.key==='Escape')$('pause-menu').hidden=true;});
$('reset').addEventListener('click',()=>{clearTimers();lastAction++;currentDown=null;state.depth=14;$('depth').value=14;$('depth-value').value='14°';$('pause-menu').hidden=true;$('demo-readout').textContent='Study reset. Tap a token or choose another situation.';rebuild();});
document.querySelectorAll('[data-check]').forEach(c=>{try{c.checked=localStorage.getItem('haru-ui-study-'+c.dataset.check)==='yes';}catch{}c.addEventListener('change',()=>{try{localStorage.setItem('haru-ui-study-'+c.dataset.check,c.checked?'yes':'no');}catch{}});});
window.addEventListener('pagehide',()=>{clearTimers();renderer?.dispose();for(const g of geometries)g.dispose();Object.values(materials).forEach(m=>m.dispose());});
init3D();
