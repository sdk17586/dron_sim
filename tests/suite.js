import { createState, transition, buildResult, completionIssues, physicalIssues } from '../src/domain/state.js';
import { PROFILE } from '../src/content/aircraft-profiles.js';
import { SCENARIO } from '../src/content/scenarios.js';
import { ResultRepository, STORAGE_KEY, mergeRecords } from '../src/storage/result-repository.js';
import { exportCSV, parseCSV, previewImport, MAX_CSV_BYTES } from '../src/storage/csv.js';

const lines = [], assert = (truth, message = 'assertion failed') => { if (!truth) throw new Error(message); };
let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); lines.push(`PASS ${name}`); passed++; }
  catch (error) { lines.push(`FAIL ${name}: ${error.stack || error.message}`); failed++; }
  if (typeof document !== 'undefined') document.querySelector('#report').textContent = lines.join('\n');
}
function step(s, type, payload = {}) { return transition(s, { type, motorId: SCENARIO.target, tool: 'driver', kitId: 'A1', ...payload }).state; }
function prepared() { return step(step(createState(), 'CONFIRM_POWER'), 'TOGGLE_BATTERY'); }
function observed(s = prepared()) {
  for (const m of PROFILE.motors) {
    s = step(s, 'INSPECT_MOTOR', { motorId: m.id });
    s = step(s, 'ANSWER_DAMAGE', { motorId: m.id, answer: m.id === SCENARIO.target ? 'replace' : 'healthy' });
  }
  return step(s, 'ANSWER_REASON', { answer: 'pair' });
}
function repaired(s = observed()) {
  for (const index of [0, 1]) {
    s = step(s, 'REMOVE_SCREW', { index }); s = step(s, 'REMOVE_BLADE', { index });
    s = step(s, 'INSTALL_BLADE', { index }); s = step(s, 'INSTALL_SCREW', { index });
    s = step(s, 'CONFIRM_FASTENING', { index });
  }
  return s;
}
function checked(s = repaired()) {
  for (const check of ['marks', 'count', 'fastening']) s = step(s, 'CONFIRM_CHECK', { check });
  return s;
}
function completed() { return step(checked(), 'FINAL_INSPECTION'); }
function result(i = 1) { return buildResult(completed(), { durationSeconds: 80 }); }
function memoryStorage() {
  const map = new Map(); return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k), map };
}
function throws(fn) { let threw = false; try { fn(); } catch { threw = true; } assert(threw, 'expected rejection'); }

