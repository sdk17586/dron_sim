import { createControllerState, controllerTransition } from '../src/domain/controller.js';
import { createIMUState, imuTransition, IMU_POSES } from '../src/domain/imu.js';
import { controllerCourseGuide, canEnterControllerIMU } from '../src/domain/controller-course.js';

const assert = (ok, message) => { if (!ok) throw new Error(message); };
const act = (s, type, values = {}) => controllerTransition(s, { type, ...values });
const checked = () => {
  let s = createControllerState();
  for (const type of ['AIRCRAFT_POWER', 'REMOTE_POWER', 'LINK']) s = act(s, type);
  for (const side of ['left', 'right']) s = act(s, 'STICK', { side, x: 1, y: 0 });
  return act(s, 'STOP');
};
let passed = 0;
function test(label, run) { run(); passed++; console.log('PASS', label); }
test('시작부터 조종기와 IMU 작업을 하나의 도움말·남은 작업으로 안내', () => {
  const g = controllerCourseGuide(createControllerState(), createIMUState());
  assert(g.current.id === 'aircraft' && !g.complete && g.remaining === 19, 'missing combined checklist');
  assert(g.phases.some(p => p.tasks.some(t => t.id === 'imu-verify')), 'IMU missing from help');
});
test('조종기만 마치면 이어하기를 안내하며 전체 완료로 인정하지 않음', () => {
  const c = checked(), g = controllerCourseGuide(c, createIMUState());
  assert(canEnterControllerIMU(c) && g.current.id === 'controller-imu-next' && !g.complete && g.remaining > 0, 'early completion');
  assert(!canEnterControllerIMU(createControllerState()), 'skipped controls');
});
test('전원 차단·스틱 움직임 중 전환 차단과 정확한 복구 위치 안내', () => {
  for (const type of ['AIRCRAFT_POWER', 'REMOTE_POWER']) {
    const c = act(checked(), type), g = controllerCourseGuide(c, createIMUState());
    assert(!canEnterControllerIMU(c) && g.current.id.endsWith('-restore'), 'missing power check');
    assert(g.phases.some(p => p.tasks.some(t => t.id === g.current.id && !t.done)), 'power restore help missing');
  }
  const moving = act(checked(), 'STICK', { side: 'left', x: 1, y: 0 });
  assert(!canEnterControllerIMU(moving) && controllerCourseGuide(moving, createIMUState()).current.id === 'controller-imu-center', 'moving handoff');
});
test('IMU 측정만 마쳐도 미완료, 결과 확인 후에만 통합 교육 완료', () => {
  const c = checked(); let imu = createIMUState();
  for (const type of ['SURFACE', 'POWER', 'LINK', 'START']) imu = imuTransition(imu, { type });
  for (const pose of IMU_POSES) {
    imu = imuTransition(imu, { type: 'POSE', pose: pose.id });
    for (let n = 0; n < 30; n++) imu = imuTransition(imu, { type: 'TICK', elapsedMs: 100 });
  }
  assert(!controllerCourseGuide(c, imu, 'imu').complete, 'measurement alone completed course');
  imu = imuTransition(imu, { type: 'POSE', pose: 'level' }); imu = imuTransition(imu, { type: 'VERIFY' });
  const g = controllerCourseGuide(c, imu, 'imu');
  assert(g.complete && g.remaining === 0 && g.current.id === 'controller-course-completed', 'combined completion missing');
  assert(!controllerCourseGuide(createControllerState(), imu, 'imu').complete, 'IMU bypassed controls');
});
test('단계별 진행·도움말 조회가 입력 상태를 변경하지 않음', () => {
  const c = checked(), imu = createIMUState(), snapshot = JSON.stringify([c, imu]);
  const g = controllerCourseGuide(c, imu, 'imu');
  assert(g.workflow[0].state === 'done' && g.workflow[1].state === 'current', 'wrong stage');
  assert(JSON.stringify([c, imu]) === snapshot, 'mutated state');
});
console.log(`ALL PASS · ${passed} controller course checks`);
