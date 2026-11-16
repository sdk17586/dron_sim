import { PandaViewport } from './panda3d.js';
import { PandaGripperService } from './panda-gripper-service.js';
import { pandaMaintenanceGuide, pandaMaintenanceTransition, pandaGripperAssembled, pandaServiceIsolated } from '../domain/panda-maintenance.js';
import { updateTaskGuide } from './learning.js';
export class PandaMaintenanceCourse{
 constructor(root,{state,compatible,onUnavailable,onChange,getSaveState,onSave,onExport}={}){
  Object.assign(this,{root,state,onChange,getSaveState,onSave,onExport});
  this.ready = false;
  this.view=new PandaViewport({compatible,maintenance:true,onUnavailable,onReady:ready=>{
   this.ready=ready;if(ready&&!this.service)this.service=new PandaGripperService(this.view);if(!ready)this.pause();this.update();this.timerSync();
  }});
  this.click=event=>{
   const b=event.target.closest('[data-service-command]');if(!b||b.disabled)return;
   const type=b.dataset.serviceCommand;
   if(type==='SAVE'){this.onSave?.();this.update();return;}
   if(type==='EXPORT'){this.onExport?.();return;}
   if(!this.ready)return;
   if(type==='OVERVIEW'){this.service.overview();return;}
   if(type==='FOCUS'){this.service.focus();return;}
   this.act({type,verdict:b.dataset.verdict});
  };
  this.action=event=>{event.stopPropagation();if(this.ready)this.act({type:event.detail.command});};
  this.place=event=>{event.stopPropagation();if(this.ready)this.act({type:'PLACE',...event.detail});};
  this.change=event=>{
   if(event.target.dataset.serviceCheck)this.act({type:'CHECK',key:event.target.dataset.serviceCheck,value:event.target.checked});
   if(event.target.matches('[data-service-module]')&&this.service){this.act({type:'MODULE',moduleId:event.target.value});}
  };
  this.blur=()=>this.pause();this.hidden=()=>{if(document.hidden)this.pause();};
  this.key=event=>{if(event.key==='Escape'){this.service?.workshop.cancel();this.view.draw();this.pause();}};
  root.addEventListener('click',this.click);root.addEventListener('change',this.change);root.addEventListener('workshop-action',this.action);root.addEventListener('workshop-place',this.place);
  window.addEventListener('blur',this.blur);document.addEventListener('visibilitychange',this.hidden);window.addEventListener('keydown',this.key);
  this.view.attach(root.querySelector('[data-panda-viewport]'));this.update();
 }
 act(a){const old=this.state;this.state=pandaMaintenanceTransition(old,a);this.onChange?.(this.state);this.update(a.type!=='TICK'||!!old.testing!==!!this.state.testing);this.timerSync();if(['test-power','test-release','final-stop','final-power'].includes(pandaMaintenanceGuide(this.state).current.id)&&pandaMaintenanceGuide(old).current.id!==pandaMaintenanceGuide(this.state).current.id)this.service?.overview();if(a.type==='INSPECT'&&this.state.gripper.inspected)this.service?.focus();}
 pause(){this.service?.workshop.cancel();if(this.state.testing)this.act({type:'PAUSE'});}
 timerSync(){
  if(this.disposed||!this.ready||!this.state.testing||document.hidden){clearInterval(this.timer);this.timer=null;return;}
  if(this.timer)return;this.at=performance.now();this.timer=setInterval(()=>{const now=performance.now(),seconds=Math.min(.1,(now-this.at)/1000);this.at=now;this.act({type:'TICK',seconds});},50);
 }
 update(rebind=true){
  if(this.disposed)return;const s=this.state,g=s.gripper,r=this.root,guide=pandaMaintenanceGuide(s);
  const text=(q,v)=>{const n=r.querySelector(q);if(n.textContent!==v)n.textContent=v;};
  updateTaskGuide(r,guide);r.querySelector('[data-service-module]').value=s.moduleId;
  r.dataset.task=guide.current.id;r.dataset.phase=s.status==='completed'?'complete':'working';r.dataset.gripper=g.present?g.source:'removed';r.dataset.testing=String(!!s.testing);
  text('[data-service-context-title]',s.status==='completed'?'그리퍼 정비 완료':g.verdict!=='replace'?'손상 부위 관찰':g.source==='original'?'손상 그리퍼 분리':pandaGripperAssembled(s)?'교체 후 작동 확인':'새 그리퍼 장착·체결');
  r.querySelector('[data-service-diagnose]').hidden=!(g.inspected&&!g.verdict);
  r.querySelector('[data-service-test]').hidden=!pandaGripperAssembled(s)||s.status==='completed';
  text('[data-service-test-status]',s.testing?'그리퍼 개폐 시험 중…':s.tested?'개폐 시험 완료 · 비상 정지 후 전원을 끄세요.':'전원을 켜고 비상 정지를 해제한 뒤 시험하세요.');
  r.querySelector('[data-service-final]').hidden=!s.tested||s.status==='completed';
  r.querySelector('[data-service-complete]').hidden=s.status!=='completed';
  r.querySelector('[data-service-stock]').hidden=g.verdict!=='replace'||!g.spare;
  r.querySelectorAll('[data-service-check]').forEach(n=>{n.checked=s.checks[n.dataset.serviceCheck];n.disabled=!pandaServiceIsolated(s);});
  r.querySelectorAll('[data-service-command]').forEach(b=>{const type=b.dataset.serviceCommand;b.disabled=['SAVE','EXPORT'].includes(type)?false:!this.ready||s.status==='completed'&&!['FOCUS','OVERVIEW'].includes(type)||!!s.testing&&!['STOP','POWER','FOCUS','OVERVIEW'].includes(type);if(type==='TEST')b.disabled=!this.ready||!pandaGripperAssembled(s)||!s.power||s.estop||!!s.testing||s.tested;if(type==='COMPLETE')b.disabled=!this.ready||!s.tested||!pandaServiceIsolated(s)||!Object.values(s.checks).every(Boolean);});
  const task = guide.current.id;
  r.querySelector('[data-service-diagnose] .two-buttons').toggleAttribute('data-next-action', this.ready && task === 'diagnose');
  const testButton = r.querySelector('[data-service-command=TEST]');
  testButton.toggleAttribute('data-next-action', task === 'test' && !testButton.disabled);
  const nextCheck = r.querySelector('[data-service-check]:enabled:not(:checked)');
  for (const check of r.querySelectorAll('[data-service-check]')) {
    check.closest('label').toggleAttribute('data-next-action', this.ready && task === 'finish' && check === nextCheck);
  }
  const finishButton = r.querySelector('[data-service-command=COMPLETE]');
  finishButton.toggleAttribute('data-next-action', task === 'finish' && !finishButton.disabled);
  text('[data-service-stop]',s.estop?'작동 중':'해제');text('[data-service-power]',s.power?'켜짐':'꺼짐');text('[data-service-part]',!g.present?'분리됨':g.source==='new'?'PG-01 새 그리퍼':'손상 · 교체 필요');text('[data-service-message]',s.message);
  if(s.status==='completed'){const saved=this.getSaveState?.()||{};text('[data-service-save-status]',saved.saved?'훈련 기록에 저장했습니다.':saved.error||'결과 저장 중…');r.querySelector('[data-service-command=SAVE]').hidden=!!saved.saved;}
  this.view?.sync(s,{previewMode:false});this.service?.sync(s,rebind);this.view?.draw();
 }
 dispose(){if(this.disposed)return;this.disposed=true;clearInterval(this.timer);this.root.removeEventListener('click',this.click);this.root.removeEventListener('change',this.change);this.root.removeEventListener('workshop-action',this.action);this.root.removeEventListener('workshop-place',this.place);window.removeEventListener('blur',this.blur);window.removeEventListener('keydown',this.key);document.removeEventListener('visibilitychange',this.hidden);this.view.dispose();}
}