await test('T01 배터리 없는 전원 차단', () => { const s = step(prepared(), 'TOGGLE_POWER'); assert(!s.power && s.errors[0].code === 'no-battery'); });
await test('T02 안전 조건 전 분해 금지·원본 불변', () => { const s = createState(), text = JSON.stringify(s); const next = step(s, 'REMOVE_SCREW', { index: 0 }); assert(next.motors[SCENARIO.target].screws[0].present); assert(JSON.stringify(s) === text); });
await test('T03 전원 켜짐 배터리 분리 차단', () => { let s = step(createState(), 'TOGGLE_POWER'); s = step(s, 'TOGGLE_BATTERY'); assert(s.power && s.battery); });
await test('T04 고정 나사 제거 전 날개 분리 차단', () => { const s = step(observed(), 'REMOVE_BLADE', { index: 0 }); assert(s.motors[SCENARIO.target].blades[0].present); });
await test('T05 날개 하나 교체는 미완료', () => { let s = observed(); for (const type of ['REMOVE_SCREW', 'REMOVE_BLADE', 'INSTALL_BLADE', 'INSTALL_SCREW', 'CONFIRM_FASTENING']) s = step(s, type, { index: 0 }); assert(physicalIssues(s).length > 0); assert(step(s, 'FINAL_INSPECTION').status !== 'completed'); });
await test('T06 잘못된 표식·혼합 포장·기존 나사 차단', () => { let s = observed(); for (const index of [0, 1]) { s = step(s, 'REMOVE_SCREW', { index }); s = step(s, 'REMOVE_BLADE', { index }); } const wrong = step(s, 'INSTALL_BLADE', { index: 0, kitId: 'B1' }); assert(!wrong.motors[SCENARIO.target].blades[0].present); s = step(s, 'INSTALL_BLADE', { index: 0 }); s = step(s, 'INSTALL_BLADE', { index: 1, kitId: 'A2' }); assert(!s.motors[SCENARIO.target].blades[1].present); const bad = step(s, 'INSTALL_SCREW', { index: 0, kitId: 'original' }); assert(!bad.motors[SCENARIO.target].screws[0].present); });
await test('T07 정상 교체와 부품 위치 일관성', () => { const s = repaired(); assert(physicalIssues(s).length === 0); const installed = Object.values(s.motors).flatMap(m => [...m.blades, ...m.screws]).filter(b => b.present).map(b => b.id); assert(new Set(installed).size === installed.length); assert(installed.every(id => !s.discarded.includes(id))); });
await test('T08 체결 누락 판정', () => { let s = repaired(); s.motors[SCENARIO.target].screws[1].secured = false; assert(physicalIssues(s).some(v => v.includes('체결'))); assert(step(s, 'FINAL_INSPECTION').status === 'active'); });
await test('T09 재분리 시 확인 무효화', () => { let s = checked(); s = step(s, 'REMOVE_SCREW', { index: 0 }); assert(Object.values(s.checks).every(v => !v)); assert(!s.motors[SCENARIO.target].screws[0].secured); });
await test('T10 다른 모터 미완료 검사', () => { let s = checked(); s = step(s, 'REMOVE_SCREW', { motorId: 'rear-left', index: 0 }); assert(physicalIssues(s).some(v => v.includes('후방 왼쪽'))); });
await test('T11 조립만으로 통과 금지', () => { const s = checked(); s.motors['rear-right'].verdict = null; assert(completionIssues(s).length); assert(step(s, 'FINAL_INSPECTION').status === 'active'); });
await test('T12 정상 완료와 종료 뒤 입력 불변', () => { const s = completed(); assert(s.status === 'completed'); assert(transition(s, { type: 'TOGGLE_BATTERY' }).state === s); });
await test('T13 같은 오조작 연타 중복 집계 없음', () => { let s = createState(); for (let i = 0; i < 30; i++) s = step(s, 'REMOVE_SCREW', { index: 0 }); assert(s.errors.length === 1); });
await test('T14 독립 실습도 동일 판정', () => { const s = createState({ mode: 'independent' }); assert(step(s, 'FINAL_INSPECTION').status === 'active'); });
await test('T15 새 시도 식별자·초기화 분리', () => { const a = completed(), b = createState(); assert(a.meta.attemptId !== b.meta.attemptId); assert(b.battery && !b.power && !b.diagnosis); });
await test('T16 저장 재조회·중복 저장 제외', () => { const storage = memoryStorage(), repo = new ResultRepository(storage), r = result(); repo.add(r); repo.add(r); assert(new ResultRepository(storage).load().records.length === 1); });
await test('T18 저장 실패·손상 데이터 덮어쓰기 방지', () => { const storage = memoryStorage(); storage.setItem(STORAGE_KEY, '{broken'); const repo = new ResultRepository(storage); throws(() => repo.add(result())); assert(storage.getItem(STORAGE_KEY) === '{broken'); const blocked = new ResultRepository({ getItem: () => null, setItem() { throw new Error('quota'); } }); throws(() => blocked.add(result())); });
await test('T19 CSV 취합·중복·충돌', () => { const a = result(), b = { ...a, hints: a.hints + 1 }; const csv = exportCSV([a]); assert(previewImport(csv, []).added === 1); assert(previewImport(csv, [a]).duplicate === 1); assert(mergeRecords([a], [b]).conflict === 1); });
await test('T20 CSV 특수문자·한글·수식·앞자리 0 왕복', () => { for (const v of ['001', '=1+1', '+cmd', '@sum', '-1', "'문자", '훈련,회차"줄\n바꿈']) { const r = { ...result(), session: v, trainee: '0007' }; const roundtrip = parseCSV(exportCSV([r])); assert(!roundtrip.invalid.length, JSON.stringify(roundtrip.invalid)); assert(roundtrip.records[0].session === v); assert(roundtrip.records[0].trainee === '0007'); } throws(() => parseCSV('"broken')); const csv = exportCSV([{ ...result(), session: '=1+1' }]); assert(csv.includes("'=1+1")); });
await test('T21 선택한 결과만 삭제·다른 앱 보존', () => { const storage = memoryStorage(), repo = new ResultRepository(storage), a = result(), b = result(); storage.setItem('other-app', 'keep'); repo.add(a); repo.add(b); repo.remove([a.attemptId]); assert(repo.load().records[0].attemptId === b.attemptId); assert(storage.getItem('other-app') === 'keep'); });
await test('T25 500건 한도·파일 크기 거절', () => { const r = result(), records = Array.from({ length: 500 }, (_, i) => ({ ...r, attemptId: `test-${i}` })); assert(mergeRecords([], records).records.length === 500); throws(() => mergeRecords(records, [{ ...r, attemptId: 'overflow' }])); throws(() => parseCSV('x'.repeat(MAX_CSV_BYTES + 1))); });
await test('무작위 입력 1000회에도 부품 불변조건', () => { let s = observed(); let seed = 53; const random = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; }; const actions = ['REMOVE_SCREW', 'REMOVE_BLADE', 'INSTALL_BLADE', 'INSTALL_SCREW', 'CONFIRM_FASTENING', 'FINAL_INSPECTION']; for (let i = 0; i < 1000; i++) { s = step(s, actions[random(actions.length)], { motorId: PROFILE.motors[random(4)].id, index: random(2), kitId: ['A1', 'B1', 'A2'][random(3)] }); const installed = Object.values(s.motors).flatMap(m => [...m.blades, ...m.screws]).filter(b => b.present).map(b => b.id); assert(new Set(installed).size === installed.length); assert(installed.every(id => !s.discarded.includes(id))); assert(!s.power || s.battery); } });

