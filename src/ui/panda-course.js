import { PandaViewport } from './panda3d.js';
import { createPandaMissionState, pandaMissionTransition, pandaMissionPrompt, pandaMissionAssessment, wireInfo, pandaWireAbove } from '../domain/panda-mission.js';
import { escapeHTML as e } from './shared.js';
const actions={isolate:'CONFIRM_OFF',clean:'CLEAN',tighten:'TIGHTEN',brief:'START_GAME',choose:'CUT_WIRE',complete:'RESET',failed:'RESET'};
export class PandaCourse {
  constructor(root,{state=createPandaMissionState(),compatible,onUnavailable,onChange,getSaveState,onSave,onExport,cancelInput}={}) {
    Object.assign(this,{root,state,onChange,getSaveState,onSave,onExport,cancelInput});
    this.ready = false;
    this.view=new PandaViewport({compatible,onUnavailable,onReady:ready=>{this.ready=ready;if(!ready)this.pause('모델을 준비하는 동안 멈췄습니다.');this.update();this.timerSync();}});
    this.click=event=>{
      const b=event.target.closest('[data-panda-command]');if(!b||b.disabled)return;
      const command=b.dataset.pandaCommand;
      if(command==='reset'){this.restart();return;}
      if(command==='save'){this.onSave?.();this.update();return;}
      if(command.startsWith('export-')){this.onExport?.(command);return;}
      if(command==='stop'){this.pause('멈췄습니다. 이어하기를 누르세요.');return;}
      if(!this.ready||document.hidden)return;
      if(command==='wire')this.act({type:'SELECT_WIRE',id:b.dataset.value});
      if(command==='execute')this.act({type:actions[this.state.mission.phase]});
      if(command==='resume')this.act({type:'RESUME'});
    };
    this.wire=event=>{if(this.ready&&!document.hidden)this.act({type:'SELECT_WIRE',id:event.detail.id});};
    this.blur=()=>this.pause('창을 벗어나 멈췄습니다. 이어하기를 누르세요.');
    this.hidden=()=>{if(document.hidden)this.blur();};
    this.key=event=>{
      if (event.key==='Enter' && event.target.matches?.('[data-stick=gripper]')) {
        event.preventDefault();
        const execute=root.querySelector('[data-panda-command=execute]');
        if (!event.repeat && this.state.mission.phase==='choose' && !execute.disabled) execute.click();
      }
      if(event.key==='Escape'&&!document.querySelector('#learning-help')?.open&&!document.querySelector('#course-completion')?.open){event.preventDefault();this.pause('멈췄습니다. 이어하기를 누르세요.');}
    };
    root.addEventListener('click',this.click);root.addEventListener('panda-wire',this.wire);
    window.addEventListener('blur',this.blur);document.addEventListener('visibilitychange',this.hidden);window.addEventListener('keydown',this.key);
    this.view.attach(root.querySelector('[data-panda-viewport]'));this.update();
  }
  act(action){
    if (['PAUSE','RESET','SELECT_WIRE','CUT_WIRE'].includes(action.type)) this.cancelInput?.();
    this.state=pandaMissionTransition(this.state,action);this.onChange?.(this.state);this.update();this.timerSync();
    if (action.type === 'START_GAME' && this.state.mission.phase === 'choose') {
      if (window.matchMedia('(max-width:1000px)').matches) this.root.querySelector('.panda-stage').scrollIntoView({block:'nearest'});
      this.root.querySelector('[data-stick=gripper]').focus({preventScroll:true});
    }
  }
  control(action) {
    if (!this.ready || this.disposed || document.hidden || this.state.mission.phase !== 'choose' || this.state.estop || this.state.motion) return;
    this.act(action);
  }
  pause(reason){if(this.state.motion||this.state.game.active)this.act({type:'PAUSE',reason});}
  restart(){this.act({type:'RESET'});}
  timerSync(){
    const {x,y} = this.state.game.armControl;
    if(this.disposed||!this.ready||this.state.estop||document.hidden||!(this.state.motion||this.state.game.active&&(x||y||this.state.mission.mode==='independent'))){clearInterval(this.timer);this.timer=null;return;}
    if(this.timer)return;this.at=performance.now();
    this.timer=setInterval(()=>{const now=performance.now(),seconds=Math.min(.1,(now-this.at)/1000);this.at=now;this.act({type:'TICK',seconds});},50);
  }
  update(){
    if(this.disposed)return;
    const s=this.state,m=s.mission,g=s.game,root=this.root,phase=m.phase,prompt=pandaMissionPrompt(s),challenge=m.mode==='independent';
    const text=(q,v)=>{const n=root.querySelector(q);if(n.textContent!==v)n.textContent=v;};
    const index={isolate:0,clean:0,tighten:0,brief:0,choose:1,cutting:1,returning:1,failed:1,complete:3}[phase];
    root.querySelectorAll('[data-panda-workflow]').forEach((li,i)=>{li.dataset.done=String(i<index);if(i===index)li.setAttribute('aria-current','step');else li.removeAttribute('aria-current');});
    text('[data-panda-mode]',challenge?'도전 모드 · 90초':'연습 모드 · 시간 제한 없음');
    text('[data-panda-count]',phase==='complete'?'모든 단계 완료':phase==='failed'?'다시 도전':phase==='brief'?'목표 확인 · 게임 시작 대기':'가상 색상 퍼즐 진행 중');
    root.querySelector('progress').value=index;
    root.querySelector('.panda-current').classList.toggle('current-task-active', this.ready && phase !== 'complete');
    text('.panda-current > .guide-caption', phase === 'complete' ? '교육 완료' : '지금 할 일');
    text('[data-panda-title]',prompt[0]);text('[data-panda-detail]',prompt[1]);
    root.querySelectorAll('[data-service]').forEach(n=>{const done=s.maintenance[n.dataset.service];n.dataset.done=String(done);n.querySelector('span').textContent=done?'✓':'○';});
    root.querySelector('[data-panda-game]').hidden=false;
    const goal=wireInfo(g.goal),goalNode=root.querySelector('[data-panda-goal]');text('[data-panda-goal]',`${goal.symbol} ${goal.label}`);goalNode.style.setProperty('--wire',goal.color);goalNode.dataset.color=goal.id;
    const time=Math.ceil(g.remaining);text('[data-panda-time]',challenge?`${Math.floor(time/60)}:${String(time%60).padStart(2,'0')}`:'제한 없음');
    root.querySelector('.panda-clock').dataset.urgent=String(challenge&&time<=20);
    root.querySelectorAll('[data-panda-command=wire]').forEach(b=>{b.disabled=!this.ready||s.estop||!!s.motion||phase!=='choose';b.setAttribute('aria-pressed',String(b.dataset.value===g.selected));b.dataset.cut=String(b.dataset.value===g.cut);});
    text('[data-panda-feedback]',g.feedback?'목표 색과 달라요. 위의 목표 표식을 다시 확인하세요.':g.cut?'가상 선이 끊어졌습니다. 게임 성공!':'');
    const execute=root.querySelector('[data-panda-command=execute]');
    const choosing = phase === 'choose', arm = g.armControl;
    const remote = root.querySelector('.panda-gripper-remote'), pad = remote.querySelector('[data-stick]');
    const actionSlot = root.querySelector(choosing ? '[data-arm-action]' : '[data-panel-action]');
    if (execute.parentElement !== actionSlot) actionSlot.append(execute);
    remote.hidden = !choosing;
    pad.disabled = !choosing || !this.ready || s.estop || !!s.motion;
    pad.toggleAttribute('data-next-action', !pad.disabled && !g.selected);
    pad.querySelector('.stick-knob').style.transform = `translate(${arm.x*22}px,${-arm.y*22}px)`;
    const lane = wireInfo(pandaWireAbove(arm.lane));
    text('[data-arm-goal]', `목표 · ${goal.symbol} ${goal.label}`);
    text('[data-arm-readout]', s.estop ? '일시 정지' : s.motion ? '자동 이동 중' : g.selected ? `${wireInfo(g.selected).label} · 집게 정렬됨` :
      Math.abs(arm.lane-Math.round(arm.lane)) > .24 ? '선 사이 · 좌우로 맞추세요' : `${lane.symbol} ${lane.label} 위 · ↓ 내리기`);
    execute.textContent=!this.ready?'모델 준비 중':s.motion?'로봇팔 작동 중…':prompt[2];
    execute.disabled=!this.ready||s.estop||!!s.motion||!actions[phase]||phase==='choose'&&!g.selected;
    execute.toggleAttribute('data-next-action', !execute.disabled && phase !== 'complete');
    root.querySelector('[data-panda-command=stop]').disabled=s.estop||!(s.motion||g.active);
    const resume = root.querySelector('[data-panda-command=resume]');
    resume.hidden = !s.estop;
    resume.toggleAttribute('data-next-action', this.ready && s.estop);
    text('[data-panda-power]',s.estop?'일시 정지':s.power?'게임 진행 중':'전원 꺼짐');text('[data-panda-message]',s.message);
    Object.assign(root.dataset,{phase,mode:m.mode,moving:String(!!s.motion&&!s.estop),estop:String(s.estop),goal:g.goal,selected:g.selected||'',cut:g.cut||''});
    root.querySelector('[data-panda-review]').hidden=phase!=='complete';
    if(phase==='complete')this.review();
    const viewKey=JSON.stringify([s.joints,s.opening,s.maintenance,phase,g.selected,g.cut,s.motion?.elapsed,s.estop]);
    if(viewKey!==this.viewKey){this.viewKey=viewKey;this.view?.sync(s,{manualControl:true});}
  }
  review(){
    const root=this.root,m=this.state.mission,a=pandaMissionAssessment(this.state),saved=this.getSaveState?.()||{};
    root.querySelector('[data-panda-score]').textContent=a.score;
    root.querySelector('[data-panda-review-meta]').textContent=`${m.session} · 교육생 ${m.trainee} · ${m.mode==='guided'?'연습':'도전'} 모드 · 다른 색 확인 ${a.errors}회`;
    root.querySelector('[data-panda-rubric]').innerHTML=a.sections.map(r=>`<div><span>${e(r.title)}</span><strong>${r.score}<small>/${r.max}</small></strong><progress value="${r.score}" max="${r.max}" aria-label="${e(r.title)} 점수"></progress></div>`).join('');
    root.querySelector('[data-panda-save-status]').textContent=saved.saved?'이 브라우저의 훈련 기록에 저장했습니다.':saved.error||'저장 상태를 확인하고 있습니다.';
    root.querySelector('[data-panda-command=save]').hidden=!!saved.saved;
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;clearInterval(this.timer);
    this.root.removeEventListener('click',this.click);this.root.removeEventListener('panda-wire',this.wire);
    window.removeEventListener('blur',this.blur);document.removeEventListener('visibilitychange',this.hidden);window.removeEventListener('keydown',this.key);this.view.dispose();
  }
}
