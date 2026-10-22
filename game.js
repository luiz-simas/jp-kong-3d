import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js';

// ============ BASE ============
const canvas = document.querySelector('#game');
const renderer = new THREE.WebGLRenderer({canvas, antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ad8e8);
scene.fog = new THREE.Fog(0xbfe8f2, 45, 165);
const camera = new THREE.PerspectiveCamera(65, innerWidth/innerHeight, .1, 700);
const hemi = new THREE.HemisphereLight(0xcaf1ff, 0x294522, 2.0); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0c6, 3); sun.position.set(-15,28,12);
sun.castShadow = true; sun.shadow.mapSize.set(2048,2048); scene.add(sun);

const mat = (c,r=.85)=>new THREE.MeshStandardMaterial({color:c, roughness:r});
const M = {
  grass: mat(0x397d35), path: mat(0xb89a5d), wood: mat(0x865128), leaf: mat(0x1d7138), leaf2: mat(0x338a3c),
  trunk: mat(0x684027), rock: mat(0x727d7e), gold: mat(0xffca25,.35), fur: mat(0x754326), muzzle: mat(0xdcae78),
  dark: mat(0x20130c), red: mat(0xa42f2d), blue: mat(0x355baf), purple: mat(0x6a3fa0), pink: mat(0xe77fa2),
  white: mat(0xf7f2d5), black: mat(0x2b2b30), dirt: mat(0x7a5230),
  glow: new THREE.MeshBasicMaterial({color:0x7ee7ff, transparent:true, opacity:.45}),
  cage: mat(0x9aa5a8,.4), cageGold: mat(0xffca25,.3)
};
// ===== visual: texturas, céu, nuvens, montanhas =====
function groundTexture(base, s1, s2, rx, ry){
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); g.fillStyle = base; g.fillRect(0,0,128,128);
  for(let i=0;i<1000;i++){ g.fillStyle = Math.random()<.5?s1:s2; g.fillRect(Math.random()*128, Math.random()*128, 2, 2); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx,ry); t.colorSpace = THREE.SRGBColorSpace; return t;
}
M.grass = new THREE.MeshStandardMaterial({map: groundTexture('#3d8438','#2f6b2a','#55a34c', 20, 28), roughness:.95});
M.path = new THREE.MeshStandardMaterial({map: groundTexture('#b89a5d','#a3854e','#cbb27a', 2, 26), roughness:.95});
const skyMat = new THREE.ShaderMaterial({side: THREE.BackSide, depthWrite:false,
  vertexShader:'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader:'varying vec3 vP; void main(){ float h=normalize(vP).y; vec3 top=vec3(0.22,0.58,0.95); vec3 mid=vec3(0.60,0.84,0.98); vec3 bot=vec3(0.99,0.95,0.80); vec3 c = h>0.10 ? mix(mid,top,smoothstep(0.10,0.65,h)) : mix(bot,mid,smoothstep(-0.06,0.10,h)); gl_FragColor=vec4(c,1.0); }'});
scene.add(new THREE.Mesh(new THREE.SphereGeometry(320, 20, 12), skyMat));
const outer = new THREE.Mesh(new THREE.CircleGeometry(320, 40), mat(0x2f6b2a));
outer.rotation.x = -Math.PI/2; outer.position.y = -.12; scene.add(outer);
for(let i=0;i<14;i++){
  const a = (i/14)*Math.PI*2 + .2, r = 130 + (i%4)*14;
  const mtn = new THREE.Mesh(new THREE.ConeGeometry(26+(i%3)*9, 30+(i%5)*7, 7), mat(i%2?0x2c6e46:0x35795a));
  mtn.position.set(Math.cos(a)*r, 6, Math.sin(a)*r - 30); scene.add(mtn);
}
const cloudArr = [];
for(let i=0;i<9;i++){
  const cl = new THREE.Group();
  const cm = new THREE.MeshStandardMaterial({color:0xffffff, roughness:1});
  for(let j=0;j<4;j++){ const s = new THREE.Mesh(new THREE.SphereGeometry(2.2+((j*7)%3), 10, 8), cm);
    s.position.set(j*2.4-3.4, (j%2)*.8, (j%3)*.9); s.scale.y = .55; cl.add(s); }
  cl.position.set(-130 + i*30 + (i%3)*9, 30 + (i%4)*4, -120 + (i*29)%150);
  cl.userData.speed = .5 + (i%3)*.3; scene.add(cl); cloudArr.push(cl);
}
function rng(seed){ let a = seed*7919+13; return ()=>{ a|=0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a>>>15, 1|a); t = t + Math.imul(t ^ t>>>7, 61|t) ^ t; return ((t ^ t>>>14)>>>0)/4294967296; } }

// ============ ESTADO ============
const S = {
  mode:'menu', level:1, hearts:3, maxHearts:3, healCharges:2,
  bananas:0, bananasNeeded:0, bananasTotal:0, totalRun:0,
  speedMul:1, smashR:3.1, zapCdMax:3, magnet:false,
  smashCd:0, zapCd:0, invuln:0, startedAt:0
};
let solids=[], platforms=[], bananaObjs=[], rockObjs=[], enemies=[], digSpots=[];
let world=null, player, visual, kong, kongArms=[];
let velocityY=0, onGround=true, boss=null, cage=null;
const effectGroup = new THREE.Group(); scene.add(effectGroup);

function box(parent,w,h,d,material,x,y,z,collider=true){
  const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), material);
  m.position.set(x,y,z); m.castShadow=true; m.receiveShadow=true; parent.add(m);
  if(collider) solids.push({x:x-w/2, x2:x+w/2, z:z-d/2, z2:z+d/2, top:y+h/2, bottom:y-h/2});
  return m;
}
function sphere(parent,r,material,x,y,z,scaleY=1){
  const o = new THREE.Mesh(new THREE.SphereGeometry(r,16,12), material);
  o.position.set(x,y,z); o.scale.y=scaleY; o.castShadow=true; parent.add(o); return o;
}
function makeKong(parent, furMat, scale=1, bowColor=null){
  const g = new THREE.Group(); parent.add(g); g.scale.setScalar(scale);
  sphere(g,.56,furMat,0,1.02,0,1.25);
  sphere(g,.33,M.muzzle,0,.92,.30,1.15);
  function arm(x){ const ag = new THREE.Group(); ag.position.set(x,1.02,.02); g.add(ag);
    const s = sphere(ag,.30,furMat,0,-.30,0,1.3); return ag; }
  const a1 = arm(-.60), a2 = arm(.60);
  sphere(g,.31,furMat,0,1.68,.04,1.05);
  sphere(g,.24,M.muzzle,0,1.56,.29,.72);
  sphere(g,.11,furMat,-.30,1.80,.02); sphere(g,.11,furMat,.30,1.80,.02);
  sphere(g,.055,M.muzzle,-.30,1.80,.09); sphere(g,.055,M.muzzle,.30,1.80,.09);
  const brow = box(g,.36,.09,.10,M.dark,0,1.84,.27,false);
  sphere(g,.055,M.dark,-.105,1.73,.265); sphere(g,.055,M.dark,.105,1.73,.265);
  sphere(g,.065,M.dark,0,1.57,.48,.6);
  const tie = sphere(g,.16, bowColor||M.red, 0,1.28,.35,.7); tie.rotation.z=.1;
  box(g,.22,.55,.28,furMat,-.23,.3,0,false); box(g,.22,.55,.28,furMat,.23,.3,0,false);
  g.userData.arms=[a1,a2]; return g;
}
function tree(parent,x,z,s=1,withBananas=false){
  const g = new THREE.Group(); g.position.set(x,0,z); parent.add(g);
  const t = new THREE.Mesh(new THREE.CylinderGeometry(.3*s,.48*s,3.2*s,8), M.trunk);
  t.position.y=1.5*s; t.castShadow=true; g.add(t);
  for(let i=0;i<3;i++){ const c = new THREE.Mesh(new THREE.SphereGeometry((1.25-i*.14)*s,10,8), i===1?M.leaf2:M.leaf);
    c.position.set((i-1)*.38*s, 2.9*s+i*.32*s, 0); c.castShadow=true; g.add(c); }
  if(withBananas){ for(let i=0;i<3;i++){ const b = new THREE.Mesh(new THREE.SphereGeometry(.11*s,8,6), M.gold);
    b.position.set(.34*s+(i%2)*.14*s, 2.25*s, .3*s); g.add(b); } }
}
function burst(pos, color=0x9eeeff, n=12){
  for(let i=0;i<n;i++){ const m = new THREE.Mesh(new THREE.SphereGeometry(.07,6,6), new THREE.MeshBasicMaterial({color}));
    m.position.copy(pos); m.userData.v = new THREE.Vector3((Math.random()-.5)*.22, Math.random()*.2, (Math.random()-.5)*.22);
    m.userData.life=.6; effectGroup.add(m); }
}
function say(t){ document.querySelector('#status').textContent = t; }
function banner(t, ms=1800){
  const b = document.querySelector('#banner'); b.textContent = t; b.classList.remove('hidden');
  setTimeout(()=>b.classList.add('hidden'), ms);
}
function refresh(){
  document.querySelector('#banana-count').textContent = '🍌 '+S.bananas+'/'+S.bananasNeeded;
  document.querySelector('#health').textContent = '❤️ '+S.hearts+'/'+S.maxHearts;
  document.querySelector('#level').textContent = 'FASE '+S.level+'/20';
  document.querySelector('#heals').textContent = '💚 Cura: '+S.healCharges;
  if(boss && boss.alive){ document.querySelector('#bossfill').style.width = Math.max(0, boss.hp/boss.maxHp*100)+'%'; }
}

