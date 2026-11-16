import * as THREE from '../vendor/three/three.module.min.js';
import { GLTFLoader } from '../vendor/three/GLTFLoader.js';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import { createRenderer3D, showRenderBackend, watchRendererContext, disposeRenderer3D } from './renderer3d.js';
import { loadModelAsset, renderModelStatus } from './model-asset.js';
import { createPandaState, pandaTCP, PANDA_RIG as R, PANDA_AXIS } from '../domain/panda.js';
import { WIRE_COLORS } from '../domain/panda-mission.js';
import { SCENE_COLORS } from './scene-theme.js';

const templates=new Map();
function pandaTemplate(name) {
  if (!templates.has(name)) {
    const url = new URL(`../../assets/models/panda/${name}.glb`, import.meta.url);
    const pending = new GLTFLoader().loadAsync(url.href)
      .catch(error => { if (templates.get(name) === pending) templates.delete(name); throw error; });
    templates.set(name, pending);
  }
  return templates.get(name);
}
async function loadPanda(view) {
  const quality=view.renderer.isWebGLRenderer?'detail':'compatible';
  const files = [`panda-${quality}`];
  if (view.maintenance) files.push('gripper-impact');
  const loads = files.map(pandaTemplate);
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      files.forEach((name, i) => { if (templates.get(name) === loads[i]) templates.delete(name); });
      reject(new Error('Panda 모델 로딩 시간 초과'));
    }, 8000);
  });
  const [source, impact] = await Promise.race([Promise.all(loads), timeout]).finally(() => clearTimeout(timer));
  if(view.disposed)return;
  const root=source.scene.clone(true);
  const joints=Array.from({length:7},(_,i)=>root.getObjectByName(`panda_link${i+1}`));
  const fingers=['left','right'].map(side=>root.getObjectByName(`panda_${side}finger`));
  if(joints.some(j=>!j)||fingers.some(f=>!f)||!root.getObjectByName('panda_link0'))throw new Error('Panda 관절 구조 누락');
  if (impact) {
    const linkVariant = (parent, healthyNames, damagedNames) => {
      const healthy = new THREE.Group(), damaged = new THREE.Group();
      healthy.userData.gripperCondition = 'healthy';
      damaged.userData.gripperCondition = 'damaged';
      for (const name of healthyNames) healthy.add(parent.getObjectByName(name));
      for (const name of damagedNames) damaged.add(impact.scene.getObjectByName(name).clone());
      damaged.visible = false;
      parent.add(healthy, damaged);
    };
    linkVariant(root.getObjectByName('panda_hand'), ['panda_hand_visual_1'], ['impact_shell', 'impact_fracture']);
    linkVariant(fingers[0], ['panda_leftfinger_visual_0', 'panda_leftfinger_visual_1'], ['impact_jaw', 'impact_pad', 'impact_pad_tear']);
  }
  const geometries=new Map(),materials=new Map();
  root.traverse(o=>{
    if(!o.isMesh)return;
    if(!geometries.has(o.geometry))geometries.set(o.geometry,o.geometry.clone());
    o.geometry=geometries.get(o.geometry);
    if(!materials.has(o.material)) {
      const material=view.renderer.isWebGLRenderer?o.material.clone():new THREE.MeshLambertMaterial({color:o.material.color});
      material.side=THREE.DoubleSide;materials.set(o.material,material);
    }
    o.material=materials.get(o.material);
  });
  geometries.forEach(g=>view.geometries.add(g));materials.forEach(m=>view.materials.add(m));
  view.joints=joints.map(node=>({node,origin:node.quaternion.clone()}));view.fingers=fingers;
  view.body.add(root);view.buildServiceParts(root);view.canvas.dataset.modelSource='franka-panda';view.canvas.dataset.modelQuality=quality;
  view.canvas.dataset.modelLinks='11';
}

