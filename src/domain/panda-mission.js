import { createPandaState, PANDA_RIG, pandaTCP } from './panda.js';
import { PANDA_GAME_POSES } from '../content/panda-game-poses.js';

export const PANDA_MISSION_ID='panda-service-wire-game-v1';
export const WIRE_COLORS=[
  {id:'red',label:'빨간 선',symbol:'●',number:1,color:'#ed6870'},
  {id:'green',label:'초록 선',symbol:'▲',number:2,color:'#50d5a1'},
  {id:'black',label:'검정 선',symbol:'■',number:3,color:'#414b59'},
];
export const PANDA_MISSION={title:'간단 정비와 가상 폭탄 해체',situation:'로봇팔을 간단히 점검한 뒤 색깔 선 퍼즐에 도전하세요.',objective:'목표 표식과 같은 색의 가상 선을 선택해 게임 장치를 정지합니다.'};
export const wireInfo=id=>WIRE_COLORS.find(w=>w.id===id);
// Left to right on the virtual panel as seen from its control side.
const lanes = ['black', 'green', 'red'];
const contacts = Object.fromEntries(lanes.map(id => [id, pandaTCP(PANDA_GAME_POSES[id].touch)]));
const clamp = (n, low, high) => Math.max(low, Math.min(n, high));
const lerp = (a,b,t) => a + (b-a)*t;
export const pandaWireAbove = lane => lanes[Math.round(lane + 1)];

