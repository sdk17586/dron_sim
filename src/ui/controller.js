import { renderLessonOptions } from './learning.js';
import { icon, button } from './shared.js';
import { connectionLabel, rotationDemand, sticksNeutral, droneMotionLabel } from '../domain/controller.js';
import { controllerChecksDone, canEnterControllerIMU } from '../domain/controller-course.js';

export function renderController(state) {
  const flight = state.flightReady;
  const stick = (side, name) => `<div class="stick-unit"><span>${name}</span><button type="button" class="joystick" data-stick="${side}" aria-label="${name} 조이스틱" aria-describedby="controller-keys" aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"><span class="stick-cross" aria-hidden="true"></span><span class="stick-knob" aria-hidden="true"></span></button><output data-stick-readout="${side}" aria-live="off">중앙</output></div>`;
  return `<aside class="controller-panel" aria-label="가상 조종기"><h1>${flight ? '기체 이동 연습' : '조종기 작동 확인'}</h1>
    <div class="remote-body"><div class="remote-top"><span>조종기 전원</span>${button(icon('power') + '<span data-power-label>조종기 켜기</span>', 'controller-remote-power', 'remote-power', 'aria-label="조종기 켜기" aria-pressed="false"')}</div>
    <div class="remote-screen" data-controller-screen><div class="remote-link" role="status"><span class="link-dot" aria-hidden="true"></span><strong data-link-status>조종기 전원 꺼짐</strong></div><div class="remote-readings"><span>기체 전원<b data-aircraft-power>꺼짐</b></span><span>기체 배터리<b data-controller-battery>—</b></span><span>회전 표시<b><output data-rotation-level aria-live="off">0</output>%</b></span></div>${button('드론과 연결', 'controller-link', 'remote-link-button', 'disabled')}<p class="link-hint" data-link-hint></p>${button('IMU 보정으로 이어하기 →', 'controller-imu-next', 'button primary full', 'hidden disabled')}</div>
    <div class="joysticks">${stick('left', flight ? '앞뒤 이동 · ↑ ↓' : '왼쪽 입력 · ↑ ↓')}${stick('right', flight ? '제자리 회전 · ← →' : '오른쪽 입력 · ← →')}</div>
    ${button('동작 정지 · Esc', 'controller-stop', 'remote-stop')}</div>
    <p class="controller-help" id="controller-keys">${flight ? '왼쪽 ↑↓: 전진·후진 · 오른쪽 ←→: 제자리 회전<br>스틱을 놓으면 현재 위치에서 정지합니다.' : '왼쪽 ↑↓·오른쪽 ←→로 입력만 확인합니다.<br>기체 이동은 IMU 보정 완료 후에 가능합니다.'}<br>스틱을 선택한 뒤 방향키로도 조작할 수 있습니다.</p><div class="controller-completion" role="status" hidden><strong>${flight ? '기체 이동 연습 완료' : '1단계 · 조종기 작동 확인 완료'}</strong><br>${flight ? '이동·회전·정지 확인을 마쳤습니다.' : 'IMU 보정을 완료한 뒤 기체 이동 연습으로 이어갑니다.'}</div>${renderLessonOptions()}</aside>`;
}

export function updateController(root, state) {
  const panel = root.querySelector('.controller-panel'); if (!panel) return;
  const level = Math.round(rotationDemand(state) * 100);
  panel.dataset.connected = String(state.connected); panel.dataset.rotation = String(level);
  panel.dataset.moveX = state.pose.x.toFixed(4); panel.dataset.moveZ = state.pose.z.toFixed(4); panel.dataset.moveYaw = state.pose.yaw.toFixed(4);
  const motion = root.querySelector('[data-drone-motion]');
  if (motion) { motion.textContent = droneMotionLabel(state); motion.dataset.boundary = String(state.boundary); }
  panel.querySelector('.controller-completion').hidden = state.flightReady ? !Object.values(state.flightPractice).every(Boolean) : !controllerChecksDone(state);
  const next = panel.querySelector('[data-action="controller-imu-next"]');
  next.hidden = state.flightReady || !controllerChecksDone(state); next.disabled = !canEnterControllerIMU(state);
  const status = panel.querySelector('[data-link-status]'), label = connectionLabel(state);
  if (status.textContent !== label) status.textContent = label;
  panel.querySelector('[data-controller-screen]').classList.toggle('is-connected', state.connected);
  panel.querySelector('[data-aircraft-power]').textContent = state.aircraftPower ? '켜짐' : '꺼짐';
  panel.querySelector('[data-controller-battery]').textContent = state.remotePower && state.aircraftPower ? '100%' : '—';
  panel.querySelector('[data-rotation-level]').textContent = level;
  const power = panel.querySelector('[data-action="controller-remote-power"]');
  power.setAttribute('aria-label', state.remotePower ? '조종기 끄기' : '조종기 켜기');
  power.setAttribute('aria-pressed', String(state.remotePower));
  power.querySelector('[data-power-label]').textContent = state.remotePower ? '조종기 끄기' : '조종기 켜기';
  const link = panel.querySelector('[data-action="controller-link"]');
  link.disabled = !state.remotePower || !state.aircraftPower || (!state.connected && !sticksNeutral(state));
  link.textContent = state.connected ? '연결 해제' : '드론과 연결';
  const hint = panel.querySelector('[data-link-hint]');
  hint.hidden = !link.disabled;
  hint.textContent = !state.aircraftPower ? '드론 위 전원 표시를 눌러 기체를 켜세요.'
    : !state.remotePower ? '조종기를 켜면 연결 버튼이 열립니다.' : '스틱을 놓아 중앙으로 되돌리면 연결할 수 있습니다.';
  for (const [side, point] of Object.entries(state.sticks)) {
    panel.querySelector(`[data-stick="${side}"] .stick-knob`).style.transform = `translate(${point.x * 32}px,${-point.y * 32}px)`;
    panel.querySelector(`[data-stick-readout="${side}"]`).textContent = Math.hypot(point.x, point.y) <= .08 ? '중앙' : `↔ ${Math.round(point.x * 100)} · ↕ ${Math.round(point.y * 100)}`;
  }
}