// ============ CONSTRUÇÃO DAS FASES ============
const BOSS_LEVELS = {5:{name:'B-KONG', hp:6, fur:M.black, scale:1.7, story:'O B-Kong apareceu!'},
  12:{name:'REI BRUTÃO', hp:10, fur:M.purple, scale:1.9, story:'Um chefão novo: o Rei Brutão!'},
  15:{name:'QUEEN MIGHTY', hp:12, fur:M.purple, scale:1.8, queen:true, story:'A Queen Mighty, com o mesmo poder que você!'},
  20:{name:'B-KONG — LUTA FINAL', hp:16, fur:M.black, scale:1.9, final:true, story:'A luta final contra o B-Kong!'}};

function buildLevel(n){
  if(world){ scene.remove(world); }
  world = new THREE.Group(); scene.add(world);
  solids=[]; platforms=[]; bananaObjs=[]; rockObjs=[]; enemies=[]; digSpots=[]; boss=null; cage=null;
  const R = rng(n*31+7);
  // chão e caminho
  const ground = new THREE.Mesh(new THREE.BoxGeometry(80,1,110), M.grass);
  ground.position.set(0,-.55,-28); ground.receiveShadow=true; world.add(ground);
  solids.push({x:-40,x2:40,z:-83,z2:27,top:-.05,bottom:-1});
  box(world,8,.08,95,M.path,0,.02,-25,false);
  for(let i=0;i<34;i++){ const x=((i*17+R()*6)%74)-37, z=-76+((i*23+R()*8)%92); if(Math.abs(x)<6&&z>-55&&z<9) continue; tree(world,x,z,.7+((i%4)*.13), i%6===0); }
  // arbustos e flores
  for(let i=0;i<26;i++){ const x=-36+R()*72, z=-80+R()*102; if(Math.abs(x)<5.5) continue; sphere(world,.5+R()*.5, i%3?M.leaf2:M.leaf, x,.28,z,.7); }
  for(let i=0;i<22;i++){ const x=-35+R()*70, z=-78+R()*100; if(Math.abs(x)<5) continue;
    const f = new THREE.Group(); f.position.set(x,0,z); world.add(f);
    const st = new THREE.Mesh(new THREE.CylinderGeometry(.03,.03,.5,5), M.leaf); st.position.y=.25; f.add(st);
    sphere(f,.11, [M.pink,M.gold,M.white,M.red][i%4], 0,.55,0); }
  // plataformas
  const nPlat = 3 + (n%3);
  for(let i=0;i<nPlat;i++){
    const p = {x: (i%2? 6+R()*4 : -6-R()*4), y: 1.15+i*.75, z: -10-i*9-R()*3, w:4.5, d:4};
    platforms.push(p); box(world,p.w,.65,p.d,M.wood,p.x,p.y,p.z);
  }
  // bananas
  const totalB = 7 + Math.min(13, n);
  const spots=[];
  platforms.forEach(p=>spots.push([p.x, p.y+.95, p.z]));
  for(let i=0;i<totalB;i++){
    let x,z,y=1;
    if(i<spots.length && i%2===0){ [x,y,z]=spots[i]; }
    else { x=-30+R()*60; z=-70+R()*85; }
    const g = new THREE.Group(); g.position.set(x,y,z); world.add(g);
    const b = new THREE.Mesh(new THREE.TorusGeometry(.25,.09,8,18,Math.PI*1.55), M.gold);
    b.rotation.z=-.6; b.rotation.x=.35; b.castShadow=true; g.add(b);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,.16,6), M.trunk); stem.position.set(-.19,.17,0); g.add(stem);
    bananaObjs.push({g, baseY:y, taken:false});
  }
  S.bananasNeeded = Math.ceil(totalB*0.7); S.bananas = 0; S.bananasTotal = totalB;
  // rochas
  const nRocks = 3 + Math.floor(n/2);
  for(let i=0;i<nRocks;i++){
    const x=-28+R()*56, z=-66+R()*70;
    const o = new THREE.Mesh(new THREE.DodecahedronGeometry(.72,0), M.rock);
    o.position.set(x,.68,z); o.castShadow=true; o.receiveShadow=true; world.add(o);
    rockObjs.push({obj:o, alive:true});
  }
  // pontos para cavar (dig dig!)
  for(let i=0;i<2;i++){
    const x=-26+R()*52, z=-60+R()*65;
    const g = new THREE.Group(); g.position.set(x,0,z); world.add(g);
    const mound = sphere(g,.8,M.dirt,0,.1,0,.45);
    const x1 = box(g,1,.08,.18,M.wood,0,.5,0,false); x1.rotation.y=.7;
    const x2 = box(g,1,.08,.18,M.wood,0,.5,0,false); x2.rotation.y=-.7;
    digSpots.push({g, x, z, used:false});
  }
  // inimigos (bad guys diferentes por fase)
  const nE = Math.floor(n/3);
  for(let i=0;i<nE;i++){
    const tier = n>=11 && i%3===2 ? 3 : (n>=6 && i%2===1 ? 2 : 1);
    const g = new THREE.Group(); const x=-24+R()*48, z=-62+R()*60; g.position.set(x,0,z); world.add(g);
    const fur = tier===1?M.red:(tier===2?M.blue:M.purple);
    const kg = makeKong(g, fur, tier===3?1.25:.9);
    enemies.push({g, kg, home:new THREE.Vector3(x,0,z), phase:R()*6.28, speed: tier===2?3.4:2, range: 4+R()*3,
      hp: tier===3?2:1, alive:true, tier});
  }
  // jaula com a Baby Kong no fim da fase
  const cageX = -6 + R()*12, cageZ = -72;
  const cg = new THREE.Group(); cg.position.set(cageX,0,cageZ); world.add(cg);
  box(cg,5,.3,5,M.wood,0,.15,0);
  const baby = makeKong(cg, M.pink, .55, M.pink); baby.position.set(0,.3,.3);
  const door = new THREE.Group(); cg.add(door);
  for(let i=0;i<5;i++){ const bar = new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,3.4,8), M.cage);
    bar.position.set(-1.6+i*.8, 2, 2.4); bar.castShadow=true; door.add(bar); }
  const top = box(cg,4.4,.25,.3,M.cage,0,3.75,2.4,false);
  box(cg,.25,3.6,.25,M.cage,-2.2,1.95,2.4); box(cg,.25,3.6,.25,M.cage,2.2,1.95,2.4);
  box(cg,4.6,3.6,.18,M.cage,0,1.95,-2.4);
  solids.push({x:cageX-2.4,x2:cageX+2.4,z:cageZ-2.6,z2:cageZ-2.2,top:4,bottom:0});
  solids.push({x:cageX-2.4,x2:cageX-2.1,z:cageZ-2.4,z2:cageZ+2.6,top:4,bottom:0});
  solids.push({x:cageX+2.1,x2:cageX+2.4,z:cageZ-2.4,z2:cageZ+2.6,top:4,bottom:0});
  const doorSolid = {x:cageX-2.2,x2:cageX+2.2,z:cageZ+2.2,z2:cageZ+2.6,top:4,bottom:0};
  solids.push(doorSolid);
  cage = {g:cg, door, baby, x:cageX, z:cageZ, opened:false, doorSolid};
  // chefão
  const bcfg = BOSS_LEVELS[n];
  if(bcfg){
    const g = new THREE.Group(); g.position.set(cageX, 0, cageZ+9); world.add(g);
    const kg = makeKong(g, bcfg.fur, bcfg.scale);
    if(bcfg.queen){ const crown = new THREE.Mesh(new THREE.CylinderGeometry(.34,.4,.3,8), M.gold);
      crown.position.y = 2.15*1; crown.castShadow=true; kg.add(crown); }
    boss = {g, kg, hp:bcfg.hp, maxHp:bcfg.hp, name:bcfg.name, alive:true, cfg:bcfg, speed: bcfg.final?2.6:2.1, hitFlash:0};
    document.querySelector('#bossname').textContent = bcfg.name;
    document.querySelector('#bossbar').classList.remove('hidden');
    setTimeout(()=>say(bcfg.story+' Colete as bananas e lute!'), 600);
  } else {
    document.querySelector('#bossbar').classList.add('hidden');
  }
  // jogador
  if(!player){
    player = new THREE.Group(); scene.add(player);
    visual = new THREE.Group(); player.add(visual);
    kong = makeKong(visual, M.fur); kongArms = kong.userData.arms;
  }
  player.position.set(0,0,8); visual.rotation.y = 0; velocityY=0;
  refresh();
  banner('FASE '+n+(bcfg?' — CHEFÃO!':''), 2400);
  say('Colete '+S.bananasNeeded+' bananas para abrir a jaula da Baby Kong!');
}

