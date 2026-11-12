import { createIMUState, imuTransition as step, imuGuide, IMU_POSES, IMU_HOLD_MS } from '../src/domain/imu.js';
import * as THREE from '../src/vendor/three/three.module.min.js';
import { nearestIMUPose } from '../src/ui/imu3d.js';

let passed = 0;
const assert = (v, m) => { if (!v) throw new Error(m); };
const test = (name, run) => { run(); passed++; console.log(`PASS ${name}`); };
const prepared = () => ['SURFACE', 'POWER', 'LINK', 'START'].reduce((s, type) => step(s, { type }), createIMUState());
const dwell = (s, milliseconds = IMU_HOLD_MS) => { for (let t = 0; t < milliseconds; t += 100) s = step(s, { type: 'TICK', elapsedMs: 100 }); return s; };
test('작업대·전원·연결 없이는 측정 불가', () => {
  let s = createIMUState();
  for (const type of ['START', 'LINK', 'TICK']) s = step(s, { type, elapsedMs: 100 });
  assert(!s.linked && s.status === 'idle' && !s.samples.length, 'prerequisites bypassed');
  assert(imuGuide(s).current.id === 'imu-surface', 'first task missing');
  assert(prepared().status === 'calibrating', 'prepared start failed');
});
test('배터리 50% 미만은 연결과 보정 시작 차단', () => {
  let s = createIMUState({ batteryCharge: 49 });
  for (const type of ['SURFACE', 'POWER', 'LINK', 'START']) s = step(s, { type });
  assert(!s.linked && s.status === 'idle', 'low battery accepted');
});
test('목표 자세에서 3초 정지해야 측정 완료·중복 방지', () => {
  let s = dwell(prepared(), 2900); assert(!s.samples.length && s.stableMs === 2900, 'early complete');
  s = step(s, { type: 'TICK', elapsedMs: 100 }); assert(s.samples.join() === 'level', 'missing sample');
  s = dwell(s); assert(s.samples.length === 1 && s.stableMs === 0, 'duplicate face sampled');
});
test('틀린 자세·회전·화면 지연은 정지 시간을 적립하지 않음', () => {
  let s = dwell(prepared(), 500);
  s = step(s, { type: 'POSE', pose: 'right' }); s = dwell(s);
  assert(s.stableMs === 0 && !s.samples.length, 'wrong orientation credited');
  s = step(s, { type: 'POSE', pose: 'level' }); s = dwell(s, 500);
  s = step(s, { type: 'MOVE_BEGIN' }); s = dwell(s); assert(s.stableMs === 0 && !s.samples.length, 'drag credited');
  s = step(s, { type: 'POSE', pose: 'level' });
  for (const elapsedMs of [10000, -1, NaN, Infinity, 0]) { s = dwell(s, 500); s = step(s, { type: 'TICK', elapsedMs }); assert(s.stableMs === 0, 'stalled timer credited'); }
});
test('정지·재개는 완료 자세 유지·현재 측정 초기화', () => {
  let s = dwell(prepared()); s = step(s, { type: 'POSE', pose: 'left' }); s = dwell(s, 600);
  s = step(s, { type: 'PAUSE', reason: '창 이탈' }); s = dwell(s);
  assert(s.status === 'paused' && s.samples.length === 1 && s.stableMs === 0, 'pause lost data or kept ticking');
  assert(imuGuide(s).current.id === 'imu-resume' && imuGuide(s).phases[1].tasks[0].id === 'imu-resume', 'resume help missing');
  s = step(s, { type: 'START' }); s = dwell(s); assert(s.samples.join() === 'level,left', 'resume failed');
});
test('전원 차단은 연결·보정 초기화, 자동 재개 없음', () => {
  let s = dwell(prepared()); s = step(s, { type: 'POWER' });
  assert(!s.power && !s.linked && !s.samples.length && s.status === 'idle', 'power cut did not reset');
  s = step(s, { type: 'POWER' }); s = step(s, { type: 'START' }); assert(s.status === 'idle', 'auto relink');
});
test('여섯 자세 후 바른 자세·결과 확인까지 완료해야 교육 종료', () => {
  let s = prepared();
  for (const p of IMU_POSES) { s = step(s, { type: 'POSE', pose: p.id }); s = dwell(s); }
  assert(s.status === 'measured' && s.samples.length === 6 && imuGuide(s).current.id === 'imu-return', 'measurement state wrong');
  s = step(s, { type: 'VERIFY' }); assert(s.status === 'measured', 'wrong verification pose');
  s = step(s, { type: 'POSE', pose: 'level' }); assert(imuGuide(s).current.id === 'imu-verify', 'missing verification task');
  s = step(s, { type: 'VERIFY' }); assert(s.status === 'completed' && imuGuide(s).complete && imuGuide(s).remaining === 0, 'course incomplete');
});
test('중력 기준 자세 판별은 카메라·기체 수평 회전에 독립', () => {
  for (const p of IMU_POSES) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...p.rotation));
    q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 1.2));
    assert(nearestIMUPose(q).id === p.id, `wrong gravity face ${p.id}`);
  }
});
test('전이 입력 상태·완료 목록을 변경하지 않음', () => {
  const s = prepared(), snapshot = JSON.stringify(s);
  const next = dwell(s); assert(JSON.stringify(s) === snapshot && next.samples !== s.samples, 'mutated input');
  const bad = step(s, { type: 'POSE', pose: 'invalid' }); assert(bad.pose === s.pose, 'invalid pose accepted');
});
console.log(`ALL PASS · ${passed} IMU checks`);
