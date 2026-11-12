import { createState, transition, buildResult, readyForMaintenance } from './domain/state.js';
import { ResultRepository } from './storage/result-repository.js';
import { exportCSV, previewImport, MAX_CSV_BYTES } from './storage/csv.js';
import { renderWorkbench, renderInspector } from './ui/workbench.js';
import { placePart } from './domain/placement.js';
import { installPartInteraction, positionFlatPoints } from './ui/parts.js';
import { renderResult, renderOperations } from './ui/results.js';
import { escapeHTML as e, icon } from './ui/shared.js';
import { installedBattery } from './domain/battery.js';
import { previewBatteryGauge } from './ui/battery-indicator.js';
import { createControllerState, createControllerAircraft, controllerTransition, rotationDemand, connectionLabel, sticksNeutral } from './domain/controller.js';
import { renderController, updateController, installControllerInput } from './ui/controller.js';
import { updateFlatRotorPreview, stopRotorPreviews } from './ui/rotor-preview.js';
import { maintenanceGuide } from './domain/learning-guide.js';
import { controllerCourseGuide, canEnterControllerIMU } from './domain/controller-course.js';
import { renderLearningHeader, renderCourseSelector, renderControllerIntro, renderTaskGuide, renderLearningHelp, updateTaskGuide, applyLearningHighlights } from './ui/learning.js';
import { createRobotState, chooseRobotFault, robotTransition, placeRobotPart, robotGuide, buildRobotResult, robotIsolated } from './domain/quadruped.js';
import { renderRobot } from './ui/quadruped.js';
import { createRobotControllerState, robotControllerTransition, robotControllerGuide, robotDriveDemand, robotConnectionLabel } from './domain/quadruped-controller.js';
import { renderRobotController, updateRobotController } from './ui/quadruped-controller.js';
import { renderSpatialScene } from './ui/spatial-maintenance.js';
import { GuideVoice, updateVoiceControls } from './ui/guide-voice.js';
import { chooseRenderBackend } from './ui/renderer3d.js';
import { createIMUState, imuTransition } from './domain/imu.js';
import { renderIMU, updateIMU } from './ui/imu.js';
import { CourseCompletionNotice } from './ui/course-completion.js';

const app = document.querySelector('#app');
let storage;
try { storage = window.localStorage; } catch { storage = { getItem() { throw new Error('브라우저 저장이 차단되어 있습니다.'); } }; }
const repository = new ResultRepository(storage);
let state = null, result = null, saved = false, saveError = '', started = 0;
let feedback = null;
const ui = { route: 'home', selected: 'front-left', zoomed: false, tool: 'hand', kitId: 'A1',
  session: '훈련-01', trainee: '001', mode: 'guided', filter: '', selectedRecords: new Set(), importPreview: null,
  viewMode: '3d', topView: false, exploded: false, rendererError: '', helpOpen: false,
  compatible3d: new URLSearchParams(location.search).get('compatible3d') === '1',
  robotSelected: 'front-left', robotZoomed: false, robotModule: 'QJ-01' };
let viewport = null, ViewportClass = null, loadingViewport = false, interactions = null;
let renderBackend = ui.compatible3d ? 'svg' : null, choosingRenderBackend = null;
let robot = createRobotState(), robotResult = null, robotSaved = false, robotSaveError = '', robotStarted = 0, lastRobotTarget = '';
let robotViewport = null, RobotViewportClass = null, loadingRobotViewport = false, robotTestTimer = null;
let controller = createControllerState(), controllerAircraft = createControllerAircraft(), controllerInput = null;
let imu = createIMUState(), imuAircraft = createControllerAircraft(), imuTimer = null, imuTickAt = 0;
let robotController = createRobotControllerState(), robotDriveTimer = null;
let robotControllerAttempt = 0;
const robotPreview = createRobotState();
robotPreview.power = false; robotPreview.estop = true;
Object.values(robotPreview.legs).forEach(leg => { leg.condition = 'healthy'; });
const robotControllerModel = structuredClone(robotPreview);
const sceneState = () => ui.route.startsWith('imu') ? { ...imuAircraft, power: ui.route === 'imu' && imu.power } : ['controller', 'controller-intro'].includes(ui.route) ? controllerAircraft : ui.route === 'drone-intro' ? null : state;
const sceneUI = () => ui.route === 'imu' ? { ...ui, imuMode: true, imuState: imu, previewMode: true, viewMode: '3d', zoomed: false, topView: false, exploded: false } : ['drone-intro', 'controller-intro'].includes(ui.route) ? { ...ui, previewMode: true, viewMode: ui.rendererError ? '2d' : '3d', zoomed: false, topView: false, exploded: false }
  : ui.route === 'controller' ? { ...ui, controllerMode: true, zoomed: false, exploded: false } : ui.route === 'training' && state?.status === 'active' ? { ...ui, immersiveMode: true, viewMode: '3d', exploded: false } : ui;