export function updateFlatControllerPose(root, state) {
  const svg = root.querySelector('.drone-svg'), airframe = svg?.querySelector('[data-controller-airframe]');
  if (!airframe) return;
  const { x, z, yaw } = state.pose;
  airframe.setAttribute('transform', `translate(${x * 20} ${z * 20}) rotate(${-yaw * 180 / Math.PI} 380 294)`);
  Object.assign(svg.dataset, { moveX: x.toFixed(4), moveZ: z.toFixed(4), moveYaw: yaw.toFixed(4) });
}

// Keep the pad DOM alive during input: no full-page render while dragging.
// Pointer capture, release, cancellation, focus loss and hidden tabs all center it.
export function installControllerInput(root, onAction) {
  const pointers = new Map(), keys = new Map();
  function cancel(notify = true) {
    for (const [id, pad] of pointers) if (pad.hasPointerCapture(id)) pad.releasePointerCapture(id);
    pointers.clear(); keys.clear();
    if (notify) onAction({ type: 'CENTER' });
  }
  const readPointer = (pad, event) => {
    const rect = pad.getBoundingClientRect(), radius = rect.width * .36;
    onAction({ type: 'STICK', side: pad.dataset.stick,
      x: (event.clientX - rect.x - rect.width / 2) / radius,
      y: -(event.clientY - rect.y - rect.height / 2) / radius });
  };
  root.addEventListener('pointerdown', event => {
    const pad = event.target.closest('[data-stick]');
    if (!pad || pad.disabled || event.button !== 0 || [...pointers.values()].includes(pad)) return;
    event.preventDefault(); pad.focus({ preventScroll: true });
    pad.setPointerCapture(event.pointerId); pointers.set(event.pointerId, pad); readPointer(pad, event);
  });
  root.addEventListener('pointermove', event => {
    const pad = pointers.get(event.pointerId); if (pad) { event.preventDefault(); readPointer(pad, event); }
  });
  const release = event => {
    const pad = pointers.get(event.pointerId); if (!pad) return;
    pointers.delete(event.pointerId);
    onAction({ type: 'STICK', side: pad.dataset.stick, x: 0, y: 0 });
  };
  root.addEventListener('pointerup', release); root.addEventListener('pointercancel', release); root.addEventListener('lostpointercapture', release);
  const arrows = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
  const sendKeys = (side, held) => onAction({ type: 'STICK', side,
    x: Number(held.has('ArrowRight')) - Number(held.has('ArrowLeft')),
    y: Number(held.has('ArrowUp')) - Number(held.has('ArrowDown')) });
  root.addEventListener('keydown', event => {
    const pad = event.target.closest('[data-stick]'); if (!pad || !arrows.includes(event.key)) return;
    if (event.repeat && !keys.has(pad.dataset.stick)) return;
    event.preventDefault(); const side = pad.dataset.stick, held = keys.get(side) || new Set();
    held.add(event.key); keys.set(side, held); sendKeys(side, held);
  });
  window.addEventListener('keyup', event => {
    if (!arrows.includes(event.key)) return;
    for (const [side, held] of keys) if (held.delete(event.key)) sendKeys(side, held);
  });
  root.addEventListener('focusout', event => { if (event.target.matches('[data-stick]')) cancel(); });
  window.addEventListener('blur', () => cancel());
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });
  return { cancel };
}