if (typeof document !== 'undefined') {
const frame = document.querySelector('#app-frame');
await new Promise((resolve, reject) => { frame.onload = resolve; frame.onerror = reject; frame.src = '../index.html'; });
const doc = () => frame.contentDocument;
function click(action, extra = '') { const node = doc().querySelector(`[data-action="${action}"]${extra}`); assert(node, `missing button ${action} ${extra}`); assert(!node.disabled, `disabled button ${action}`); node.click(); }
function select(id, value) { const node = doc().getElementById(id); assert(node, `missing select ${id}`); node.value = value; node.dispatchEvent(new Event('change', { bubbles: true })); }
function start(mode = 'guided') { const form = doc().querySelector('#start-form'); assert(form, 'start form'); form.elements.session.value = 'QA 회차'; form.elements.trainee.value = '0001'; form.querySelector(`[name="mode"][value="${mode}"]`).checked = true; form.requestSubmit(); }
async function waitFor(selector) {
  const deadline = Date.now() + 10000;
  while (!doc().querySelector(selector)) {
    if (Date.now() > deadline) throw new Error(`missing ${selector}`);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}
function piece(kind, index) {
  const node = [...doc().querySelectorAll('[data-piece]')].find(n => {
    const value = JSON.parse(n.dataset.piece); return value.kind === kind && (index === undefined || value.index === index);
  });
  assert(node && !node.disabled, `missing piece ${kind} ${index}`); node.click();
}
function place(kind, index) {
  const node = [...doc().querySelectorAll('[data-drop]')].find(n => {
    const value = JSON.parse(n.dataset.drop); return value.kind === kind && (index === undefined || value.index === index);
  });
  assert(node, `missing target ${kind} ${index}`); node.click();
}
async function uiComplete(mode, remainingMotor) {
  start(mode); await waitFor('[data-action="confirm-power"]'); click('confirm-power');
  piece('battery'); place('discard');
  for (const m of PROFILE.motors.filter(m => m.id !== remainingMotor.id)) { click('select-motor', `[data-motor="${m.id}"]`); click(m.id === SCENARIO.target ? 'answer-replace' : 'answer-healthy'); }
  click('select-motor', `[data-motor="${SCENARIO.target}"]`); select('kit', 'A1');
  for (const index of [0, 1]) {
    piece('driver'); place('screw', index); piece('mounted-blade', index); place('discard');
    piece('blade', index); place('blade', index); piece('screw', index); place('screw', index);
    piece('driver'); place('screw', index);
  }
  click('view-all');
  assert(doc().querySelector('[data-remaining-motors]').textContent.includes(`${remainingMotor.short}번`), 'missing remaining motor');
  assert(doc().querySelectorAll('.three-motor-label[data-inspection="pending"]').length === 1, 'wrong remaining count');
  assert(doc().querySelectorAll('.three-motor-label[data-inspection="done"]').length === 3, 'completed motors unmarked');
  assert(!doc().querySelector('.final-panel'), 'final shown at 3/4');
  if (mode === 'independent') {
    const switchView = value => { const select = doc().querySelector('[data-input="view-mode"]'); select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); };
    switchView('2d');
    assert(doc().querySelector(`.flat-points [data-motor="${remainingMotor.id}"]`).dataset.inspection === 'pending', '2D status lost');
    assert(doc().querySelectorAll('.flat-points [data-inspection="done"]').length === 3, '2D completed status lost');
    switchView('3d');
  }
  click('next-motor'); click('answer-healthy');
  assert(doc().querySelector('.final-panel'), 'final missing after remaining judgment');
  for (const check of ['marks', 'count', 'fastening']) {
    const node = doc().querySelector(`[data-input="final-check"][data-check="${check}"]`);
    assert(node, `missing final check ${check}`); node.checked = true; node.dispatchEvent(new Event('change', { bubbles: true }));
  }
  click('final'); assert(doc().querySelector('.result-card'), 'result screen');
  assert(doc().querySelector('.save-status.saved'), 'result saved');
}
await test('UI 초기 로딩·외부 리소스 의존 없음', () => { assert(doc().title.includes('AEROLAB')); assert(doc().querySelector('#drone-viewport, .drone-svg')); const resources = frame.contentWindow.performance.getEntriesByType('resource'); assert(resources.every(r => new URL(r.name).origin === location.origin)); });
const original = localStorage.getItem(STORAGE_KEY);
try {
  localStorage.removeItem(STORAGE_KEY);
  await test('T27 UI 연속 3회 정비·조종기 전환 후 결과 보존', async () => {
    let controllerChecked = false;
    for (const [index, mode] of ['guided', 'independent', 'guided'].entries()) {
      await uiComplete(mode, PROFILE.motors[index + 1]);
      if (!controllerChecked) {
        const before = localStorage.getItem(STORAGE_KEY);
        doc().querySelector('.result-buttons [data-action="controller"]').click();
        await waitFor('[data-action="controller-aircraft-power"]');
        click('controller-aircraft-power'); click('controller-remote-power'); click('controller-link');
        const pad = doc().querySelector('[data-stick="left"]');
        pad.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
        assert(doc().querySelector('.controller-panel').dataset.rotation === '100', 'controller response');
        frame.contentWindow.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowUp' }));
        click('training');
        assert(doc().querySelector('.save-status.saved'), 'saved result lost');
        assert(localStorage.getItem(STORAGE_KEY) === before, 'controller changed maintenance results');
        controllerChecked = true;
      }
      click('next');
    }
    assert(new ResultRepository(localStorage).load().records.length === 3, 'three results');
  });
  await test('UI 운영 목록·회차·선택 삭제', () => { frame.contentWindow.confirm = () => true; click('operations'); assert(doc().querySelectorAll('tbody tr').length === 3); const checkbox = doc().querySelector('[data-input="select-record"]'); checkbox.checked = true; checkbox.dispatchEvent(new Event('change', { bubbles: true })); click('delete-records'); assert(new ResultRepository(localStorage).load().records.length === 2); });
  await test('UI 진행 중 중단·재시작 기록 유지', () => { click('training'); start('independent'); click('restart'); assert(doc().querySelector('.training-grid')); const repo = new ResultRepository(localStorage); assert(repo.load().records.some(r => r.status === 'abandoned')); assert(repo.load().records.length === 3); click('operations'); });
  await test('UI 새로고침 후 저장 기록 조회', async () => { await new Promise(resolve => { frame.onload = resolve; frame.contentWindow.location.reload(); }); click('operations'); assert(doc().querySelectorAll('tbody tr').length === 4); });
  await test('UI 노트북·모바일 가로 넘침 없음', () => { for (const width of [1366, 1000, 760, 390]) { frame.width = width; assert(doc().documentElement.scrollWidth <= width + 2, `overflow ${width}: ${doc().documentElement.scrollWidth}`); } });
} finally {
  if (original === null) localStorage.removeItem(STORAGE_KEY); else localStorage.setItem(STORAGE_KEY, original);
}
document.querySelector('#report').textContent = `${failed === 0 ? 'ALL PASS' : 'FAILED'} · ${passed} passed · ${failed} failed\n${lines.join('\n')}`;
document.body.dataset.finished = 'true'; document.body.dataset.passed = String(passed); document.body.dataset.failed = String(failed);
} else {
  console.log(`${failed === 0 ? 'ALL PASS' : 'FAILED'} · ${passed} passed · ${failed} failed\n${lines.join('\n')}`);
  process.exitCode = failed ? 1 : 0;
}