const currentGuide = () => ['controller', 'imu'].includes(ui.route) ? controllerCourseGuide(controller, imu, ui.route) : ui.route === 'robot-controller' ? robotControllerGuide(robotController) : ui.route === 'robot' ? (robot.status === 'active' || robot.status === 'completed' ? robotGuide({ ...robot, moduleChoice: ui.robotModule }, ui.robotSelected) : null) : ui.route === 'training' && state && (!result || result.status === 'completed') ? maintenanceGuide(state, ui) : null;
const guideVoice = new GuideVoice({ storage, onChange: status => updateVoiceControls(app, status) });
const completionNotice = new CourseCompletionNotice();
function syncCompletionNotice(guide = currentGuide()) {
  let completion = null;
  if (ui.route === 'training' && result?.status === 'completed') completion = { key: `drone:${result.attemptId}`, course: '드론 정비 교육' };
  else if (ui.route === 'robot' && robotResult?.status === 'completed') completion = { key: `robot:${robotResult.attemptId}`, course: '사족보행 로봇 정비 교육' };
  else if (ui.route === 'imu' && guide?.complete) completion = { key: `controller:${imu.attempt}`, course: '드론 조종기 교육 · IMU 보정' };
  else if (ui.route === 'robot-controller' && guide?.complete) completion = { key: `robot-controller:${robotControllerAttempt}`, course: '사족보행 로봇 조종기 교육' };
  completionNotice.update(completion);
}
function syncGuideVoice(guide = currentGuide()) {
  const attempt = ['controller', 'imu'].includes(ui.route) ? imu.attempt : ui.route === 'robot' ? robot.meta.attemptId : ui.route === 'training' ? state?.meta.attemptId : '';
  if (document.hidden) guideVoice.suspend();
  guideVoice.update(guide, `${ui.route}:${attempt || ''}`);
  updateVoiceControls(app, guideVoice.snapshot());
}

function syncIMUTimer() {
  const run = ui.route === 'imu' && imu.status === 'calibrating' && !ui.helpOpen && !document.hidden && !ui.rendererError;
  if (!run) { clearInterval(imuTimer); imuTimer = null; return; }
  if (imuTimer) return;
  imuTickAt = performance.now();
  imuTimer = setInterval(() => {
    const now = performance.now(), elapsedMs = now - imuTickAt; imuTickAt = now;
    actIMU({ type: 'TICK', elapsedMs });
  }, 100);
}
function actIMU(action) {
  if (ui.route !== 'imu') return;
  if (['START', 'MOVE_BEGIN', 'POSE'].includes(action.type)) imuTickAt = performance.now();
  const previous = imu, previousTask = currentGuide().current.id;
  imu = imuTransition(imu, action);
  if (['POWER', 'LINK'].includes(action.type)) controller = { ...controller, aircraftPower: imu.power, connected: imu.linked };
  const structural = previousTask !== currentGuide().current.id || previous.status !== imu.status || previous.power !== imu.power || previous.linked !== imu.linked || previous.surface !== imu.surface;
  if (structural) render();
  else {
    updateIMU(app, imu);
    if (viewport?.imuInteraction) {
      viewport.imuInteraction.s = imu;
      if (action.type !== 'TICK') { viewport.imuInteraction.apply(); viewport.render(); }
    }
  }
  syncIMUTimer();
}
function pauseIMU(reason) {
  if (ui.route !== 'imu') return;
  viewport?.imuInteraction?.cancel(false);
  actIMU({ type: 'PAUSE', reason });
}

