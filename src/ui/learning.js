import { escapeHTML as e, icon, button } from './shared.js';
import { renderVoiceControls } from './guide-voice.js';

export function renderLearningHeader(ui, state, result, pack, settingsOpen, storageError) {
  const training = ui.route === 'training', controller = ui.route === 'controller', robot = ui.route === 'robot', robotController = ui.route === 'robot-controller';
  const restart = ui.route === 'panda-maintenance' ? 'panda-maintenance-restart' : ui.route === 'panda' ? 'panda-restart' : ui.route === 'imu' ? 'controller-restart' : robotController ? 'robot-controller-restart' : robot ? 'robot-restart' : controller ? 'controller-restart' : training && state?.status === 'active' ? 'restart' : '';
  const title = { 'panda-maintenance': '로봇팔 정비 교육 · 그리퍼 교체', 'panda-maintenance-intro': '로봇팔 정비 교육', 'panda-bomb-intro': '폭탄 해체 교육', panda: '로봇팔 · 폭탄 해체 교육', 'panda-education': '로봇팔 교육', showcase: '자동 시연', imu: '조종기 교육 · IMU 보정', home: '교육 선택', 'drone-education': '드론 교육', 'robot-education': '사족보행 로봇 교육', 'drone-intro': '드론 정비 교육', 'robot-intro': '사족보행 로봇 정비 교육', 'controller-intro': '조종기 교육', 'robot-controller-intro': '로봇 조종기 교육', 'robot-controller': '로봇 조종기 교육' }[ui.route] || (robot ? '사족보행 로봇 정비' : controller ? '조종기 교육' : training ? '드론 정비 교육' : '훈련 기록');
  return `<header class="minimal-header"><a href="#" class="minimal-brand" data-action="home">${icon('rotor')}<strong>AEROLAB</strong></a><span class="header-title">${title}</span><span class="header-session">${training && state && !result ? e(state.meta.trainee) + ' · ' : ''}${storageError ? '저장 확인 필요' : '장비 기초 교육'}</span><nav aria-label="주요 메뉴">${restart ? button(`${icon('reset')} 다시 시작`, restart, 'header-action restart-visible') : ''}${ui.route === 'showcase' ? '' : button(`${icon('info')} 도움말`, 'open-help', 'header-action', `aria-haspopup="dialog" aria-controls="learning-help" aria-expanded="${ui.helpOpen}"`)}${button(ui.route === 'operations' ? '교육 선택' : '훈련 기록', ui.route === 'operations' ? 'home' : 'operations', 'quiet-button')}
    ${!controller ? '' : `<details class="more-menu" ${settingsOpen ? 'open' : ''}><summary aria-label="화면 설정" title="화면 설정">···</summary><div class="more-menu-content"><label>화면<select data-input="view-mode" aria-label="화면 방식"><option value="3d" ${ui.viewMode === '3d' ? 'selected' : ''}>3D</option><option value="2d" ${ui.viewMode === '2d' ? 'selected' : ''}>2D</option></select></label>${ui.viewMode === '3d' && !controller ? `<label class="structure-option"><input type="checkbox" data-input="exploded" ${ui.exploded ? 'checked' : ''}>구조 벌려 보기</label>` : ''}${training && state && !result ? `<div class="battery-practice"><label for="battery-charge">잔량 연습 <output id="battery-charge-value">${pack ? pack.charge + '%' : '—'}</output></label><input id="battery-charge" type="range" data-input="battery-charge" min="0" max="100" step="1" value="${pack?.charge ?? 0}" aria-label="연습용 배터리 잔량" ${pack ? '' : 'disabled'}><small>${pack ? '실제 방전 속도가 아닌 연습용 조절입니다.' : '배터리를 장착하면 조절할 수 있습니다.'}</small></div>` : ''}</div></details>`}</nav></header>`;
}