function moveGripper(s, seconds) {
  const g = s.game, arm = g.armControl;
  arm.lane = clamp(arm.lane + arm.x * seconds * 1.05, -1, 1);
  arm.height = clamp(arm.height + arm.y * seconds * .8, 0, 1);
  const segment = arm.lane < 0 ? 0 : 1;
  const left = PANDA_GAME_POSES[lanes[segment]], right = PANDA_GAME_POSES[lanes[segment+1]];
  const across = arm.lane + 1 - segment;
  s.joints = left.touch.map((angle,i) => lerp(
    lerp(angle, right.touch[i], across),
    lerp(left.hover[i], right.hover[i], across), arm.height));
  const tip = pandaTCP(s.joints), nearest = pandaWireAbove(arm.lane);
  g.selected = Math.hypot(...tip.map((v,i) => v - contacts[nearest][i])) <= .021 ? nearest : null;
}
const validText=v=>typeof v==='string'&&v.trim().length>0&&v.trim().length<=40&&!/[\x00-\x1f]/.test(v);
const newId=()=>globalThis.crypto.randomUUID?.()||Array.from(globalThis.crypto.getRandomValues(new Uint32Array(4))).join('-');
export function createPandaMissionState({session='훈련-01',trainee='001',mode='guided',goal,standalone=false,startedAt=new Date().toISOString()}={}) {
  const target=wireInfo(goal)?goal:WIRE_COLORS[globalThis.crypto.getRandomValues(new Uint32Array(1))[0]%3].id;
  const base = createPandaState();
  if (standalone) base.joints = [...PANDA_GAME_POSES.green.hover];
  return {...base,standalone,maintenance:{isolated:false,clean:false,tightened:false},
    game:{goal:target,selected:null,cut:null,remaining:90,active:false,mistakes:0,feedback:'',armControl:{lane:0,height:1,x:0,y:0}},
    mission:{attemptId:newId(),session:validText(session)?session.trim():'훈련-01',trainee:validText(trainee)?trainee.trim():'001',mode:mode==='independent'?'independent':'guided',startedAt,phase:standalone?'brief':'isolate',errors:[],events:[],revision:0}};
}
function log(s,code,type='action') {
  const m=s.mission;m.revision++;if(m.events.length>=180)m.events.shift();m.events.push({type,code,motor:'',revision:m.revision});
}
function startMotion(s,kind,duration,points=[]) {
  s.motion={kind,duration,elapsed:0,from:[...s.joints],points,opening:s.opening};s.message='';
}
export function pandaMissionPrompt(s) {
  const phase=s.mission.phase,goal=wireInfo(s.game.goal),selected=wireInfo(s.game.selected);
  return {
    isolate:['1. 전원 차단을 확인하세요','로봇팔 전원이 꺼져 있는지 확인하면 간단 정비를 시작합니다.','전원 꺼짐 확인'],
    clean:['2. 집게를 점검하고 청소하세요','집게에 표시된 가상 이물질을 제거합니다. 버튼 한 번으로 진행됩니다.','집게 점검·청소'],
    tighten:['3. 점검용 볼트를 조이세요','교육용 체결부의 볼트를 조이면 정비가 끝납니다.','점검 볼트 조이기'],
    brief:[s.standalone?'목표 색을 확인하고 시작하세요':'정비 완료! 색깔 선 퍼즐을 시작해요',`이번 목표는 ${goal.symbol} ${goal.label}입니다. 시작하면 화면 스틱으로 집게를 직접 움직일 수 있습니다.`,s.mission.mode==='guided'?'시간 제한 없이 시작':'90초 도전 시작'],
    choose:['집게를 목표 선에 맞추세요',selected && !s.motion?`${selected.symbol} ${selected.label}에 닿았습니다. 목표와 같은 색이면 ‘자르기’를 누르세요.`:'화면 스틱을 좌우로 움직여 목표 선 위에 맞춘 뒤, 아래로 당겨 집게를 내리세요. 손을 떼면 그 자리에 멈춥니다.',selected?`${selected.label} 자르기`:'집게를 선에 맞추세요'],
    cutting:['가상 선을 자르고 있습니다','게임 장치의 표시가 바뀌는 모습을 확인하세요.','집게 작동 중…'],
    returning:['성공! 로봇팔이 돌아옵니다','선이 끊어지고 게임 장치가 정지했습니다. 로봇팔은 자동으로 복귀합니다.','복귀 중…'],
    complete:['가상 폭탄 해체 게임 성공!','목표 색과 같은 가상 선을 잘랐습니다. 다른 색으로 다시 연습할 수 있습니다.','다시 연습하기'],
    failed:['시간이 끝났어요. 다시 도전해요','훈련용 게임 장치가 초기화 대기 상태입니다. 목표 색을 다시 확인하며 연습해 보세요.','처음부터 다시 도전'],
  }[phase];
}
export function pandaMissionTransition(state,action) {
  if(action.type==='RESET')return createPandaMissionState({session:state.mission.session,trainee:state.mission.trainee,mode:state.mission.mode,standalone:state.standalone});
  const s=structuredClone(state),m=s.mission,g=s.game,phase=m.phase;
  if(['complete','failed'].includes(phase))return s;
  if(action.type==='PAUSE'||action.type==='STOP') {
    if(s.motion||g.active){s.estop=true;g.armControl.x=g.armControl.y=0;s.message=action.reason||'멈췄습니다. 이어하기를 눌러 계속하세요.';}return s;
  }
  if(action.type==='RESUME'){s.estop=false;s.message='';return s;}
  if(s.estop)return s;
  if(action.type==='CONFIRM_OFF'&&phase==='isolate'&&!s.power){s.maintenance.isolated=true;m.phase='clean';log(s,'POWER_OFF_CONFIRMED');return s;}
  if(action.type==='CLEAN'&&phase==='clean'&&!s.power&&s.maintenance.isolated&&!s.motion){startMotion(s,'clean',1.6);log(s,'GRIPPER_CLEAN_STARTED');return s;}
  if(action.type==='TIGHTEN'&&phase==='tighten'&&!s.power&&s.maintenance.clean&&!s.motion){startMotion(s,'tighten',2.4);log(s,'TRAINING_BOLT_TIGHTEN_STARTED');return s;}
  if(action.type==='START_GAME'&&phase==='brief'&&(s.standalone||Object.values(s.maintenance).every(Boolean))){
    s.power=true;g.active=true;m.phase='choose';s.joints=[...PANDA_GAME_POSES.green.hover];s.message='';log(s,'COLOUR_GAME_STARTED');return s;
  }
  if (phase === 'choose' && !s.motion && (action.type === 'STICK' || action.type === 'CENTER')) {
    const arm = g.armControl;
    if (action.type === 'CENTER') { arm.x=arm.y=0; return s; }
    if (action.side !== 'gripper' || !Number.isFinite(action.x) || !Number.isFinite(action.y)) return s;
    const wasStill = !arm.x && !arm.y;
    const length = Math.max(1, Math.hypot(action.x,action.y));
    arm.x = Math.abs(action.x) < .08 ? 0 : action.x / length;
    arm.y = Math.abs(action.y) < .08 ? 0 : action.y / length;
    if (arm.x || arm.y) {
      g.feedback=''; s.message='';
      if (wasStill) moveGripper(s,.035); // A short tap also nudges the arm.
    }
    return s;
  }
  if(action.type==='SELECT_WIRE'&&phase==='choose'&&!s.motion&&wireInfo(action.id)){
    g.armControl.x=g.armControl.y=0;
    if(g.selected===action.id)return s;
    const old=g.selected,points=[];
    if(old)points.push(PANDA_GAME_POSES[old].hover);
    const target=PANDA_GAME_POSES[action.id];
    if(old || s.joints.some((q,i)=>Math.abs(q-target.hover[i])>1e-6)) points.push(target.hover);
    points.push(target.touch);
    g.selected=action.id;g.feedback='';startMotion(s,'move',old?3:2.8,points);log(s,`SELECT_${action.id.toUpperCase()}`);return s;
  }
  if(action.type==='CUT_WIRE'&&phase==='choose'&&g.selected&&!s.motion){
    g.armControl.x=g.armControl.y=0;
    if(g.selected!==g.goal){
      g.mistakes++;g.feedback=g.selected;s.message='목표 표식과 다른 색입니다. 목표 색을 다시 보고 골라 주세요.';
      if(m.errors.length<100)m.errors.push({code:'WRONG_COLOUR',message:'화면의 목표 색과 다른 선을 선택했습니다.'});
      if(m.mode==='independent')g.remaining=Math.max(0,g.remaining-10);
      log(s,'WRONG_COLOUR','error');
      if(g.remaining<=0){g.active=false;s.power=false;m.phase='failed';log(s,'GAME_TIME_EXPIRED');}
      return s;
    }
    g.active=false;m.phase='cutting';startMotion(s,'cut',1.6);log(s,'GAME_CUT_STARTED');return s;
  }
  if(action.type==='TICK'){
    if(!Number.isFinite(action.seconds)||action.seconds<=0||action.seconds>.15)return s;
    const dt=action.seconds;
    if(g.active&&m.mode==='independent'){
      g.remaining=Math.max(0,g.remaining-dt);
      if(g.remaining<=1e-8){g.remaining=0;g.active=false;g.armControl.x=g.armControl.y=0;s.motion=null;s.power=false;m.phase='failed';s.message='시간이 끝났습니다. 다시 연습할 수 있습니다.';log(s,'GAME_TIME_EXPIRED');return s;}
    }
    if(!s.motion){
      if (phase==='choose' && (g.armControl.x || g.armControl.y)) moveGripper(s,dt);
      return s;
    }
    const motion=s.motion;motion.elapsed=Math.min(motion.duration,motion.elapsed+dt);
    const t=motion.elapsed/motion.duration,u=t*t*(3-2*t);
    if(motion.points.length){
      const position=u*motion.points.length,index=Math.min(motion.points.length-1,Math.floor(position)),alpha=Math.min(1,position-index);
      const from=index?motion.points[index-1]:motion.from,to=motion.points[index];s.joints=from.map((q,i)=>q+(to[i]-q)*alpha);
    }
    if(motion.kind==='cut'){
      s.opening=.04-.031*Math.sin(Math.PI*t);
      if(t>=.65)g.cut=g.selected;
    }
    if(t>=1){
      s.motion=null;
      if (motion.kind==='move') { g.armControl.lane=lanes.indexOf(g.selected)-1; g.armControl.height=0; }
      if(motion.kind==='clean'){s.maintenance.clean=true;m.phase='tighten';log(s,'GRIPPER_CLEANED');}
      if(motion.kind==='tighten'){s.maintenance.tightened=true;m.phase='brief';log(s,'TRAINING_BOLT_TIGHTENED');}
      if(motion.kind==='cut'){
        g.cut=g.selected;s.opening=.04;m.phase='returning';
        startMotion(s,'return',2.6,[PANDA_GAME_POSES[g.selected].hover,PANDA_RIG.poses.home]);log(s,'VIRTUAL_WIRE_CUT');
      }else if(motion.kind==='return'){
        s.power=false;m.phase='complete';s.message=s.standalone?'가상 색상 퍼즐을 완료했습니다.':'정비와 가상 색상 퍼즐을 완료했습니다.';log(s,'GAME_COMPLETED');log(s,`ASSESSMENT_${pandaMissionAssessment(s).score}`);
      }
    }
  }
  return s;
}
export function pandaMissionAssessment(s) {
  const complete=s.mission.phase==='complete';
  const maintenance=Object.values(s.maintenance).filter(Boolean).length;
  const sections=s.standalone?[{id:'game',title:'색상 퍼즐',max:100,score:complete?Math.max(0,100-10*s.game.mistakes):0}]:[{id:'maintenance',title:'간단 정비',max:40,score:maintenance===3?40:0},{id:'game',title:'색상 퍼즐',max:60,score:complete?Math.max(0,60-10*s.game.mistakes):0}];
  return {sections,score:sections.reduce((n,r)=>n+r.score,0),errors:s.game.mistakes,hints:0,complete};
}
export function buildPandaMissionResult(s,{endedAt=new Date().toISOString()}={}) {
  if(s.mission.phase!=='complete')throw new Error('정비와 가상 게임을 완료해야 결과를 저장합니다.');
  const m=s.mission,end=new Date(Math.max(Date.parse(endedAt),Date.parse(m.startedAt))).toISOString();
  return {schemaVersion:1,attemptId:m.attemptId,session:m.session,trainee:m.trainee,scenarioId:s.standalone?'panda-wire-game-v2':PANDA_MISSION_ID,contentVersion:'1.0.0',profileVersion:'panda-ros-0.10.1',mode:m.mode,startedAt:m.startedAt,endedAt:end,durationSeconds:Math.min(604800,Math.max(0,Math.floor((Date.parse(end)-Date.parse(m.startedAt))/1000))),status:'completed',hints:0,errors:m.errors,events:m.events};
}
export function pandaMissionReportText(s) {
  const m=s.mission,a=pandaMissionAssessment(s);
  return ['AEROLAB · 로봇팔 가상 폭탄 해체 교육',`회차: ${m.session} / 교육생: ${m.trainee}`,`방식: ${m.mode==='guided'?'시간 제한 없는 연습':'90초 도전'}`,`게임 목표: ${wireInfo(s.game.goal).label} / 잘못된 선택: ${s.game.mistakes}회`,`학습 점검: ${a.score}/100`,...a.sections.map(r=>`${r.title}: ${r.score}/${r.max}`),'색상은 매회 정해지는 게임 표식입니다. 실제 폭발물 구조·배선·해체법과 무관합니다.'].join('\n');
}
