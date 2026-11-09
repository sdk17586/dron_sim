import { createState, transition } from '../src/domain/state.js';
import { placePart } from '../src/domain/placement.js';
import { maintenanceGuide, controllerGuide } from '../src/domain/learning-guide.js';
import { createControllerState, controllerTransition } from '../src/domain/controller.js';
import { PROFILE } from '../src/content/aircraft-profiles.js';
import { SCENARIO } from '../src/content/scenarios.js';

const assert = (truth, message) => { if (!truth) throw new Error(message); };
const act = (s, type, rest = {}) => transition(s, { type, motorId: SCENARIO.target, tool: 'driver', kitId: 'A1', ...rest }).state;
const ui = { selected: SCENARIO.target, zoomed: true, kitId: 'A1' };
const prepare = () => act(act(createState(), 'CONFIRM_POWER'), 'REMOVE_BATTERY');
function observe(s, omitted = '') {
  for (const p of PROFILE.motors.filter(p => p.id !== omitted)) {
    s = act(s, 'INSPECT_MOTOR', { motorId: p.id });
    s = act(s, 'ANSWER_DAMAGE', { motorId: p.id, answer: p.id === SCENARIO.target ? 'replace' : 'healthy' });
  }
  return s;
}
function repair(s) {
  for (const index of [0, 1]) {
    s = act(s, 'REMOVE_SCREW', { index }); s = act(s, 'REMOVE_BLADE', { index });
    s = placePart(s, { kind: 'blade', index, kitId: 'A1' }, { kind: 'blade', index, motorId: SCENARIO.target }).state;
    s = act(s, 'INSTALL_SCREW', { index }); s = act(s, 'CONFIRM_FASTENING', { index });
  }
  return s;
}
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS', name); }
test('전원·차단 확인·배터리 분리 순서와 현재 작업 안내', () => {
  let s = createState(); assert(maintenanceGuide(s, ui).current.id === 'confirm-power', 'wrong first action');
  s = act(s, 'TOGGLE_POWER'); assert(maintenanceGuide(s, ui).current.id === 'power-off', 'live power ignored');
  s = act(act(s, 'TOGGLE_POWER'), 'CONFIRM_POWER'); assert(maintenanceGuide(s, ui).current.id === 'remove-battery', 'battery next action missing');
});
test('도움말 조회는 상태·오류·도움말 집계를 변경하지 않으며 미판단 고장 정답을 노출하지 않음', () => {
  const s = prepare(), before = JSON.stringify(s);
  for (let i = 0; i < 20; i++) {
    const guide = maintenanceGuide(s, ui);
    assert(guide.phases[1].tasks.length === 4 && guide.phases[2].tasks.length === 0, 'fault revealed before judgment');
  }
  assert(JSON.stringify(s) === before, 'help mutated assessment');
});
test('선택한 모터의 나사 분리·날개 분리·새 부품·체결을 정확히 추적', () => {
  let s = observe(prepare());
  assert(maintenanceGuide(s, ui).current.id === `remove-screw-${SCENARIO.target}-0`, 'wrong repair action');
  s = act(s, 'REMOVE_SCREW', { index: 0 });
  assert(maintenanceGuide(s, ui).current.id.endsWith('-1'), 'second screw missing');
  s = repair(s);
  assert(maintenanceGuide(s, ui).phases[2].tasks.every(t => t.done), 'repair checklist unfinished');
});
test('3/4와 4/4를 구분하고, 남은 모터 판단 후 최종 확인으로 전환', () => {
  const omitted = 'rear-right'; let s = repair(observe(prepare(), omitted));
  let guide = maintenanceGuide(s, { ...ui, zoomed: false });
  assert(guide.current.motorId === omitted && !guide.readyForFinal, 'missing remaining motor');
  s = act(act(s, 'INSPECT_MOTOR', { motorId: omitted }), 'ANSWER_DAMAGE', { motorId: omitted, answer: 'healthy' });
  guide = maintenanceGuide(s, ui);
  assert(guide.current.id === 'check-marks' && guide.readyForFinal, 'final guidance missing');
});
test('네 모터 판단 이후에도 새 나사 체결이 빠지면 정확한 나사를 안내', () => {
  let s = repair(observe(prepare())); s.motors[SCENARIO.target].screws[1].secured = false;
  const guide = maintenanceGuide(s, ui);
  assert(guide.current.id === `fasten-${SCENARIO.target}-1` && !guide.readyForFinal, 'loose screw not identified');
});
test('잘못된 표식 포장과 소진한 새 부품의 재작업 안내', () => {
  let s = observe(prepare());
  for (const index of [0, 1]) { s = act(s, 'REMOVE_SCREW', { index }); s = act(s, 'REMOVE_BLADE', { index }); }
  assert(maintenanceGuide(s, { ...ui, kitId: 'B1' }).current.target.kind === 'kit', 'wrong kit not explained');
  s = repair(observe(prepare())); s = act(s, 'REMOVE_SCREW', { index: 0 });
  assert(maintenanceGuide(s, ui).current.id === 'parts-exhausted', 'used replacement not explained');
});
test('최종 확인 세 개 뒤에도 완료 버튼을 눌러야 남은 작업이 0개', () => {
  let s = repair(observe(prepare()));
  for (const check of ['marks', 'count', 'fastening']) s = act(s, 'CONFIRM_CHECK', { check });
  let guide = maintenanceGuide(s, ui);
  assert(guide.current.id === 'finish' && guide.remaining === 1 && !guide.complete, 'premature completion');
  s = act(s, 'FINAL_INSPECTION'); guide = maintenanceGuide(s, ui);
  assert(guide.complete && guide.remaining === 0, 'completion remains blocked');
});
test('조종기 미연결 입력·조기 정지는 교육 수행으로 기록하지 않음', () => {
  let s = createControllerState();
  s = controllerTransition(s, { type: 'STICK', side: 'left', x: 0, y: 1 });
  s = controllerTransition(s, { type: 'STOP' });
  assert(!s.practice.left && !s.practice.stop && controllerGuide(s).remaining === 6, 'offline input counted');
});
test('조종기 전원·연결·좌우 스틱·정지 확인과 재시작을 구분', () => {
  let s = createControllerState();
  for (const type of ['AIRCRAFT_POWER', 'REMOTE_POWER', 'LINK']) s = controllerTransition(s, { type });
  for (const side of ['left', 'right']) s = controllerTransition(s, { type: 'STICK', side, x: 1, y: 0 });
  assert(controllerGuide(s).current.id === 'stop' && !controllerGuide(s).complete, 'stop check skipped');
  s = controllerTransition(s, { type: 'STOP' }); assert(controllerGuide(s).complete, 'controller not finished');
  s = controllerTransition(s, { type: 'RESET' }); assert(controllerGuide(s).remaining === 6, 'restart retained completion');
});
console.log(`ALL PASS · ${passed} guidance checks`);
