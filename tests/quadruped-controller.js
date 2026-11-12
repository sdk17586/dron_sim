import { createRobotControllerState, robotControllerTransition, robotControllerGuide, robotDriveDemand, ROBOT_DRIVE_LIMIT } from '../src/domain/quadruped-controller.js';

const assert = (value, message) => { if (!value) throw new Error(message); };
const act = (s, type, payload = {}) => robotControllerTransition(s, { type, ...payload });
const stick = (s, side, x, y = 0) => act(s, 'STICK', { side, x, y });
const linked = () => act(act(act(createRobotControllerState(), 'ROBOT_POWER'), 'REMOTE_POWER'), 'LINK');
const ready = () => act(linked(), 'ESTOP');
const tick = s => act(s, 'TICK', { seconds: .09 });
let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS', name); }

test('전원·연결 꺼짐과 비상 정지로 시작하며 여덟 과제를 안내', () => {
  const s = createRobotControllerState(), g = robotControllerGuide(s);
  assert(!s.robotPower && !s.remotePower && !s.connected && s.estop && !robotDriveDemand(s).active, 'initial motion');
  assert(g.remaining === 8 && g.current.id === 'robot-control-robot', 'initial guide');
});
test('양쪽 전원과 스틱 중립을 확인한 뒤 연결, 연결 직후 움직임은 차단', () => {
  let s = createRobotControllerState();
  assert(!act(s, 'LINK').connected && act(s, 'ESTOP').estop, 'unpowered link/release');
  s = act(act(s, 'ROBOT_POWER'), 'REMOTE_POWER');
  assert(!act(stick(s, 'left', 0, 1), 'LINK').connected, 'non-neutral link');
  s = act(s, 'LINK');
  assert(s.connected && s.estop && !robotDriveDemand(stick(s, 'left', 0, 1)).active, 'unsafe linked motion');
  assert(act(stick(s, 'left', 1), 'ESTOP').estop, 'non-neutral release');
});
test('미연결·비상 정지 입력으로 이동이나 회전 수행을 채울 수 없음', () => {
  for (const s of [createRobotControllerState(), linked()]) {
    const next = tick(stick(stick(s, 'left', 1), 'right', 1));
    assert(next.pose.x === 0 && next.pose.yaw === 0 && !next.practice.move && !next.practice.turn, 'invalid practice');
  }
});
test('앞·뒤·좌·우 실제 위치 변화와 놓았을 때 정지', () => {
  for (const [x, y, expectedX, expectedZ] of [[0, 1, 0, -1], [0, -1, 0, 1], [-1, 0, -1, 0], [1, 0, 1, 0]]) {
    const next = tick(stick(ready(), 'left', x, y));
    assert(Math.sign(next.pose.x) === expectedX && Math.sign(next.pose.z) === expectedZ && next.practice.move, 'wrong movement');
    const centered = act(next, 'CENTER'); assert(tick(centered) === centered, 'neutral drift');
  }
});
test('좌우 회전 후 이동 기준은 로봇 앞이며 오른쪽 수직 입력은 무시', () => {
  let s = ready(); s.pose.yaw = Math.PI / 2;
  s = tick(stick(s, 'left', 0, 1)); assert(s.pose.x < 0 && Math.abs(s.pose.z) < 1e-8, 'not robot-relative');
  assert(tick(stick(ready(), 'right', 1)).pose.yaw < 0 && tick(stick(ready(), 'right', -1)).pose.yaw > 0, 'wrong turning');
  assert(!robotDriveDemand(stick(ready(), 'right', 0, 1)).active, 'vertical turn accepted');
});
test('입력 정규화·중앙 무시·지연 시간 제한·잘못된 입력 거부', () => {
  const s = ready();
  assert(!robotDriveDemand(stick(s, 'left', .03, .03)).active, 'deadzone');
  const full = stick(s, 'left', 100, 100); assert(Math.hypot(full.sticks.left.x, full.sticks.left.y) <= 1, 'unbounded input');
  assert(Math.hypot(...Object.values(act(full, 'TICK', { seconds: 100 }).pose).slice(0, 2)) <= .1, 'large jump');
  for (const action of [{ type: 'STICK', side: 'bad', x: 1, y: 0 }, { type: 'STICK', side: 'left', x: NaN, y: 0 }, { type: 'TICK', seconds: Infinity }, { type: 'TICK', seconds: -1 }]) assert(robotControllerTransition(s, action) === s, 'invalid input');
});
test('연습장 경계 밖으로 벗어나지 않으며 반대 방향 이동으로 복귀', () => {
  let s = stick(ready(), 'left', 1);
  for (let i = 0; i < 1000; i++) s = tick(s);
  assert(s.pose.x === ROBOT_DRIVE_LIMIT && s.boundary && !s.moving, 'outside boundary');
  s = tick(stick(s, 'left', -1)); assert(s.pose.x < ROBOT_DRIVE_LIMIT && !s.boundary, 'boundary stuck');
});
test('전원 차단·창 이탈은 연결 해제와 비상 정지, 자동 재개 안 함', () => {
  const moving = tick(stick(ready(), 'left', 0, 1));
  for (const type of ['ROBOT_POWER', 'REMOTE_POWER', 'SUSPEND']) {
    const next = act(moving, type); assert(!next.connected && next.estop && !robotDriveDemand(next).active && tick(next).pose.z === moving.pose.z, 'unsafe suspend');
    if (type !== 'SUSPEND') assert(!act(next, type).connected, 'auto reconnect');
  }
});
test('Esc 비상 정지는 항상 걸리며 다시 누른다고 해제되지 않음', () => {
  const s = act(stick(ready(), 'left', 0, 1), 'EMERGENCY_STOP');
  assert(s.estop && !robotDriveDemand(s).active && act(s, 'EMERGENCY_STOP').estop, 'estop toggled off');
});
test('입력만으로 완료되지 않고 이동·회전·동작 정지·비상 정지까지 필요', () => {
  let s = ready();
  assert(!act(s, 'STOP').practice.stop && !act(s, 'EMERGENCY_STOP').practice.estop, 'early completion');
  s = tick(stick(s, 'left', 0, 1)); s = tick(stick(act(s, 'CENTER'), 'right', 1));
  assert(!robotControllerGuide(s).complete && !s.practice.stop, 'completed before stop');
  s = act(s, 'STOP'); assert(!s.connected && robotControllerGuide(s).current.id === 'robot-control-estop', 'stop state');
  s = act(s, 'EMERGENCY_STOP'); assert(robotControllerGuide(s).complete && robotControllerGuide(s).remaining === 0, 'not complete');
  const reset = act(s, 'RESET'); assert(reset.pose.x === 0 && reset.pose.z === 0 && reset.pose.yaw === 0 && robotControllerGuide(reset).remaining === 8, 'bad reset');
});
test('상태 갱신과 도움말 조회는 이전 상태를 변경하지 않음', () => {
  const s = ready(), before = JSON.stringify(s);
  robotControllerGuide(s); tick(stick(s, 'left', 1)); act(s, 'EMERGENCY_STOP');
  assert(JSON.stringify(s) === before, 'previous state mutated');
});
test('5000회 임의 입력에서 전원·연결·정지·위치 범위 유지', () => {
  let s = createRobotControllerState(), seed = 31;
  const actions = ['ROBOT_POWER', 'REMOTE_POWER', 'LINK', 'ESTOP', 'EMERGENCY_STOP', 'STOP', 'CENTER', 'SUSPEND', 'STICK', 'TICK'];
  for (let i = 0; i < 5000; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const before = JSON.stringify(s);
    const next = act(s, actions[seed % actions.length], { side: seed & 16 ? 'left' : 'right', x: seed % 7 - 3, y: seed % 9 - 4, seconds: .1 });
    assert(JSON.stringify(s) === before, 'mutated original'); s = next;
    assert(!s.connected || (s.robotPower && s.remotePower), 'link without power');
    assert(!(s.estop || !s.connected || !s.robotPower || !s.remotePower) || !robotDriveDemand(s).active, 'unsafe motion');
    assert(Number.isFinite(s.pose.x + s.pose.z + s.pose.yaw) && Math.abs(s.pose.x) <= ROBOT_DRIVE_LIMIT && Math.abs(s.pose.z) <= ROBOT_DRIVE_LIMIT, 'invalid pose');
  }
});
console.log(`ALL PASS · ${passed} quadruped controller checks`);