// ============ PODERES E INTERAÇÕES ============
const keys = {};
addEventListener('keydown', e=>{
  keys[e.code]=true;
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
  if(S.mode!=='playing') return;
  if(e.code==='KeyE') smash();
  if(e.code==='KeyQ') lightning();
  if(e.code==='KeyR') heal();
  if(e.code==='KeyF') dig();
});
addEventListener('keyup', e=>keys[e.code]=false);
document.querySelectorAll('[data-key]').forEach(b=>{
  const k=b.dataset.key;
  b.addEventListener('pointerdown', e=>{ e.preventDefault(); keys[k]=true;
    if(S.mode==='playing'){ if(k==='KeyE')smash(); if(k==='KeyQ')lightning(); if(k==='KeyF')dig(); } });
  for(const ev of ['pointerup','pointerleave','pointercancel']) b.addEventListener(ev, ()=>keys[k]=false);
});
function cageReady(){ return S.bananas>=S.bananasNeeded && (!boss || !boss.alive); }
function distTo(o){ return o.position ? o.position.distanceTo(player.position) : Math.hypot(o.x-player.position.x, o.z-player.position.z); }
function smash(){
  if(S.smashCd>0) return; S.smashCd=.45;
  // jaula primeiro
  if(cage && !cage.opened && Math.hypot(player.position.x-cage.x, player.position.z-(cage.z+2.4))<3.6){
    if(cageReady()){ openCage(); return; }
    say('Jaula trancada! Colete '+S.bananasNeeded+' bananas'+(boss&&boss.alive?' e derrote o chefão':'')+'.');
    return;
  }
  let hit=false;
  for(const r of rockObjs){ if(r.alive && r.obj.position.distanceTo(player.position)<S.smashR){ r.alive=false; burst(r.obj.position,0xbec9ca,16); world.remove(r.obj); hit=true; } }
  for(const e of enemies){ if(e.alive && e.g.position.distanceTo(player.position)<S.smashR){ damageEnemy(e,1); hit=true; } }
  if(boss && boss.alive && boss.g.position.distanceTo(player.position)<S.smashR+1){ damageBoss(1); hit=true; }
  say(hit?'SMASH! 💥':'SMASH! Chegue mais perto.');
}
function lightning(){
  if(S.zapCd>0) return;
  let target=null, best=10;
  for(const e of enemies){ if(e.alive){ const d=e.g.position.distanceTo(player.position); if(d<best){best=d; target={o:e.g, dmg:()=>damageEnemy(e,2)};} } }
  if(boss && boss.alive){ const d=boss.g.position.distanceTo(player.position); if(d<best+1){ target={o:boss.g, dmg:()=>damageBoss(2)}; } }
  if(!target){ say('Raio sem alvo — chegue mais perto de um inimigo!'); return; }
  S.zapCd = S.zapCdMax;
  const from = player.position.clone().add(new THREE.Vector3(0,1.4,0));
  const to = target.o.position.clone().add(new THREE.Vector3(0,1.2,0));
  const len = from.distanceTo(to);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(.14,.14,len), M.glow);
  beam.position.copy(from).lerp(to,.5); beam.lookAt(to); scene.add(beam);
  setTimeout(()=>scene.remove(beam), 160);
  burst(to, 0x78dcff, 18); target.dmg();
  say('⚡ RAIO!');
}
function heal(){
  if(S.healCharges<=0){ say('Sem curas! Cave na terra (F) para achar mais.'); return; }
  if(S.hearts>=S.maxHearts){ say('Vida cheia!'); return; }
  S.healCharges--; S.hearts++; refresh(); burst(player.position.clone().add(new THREE.Vector3(0,1.4,0)), 0x7dff8a, 14);
  say('💚 Superpoder de cura! Vida '+S.hearts+'/'+S.maxHearts);
}
function dig(){
  for(const d of digSpots){
    if(!d.used && Math.hypot(player.position.x-d.x, player.position.z-d.z)<2.3){
      d.used=true; world.remove(d.g); burst(new THREE.Vector3(d.x,.8,d.z), 0xffca25, 16);
      const roll = Math.random();
      if(roll<.45){ S.bananas+=3; S.totalRun+=3; refresh(); say('🪙 Banana DOURADA achada cavando! +3 bananas'); checkBananaGoal(); }
      else if(roll<.72){ if(S.hearts<S.maxHearts){ S.hearts++; refresh(); say('❤️ Achou um coração enterrado!'); } else { S.healCharges++; refresh(); say('❤️ Vida cheia — ganhou +1 cura!'); } }
      else { S.healCharges++; refresh(); say('✨ A ESTRELA DA SELVA! Algo muito especial! +1 cura'); }
      return;
    }
  }
  say('Nada para cavar aqui. Procure os montinhos com X.');
}
function checkBananaGoal(){
  if(S.bananas===S.bananasNeeded && cage && !cage.opened){
    cage.door.children.forEach(b=>b.material=M.cageGold);
    say('Bananas suficientes! Vá até a jaula DOURADA e aperte E (SMASH)!'+(boss&&boss.alive?' Mas derrote o chefão antes!':''));
  }
}
function damageEnemy(e, dmg){
  e.hp-=dmg; e.g.scale.setScalar(1.25);
  setTimeout(()=>{ if(e.g) e.g.scale.setScalar(e.tier===3?1.12:1); }, 120);
  if(e.hp<=0){ e.alive=false; burst(e.g.position.clone().add(new THREE.Vector3(0,1,0)), 0xffab40, 18); world.remove(e.g); say('Bad guy derrotado! 🎉'); }
  else say('Acertou! Ele ainda aguenta mais um golpe.');
}
function damageBoss(dmg){
  if(!boss || !boss.alive) return;
  boss.hp-=dmg; boss.hitFlash=.15; refresh();
  if(boss.hp<=0) defeatBoss(); else say(boss.name+' ainda tem '+boss.hp+' de vida!');
}
function defeatBoss(){
  const wasFinal = boss.cfg.final;
  boss.alive=false; document.querySelector('#bossbar').classList.add('hidden');
  burst(boss.g.position.clone().add(new THREE.Vector3(0,2,0)), 0xffca25, 40);
  if(wasFinal){
    boss.g.traverse(m=>{ if(m.isMesh && m.material===boss.cfg.fur) m.material=M.gold; });
    banner('💛 B-KONG VIROU AMIGO! 💛', 2600);
    say('B-Kong: "Desculpe, JP Kong! Eu só queria brincar com vocês..."');
    setTimeout(()=>{ burst(boss.g.position.clone().add(new THREE.Vector3(0,2.4,0)), 0xff8fab, 24); openCage(); }, 1800);
  } else {
    world.remove(boss.g); boss=null;
    say('Chefão derrotado! 🎉 Agora abra a jaula!');
    if(cageReady()) checkBananaGoal();
  }
}
function openCage(){
  if(!cage || cage.opened) return;
  cage.opened=true; cage.opening=true;
  const idx = solids.indexOf(cage.doorSolid); if(idx>=0) solids.splice(idx,1);
  burst(new THREE.Vector3(cage.x,2,cage.z+2.4), 0xffca25, 26);
  say('🎉 Você libertou a Baby Kong desta fase!');
  setTimeout(()=>{ if(S.level>=20) winGame(); else showUpgrade(); }, 1500);
}
function damagePlayer(fromPos){
  if(S.invuln>0 || S.mode!=='playing') return;
  S.hearts--; S.invuln=1.2; refresh();
  const dir = player.position.clone().sub(fromPos); dir.y=0; dir.normalize();
  player.position.addScaledVector(dir, 1.6);
  burst(player.position.clone().add(new THREE.Vector3(0,1.2,0)), 0xff5252, 10);
  if(S.hearts<=0){ gameOver(); } else say('Ai! Cuidado! ❤️ '+S.hearts);
}
// ============ UPGRADES ============
const UPGRADES = [
  {ico:'❤️', t:'Coração Grande', d:'+1 coração máximo e vida cheia', f:()=>{ S.maxHearts=Math.min(5,S.maxHearts+1); S.hearts=S.maxHearts; }},
  {ico:'👟', t:'Tênis Veloz', d:'Correr 15% mais rápido', f:()=>{ S.speedMul*=1.15; }},
  {ico:'💪', t:'SMASH Poderoso', d:'O SMASH alcança mais longe', f:()=>{ S.smashR+=0.8; }},
  {ico:'⚡', t:'Raio Rápido', d:'O raio recarrega 25% mais rápido', f:()=>{ S.zapCdMax=Math.max(1.2, S.zapCdMax*.75); }},
  {ico:'💚', t:'Bolso de Curas', d:'+2 curas agora', f:()=>{ S.healCharges+=2; }},
  {ico:'🧲', t:'Ímã de Bananas', d:'Bananas são coletadas de mais longe', f:()=>{ S.magnet=true; }}
];
function showUpgrade(){
  S.mode='upgrade';
  const wrap = document.querySelector('#upgrade-cards'); wrap.innerHTML='';
  const picks = [...UPGRADES].sort(()=>Math.random()-.5).slice(0,3);
  for(const u of picks){
    const b = document.createElement('button'); b.className='upcard';
    b.innerHTML = '<span class="ico">'+u.ico+'</span><span class="t">'+u.t+'</span><span class="d">'+u.d+'</span>';
    b.addEventListener('click', ()=>{
      u.f(); document.querySelector('#upgrade-screen').classList.add('hidden');
      S.level++; buildLevel(S.level); S.mode='playing'; refresh();
    });
    wrap.appendChild(b);
  }
  document.querySelector('#upgrade-screen').classList.remove('hidden');
}
function resetRun(){
  Object.assign(S, {level:1, hearts:3, maxHearts:3, healCharges:2, totalRun:0, speedMul:1, smashR:3.1, zapCdMax:3, magnet:false, smashCd:0, zapCd:0, invuln:0});
}
function gameOver(){
  S.mode='over';
  document.querySelector('#end-title').textContent='Fim de jogo 😢';
  document.querySelector('#end-text').textContent='Os bad guys pegaram o JP Kong na fase '+S.level+'. A Baby Kong ainda precisa de você — tente de novo!';
  document.querySelector('#again-btn').textContent='TENTAR A FASE DE NOVO';
  document.querySelector('#end-screen').classList.remove('hidden');
}
function winGame(){
  S.mode='win';
  document.querySelector('#end-title').textContent='🎉 BABY KONG SALVA! 🎉';
  document.querySelector('#end-text').textContent='JP Kong atravessou as 20 fases, salvou sua irmãzinha Baby Kong e ainda fez amizade com o B-Kong! Total de bananas: '+S.totalRun+'. FIM — um jogo criado por Joshua & Papai ❤️';
  document.querySelector('#again-btn').textContent='JOGAR DE NOVO';
  document.querySelector('#end-screen').classList.remove('hidden');
}
document.querySelector('#again-btn').addEventListener('click', ()=>{
  document.querySelector('#end-screen').classList.add('hidden');
  if(S.mode==='win'){ resetRun(); } else { S.hearts=S.maxHearts; }
  buildLevel(S.level); S.mode='playing'; refresh();
});
document.querySelector('#play-btn').addEventListener('click', ()=>{
  const n = document.querySelector('#nickname').value.trim()||'JP Kong';
  document.querySelector('.brand').innerHTML='🍌 '+n.toUpperCase()+' <small>O RESGATE DA BABY KONG</small>';
  document.querySelector('#start-screen').classList.add('hidden');
  resetRun(); buildLevel(1); S.mode='playing'; canvas.focus();
});

