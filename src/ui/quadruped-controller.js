import { button, icon } from './shared.js';
import { robotConnectionLabel, robotDriveDemand, robotSticksNeutral, robotControllerGuide } from '../domain/quadruped-controller.js';

export function renderRobotController(introduction = false) {
  const stick = (side, label, help) => `<div class="stick-unit"><span>${label}</span><button type="button" class="joystick" data-stick="${side}" aria-label="${label} 조이스틱" aria-describedby="robot-controller-keys" aria-keyshortcuts="${side === 'left' ? 'ArrowUp ArrowDown ' : ''}ArrowLeft ArrowRight"><span class="stick-cross" aria-hidden="true"></span><span class="stick-knob" aria-hidden="true"></span></button><output data-stick-readout="${side}" aria-live="off">중앙</output><small>${help}</small></div>`;
  const panel = introduction ? `<aside class="controller-panel course-intro-panel"><span class="eyebrow">QUADRUPED CONTROLLER</span><h1 tabindex="-1">로봇 조종기 교육</h1><p>가상 조종기를 연결하고, 3D 로봇의 이동·회전·정지 반응을 직접 확인합니다.</p><ul class="course-objectives"><li>로봇·조종기 전원과 가상 연결 확인</li><li>비상 정지 해제와 스틱 중립 확인</li><li>왼쪽 스틱으로 전후·좌우 이동</li><li>오른쪽 스틱으로 방향 회전</li><li>동작 정지·연결 해제·비상 정지 확인</li></ul>${button(`실습 시작 ${icon('arrow')}`, 'robot-controller-start', 'button primary full')}<small>정상 상태의 별도 Q-TRAIN을 사용합니다. 이동과 걸음은 간소화한 교육용 표현이며 실제 로봇의 보행·균형 제어를 재현하지 않습니다.</small></aside>`
    : `<aside class="controller-panel robot-controller-panel" aria-label="사족보행 로봇 가상 조종기"><span class="eyebrow">Q-TRAIN CONTROLLER</span><h1>로봇 조종기 교육</h1><p>왼쪽은 이동, 오른쪽은 방향 회전입니다.<br>스틱을 놓으면 로봇이 멈춥니다.</p><div class="remote-body"><div class="remote-top"><span>Q-TRAIN · 가상 조종기</span>${button(icon('power'), 'robot-controller-remote', 'remote-power', 'aria-label="조종기 켜기" aria-pressed="false"')}</div><div class="remote-screen"><div class="remote-link" role="status"><span class="link-dot" aria-hidden="true"></span><strong data-robot-link>조종기 전원 꺼짐</strong></div><div class="remote-readings"><span>로봇 전원<b data-robot-power>꺼짐</b></span><span>배터리<b data-robot-charge>—</b></span><span>동작 상태<b data-robot-motion>정지</b></span></div>${button('연결', 'robot-controller-link', 'remote-link-button', 'disabled')}</div><div class="joysticks">${stick('left', '이동', '전후 · 좌우')}${stick('right', '회전', '좌우로 방향 전환')}</div>${button('동작 정지 · 연결 해제', 'robot-controller-stop', 'remote-stop')}${button('비상 정지 해제', 'robot-controller-estop', 'remote-estop', 'aria-pressed="true"')}</div><p class="controller-help" id="robot-controller-keys">마우스: 스틱을 끌고 놓기<br>키보드: 스틱 선택 후 방향키 · Esc: 비상 정지</p><small>전원·연결·비상 정지는 화면 속 로봇에만 적용됩니다. 이 과정의 수행 표시는 별도 훈련 기록으로 저장하지 않습니다.</small><div class="controller-completion robot-controller-completion" role="status" hidden><strong>로봇 조종기 교육 완료</strong><br>이동·회전·정지·비상 정지 확인을 마쳤습니다. 다시 시작으로 반복할 수 있습니다.</div></aside>`;
  return `<div class="training-grid controller-grid robot-controller-grid ${introduction ? 'course-introduction' : ''}"><section class="robot-workbench" aria-label="로봇 조종 연습장"><div class="robot-stage"><div id="robot-viewport" class="robot-viewport"><span class="three-loading">사족보행 로봇을 준비하고 있습니다…</span></div>${introduction ? '' : `${button(`${icon('power')} 로봇 전원 꺼짐`, 'robot-controller-power', 'robot-console-power', 'aria-pressed="false"')}<output class="robot-drive-status" data-robot-drive-status aria-live="off">비상 정지 중</output>`}<span class="robot-canvas-note">빈 곳을 끌어 회전 · 휠로 확대</span><span class="robot-model-note">Q-TRAIN · 가상 교육 모델</span></div>${introduction ? '' : '<p class="robot-drive-hint">화살표가 로봇의 앞쪽입니다. 테두리 안에서 이동하며, 경계에 닿으면 해당 방향 이동이 제한됩니다.</p>'}</section>${panel}</div>`;
}