function renderGuideLaunches() {
  return `<div class="showcase-launches" aria-label="정비 가이드 시연">
    <button type="button" class="showcase-launch" data-action="drone-showcase"><span class="demo-play" aria-hidden="true">▶</span><span><span class="showcase-eyebrow">DRONE MAINTENANCE GUIDE</span><strong>드론 정비 가이드</strong><small>전원·배터리 확인부터 날개와 나사 교체,<br>체결·최종 점검까지.</small></span><span class="demo-duration">가이드 시연 · 약 75초 ↗</span></button>
    <button type="button" class="showcase-launch" data-action="showcase"><span class="demo-play" aria-hidden="true">▶</span><span><span class="showcase-eyebrow">ROBOT MAINTENANCE GUIDE</span><strong>사족보행 로봇 정비 가이드</strong><small>고장 발견부터 관절 교체와 시험,<br>복구된 로봇의 보행까지.</small></span><span class="demo-duration">가이드 시연 · 약 75초 ↗</span></button>
    <button type="button" class="showcase-launch" data-action="panda-showcase"><span class="demo-play" aria-hidden="true">▶</span><span><span class="showcase-eyebrow">ROBOT ARM MISSION GUIDE</span><strong>로봇팔 폭탄 해체 가이드</strong><small>목표 색 확인과 로봇팔 이동,<br>가상 선 절단과 복귀까지.</small></span><span class="demo-duration">가이드 시연 · 약 35초 ↗</span></button>
  </div>`;
}

function renderEquipmentPreview(kind, name, category) {
  return `<figure class="course-equipment"><div class="equipment-preview" data-equipment-preview="${kind}"><span class="three-loading">${name} 미리보기를 준비하고 있습니다…</span></div><figcaption><span>${category}</span><strong>${name}</strong></figcaption><span class="equipment-rotate" aria-hidden="true">드래그해 회전 ↔</span></figure>`;
}

export function renderEquipmentEducation(kind,ui={}) {
  if(kind==='panda') return `<section class="equipment-course-hub" data-education-kind="panda" aria-label="로봇팔 교육 선택">${renderEquipmentPreview('panda','Franka Panda','로봇팔')}<div class="equipment-course-options"><span class="eyebrow">ROBOT ARM TRAINING</span><h1 tabindex="-1">로봇팔 교육</h1><p>어떤 교육을 진행할까요?<br>정비 교육 또는 폭탄 해체 교육을 선택하세요.</p><nav aria-label="로봇팔 교육 과정"><button class="education-choice" data-action="panda-maintenance-intro"><span class="education-choice-number">01</span><span><strong>정비 교육</strong><small>고장 난 그리퍼 점검 · 분리·교체 · 체결·작동 확인</small></span>${icon('arrow')}</button><button class="education-choice" data-action="panda-bomb-intro"><span class="education-choice-number">02</span><span><strong>폭탄 해체 교육</strong><small>가상 색상 퍼즐 · 스틱으로 집게 조종</small></span>${icon('arrow')}</button></nav><small class="equipment-course-note">과정별 안내를 확인하고 실습을 시작합니다.<br>Isaac Lab 지원 모델 · Franka Panda</small></div></section>`;
  if(kind==='panda-bomb') return `<section class="equipment-course-hub" data-education-kind="panda-bomb">${renderEquipmentPreview('panda','Franka Panda','로봇팔')}<div class="equipment-course-options panda-mission-intro"><span class="eyebrow">VIRTUAL DEFUSAL GAME</span><h1 tabindex="-1">폭탄 해체 교육</h1><h2>목표 색을 확인하고 가상 선을 자르세요</h2><p>화면 스틱이나 방향키로 집게를 좌우로 옮기고 내리세요. 집게가 선에 닿으면 자르기 버튼이 켜집니다. 정비 교육과 별도로 바로 시작합니다. 실제 폭발물 구조·배선·해체법과 무관한 색상 퍼즐입니다.</p><div class="panda-briefing-fields"><label>훈련 회차<input name="session" maxlength="40" required value="${e(ui.session||'훈련-01')}"></label><label>교육생 번호<input name="trainee" maxlength="40" required value="${e(ui.trainee||'001')}"></label></div><nav><button class="education-choice" data-action="panda-start" data-mode="guided"><span class="education-choice-number">01</span><span><strong>연습 모드</strong><small>시간 제한 없이 색상 퍼즐 익히기</small></span>${icon('arrow')}</button><button class="education-choice" data-action="panda-start" data-mode="independent"><span class="education-choice-number">02</span><span><strong>도전 모드</strong><small>90초 도전 · 다른 색 확인 시 10초 차감</small></span>${icon('arrow')}</button></nav><button class="panda-guide-launch" data-action="panda-showcase">▶ 폭탄 해체 교육 가이드 먼저 보기 · 약 35초</button></div></section>`;
  const robot = kind === 'robot', name = robot ? '사족보행 로봇' : '드론';
  return `<section class="equipment-course-hub" data-education-kind="${kind}" aria-label="${name} 교육 선택">
    ${renderEquipmentPreview(kind,robot?'Go2':'X500',robot?'지상 장비':'항공 장비')}
    <div class="equipment-course-options"><span class="eyebrow">${robot?'ROBOT':'DRONE'} TRAINING</span><h1 tabindex="-1">${name} 교육</h1><p>어떤 교육을 진행할까요?<br>정비 교육 또는 조종기 교육을 선택하세요.</p>
      <nav aria-label="${name} 교육 과정">
        <button type="button" class="education-choice" data-action="${robot?'robot':'intro-drone'}"><span class="education-choice-number" aria-hidden="true">01</span><span><strong>정비 교육</strong><small>${robot?'다리 관절 점검 · 모듈 교체 · 관절 시험':'배터리·프로펠러 점검 · 부품 교체 · 최종 확인'}</small></span>${icon('arrow')}</button>
        <button type="button" class="education-choice" data-action="${robot?'robot-controller':'controller'}"><span class="education-choice-number" aria-hidden="true">02</span><span><strong>조종기 교육</strong><small>${robot?'전원·연결 · 이동·회전 · 정지 확인':'전원·연결 · IMU 보정 · 이동·회전'}</small></span>${icon('arrow')}</button>
      </nav><small class="equipment-course-note">교육 내용을 확인한 뒤 실습을 시작합니다.</small>
    </div></section>`;
}

