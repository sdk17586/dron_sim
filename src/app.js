import { PROFILE } from './content/aircraft-profiles.js';
import { SCENARIO } from './content/scenarios.js';
import { createState, transition, stage, buildResult, readyForMaintenance } from './domain/state.js';
import { ResultRepository } from './storage/result-repository.js';
import { exportCSV, previewImport, MAX_CSV_BYTES } from './storage/csv.js';
import { renderWorkbench, renderInspector } from './ui/workbench.js';
import { placePart } from './domain/placement.js';
import { installPartInteraction, positionFlatPoints } from './ui/parts.js';
import { renderResult, renderOperations } from './ui/results.js';
import { escapeHTML as e, icon, button } from './ui/shared.js';
import { installedBattery } from './domain/battery.js';
import { previewBatteryGauge } from './ui/battery-indicator.js';
import { createControllerState, createControllerAircraft, controllerTransition, rotationDemand, connectionLabel } from './domain/controller.js';
import { renderController, updateController, installControllerInput } from './ui/controller.js';
import { updateFlatRotorPreview, stopRotorPreviews } from './ui/rotor-preview.js';

const app = document.querySelector('#app');
let storage;
try { storage = window.localStorage; } catch { storage = { getItem() { throw new Error('브라우저 저장이 차단되어 있습니다.'); } }; }
const repository = new ResultRepository(storage);
let state = null, result = null, saved = false, saveError = '', started = 0;
let feedback = null;
const ui = { route: 'training', selected: 'front-left', zoomed: false, tool: 'hand', kitId: 'A1',
  session: '훈련-01', trainee: '001', mode: 'guided', filter: '', selectedRecords: new Set(), importPreview: null,
  viewMode: '3d', topView: false, exploded: false, rendererError: '',
  compatible3d: new URLSearchParams(location.search).get('compatible3d') !== '0' };
let viewport = null, ViewportClass = null, loadingViewport = false, interactions = null;
let controller = createControllerState(), controllerAircraft = createControllerAircraft(), controllerInput = null;
const sceneState = () => ui.route === 'controller' ? controllerAircraft : state;
const sceneUI = () => ui.route === 'controller' ? { ...ui, controllerMode: true, zoomed: false, exploded: false } : ui;
function updateControllerDisplay() {
  if (ui.route !== 'controller') return;
  updateController(app, controller);
  const level = rotationDemand(controller);
  viewport?.setRotorPreview(level); updateFlatRotorPreview(app, level);
}
function stopController() {
  controllerInput?.cancel(false); controller = createControllerState();
  stopRotorPreviews(app);
  viewport?.setRotorPreview(0);
}
function actController(action) {
  if (ui.route !== 'controller') return;
  controller = controllerTransition(controller, action);
  controllerAircraft.power = controller.aircraftPower;
  if (['STICK', 'CENTER'].includes(action.type)) { updateControllerDisplay(); return; }
  announce(action.type === 'STOP' ? '회전을 정지하고 연결을 해제했습니다.' : connectionLabel(controller));
  render();
}

function fallback3d(message) {
  viewport?.dispose(); viewport = null;
  ui.viewMode = '2d'; ui.rendererError = message || '이 브라우저에서는 3D를 사용할 수 없어 2D 보기로 전환했습니다. 브라우저의 그래픽 가속 설정을 확인하세요.';
  render();
}
function syncViewport() {
  const host = document.querySelector('#drone-viewport');
  if (!host || ui.viewMode !== '3d') { viewport?.detach(); return; }
  if (!ViewportClass) {
    if (!loadingViewport) {
      loadingViewport = true;
      import('./ui/drone3d.js').then(module => { ViewportClass = module.DroneViewport; loadingViewport = false; syncViewport(); })
        .catch(() => { loadingViewport = false; fallback3d('3D 화면을 불러오지 못해 2D 보기로 전환했습니다. 새로고침해 다시 시도할 수 있습니다.'); });
    }
    return;
  }
  try {
    if (!viewport) viewport = new ViewportClass({
      compatible: ui.compatible3d,
      onSelect: selectMotor,
      onUnavailable: fallback3d,
    });
    viewport.attach(host); viewport.sync(sceneState(), sceneUI());
    if (ui.route === 'controller') viewport.setRotorPreview(rotationDemand(controller));
  } catch { fallback3d(); }
}

