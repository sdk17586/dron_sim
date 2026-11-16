import { WIRE_COLORS } from '../domain/panda-mission.js';
export function renderPandaLesson() {
  return `<section class="panda-course panda-wire-course" aria-label="로봇팔 가상 폭탄 해체 교육">
    <div class="panda-heading"><div><span class="eyebrow">ROBOT ARM · TRAINING GAME</span><h1 tabindex="-1">폭탄 해체 교육</h1></div><span class="panda-lesson-badge" data-panda-mode></span></div>
    <ol class="panda-workflow" aria-label="훈련 진행 단계">${['목표 색 확인','가상 선 자르기','완료'].map((t,i)=>`<li data-panda-workflow><span>${i+1}</span>${t}</li>`).join('')}</ol>
    <div class="panda-workspace"><div class="panda-stage"><div data-panda-viewport></div><div class="panda-scene-badge">SIMULATION <span data-panda-power>전원 꺼짐</span></div><div class="panda-game-stage-tag">훈련용 가상 장치 · COLOR MATCH</div><p class="panda-camera-help">빈 곳을 끌어 시점 회전 · 휠 확대</p>
      <section class="panda-gripper-remote" aria-label="집게 조종기" hidden>
        <button type="button" class="joystick" data-stick="gripper" aria-label="집게 조종 스틱" aria-describedby="panda-stick-help" aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Enter" disabled>
          <span class="stick-cross" aria-hidden="true"></span><span class="stick-knob" aria-hidden="true"></span>
        </button>
        <div><strong data-arm-goal></strong><p id="panda-stick-help">스틱을 끌거나 선택 후 방향키를 누르세요.<br>← → 선 이동 · ↑ ↓ 높이 · Enter 자르기</p>
          <output data-arm-readout aria-live="polite"></output><div data-arm-action></div>
        </div>
      </section></div>
    <aside class="panda-panel"><div class="panda-progress"><span data-panda-count></span><progress max="3" value="0" aria-label="훈련 진행률"></progress></div>
      <div class="panda-current" aria-live="polite"><span class="guide-caption">지금 할 일</span><h2 data-panda-title></h2><p data-panda-detail></p></div>
      <div class="panda-colour-game" data-panda-game hidden><div class="panda-game-instruments"><div><small>이번 게임의 목표 색</small><strong data-panda-goal></strong></div><div class="panda-clock"><small>남은 시간</small><strong data-panda-time></strong></div></div>
        <p class="panda-wire-help">자동 이동 · 선을 누르면 집게가 이동합니다.</p><div class="panda-wire-options" role="group" aria-label="가상 선 선택">${WIRE_COLORS.map(w=>`<button type="button" data-panda-command="wire" data-value="${w.id}" aria-pressed="false" data-wire-color="${w.id}"><span class="wire-swatch" aria-hidden="true"></span><strong>${w.symbol} ${w.label}</strong><small>0${w.number}</small></button>`).join('')}</div>
        <p class="panda-game-feedback" data-panda-feedback role="status"></p></div>
      <div data-panel-action><button type="button" class="button primary full" data-panda-command="execute" disabled>모델 준비 중</button></div>
      <div class="panda-stop-controls"><button type="button" data-panda-command="stop" class="panda-stop">일시 정지 · Esc</button><button type="button" data-panda-command="resume" hidden>이어하기</button></div>
      <p data-panda-message role="status"></p><button type="button" class="quiet-button" data-panda-command="reset">처음부터 다시 하기</button>
      <small class="panda-note">매회 무작위로 정하는 목표 색을 맞히는 게임입니다. 실제 폭발물 구조·배선·해체법과 무관합니다.</small>
    </aside></div>
    <section class="panda-after-action" data-panda-review hidden aria-label="게임 결과"><div class="panda-review-heading"><div><span class="eyebrow">TRAINING COMPLETE</span><h2>가상 해체 성공!</h2><p data-panda-review-meta></p></div><div class="panda-score"><strong data-panda-score></strong><span>/ 100점 · 게임 점수</span></div></div>
      <div class="panda-rubric" data-panda-rubric></div><p data-panda-save-status role="status"></p><div class="panda-review-actions"><button type="button" class="button" data-panda-command="save" hidden>저장 다시 시도</button><button type="button" class="button" data-panda-command="export-csv">결과 CSV 내보내기</button><button type="button" class="button" data-panda-command="export-report">결과 요약 내보내기</button><button type="button" class="button" data-action="operations">훈련 기록 보기</button></div>
      <small>색상 퍼즐 100점. 다른 색을 확인할 때마다 10점 차감합니다. 도전 모드에서는 남은 시간도 10초 줄어듭니다. 시간 초과 시 다시 도전할 수 있습니다.</small>
    </section></section>`;
}
