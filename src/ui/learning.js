import { escapeHTML as e, icon, button } from './shared.js';

export function renderLearningHeader(ui, state, result, pack, settingsOpen, storageError) {
  const training = ui.route === 'training', controller = ui.route === 'controller';
  const restart = controller ? 'controller-restart' : training && state?.status === 'active' ? 'restart' : '';
  return `<header class="minimal-header"><a href="#" class="minimal-brand" data-action="training">${icon('rotor')}<strong>AEROLAB</strong></a><span class="header-title">${controller ? '조종기 교육' : training ? '정비 교육' : '훈련 기록'}</span><span class="header-session">${state && !result ? e(state.meta.trainee) + ' · ' : ''}${storageError ? '저장 확인 필요' : '드론 기초 교육'}</span><nav aria-label="주요 메뉴">${restart ? button(`${icon('reset')} 다시 시작`, restart, 'header-action restart-visible') : ''}${button(`${icon('info')} 도움말`, 'open-help', 'header-action', `aria-haspopup="dialog" aria-controls="learning-help" aria-expanded="${ui.helpOpen}"`)}${button(ui.route === 'operations' ? '교육으로' : '훈련 기록', ui.route === 'operations' ? 'training' : 'operations', 'quiet-button')}
    <details class="more-menu" ${settingsOpen ? 'open' : ''}><summary aria-label="화면 설정" title="화면 설정">···</summary><div class="more-menu-content"><label>화면<select data-input="view-mode" aria-label="화면 방식"><option value="3d" ${ui.viewMode === '3d' ? 'selected' : ''}>3D</option><option value="2d" ${ui.viewMode === '2d' ? 'selected' : ''}>2D</option></select></label>${ui.viewMode === '3d' && !controller ? `<label class="structure-option"><input type="checkbox" data-input="exploded" ${ui.exploded ? 'checked' : ''}>구조 벌려 보기</label>` : ''}${training && state && !result ? `<div class="battery-practice"><label for="battery-charge">잔량 연습 <output id="battery-charge-value">${pack ? pack.charge + '%' : '—'}</output></label><input id="battery-charge" type="range" data-input="battery-charge" min="0" max="100" step="1" value="${pack?.charge ?? 0}" aria-label="연습용 배터리 잔량" ${pack ? '' : 'disabled'}><small>${pack ? '실제 방전 속도가 아닌 연습용 조절입니다.' : '배터리를 장착하면 조절할 수 있습니다.'}</small></div>` : ''}</div></details></nav></header>`;
}

export function renderCourseSelector(ui, state, result) {
  const first = ui.route === 'training' && !state && !result;
  const course = (id, title, description, art) => `<button type="button" class="course-card ${id === 'controller' && first ? 'controller-intro' : ''} ${id === 'training' && ui.route === 'controller' ? 'controller-return' : ''}" data-action="${id}" aria-pressed="${ui.route === id}">${icon(art)}<span><strong>${title}</strong>${first ? `<small>${description}</small>` : ''}</span>${first ? icon('arrow') : ''}</button>`;
  return `<section class="course-selector ${first ? 'course-picker' : 'compact-courses'}" aria-label="교육 선택">${first ? '<div class="course-picker-heading"><h1>어떤 교육을 시작할까요?</h1><p>교육을 선택하고 직접 조작해 보세요.</p></div>' : ''}<nav aria-label="교육 과정">${course('training', '정비 교육', '프로펠러 점검·교체와 배터리 확인', 'tool')}${course('controller', '조종기 교육', '전원·연결·스틱·정지 반응 확인', 'rotor')}</nav></section>`;
}

export function renderTaskGuide(guide) {
  if (!guide?.current) return '';
  const t = guide.current;
  return `<section class="task-guide ${guide.complete ? 'guide-complete' : ''}" data-current-task="${e(t.id)}" aria-label="현재 할 일"><div class="task-copy"><span class="guide-caption">${guide.complete ? '교육 완료' : '지금 할 일'}</span><h2 id="current-task-title">${e(t.title)}</h2><p>${e(t.detail)}</p><p id="interaction-hint" class="interaction-status">끌어 놓기 · 클릭으로 집고 놓기 · 취소: Esc</p><span class="guide-progress">${e(guide.summary)}</span></div><div class="guide-next"><span class="guide-caption">다음 조작 대상</span><strong data-current-target>${e(t.targetLabel)}</strong>${!guide.complete ? button('위치 보기', 'locate-task', 'guide-locate') : ''}<button type="button" class="remaining-help" data-action="open-help">${guide.complete ? '수행 내용 보기' : `남은 작업 ${guide.remaining}개 보기`}</button></div></section>`;
}

