import * as THREE from '../vendor/three/three.module.min.js';
import { PANDA_RIG as R } from '../content/panda-rig.js';

export const PANDA_STEPS = [
  ['power', '로봇 전원을 켜세요', '전원을 켜면 물체를 옮기는 실습을 시작합니다.', '전원 켜기'],
  ['approach', '물체 위로 이동하세요', '파란 물체 위의 대기 위치로 로봇팔을 이동합니다.', '물체 위로 이동'],
  ['pick', '집는 높이로 내리세요', '집게를 연 상태로 물체 양옆까지 천천히 내립니다.', '집는 높이로 내리기'],
  ['grasp', '집게를 닫아 물체를 잡으세요', '집게가 닫힌 뒤 물체가 집게에 고정됩니다.', '집게 닫기'],
  ['lift', '물체를 들어 올리세요', '작업대에서 충분히 들어 올린 다음 운반합니다.', '들어 올리기'],
  ['transfer', '목표 위로 운반하세요', '물체를 든 상태로 주황색 목표 지점 위까지 이동합니다.', '목표 위로 운반'],
  ['place', '목표에 내려놓으세요', '목표 지점의 작업대 높이까지 천천히 내립니다.', '목표에 내리기'],
  ['release', '집게를 열어 물체를 놓으세요', '집게를 열면 물체가 목표 위치에 남습니다.', '집게 열기'],
  ['retreat', '집게를 위로 올리세요', '놓은 물체와 부딪히지 않도록 먼저 위로 빠져나옵니다.', '집게 올리기'],
  ['home', '대기 자세로 복귀하세요', '물체를 목표에 남겨둔 채 로봇팔만 시작 자세로 돌아갑니다.', '대기 자세 복귀'],
  ['shutdown', '전원을 끄고 마무리하세요', '운반을 마쳤습니다. 전원을 끄면 교육이 완료됩니다.', '전원 끄고 완료'],
  ['complete', '물체 운반을 완료했습니다', '집기·들어 올리기·운반·내려놓기·대기 자세 복귀를 모두 마쳤습니다.', '교육 완료'],
];
const zAxis = new THREE.Vector3(0, 0, 1);
const transform = (xyz, rpy) => new THREE.Matrix4().compose(new THREE.Vector3(...xyz),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(...rpy, 'ZYX')), new THREE.Vector3(1,1,1));
const origins = R.origins.map(([xyz,rpy]) => transform(xyz,rpy));
export function pandaTCP(joints) {
  const t = new THREE.Matrix4();
  joints.forEach((q,i) => t.multiply(origins[i]).multiply(new THREE.Matrix4().makeRotationZ(q)));
  t.multiply(transform([0,0,.107],[0,0,-Math.PI/4])).multiply(transform([0,0,.1034],[0,0,0]));
  return new THREE.Vector3().setFromMatrixPosition(t).toArray();
}
export function createPandaState() {
  return { step:0, power:false, estop:false, joints:[...R.poses.home], opening:.04,
    object:[...R.source], holding:false, placed:false, motion:null, message:'' };
}
export function pandaStep(s) { return PANDA_STEPS[s.step]; }
const distance = (a,b) => Math.hypot(...a.map((v,i)=>v-b[i]));
export function pandaTransition(state, action) {
  const s = structuredClone(state), step = pandaStep(s)[0];
  if (action.type === 'RESET') return createPandaState();
  if (action.type === 'STOP') { if (s.power && step!=='complete') { s.estop=true; s.message=action.reason || '긴급 정지했습니다. 재개를 눌러야 다시 움직입니다.'; } return s; }
  if (action.type === 'RESUME') { s.estop=false; s.message=''; return s; }
  if (action.type === 'EXECUTE') {
    if (s.motion || s.estop || action.step!==step || step==='complete') return s;
    if (step==='power') { s.power=true; s.step++; s.message=''; return s; }
    if (!s.power) return s;
    if (step==='shutdown') { if(s.placed && !s.holding) {s.power=false; s.step++;} return s; }
    if (step==='grasp' && distance(pandaTCP(s.joints),s.object)>.012) {s.message='집게를 물체의 집는 위치에 맞춰 주세요.';return s;}
    if (step==='release' && (!s.holding || distance(s.object,R.target)>.012)) return s;
    const points = ['grasp','release'].includes(step) ? [s.joints] : R.paths[step] || [R.poses[step]];
    if (!points?.every(p=>p?.length===7 && p.every((v,i)=>Number.isFinite(v)&&v>=R.limits[i][0]&&v<=R.limits[i][1]))) return s;
    s.motion={step,from:[...s.joints],opening:s.opening,points,elapsed:0,
      duration:['grasp','release'].includes(step)?.8:step==='transfer'?3.2:step==='home'?3:2};
    s.message=''; return s;
  }
  if (action.type==='TICK' && s.motion && s.power && !s.estop) {
    if(!Number.isFinite(action.seconds) || action.seconds<=0 || action.seconds>.15)return s;
    const m=s.motion; m.elapsed=Math.min(m.duration,m.elapsed+action.seconds);
    const t=m.elapsed/m.duration, smooth=t*t*(3-2*t), position=smooth*m.points.length;
    const segment=Math.min(m.points.length-1,Math.floor(position)), fraction=Math.min(1,position-segment);
    const from=segment?m.points[segment-1]:m.from, to=m.points[segment];
    s.joints=from.map((q,i)=>q+(to[i]-q)*fraction);
    if(m.step==='grasp' || m.step==='release') s.opening=m.opening+((m.step==='grasp'?.025:.04)-m.opening)*smooth;
    if(s.holding)s.object=pandaTCP(s.joints);
    if(t>=1) {
      if(m.step==='grasp'){s.holding=true;s.object=pandaTCP(s.joints);}
      if(m.step==='release'){s.holding=false;s.placed=true;}
      s.motion=null;s.step++;s.message='';
    }
  }
  return s;
}

export { R as PANDA_RIG, zAxis as PANDA_AXIS };