function saveRobot() {
  try { repository.add(robotResult); robotSaved = true; robotSaveError = ''; }
  catch (error) { robotSaved = false; robotSaveError = error.message; }
}
function finishRobot(status) {
  clearTimeout(robotTestTimer); robotTestTimer = null; robot.testing = false; robot.status = status;
  robotResult = buildRobotResult(robot, { status, durationSeconds: (performance.now() - robotStarted) / 1000 });
  saveRobot();
}
function actRobot(action) {
  const previousPhase = robotGuide(robot, ui.robotSelected).phaseIndex;
  const next = robotTransition(robot, action); robot = next.state; feedback = next.feedback;
  if (feedback.kind === 'success' && action.type === 'DIAGNOSE') {
    const task = robotGuide(robot, ui.robotSelected).current;
    if (task?.legId) {
      ui.robotSelected = task.legId; ui.robotZoomed = true;
      if (task.id.startsWith('robot-inspect-') && !robot.legs[task.legId].inspected) {
        robot = robotTransition(robot, { type: 'INSPECT', legId: task.legId }).state;
      }
      feedback.message += ` 다음: ${task.title}`;
    }
  }
  if (previousPhase < 3 && robotGuide(robot, ui.robotSelected).phaseIndex === 3) ui.robotZoomed = false;
  if (!robot.testing) { clearTimeout(robotTestTimer); robotTestTimer = null; }
  if (robot.status === 'completed' && !robotResult) finishRobot('completed');
  if (robot.testing && !robotTestTimer) robotTestTimer = setTimeout(() => {
    robotTestTimer = null;
    if (ui.route === 'robot' && robot.testing) actRobot({ type: 'FINISH_TEST' });
  }, 3000);
  announce(feedback.message); render();
}
function startRobot(active = true) {
  clearTimeout(robotTestTimer); robotTestTimer = null;
  robot = createRobotState({ targetLeg: chooseRobotFault(lastRobotTarget || robot.targetLeg), session: ui.session, trainee: ui.trainee, active });
  if (active) lastRobotTarget = robot.targetLeg;
  robotResult = null; robotSaved = false; robotSaveError = ''; robotStarted = performance.now();
  Object.assign(ui, { robotSelected: 'front-left', robotZoomed: false, robotModule: 'QJ-01', helpOpen: false });
  feedback = null; render();
}
function selectRobotLeg(id) {
  if (!Object.hasOwn(robot.legs, id) || ui.route !== 'robot') return;
  ui.robotSelected = id; ui.robotZoomed = true;
  if (robot.status === 'active' && robotIsolated(robot) && !robot.legs[id].inspected) actRobot({ type: 'INSPECT', legId: id });
  else render();
}
function syncRobotViewport() {
  const host = app.querySelector('#robot-viewport');
  if (!host) { robotViewport?.detach(); return; }
  if (!RobotViewportClass) {
    if (!loadingRobotViewport) {
      loadingRobotViewport = true;
      import('./ui/quadruped3d.js').then(module => { RobotViewportClass = module.QuadrupedViewport; loadingRobotViewport = false; syncRobotViewport(); })
        .catch(() => { loadingRobotViewport = false; host.textContent = '3D 화면을 불러오지 못했습니다. 새로고침해 다시 시도하세요.'; });
    }
    return;
  }
  try {
    if (robotViewport && robotViewport.canvas.dataset.renderBackend !== renderBackend) { robotViewport.dispose(); robotViewport = null; }
    robotViewport ||= new RobotViewportClass({ compatible: renderBackend === 'svg', onUnavailable: useCompatible3D });
    if (robotViewport.canvas.dataset.renderBackend === 'svg') renderBackend = 'svg';
    robotViewport.attach(host);
    const consoleMode = ui.route.startsWith('robot-controller');
    robotControllerModel.power = ui.route === 'robot-controller' && robotController.robotPower;
    robotViewport.sync(consoleMode ? robotControllerModel : ui.route === 'robot-intro' ? robotPreview : robot,
      consoleMode ? { ...ui, robotControllerMode: true, previewMode: ui.route.endsWith('-intro'), robotZoomed: false }
        : ui.route === 'robot-intro' ? { ...ui, previewMode: true, robotZoomed: false } : { ...ui, immersiveMode: robot.status === 'active' });
  }
  catch { host.textContent = '로봇 3D 표시를 준비하지 못했습니다. 새로고침해 다시 시도하세요.'; }
}
function updateControllerDisplay() {
  if (ui.route !== 'controller') return;
  updateController(app, controller);
  const level = rotationDemand(controller);
  viewport?.setRotorPreview(level); updateFlatRotorPreview(app, level);
  if (sticksNeutral(controller)) {
    const guide = currentGuide(); updateTaskGuide(app, guide); applyLearningHighlights(app, guide, ui); syncGuideVoice(guide);
  }
}
function stopController() {
  controllerInput?.cancel(false); controller = createControllerState();
  clearInterval(robotDriveTimer); robotDriveTimer = null; robotController = createRobotControllerState();
  stopRotorPreviews(app);
  viewport?.setRotorPreview(0);
}
function updateRobotControllerDisplay() {
  if (ui.route !== 'robot-controller') return;
  updateRobotController(app, robotController);
  const demand = robotDriveDemand(robotController);
  robotViewport?.setDrive(robotController, demand.active && robotController.moving);
  const guide = currentGuide(); updateTaskGuide(app, guide); applyLearningHighlights(app, guide, ui); syncGuideVoice(guide);
  if (demand.active && !ui.helpOpen && !document.hidden) {
    if (!robotDriveTimer) {
      let previous = performance.now();
      robotDriveTimer = setInterval(() => {
        const now = performance.now();
        robotController = robotControllerTransition(robotController, { type: 'TICK', seconds: (now - previous) / 1000 }); previous = now;
        updateRobotControllerDisplay();
      }, 90);
    }
  } else { clearInterval(robotDriveTimer); robotDriveTimer = null; }
  syncCompletionNotice(guide);
}
function actRobotController(action) {
  if (ui.route !== 'robot-controller' || (ui.helpOpen && action.type === 'STICK')) return;
  if (!['STICK', 'CENTER'].includes(action.type)) controllerInput?.cancel(false);
  robotController = robotControllerTransition(robotController, action);
  if (['STICK', 'CENTER'].includes(action.type)) { updateRobotControllerDisplay(); return; }
  announce(action.type === 'EMERGENCY_STOP' ? '비상 정지로 로봇 움직임을 차단했습니다.' : action.type === 'STOP' ? '로봇을 정지하고 연결을 해제했습니다.' : robotConnectionLabel(robotController));
  render();
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
  if (ui.route === 'imu') imu = imuTransition(imu, { type: 'PAUSE', reason: '3D 표시가 중단되어 측정을 멈췄습니다.' });
  viewport?.dispose(); viewport = null;
  ui.viewMode = '2d';
  ui.rendererError = ui.route === 'imu' || ui.route === 'training' && state?.status === 'active'
    ? '3D 작업대를 불러오지 못했습니다. 현재 과제를 유지한 채 다시 시도할 수 있습니다.'
    : message || '이 브라우저에서는 3D를 사용할 수 없어 2D 보기로 전환했습니다. 브라우저의 그래픽 가속 설정을 확인하세요.';
  render();
}
function useCompatible3D() {
  if (renderBackend === 'svg') return;
  if (ui.route === 'imu') imu = imuTransition(imu, { type: 'PAUSE', reason: '3D 표시가 전환되어 측정을 멈췄습니다.' });
  renderBackend = 'svg';
  viewport?.dispose(); viewport = null; robotViewport?.dispose(); robotViewport = null;
  ui.rendererError = '';
  render();
}
function syncViewport() {
  if (renderBackend === null && app.querySelector('#drone-viewport,#robot-viewport')) {
    choosingRenderBackend ||= chooseRenderBackend().then(backend => {
      renderBackend = backend; choosingRenderBackend = null; syncViewport();
    });
    return;
  }
  syncRobotViewport();
  const host = document.querySelector('#drone-viewport');
  if (!host || sceneUI().viewMode !== '3d') { viewport?.detach(); return; }
  if ((ui.route === 'imu' || ui.route === 'training' && state?.status === 'active') && ui.rendererError) {
    viewport?.detach();
    host.innerHTML = `<div class="scene-load-error" role="alert"><p>${e(ui.rendererError)}</p><button type="button" class="button" data-action="retry-3d">3D 작업대 다시 불러오기</button></div>`;
    return;
  }
  if (!ViewportClass) {
    if (!loadingViewport) {
      loadingViewport = true;
      import('./ui/drone3d.js').then(module => { ViewportClass = module.DroneViewport; loadingViewport = false; syncViewport(); })
        .catch(() => { loadingViewport = false; fallback3d('3D 화면을 불러오지 못해 2D 보기로 전환했습니다. 새로고침해 다시 시도할 수 있습니다.'); });
    }
    return;
  }
  try {
    if (viewport && viewport.canvas.dataset.renderBackend !== renderBackend) { viewport.dispose(); viewport = null; }
    if (!viewport) viewport = new ViewportClass({
      compatible: renderBackend === 'svg',
      onSelect: selectMotor,
      onUnavailable: useCompatible3D,
    });
    if (viewport.canvas.dataset.renderBackend === 'svg') renderBackend = 'svg';
    viewport.attach(host); viewport.sync(sceneState(), sceneUI());
    if (ui.route === 'controller') viewport.setRotorPreview(rotationDemand(controller));
    applyLearningHighlights(app, currentGuide(), ui);
  } catch { fallback3d(); }
}