export function renderCourseSelector(ui) {
  if (ui.route === 'home') return `<section class="course-selector course-picker course-home" aria-label="교육 선택"><div class="course-picker-heading"><span class="eyebrow">AEROLAB TRAINING</span><h1 tabindex="-1">어떤 교육을 시작할까요?</h1><p>장비를 선택한 뒤 정비·조종·로봇팔 조작 교육을 시작하세요.</p></div><nav aria-label="교육 과정"><div class="course-option">${renderEquipmentPreview('drone','X500','항공 장비')}<button type="button" class="course-card" data-action="drone-education">${icon('rotor')}<span><strong>드론 교육</strong><small>정비 교육 · 조종기 교육<br>점검·교체부터 IMU 보정·이동 연습까지</small></span><span class="course-card-link">교육 선택하기 ${icon('arrow')}</span></button></div><div class="course-option">${renderEquipmentPreview('robot','Go2','지상 장비')}<button type="button" class="course-card" data-action="robot-education">${icon('quadruped')}<span><strong>사족보행 로봇 교육</strong><small>정비 교육 · 조종기 교육<br>관절 점검·교체부터 이동·정지 확인까지</small></span><span class="course-card-link">교육 선택하기 ${icon('arrow')}</span></button></div><div class="course-option">${renderEquipmentPreview('panda','Franka Panda','로봇팔')}<button type="button" class="course-card" data-action="panda-education"><svg class="icon" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 28h22M10 27v-5l7-8-7-6 4-5 11 10-7 10v4M23 12l5-3 3 4-4 4"/><circle cx="10" cy="7" r="3"/><circle cx="17" cy="15" r="3"/></svg><span><strong>로봇팔 교육</strong><small>정비 교육 · 폭탄 해체 교육<br>그리퍼 교체·작동 확인 / 가상 색상 퍼즐</small></span><span class="course-card-link">교육 선택하기 ${icon('arrow')}</span></button></div></nav>${renderGuideLaunches()}</section>`;
  if (['drone-education','robot-education','panda-education'].includes(ui.route)) return `<section class="course-selector compact-courses" aria-label="교육 이동"><nav>${button('← 장비 선택', 'home', 'quiet-button')}</nav></section>`;
  if(['panda','panda-maintenance','panda-maintenance-intro','panda-bomb-intro'].includes(ui.route)) return `<section class="course-selector compact-courses" aria-label="교육 이동"><nav>${button('← 로봇팔 교육','panda-education','quiet-button')}</nav></section>`;
  const drone = ['training', 'drone-intro', 'controller', 'controller-intro', 'imu'].includes(ui.route);
  const robot = ['robot', 'robot-intro', 'robot-controller', 'robot-controller-intro'].includes(ui.route);
  return `<section class="course-selector compact-courses" aria-label="교육 이동"><nav aria-label="교육 과정">${button(drone?'← 드론 교육':robot?'← 사족보행 로봇 교육':'← 장비 선택',drone?'drone-education':robot?'robot-education':'home','quiet-button')}${drone ? `${button('드론 정비 교육', ui.route.endsWith('-intro') ? 'intro-drone' : 'training', 'course-card controller-return', `aria-pressed="${['training', 'drone-intro'].includes(ui.route)}"`)}${button('조종기 교육', 'controller', 'course-card controller-intro', `aria-pressed="${['controller', 'controller-intro', 'imu'].includes(ui.route)}"`)}` : robot ? `${button('로봇 정비 교육', 'robot-training', 'course-card', `aria-pressed="${['robot', 'robot-intro'].includes(ui.route)}"`)}${button('로봇 조종기 교육', 'robot-controller', 'course-card', `aria-pressed="${['robot-controller', 'robot-controller-intro'].includes(ui.route)}"`)}` : ''}</nav></section>`;
}

