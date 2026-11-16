import { createPandaMissionState, pandaMissionTransition } from './panda-mission.js';
export const PANDA_SHOWCASE_STAGES=['장비 소개','목표 색 확인','선 선택','가상 선 자르기','완료'];
export const PANDA_SHOWCASE_DURATION=35;
export function pandaShowcasePlan(){
  const steps=[];
  const add=(stage,title,detail,action=null,hold=2,wait='',motion=0,camera='')=>steps.push({stage,title,detail,action,hold,wait,motion,camera});
  add(0,'로봇팔로 가상 색상 퍼즐에 도전해요.','정비 교육과 별도로 진행하는 과정입니다. 실제 폭발물 구조·배선·해체법과 무관한 게임입니다.',null,5,'',0,'overview');
  add(1,'이번 목표는 ▲ 초록 선입니다.','직접 실습할 때는 빨강·초록·검정 중 목표가 무작위로 정해집니다.',null,4,'',0,'source');
  add(1,'연습 또는 90초 도전 모드를 골라요.','게임을 시작하면 스틱의 좌우로 선을 고르고 아래로 당겨 집게를 내립니다.',{type:'START_GAME'},3);
  add(2,'▲ 초록 선을 선택해요.','이 시연은 자동 이동 버튼을 사용합니다. 직접 조종할 때도 집게가 선에 닿으면 같은 정렬 표시가 나타납니다.',{type:'SELECT_WIRE',id:'green'},3,'motion',2.8);
  add(2,'선택한 색을 다시 확인해요.','목표 표식은 화면에 계속 보입니다. 다른 색을 확인하면 점수가 줄어듭니다.',null,3);
  add(3,'가상 선 자르기를 누르세요.','집게가 닫히며 가상 선이 끊어지고 로봇팔이 복귀합니다.',{type:'CUT_WIRE'},3,'motion',4.2);
  add(4,'가상 해체 게임 성공!','결과를 저장하고 다른 목표 색으로 도전할 수 있습니다. 가이드는 기록에 저장하지 않습니다.',null,4,'',0,'overview');
  const extra=(PANDA_SHOWCASE_DURATION-steps.reduce((n,s)=>n+s.hold+s.motion,0))/steps.length;
  steps.forEach(s=>s.hold+=extra);return steps;
}
export function createPandaShowcase(){return {state:createPandaMissionState({session:'가이드 시연',trainee:'DEMO',goal:'green',standalone:true}),index:0,status:'ready',hold:0,elapsed:0,completed:false,error:''};}
export function advancePandaShowcase(playback,seconds,steps=pandaShowcasePlan()){
  if(playback.completed||playback.error||!Number.isFinite(seconds)||seconds<=0||seconds>.15)return playback;
  const p={...playback};let remaining=seconds;
  try{
    for(let loops=0;remaining>1e-9&&loops<20;loops++){
      const step=steps[p.index];
      if(p.status==='ready'){
        if(step.action){
          const next=pandaMissionTransition(p.state,step.action);
          if(next.mission.errors.length!==p.state.mission.errors.length||JSON.stringify(next)===JSON.stringify(p.state))throw new Error('가이드 단계를 수행하지 못했습니다. 처음부터 다시 실행해 주세요.');
          p.state=next;
        }
        p.status=step.wait?'motion':'hold';p.hold=step.hold;
      }
      if(p.status==='motion'){
        if(!p.state.motion){p.status='hold';continue;}
        if(p.state.estop)throw new Error('가이드 동작이 중단됐습니다.');
        const motion=p.state.motion,used=Math.min(remaining,.05,Math.max(.000001,motion.duration-motion.elapsed));
        p.state=pandaMissionTransition(p.state,{type:'TICK',seconds:used});p.elapsed+=used;remaining-=used;
      }else{
        const used=Math.min(remaining,p.hold);p.hold-=used;p.elapsed+=used;remaining-=used;
        if(p.hold<=1e-9){p.index++;if(p.index===steps.length){if(p.state.mission.phase!=='complete')throw new Error('게임을 완료하지 못했습니다.');p.completed=true;p.status='completed';break;}p.status='ready';}
      }
    }
  }catch(error){p.error=error.message;}
  return p;
}
