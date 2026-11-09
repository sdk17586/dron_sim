import { createState, transition, completionIssues } from '../src/domain/state.js';
import { placePart } from '../src/domain/placement.js';
import { PROFILE } from '../src/content/aircraft-profiles.js';

const assert = (condition, label) => { if (!condition) throw new Error(label); };
const slot = (kind, index, motorId = 'front-left') => ({ kind, index, motorId });
const inventory = (kind, index, kitId = 'A1') => ({ kind, index, kitId });
const discard = { kind: 'discard' }, driver = { kind: 'driver' };
function act(s, type, payload = {}) { return transition(s, { type, motorId: 'front-left', ...payload }).state; }
function prepared() {
  let s = act(createState(), 'CONFIRM_POWER'); s = placePart(s, { kind: 'battery' }, discard).state;
  for (const p of PROFILE.motors) {
    s = act(s, 'INSPECT_MOTOR', { motorId: p.id });
    s = act(s, 'ANSWER_DAMAGE', { motorId: p.id, answer: p.id === 'front-left' ? 'replace' : 'healthy' });
  }
  return s;
}
function mounted(s, index) { return { kind: 'mounted-blade', index, motorId: 'front-left', partId: s.motors['front-left'].blades[index].id }; }
function exchange(s, index) {
  for (const [piece, target] of [[driver, slot('screw', index)], [mounted(s, index), discard],
    [inventory('blade', index), slot('blade', index)], [inventory('screw', index), slot('screw', index)], [driver, slot('screw', index)]]) {
    const result = placePart(s, piece, target); assert(result.feedback.kind === 'success', result.feedback.message); s = result.state;
  }
  return s;
}
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS', name); }
test('전원 켜짐 상태의 배터리 이동 거부', () => {
  const s = act(createState(), 'TOGGLE_POWER'); const next = placePart(s, { kind: 'battery' }, discard);
  assert(next.state.battery && next.feedback.kind === 'warning', 'live battery removed');
});
test('안전 확인 전 드라이버 작업 거부', () => {
  const result = placePart(createState(), driver, slot('screw', 0));
  assert(result.state.motors['front-left'].screws[0].present && result.feedback.kind === 'warning', 'unsafe repair');
});
test('고정 나사가 있는 날개 이동 거부', () => {
  const s = prepared(), result = placePart(s, mounted(s, 0), discard);
  assert(result.state.motors['front-left'].blades[0].present && result.feedback.kind === 'warning', 'fixed blade removed');
});
test('드라이버 분리 뒤 실제 날개 이동과 잘못된 놓기 취소', () => {
  let s = prepared(); s = placePart(s, driver, slot('screw', 0)).state;
  const wrong = placePart(s, mounted(s, 0), slot('blade', 1)); assert(wrong.state === s, 'invalid placement mutated state');
  s = placePart(s, mounted(s, 0), discard).state;
  assert(!s.motors['front-left'].blades[0].present && s.discarded.length === 2, 'discard count');
});
test('표식·부품 종류·번호 불일치 거부', () => {
  let s = prepared(); s = placePart(s, driver, slot('screw', 0)).state; s = placePart(s, mounted(s, 0), discard).state;
  for (const [piece, target] of [[inventory('blade', 0, 'B1'), slot('blade', 0)], [inventory('blade', 0), slot('screw', 0)], [inventory('blade', 1), slot('blade', 0)]]) {
    const result = placePart(s, piece, target); assert(!result.state.motors['front-left'].blades[0].present && result.feedback.kind === 'warning', 'wrong part installed');
  }
});
test('새 나사는 놓기와 드라이버 체결을 구분', () => {
  let s = prepared(); s = placePart(s, driver, slot('screw', 0)).state; s = placePart(s, mounted(s, 0), discard).state;
  s = placePart(s, inventory('blade', 0), slot('blade', 0)).state;
  s = placePart(s, inventory('screw', 0), slot('screw', 0)).state;
  assert(!s.motors['front-left'].screws[0].secured, 'auto fastening');
  s = placePart(s, driver, slot('screw', 0)).state; assert(s.motors['front-left'].screws[0].secured, 'fastening failed');
});
test('오래된 날개 선택·빈 나사 작업에서 부품 생성 방지', () => {
  let s = prepared(); const stale = mounted(s, 0); s = exchange(s, 0);
  assert(placePart(s, stale, discard).state === s, 'stale selection removed replacement');
  s = placePart(s, driver, slot('screw', 0)).state;
  const next = placePart(s, driver, slot('screw', 0)); assert(!next.state.motors['front-left'].screws[0].present, 'missing screw created');
});
test('전체 놓기 절차 완료·재작업 시 최종 확인 무효화', () => {
  let s = exchange(exchange(prepared(), 0), 1);
  for (const check of ['marks', 'count', 'fastening']) s = act(s, 'CONFIRM_CHECK', { check });
  assert(!completionIssues(s).length && act(s, 'FINAL_INSPECTION').status === 'completed', 'cannot complete');
  s = placePart(s, driver, slot('screw', 1)).state;
  assert(Object.values(s.checks).every(value => !value), 'checks survived rework');
});
console.log(`ALL PASS · ${passed} placement checks`);
