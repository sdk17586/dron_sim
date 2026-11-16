import {createPandaState,pandaTransition as act,pandaStep,pandaTCP,PANDA_RIG as R} from '../src/domain/panda.js';
const assert=(value,message)=>{if(!value)throw new Error(message);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
let count=0;
const test=(name,fn)=>{fn();console.log('PASS',name);count++;};
function finish(s){for(let i=0;s.motion&&i<120;i++)s=act(s,{type:'TICK',seconds:.1});assert(!s.motion,'motion unfinished');return s;}
function next(s){return finish(act(s,{type:'EXECUTE',step:pandaStep(s)[0]}));}
function until(step){let s=createPandaState();while(pandaStep(s)[0]!==step)s=next(s);return s;}

test('전원 투입 전 이동·순서 건너뛰기·중복 입력은 진행하지 않음',()=>{
  let s=createPandaState();assert(same(s,act(s,{type:'EXECUTE',step:'transfer'})),'skip accepted');
  s=act(next(s),{type:'EXECUTE',step:'approach'});const before=structuredClone(s);
  assert(same(s,act(s,{type:'EXECUTE',step:'pick'})),'double action accepted');assert(same(s,before),'input mutated');
});
test('전원 확인부터 운반·복귀·전원 끄기까지 실제 행동 후에만 완료',()=>{
  let s=createPandaState();for(let i=0;i<11;i++){assert(s.step===i,'step skipped');s=next(s);}
  assert(s.step===11&&!s.power&&!s.holding&&s.placed,'incomplete');assert(distance(s.object,R.target)<.001,'object missed target');
  assert(same(s.joints,R.poses.home),'not home');
});
test('집게가 물체에서 멀면 잡기 거부, 물체는 잡기 완료 전에 이동하지 않음',()=>{
  let s=until('grasp'),bad={...s,object:[0,0,0]};assert(!act(bad,{type:'EXECUTE',step:'grasp'}).motion,'remote grasp');
  s=act(s,{type:'EXECUTE',step:'grasp'});const object=[...s.object];
  s=act(s,{type:'TICK',seconds:.1});assert(!s.holding&&same(s.object,object),'early attach');
  s=finish(s);assert(s.holding&&s.opening===.025,'no grasp');
});
test('운반 중 물체가 집게 위치를 따르고 작업대 위로 충분히 올라감',()=>{
  let s=until('transfer');s=act(s,{type:'EXECUTE',step:'transfer'});
  for(let i=0;i<32;i++){
    s=act(s,{type:'TICK',seconds:.1});assert(distance(s.object,pandaTCP(s.joints))<1e-9,'cube detached');
    assert(s.object[2]>.29,'low transfer');
    assert(s.joints.every((v,i)=>v>=R.limits[i][0]&&v<=R.limits[i][1]),'joint limit exceeded');
  }
});
test('놓은 물체는 목표에 남고 로봇팔만 빠져나와 복귀',()=>{
  let s=next(until('release'));const object=[...s.object];assert(s.placed&&!s.holding,'not released');
  s=next(next(s));assert(same(s.object,object),'object followed open gripper');
});
test('공중에서 집게를 열거나 물체 없이 배치 완료 불가',()=>{
  let s=until('release');s.object=[.45,.22,.3];assert(!act(s,{type:'EXECUTE',step:'release'}).motion,'air release');
  s={...until('release'),holding:false};assert(!act(s,{type:'EXECUTE',step:'release'}).motion,'empty release');
});
test('긴급 정지는 위치와 집기 상태 보존, 명시적 재개 후 같은 경로 지속',()=>{
  let s=act(until('transfer'),{type:'EXECUTE',step:'transfer'});s=act(s,{type:'TICK',seconds:.1});
  s=act(s,{type:'STOP'});const frozen=structuredClone(s);for(let i=0;i<20;i++)s=act(s,{type:'TICK',seconds:.1});
  assert(same(s,frozen)&&s.holding,'stop drift');s=finish(act(s,{type:'RESUME'}));assert(pandaStep(s)[0]==='place','resume failed');
});
test('잘못된 시간 간격 무시, 다시 시작하면 집기·진행·전원·정지 모두 초기화',()=>{
  const s=act(until('lift'),{type:'EXECUTE',step:'lift'});
  for(const seconds of [NaN,Infinity,-1,0,2])assert(same(s,act(s,{type:'TICK',seconds})),'bad tick');
  assert(same(act(s,{type:'RESET'}),createPandaState()),'reset incomplete');
});
test('전체 보간 경로가 관절 한계 내에 있고 집는 위치·놓는 위치 일치',()=>{
  let s=createPandaState();for(let i=0;i<11;i++){
    s=act(s,{type:'EXECUTE',step:pandaStep(s)[0]});
    for(let j=0;s.motion&&j<200;j++){
      s=act(s,{type:'TICK',seconds:.05});assert(s.joints.every((q,i)=>Number.isFinite(q)&&q>=R.limits[i][0]&&q<=R.limits[i][1]),'bad path');
      assert(pandaTCP(s.joints)[2]>.023,'TCP through table');
    }
  }
  assert(distance(pandaTCP(R.poses.pick),R.source)<.001&&distance(pandaTCP(R.poses.place),R.target)<.001,'IK residual');
});
console.log(`${count} Panda checks passed`);
