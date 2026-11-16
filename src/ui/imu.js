import { escapeHTML as e, button, icon } from './shared.js';
import { renderLessonOptions, renderTaskGuide } from './learning.js';
import { imuGuide, requiredIMUPose, allowedIMUPoses, IMU_POSES, IMU_HOLD_MS } from '../domain/imu.js';

const faceNames = { level:'다리 아래', left:'왼쪽 면', right:'오른쪽 면', 'nose-up':'앞쪽 위', 'nose-down':'앞쪽 아래', inverted:'윗면 아래' };

export function renderIMU(s, guide = imuGuide(s)) {
  return `<section class="spatial-workbench" aria-label="IMU 보정 교육"><div class="immersive-stage imu-stage">
    <aside class="imu-panel" data-imu-panel aria-label="IMU 보정 안내와 조작">
      <div id="task-guide-host" class="lesson-guide">${renderTaskGuide(guide, true)}</div>
      <div class="imu-panel-actions">
        ${button('수평 작업대 확인', 'imu-surface', 'button primary full')}
        ${button('자세 센서 연결', 'imu-link', 'button primary full')}
        ${button('여섯 자세 측정 시작', 'imu-begin', 'button primary full')}
        <div class="imu-pose-buttons" role="group" aria-label="기체 자세 바꾸기">${IMU_POSES.map(p => button(e(p.label), 'imu-set-pose', 'button', `data-pose-choice="${p.id}" hidden`)).join('')}</div>
        ${button('보정 결과 확인', 'imu-verify', 'button primary full')}
        ${button('기체 이동 연습으로 →', 'imu-flight-next', 'button primary full')}
      </div>
      <div class="imu-scene">
        <div id="drone-viewport" class="drone-viewport"><span class="three-loading">3D 보정 작업대를 준비하고 있습니다…</span></div>
        <div class="scene-camera-tools">${button(`${icon('reset')} 전체 보기`, 'imu-view-all', 'header-action')}</div>
      </div>
      <div class="imu-target" aria-label="목표 기체 자세"><div data-imu-target-view></div><div><small>목표 자세</small><strong data-imu-target-label></strong><small data-imu-actual></small></div></div>
      <p class="imu-measure-message" data-imu-message role="status"></p>
      <label class="imu-dwell">정지 측정 <output data-imu-hold></output><progress data-imu-progress max="${IMU_HOLD_MS}" value="0" aria-label="현재 자세 정지 측정"></progress></label>
      <div class="imu-record"><div class="imu-record-title"><strong>측정한 자세</strong><span data-imu-count></span></div>
        <div class="imu-samples" aria-label="자세별 측정 진행">${IMU_POSES.map(p => `<span data-imu-sample="${p.id}"><b></b>${faceNames[p.id]}</span>`).join('')}</div>
        <p class="imu-side-progress" data-imu-side-progress hidden></p></div>
      <div class="imu-comparison" hidden><div><small>보정 전</small><span class="imu-horizon tilted"></span><strong>기준선 기울어짐</strong></div><div><small>보정 후</small><span class="imu-horizon"></span><strong>수평 기준 복구</strong></div></div>
      <div class="imu-telemetry"><strong data-imu-status></strong><span data-imu-connection></span><span>배터리 ${e(s.batteryCharge)}%</span></div>
      ${renderLessonOptions()}
    </aside>
  </div></section>`;
}

export function updateIMUHold(root, stableMs) {
  root.querySelector('[data-imu-hold]').textContent = `${(stableMs / 1000).toFixed(1)} / 3초`;
  root.querySelector('[data-imu-progress]').value = stableMs;
}

