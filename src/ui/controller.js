import { icon, button } from './shared.js';
import { connectionLabel, rotationDemand, sticksNeutral } from '../domain/controller.js';

export function renderController() {
  const stick = (side, name) => `<div class="stick-unit"><span>${name}</span><button type="button" class="joystick" data-stick="${side}" aria-label="${name} 조이스틱" aria-describedby="controller-keys" aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"><span class="stick-cross" aria-hidden="true"></span><span class="stick-knob" aria-hidden="true"></span></button><output data-stick-readout="${side}" aria-live="off">중앙</output></div>`;
  return `<aside class="controller-panel" aria-label="가상 조종기"><span class="eyebrow">CONTROLLER CHECK</span><h1>조종기 작동 확인</h1><p>기체 전원 → 조종기 전원 → 연결<br>스틱을 움직여 회전 반응을 확인하세요.</p>
    <div class="remote-body"><div class="remote-top"><span>AEROLAB · 가상 조종기</span>${button(icon('power'), 'controller-remote-power', 'remote-power', 'aria-label="조종기 켜기" aria-pressed="false"')}</div>
    <div class="remote-screen" data-controller-screen><div class="remote-link" role="status"><span class="link-dot" aria-hidden="true"></span><strong data-link-status>조종기 전원 꺼짐</strong></div><div class="remote-readings"><span>기체 전원<b data-aircraft-power>꺼짐</b></span><span>기체 배터리<b data-controller-battery>—</b></span><span>회전 표시<b><output data-rotation-level aria-live="off">0</output>%</b></span></div>${button('연결', 'controller-link', 'remote-link-button', 'disabled')}</div>
    <div class="joysticks">${stick('left', '왼쪽')}${stick('right', '오른쪽')}</div>
    ${button('회전 정지 · Esc', 'controller-stop', 'remote-stop')}</div>
    <p class="controller-help" id="controller-keys">스틱을 끌고 놓으면 중앙으로 돌아옵니다.<br>키보드: 스틱 선택 후 방향키 · 놓으면 정지</p><small>움직임과 회전의 관계는 간소화된 교육용 표시입니다. 실제 비행 조작 순서를 재현하지 않습니다.</small>${button('정비 화면으로', 'training', 'quiet-button controller-return')}</aside>`;
}

export function updateController(root, state) {
  const panel = root.querySelector('.controller-panel'); if (!panel) return;
  const level = Math.round(rotationDemand(state) * 100);
  panel.dataset.connected = String(state.connected); panel.dataset.rotation = String(level);
  const status = panel.querySelector('[data-link-status]'), label = connectionLabel(state);
  if (status.textContent !== label) status.textContent = label;
  panel.querySelector('[data-controller-screen]').classList.toggle('is-connected', state.connected);
  panel.querySelector('[data-aircraft-power]').textContent = state.aircraftPower ? '켜짐' : '꺼짐';
  panel.querySelector('[data-controller-battery]').textContent = state.remotePower && state.aircraftPower ? '100%' : '—';
  panel.querySelector('[data-rotation-level]').textContent = level;
  const power = panel.querySelector('[data-action="controller-remote-power"]');
  power.setAttribute('aria-label', state.remotePower ? '조종기 끄기' : '조종기 켜기');
  power.setAttribute('aria-pressed', String(state.remotePower));
  const link = panel.querySelector('[data-action="controller-link"]');
  link.disabled = !state.remotePower || !state.aircraftPower || (!state.connected && !sticksNeutral(state));
  link.textContent = state.connected ? '연결 해제' : '연결';
  for (const [side, point] of Object.entries(state.sticks)) {
    panel.querySelector(`[data-stick="${side}"] .stick-knob`).style.transform = `translate(${point.x * 32}px,${-point.y * 32}px)`;
    panel.querySelector(`[data-stick-readout="${side}"]`).textContent = Math.hypot(point.x, point.y) <= .08 ? '중앙' : `↔ ${Math.round(point.x * 100)} · ↕ ${Math.round(point.y * 100)}`;
  }
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
    if (!pad || event.button !== 0 || [...pointers.values()].includes(pad)) return;
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
