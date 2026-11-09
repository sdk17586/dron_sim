import { createControllerState, createControllerAircraft, controllerTransition, rotationDemand, connectionLabel } from '../src/domain/controller.js';
import { createState, completionIssues } from '../src/domain/state.js';
import { placePart } from '../src/domain/placement.js';

const assert = (truth, message) => { if (!truth) throw new Error(message); };
const act = (s, type, payload = {}) => controllerTransition(s, { type, ...payload });
const connected = () => act(act(act(createControllerState(), 'AIRCRAFT_POWER'), 'REMOTE_POWER'), 'LINK');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS', name); }
test('처음에는 양쪽 전원·연결·회전이 모두 꺼짐', () => {
  const s = createControllerState(); assert(!s.aircraftPower && !s.remotePower && !s.connected && rotationDemand(s) === 0, 'initial power');
  assert(connectionLabel(s).includes('조종기 전원 꺼짐'), 'missing status');
});
test('양쪽 전원이 있어야 연결 가능, 미연결 입력은 회전하지 않음', () => {
  let s = createControllerState();
  for (const powered of [s, act(s, 'REMOTE_POWER'), act(s, 'AIRCRAFT_POWER')]) assert(!act(powered, 'LINK').connected, 'linked without power');
  s = act(act(s, 'AIRCRAFT_POWER'), 'REMOTE_POWER');
  s = act(s, 'STICK', { side: 'left', x: 0, y: 1 }); assert(rotationDemand(s) === 0, 'unlinked spin');
});
test('스틱이 움직인 상태에서는 연결 거부, 중앙 복귀 후 연결', () => {
  let s = act(act(createControllerState(), 'AIRCRAFT_POWER'), 'REMOTE_POWER');
  s = act(s, 'STICK', { side: 'right', x: 1, y: 0 }); assert(!act(s, 'LINK').connected, 'linked with deflection');
  s = act(act(s, 'CENTER'), 'LINK'); assert(s.connected && rotationDemand(s) === 0, 'bad neutral link');
});
test('두 스틱 모두 반응하며 범위 밖 입력은 원 안으로 제한', () => {
  for (const side of ['left', 'right']) {
    const s = act(connected(), 'STICK', { side, x: 8, y: -6 });
    assert(Math.abs(Math.hypot(s.sticks[side].x, s.sticks[side].y) - 1) < 1e-9, 'outside pad');
    assert(Math.abs(rotationDemand(s) - 1) < 1e-9, 'no full demand');
    assert(rotationDemand(act(s, 'CENTER')) === 0, 'did not stop');
  }
});
test('작은 중앙 흔들림은 회전하지 않으며 입력 크기에 따라 증가', () => {
  const s = connected(), move = y => rotationDemand(act(s, 'STICK', { side: 'left', x: 0, y }));
  assert(move(.05) === 0 && move(.25) > 0 && move(.25) < move(.8), 'bad response');
});
test('기체·조종기 어느 쪽을 꺼도 즉시 정지·연결 해제, 다시 켜도 자동 연결 안 함', () => {
  for (const power of ['AIRCRAFT_POWER', 'REMOTE_POWER']) {
    const moving = act(connected(), 'STICK', { side: 'left', x: 1, y: 0 });
    const off = act(moving, power), on = act(off, power);
    assert(!off.connected && rotationDemand(off) === 0 && !on.connected && rotationDemand(on) === 0, 'power retained motion');
  }
});
test('정지·연결 해제·초기화는 스틱을 중앙에 두며 이전 상태 불변', () => {
  const s = act(connected(), 'STICK', { side: 'left', x: 0, y: 1 }), before = JSON.stringify(s);
  for (const type of ['STOP', 'LINK', 'RESET']) {
    const next = act(s, type); assert(!next.connected && rotationDemand(next) === 0, 'not stopped');
    assert(Object.values(next.sticks).every(p => !p.x && !p.y), 'not centered');
  }
  assert(JSON.stringify(s) === before, 'previous mutated');
});
test('잘못된 스틱·숫자 입력은 거부', () => {
  const s = connected();
  for (const a of [{ side: 'missing', x: 0, y: 1 }, ...[NaN, Infinity, '1', undefined].map(x => ({ side: 'left', x, y: 0 }))]) assert(act(s, 'STICK', a) === s, 'invalid input accepted');
});
test('작동 확인 기체는 정상 날개·100% 배터리, 정비 상태·평가와 분리', () => {
  const maintenance = createState(), before = JSON.stringify(maintenance), issues = completionIssues(maintenance);
  const aircraft = createControllerAircraft();
  assert(aircraft.status === 'preview' && aircraft.batteryPacks[0].charge === 100, 'wrong aircraft');
  assert(Object.values(aircraft.motors).every(m => m.blades.every(b => b.condition === 'healthy')), 'damaged test rotor');
  assert(placePart(aircraft, { kind: 'battery' }, { kind: 'discard' }).state === aircraft, 'maintenance accepted in console');
  aircraft.motors['front-left'].blades[0].present = false;
  assert(JSON.stringify(maintenance) === before && JSON.stringify(completionIssues(maintenance)) === JSON.stringify(issues), 'maintenance changed');
});
test('5000회 임의 입력에서 전원·연결·회전 불변 조건 유지', () => {
  let s = createControllerState(), seed = 17;
  for (let i = 0; i < 5000; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    s = act(s, ['AIRCRAFT_POWER', 'REMOTE_POWER', 'LINK', 'CENTER', 'STOP', 'STICK'][seed % 6], { side: seed & 8 ? 'left' : 'right', x: seed % 9 - 4, y: seed % 7 - 3 });
    assert(!s.connected || (s.aircraftPower && s.remotePower), 'link without power');
    assert(Number.isFinite(rotationDemand(s)) && rotationDemand(s) >= 0 && rotationDemand(s) <= 1, 'bad demand');
    assert(s.connected || rotationDemand(s) === 0, 'unlinked motion');
  }
});
console.log(`ALL PASS · ${passed} controller checks`);