export function renderControllerIntro() {
  return `<aside class="inspector start-panel course-intro-panel"><span class="eyebrow">CONTROLLER TRAINING</span><h1 tabindex="-1">조종기 교육</h1><p>조종기 작동 확인 → IMU 보정 → 기체 이동 연습 순서로 진행합니다.</p><ol class="course-objectives"><li><strong>조종기 작동 확인</strong><br>기체·조종기 전원, 연결, 스틱 입력 확인</li><li><strong>IMU 보정</strong><br>기체가 수평을 기억하도록, 여섯 자세로 놓고 3초씩 측정</li><li><strong>기체 이동 연습</strong><br>앞뒤 이동·제자리 회전·정지 확인</li></ol>${button(`실습 시작 ${icon('arrow')}`, 'controller-start', 'button primary full')}<small>정상 가상 기체로 연습합니다. IMU 자세 순서와 3초 측정은 교육용 구성이며 실제 기종의 보정 필요 여부와 앱 안내를 따릅니다.</small></aside>`;
}

export function renderLessonOptions() {
  return `<details class="lesson-options"><summary>음성 안내 · 전체 단계</summary>${renderVoiceControls()}${button('전체 단계 보기','open-help','remaining-help')}</details>`;
}

export function renderTaskGuide(guide, compact = false) {
  if (!guide?.current) return '';
  const t = guide.current;
  const workflow = guide.workflow ? `<ol class="robot-workflow" aria-label="교육 진행 단계">${guide.workflow.map((step, index) => `<li data-workflow-state="${step.state}" ${step.state === 'current' ? 'aria-current="step"' : ''}><span>${step.state === 'done' ? '✓' : index + 1}</span>${e(step.label)}</li>`).join('')}</ol>` : '';
  const taskState = guide.complete ? 'guide-complete' : 'current-task-active';
  const caption = guide.complete ? '교육 완료' : '지금 할 일';
  if (compact) return `<section class="lesson-instruction ${taskState}" data-current-task="${e(t.id)}" aria-label="현재 할 일">
    ${workflow}<span class="guide-caption">${caption}</span>
    <div class="lesson-instruction-heading"><h2 id="current-task-title" tabindex="-1">${e(t.title)}</h2>${!guide.complete && (t.target.kind !== 'imu' || t.id === 'imu-power') ? button('위치 보기','locate-task','guide-locate') : ''}</div>
    <p>${e(t.detail)}</p></section>`;
  return `<section class="task-guide ${guide.workflow ? 'has-workflow' : ''} ${taskState}" data-current-task="${e(t.id)}" aria-label="현재 할 일">${workflow}<div class="task-copy"><span class="guide-caption">${caption}</span><h2 id="current-task-title">${e(t.title)}</h2><p>${e(t.detail)}</p><p id="interaction-hint" class="interaction-status">${e(guide.inputHelp || '끌어 놓기 · 클릭으로 집고 놓기 · 취소: Esc')}</p>${guide.upNext && !guide.complete ? `<p class="guide-up-next">이 작업을 마치면 → ${e(guide.upNext.title)}</p>` : ''}<span class="guide-progress">${e(guide.summary)}</span></div><div class="guide-next"><span class="guide-caption">다음 조작 대상</span><strong data-current-target>${e(t.targetLabel)}</strong>${!guide.complete ? button('위치 보기', 'locate-task', 'guide-locate') : ''}<button type="button" class="remaining-help" data-action="open-help">${guide.complete ? '수행 내용 보기' : `남은 작업 ${guide.remaining}개 보기`}</button>${!guide.complete ? renderVoiceControls() : ''}</div></section>`;
}

