import * as THREE from '../vendor/three/three.module.min.js';
import { Workshop3D } from './workshop3d.js';
import { pandaMaintenanceGuide, pandaMaintenanceTransition } from '../domain/panda-maintenance.js';
const point=(o,x=0,y=0,z=0)=>()=>o.localToWorld(new THREE.Vector3(x,y,z));
function setGripperCondition(unit, damaged) {
 const condition = damaged ? 'damaged' : 'healthy';
 unit.traverse(node => {
  if (node.userData.gripperCondition) node.visible = node.userData.gripperCondition === condition;
 });
}
export class PandaGripperService{
 constructor(view){
  this.view=view;this.hand=view.fingers[0].parent;this.unit=new THREE.Group();this.unit.name='service-gripper-unit';
  const original=this.hand.children.filter(o=>o.name.startsWith('panda_')||o.userData.gripperCondition);this.hand.add(this.unit);original.forEach(o=>this.unit.add(o));
  // Seat the educational fasteners on the actual imported gripper housing.
  const mesh=(geo,color,parent,p)=>{const m=view.mesh(geo,view.material(color,.4),parent);if(p)m.position.set(...p);return m;};
  this.mount=mesh(new THREE.CylinderGeometry(.043,.043,.012,24),'#354d60',this.hand,[0,0,-.006]);this.mount.rotation.x=Math.PI/2;
  this.bolts=[-.04,.04].map(y=>{const g=new THREE.Group();this.hand.add(g);g.position.set(.034,y,.025);g.rotation.z=-Math.PI/2;mesh(new THREE.CylinderGeometry(.006,.006,.005,12),'#cad3da',g);mesh(new THREE.CylinderGeometry(.0025,.0025,.001,6),'#182a36',g,[0,.003,0]);return g;});
  this.connector=new THREE.Group();this.hand.add(this.connector);this.connector.position.set(.045,.123,.025);mesh(new THREE.BoxGeometry(.02,.025,.025),'#222e38',this.connector);mesh(new THREE.BoxGeometry(.014,.005,.022),'#e2ab65',this.connector,[0,-.014,0]);
  this.port=mesh(new THREE.BoxGeometry(.023,.025,.029),'#8194a3',this.hand,[.032,.11,.025]);
  this.controls=new THREE.Group();view.body.add(this.controls);
  this.stop=mesh(new THREE.CylinderGeometry(.019,.019,.014,20),'#dc645c',this.controls,[-.085,-.08,.07]);this.stop.rotation.x=Math.PI/2;
  this.power=mesh(new THREE.CylinderGeometry(.015,.015,.01,20),'#5ad6c1',this.controls,[.085,-.08,.07]);this.power.rotation.x=Math.PI/2;
  this.workshop=new Workshop3D(view);view.gripperMaintenance=this;
 }
 spare(damaged=false){
  const spare=this.unit.clone(true);spare.position.set(0,0,0);spare.quaternion.identity();spare.scale.setScalar(6);
  setGripperCondition(spare,damaged);
  spare.visible=true;return spare;
 }
 focus(){
  this.hand.updateWorldMatrix(true,true);const target=this.hand.localToWorld(new THREE.Vector3(0,0,.05));
  const direction=new THREE.Vector3(1,.5,.55).transformDirection(this.hand.matrixWorld);
  const distance=Math.max(.72,.36/Math.max(.4,this.view.camera.aspect));
  const camera=this.view.camera;camera.position.copy(target).addScaledVector(direction,distance);camera.lookAt(target);
  const right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion),up=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion);
  // Leave room for the common task card above and the parts tray below.
  target.addScaledVector(right,camera.aspect>1?-distance*.05:0).addScaledVector(up,distance*(camera.aspect>1?.07:.14));
  this.view.controls.minDistance=.25;this.view.controls.maxDistance=4;this.view.controls.target.copy(target);camera.position.copy(target).addScaledVector(direction,distance);this.view.controls.update();this.view.draw();
 }
 overview(){this.view.controls.minDistance=.25;this.view.controls.target.set(.22,.35,0);this.view.camera.position.set(1.3,1.1,1.4);this.view.controls.update();this.view.draw();}
 sync(s,rebind=true){
  const g=s.gripper;this.unit.visible=g.present;setGripperCondition(this.unit,g.source==='original');
  this.connector.position.x=g.connected?.045:.073;
  this.bolts.forEach((b,i)=>b.visible=g.present&&(g.source==='new'||g.bolts[i]));
  this.stop.material.color.set(s.estop?'#dc645c':'#7b4442');this.power.material.color.set(s.power?'#5ad6c1':'#526a77');
  if(!rebind){this.workshop.update();return;}
  const w=this.workshop,id=pandaMaintenanceGuide(s).current.id;
  w.reset(s.status==='active'&&!s.testing,(piece,target)=>{const next=pandaMaintenanceTransition(s,{type:'PLACE',piece,target});return next.revision>s.revision&&next.events.at(-1)?.type==='action';});
  if(!w.active)return;
  w.bench.visible=g.verdict==='replace';
  w.bind('panda-stop',this.stop,{action:{command:'STOP'},label:s.estop?'비상 정지 해제':'비상 정지 누르기',caption:'비상 정지',radius:.035,current:['stop','test-release','final-stop'].includes(id)});
  w.bind('panda-power',this.power,{action:{command:'POWER'},label:s.power?'주 전원 끄기':'주 전원 켜기',caption:'주 전원',radius:.03,current:['power-off','test-power','final-power'].includes(id)});
  w.bind('panda-gripper',this.unit,{action:{command:'INSPECT'},piece:g.present&&g.source==='original'&&g.verdict==='replace'?{kind:'panda-mounted-gripper'}:null,drop:{kind:'panda-gripper-slot'},label:g.present?'그리퍼 · 클릭해 관찰 / 손상 부품 분리':'새 그리퍼 장착부',anchor:point(this.hand,0,0,.06),radius:.045,current:['inspect','remove','install'].includes(id),pullAxis:()=>new THREE.Vector3(0,0,1).transformDirection(this.hand.matrixWorld),seat:()=>({position:this.unit.getWorldPosition(new THREE.Vector3()),quaternion:this.unit.getWorldQuaternion(new THREE.Quaternion()),scale:this.unit.getWorldScale(new THREE.Vector3())})});
  if(g.verdict==='replace'){
   w.bind('panda-connector',this.connector,{action:{command:'CONNECTOR'},label:g.connected?'그리퍼 커넥터 분리':'그리퍼 커넥터 연결',anchor:point(this.connector),radius:.016,priority:['disconnect','connect'].includes(id)?10:5,current:['disconnect','connect'].includes(id)});
   for(const i of [0,1])if(g.present&&(g.bolts[i]||g.source==='new'))w.bind(`panda-bolt-${i}`,this.bolts[i],{drop:{kind:'panda-bolt',index:i},label:`${i+1}번 고정 볼트 · 육각 공구로 ${g.source==='new'?'체결':'분리'}`,anchor:point(this.bolts[i]),turn:this.bolts[i],toolAxis:()=>new THREE.Vector3(1,0,0).transformDirection(this.hand.matrixWorld),radius:.012,priority:id===`unbolt-${i}`||id===`fasten-${i}`?10:6,current:id===`unbolt-${i}`||id===`fasten-${i}`});
   w.stock('panda-driver','driver',-2.8,{piece:{kind:'panda-driver'},label:'육각 공구',current:id.includes('bolt')||id.includes('fasten')});
   if(g.spare)w.stock('panda-spare','module',-.8,{model:this.spare(),piece:{kind:'panda-gripper',moduleId:s.moduleId},label:`새 그리퍼 ${s.moduleId}`,current:id==='install'});
   const tray=w.stock('panda-discard','tray',2.5,{drop:{kind:'panda-discard'},label:'분리 부품 수거함'});
   if(s.discarded.includes('gripper')){const old=this.spare(true);old.scale.setScalar(3);old.position.set(0,.18,0);tray.object.add(old);}
   for(const i of [0,1])if(s.discarded.includes(`bolt-${i}`)){const b=w.art('screw');b.scale.setScalar(.45);b.position.set(i===0?-.4:.4,.12,.3);tray.object.add(b);}
  }
  w.update();
 }
 dispose(){this.workshop.dispose();if(this.view.gripperMaintenance===this)delete this.view.gripperMaintenance;}
}
