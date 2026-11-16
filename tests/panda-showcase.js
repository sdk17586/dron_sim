import { pandaShowcasePlan, createPandaShowcase, advancePandaShowcase, PANDA_SHOWCASE_DURATION } from '../src/domain/panda-showcase.js';
const assert=(v,m)=>{if(!v)throw new Error(m);};let count=0;const test=(n,f)=>{f();count++;console.log('PASS',n);};
test('35초 가이드는 독립 해체의 색 선택·절단을 같은 도메인으로 수행',()=>{
 const plan=pandaShowcasePlan();assert(Math.abs(plan.reduce((n,s)=>n+s.hold+s.motion,0)-35)<1e-8,'duration');let p=createPandaShowcase(),seen=new Set();for(let i=0;i<1000&&!p.completed&&!p.error;i++){p=advancePandaShowcase(p,.05);seen.add(p.state.mission.phase);}assert(!p.error&&p.completed&&p.state.mission.phase==='complete',p.error||'finish');assert(Math.abs(p.elapsed-PANDA_SHOWCASE_DURATION)<.001,'runtime');for(const phase of ['brief','choose','cutting','returning','complete'])assert(seen.has(phase),phase);assert(p.state.game.cut==='green'&&p.state.mission.errors.length===0,'game');
});
test('중단·재시작을 위한 이전 재생 상태 보존·잘못된 시간 무시',()=>{
 let p=createPandaShowcase();const initial=JSON.stringify(p);for(const dt of [0,-1,NaN,Infinity,.2])assert(advancePandaShowcase(p,dt)===p,'bad tick');const next=advancePandaShowcase(p,.1);assert(JSON.stringify(p)===initial&&next.elapsed>.09,'mutation');assert(createPandaShowcase().state.mission.attemptId!==p.state.mission.attemptId,'restart ID');
});
test('완료 이후 재생은 결과·점수 변경 없음, 잘못된 계획은 명시적 오류',()=>{
 let p=createPandaShowcase();for(let i=0;i<1000&&!p.completed&&!p.error;i++)p=advancePandaShowcase(p,.05);assert(advancePandaShowcase(p,.1)===p,'complete changed');const plan=pandaShowcasePlan();plan[0].action={type:'CUT_WIRE'};assert(advancePandaShowcase(createPandaShowcase(),.1,plan).error,'bad plan accepted');
});
console.log(`${count} Panda guide tests passed`);
