import { createState, transition } from './state.js';
import { PROFILE } from '../content/aircraft-profiles.js';
import { SCENARIO } from '../content/scenarios.js';

export function createShowcaseDrone() {
  const state=createState({session:'드론 가이드 시연',trainee:'DEMO'});
  state.power=true;
  return state;
}

export function applyDroneShowcaseAction(state,action) {
  const next=transition(state,action);
  if(next.feedback.kind!=='success')throw new Error(next.feedback.message);
  return next.state;
}

export function droneShowcasePlan() {
  const steps=[];
  const add=(stage,title,detail,operation,hold=1600)=>steps.push({stage,title,detail,operation,hold});
  const action=(type,extra={})=>({type:'action',action:{type,...extra}});
  const place=(from,to)=>({type:'place',from,to});
  add(0,'손상을 찾고, 정확하게 고치다.','Q-DRONE의 전원 확인부터 프로펠러 교체와 최종 점검까지 따라가 보세요.',{type:'overview'},4200);
  add(1,'먼저, 기체 전원을 끕니다.','회전할 수 있는 상태에서는 프로펠러를 만지지 않습니다.',action('TOGGLE_POWER'),1300);
  add(1,'전원 차단을 확인합니다.','전원 아이콘으로 꺼진 상태를 한 번 더 확인합니다.',action('CONFIRM_POWER'),1100);
  add(1,'잔량이 낮은 배터리를 분리합니다.','기존 배터리 20%를 수거함으로 옮깁니다.',place('drone-battery','drone-discard'),1500);
  add(1,'충전된 배터리의 잔량을 확인합니다.','100% 교체 배터리를 장착해 표시가 바뀌는 것을 확인하세요.',place('pack-battery-02','drone-battery'),2200);
  add(1,'정비 전, 다시 차단 상태를 확인합니다.','전원은 켜지 않고 차단 상태만 확인합니다.',action('CONFIRM_POWER'),1100);
  add(1,'프로펠러 작업 중에는 배터리를 분리합니다.','잔량 확인을 마친 교체 배터리도 수거함에 보관합니다.',place('drone-battery','drone-discard'),1800);
  for(const p of PROFILE.motors) {
    add(2,`${p.short}번 모터를 가까이 살펴봅니다.`,'날개 끝과 고정부를 살펴보고 손상을 찾습니다.',{type:'inspect',motorId:p.id},1900);
    add(2,p.id===SCENARIO.target?'손상된 날개를 발견했습니다.':'이 모터의 날개는 정상입니다.',p.id===SCENARIO.target?'날개 끝이 비틀리고 한쪽이 찢어졌습니다. 이 모터의 부품을 교체합니다.':'정상 부품은 유지하고 다음 모터도 확인합니다.',
      action('ANSWER_DAMAGE',{motorId:p.id,answer:p.id===SCENARIO.target?'replace':'healthy'}),1000);
  }
  add(3,'한 모터의 두 날개와 나사를 함께 바꿉니다.','같은 A1 포장에 들어 있는 새 부품을 준비합니다.',action('ANSWER_REASON',{answer:'pair'}),2000);
  add(3,'손상된 모터로 돌아갑니다.','고정 나사를 먼저 풀고 기존 날개를 분리합니다.',{type:'focus',motorId:SCENARIO.target},1200);
  for(const i of [0,1])add(3,`${i+1}번 기존 나사를 풀어냅니다.`,'드라이버를 나사에 맞춘 뒤 회전해 분리합니다.',place('drone-driver',`screw-${SCENARIO.target}-${i}`),1500);
  for(const i of [0,1])add(3,`${i+1}번 기존 날개를 꺼냅니다.`,'날개는 수거함으로 옮기고 빈 장착 자리를 확인합니다.',place(`blade-${SCENARIO.target}-${i}`,'drone-discard'),1700);
  for(const i of [0,1])add(3,`${i+1}번 새 날개를 장착합니다.`,'기체와 같은 Ⅱ 표식이 있는 A1 포장의 날개를 같은 번호에 놓습니다.',place(`new-blade-${i}`,`blade-${SCENARIO.target}-${i}`),1800);
  for(const i of [0,1])add(3,`${i+1}번 새 나사를 넣습니다.`,'날개와 같은 포장에 들어 있던 새 나사를 사용합니다.',place(`new-screw-${i}`,`screw-${SCENARIO.target}-${i}`),1400);
  for(const i of [0,1])add(3,`${i+1}번 나사를 단단히 고정합니다.`,'새 나사를 놓는 것과 체결을 확인하는 것은 별도 단계입니다.',place('drone-driver',`screw-${SCENARIO.target}-${i}`),1700);
  for(const [check,title,detail] of [
    ['marks','기체와 새 부품의 표식을 확인합니다.','Ⅱ 표식이 있는 모터에는 같은 표식의 부품을 사용했습니다.'],
    ['count','날개와 나사의 누락이 없는지 확인합니다.','네 모터의 날개 8개와 나사 8개가 모두 장착되어 있습니다.'],
    ['fastening','모든 나사의 체결 상태를 확인합니다.','교체한 두 나사까지 고정되었는지 마지막으로 확인합니다.'],
  ])add(4,title,detail,action('CONFIRM_CHECK',{check}),1900);
  add(4,'프로펠러 정비를 마쳤습니다.','전원 차단과 배터리 분리 상태로 정비 과제를 완료합니다.',action('FINAL_INSPECTION'),2200);
  add(4,'이제, 직접 정비해 보세요.','손상 발견부터 새 부품 장착과 체결까지 완료했습니다. 시연은 교육 기록에 저장되지 않습니다.',{type:'closing'},3200);
  return steps;
}
