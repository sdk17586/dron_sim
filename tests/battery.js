import { createState, transition, readyForMaintenance } from '../src/domain/state.js';
import { installedBattery, chargeFraction, batteryColor } from '../src/domain/battery.js';
import { placePart } from '../src/domain/placement.js';

const assert = (truth, message) => { if (!truth) throw new Error(message); };
const act = (s, type, payload = {}) => transition(s, { type, ...payload });
const mounted = s => ({ kind: 'battery', batteryId: installedBattery(s).id });
const spare = id => ({ kind: 'battery-pack', batteryId: id });
const tray = { kind: 'discard' }, socket = { kind: 'battery-slot' };
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS', name); }
test('기존 20%·교체용 100%, 실습 사이 상태 분리', () => {
  const a = createState(), b = createState();
  a.batteryPacks[0].charge = 0;
  assert(installedBattery(b).charge === 20 && b.batteryPacks[1].charge === 100, 'shared battery state');
});
test('LED 길이는 잔량에 비례, 0%는 비어 있고 색상만으로 구분하지 않음', () => {
  for (const charge of [0, 1, 20, 50, 75, 100]) assert(chargeFraction(charge) === charge / 100, 'wrong bar length');
  assert(chargeFraction(-5) === 0 && chargeFraction(200) === 1 && chargeFraction(NaN) === 0, 'out of bounds');
  assert(batteryColor(20) !== batteryColor(50) && batteryColor(50) !== batteryColor(100), 'missing levels');
});
test('기존 배터리 제거 후 충전된 배터리 장착, 이전 잔량 보존', () => {
  let s = act(createState(), 'CONFIRM_POWER').state;
  s = placePart(s, mounted(s), tray).state;
  assert(!installedBattery(s) && !s.battery && readyForMaintenance(s), 'battery not removed');
  s = placePart(s, spare('battery-02'), socket).state;
  assert(installedBattery(s).id === 'battery-02' && installedBattery(s).charge === 100, 'replacement lost');
  assert(s.batteryPacks[0].charge === 20 && s.batteryPacks[0].location === 'tray', 'original lost');
  assert(!s.safetyConfirmed && !readyForMaintenance(s), 'maintenance allowed with battery');
});
test('장착된 배터리 위에 중복 장착 거부·입력 상태 불변', () => {
  const s = createState(), before = JSON.stringify(s), result = placePart(s, spare('battery-02'), socket);
  assert(result.feedback.kind === 'warning' && installedBattery(result.state).id === 'battery-01', 'double install');
  assert(JSON.stringify(s) === before, 'mutated previous state');
});
test('전원이 켜진 상태의 배터리 교체 거부', () => {
  const s = act(createState(), 'TOGGLE_POWER').state;
  const removed = placePart(s, mounted(s), tray), installed = placePart(s, spare('battery-02'), socket);
  assert(removed.feedback.kind === 'warning' && installed.feedback.kind === 'warning', 'live exchange accepted');
  assert(installedBattery(removed.state).id === 'battery-01', 'live battery removed');
});
test('잔량 0%는 전원 켜기 차단, 연습 중 0% 도달 시 전원 꺼짐', () => {
  let s = act(createState(), 'SET_BATTERY_CHARGE', { charge: 0 }).state;
  assert(!act(s, 'TOGGLE_POWER').state.power, 'empty battery powered up');
  s = act(createState(), 'TOGGLE_POWER').state;
  s = act(s, 'SET_BATTERY_CHARGE', { charge: 0 }).state;
  assert(!s.power && installedBattery(s).charge === 0 && !s.safetyConfirmed, 'empty battery remains on');
});
test('분리 배터리 재장착은 자체 잔량 유지, 잘못된 ID·장소 거부', () => {
  let s = act(createState(), 'SET_BATTERY_CHARGE', { charge: 7 }).state;
  s = placePart(s, mounted(s), tray).state;
  for (const [piece, target] of [[spare('missing'), socket], [{ kind: 'battery-pack' }, socket], [spare('battery-01'), tray]]) {
    const result = placePart(s, piece, target); assert(!result.state.battery && result.feedback.kind === 'warning', 'invalid pack accepted');
  }
  s = placePart(s, spare('battery-01'), socket).state;
  assert(installedBattery(s).charge === 7, 'reinstall charged battery');
});
test('잔량은 장착한 배터리의 0~100 정수만 변경', () => {
  const s = createState();
  for (const charge of [-1, 101, 10.5, NaN, Infinity, '50']) {
    const result = act(s, 'SET_BATTERY_CHARGE', { charge });
    assert(installedBattery(result.state).charge === 20 && result.feedback.kind === 'warning', 'invalid charge accepted');
  }
  assert(act(s, 'SET_BATTERY_CHARGE', { charge: 25, batteryId: 'battery-02' }).feedback.kind === 'warning', 'spare charge edited');
});
test('오래된 배터리 선택으로 교체한 배터리 제거 방지', () => {
  let s = createState(); const stale = mounted(s);
  s = placePart(s, stale, tray).state; s = placePart(s, spare('battery-02'), socket).state;
  const result = placePart(s, stale, tray);
  assert(result.state === s && installedBattery(result.state).id === 'battery-02', 'stale selection removed replacement');
});
test('1000회 교체·잔량·전원 입력에도 배터리 중복·분실 없음', () => {
  let s = createState(), seed = 91;
  for (let i = 0; i < 1000; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const id = (seed & 8) ? 'battery-01' : 'battery-02';
    const actions = [() => act(s, 'TOGGLE_POWER'), () => act(s, 'SET_BATTERY_CHARGE', { charge: seed % 101 }),
      () => act(s, 'REMOVE_BATTERY', { batteryId: id }), () => placePart(s, spare(id), socket),
      () => act(s, 'TOGGLE_BATTERY'), () => act(s, 'CONFIRM_POWER')];
    s = actions[seed % actions.length]().state;
    const installed = s.batteryPacks.filter(p => p.location === 'installed');
    assert(installed.length === (s.battery ? 1 : 0), 'duplicate/missing installed battery');
    assert(s.batteryPacks.length === 2 && new Set(s.batteryPacks.map(p => p.id)).size === 2, 'battery lost');
    assert(s.batteryPacks.every(p => Number.isInteger(p.charge) && p.charge >= 0 && p.charge <= 100), 'invalid charge');
    assert(!s.power || (s.battery && installedBattery(s).charge > 0), 'invalid power state');
  }
});
console.log(`ALL PASS · ${passed} battery checks`);