export function updateTaskGuide(root, guide) {
  const host = root.querySelector('#task-guide-host'); if (!host || !guide) return;
  const signature = `${guide.current?.id}:${guide.current?.title}:${guide.current?.detail}:${guide.remaining}:${guide.summary}:${guide.complete}`;
  if (host.dataset.signature === signature) return;
  host.dataset.signature = signature; host.innerHTML = renderTaskGuide(guide, host.classList.contains('lesson-guide'));
}

export function renderLearningHelp(guide, ui, result) {
  const currentId = guide?.complete ? '' : (guide?.current?.id || '').replace(/^kit-/, '');
  const robotCourse = ui.route === 'robot' || ui.route === 'robot-intro';
  const robotControllerCourse = ui.route.startsWith('robot-controller');
  const imuCourse = ui.route === 'imu';
  const controllerCourse = ui.route === 'controller' || ui.route === 'controller-intro';
  const imuHelp = '<li>첫 단계에서는 기체·조종기 전원을 켜고 연결한 뒤 스틱 입력만 먼저 확인합니다. 기체는 아직 움직이지 않습니다. IMU 보정과 결과 확인을 마친 다음 기체 이동 연습으로 이어갑니다. 이동 연습에서는 왼쪽 ↑↓가 앞뒤 이동, 오른쪽 ←→가 제자리 회전이며 놓으면 멈춥니다. 위치 초기화로 시작점에 돌아갈 수 있습니다. 동작 정지·Esc로 정지와 연결 해제를 확인한 뒤 조종기 화면의 이어하기를 누릅니다.</li><li>IMU 보정은 조종기 교육의 두 번째 단계입니다. 전원·연결·스틱·정지 확인 뒤 이어가며, IMU 결과 확인 후 기체 이동·회전·정지 연습까지 마치면 전체 교육이 완료됩니다. 상단 다시 시작은 조종기 단계부터 모두 초기화합니다.</li><li>작업대 확인 → 기체 전원 → 가상 연결 → 보정 시작 순서로 진행합니다. 배터리 50% 이상 조건을 검사하며 교육 기체는 100%입니다.</li><li>안내 아래의 자세 버튼을 누르면 기체가 그 면으로 돌아갑니다. 3D 본체나 잡기 표시를 직접 끌어도 됩니다. 빈 곳을 끌면 카메라 시점만 바뀝니다. 잡기 표시를 Tab으로 선택하고 방향키로 90도씩 돌릴 수도 있습니다.</li><li>옆면 단계는 왼쪽·오른쪽 중 편한 면부터 각각 한 번씩 3초간 유지합니다. 이미 측정한 면은 중복으로 세지 않습니다. 나머지 자세는 작은 목표 모형을 따르며 움직이는 동안에는 측정하지 않습니다. 움직이면 현재 자세의 정지 시간만 초기화됩니다.</li><li>도움말·Esc·창 초점 이탈·탭 숨김·교육 이동은 측정을 정지합니다. 자동으로 재개하지 않으며 센서 패널의 이어서 측정하기를 눌러야 합니다.</li><li>전원을 끄면 연결과 측정이 초기화됩니다. 여섯 자세를 마친 뒤 기체를 바르게 놓고 결과 확인을 눌러야 교육이 끝납니다.</li><li>자세 순서·3초 측정·기준선 비교는 교육용 구성입니다. 실제 센서 측정·DJI 보정 절차 재현·비행 가능 판정이 아닙니다. 실기체는 보정 필요 상태와 기종별 앱 안내를 따릅니다.</li><li>IMU 보정 중에는 모터가 회전하지 않습니다. 프로펠러 정비와 별도 기체를 사용하며 기존 정비 결과를 변경하지 않습니다. 이 과정은 CSV 훈련 기록에 저장하지 않습니다.</li>';
  const robotControllerHelp = '<li>3D 로봇 본체 위의 전원 기호 버튼을 직접 눌러 로봇을 켭니다. 위치 보기로 가까이 볼 수 있습니다. 조종기 전원도 켠 뒤 스틱을 중앙에 두고 연결합니다. 연결 후 비상 정지를 해제해야 움직입니다.</li><li>왼쪽 스틱은 로봇 앞을 기준으로 전후·좌우 이동, 오른쪽 스틱의 좌우는 방향 회전입니다. 마우스로 끌거나 스틱을 선택한 뒤 방향키를 누릅니다.</li><li>스틱을 놓으면 정지합니다. 동작 정지는 연결을 해제하며, Esc는 비상 정지를 겁니다. 재개하려면 필요한 연결·비상 정지 해제를 다시 수행합니다.</li><li>창 초점 이탈·다른 탭 이동은 비상 정지와 연결 해제로 처리합니다. 도움말을 열 때도 스틱 입력을 해제하지만 연결은 유지합니다.</li><li>이동·회전·동작 정지 후 비상 정지까지 확인하면 여덟 단계의 교육이 끝납니다. 다시 시작은 조종기·로봇 전원과 위치·진행 표시를 초기화합니다.</li><li>정상 Q-TRAIN으로 연습하며 정비 상태·완료 결과를 변경하지 않습니다. 수행 표시는 별도 CSV 기록으로 저장하지 않습니다.</li><li>보행은 간소화된 시각 표현입니다. 실제 기종의 조작 절차·보행·균형 제어는 재현하지 않습니다.</li>';
  const introduction = { 'panda-maintenance': '비상 정지와 전원 차단 후 그리퍼를 클릭해 손상을 관찰합니다. 교체 필요를 선택하고 커넥터를 분리하세요. 육각 공구를 각 볼트에 놓아 분리한 뒤 손상 그리퍼를 수거함으로 옮깁니다. PG-01 새 그리퍼를 빈 장착부에 놓고 두 볼트를 체결·커넥터를 연결합니다. 전원을 켜고 비상 정지를 해제해 개폐 시험을 합니다. 시험 후 비상 정지·전원 차단·최종 확인을 마치면 완료입니다. 공구와 부품은 클릭으로 집고 놓거나 끌어 옮길 수 있습니다. Esc·창 이탈·도움말은 집기와 진행 중 시험을 취소합니다.', 'panda-maintenance-intro': '고장 난 그리퍼를 직접 교체하는 3D 정비 실습입니다. 회차와 교육생 번호를 입력하고 시작하세요.', 'panda-bomb-intro': '정비와 별개인 가상 색상 퍼즐입니다. 시간 제한 없는 연습 또는 90초 도전을 선택하세요.', panda: '화면 스틱으로 집게를 목표 색의 선에 맞추고 자르기를 누르세요. 성공하면 로봇팔이 자동으로 복귀합니다. 연습은 시간 제한이 없고 도전은 90초입니다. 실제 폭발물 구조·배선·해체법과 무관한 게임입니다.', 'panda-education': '정비 교육과 폭탄 해체 교육 중 하나를 선택하세요. 정비는 고장 그리퍼 교체를, 해체는 가상 색상 퍼즐을 연습합니다.', home: '드론·사족보행 로봇·로봇팔 중 하나를 선택하세요. 다음 화면에서 해당 장비의 교육 과정을 시작합니다.', 'drone-education': '드론 정비 교육과 조종기 교육 중 하나를 선택하세요. 정비는 점검·부품 교체를, 조종기는 이동·회전과 IMU 보정을 연습합니다.', 'robot-education': '사족보행 로봇의 정비 교육과 조종기 교육 중 하나를 선택하세요. 정비는 관절 점검·교체를, 조종기는 이동·회전·정지를 연습합니다.', 'drone-intro': '3D 드론을 회전·확대해 살펴보세요. 학습 내용을 확인하고 회차·교육생 번호를 입력한 뒤 실습 시작을 누르면 정비가 시작됩니다. 조종기 교육도 이 화면에서 선택할 수 있습니다.', 'robot-controller-intro': '로봇 조종기의 전원·연결·스틱·정지 학습 내용을 확인하고 실습 시작을 누르세요. 소개 화면에서는 로봇을 회전·확대해 볼 수 있습니다.', 'robot-intro': '상단의 로봇 조종기 교육에서 이동·회전·정지를 연습할 수도 있습니다. 3D 로봇과 학습 내용을 확인하세요. 회차·교육생 번호를 입력하고 실습 시작을 눌러야 정비 과제가 시작됩니다.', 'controller-intro': '조종기 작동 확인·IMU 보정·기체 이동 연습을 한 과정으로 진행합니다. 실습 시작 후 전원·연결·스틱·정지 확인을 마치고 조종기 화면의 IMU 보정으로 이어하기를 누르세요. IMU 결과 확인 후 기체 이동·회전·정지 연습까지 마치면 전체 교육이 완료됩니다.' }[ui.route];
  const robotHelp = '<li>로봇 정비는 비상 정지·주 전원 차단·받침대 설치·배터리 분리로 시작합니다.</li><li>네 다리를 먼저 모두 점검합니다. 각 관절의 정상 또는 교체 필요를 선택하면 다음 미점검 다리를 자동으로 확대합니다. 판단을 모두 마치면 교체할 다리로 이어집니다.</li><li>커넥터 → 두 볼트 → 손상 모듈 순으로 분리합니다. QJ-01 새 모듈을 놓고 두 볼트를 공구로 체결한 뒤 커넥터를 연결합니다.</li><li>배터리·주 전원을 복구하고 비상 정지를 해제한 뒤 받침대 위에서 관절 시험을 합니다. 시험 중 Esc·비상 정지·창 이탈은 시험을 중단하며, 다시 실행해야 합니다.</li><li>시험 후 비상 정지와 주 전원 차단을 확인하고 정비 완료를 누릅니다. 완료·중단 결과는 훈련 기록과 CSV에 보관할 수 있습니다.</li><li>다시 시작하면 다른 다리에 고장을 가진 새 과제를 만듭니다. 새로고침은 진행 중 실습을 이어주지 않습니다.</li><li>Q-TRAIN은 가상 교육 모델입니다. 실제 기종의 분해 순서·잠금 구조·토크·보행 물리를 재현하지 않습니다.</li>';
  const checklist = guide ? guide.phases.map(p => `<details class="help-phase" ${p.tasks.some(t => t.id === currentId) ? 'open' : ''}><summary><span>${e(p.title)}</span><span>${p.tasks.length ? `${p.tasks.filter(t => t.done).length}/${p.tasks.length} 완료` : '점검 후 안내'}</span></summary>${p.note ? `<p class="help-note">${e(p.note)}</p>` : ''}<ol>${p.tasks.map(t => `<li data-task-id="${e(t.id)}" data-done="${t.done}" ${t.id === currentId && !t.done ? 'aria-current="step"' : ''}><span class="task-state" aria-label="${t.done ? '완료' : '남음'}">${t.done ? '✓' : '○'}</span><div><strong>${e(t.title)}</strong>${t.id === currentId && !t.done ? '<span class="current-task-badge">지금</span>' : ''}${!t.done ? `<p>${e(t.detail)}</p><small>조작 대상: ${e(t.targetLabel)}</small>` : ''}</div></li>`).join('')}</ol></details>`).join('') : `<p class="help-note">${introduction || (ui.route === 'operations' ? '훈련 기록에서 회차별 결과를 확인하고 CSV로 내보내거나 가져올 수 있습니다.' : result ? '결과 화면에서 저장 여부를 확인하고 새 교육을 시작할 수 있습니다.' : ui.route === 'robot' ? '회차와 교육생 번호를 입력하고 실습 시작을 누르세요. 네 다리 중 손상된 관절을 찾아 모듈 교체와 작동 확인을 연습합니다.' : '첫 화면에서 장비를 고른 뒤 정비 교육 또는 조종기 교육을 선택하세요. 정비 교육은 교육생 번호를 입력하고 실습 시작을 누릅니다. 조종기 교육은 소개 화면의 실습 시작을 누릅니다.')}</p>`;
  return `<dialog id="learning-help" class="learning-help-dialog" aria-labelledby="learning-help-title"><div class="help-dialog-heading"><div><span class="eyebrow">LEARNING HELP</span><h2 id="learning-help-title">${guide?.complete ? '수행한 작업' : '도움말 · 남은 작업'}</h2></div>${button('닫기', 'close-help', 'header-action', 'autofocus')}</div>${guide?.current ? `<div class="help-current ${guide.complete ? '' : 'current-task-active'}"><span class="guide-caption">${guide.complete ? '완료' : '지금 할 일'}</span><h3>${e(guide.current.title)}</h3><p>${e(guide.current.detail)}</p>${!guide.complete ? button('이 작업 위치 보기', 'locate-task', 'button') + renderVoiceControls() : ''}</div>` : ''}${checklist}<details class="help-controls"><summary>조작 방법과 완료 조건</summary><ul>${ui.route === 'panda' ? '<li>3D 화면의 스틱을 선택하고 좌우 방향키로 선을 고른 뒤 아래 방향키로 집게를 내리세요. 스틱을 끌어도 같은 동작을 합니다. 집게 정렬 표시가 뜨면 자르기를 누르세요.</li>' : ui.route.startsWith('panda') ? '<li>화면의 단계 안내와 실습 버튼을 사용하세요. 3D 빈 곳을 끌거나 방향키로 시점을 회전하고 휠로 확대합니다.</li>' : imuCourse || controllerCourse ? imuHelp : robotControllerCourse ? robotControllerHelp : '<li>부품을 끌어 놓거나, 클릭해서 집은 뒤 놓을 자리를 클릭하세요. Esc로 집기를 취소합니다.</li>'}${ui.route.startsWith('panda') || imuCourse || controllerCourse || robotControllerCourse ? '' : robotCourse ? robotHelp : '<li>나사는 드라이버로 분리합니다. 새 나사를 놓은 뒤 드라이버를 다시 놓아 체결해야 합니다.</li><li>모터를 보기만 한 상태와 정상·교체 필요 판단을 마친 상태는 다릅니다. 네 곳 모두 직접 판단하세요.</li><li>정비 후 최종 확인 세 항목을 체크하고 정비 완료를 눌러야 교육이 끝납니다.</li><li>조종기 스틱은 드래그 또는 방향키로 조작하며, 놓으면 중앙으로 돌아옵니다. Esc는 동작 정지·연결 해제입니다.</li><li>다시 시작은 현재 정비를 중단 기록으로 보관하고 새 실습을 만듭니다. 진행 중 새로고침은 이어하기를 제공하지 않습니다.</li>'}<li>도움말은 상태를 설명하며 작업이나 정답을 대신 수행하지 않습니다. 점검 결과에 따라 교체 항목이 추가됩니다.</li></ul></details></dialog>`;
}

