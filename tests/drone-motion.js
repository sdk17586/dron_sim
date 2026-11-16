import { createControllerState, controllerTransition, droneMotionDemand, DRONE_MOVE_LIMIT } from '../src/domain/controller.js';
import { flightController, checkedController, completedIMU } from './controller-fixtures.js';

const assert = (ok, message) => { if (!ok) throw new Error(message); };
const near = (a, b) => Math.abs(a - b) < 1e-8;
const act = (s, type, payload = {}) => controllerTransition(s, { type, ...payload });
const stick = (s, side, value) => act(s, 'STICK', { side, x: side === 'right' ? value : 0, y: side === 'left' ? value : 0 });
const ready = flightController;
const tick = (s, n = 10) => Array.from({ length: n }).reduce(s => act(s, 'TICK', { seconds: .1 }), s);
let passed = 0;
const test = (name, run) => { run(); passed++; console.log('PASS', name); };

test('IMU 보정 전에는 연결과 스틱 입력을 확인해도 기체 이동·회전 잠금', () => {
  let s = act(checkedController(), 'LINK');
  s = tick(stick(stick(s, 'left', 1), 'right', 1));
  assert(!s.flightReady && !s.moving && JSON.stringify(s.pose) === JSON.stringify({ x: 0, z: 0, yaw: 0 }), 'uncalibrated movement');
  for (const calibration of [undefined, { ...completedIMU(), status: 'measured' }, { ...completedIMU(), samples: ['level'] }]) {
    assert(!act(checkedController(), 'BEGIN_FLIGHT', { calibration }).flightReady, 'invalid proof unlocked flight');
  }
  assert(ready().flightReady, 'verified IMU did not unlock');
  assert(!act(ready(), 'RESET').flightReady, 'restart retained permission');
});

test('연결·양쪽 전원 없이 이동·회전하지 않음', () => {
  for (const base of [createControllerState(), act(ready(), 'REMOTE_POWER'), act(ready(), 'AIRCRAFT_POWER'), act(ready(), 'LINK')]) {
    const s = tick(stick(stick(base, 'left', 1), 'right', 1));
    assert(!droneMotionDemand(s).active && JSON.stringify(s.pose) === JSON.stringify(base.pose), 'unpowered movement');
  }
});
test('왼쪽 위·아래로 전진·후진, 놓으면 위치 유지', () => {
  const forward = tick(stick(ready(), 'left', 1));
  assert(near(forward.pose.x, 0) && near(forward.pose.z, -1.6) && near(forward.pose.yaw, 0), 'forward direction');
  assert(near(tick(stick(forward, 'left', -1)).pose.z, 0), 'reverse direction');
  assert(JSON.stringify(tick(act(forward, 'CENTER')).pose) === JSON.stringify(forward.pose), 'drift after release');
});
test('오른쪽 좌·우는 위치를 유지하는 제자리 회전', () => {
  const base = tick(stick(ready(), 'left', 1));
  for (const direction of [-1, 1]) {
    const s = tick(stick(act(base, 'CENTER'), 'right', direction));
    assert(near(s.pose.x, base.pose.x) && near(s.pose.z, base.pose.z) && near(s.pose.yaw, -direction), 'turn moved centre');
  }
});
test('회전 후 기체 앞을 기준으로 이동하고 두 스틱 동시 조작 가능', () => {
  const turned = { ...ready(), pose: { x: 0, z: 0, yaw: -Math.PI / 2 } };
  const moved = tick(stick(turned, 'left', 1));
  assert(near(moved.pose.x, 1.6) && near(moved.pose.z, 0), 'world axis instead of heading');
  const curved = tick(stick(stick(ready(), 'left', 1), 'right', 1));
  assert(curved.pose.x > .5 && curved.pose.z < -.5 && curved.pose.yaw < -.5, 'simultaneous input');
});
test('사용하지 않는 스틱 축과 중앙 미세 입력은 움직임·진행으로 인정하지 않음', () => {
  let s = ready();
  s = act(s, 'STICK', { side: 'left', x: 1, y: 0 });
  s = act(s, 'STICK', { side: 'right', x: 0, y: 1 });
  assert(!droneMotionDemand(s).active && !s.flightPractice.move && !s.flightPractice.turn, 'unused axis');
  assert(!droneMotionDemand(stick(s, 'left', .05)).active, 'dead zone');
  const slow = tick(stick(s, 'left', .4)), fast = tick(stick(s, 'left', 1));
  assert(Math.abs(slow.pose.z) < Math.abs(fast.pose.z), 'input strength ignored');
});
test('연습 영역 끝에서 멈추고 반대 입력으로 벗어남', () => {
  const edge = tick(stick(ready(), 'left', 1), 100);
  assert(near(edge.pose.z, -DRONE_MOVE_LIMIT) && edge.boundary && !edge.moving, 'unbounded forward');
  const reverse = tick(stick(edge, 'left', -1));
  assert(reverse.pose.z > edge.pose.z && !reverse.boundary, 'cannot recover');
});
test('정지·연결 해제·전원 차단은 위치를 보존하면서 즉시 움직임 차단', () => {
  const moving = tick(stick(stick(ready(), 'left', 1), 'right', 1));
  for (const type of ['CENTER', 'STOP', 'LINK', 'AIRCRAFT_POWER', 'REMOTE_POWER']) {
    const stopped = act(moving, type);
    assert(!droneMotionDemand(stopped).active && !stopped.moving, 'not stopped');
    assert(JSON.stringify(tick(stopped).pose) === JSON.stringify(moving.pose), 'pose changed after stop');
  }
});
test('위치 초기화는 연결·교육 진행 유지, 다시 시작은 전체 초기화', () => {
  const moving = tick(stick(ready(), 'left', 1)), reset = act(moving, 'RESET_POSE');
  assert(reset.connected && reset.practice.left && near(reset.pose.z, 0) && near(reset.pose.yaw, 0), 'pose reset changed course');
  assert(!droneMotionDemand(reset).active, 'reset retained input');
  assert(JSON.stringify(act(moving, 'RESET')) === JSON.stringify(createControllerState()), 'full reset incomplete');
});
test('긴 프레임 간격·잘못된 시간은 순간 이동을 만들지 않고 이전 상태 불변', () => {
  const s = stick(ready(), 'left', 1), snapshot = JSON.stringify(s);
  assert(near(act(s, 'TICK', { seconds: 100 }).pose.z, -.16), 'large frame jump');
  for (const seconds of [NaN, Infinity, -1, 0, '1']) assert(act(s, 'TICK', { seconds }) === s, 'invalid time');
  tick(s); assert(JSON.stringify(s) === snapshot, 'mutated input');
});
console.log(`ALL PASS · ${passed} drone motion checks`);
