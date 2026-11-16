import * as THREE from '../vendor/three/three.module.min.js';
import { PandaViewport } from './panda3d.js';
import { CameraTravel } from './presentation3d.js';
import { CourseCompletionNotice } from './course-completion.js';
import { pandaShowcasePlan,createPandaShowcase,advancePandaShowcase,PANDA_SHOWCASE_STAGES,PANDA_SHOWCASE_DURATION } from '../domain/panda-showcase.js';

export class PandaShowcase {
  constructor(root,{compatible,onExit,onPractice,onUnavailable}={}) {
    Object.assign(this,{root,onExit,onPractice});this.steps=pandaShowcasePlan();this.attempt=0;
    this.notice=new CourseCompletionNotice({id:'showcase-completion'});
    this.notice.dialog.addEventListener('close',()=>{if(this.playback.completed)this.root.querySelector('[data-showcase=restart]')?.focus();});
    this.view=new PandaViewport({compatible,onUnavailable:()=>{this.pause();onUnavailable?.();},onReady:ready=>{
      if(this.disposed)return;
      if(!ready&&this.playback?.elapsed>0)this.pause('모델을 준비하는 동안 멈췄습니다. 다시 불러온 뒤 재생을 눌러 이어가세요.');
      this.updateControls();this.syncTimer();
    }});
    this.travel=new CameraTravel(this.view);
    this.click=event=>{
      const button=event.target.closest('[data-showcase]');if(!button||button.disabled)return;
      event.preventDefault();event.stopPropagation();
      const action=button.dataset.showcase;
      if(action==='exit')this.onExit?.();
      if(action==='toggle')this.running?this.pause():this.resume();
      if(action==='restart')this.restart();
      if(action==='takeover'){this.pause();this.onPractice?.();}
    };
    this.suspend=()=>{if(this.running)this.pause('창을 벗어나 가이드를 멈췄습니다. 재생을 눌러 이어가세요.');};
    this.visibility=()=>{if(document.hidden)this.suspend();};
    this.escape=event=>{if(event.key==='Escape'&&!this.notice.dialog.open){event.preventDefault();event.stopPropagation();this.pause();}};
    root.addEventListener('click',this.click);window.addEventListener('blur',this.suspend);
    document.addEventListener('visibilitychange',this.visibility);window.addEventListener('keydown',this.escape,true);
    this.restart();this.view.attach(root.querySelector('#showcase-viewport'));this.camera('overview');this.syncTimer();
    this.aspect=this.view.camera.aspect;
    this.resizeObserver=new ResizeObserver(()=>{
      if(this.disposed)return;
      const aspect=this.view.host.clientWidth/Math.max(1,this.view.host.clientHeight);
      if(Math.abs(aspect-this.aspect)>.1){this.aspect=aspect;this.camera('overview');}
    });this.resizeObserver.observe(this.view.host);
  }
  restart() {
    clearInterval(this.timer);this.timer=null;this.travel.cancel();this.notice.update(null);
    this.attempt++;this.playback=createPandaShowcase();this.running=!document.hidden;this.lastIndex=-1;this.previous=performance.now();
    delete this.root.dataset.showcaseError;this.sync();this.syncTimer();
  }
  syncTimer() {
    const ready=this.view.canvas.dataset.modelStatus==='ready';
    if(this.disposed||!this.running||!ready||document.hidden||this.playback.completed||this.playback.error){clearInterval(this.timer);this.timer=null;return;}
    if(this.timer)return;this.previous=performance.now();
    this.timer=setInterval(()=>{
      const now=performance.now(),seconds=Math.min(.1,(now-this.previous)/1000);this.previous=now;
      if(!this.running||document.hidden||this.view.canvas.dataset.modelStatus!=='ready')return;
      this.playback=advancePandaShowcase(this.playback,seconds,this.steps);this.sync();
      if(this.playback.error){this.running=false;this.root.dataset.showcaseError='true';this.root.querySelector('[data-showcase-detail]').textContent=this.playback.error;this.updateControls();this.syncTimer();}
      if(this.playback.completed)this.finish();
    },50);
  }
  camera(name) {
    const settings={overview:[[.24,.32,.01],[1.3,1.1,1.4]],source:[[.36,.29,.13],[1.12,.92,1.28]]};
    const [target,position]=settings[name]||settings.overview;
    const look=new THREE.Vector3(...target),eye=new THREE.Vector3(...position);
    eye.sub(look).multiplyScalar(Math.max(1,.95/Math.max(.35,this.view.camera.aspect))).add(look);
    this.view.controls.maxDistance=5;this.travel.move(look,eye,1100);
  }
  sync() {
    const p=this.playback,s=p.state,m=s.mission,step=this.steps[Math.min(p.index,this.steps.length-1)];
    if(this.lastState!==s){this.lastState=s;this.view.sync(s,{previewMode:false});}
    const text=(selector,value)=>{const node=this.root.querySelector(selector);if(node.textContent!==value)node.textContent=value;};
    if(this.lastIndex!==p.index){
      this.lastIndex=p.index;text('[data-showcase-title]',step.title);text('[data-showcase-detail]',step.detail);
      text('[data-showcase-caption]',`0${step.stage+1} / ${PANDA_SHOWCASE_STAGES[step.stage]}`);
      this.root.querySelectorAll('[data-chapter]').forEach((node,i)=>{node.dataset.state=i<step.stage?'done':i===step.stage?'current':'pending';if(i===step.stage)node.setAttribute('aria-current','step');else node.removeAttribute('aria-current');});
      if(step.camera&&this.view.host)this.camera(step.camera);
    }
    text('[data-health]','가상 훈련 장치');
    text('[data-module]',s.game.selected?'▲ 초록 선 선택':'목표 ▲ 초록 선');
    text('[data-motion]',p.completed?'게임 완료':s.game.cut?'가상 선 절단 완료':s.motion?'로봇팔 작동 중':'다음 단계 대기');
    this.root.querySelector('.panda-guide-alert').hidden=true;
    this.root.dataset.showcaseStep=String(Math.min(p.index,this.steps.length-1));this.root.dataset.showcaseStage=String(step.stage);
    this.root.dataset.missionPhase=m.phase;this.root.dataset.cut=s.game.cut||'';
    this.root.querySelector('progress').value=Math.min(100,p.elapsed/PANDA_SHOWCASE_DURATION*100);
    const elapsed=Math.min(PANDA_SHOWCASE_DURATION,Math.floor(p.elapsed)),time=`${Math.floor(elapsed/60)}:${String(elapsed%60).padStart(2,'0')}`;
    text('[data-showcase-progress]',`${Math.min(p.index+1,this.steps.length)} / ${this.steps.length} 장면 · ${time} / 0:35`);
    this.updateControls();
  }
  updateControls() {
    if(!this.playback)return;
    const ready=this.view.canvas.dataset.modelStatus==='ready',done=this.playback.completed;
    this.root.dataset.showcaseState=done?'completed':this.running?(ready?'playing':'loading'):'paused';
    this.root.querySelector('[data-showcase-mode]').textContent=done?'가이드 시연 완료':!ready?'모델 준비 중':this.running?'자동 시연 중':'시연 일시정지';
    this.root.querySelector('[data-showcase=toggle]').textContent=done?'▶ 다시 재생':this.running?'Ⅱ 일시정지':'▶ 이어서 재생';
  }
  pause(message) {
    if(this.disposed)return;
    this.running=false;this.travel.cancel();this.syncTimer();this.updateControls();
    if(message)this.root.querySelector('[data-showcase-detail]').textContent=message;
  }
  resume() {
    if(this.playback.completed||this.playback.error){this.restart();return;}
    if(document.hidden)return;
    this.running=true;this.root.querySelector('[data-showcase-detail]').textContent=this.steps[this.playback.index].detail;
    this.updateControls();this.syncTimer();
  }
  finish() {
    this.running=false;this.travel.cancel();this.syncTimer();this.updateControls();this.root.querySelector('progress').value=100;
    this.notice.update({key:`panda-showcase:${this.attempt}`,course:'로봇팔 가상 해체 게임 가이드',demo:true,title:'가상 색상 퍼즐을 마쳤습니다!',description:'직접 훈련하기에서 새 임무를 시작할 수 있습니다. 이 시연은 훈련 기록에 저장하지 않습니다.'});
  }
  dispose() {
    if(this.disposed)return;
    this.disposed=true;clearInterval(this.timer);this.resizeObserver.disconnect();this.travel.dispose();this.view.dispose();this.notice.dismiss();this.notice.dialog.remove();
    this.root.removeEventListener('click',this.click);window.removeEventListener('blur',this.suspend);
    document.removeEventListener('visibilitychange',this.visibility);window.removeEventListener('keydown',this.escape,true);
  }
}
