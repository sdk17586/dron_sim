import { escapeHTML as e, button, icon } from './shared.js';
import { renderTaskGuide } from './learning.js';
import { imuGuide, requiredIMUPose, IMU_POSES, IMU_HOLD_MS } from '../domain/imu.js';

export function renderIMU(s, guide = imuGuide(s)) {
  return `<section class="spatial-workbench" aria-label="IMU 보정 교육"><div class="immersive-stage imu-stage">
    <div id="drone-viewport" class="drone-viewport"><span class="three-loading">3D 보정 작업대를 준비하고 있습니다…</span></div>
    <div id="task-guide-host" class="scene-guide">${renderTaskGuide(guide)}</div>
    <aside class="imu-panel" data-imu-panel aria-label="교육용 센서 패널">
      <div class="imu-panel-heading"><span>조종기 · IMU 센서 화면</span><strong data-imu-status></strong></div>
      <p class="imu-battery">배터리 ${e(s.batteryCharge)}% · <span data-imu-connection></span></p>
      <div class="imu-target" aria-label="목표 기체 자세"><div data-imu-target-view></div><strong data-imu-target-label></strong><small>작은 모형과 같은 자세로 돌려 놓으세요</small></div>
      <div class="imu-samples" aria-label="자세별 측정 진행">${IMU_POSES.map((p, i) => `<span data-imu-sample="${p.id}" title="${p.label}">${i + 1}</span>`).join('')}</div>
      <label class="imu-dwell">정지 유지 <output data-imu-hold></output><progress data-imu-progress max="${IMU_HOLD_MS}" value="0" aria-label="현재 자세 정지 측정"></progress></label>
      <p class="imu-measure-message" data-imu-message role="status"></p>
      <div class="imu-panel-actions">${button('기체 연결', 'imu-link', 'button full')}${button('보정 시작', 'imu-begin', 'button primary full')}${button('결과 확인', 'imu-verify', 'button primary full')}</div>
      <div class="imu-comparison" hidden><div><small>보정 전 · 가상</small><span class="imu-horizon tilted"></span><strong>기준선 기울어짐</strong></div><div><small>보정 후 · 가상</small><span class="imu-horizon"></span><strong>수평 기준 복구</strong></div></div>
      <small class="imu-simulation-note">가상 측정 · 실제 센서 수치가 아닙니다</small>
    </aside>
    <button type="button" class="imu-surface" data-action="imu-surface">${icon('check')} <span>마르고 수평인 작업대 확인</span></button>
    <div class="scene-camera-tools">${button(`${icon('reset')} 전체 보기`, 'imu-view-all', 'header-action')}</div>
    <p class="scene-instructions">본체를 잡고 끌어 자세 변경 · 빈 곳을 끌어 시점 회전 · 기체 선택 후 방향키 · Esc 측정 정지</p>
  </div></section>`;
}

export function updateIMU(root, s) {
  const panel = root.querySelector('[data-imu-panel]'); if (!panel) return;
  const target = requiredIMUPose(s), complete = s.status === 'completed';
  const label = s.status === 'calibrating' ? '보정 중' : s.status === 'paused' ? '일시 정지' : s.status === 'measured' ? '결과 확인 대기' : complete ? '보정 완료' : '보정 필요';
  panel.dataset.status = s.status; panel.dataset.pose = s.pose; panel.dataset.samples = String(s.samples.length);
  panel.querySelector('[data-imu-status]').textContent = s.power ? label : '전원 꺼짐';
  panel.querySelector('[data-imu-connection]').textContent = s.linked ? '가상 연결됨' : '연결 안 됨';
  panel.querySelector('[data-imu-target-label]').textContent = target ? target.label : '다리가 아래로 · 바르게 놓기';
  panel.querySelector('.imu-target').hidden = !s.linked || complete;
  panel.querySelector('.imu-dwell').hidden = s.status !== 'calibrating';
  panel.querySelector('[data-imu-hold]').textContent = `${(s.stableMs / 1000).toFixed(1)} / 3초`;
  panel.querySelector('[data-imu-progress]').value = s.stableMs;
  let message = !s.surface ? '수평 작업대를 확인하세요.' : !s.power ? '기체 위의 전원 버튼을 누르세요.' : !s.linked ? '가상 센서에 연결하세요.' : s.status === 'idle' ? '보정 필요 상태입니다. 시작을 누르세요.' : s.status === 'paused' ? '측정을 멈췄습니다. 직접 재개하세요.' : s.status === 'measured' ? s.pose === 'level' ? '결과 확인을 눌러 기준선을 비교하세요.' : '기체를 다시 바르게 놓으세요.' : complete ? '여섯 자세 측정과 결과 확인 완료' : s.moving ? '움직임 감지 · 기체를 놓아주세요.' : s.pose !== target?.id ? '목표 자세와 다릅니다. 작은 모형을 따라 돌리세요.' : '자세가 맞습니다. 움직이지 말고 기다리세요.';
  const note = panel.querySelector('[data-imu-message]'); if (note.textContent !== message) note.textContent = message;
  for (const p of IMU_POSES) {
    const n = panel.querySelector(`[data-imu-sample="${p.id}"]`), done = s.samples.includes(p.id);
    n.dataset.done = String(done); n.dataset.current = String(s.status === 'calibrating' && p.id === target?.id);
    n.textContent = done ? '✓' : String(IMU_POSES.indexOf(p) + 1); n.setAttribute('aria-label', `${p.label}: ${done ? '측정 완료' : '미측정'}`);
  }
  const link = panel.querySelector('[data-action="imu-link"]'); link.hidden = s.linked || complete; link.disabled = !s.power || !s.surface || s.batteryCharge < 50;
  const begin = panel.querySelector('[data-action="imu-begin"]'); begin.hidden = !s.linked || !['idle', 'paused'].includes(s.status); begin.textContent = s.status === 'paused' ? '보정 재개' : '보정 시작';
  const verify = panel.querySelector('[data-action="imu-verify"]'); verify.hidden = s.status !== 'measured'; verify.disabled = s.pose !== 'level' || s.moving;
  panel.querySelector('.imu-comparison').hidden = !complete;
  const surface = root.querySelector('[data-action="imu-surface"]'); surface.disabled = s.surface; surface.querySelector('span').textContent = s.surface ? '수평 작업대 확인 완료' : '마르고 수평인 작업대 확인';
}