function render() {
  const wasHelpOpen = document.querySelector('#learning-help')?.open || false;
  interactions?.clear();
  stopRotorPreviews(app);
  controllerInput?.cancel(false);
  controller = controllerTransition(controller, { type: 'CENTER' });
  robotController = robotControllerTransition(robotController, { type: 'CENTER' });
  clearInterval(robotDriveTimer); robotDriveTimer = null;
  const active = document.activeElement;
  const focus = active?.id || null;
  const focusAction = active?.dataset.action;
  const focusMotor = active?.dataset.motor;
  const focusLeg = active?.dataset.leg;
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
  if (robotResult && robotSaved && (stored.error || !stored.records.some(r => r.attemptId === robotResult.attemptId))) {
    robotSaved = false; robotSaveError = stored.error || '저장 목록에서 결과를 찾을 수 없습니다. 파일로 보관하거나 다시 저장하세요.';
  }
  const pack = state ? installedBattery(state) : null;
  const settingsOpen = document.querySelector('.more-menu')?.open || false;
  const guide = currentGuide();
  let content;
  if (ui.route === 'home') content = renderCourseSelector(ui, state, result);
  else if (ui.route === 'operations') content = renderOperations(stored.records, ui, stored);
  else {
    content = renderCourseSelector(ui);
    if (ui.route === 'drone-intro') content += `<div class="training-grid is-preparing course-introduction">${renderWorkbench(null, sceneUI())}${renderInspector(null, ui)}</div>`;
    else if (ui.route === 'imu') content += renderIMU(imu, guide);
    else if (ui.route === 'controller-intro') content += `<div class="training-grid is-preparing course-introduction">${renderWorkbench(controllerAircraft, sceneUI())}${renderControllerIntro()}</div>`;
    else if (ui.route === 'robot-intro') content += renderRobot(robotPreview, { ...ui, previewMode: true }, null, false, '');
    else if (ui.route === 'robot-controller-intro') content += renderRobotController(true);
    else if (ui.route === 'robot-controller') content += `<div id="task-guide-host">${renderTaskGuide(guide)}</div>${renderRobotController()}`;
    else if (ui.route === 'robot') content += robot.status === 'active' ? renderSpatialScene('robot',robot,ui) : `${guide ? `<div id="task-guide-host">${renderTaskGuide(guide)}</div>` : ''}${renderRobot(robot, ui, robotResult, robotSaved, robotSaveError)}`;
    else if (ui.route === 'controller') content += `<div id="task-guide-host">${renderTaskGuide(guide)}</div><div class="training-grid controller-grid">${renderWorkbench(controllerAircraft, sceneUI())}${renderController()}</div>`;
    else if (result) content += renderResult(result, saved, saveError);
    else if (state?.status === 'active') content += renderSpatialScene('drone',state,ui);
    else content += `${state ? `<div id="task-guide-host">${renderTaskGuide(guide)}</div>` : ''}<div class="training-grid ${state ? 'is-practicing' : 'is-preparing'}">${renderWorkbench(state, ui)}${renderInspector(state, ui)}</div>`;
  }
  app.innerHTML = `<div class="app-shell minimal-shell">${renderLearningHeader(ui, state, result, pack, settingsOpen, stored.error)}
    <main id="main" tabindex="-1">${content}<div class="feedback ${feedback?.kind || ''}" role="status" ${feedback ? '' : 'hidden'}>${icon(feedback?.kind === 'success' ? 'check' : 'info')}<span>${e(feedback?.message || '')}</span></div></main>${renderLearningHelp(guide, ui, ui.route === 'robot' ? robotResult : result)}</div>`;
  const inspector = document.querySelector('.inspector');
  if (inspector) inspector.scrollTop = panelScroll;
  syncViewport();
  const flat = document.querySelector('.flat-stage');
  if (flat) positionFlatPoints(flat, ui);
  updateControllerDisplay();
  updateRobotControllerDisplay();
  updateIMU(app, imu);
  syncIMUTimer();
  applyLearningHighlights(app, guide, ui);
  syncGuideVoice(guide);
  syncCompletionNotice(guide);
  if (completionNotice.dialog.open) return;
  const help = document.querySelector('#learning-help');
  help?.addEventListener('cancel', event => { event.preventDefault(); ui.helpOpen = false; render(); });
  if (ui.helpOpen && help) { help.showModal(); return; }
  if (wasHelpOpen || focusAction === 'close-help') { app.querySelector('header [data-action="open-help"]')?.focus({ preventScroll: true }); return; }
  if (focus) document.getElementById(focus)?.focus({ preventScroll: true });
  else if (focusAction) {
    const buttons = [...app.querySelectorAll('[data-action]')];
    const replacement = buttons.find(b => b.dataset.action === focusAction && b.dataset.motor === focusMotor && b.dataset.leg === focusLeg
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
  if (ui.route !== 'training') return;
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
  if (ui.route === 'robot' && robot.status === 'active') {
    if (!confirm('로봇 정비를 중단 결과로 보관하고 이동할까요?')) return false;
    finishRobot('abandoned');
  }
  if (ui.route === 'robot' && robotResult && !robotSaved && !confirm('로봇 결과를 저장하지 못했습니다. 결과를 파일로 내보내 보관할 수 있습니다. 저장하지 않고 이동할까요?')) { render(); return false; }
  if (state?.status === 'active') {
    if (!confirm('현재 실습을 중단 결과로 보관하고 이동할까요?')) return false;
    finish('abandoned');
  }
  if (result && !saved && !confirm('결과를 저장하지 못했습니다. 먼저 파일로 내보내는 것을 권장합니다. 저장하지 않고 이동할까요?')) { render(); return false; }
  if (ui.route === 'imu') pauseIMU('교육 화면을 이동하여 측정을 멈췄습니다.');
  return true;
}
function clearAttempt() {
  stopController();
  state = null; result = null; saved = false; saveError = ''; feedback = null;
  Object.assign(ui, { selected: 'front-left', zoomed: false, tool: 'hand', kitId: 'A1', topView: false, exploded: false, helpOpen: false });
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
  if (type === 'ANSWER_DAMAGE' && feedback.kind === 'success') {
    const nextId = Object.keys(state.motors).find(id => !state.motors[id].verdict)
      || Object.keys(state.motors).find(id => state.motors[id].verdict === 'replace');
    if (nextId) {
      ui.selected = nextId; ui.zoomed = true;
      if (!state.motors[nextId].inspected) state = transition(state,{type:'INSPECT_MOTOR',motorId:nextId}).state;
    }
  }
  if (state.status === 'completed') finish('completed');
  announce(feedback.message); render();
}
app.addEventListener('submit', event => {
  if (event.target.id === 'robot-start-form') {
    event.preventDefault(); const data = new FormData(event.target);
    const session = String(data.get('session')).trim(), trainee = String(data.get('trainee')).trim();
    if (!session || !trainee || /[\x00-\x1f]/.test(session + trainee)) return notify('훈련 회차와 교육생 번호를 확인하세요.', 'warning');
    ui.session = session; ui.trainee = trainee; ui.route = 'robot'; startRobot(); return;
  }
  if (event.target.id !== 'start-form') return;
  event.preventDefault();
  const data = new FormData(event.target);
  const session = String(data.get('session')).trim(), trainee = String(data.get('trainee')).trim();
  if (!session || !trainee || /[\x00-\x1f]/.test(session + trainee)) return notify('훈련 회차와 교육생 번호를 확인하세요.', 'warning');
  ui.session = session; ui.trainee = trainee; ui.mode = data.get('mode');
  ui.route = 'training';
  state = createState({ session, trainee, mode: ui.mode }); result = null; saved = false; started = performance.now();
  notify(ui.mode === 'guided' ? '실습을 시작합니다. 전원을 확인하고 배터리를 분리하세요.' : '독립 실습을 시작합니다. 기체를 관찰하고 정비 과제를 수행하세요.');
});
function runAction(target) {
  if (!target || target.disabled) return;
  const action = target.dataset.action;
  try {
    if (action === 'voice-toggle') { guideVoice.setEnabled(!guideVoice.enabled); return; }
    if (action === 'voice-repeat') { guideVoice.read(); return; }
    const entrances = { home: 'home', 'intro-drone': 'drone-intro', robot: 'robot-intro', controller: 'controller-intro', 'robot-controller': 'robot-controller-intro' };
    if (entrances[action]) {
      if (action === 'controller' && ['controller', 'imu'].includes(ui.route)) return;
      const destination = entrances[action];
      if (ui.route === destination || !allowLeave()) return;
      stopController(); ui.route = destination; ui.helpOpen = false; feedback = null;
      if (destination.endsWith('-intro')) {
        if (viewport) viewport.cameraKey = '';
        if (robotViewport) robotViewport.cameraKey = '';
      }
      window.scrollTo(0, 0); render();
      app.querySelector('main h1')?.focus({ preventScroll: true });
      return;
    }
    if (action === 'open-help' || action === 'close-help') { if (action === 'open-help') pauseIMU('도움말을 열어 측정을 멈췄습니다.'); ui.helpOpen = action === 'open-help'; render(); return; }
    if (action === 'controller-imu-next') {
      if (ui.route !== 'controller' || !canEnterControllerIMU(controller)) return;
      controllerInput?.cancel(false); controller = controllerTransition(controller, { type: 'STOP' });
      viewport?.setRotorPreview(0); stopRotorPreviews(app);
      imu = createIMUState(); imu.power = controller.aircraftPower; imuAircraft = controllerAircraft;
      Object.assign(ui, { route: 'imu', helpOpen: false, rendererError: '', viewMode: '3d', zoomed: false, topView: false }); feedback = null;
      if (viewport) viewport.cameraKey = '';
      window.scrollTo(0, 0); render(); return;
    }
    const imuActions = { 'imu-surface': 'SURFACE', 'imu-power': 'POWER', 'imu-link': 'LINK', 'imu-begin': 'START', 'imu-verify': 'VERIFY' };
    if (imuActions[action] && ui.route === 'imu') { actIMU({ type: imuActions[action] }); return; }
    if (action === 'imu-view-all') { if (viewport) viewport.cameraKey = ''; render(); return; }
    if (action === 'locate-task') {
      const task = currentGuide()?.current; if (!task) return;
      ui.helpOpen = false;
      if (ui.route === 'robot' && task.legId) selectRobotLeg(task.legId);
      else if (task.motorId) selectMotor(task.motorId);
      else {
        if (['power', 'battery'].includes(task.target.kind)) { ui.zoomed = false; ui.topView = false; if (viewport) viewport.cameraKey = ''; }
        render();
      }
      const source = app.querySelector('.guide-source');
      (source?.matches('button,input,select') ? source : source?.querySelector('button,input,select'))?.focus();
      return;
    }
    if (action === 'robot-restart') { if (allowLeave()) startRobot(); return; }
    if (action === 'robot-training') {
      if (ui.route === 'robot' || !allowLeave()) return;
      stopController(); ui.route = robot.status === 'completed' ? 'robot' : 'robot-intro';
      ui.helpOpen = false; feedback = null; window.scrollTo(0, 0); render(); return;
    }
    if (action === 'robot-controller-start' || action === 'robot-controller-restart') {
      if (!allowLeave()) return;
      robotControllerAttempt++;
      stopController(); ui.route = 'robot-controller'; ui.helpOpen = false; feedback = null;
      if (robotViewport) robotViewport.cameraKey = '';
      window.scrollTo(0, 0); render(); announce('로봇 조종기 교육을 시작합니다. 로봇 전원을 켜세요.'); return;
    }
    const robotControllerActions = { 'robot-controller-power': 'ROBOT_POWER', 'robot-controller-remote': 'REMOTE_POWER', 'robot-controller-link': 'LINK', 'robot-controller-stop': 'STOP', 'robot-controller-estop': robotController.estop && robotController.practice.stop && !robotController.practice.estop ? 'EMERGENCY_STOP' : 'ESTOP' };
    if (robotControllerActions[action]) { actRobotController({ type: robotControllerActions[action] }); return; }
    if (action === 'robot-select-leg') { selectRobotLeg(target.dataset.leg); return; }
    if (action === 'robot-view-all') { ui.robotZoomed = false; if (robotViewport) robotViewport.cameraKey = ''; render(); return; }
    const robotActions = { 'robot-estop': 'ESTOP', 'robot-power': 'POWER', 'robot-support': 'SUPPORT',
      'robot-healthy': 'DIAGNOSE', 'robot-replace': 'DIAGNOSE', 'robot-connector': 'CONNECTOR', 'robot-test': 'START_TEST', 'robot-complete': 'COMPLETE' };
    if (robotActions[action] && ui.route === 'robot') { actRobot({ type: robotActions[action], legId: ui.robotSelected, answer: action === 'robot-healthy' ? 'healthy' : 'replace' }); return; }
    if (action === 'controller-restart') {
      pauseIMU('전체 교육을 다시 시작합니다.'); stopController();
      controllerAircraft = createControllerAircraft(); imuAircraft = controllerAircraft; imu = createIMUState();
      Object.assign(ui, { route: 'controller', helpOpen: false, zoomed: false, topView: false }); feedback = null;
      render(); announce('조종기 작동 확인과 IMU 보정 교육을 처음부터 시작합니다.'); return;
    }
    if (action === 'controller-start') {
      if (ui.route === 'robot' && !allowLeave()) return;
      if (state?.status === 'active') { if (!allowLeave()) return; clearAttempt(); }
      stopController(); controllerAircraft = createControllerAircraft();
      imu = createIMUState(); imuAircraft = controllerAircraft;
      ui.route = 'controller'; ui.zoomed = false; ui.topView = false; ui.helpOpen = false; feedback = null;
      if (viewport) viewport.cameraKey = '';
      document.querySelector('.more-menu')?.removeAttribute('open'); render(); return;
    }
    const controllerActions = { 'controller-aircraft-power': 'AIRCRAFT_POWER', 'controller-remote-power': 'REMOTE_POWER', 'controller-link': 'LINK', 'controller-stop': 'STOP' };
    if (controllerActions[action]) { actController({ type: controllerActions[action] }); return; }
    if (action === 'training' || action === 'operations') {
      if (ui.route === action) return;
      if (!allowLeave()) return;
      stopController();
      ui.helpOpen = false;
      if (state?.status !== 'active' && !result) clearAttempt();
      ui.route = action === 'training' && result?.status !== 'completed' && state?.status !== 'active' ? 'drone-intro' : action; feedback = null; render(); return;
    }
    if (action === 'select-motor' || action === 'next-motor') { selectMotor(target.dataset.motor); return; }
    if (action === 'view-all' || action === 'view-zoom') { ui.zoomed = action === 'view-zoom'; ui.topView = false; if (viewport) viewport.cameraKey = ''; render(); return; }
    if (action === 'retry-3d') { ui.viewMode = '3d'; ui.rendererError = ''; render(); return; }
    if (action === 'view-3d' || action === 'view-2d') { ui.viewMode = action === 'view-3d' ? '3d' : '2d'; ui.rendererError = ''; render(); return; }
    if (action === 'view-top') { ui.topView = !ui.topView; render(); return; }
    if (action === 'view-exploded') { ui.exploded = !ui.exploded; render(); return; }
    if (action === 'next' || action === 'retry' || action === 'restart') {
      if (!allowLeave()) return;
      const priorMode = ui.mode;
      const nextNumber = /^\d{1,8}$/.test(ui.trainee) ? String(Number(ui.trainee) + 1).padStart(ui.trainee.length, '0') : '';
      clearAttempt();
      if (action === 'next') ui.trainee = nextNumber;
      ui.route = action === 'next' ? 'drone-intro' : 'training'; render();
      if (action !== 'next') {
        state = createState({ session: ui.session, trainee: ui.trainee, mode: priorMode }); started = performance.now();
        notify('새 시도로 다시 시작합니다. 이전 결과는 유지됩니다.');
      }
      return;
    }
    if (action === 'export-current') { const current = ui.route === 'robot' ? robotResult : result; if (current) download(exportCSV([current]), 'aerolab-result.csv'); return; }
    if (action === 'save-retry') { if (ui.route === 'robot') saveRobot(); else saveCurrent(); render(); return; }
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
}
app.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (target) { event.preventDefault(); runAction(target); }
});
app.addEventListener('workshop-action', event => runAction({ dataset: event.detail }));
app.addEventListener('imu-interaction', event => actIMU(event.detail));
app.addEventListener('workshop-place', event => placeInWorkshop(event.detail.piece,event.detail.target));
app.addEventListener('workshop-message', event => {
  const hint = document.querySelector('#interaction-hint'); if (hint) hint.textContent = event.detail; announce(event.detail);
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
    case 'robot-module-type': ui.robotModule = target.value; break;
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
  if (event.key === 'Escape' && ui.route === 'imu' && !ui.helpOpen) { event.preventDefault(); pauseIMU('Esc로 측정을 멈췄습니다.'); return; }
  const spatial = ui.route === 'robot' ? robotViewport?.workshop : ui.route === 'training' ? viewport?.workshop : null;
  if (event.key === 'Escape' && (spatial?.held || spatial?.busy)) { event.preventDefault(); spatial.cancel(); spatial.draw(); return; }
  if (event.key === 'Escape' && ui.helpOpen) { event.preventDefault(); ui.helpOpen = false; render(); return; }
  if (event.key === 'Escape' && ui.route === 'robot-controller') { event.preventDefault(); actRobotController({ type: 'EMERGENCY_STOP' }); return; }
  if (event.key === 'Escape' && ui.route === 'robot' && robot.testing) { event.preventDefault(); actRobot({ type: 'ESTOP' }); return; }
  if (event.key === 'Escape' && ui.route === 'controller') { event.preventDefault(); controllerInput?.cancel(false); actController({ type: 'STOP' }); return; }
  if (event.key === 'Escape' && ui.zoomed && !interactions?.holding) { ui.zoomed = false; render(); }
});
window.addEventListener('beforeunload', event => {
  if (state?.status === 'active' || (result && !saved) || robot.status === 'active' || (robotResult && !robotSaved) || ui.route === 'imu' && imu.status !== 'completed' && imu.power) { event.preventDefault(); event.returnValue = ''; }
});
window.addEventListener('storage', event => { if (event.key?.startsWith('aerolab.')) { ui.importPreview = null; render(); } });
window.addEventListener('blur', () => guideVoice.suspend());
window.addEventListener('focus', () => { if (!document.hidden) guideVoice.resume(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) guideVoice.suspend(); else if (document.hasFocus()) guideVoice.resume(); });
window.addEventListener('pagehide', () => guideVoice.stop());
window.addEventListener('pagehide', () => { clearInterval(imuTimer); imuTimer = null; stopController(); viewport?.dispose(); viewport = null; clearTimeout(robotTestTimer); robotViewport?.dispose(); robotViewport = null; });
window.addEventListener('blur', () => pauseIMU('창 초점을 벗어나 측정을 멈췄습니다.'));
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseIMU('다른 탭으로 이동하여 측정을 멈췄습니다.'); });
const cancelRobotTest = () => { if (ui.route === 'robot' && robot.testing) actRobot({ type: 'CANCEL_TEST' }); };
window.addEventListener('blur', cancelRobotTest);
document.addEventListener('visibilitychange', () => { if (document.hidden) cancelRobotTest(); });
const suspendRobotController = () => { if (ui.route === 'robot-controller') actRobotController({ type: 'SUSPEND' }); };
window.addEventListener('blur', suspendRobotController);
document.addEventListener('visibilitychange', () => { if (document.hidden) suspendRobotController(); });
controllerInput = installControllerInput(app, action => ui.route === 'robot-controller' ? actRobotController(action) : actController(action));
window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => {
  updateControllerDisplay();
  if (ui.route === 'robot') robotViewport?.sync(robot, ui);
  updateRobotControllerDisplay();
});
function placeInWorkshop(piece, target) {
    if (ui.route === 'robot') {
      const placed = placeRobotPart(robot, piece, target); robot = placed.state; feedback = placed.feedback;
      announce(feedback.message); render(); return;
    }
    if (!state || result) return;
    const placed = placePart(state, piece, target);
    state = placed.state; feedback = placed.feedback;
    if (['battery', 'battery-pack'].includes(piece.kind) && feedback.kind === 'success') {
      ui.zoomed = false; ui.topView = false;
      if (viewport) viewport.cameraKey = '';
    }
    announce(feedback.message); render();
}
interactions = installPartInteraction(app, {
  onPlace: placeInWorkshop,
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
