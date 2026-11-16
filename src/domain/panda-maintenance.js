import { createPandaState } from './panda.js';
export const PANDA_MAINTENANCE_ID='panda-gripper-replacement-v1';
const id=()=>globalThis.crypto.randomUUID?.()||Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-');
export function createPandaMaintenanceState({session='훈련-01',trainee='001',startedAt=new Date().toISOString()}={}){
 return {...createPandaState(),power:true,estop:false,moduleId:'PG-01',status:'active',meta:{attemptId:id(),session,trainee,startedAt},verified:{stop:false,power:false},gripper:{present:true,source:'original',inspected:false,verdict:null,connected:true,bolts:[true,true],spare:true},discarded:[],tested:false,testing:null,checks:{fastening:false,connection:false,movement:false},errors:[],events:[],revision:0};
}
export const pandaServiceIsolated=s=>s.estop&&!s.power&&s.verified.stop&&s.verified.power;
export const pandaGripperAssembled=s=>s.gripper.present&&s.gripper.source==='new'&&s.gripper.connected&&s.gripper.bolts.every(Boolean);
const tasks=s=>[
 ['stop','비상 정지를 누르세요','로봇팔 베이스의 빨간 정지 스위치를 누릅니다.','비상 정지 스위치',s.verified.stop,0],
 ['power-off','주 전원을 차단하세요','베이스의 전원 스위치를 눌러 정비 전 전원을 끕니다.','주 전원 스위치',s.verified.power,0],
 ['inspect','고장 난 그리퍼를 살펴보세요','그리퍼를 클릭하면 확대됩니다. 두 집게 끝이 마주 보는지, 한쪽 패드가 떨어져 나갔는지 살펴보세요.','로봇팔 끝의 그리퍼',s.gripper.inspected,1],
 ['diagnose','그리퍼 상태를 판단하세요','손상 부위를 확인하고 ‘교체 필요’를 선택하세요.','관찰 패널의 상태 판단',s.gripper.verdict==='replace',1],
 ['disconnect','그리퍼 커넥터를 분리하세요','그리퍼 옆 커넥터를 클릭해 연결을 분리합니다.','그리퍼 커넥터',s.discarded.includes('disconnect'),2],
 ...[0,1].map(i=>[`unbolt-${i}`,`${i+1}번 고정 볼트를 푸세요`,'작업대의 육각 공구를 집어 볼트에 놓으세요. 볼트가 제자리에서 천천히 회전합니다.',`${i+1}번 고정 볼트`,s.discarded.includes(`bolt-${i}`),2]),
 ['remove','손상 그리퍼를 분리하세요','손상 그리퍼를 집어 아래 분리 부품 수거함으로 옮깁니다.','손상 그리퍼 → 수거함',s.discarded.includes('gripper'),2],
 ['install','새 그리퍼를 장착하세요','작업대의 PG-01 새 그리퍼를 집어 빈 장착부에 놓습니다.','PG-01 새 그리퍼 → 장착부',s.gripper.source==='new',3],
 ...[0,1].map(i=>[`fasten-${i}`,`${i+1}번 고정 볼트를 체결하세요`,'작업대의 육각 공구를 집어 새 그리퍼의 고정 볼트에 놓으세요.',`${i+1}번 고정 볼트`,s.gripper.source==='new'&&s.gripper.bolts[i],3]),
 ['connect','그리퍼 커넥터를 연결하세요','체결을 마친 뒤 커넥터를 눌러 연결합니다.','그리퍼 커넥터',s.gripper.source==='new'&&s.gripper.connected,3],
 ['test-power','시험을 위해 전원을 켜세요','새 그리퍼가 장착·체결·연결됐는지 확인하고 전원을 켭니다.','주 전원 스위치',s.tested||s.testing||pandaGripperAssembled(s)&&s.power,4],
 ['test-release','시험 전 비상 정지를 해제하세요','주 전원을 켠 뒤 비상 정지 스위치를 눌러 해제합니다.','비상 정지 스위치',s.tested||s.testing||pandaGripperAssembled(s)&&s.power&&!s.estop,4],
 ['test','그리퍼 개폐 시험을 하세요','‘그리퍼 작동 시험’을 누르고 두 손가락이 대칭으로 열리고 닫히는지 확인합니다.','작동 확인 패널',s.tested,4],
 ['final-stop','시험 후 비상 정지를 누르세요','시험을 마쳤습니다. 비상 정지를 눌러 장비를 정지합니다.','비상 정지 스위치',s.tested&&s.estop,4],
 ['final-power','마지막으로 전원을 끄세요','전원을 끄고 체결·연결·개폐 상태를 최종 확인합니다.','주 전원 스위치',s.tested&&!s.power,4],
 ['finish','최종 확인 후 정비를 완료하세요','세 항목을 직접 확인하고 ‘정비 완료’를 누르세요.','최종 확인 패널',s.status==='completed',4],
];
export function pandaMaintenanceGuide(s){
 const all=tasks(s),pending=all.filter(t=>!t[4]),t=pending[0]||['complete','그리퍼 정비를 마쳤습니다','고장 점검부터 교체·체결·작동 확인까지 완료했습니다.','훈련 기록',true,4];
 const names=['전원 차단','고장 점검','손상 부품 분리','새 그리퍼 장착','작동·최종 확인'];
 return {complete:s.status==='completed',current:{id:t[0],title:t[1],detail:t[2],targetLabel:t[3],target:{kind:'panda-service'}},upNext:pending[1]?{title:pending[1][1]}:null,remaining:pending.length,summary:`${all.filter(t=>t[4]).length} / ${all.length} 작업 완료`,workflow:names.map((label,i)=>({label,state:s.status==='completed'||i<t[5]?'done':i===t[5]?'current':'pending'})),phases:names.map((title,i)=>({title,tasks:all.filter(t=>t[5]===i).map(t=>({id:t[0],title:t[1],detail:t[2],targetLabel:t[3],done:!!t[4]}))}))};
}
function log(s,code,type='action'){s.revision++;s.events.push({code,type,motor:'gripper',revision:s.revision});if(s.events.length>180)s.events.shift();}
function reject(s,message){s.message=message;if(s.errors.at(-1)?.message!==message){if(s.errors.length<100)s.errors.push({code:'SERVICE_ORDER',message});log(s,'SERVICE_ORDER','error');}return s;}
export function pandaMaintenanceTransition(state,a){
 if(a.type==='RESET')return createPandaMaintenanceState({session:state.meta.session,trainee:state.meta.trainee});
 const s=structuredClone(state),g=s.gripper;if(s.status!=='active')return s;
 if(a.type==='MODULE'&&['PG-01','PG-02'].includes(a.moduleId)&&!s.testing){s.moduleId=a.moduleId;return s;}
 if(a.type==='PAUSE'){if(s.testing){s.testing=null;s.tested=false;s.opening=.04;s.estop=true;s.message='작동 시험이 중단됐습니다. 비상 정지 해제 후 다시 시험하세요.';log(s,'TEST_CANCELLED');}return s;}
 if(a.type==='STOP'){
  if(!s.estop){s.estop=true;s.verified.stop=true;if(s.testing){s.testing=null;s.tested=false;s.opening=.04;}log(s,'ESTOP_ON');}
  else if(s.power&&pandaGripperAssembled(s)){s.estop=false;log(s,'ESTOP_RELEASED');}
  else return reject(s,'교체·체결·연결 후 전원을 켜야 비상 정지를 해제할 수 있습니다.');
  s.message='';return s;
 }
 if(a.type==='POWER'){
  if(s.power){if(!s.estop)return reject(s,'먼저 비상 정지를 누르세요.');s.power=false;s.verified.power=true;s.testing=null;log(s,'POWER_OFF');}
  else{if(!pandaGripperAssembled(s))return reject(s,'새 그리퍼 장착·두 볼트 체결·커넥터 연결을 먼저 마치세요.');s.power=true;log(s,'POWER_ON');}s.message='';return s;
 }
 if(a.type==='INSPECT'){if(!pandaServiceIsolated(s))return reject(s,'비상 정지와 주 전원 차단을 먼저 확인하세요.');g.inspected=true;log(s,'GRIPPER_INSPECTED');s.message='집게 패드가 서로 마주 보는지 확인하세요.';return s;}
 if(a.type==='DIAGNOSE'){if(!g.inspected||!pandaServiceIsolated(s))return reject(s,'전원을 차단하고 그리퍼를 먼저 관찰하세요.');if(a.verdict!=='replace')return reject(s,'한쪽 손가락의 변형으로 두 패드가 맞물리지 않습니다. 하우징에도 균열이 있어 교체가 필요합니다.');g.verdict='replace';log(s,'GRIPPER_REPLACE_REQUIRED');s.message='';return s;}
 if(a.type==='CONNECTOR'){
  if(!pandaServiceIsolated(s)||g.verdict!=='replace')return reject(s,'전원 차단과 고장 판단을 먼저 마치세요.');
  if(g.source==='original'&&g.connected){g.connected=false;s.discarded.push('disconnect');log(s,'CONNECTOR_REMOVED');}
  else if(g.source==='new'&&g.bolts.every(Boolean)&&!g.connected){g.connected=true;log(s,'CONNECTOR_CONNECTED');}
  else return reject(s,'새 그리퍼의 두 볼트를 모두 체결한 뒤 연결하세요.');s.message='';return s;
 }
 if(a.type==='PLACE'){
  const p=a.piece,t=a.target;if(!p||!t)return s;
  if(!pandaServiceIsolated(s)||g.verdict!=='replace')return reject(s,'비상 정지·전원 차단·고장 판단을 먼저 마치세요.');
  if(p.kind==='panda-driver'&&t.kind==='panda-bolt'&&[0,1].includes(t.index)){
   if(g.connected)return reject(s,'먼저 그리퍼 커넥터를 분리하세요.');
   if(!g.present)return reject(s,'그리퍼를 장착한 뒤 볼트를 체결하세요.');
   if(g.source==='original'&&g.bolts[t.index]){g.bolts[t.index]=false;s.discarded.push(`bolt-${t.index}`);log(s,`BOLT_${t.index}_REMOVED`);}
   else if(g.source==='new'&&!g.bolts[t.index]){g.bolts[t.index]=true;log(s,`BOLT_${t.index}_FASTENED`);}
   else return reject(s,'이 볼트 작업은 이미 마쳤습니다.');
  }else if(p.kind==='panda-mounted-gripper'&&t.kind==='panda-discard'){
   if(g.connected||g.bolts.some(Boolean))return reject(s,'커넥터와 두 고정 볼트를 먼저 분리하세요.');
   if(!g.present||g.source!=='original')return reject(s,'분리할 손상 그리퍼가 없습니다.');g.present=false;s.discarded.push('gripper');log(s,'DAMAGED_GRIPPER_DISCARDED');
  }else if(p.kind==='panda-gripper'&&t.kind==='panda-gripper-slot'){
   if(p.moduleId!=='PG-01')return reject(s,'규격이 다릅니다. PG-01 그리퍼를 선택하세요.');
   if(g.present||!g.spare)return reject(s,'손상 그리퍼를 먼저 수거함으로 옮기세요.');g.present=true;g.source='new';g.spare=false;g.bolts=[false,false];g.connected=false;log(s,'NEW_GRIPPER_INSTALLED');
  }else return reject(s,'이 부품을 놓을 위치가 아닙니다.');s.message='작업을 마쳤습니다.';return s;
 }
 if(a.type==='TEST'){
  if(!pandaGripperAssembled(s)||!s.power||s.estop||s.testing||s.tested)return reject(s,'장착·체결·연결 후 전원을 켜고 비상 정지를 해제하세요.');s.testing={elapsed:0,duration:4};s.message='그리퍼 개폐 시험 중…';log(s,'GRIPPER_TEST_STARTED');return s;
 }
 if(a.type==='TICK'&&s.testing&&Number.isFinite(a.seconds)&&a.seconds>0&&a.seconds<=.15){
  if(!s.power||s.estop||!pandaGripperAssembled(s))return pandaMaintenanceTransition(s,{type:'PAUSE'});
  s.testing.elapsed=Math.min(4,s.testing.elapsed+a.seconds);s.opening=.025+.015*Math.cos(s.testing.elapsed*Math.PI);
  if(s.testing.elapsed>=4){s.testing=null;s.tested=true;s.opening=.04;s.message='그리퍼 개폐 시험을 마쳤습니다. 비상 정지 후 전원을 끄세요.';log(s,'GRIPPER_TEST_PASSED');}return s;
 }
 if(a.type==='CHECK'&&Object.hasOwn(s.checks,a.key)){if(!s.tested||!pandaServiceIsolated(s))return reject(s,'시험 후 비상 정지와 전원 차단을 먼저 확인하세요.');s.checks[a.key]=a.value===true;return s;}
 if(a.type==='COMPLETE'){
  if(!pandaServiceIsolated(s)||!pandaGripperAssembled(s)||!s.tested||!Object.values(s.checks).every(Boolean))return reject(s,'교체·체결·연결·작동 시험과 최종 확인을 모두 마치세요.');s.status='completed';log(s,'MAINTENANCE_COMPLETED');s.message='그리퍼 정비를 마쳤습니다.';
 }
 return s;
}
export function buildPandaMaintenanceResult(s,{status=s.status,endedAt=new Date().toISOString()}={}){
 if(!['completed','abandoned'].includes(status)||status==='completed'&&s.status!=='completed')throw new Error('정비를 마친 뒤 결과를 저장하세요.');
 const end=new Date(Math.max(Date.parse(endedAt),Date.parse(s.meta.startedAt))).toISOString();
 return {schemaVersion:1,attemptId:s.meta.attemptId,session:s.meta.session,trainee:s.meta.trainee,scenarioId:PANDA_MAINTENANCE_ID,contentVersion:'1.0.0',profileVersion:'panda-ros-0.10.1',mode:'guided',startedAt:s.meta.startedAt,endedAt:end,durationSeconds:Math.min(604800,Math.max(0,Math.floor((Date.parse(end)-Date.parse(s.meta.startedAt))/1000))),status,hints:0,errors:s.errors,events:s.events};
}
