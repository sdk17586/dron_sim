import { createShowcaseDrone, droneShowcasePlan, applyDroneShowcaseAction } from '../src/domain/drone-showcase.js';
import { placePart } from '../src/domain/placement.js';
import { installedBattery } from '../src/domain/battery.js';
import { readyForMaintenance, physicalIssues, completionIssues } from '../src/domain/state.js';
import { SCENARIO } from '../src/content/scenarios.js';

const assert=(ok,message)=>{if(!ok)throw new Error(message);};
let state=createShowcaseDrone();const initial=structuredClone(state),plan=droneShowcasePlan();
let checkedChargedBattery=false,removedTips=false;
for(const step of plan){
  const op=step.operation;
  if(op.type==='action')state=applyDroneShowcaseAction(state,op.action);
  else if(op.type==='inspect')state=applyDroneShowcaseAction(state,{type:'INSPECT_MOTOR',motorId:op.motorId});
  else if(op.type==='place'){
    const index=Number((op.to==='drone-discard'?op.from:op.to).at(-1)),motorId=SCENARIO.target;
    let piece,target;
    if(op.from==='drone-battery')[piece,target]=[{kind:'battery',batteryId:installedBattery(state).id},{kind:'discard'}];
    else if(op.from==='pack-battery-02')[piece,target]=[{kind:'battery-pack',batteryId:'battery-02'},{kind:'battery-slot'}];
    else if(op.from==='drone-driver')[piece,target]=[{kind:'driver'},{kind:'screw',motorId,index}];
    else if(op.from.startsWith('blade-'))[piece,target]=[{kind:'mounted-blade',motorId,index,partId:state.motors[motorId].blades[index].id},{kind:'discard'}];
    else if(op.from.startsWith('new-blade-'))[piece,target]=[{kind:'blade',index,kitId:'A1'},{kind:'blade',motorId,index}];
    else [piece,target]=[{kind:'screw',index,kitId:'A1'},{kind:'screw',motorId,index}];
    if(['driver','mounted-blade','blade','screw'].includes(piece.kind))assert(readyForMaintenance(state),'Mechanical operations require isolation');
    if(piece.kind==='blade'){
      const wrong=placePart(state,{...piece,kitId:'B1'},target);
      assert(wrong.feedback.kind==='warning' && !wrong.state.motors[motorId].blades[index].present,'Wrong marks must stay rejected in the guide');
    }
    const next=placePart(state,piece,target);assert(next.feedback.kind==='success',next.feedback.message);state=next.state;
    if(op.from==='pack-battery-02')checkedChargedBattery=installedBattery(state).charge===100;
    if(state.motors[motorId].blades.every(b=>!b.present))removedTips=true;
  }
}
assert(checkedChargedBattery && removedTips,'The battery check and both removed blades must be shown');
assert(state.status==='completed' && readyForMaintenance(state),'Finish with power isolated and battery removed');
assert(!physicalIssues(state).length && !completionIssues(state).length && !state.errors.length,'Complete through actual diagnosis, parts, fastening and checks');
assert(Object.values(state.motors).every(m=>m.inspected && m.verdict),'Inspect and judge all four motors');
assert([...state.motors[SCENARIO.target].blades,...state.motors[SCENARIO.target].screws].every(p=>p.present && p.source==='new'),'Replace the whole pair and both screws');
assert(initial.power && initial.battery && initial.motors[SCENARIO.target].blades[0].condition==='damaged','Do not mutate the starting attempt');
assert(createShowcaseDrone().meta.attemptId!==initial.meta.attemptId,'Restart creates an isolated fresh attempt');
let blocked=false;try{applyDroneShowcaseAction(createShowcaseDrone(),{type:'FINAL_INSPECTION'});}catch{blocked=true;}
assert(blocked,'The guide cannot bypass completion checks');
assert(plan.at(-1).operation.type==='closing' && plan.at(-2).operation.action.type==='FINAL_INSPECTION','Present the completed model after the real final inspection');
console.log(`ALL PASS · 8 drone guide checks · ${plan.length} scenes · ${plan.reduce((ms,s)=>ms+s.hold,0)/1000}s holds plus placement animations`);
