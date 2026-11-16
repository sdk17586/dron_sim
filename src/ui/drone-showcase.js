import * as THREE from '../vendor/three/three.module.min.js';
import { Showcase } from './showcase.js';
import { DroneViewport } from './drone3d.js';
import { CameraTravel } from './presentation3d.js';
import { createShowcaseDrone, droneShowcasePlan, applyDroneShowcaseAction } from '../domain/drone-showcase.js';
import { transition, readyForMaintenance, physicalIssues, KITS } from '../domain/state.js';
import { placePart } from '../domain/placement.js';
import { maintenanceGuide } from '../domain/learning-guide.js';
import { SCENARIO } from '../content/scenarios.js';
import { PROFILE } from '../content/aircraft-profiles.js';
import { escapeHTML as e } from './shared.js';

// Reuse the presentation clock, interruption handling and controls with drone actions.
export class DroneShowcase extends Showcase {
  constructor(root,options={}) {
    super(root,{...options,plan:droneShowcasePlan,createView:settings=>{
      const view=new DroneViewport({...settings,onSelect(){}});
      view.travel=new CameraTravel(view);
      return view;
    }});
    this.kitChange=event=>{
      if(!event.target.matches('[data-showcase-kit]'))return;
      event.stopPropagation();this.ui.kitId=event.target.value;this.sync();this.updateManual();
    };
    root.addEventListener('change',this.kitChange);
  }
  restart() {
    this.view.workshop?.cancel();this.view.travel.cancel();
    this.attempt++;this.notice.update(null);this.completed=false;this.revealing=false;this.manual=false;
    this.running=true;this.index=0;this.status='ready';this.elapsed=0;
    this.root.querySelector('.showcase-manual-actions').innerHTML='';
    this.root.querySelector('progress').value=0;
    this.root.querySelector('.showcase-scan').hidden=true;
    delete this.root.dataset.showcaseError;
    this.state=createShowcaseDrone();
    this.ui={immersiveMode:true,presentationMode:true,selected:SCENARIO.target,zoomed:false,kitId:'A1',topView:false,exploded:false};
    this.view.cameraKey='';this.sync();this.updateControls();
  }
  handleCommand(action) {
    if(action==='overview'){this.ui.zoomed=false;this.sync();}
    else if(action==='healthy' || action==='replace')this.commit({type:'ANSWER_DAMAGE',motorId:this.ui.selected,answer:action});
    else if(action.startsWith('check-'))this.commit({type:'CONFIRM_CHECK',check:action.slice(6)});
    else if(action==='complete')this.commit({type:'FINAL_INSPECTION'});
    else super.handleCommand(action);
  }
  handleAction(detail) {
    if(detail.action==='select-motor'){this.inspect(detail.motor);return;}
    const type={power:'TOGGLE_POWER','confirm-power':'CONFIRM_POWER'}[detail.action];
    if(type)this.commit({type});
  }
  acceptPlacement({piece,target}) { this.accept(placePart(this.state,piece,target)); }
  accept(next) {
    if(this.manual && next.feedback.kind!=='success'){
      this.state=next.state;this.sync();this.updateManual();
      this.root.querySelector('[data-showcase-detail]').textContent=next.feedback.message;return;
    }
    super.accept(next);
  }
  commit(action) {
    const next=transition(this.state,action);
    if(action.type==='ANSWER_DAMAGE' && next.feedback.kind==='success'){
      const pending=PROFILE.motors.find(p=>!next.state.motors[p.id].verdict);
      this.ui.selected=pending?.id || SCENARIO.target;this.ui.zoomed=true;
      if(pending && !next.state.motors[pending.id].inspected && readyForMaintenance(next.state)){
        next.state=applyDroneShowcaseAction(next.state,{type:'INSPECT_MOTOR',motorId:pending.id});
      }
    }
    this.accept(next);
  }
  inspect(id) {
    this.ui.selected=id;this.ui.zoomed=true;
    if(!this.state.motors[id].inspected && readyForMaintenance(this.state)){
      this.state=applyDroneShowcaseAction(this.state,{type:'INSPECT_MOTOR',motorId:id});
    }
    this.sync();if(this.manual)this.updateManual();
  }
  sync() {
    const before=this.view.cameraKey,from=this.view.camera.position.clone(),look=this.view.controls.target.clone();
    this.view.sync(this.state,this.ui);
    if(before && before!==this.view.cameraKey && this.ui.presentationMode){
      const to=this.view.camera.position.clone(),target=this.view.controls.target.clone();
      this.view.camera.position.copy(from);this.view.controls.target.copy(look);
      this.view.travel.move(target,to,850);
    }
    const fault=this.state.motors[SCENARIO.target];
    const replaced=fault.blades.every(b=>b.present && b.source==='new') && fault.screws.every(s=>s.present && s.source==='new' && s.secured);
    const changed=[...fault.blades,...fault.screws].some(p=>!p.present || p.source==='new');
    const count=fault.blades.filter(b=>b.present && b.source==='new').length;
    const secured=fault.screws.filter(s=>s.present && s.source==='new' && s.secured).length;
    this.root.dataset.repaired=String(replaced);
    this.root.dataset.blades=this.view.canvas.dataset.blades;this.root.dataset.screws=this.view.canvas.dataset.screws;
    this.root.dataset.battery=String(this.state.battery);
    this.root.dataset.power=String(this.state.power);
    this.root.dataset.checks=String(Object.values(this.state.checks).filter(Boolean).length);
    this.root.querySelector('[data-health]').textContent=replaced?'정상 4 / 4':fault.inspected?'손상 1곳 발견':'점검 전';
    this.root.querySelector('[data-module]').textContent=replaced?'교체·체결 완료':changed?`날개 ${count}/2 · 체결 ${secured}/2`:'대기';
    this.root.querySelector('[data-motion]').textContent=this.state.status==='completed'?'정비 완료':`${Object.values(this.state.checks).filter(Boolean).length} / 3 확인`;
  }
  execute() {
    const step=this.steps[this.index],op=step.operation;
    this.root.dataset.showcaseStep=String(this.index);this.root.dataset.showcaseStage=String(step.stage);
    this.status='operation';this.setNarrative(step.stage,step.title,step.detail);
    this.root.querySelector('.showcase-scan').hidden=step.stage!==2;
    this.root.querySelector('progress').value=this.index/this.steps.length*100;
    this.root.querySelector('[data-showcase-progress]').textContent=`${this.index+1} / ${this.steps.length} 장면`;
    try {
      if(step.stage===4)this.ui.zoomed=false;
      if(op.type==='place'){
        const w=this.view.workshop,from=w.entries.find(entry=>entry.id===op.from),to=w.entries.find(entry=>entry.id===op.to);
        if(!from || !to)throw new Error('시연 부품을 준비하지 못했습니다. 처음부터 다시 실행해 주세요.');
        w.pick(from);w.place(to);return;
      }
      if(op.type==='action')this.state=applyDroneShowcaseAction(this.state,op.action);
      else if(op.type==='inspect' || op.type==='focus')this.inspect(op.motorId);
      else if(op.type==='overview'){
        this.view.workshop.bench.visible=false;this.view.workshop.layer.hidden=true;
        this.view.travel.move(new THREE.Vector3(0,2.7,0),new THREE.Vector3(-8,9,-11),3500);
      }else if(op.type==='closing'){
        this.sync();this.view.workshop?.detach();
        this.view.travel.move(new THREE.Vector3(0,2.7,0),new THREE.Vector3(8,8,-11),2200);
      }
      if(!['overview','closing'].includes(op.type))this.sync();
      this.status='hold';this.hold=step.hold;
    }catch(error){this.showError(error.message);}
  }
  updateCallout() {
    const node=this.root.querySelector('.showcase-callout'),fault=this.state.motors[SCENARIO.target];
    const healthy=fault.blades.every(b=>b.present && b.source==='new');
    const visible=!this.completed && fault.inspected && this.ui.zoomed && this.ui.selected===SCENARIO.target;
    node.hidden=!visible;if(!visible)return;
    const p=this.view.motors.get(SCENARIO.target).group.getWorldPosition(new THREE.Vector3()).project(this.view.camera);
    node.style.left=`${Math.min(76,Math.max(24,(p.x+1)*50))}%`;
    node.style.top=`${Math.min(67,Math.max(34,(1-p.y)*50-12))}%`;
    node.dataset.healthy=String(healthy);
    node.querySelector('[data-callout-label]').textContent=healthy?'REPLACED':'FAULT FOUND';
    node.querySelector('[data-callout-title]').textContent=healthy?'새 날개 쌍 장착':'01번 모터 · 날개 끝 손상';
  }
  updateManual() {
    let guide=maintenanceGuide(this.state,this.ui),task=guide.current;
    if(guide.complete){this.finish();return;}
    if(task.motorId && this.ui.selected!==task.motorId && readyForMaintenance(this.state)){
      this.ui.selected=task.motorId;this.ui.zoomed=true;this.sync();
      guide=maintenanceGuide(this.state,this.ui);task=guide.current;
    }
    const stage=!readyForMaintenance(this.state)?1:!Object.values(this.state.motors).every(m=>m.inspected && m.verdict)?2:physicalIssues(this.state).length?3:4;
    this.setNarrative(stage,task.title,task.detail);
    this.root.querySelector('.showcase-scan').hidden=true;
    let buttons='';
    if(task.target.kind==='motor'){
      const motor=this.state.motors[this.ui.selected];
      if(motor.inspected && !motor.verdict)buttons='<button data-showcase="healthy">정상</button><button data-showcase="replace">교체 필요</button>';
    }else if(task.target.kind==='check')buttons=`<button data-showcase="check-${task.target.check}">${e(task.title)}</button>`;
    else if(task.id==='finish')buttons='<button data-showcase="complete">정비 완료</button>';
    if(stage===3)buttons=`<label class="showcase-kit">새 부품 포장<select data-showcase-kit aria-label="시연의 새 부품 포장">${KITS.map(k=>`<option value="${k.id}" ${this.ui.kitId===k.id?'selected':''}>${k.id} · ${k.marked?'Ⅱ 표식 있음':'표식 없음'}</option>`).join('')}</select></label>${buttons}`;
    this.root.querySelector('.showcase-manual-actions').innerHTML=buttons;
  }
  finish() {
    this.running=false;this.completed=true;this.revealing=false;
    this.view.travel.cancel();this.view.workshop?.cancel();
    this.root.querySelector('progress').value=100;
    this.root.querySelector('.showcase-scan').hidden=true;
    this.root.querySelector('.showcase-manual-actions').innerHTML='';
    this.setNarrative(4,'프로펠러 정비를 마쳤습니다.','전원 차단·배터리 분리 상태로 정비를 완료했습니다. 교육을 선택해 직접 연습해 보세요.');
    this.updateControls();
    this.notice.update({key:`drone-showcase:${this.attempt}`,course:'Q-DRONE 프로펠러 정비 가이드',demo:true,title:'프로펠러 정비를 마쳤습니다!'});
  }
  dispose() {
    this.root.removeEventListener('change',this.kitChange);
    super.dispose();
  }
}