export class PandaViewport {
  constructor({compatible=false,maintenance=false,onUnavailable,onReady}={}) {
    this.maintenance=maintenance;this.onReady=onReady;this.renderer=createRenderer3D({compatible});this.canvas=this.renderer.domElement;
    this.canvas.classList.add('panda-3d-canvas');this.canvas.tabIndex=0;
    this.canvas.setAttribute('role','img');this.canvas.setAttribute('aria-label','Franka Panda 로봇팔 3D 작업대. 끌기 또는 방향키로 시점을 회전합니다.');
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color(SCENE_COLORS.background);
    this.camera=new THREE.PerspectiveCamera(38,1,.01,30);this.camera.position.set(1.3,1.1,1.4);
    this.controls=new OrbitControls(this.camera,this.canvas);this.controls.target.set(.22,.35,0);
    this.controls.enablePan=false;this.controls.minDistance=1.3;this.controls.maxDistance=4;
    this.controls.minPolarAngle=.15;this.controls.maxPolarAngle=Math.PI*.48;
    this.controls.addEventListener('change',()=>this.draw());
    const svg=!this.renderer.isWebGLRenderer;
    this.scene.add(new THREE.AmbientLight('#dcecff',svg?.7:1.5));
    const key=new THREE.DirectionalLight('#ffffff',svg?.65:2.8);key.position.set(2,4,1);this.scene.add(key);
    const fill=new THREE.DirectionalLight('#9dcfe5',svg?.3:1.5);fill.position.set(-2,2,-3);this.scene.add(fill);
    this.geometries=new Set();this.materials=new Set();
    this.body=new THREE.Group();this.body.rotation.x=-Math.PI/2;this.scene.add(this.body);
    this.stage=new THREE.Group();this.scene.add(this.stage);this.buildStage();this.buildGameStage();
    this.state=createPandaState();this.ui={previewMode:false};
    this.controls.update();
    this.observer=new ResizeObserver(()=>this.resize());
    this.releaseContextWatch=watchRendererContext(this,onUnavailable);
    this.canvas.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
      event.preventDefault();
      const s=new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(this.controls.target));
      if(event.key==='ArrowLeft')s.theta-=.15;if(event.key==='ArrowRight')s.theta+=.15;
      if(event.key==='ArrowUp')s.phi-=.1;if(event.key==='ArrowDown')s.phi+=.1;
      s.phi=THREE.MathUtils.clamp(s.phi,.15,Math.PI*.48);
      this.camera.position.copy(this.controls.target).add(new THREE.Vector3().setFromSpherical(s));this.controls.update();
    });
    this.raycaster=new THREE.Raycaster();
    this.canvas.addEventListener('pointerdown',event=>{this.pointerStart={x:event.clientX,y:event.clientY};});
    this.canvas.addEventListener('pointerup',event=>{
      const start=this.pointerStart;this.pointerStart=null;
      if(!start||Math.hypot(event.clientX-start.x,event.clientY-start.y)>6||!this.state.game||this.state.mission.phase!=='choose'||this.state.motion||this.state.estop||this.lastReady!==true)return;
      const rect=this.canvas.getBoundingClientRect();this.raycaster.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2),this.camera);
      const hit=this.raycaster.intersectObjects(this.wireHitMeshes,false).find(h=>h.object.visible);
      if(hit)this.host.dispatchEvent(new CustomEvent('panda-wire',{bubbles:true,detail:{id:hit.object.userData.wireId}}));
    });
    loadModelAsset(this,loadPanda);
  }
  material(color,metalness=.1) {
    const m=this.renderer.isWebGLRenderer?new THREE.MeshStandardMaterial({color,metalness,roughness:.45}):new THREE.MeshLambertMaterial({color});
    this.materials.add(m);return m;
  }
  mesh(geometry,material,parent=this.stage) {
    this.geometries.add(geometry);const mesh=new THREE.Mesh(geometry,material);parent.add(mesh);return mesh;
  }
  buildStage() {
    const svg=!this.renderer.isWebGLRenderer;
    const top=this.mesh(new THREE.BoxGeometry(1.45,.06,1.2,12,1,10),this.material('#203240'));
    if(svg)top.renderOrder=-10;
    top.position.set(.25,-.034,0);
    const grid=new THREE.GridHelper(1.4,20,SCENE_COLORS.gridMajor,SCENE_COLORS.gridMinor);
    if(svg){grid.material.color.set(SCENE_COLORS.gridMinor);grid.renderOrder=-9;}
    grid.position.set(.25,-.002,0);this.stage.add(grid);this.geometries.add(grid.geometry);this.materials.add(grid.material);
    const mount=this.mesh(new THREE.CylinderGeometry(.13,.16,.045,24),this.material('#12222d',.5));mount.position.y=-.02;
    this.stationParts=[];
    for(const [position,color] of [[R.source,'#419bc9'],[R.target,'#efa65a']]) {
      const pad=this.mesh(new THREE.BoxGeometry(.16,.006,.16),this.material(color));pad.position.set(position[0],-.001,-position[1]);
      const rim=this.mesh(new THREE.TorusGeometry(.105,.004,4,36),this.material(color));rim.rotation.x=Math.PI/2;rim.position.set(position[0],.004,-position[1]);
      this.stationParts.push(pad,rim);
      // These flat stations are below all moving geometry. SVG has no depth buffer.
      if(svg){pad.renderOrder=-8;rim.renderOrder=-7;}
    }
    this.cube=this.mesh(new THREE.BoxGeometry(.05,.05,.05),this.material('#52cce1',.3));
    const stripe=this.mesh(new THREE.BoxGeometry(.052,.008,.052),this.material('#b8eef1'),this.cube);
    stripe.position.y=.012;
  }
  buildGameStage() {
    this.gameStage=new THREE.Group();this.stage.add(this.gameStage);this.wires={};this.wireHitMeshes=[];
    // Abstract game console: no real device wiring or explosive components.
    const base=this.mesh(new THREE.BoxGeometry(.32,.018,.30),this.material('#15212f',.6),this.gameStage);base.position.set(.45,.008,.22);
    const face=this.mesh(new THREE.BoxGeometry(.29,.006,.27),this.material('#d8e2e8'),this.gameStage);face.position.set(.45,.020,.22);
    const frame=this.mesh(new THREE.BoxGeometry(.26,.015,.035),this.material('#274350'),this.gameStage);frame.position.set(.45,.031,.095);
    this.gameLamp=this.mesh(new THREE.BoxGeometry(.19,.004,.013),this.material('#5bd5e2'),this.gameStage);this.gameLamp.position.set(.45,.041,.095);
    for(const [index,w] of WIRE_COLORS.entries()){
      const z=.14+index*.08,material=this.material(w.color,.25),group=new THREE.Group();this.gameStage.add(group);
      const curve=(from,to)=>new THREE.CatmullRomCurve3([new THREE.Vector3(from,.028,z),new THREE.Vector3((from+to)/2,.034,z+.006),new THREE.Vector3(to,.028,z)]);
      const whole=this.mesh(new THREE.TubeGeometry(curve(.33,.57),16,.006,6,false),material,group);
      const left=this.mesh(new THREE.TubeGeometry(curve(.33,.438),10,.006,6,false),material,group);
      const right=this.mesh(new THREE.TubeGeometry(curve(.462,.57),10,.006,6,false),material,group);
      const hit=this.mesh(new THREE.BoxGeometry(.25,.025,.035),new THREE.MeshBasicMaterial({visible:false}),group);
      this.materials.add(hit.material);hit.position.set(.45,.035,z);hit.userData.wireId=w.id;this.wireHitMeshes.push(hit);
      this.wires[w.id]={whole,left,right};
      for(const x of [.32,.58]){const cap=this.mesh(new THREE.BoxGeometry(.018,.012,.022),this.material('#73838e',.6),group);cap.position.set(x,.028,z);}
    }
    this.gameStage.visible=false;
  }
  buildServiceParts(root){
    this.service=new THREE.Group();root.add(this.service);
    const plate=this.mesh(new THREE.BoxGeometry(.07,.065,.012),this.material('#3e6379'),this.service);plate.position.set(.11,.04,.035);
    this.bolt=this.mesh(new THREE.CylinderGeometry(.016,.016,.013,6),this.material('#ebba72',.7),this.service);this.bolt.rotation.x=Math.PI/2;this.bolt.position.set(.11,.04,.048);
    this.driver=new THREE.Group();this.driver.position.set(.11,.04,.07);this.service.add(this.driver);
    const shaft=this.mesh(new THREE.CylinderGeometry(.004,.004,.06,8),this.material('#d2e1eb',.8),this.driver);shaft.rotation.x=Math.PI/2;shaft.position.z=.03;
    const grip=this.mesh(new THREE.BoxGeometry(.022,.032,.06),this.material('#4ddaca'),this.driver);grip.position.z=.09;
    this.dust=new THREE.Group();root.getObjectByName('panda_hand').add(this.dust);
    for(const [x,y,z] of [[.02,.025,.065],[-.018,-.02,.075],[.015,-.03,.09]]){const d=this.mesh(new THREE.SphereGeometry(.008,6,4),this.material('#e3b278'),this.dust);d.position.set(x,y,z);}
    this.cleanPad=this.mesh(new THREE.BoxGeometry(.055,.015,.035),this.material('#50d8d0'),root.getObjectByName('panda_hand'));this.cleanPad.position.set(.02,.04,.075);
    this.service.visible=this.dust.visible=this.cleanPad.visible=false;
  }
  updateMissionLabels(){
    if(!this.labels)return;
    this.labels.hidden=!this.state.game||this.ui.previewMode;
    if(this.labels.hidden)return;
    this.camera.updateMatrixWorld();
    [...this.labels.children].forEach((label,i)=>{
      const p=new THREE.Vector3(.62,.045,.14+i*.08).project(this.camera);
      label.style.left=`${(p.x+1)*50}%`;label.style.top=`${(1-p.y)*50}%`;
      label.hidden=p.z< -1||p.z>1||Math.abs(p.x)>1||Math.abs(p.y)>1;
    });
  }
  attach(host) {
    if(this.host!==host){
      this.observer.disconnect();this.host=host;host.replaceChildren(this.canvas);showRenderBackend(host,this.canvas);this.observer.observe(host);
      this.labels=document.createElement('div');this.labels.className='panda-scene-labels';this.labels.setAttribute('aria-hidden','true');
      this.labels.innerHTML=WIRE_COLORS.map(w=>`<span>${w.symbol}<small> ${w.label}</small></span>`).join('');host.append(this.labels);
    }
    this.resize();
  }
  resize() {
    if(!this.host||this.disposed)return;
    const w=Math.max(1,this.host.clientWidth),h=Math.max(1,this.host.clientHeight);
    this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.draw();
  }
  sync(state,ui={}) {
    if (ui.manualControl && state.mission.phase==='choose' && this.state.mission?.phase!=='choose') {
      this.controls.minDistance=.6;
      this.controls.target.set(.30,.28,.14);
      this.camera.position.set(1.55,.90,.66);
      this.controls.update();
    }
    this.state=state;this.ui=ui;this.stage.visible=!ui.previewMode;
    const game=state.game&&!ui.previewMode;
    this.gameStage.visible=!!game;this.cube.visible=!game&&!state.gripper;
    this.stationParts.forEach(o=>o.visible=!game&&!state.gripper);
    if(game){
      for(const [id,parts] of Object.entries(this.wires)){const cut=state.game.cut===id;parts.whole.visible=!cut;parts.left.visible=parts.right.visible=cut;}
      this.gameLamp.material.color.set(state.game.cut?'#50d5a1':state.mission.phase==='failed'?'#ed6870':'#5bd5e2');
      this.canvas.dataset.selectedWire=state.game.selected||'';this.canvas.dataset.cutWire=state.game.cut||'';
      if (ui.manualControl && this.labels) {
        Array.from(this.labels.children).forEach((label,i) => {
          label.toggleAttribute('data-aligned', state.mission.phase==='choose' && !state.motion && state.game.selected===WIRE_COLORS[i].id);
        });
      }
    }
    if(this.service){
      this.service.visible=!!game&&!state.standalone;this.dust.visible=!!game&&!state.standalone&&!state.maintenance.clean;
      const motion=state.motion,clean=game&&motion?.kind==='clean',tighten=game&&motion?.kind==='tighten';
      this.cleanPad.visible=!!clean;this.driver.visible=!!tighten;
      if(clean){this.cleanPad.position.y=.025+Math.sin(motion.elapsed*9)*.03;this.cleanPad.position.z=.07+Math.cos(motion.elapsed*9)*.02;}
      if(tighten){const t=motion.elapsed/motion.duration;this.driver.position.z=.065+.07*Math.max(0,1-t*5);this.driver.rotation.z=-Math.PI*4*Math.max(0,(t-.2)/.8);}
      this.bolt.material.color.set(game&&state.maintenance.tightened?'#50d5a1':'#ebba72');
    }
    if(this.canvas.dataset.modelStatus==='ready') {
      this.joints?.forEach(({node,origin},i)=>node.quaternion.copy(origin).multiply(new THREE.Quaternion().setFromAxisAngle(PANDA_AXIS,state.joints[i])));
      this.fingers?.forEach((node,i)=>node.position.y=(i?-1:1)*state.opening);
      this.cube.position.set(state.object[0],state.object[2],-state.object[1]);
      this.canvas.dataset.pandaStep=String(state.step);this.canvas.dataset.holding=String(state.holding);
      this.canvas.dataset.tcp=pandaTCP(state.joints).join(',');
      this.canvas.dataset.objectPosition=state.object.join(',');
    }
    this.draw();
  }
  draw() {
    if(this.disposed||!this.host)return;
    this.gripperMaintenance?.workshop.update();
    const ready=renderModelStatus(this,'Franka Panda','panda-model-status',loadPanda);
    if(this.lastReady!==ready){this.lastReady=ready;this.onReady?.(ready);}
    if(!this.frame)this.frame=requestAnimationFrame(()=>{
      this.frame=null;if(!this.disposed){this.updateMissionLabels();this.renderer.render(this.scene,this.camera);}
    });
  }
  dispose() {
    if(this.disposed)return;
    this.disposed=true;this.gripperMaintenance?.dispose();this.releaseContextWatch?.();cancelAnimationFrame(this.frame);this.observer.disconnect();this.controls.dispose();
    disposeRenderer3D(this.renderer);this.geometries.forEach(g=>g.dispose());this.materials.forEach(m=>m.dispose());
    this.canvas.remove();
  }
}