// ============ LOOP PRINCIPAL ============
function collideXZ(x,z,feetY){
  for(const s of solids){ if(x>s.x-.35 && x<s.x2+.35 && z>s.z-.35 && z<s.z2+.35 && feetY<s.top+.02 && feetY>s.top-.8) return s; }
  return null;
}
const clock = new THREE.Clock();
function animate(){
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), .035);
  const t = performance.now();
  if(S.mode==='playing' || S.mode==='upgrade'){
    let ix=0, iz=0;
    if(S.mode==='playing'){
      if(keys.KeyA||keys.ArrowLeft)ix-=1; if(keys.KeyD||keys.ArrowRight)ix+=1;
      if(keys.KeyW||keys.ArrowUp)iz-=1; if(keys.KeyS||keys.ArrowDown)iz+=1;
    }
    const len = Math.hypot(ix,iz)||1; ix/=len; iz/=len;
    const speed = 7*S.speedMul;
    const nx = player.position.x + ix*speed*dt, nz = player.position.z + iz*speed*dt;
    if(!collideXZ(nx, player.position.z, player.position.y)) player.position.x = THREE.MathUtils.clamp(nx,-37,37);
    if(!collideXZ(player.position.x, nz, player.position.y)) player.position.z = THREE.MathUtils.clamp(nz,-80,23);
    if(keys.Space && onGround && S.mode==='playing'){ velocityY=8.5; onGround=false; }
    velocityY -= 22*dt; player.position.y += velocityY*dt;
    let floor = -.05;
    for(const p of platforms){ if(Math.abs(player.position.x-p.x)<p.w/2+.3 && Math.abs(player.position.z-p.z)<p.d/2+.3 && player.position.y<=p.y+.65 && player.position.y>=p.y-.45 && velocityY<=0) floor = Math.max(floor, p.y+.325); }
    if(player.position.y<=floor){ player.position.y=floor; velocityY=0; onGround=true; }
    if(ix||iz){ visual.rotation.y = Math.atan2(ix,iz); kong.position.y = .04*Math.sin(t*.015);
      kongArms[0].rotation.x = Math.sin(t*.016)*.75; kongArms[1].rotation.x = -Math.sin(t*.016)*.75; }
    else if(kongArms.length){ kongArms[0].rotation.x *= .88; kongArms[1].rotation.x *= .88; }
    for(const cl of cloudArr){ cl.position.x += cl.userData.speed*dt; if(cl.position.x>150) cl.position.x = -150; }
    if(S.smashCd>0)S.smashCd-=dt; if(S.zapCd>0)S.zapCd-=dt;
    if(S.invuln>0){ S.invuln-=dt; visual.visible = Math.floor(S.invuln*10)%2===0; if(S.invuln<=0) visual.visible=true; }
    // bananas
    const reach = S.magnet?2.3:1.25;
    for(const b of bananaObjs){
      if(b.taken) continue;
      b.g.rotation.y += dt*1.7; b.g.position.y = b.baseY + Math.sin(t*.002+b.baseY)*.12;
      if(b.g.position.distanceTo(player.position.clone().add(new THREE.Vector3(0,1,0)))<reach){
        b.taken=true; b.g.visible=false; S.bananas++; S.totalRun++; refresh();
        burst(b.g.position, 0xffca25, 6);
        if(S.bananas>=S.bananasNeeded) checkBananaGoal(); else say('Banana coletada! 🍌 '+S.bananas+'/'+S.bananasNeeded);
      }
    }
    // inimigos patrulhando
    for(const e of enemies){
      if(!e.alive) continue;
      e.g.position.x = e.home.x + Math.sin(t*.001*e.speed + e.phase)*e.range;
      e.g.position.z = e.home.z + Math.cos(t*.0007*e.speed + e.phase)*1.2;
      if(e.g.position.distanceTo(player.position)<1.15) damagePlayer(e.g.position);
    }
    // chefão persegue
    if(boss && boss.alive){
      const d = boss.g.position.distanceTo(player.position);
      if(d>2){ const dir = player.position.clone().sub(boss.g.position); dir.y=0; dir.normalize();
        boss.g.position.addScaledVector(dir, boss.speed*dt); boss.kg.rotation.y = Math.atan2(dir.x, dir.z); }
      boss.kg.position.y = boss.hitFlash>0 ? .1 : .05*Math.sin(t*.01);
      if(boss.hitFlash>0) boss.hitFlash-=dt;
      if(d<2.1) damagePlayer(boss.g.position);
    }
    if(boss && boss.friendly){ boss.kg.position.y = .25*Math.abs(Math.sin(t*.006)); }
    // jaula abrindo
    if(cage && cage.opening && cage.door.position.y<3.2){
      cage.door.position.y += dt*2.4;
      cage.baby.position.y = .3 + Math.abs(Math.sin(t*.008))*.55;
    }
    // efeitos
    for(let i=effectGroup.children.length-1;i>=0;i--){
      const o = effectGroup.children[i];
      o.position.addScaledVector(o.userData.v, dt*30); o.userData.life-=dt;
      if(o.userData.life<=0) effectGroup.remove(o);
    }
  }
  if(player){
    const target = new THREE.Vector3(player.position.x, player.position.y+1.2, player.position.z);
    const offset = new THREE.Vector3(0,4.3,8.6);
    camera.position.lerp(target.clone().add(offset), .09); camera.lookAt(target);
  }
  renderer.render(scene, camera);
}
buildLevel(1); S.mode='menu';
animate();
addEventListener('resize', ()=>{
  camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio,2));
});