export function updateRobotController(root, s) {
  const panel = root.querySelector('.robot-controller-panel'); if (!panel) return;
  const demand = robotDriveDemand(s), moving = demand.active && !s.boundary;
  panel.dataset.connected = String(s.connected); panel.dataset.estop = String(s.estop);
  panel.querySelector('[data-robot-link]').textContent = robotConnectionLabel(s);
  panel.querySelector('.remote-screen').classList.toggle('is-connected', s.connected);
  panel.querySelector('[data-robot-power]').textContent = s.robotPower ? '켜짐' : '꺼짐';
  panel.querySelector('[data-robot-charge]').textContent = s.robotPower && s.remotePower ? '100%' : '—';
  panel.querySelector('[data-robot-motion]').textContent = s.estop ? '차단됨' : s.boundary ? demand.turn ? '회전 중' : '경계 도달' : moving ? demand.turn && !demand.x && !demand.z ? '회전 중' : '이동 중' : '정지';
  const power = root.querySelector('[data-action="robot-controller-power"]');
  power.setAttribute('aria-pressed', String(s.robotPower)); power.innerHTML = `${icon('power')} 로봇 전원 ${s.robotPower ? '켜짐' : '꺼짐'}`;
  const remote = panel.querySelector('[data-action="robot-controller-remote"]');
  remote.setAttribute('aria-pressed', String(s.remotePower)); remote.setAttribute('aria-label', s.remotePower ? '조종기 끄기' : '조종기 켜기');
  const link = panel.querySelector('[data-action="robot-controller-link"]');
  link.disabled = !s.robotPower || !s.remotePower || (!s.connected && !robotSticksNeutral(s)); link.textContent = s.connected ? '연결 해제' : '연결';
  const estop = panel.querySelector('[data-action="robot-controller-estop"]');
  const confirmStop = s.estop && s.practice.stop && !s.practice.estop;
  estop.textContent = s.estop ? confirmStop ? '비상 정지 확인 · Esc' : '비상 정지 해제' : '비상 정지 · Esc';
  estop.setAttribute('aria-pressed', String(s.estop));
  estop.disabled = s.estop && !confirmStop && (!s.connected || !robotSticksNeutral(s));
  for (const [side, p] of Object.entries(s.sticks)) {
    panel.querySelector(`[data-stick="${side}"] .stick-knob`).style.transform = `translate(${p.x * 32}px,${-p.y * 32}px)`;
    panel.querySelector(`[data-stick-readout="${side}"]`).textContent = Math.hypot(p.x, p.y) <= .08 ? '중앙' : side === 'right' ? p.x > 0 ? '오른쪽 회전' : '왼쪽 회전' : `↔ ${Math.round(p.x * 100)} · ↕ ${Math.round(p.y * 100)}`;
  }
  root.querySelector('[data-robot-drive-status]').textContent = s.estop ? '비상 정지 중 · 이동 차단' : !s.connected ? '미연결 · 이동 차단' : s.boundary ? '연습장 경계 · 반대쪽으로 이동하세요' : demand.active ? '조종 입력 중 · 놓으면 정지' : '스틱 중립 · 정지';
  panel.querySelector('.robot-controller-completion').hidden = !robotControllerGuide(s).complete;
}