export function updateTaskGuide(root, guide) {
  const host = root.querySelector('#task-guide-host'); if (!host || !guide) return;
  const signature = `${guide.current?.id}:${guide.current?.title}:${guide.remaining}:${guide.summary}:${guide.complete}`;
  if (host.dataset.signature === signature) return;
  host.dataset.signature = signature; host.innerHTML = renderTaskGuide(guide);
}

export function renderLearningHelp(guide, ui, result) {
  const checklist = guide ? guide.phases.map(p => `<details class="help-phase" ${p.tasks.some(t => t.id === guide.current?.id) ? 'open' : ''}><summary><span>${e(p.title)}</span><span>${p.tasks.length ? `${p.tasks.filter(t => t.done).length}/${p.tasks.length} 완료` : '점검 후 안내'}</span></summary>${p.note ? `<p class="help-note">${e(p.note)}</p>` : ''}<ol>${p.tasks.map(t => `<li data-task-id="${e(t.id)}" data-done="${t.done}"><span class="task-state" aria-label="${t.done ? '완료' : '남음'}">${t.done ? '✓' : '○'}</span><div><strong>${e(t.title)}</strong>${!t.done ? `<p>${e(t.detail)}</p><small>조작 대상: ${e(t.targetLabel)}</small>` : ''}</div></li>`).join('')}</ol></details>`).join('') : `<p class="help-note">${ui.route === 'operations' ? '훈련 기록에서 회차별 결과를 확인하고 CSV로 내보내거나 가져올 수 있습니다.' : result ? '교육 결과를 저장했습니다. 다음 교육생 또는 재도전으로 새 교육을 시작할 수 있습니다.' : '첫 화면에서 정비 교육 또는 조종기 교육을 선택하세요. 정비 교육은 교육생 번호를 입력하고 실습 시작을 누릅니다. 조종기 교육은 선택하면 바로 시작합니다.'}</p>`;
  return `<dialog id="learning-help" class="learning-help-dialog" aria-labelledby="learning-help-title"><div class="help-dialog-heading"><div><span class="eyebrow">LEARNING HELP</span><h2 id="learning-help-title">${guide?.complete ? '수행한 작업' : '도움말 · 남은 작업'}</h2></div>${button('닫기', 'close-help', 'header-action', 'autofocus')}</div>${guide?.current ? `<div class="help-current"><span class="guide-caption">${guide.complete ? '완료' : '지금 할 일'}</span><h3>${e(guide.current.title)}</h3><p>${e(guide.current.detail)}</p>${!guide.complete ? button('이 작업 위치 보기', 'locate-task', 'button') : ''}</div>` : ''}${checklist}<details class="help-controls"><summary>조작 방법과 완료 조건</summary><ul><li>부품을 끌어 놓거나, 클릭해서 집은 뒤 놓을 자리를 클릭하세요. Esc로 집기를 취소합니다.</li><li>나사는 드라이버로 분리합니다. 새 나사를 놓은 뒤 드라이버를 다시 놓아 체결해야 합니다.</li><li>모터를 보기만 한 상태와 정상·교체 필요 판단을 마친 상태는 다릅니다. 네 곳 모두 직접 판단하세요.</li><li>정비 후 최종 확인 세 항목을 체크하고 정비 완료를 눌러야 교육이 끝납니다.</li><li>조종기 스틱은 드래그 또는 방향키로 조작하며, 놓으면 중앙으로 돌아옵니다. Esc는 회전 정지·연결 해제입니다.</li><li>도움말은 상태를 설명하며 작업이나 정답을 대신 수행하지 않습니다. 점검 결과에 따라 교체 항목이 추가됩니다.</li><li>다시 시작은 현재 정비를 중단 기록으로 보관하고 새 실습을 만듭니다. 진행 중 새로고침은 이어하기를 제공하지 않습니다.</li></ul></details></dialog>`;
}

export function applyLearningHighlights(root, guide, ui) {
  root.querySelectorAll('.guide-source,.guide-destination').forEach(n => n.classList.remove('guide-source', 'guide-destination'));
  const t = guide?.current; if (!t || guide.complete) return;
  const mark = (selector, destination = false) => root.querySelector(selector)?.classList.add(destination ? 'guide-destination' : 'guide-source');
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