export function applyLearningHighlights(root, guide, ui) {
  root.querySelectorAll('.guide-source,.guide-destination').forEach(n => n.classList.remove('guide-source', 'guide-destination'));
  root.querySelector('header [data-action="open-help"]')?.classList.toggle('help-attention', Boolean(guide?.current && !guide.complete));
  const t = guide?.current; if (!t || guide.complete) return;
  const verdicts = root.querySelector('.scene-context .two-buttons');
  if (verdicts && (t.target.kind === 'motor' || t.id.startsWith('robot-inspect-'))) { verdicts.classList.add('guide-source'); return; }
  const spatial = root.querySelector('.spatial-hit[data-current="true"]');
  if (spatial) { spatial.classList.add('guide-source'); return; }
  const mark = (selector, destination = false) => root.querySelector(selector)?.classList.add(destination ? 'guide-destination' : 'guide-source');
  if (t.target.kind === 'imu' || t.target.kind === 'course-next') { mark(t.target.selector); return; }
  if (t.target.kind === 'robot') {
    if (t.legId && (ui.robotSelected !== t.legId || !root.querySelector(t.target.selector))) { mark(`.robot-leg-button[data-leg="${t.legId}"]`); return; }
    if (t.target.selector) mark(t.target.selector);
    if (t.target.destination) mark(t.target.destination, true);
    return;
  }
  if (t.motorId && (!ui.zoomed || ui.selected !== t.motorId)) { mark(`.three-motor-label[data-motor="${t.motorId}"]`); return; }
  const inventory = kind => {
    const node = [...root.querySelectorAll('.new-parts [data-piece]')].find(n => { const p = JSON.parse(n.dataset.piece); return p.kind === kind && p.index === t.target.index; });
    if (node) node.classList.add('guide-source'); else mark('#kit');
  };
  switch (t.target.kind) {
    case 'power': mark('.model-power'); break;
    case 'battery': mark('.battery-point'); mark('.discard-tray', true); break;
    case 'motor': mark('.two-buttons'); break;
    case 'driver': mark('.tool-piece'); mark(`[data-anchor="screw-${t.target.index}"]`, true); break;
    case 'old-blade': mark(`[data-anchor="blade-${t.target.index}"]`); mark('.discard-tray', true); break;
    case 'new-blade': inventory('blade'); mark(`[data-anchor="blade-${t.target.index}"]`, true); break;
    case 'new-screw': inventory('screw'); mark(`[data-anchor="screw-${t.target.index}"]`, true); break;
    case 'check': mark(`[data-check="${t.target.check}"]`); break;
    case 'finish': mark('[data-action="final"]'); break;
    case 'kit': mark('#kit'); break;
    case 'restart': mark('header [data-action="restart"]'); break;
    case 'controller-aircraft': mark('[data-action="controller-aircraft-power"]'); break;
    case 'controller-remote': mark('[data-action="controller-remote-power"]'); break;
    case 'controller-link': mark('[data-action="controller-link"]'); break;
    case 'controller-stick': mark(`[data-stick="${t.target.side}"]`); break;
    case 'controller-stop': mark('[data-action="controller-stop"]'); break;
  }
}
