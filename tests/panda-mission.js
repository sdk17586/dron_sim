import { createPandaMissionState, pandaMissionTransition as act, pandaMissionAssessment, buildPandaMissionResult, pandaMissionReportText, WIRE_COLORS } from '../src/domain/panda-mission.js';
import { PANDA_RIG as R, pandaTCP } from '../src/domain/panda.js';
import { normalizeRecord, ResultRepository } from '../src/storage/result-repository.js';
import { exportCSV, parseCSV } from '../src/storage/csv.js';
const assert=(v,m)=>{if(!v)throw new Error(m);},same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
let count=0;const test=(n,f)=>{f();count++;console.log('PASS',n);};
export function run(s){for(let i=0;s.motion&&i<150;i++){s=act(s,{type:'TICK',seconds:.05});s.joints.forEach((q,j)=>assert(q>=R.limits[j][0]&&q<=R.limits[j][1],'joint limit'));}return s;}
export function prepared(mode='guided',goal='green'){
 let s=createPandaMissionState({mode,goal});s=act(s,{type:'CONFIRM_OFF'});s=run(act(s,{type:'CLEAN'}));s=run(act(s,{type:'TIGHTEN'}));return s;
}
export const game=(mode='guided',goal='green')=>act(prepared(mode,goal),{type:'START_GAME'});
export const selected=(s,id)=>run(act(s,{type:'SELECT_WIRE',id}));
export const completed=(mode='guided',goal='green')=>run(act(selected(game(mode,goal),goal),{type:'CUT_WIRE'}));
test('정비 3단계 순서를 지키고 정비 완료 전 게임·선택 차단',()=>{
 let s=createPandaMissionState();for(const type of ['CLEAN','TIGHTEN','START_GAME','CUT_WIRE'])assert(same(s,act(s,{type})),'bypass '+type);
 s=act(s,{type:'CONFIRM_OFF'});assert(!s.power&&s.mission.phase==='clean','off');s=act(s,{type:'CLEAN'});assert(s.motion&&same(s,act(s,{type:'TIGHTEN'})),'motion bypass');s=run(s);assert(s.maintenance.clean&&!s.maintenance.tightened,'clean');s=run(act(s,{type:'TIGHTEN'}));assert(s.mission.phase==='brief'&&Object.values(s.maintenance).every(Boolean),'service');
});
test('세 색 모두 집게가 선택한 가상 선 위치에 도착·다른 색으로 재선택',()=>{
 let s=game();for(const [i,w] of WIRE_COLORS.entries()){s=selected(s,w.id);assert(s.game.selected===w.id&&!s.motion,'selection');assert(Math.hypot(...pandaTCP(s.joints).map((v,j)=>v-[.45,-(.14+i*.08),.028][j]))<.00001,'TCP misses wire');}
});
test('다른 색 확인은 실제 절단 없이 오류·점수 기록, 도전만 10초 감소',()=>{
 for(const mode of ['guided','independent']){let s=selected(game(mode),'red');const before=structuredClone(s);s=act(s,{type:'CUT_WIRE'});assert(!s.game.cut&&!s.motion&&s.mission.phase==='choose','wrong cut');assert(s.game.mistakes===1&&s.mission.errors.length===1,'mistake');assert(s.game.remaining===before.game.remaining-(mode==='independent'?10:0),'penalty');s=run(act(selected(s,'green'),{type:'CUT_WIRE'}));assert(pandaMissionAssessment(s).score===90,'score');assert(before.game.mistakes===0,'mutation');}
});
test('모든 목표 색은 집게 닫힘·선 절단·복귀 후 전원 차단·완료',()=>{
 for(const w of WIRE_COLORS){let s=selected(game('guided',w.id),w.id);s=act(s,{type:'CUT_WIRE'});assert(!s.game.active&&s.mission.phase==='cutting'&&!s.game.cut,'cut timing');for(let i=0;i<20;i++)s=act(s,{type:'TICK',seconds:.05});assert(s.opening<.04&&!s.game.cut,'fingers');s=run(s);assert(s.mission.phase==='complete'&&s.game.cut===w.id&&!s.power,'finish');assert(same(s.joints,R.poses.home),'return');assert(pandaMissionAssessment(s).score===100,'score');}
});
test('연습 모드는 제한 없음, 도전만 게임 시작 후 90초·시간 초과 결과 미저장',()=>{
 let s=game();for(let i=0;i<950;i++)s=act(s,{type:'TICK',seconds:.1});assert(s.game.remaining===90&&s.mission.phase==='choose','practice timer');s=game('independent');for(let i=0;i<900;i++)s=act(s,{type:'TICK',seconds:.1});assert(s.mission.phase==='failed'&&s.game.remaining===0&&!s.power&&!s.motion,'timeout');let threw=false;try{buildPandaMissionResult(s);}catch{threw=true;}assert(threw,'timeout saved');
});
test('정비와 게임 중 정지 시 자세·집게·남은 시간 모두 유지, 재개 후 이어가기',()=>{
 for(let s of [act(act(createPandaMissionState(),{type:'CONFIRM_OFF'}),{type:'CLEAN'}),act(game('independent'),{type:'SELECT_WIRE',id:'green'})]){s=act(s,{type:'TICK',seconds:.1});s=act(s,{type:'PAUSE'});const paused=structuredClone(s);for(let i=0;i<20;i++)s=act(s,{type:'TICK',seconds:.1});assert(same(paused,s),'pause drift');assert(same(s,act(s,{type:'SELECT_WIRE',id:'black'})),'paused select');s=run(act(s,{type:'RESUME'}));assert(!s.motion&&!s.estop,'resume');}
});
test('선택 대기 중에도 정지 가능·다른 색 감점으로 0초가 되면 종료',()=>{
 let s=act(game('independent'),{type:'STOP'});assert(s.estop&&same(s,act(s,{type:'TICK',seconds:.1})),'idle stop');s=selected(game('independent'),'red');s.game.remaining=5;s=act(s,{type:'CUT_WIRE'});assert(s.mission.phase==='failed'&&s.game.remaining===0&&!s.game.active,'penalty timeout');
});
test('정비·완료·실패 상태에서 재시작하면 메타데이터 유지·새 게임·새 시도 ID',()=>{
 for(const old of [game('independent'),completed()]){const s=act(old,{type:'RESET'});assert(s.mission.attemptId!==old.mission.attemptId&&s.mission.session===old.mission.session&&s.mission.mode===old.mission.mode,'metadata');assert(s.mission.phase==='isolate'&&!s.game.selected&&s.game.remaining===90&&!Object.values(s.maintenance).some(Boolean),'fresh');}
});
test('비정상 틱·중복 선택·움직임 중 절단은 무시, 입력 상태 불변',()=>{
 const s=act(game(),{type:'SELECT_WIRE',id:'green'}),copy=structuredClone(s);for(const seconds of [-1,0,NaN,Infinity,.16])assert(same(s,act(s,{type:'TICK',seconds})),'tick');assert(same(s,act(s,{type:'CUT_WIRE'}))&&same(s,copy),'motion cut');const invalid=game();assert(same(invalid,act(invalid,{type:'SELECT_WIRE',id:'orange'})),'invalid colour');const ready=run(s);assert(same(ready,act(ready,{type:'SELECT_WIRE',id:'green'})),'duplicate');
});
test('반복 오답에도 점수 하한·로그 상한 유지, 이전 회수 기록과 새 결과 함께 보관',()=>{
 let s=selected(game(),'red');for(let i=0;i<220;i++)s=act(s,{type:'CUT_WIRE'});s=run(act(selected(s,'green'),{type:'CUT_WIRE'}));assert(pandaMissionAssessment(s).score===40,'section floor');assert(s.mission.errors.length===100&&s.mission.events.length<=180,'unbounded log');
 const r=buildPandaMissionResult(s),memory=new Map(),repo=new ResultRepository({getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)});repo.add({...r,attemptId:'legacy-recovery-record',scenarioId:'reserve-relief-recovery-v1'});repo.add(r);assert(repo.load().records.length===2&&repo.load().records[0].scenarioId==='reserve-relief-recovery-v1','legacy lost');
});
test('결과 공통 저장·CSV 왕복·요약 및 이전 시도 덮어쓰기 방지',()=>{
 const s=completed(),r=buildPandaMissionResult(s),normalized=normalizeRecord(r);assert(normalized.scenarioId==='panda-service-wire-game-v1','schema');const parsed=parseCSV(exportCSV([r]));assert(parsed.records?.length===1||parsed.length===1,'csv');const memory=new Map(),store={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};const repo=new ResultRepository(store);repo.add(r);repo.add(r);assert(repo.load().records.length===1,'duplicate');assert(pandaMissionReportText(s).includes('목표: 초록 선'),'report');assert(s.mission.events.some(e=>e.code==='ASSESSMENT_100'),'score event');
});
test('직접 조종으로 세 가상 선 정렬·공중 절단 방지·손을 떼면 정지·완료',()=>{
 for (const [i,wire] of WIRE_COLORS.entries()) {
  let s=act(createPandaMissionState({standalone:true,goal:wire.id}),{type:'START_GAME'});
  const drive=(x,y,frames)=>{
   s=act(s,{type:'STICK',side:'gripper',x,y});
   for (let j=0;j<frames;j++) s=act(s,{type:'TICK',seconds:.05});
   s=act(s,{type:'CENTER'});
  };
  drive(1-i,0,25);
  assert(!s.game.selected && same(s,act(s,{type:'CUT_WIRE'})),'cut in air');
  drive(0,-1,30);
  const tip=pandaTCP(s.joints);
  assert(s.game.selected===wire.id && Math.hypot(tip[0]-.45,tip[1]+.14+i*.08,tip[2]-.028)<.001,'manual alignment');
  assert(same(s.joints,act(s,{type:'TICK',seconds:.1}).joints),'drift after release');
  drive(0,1,10);assert(!s.game.selected,'lift should clear contact');
  drive(0,-1,30);s=run(act(s,{type:'CUT_WIRE'}));
  assert(s.mission.phase==='complete' && s.game.cut===wire.id && pandaMissionAssessment(s).score===100,'manual finish');
 }
});
test('자동 이동 뒤 스틱을 잡아도 자세 연속·정지와 재개 시 잔류 입력 없음',()=>{
 let s=selected(game(),'black');
 const before=pandaTCP(s.joints);
 for(const invalid of [Infinity,NaN])assert(same(s,act(s,{type:'STICK',side:'gripper',x:invalid,y:0})),'invalid input');
 s=act(s,{type:'STICK',side:'gripper',x:1,y:0});
 assert(Math.hypot(...pandaTCP(s.joints).map((v,i)=>v-before[i]))<.01,'jump from automatic move');
 s=act(s,{type:'PAUSE'});const frozen=[...s.joints];
 s=act(s,{type:'RESUME'});s=act(s,{type:'TICK',seconds:.1});
 assert(same(frozen,s.joints)&&!s.game.armControl.x,'stale stick after pause');
});
console.log(`${count} Panda wire-game tests passed`);