function render() {
  interactions?.clear();
  stopRotorPreviews(app);
  controllerInput?.cancel(false);
  controller = controllerTransition(controller, { type: 'CENTER' });
  const active = document.activeElement;
  const focus = active?.id || null;
  const focusAction = active?.dataset.action;
  const focusMotor = active?.dataset.motor;
  const focusIndex = active?.dataset.index;
  const focusCheck = active?.dataset.check;
  const focusAnchor = active?.dataset.anchor;
  const focusLabel = active?.getAttribute('aria-label');
  const panelScroll = document.querySelector('.inspector')?.scrollTop || 0;
  const stored = repository.load();
  if (result && saved && (stored.error || !stored.records.some(r => r.attemptId === result.attemptId))) {
    saved = false;
    saveError = stored.error || '이 결과가 저장 목록에서 삭제되었습니다. 다시 저장하거나 파일로 보관할 수 있습니다.';
  }
  const current = state ? stage(state) : 0;
  const pack = state ? installedBattery(state) : null;
  const settingsOpen = document.querySelector('.more-menu')?.open || false;
  app.innerHTML = `<div class="app-shell minimal-shell"><header class="minimal-header"><a href="#" class="minimal-brand" data-action="training">${icon('rotor')}<strong>AEROLAB</strong></a><span class="header-title">${ui.route === 'controller' ? '조종기 작동 확인' : '프로펠러 정비'}</span><span class="header-session">${state && !result ? e(state.meta.trainee) + ' · ' : ''}${stored.error ? '저장 확인 필요' : '기초 정비 실습'}</span><nav aria-label="주요 메뉴">${button(ui.route === 'operations' ? '실습으로' : '훈련 기록', ui.route === 'operations' ? 'training' : 'operations', 'quiet-button')}
    <details class="more-menu" ${settingsOpen ? 'open' : ''}><summary aria-label="추가 설정">···</summary><div class="more-menu-content"><label>화면<select data-input="view-mode" aria-label="화면 방식"><option value="3d" ${ui.viewMode === '3d' ? 'selected' : ''}>3D</option><option value="2d" ${ui.viewMode === '2d' ? 'selected' : ''}>2D</option></select></label>${ui.viewMode === '3d' && ui.route !== 'controller' ? `<label class="structure-option"><input type="checkbox" data-input="exploded" ${ui.exploded ? 'checked' : ''}>구조 벌려 보기</label>` : ''}${state && !result && ui.route === 'training' ? `<div class="battery-practice"><label for="battery-charge">잔량 연습 <output id="battery-charge-value">${pack ? pack.charge + '%' : '—'}</output></label><input id="battery-charge" type="range" data-input="battery-charge" min="0" max="100" step="1" value="${pack?.charge ?? 0}" aria-label="연습용 배터리 잔량" ${pack ? '' : 'disabled'}><small>${pack ? '실제 방전 속도가 아닌 연습용 조절입니다.' : '배터리를 장착하면 조절할 수 있습니다.'}</small></div>${button('다시 시작', 'restart', 'quiet-button')}` : ''}${ui.route !== 'controller' ? button('조종기 작동 확인', 'controller', 'quiet-button', state?.status === 'active' ? 'disabled title="정비 완료 후 사용할 수 있습니다"' : '') : ''}</div></details></nav></header>
    <main id="main" tabindex="-1">${ui.route === 'operations' ? renderOperations(stored.records, ui, stored) : ui.route === 'controller' ? `<div class="workshop-heading"><span>연결 상태 · 입력 반응 확인</span><p>별도로 준비된 교육 기체입니다. 정비 결과는 유지됩니다.</p></div><div class="training-grid controller-grid">${renderWorkbench(controllerAircraft, sceneUI())}${renderController()}</div>` : result ? renderResult(result, saved, saveError) : `<div class="workshop-heading"><span>${state ? `0${current + 1} / ${SCENARIO.steps[current]}` : '직접 해보는 드론 정비'}</span><p id="interaction-hint">${state ? '부품을 끌어 놓거나, 클릭해 집고 놓으세요. 취소: Esc' : '관찰하고, 교체하고, 다시 확인하세요.'}</p></div><div class="training-grid ${state ? 'is-practicing' : 'is-preparing'}">${renderWorkbench(state, ui)}${renderInspector(state, ui)}</div>`}
    <div class="feedback ${feedback?.kind || ''}" role="status" ${feedback ? '' : 'hidden'}>${icon(feedback?.kind === 'success' ? 'check' : 'info')}<span>${e(feedback?.message || '')}</span>${button('×', 'dismiss-feedback', 'dismiss', 'aria-label="안내 닫기"')}</div></main></div>`;
  const inspector = document.querySelector('.inspector');
  if (inspector) inspector.scrollTop = panelScroll;
  syncViewport();
  const flat = document.querySelector('.flat-stage');
  if (flat) positionFlatPoints(flat, ui);
  updateControllerDisplay();
  if (focus) document.getElementById(focus)?.focus({ preventScroll: true });
  else if (focusAction) {
    const buttons = [...app.querySelectorAll('[data-action]')];
    const replacement = buttons.find(b => b.dataset.action === focusAction && b.dataset.motor === focusMotor
      && b.dataset.index === focusIndex && b.dataset.check === focusCheck)
      || (focusIndex !== undefined ? buttons.find(b => b.dataset.index === focusIndex) : null);
    replacement?.focus({ preventScroll: true });
  }
  if (!focus && !focusAction) {
    const candidates = [...app.querySelectorAll('button,input,[tabindex]')];
    const replacement = candidates.find(node => focusAnchor && node.dataset.anchor === focusAnchor)
      || candidates.find(node => focusCheck && node.dataset.check === focusCheck)
      || candidates.find(node => focusLabel && node.getAttribute('aria-label') === focusLabel && !node.disabled);
    replacement?.focus({ preventScroll: true });
  }
}
function selectMotor(id) {
  if (ui.route === 'controller') return;
  ui.selected = id; ui.zoomed = Boolean(state && readyForMaintenance(state)); ui.topView = false; feedback = null;
  if (state && !result && readyForMaintenance(state) && !state.motors[id].inspected) {
    state = transition(state, { type: 'INSPECT_MOTOR', motorId: id }).state;
  }
  render();
}
function announce(message) { document.querySelector('#announcer').textContent = message; }
function notify(message, kind = 'info') { feedback = { message, kind }; announce(message); render(); }
function saveCurrent() {
  try { repository.add(result); saved = true; saveError = ''; }
  catch (error) { saved = false; saveError = error.message; }
}
function finish(status) {
  result = buildResult(state, { status, durationSeconds: (performance.now() - started) / 1000 });
  state.status = status; saveCurrent();
}
function allowLeave() {
  if (state?.status === 'active') {
    if (!confirm('현재 실습을 중단 결과로 보관하고 이동할까요?')) return false;
    finish('abandoned');
  }
  if (result && !saved && !confirm('결과를 저장하지 못했습니다. 먼저 파일로 내보내는 것을 권장합니다. 저장하지 않고 이동할까요?')) { render(); return false; }
  return true;
}
function clearAttempt() {
  stopController();
  state = null; result = null; saved = false; saveError = ''; feedback = null;
  Object.assign(ui, { selected: 'front-left', zoomed: false, tool: 'hand', kitId: 'A1', topView: false, exploded: false });
}
function download(text, name, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type }), url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function dispatch(type, payload = {}) {
  if (!state || result) return;
  const next = transition(state, { type, motorId: ui.selected, tool: ui.tool, kitId: ui.kitId, ...payload });
  state = next.state; feedback = next.feedback;
  if (state.status === 'completed') finish('completed');
  announce(feedback.message); render();
}
app.addEventListener('submit', event => {
  if (event.target.id !== 'start-form') return;
  event.preventDefault();
  const data = new FormData(event.target);
  const session = String(data.get('session')).trim(), trainee = String(data.get('trainee')).trim();
  if (!session || !trainee || /[\x00-\x1f]/.test(session + trainee)) return notify('훈련 회차와 교육생 번호를 확인하세요.', 'warning');
  ui.session = session; ui.trainee = trainee; ui.mode = data.get('mode');
  state = createState({ session, trainee, mode: ui.mode }); result = null; saved = false; started = performance.now();
  notify(ui.mode === 'guided' ? '실습을 시작합니다. 전원을 확인하고 배터리를 분리하세요.' : '독립 실습을 시작합니다. 기체를 관찰하고 정비 과제를 수행하세요.');
});
app.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (!target || target.disabled) return;
  event.preventDefault();
  const action = target.dataset.action;
  try {
    if (action === 'controller') {
      if (state?.status === 'active') return notify('정비를 마친 다음 조종기 작동 확인을 시작하세요.', 'warning');
      stopController(); controllerAircraft = createControllerAircraft();
      ui.route = 'controller'; ui.zoomed = false; ui.topView = false; feedback = null;
      if (viewport) viewport.cameraKey = '';
      document.querySelector('.more-menu')?.removeAttribute('open'); render(); return;
    }
    const controllerActions = { 'controller-aircraft-power': 'AIRCRAFT_POWER', 'controller-remote-power': 'REMOTE_POWER', 'controller-link': 'LINK', 'controller-stop': 'STOP' };
    if (controllerActions[action]) { actController({ type: controllerActions[action] }); return; }
    if (action === 'training' || action === 'operations') {
      if (ui.route === action) return;
      if (!allowLeave()) return;
      stopController();
      if (state?.status !== 'active' && !result) clearAttempt();
      ui.route = action; feedback = null; render(); return;
    }
    if (action === 'select-motor' || action === 'next-motor') { selectMotor(target.dataset.motor); return; }
    if (action === 'view-all' || action === 'view-zoom') { ui.zoomed = action === 'view-zoom'; ui.topView = false; if (viewport) viewport.cameraKey = ''; render(); return; }
    if (action === 'view-3d' || action === 'view-2d') { ui.viewMode = action === 'view-3d' ? '3d' : '2d'; ui.rendererError = ''; render(); return; }
    if (action === 'view-top') { ui.topView = !ui.topView; render(); return; }
    if (action === 'view-exploded') { ui.exploded = !ui.exploded; render(); return; }
    if (action === 'dismiss-feedback') { feedback = null; render(); return; }
    if (action === 'next' || action === 'retry' || action === 'restart') {
      if (!allowLeave()) return;
      const priorMode = ui.mode;
      const nextNumber = /^\d{1,8}$/.test(ui.trainee) ? String(Number(ui.trainee) + 1).padStart(ui.trainee.length, '0') : '';
      clearAttempt();
      if (action === 'next') ui.trainee = nextNumber;
      ui.route = 'training'; render();
      if (action !== 'next') {
        state = createState({ session: ui.session, trainee: ui.trainee, mode: priorMode }); started = performance.now();
        notify('새 시도로 다시 시작합니다. 이전 결과는 유지됩니다.');
      }
      return;
    }
    if (action === 'export-current') { if (result) download(exportCSV([result]), 'aerolab-result.csv'); return; }
    if (action === 'save-retry') { saveCurrent(); render(); return; }
    if (action === 'export-all') {
      const stored = repository.load();
      if (stored.error) return notify(stored.error, 'warning');
      const records = stored.records.filter(r => !ui.filter || r.session === ui.filter);
      if (!records.length) return notify('내보낼 결과가 없습니다.');
      download(exportCSV(records), 'aerolab-results.csv'); return;
    }
    if (action === 'export-raw') { const raw = repository.load().raw; if (raw) download(raw, 'aerolab-recovery.json', 'application/json'); return; }
    if (action === 'reset-corrupt') {
      if (confirm('원본 데이터를 먼저 내보냈나요? 이 앱의 저장 데이터만 초기화하며 되돌릴 수 없습니다.')) { repository.resetCorruptData(); notify('이 앱의 저장 데이터를 초기화했습니다.'); }
      return;
    }
    if (action === 'delete-records') {
      const ids = [...ui.selectedRecords];
      if (!ids.length) return notify('삭제할 결과를 선택하세요.');
      if (confirm(`선택한 결과 ${ids.length}건을 삭제할까요? 먼저 CSV로 보관하는 것을 권장합니다.`)) {
        repository.remove(ids); ui.selectedRecords.clear(); ui.importPreview = null; notify(`${ids.length}건을 삭제했습니다.`);
      } return;
    }
    if (action === 'import-cancel') { ui.importPreview = null; render(); return; }
    if (action === 'import-confirm') {
      const stored = repository.load();
      if (stored.error) return notify(stored.error, 'warning');
      const preview = previewImport(ui.importText, stored.records);
      repository.write(preview.records); ui.importPreview = null; ui.importText = ''; ui.selectedRecords.clear();
      notify(`결과 ${preview.added}건을 추가했습니다. 중복 ${preview.duplicate}건, 충돌 ${preview.conflict}건은 제외했습니다.`, 'success'); return;
    }
    const actions = { power: 'TOGGLE_POWER', battery: 'TOGGLE_BATTERY', 'confirm-power': 'CONFIRM_POWER', inspect: 'INSPECT_MOTOR',
      'answer-healthy': 'ANSWER_DAMAGE', 'answer-replace': 'ANSWER_DAMAGE', 'reason-single': 'ANSWER_REASON', 'reason-pair': 'ANSWER_REASON', 'reason-screw': 'ANSWER_REASON',
      'remove-screw': 'REMOVE_SCREW', 'remove-blade': 'REMOVE_BLADE', 'install-blade': 'INSTALL_BLADE', 'install-screw': 'INSTALL_SCREW', fasten: 'CONFIRM_FASTENING', check: 'CONFIRM_CHECK', final: 'FINAL_INSPECTION', hint: 'HINT' };
    if (actions[action]) {
      if (action === 'inspect') ui.zoomed = true;
      dispatch(actions[action], { index: Number(target.dataset.index), check: target.dataset.check,
        answer: action === 'answer-healthy' ? 'healthy' : action === 'answer-replace' ? 'replace' : action.split('-')[1] });
    }
  } catch (error) { notify(error.message || '요청을 처리하지 못했습니다.', 'warning'); }
});
app.addEventListener('input', event => {
  if (event.target.dataset.input !== 'battery-charge' || !state || result) return;
  const pack = installedBattery(state); if (!pack) return;
  const preview = { ...pack, charge: Number(event.target.value) };
  document.querySelector('#battery-charge-value').textContent = `${preview.charge}%`;
  previewBatteryGauge(app, preview); viewport?.setBatteryIndicator(preview);
});
app.addEventListener('change', async event => {
  const target = event.target;
  if (target.id === 'csv-file') {
    const file = target.files?.[0]; if (!file) return;
    try {
      if (file.size > MAX_CSV_BYTES) throw new Error('CSV는 5MB 이하만 가져올 수 있습니다.');
      const stored = repository.load(); if (stored.error) throw new Error(stored.error);
      ui.importText = await file.text(); ui.importPreview = previewImport(ui.importText, stored.records); feedback = null; render();
    } catch (error) { target.value = ''; notify(error.message, 'warning'); }
    return;
  }
  switch (target.dataset.input) {
    case 'tool': ui.tool = target.value; break;
    case 'kit': ui.kitId = target.value; break;
    case 'view-mode': ui.viewMode = target.value; ui.rendererError = ''; break;
    case 'exploded': ui.exploded = target.checked; break;
    case 'final-check': dispatch('CONFIRM_CHECK', { check: target.dataset.check }); return;
    case 'battery-charge': dispatch('SET_BATTERY_CHARGE', { charge: Number(target.value), batteryId: installedBattery(state)?.id }); return;
    case 'filter': ui.filter = target.value; ui.selectedRecords.clear(); break;
    case 'select-record': target.checked ? ui.selectedRecords.add(target.value) : ui.selectedRecords.delete(target.value); break;
    case 'select-all': repository.load().records.filter(r => !ui.filter || r.session === ui.filter).forEach(r => target.checked ? ui.selectedRecords.add(r.attemptId) : ui.selectedRecords.delete(r.attemptId)); break;
    default: return;
  }
  render();
});
window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && ui.route === 'controller') { event.preventDefault(); controllerInput?.cancel(false); actController({ type: 'STOP' }); return; }
  if (event.key === 'Escape' && ui.zoomed && !interactions?.holding) { ui.zoomed = false; render(); }
});
window.addEventListener('beforeunload', event => {
  if (state?.status === 'active' || (result && !saved)) { event.preventDefault(); event.returnValue = ''; }
});
window.addEventListener('storage', event => { if (event.key?.startsWith('aerolab.')) { ui.importPreview = null; render(); } });
window.addEventListener('pagehide', () => { stopController(); viewport?.dispose(); viewport = null; });
controllerInput = installControllerInput(app, actController);
window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', updateControllerDisplay);
interactions = installPartInteraction(app, {
  onPlace(piece, target) {
    if (!state || result) return;
    const placed = placePart(state, piece, target);
    state = placed.state; feedback = placed.feedback;
    if (['battery', 'battery-pack'].includes(piece.kind) && feedback.kind === 'success') {
      ui.zoomed = false; ui.topView = false;
      if (viewport) viewport.cameraKey = '';
    }
    announce(feedback.message); render();
  },
  onMessage(message) {
    const hint = document.querySelector('#interaction-hint');
    if (hint) hint.textContent = message;
    announce(message);
  },
});
window.addEventListener('resize', () => {
  const flat = document.querySelector('.flat-stage');
  if (flat) positionFlatPoints(flat, ui);
});
render();
