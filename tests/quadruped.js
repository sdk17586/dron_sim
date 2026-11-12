import { createRobotState, robotTransition, placeRobotPart, ROBOT_LEGS, robotGuide, robotCanTest, robotAssembled, buildRobotResult, chooseRobotFault } from '../src/domain/quadruped.js';
import { normalizeRecord, ResultRepository } from '../src/storage/result-repository.js';
import { exportCSV, previewImport } from '../src/storage/csv.js';
const assert = (v, m = 'assertion failed') => { if (!v) throw new Error(m); };
const act = (s, type, rest = {}) => robotTransition(s, { type, legId: s.targetLeg, ...rest }).state;
const fresh = id => createRobotState({ active: true, targetLeg: id || 'front-left' });
function prepare(s = fresh()) { for (const type of ['ESTOP', 'POWER', 'SUPPORT', 'REMOVE_BATTERY']) s = act(s, type); return s; }
function inspect(s) {
  for (const p of ROBOT_LEGS) { s = act(s, 'INSPECT', { legId: p.id }); s = act(s, 'DIAGNOSE', { legId: p.id, answer: p.id === s.targetLeg ? 'replace' : 'healthy' }); }
  return s;
}
function repair(s) {
  s = act(s, 'CONNECTOR'); for (const index of [0, 1]) s = act(s, 'DRIVER', { index });
  s = act(s, 'REMOVE_MODULE'); s = act(s, 'INSTALL_MODULE', { moduleId: 'QJ-01' });
  for (const index of [0, 1]) s = act(s, 'DRIVER', { index });
  return act(s, 'CONNECTOR');
}
function testReady(s) { for (const type of ['INSTALL_BATTERY', 'POWER', 'ESTOP']) s = act(s, type); return s; }
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS', name); }
test('재시작은 직전 고장 다리를 제외하며 모든 다리에 과제를 생성', () => {
  for (const p of ROBOT_LEGS) for (const value of [0, .34, .67, .99999]) assert(chooseRobotFault(p.id, () => value) !== p.id);
  for (const p of ROBOT_LEGS) { const s = fresh(p.id); assert(Object.values(s.legs).filter(l => l.condition === 'damaged').length === 1); }
});
test('전원·비상 정지·받침대·배터리 중 하나라도 빠지면 분해 차단, 원본 보존', () => {
  for (const skip of ['ESTOP', 'POWER', 'SUPPORT', 'REMOVE_BATTERY']) {
    let s = fresh(); for (const type of ['ESTOP', 'POWER', 'SUPPORT', 'REMOVE_BATTERY'].filter(t => t !== skip)) s = act(s, type);
    const before = JSON.stringify(s); const n = act(s, 'DRIVER', { index: 0 });
    assert(n.legs[s.targetLeg].bolts.every(Boolean)); assert(JSON.stringify(s) === before);
  }
});
test('관찰 전 판단·잘못된 판단 차단, 도움말은 상태·고장 정답을 변경하지 않음', () => {
  let s = prepare(), before = JSON.stringify(s); const guide = robotGuide(s);
  assert(guide.phases[2].tasks.length === 0 && JSON.stringify(s) === before);
  s = act(s, 'DIAGNOSE', { answer: 'replace' }); assert(!s.legs[s.targetLeg].verdict);
  s = act(s, 'INSPECT'); s = act(s, 'DIAGNOSE', { answer: 'healthy' }); assert(!s.legs[s.targetLeg].verdict);
});
test('커넥터·두 볼트 분리 전 모듈 제거 차단', () => {
  let s = inspect(prepare()); s = act(s, 'REMOVE_MODULE'); assert(s.legs[s.targetLeg].present);
  s = act(s, 'DRIVER', { index: 0 }); assert(s.legs[s.targetLeg].bolts[0]);
  s = act(s, 'CONNECTOR'); s = act(s, 'DRIVER', { index: 0 }); s = act(s, 'REMOVE_MODULE'); assert(s.legs[s.targetLeg].present);
});
test('다른 규격·잘못된 자리·원래 모듈 재사용을 허용하지 않음', () => {
  let s = inspect(prepare()); s = act(s, 'CONNECTOR'); for (const index of [0, 1]) s = act(s, 'DRIVER', { index });
  s = act(s, 'REMOVE_MODULE'); s = act(s, 'INSTALL_MODULE', { moduleId: 'QJ-02' }); assert(!s.legs[s.targetLeg].present && s.spareAvailable);
  const before = JSON.stringify(s); s = placeRobotPart(s, { kind: 'robot-module', moduleId: 'QJ-01' }, { kind: 'robot-battery-slot' }).state; assert(JSON.stringify(s) === before);
  s = act(s, 'INSTALL_MODULE', { moduleId: 'QJ-01' }); assert(!s.spareAvailable && s.legs[s.targetLeg].source === 'new');
  s = act(s, 'REMOVE_MODULE'); assert(s.legs[s.targetLeg].present);
});
test('새 모듈을 놓기만 하면 시험 불가, 두 볼트·커넥터 별도 확인', () => {
  let s = inspect(prepare()); s = act(s, 'CONNECTOR'); for (const index of [0, 1]) s = act(s, 'DRIVER', { index });
  s = act(act(s, 'REMOVE_MODULE'), 'INSTALL_MODULE', { moduleId: 'QJ-01' });
  s = act(s, 'CONNECTOR'); assert(!s.legs[s.targetLeg].connected);
  s = act(s, 'INSTALL_BATTERY'); assert(!s.battery && !robotCanTest(s));
  s = act(s, 'DRIVER', { index: 0 }); assert(robotGuide(s, s.targetLeg).current.id.endsWith('-1'));
});
test('네 다리 점검을 빠뜨리면 전원 복구·관절 시험 차단', () => {
  let s = prepare(); s = act(s, 'INSPECT'); s = act(s, 'DIAGNOSE', { answer: 'replace' }); s = repair(s);
  s = act(s, 'INSTALL_BATTERY'); assert(!s.battery && !robotCanTest(s));
});
test('모든 고장 위치에서 교체·관절 시험·전원 차단 후 완료 가능', () => {
  for (const p of ROBOT_LEGS) {
    let s = testReady(repair(inspect(prepare(fresh(p.id))))); assert(robotCanTest(s) && robotAssembled(s));
    s = act(s, 'COMPLETE'); assert(s.status === 'active');
    for (const type of ['START_TEST', 'FINISH_TEST', 'ESTOP', 'POWER', 'COMPLETE']) s = act(s, type);
    assert(s.status === 'completed' && robotGuide(s).remaining === 0 && robotGuide(s).complete);
  }
});
test('시험 중 비상 정지·창 이탈·전원 차단은 성공으로 기록하지 않음', () => {
  for (const type of ['ESTOP', 'CANCEL_TEST', 'POWER']) {
    let s = act(testReady(repair(inspect(prepare()))), 'START_TEST');
    assert(s.testing); s = act(s, type); assert(!s.testing && !s.tested);
    s = act(s, 'FINISH_TEST'); assert(!s.tested);
  }
});
test('알 수 없는 다리·볼트 번호는 부품 상태나 공통 객체를 변경하지 않음', () => {
  let s = prepare(); for (const legId of ['__proto__', 'missing']) s = act(s, 'INSPECT', { legId });
  assert(!({}).inspected); s = inspect(s); s = act(s, 'CONNECTOR');
  for (const index of [-1, 2, NaN, '0']) s = act(s, 'DRIVER', { index });
  assert(s.legs[s.targetLeg].bolts.every(Boolean));
});
test('완료·중단 결과가 기존 저장소·CSV 형식과 호환', () => {
  let s = testReady(repair(inspect(prepare())));
  for (const type of ['START_TEST', 'FINISH_TEST', 'ESTOP', 'POWER', 'COMPLETE']) s = act(s, type);
  const r = buildRobotResult(s, { durationSeconds: 90 }); assert(normalizeRecord(r).scenarioId === 'quadruped-joint-v1');
  const storage = { data: null, getItem() { return this.data; }, setItem(k, v) { this.data = v; } };
  const repo = new ResultRepository(storage); repo.add(r); repo.add(r); assert(repo.load().records.length === 1);
  const imported = previewImport(exportCSV([r]), []); assert(imported.added === 1 && imported.records[0].scenarioId === r.scenarioId);
  assert(normalizeRecord(buildRobotResult(prepare(), { status: 'abandoned' })).status === 'abandoned');
});
console.log(`ALL PASS · ${passed} quadruped checks`);