export function updateIMU(root, s) {
  const panel = root.querySelector('[data-imu-panel]'); if (!panel) return;
  const target = requiredIMUPose(s), allowed = allowedIMUPoses(s);
  const complete = s.status === 'completed', measuring = s.status === 'calibrating', measured = s.status === 'measured';
  const sideStage = allowed.some(p => p.id === 'left' || p.id === 'right');
  const sides = ['left','right'].filter(id => s.samples.includes(id)).length;
  const matches = allowed.some(p => p.id === s.pose);
  const statusLabel = {idle:'준비 중', calibrating:'보정 중', paused:'일시 정지', measured:'결과 확인 대기', completed:'보정 완료'};
  panel.dataset.status = s.status; panel.dataset.pose = s.pose; panel.dataset.samples = String(s.samples.length);
  panel.querySelector('[data-imu-status]').textContent = s.power ? statusLabel[s.status] : '전원 꺼짐';
  panel.querySelector('[data-imu-connection]').textContent = s.linked ? '센서 연결됨' : '연결 안 됨';

  const surface = panel.querySelector('[data-action="imu-surface"]'); surface.hidden = s.surface;
  const link = panel.querySelector('[data-action="imu-link"]');
  link.disabled = !s.power || !s.surface || s.batteryCharge < 50;
  link.hidden = !s.surface || !s.power || s.linked;
  const begin = panel.querySelector('[data-action="imu-begin"]');
  begin.hidden = !s.linked || !['idle', 'paused'].includes(s.status);
  begin.textContent = s.status === 'paused' ? '이어서 측정하기' : '여섯 자세 측정 시작';
  for (const choice of panel.querySelectorAll('[data-pose-choice]')) {
    const id = choice.dataset.poseChoice;
    choice.hidden = !(measuring && allowed.some(p => p.id === id) || measured && id === 'level' && s.pose !== 'level');
    choice.disabled = s.moving || s.pose === id;
    choice.toggleAttribute('data-next-action', !choice.hidden && !choice.disabled && (!measuring || !matches));
  }
  const verify = panel.querySelector('[data-action="imu-verify"]');
  verify.disabled = !measured || s.pose !== 'level' || s.moving;
  verify.hidden = !measured || verify.disabled;
  const flight = panel.querySelector('[data-action="imu-flight-next"]'); flight.hidden = !complete; flight.disabled = !complete || !s.power || !s.linked;

  panel.querySelector('.imu-target').hidden = !measuring && !measured;
  panel.querySelector('[data-imu-target-label]').textContent = sideStage ? `옆면 측정 ${sides}/2 · ${sides ? faceNames[target.id] : '어느 쪽이든 가능'}` : (target || IMU_POSES[0]).label;
  panel.querySelector('[data-imu-actual]').textContent = `현재 기체 · ${faceNames[s.pose]}`;
  let message = '';
  if (measuring) {
    if (s.moving) message = '기체를 돌리는 중입니다. 손을 떼면 자세를 확인합니다.';
    else if (sideStage && s.samples.includes(s.pose) && ['left','right'].includes(s.pose)) message = '이 면은 이미 측정했습니다. 반대쪽 면을 선택하세요.';
    else if (!matches && s.pose !== 'level' && !s.samples.includes(s.pose)) message = '현재 기체와 목표 자세가 다릅니다. 자세 버튼으로 맞춰 보세요.';
  } else if (link.disabled && !link.hidden) message = '센서 연결에는 배터리 50% 이상이 필요합니다.';
  const note = panel.querySelector('[data-imu-message]');
  note.hidden = !message;
  if (note.textContent !== message) note.textContent = message;
  panel.querySelector('.imu-dwell').hidden = !measuring;
  updateIMUHold(panel, s.stableMs);
  panel.querySelector('.imu-record').hidden = s.status === 'idle';
  panel.querySelector('[data-imu-count]').textContent = `${s.samples.length} / 6`;
  for (const [i,p] of IMU_POSES.entries()) {
    const n = panel.querySelector(`[data-imu-sample="${p.id}"]`), done = s.samples.includes(p.id);
    n.dataset.done = String(done); n.dataset.current = String(measuring && allowed.some(a => a.id === p.id));
    n.querySelector('b').textContent = done ? '✓' : String(i + 1);
    n.setAttribute('aria-label', `${faceNames[p.id]} · ${done ? '측정 완료' : '미측정'}`);
  }
  const sideProgress = panel.querySelector('[data-imu-side-progress]');
  sideProgress.hidden = !sideStage && sides === 0;
  sideProgress.textContent = `옆면 측정 ${sides}/2 · ${sides === 2 ? '완료' : '왼쪽·오른쪽 순서 자유'}`;
  panel.querySelector('.imu-comparison').hidden = !complete;
}
