import { PROFILE, motorProfile } from '../content/aircraft-profiles.js';
import { SCENARIO } from '../content/scenarios.js';
import { readyForMaintenance, physicalIssues, motorIssues } from '../domain/state.js';
import { escapeHTML as e, icon, button } from './shared.js';
import { renderPartsDock, renderRepairPoints } from './parts.js';
import { createBatteryPacks, installedBattery, batteryColor, chargeFraction } from '../domain/battery.js';
import { rotorPreviewMarkup } from './rotor-preview.js';
import { motorStatus, motorStatusLabel } from './motor-status.js';

function rotor(motor, p, selected) {
  const blades = motor?.blades || [0, 1].map(i => ({ present: true, marked: p.marked, condition: p.id === SCENARIO.target && i === 0 ? 'damaged' : 'healthy' }));
  const screws = motor?.screws || [{ present: true, secured: true }, { present: true, secured: true }];
  const damaged = blades[0].condition === 'damaged';
  return `<g class="rotor ${selected ? 'selected' : ''}" transform="translate(${p.x} ${p.y})">
    ${selected ? '<circle class="selection-ring" r="49"/>' : ''}
    <circle r="25" fill="#394d48" stroke="#182b28" stroke-width="3"/>
    <circle r="18" fill="url(#motorMetal)"/><circle r="11" fill="#9ba9a3"/>
    ${p.marked ? '<path d="M-26 21h11" stroke="#c9a970" stroke-width="4" stroke-linecap="round"/>' : ''}
    ${blades.map((b, i) => b.present ? `<g class="static-propeller" transform="rotate(${i * 180 + (p.x < 380 ? -27 : 27)})">
      <path d="M-8-7C-34-16-79-18-99-10Q-108-4-101 0C-74 7-37 12-8 7Q2 0-8-7Z" fill="url(#bladeMetal)" stroke="#283c36" stroke-width="1.2"/>
      <path d="M-95-8Q-66-4-30 2" fill="none" stroke="#718079" stroke-width="1" opacity=".7"/>
      ${b.marked ? '<path d="M-27-9v14m-5-15v14" stroke="#d2b078" stroke-width="2.5"/>' : ''}
      ${damaged && i === 0 ? '<path d="m-86-12 4 6-6 4 6 7" stroke="#d17b4e" stroke-width="3" fill="none"/>' : ''}
      ${screws[i].present ? `<circle cx="-9" r="4.8" fill="${screws[i].secured ? '#afbab3' : '#ddad65'}" stroke="#30433c"/><path d="M-12 0h6m-3-3v6" stroke="#53645d" stroke-width="1.3"/>` : '<circle cx="-9" r="4" fill="#253831"/>'}
    </g>` : '').join('')}
  </g>`;
}

export function droneSVG(state, selected, zoomed = false) {
  const selectedProfile = motorProfile(selected);
  const battery = state ? installedBattery(state) : createBatteryPacks()[0];
  const viewBox = zoomed && selectedProfile ? `${selectedProfile.x - 150} ${selectedProfile.y - 110} 300 220` : '0 0 760 590';
  return `<svg class="drone-svg ${zoomed ? 'is-zoomed' : ''}" viewBox="${viewBox}" role="img" aria-label="전방이 위쪽인 드론 정비 도식. 아래 모터 선택 버튼으로 확대 점검할 수 있습니다.">
    <defs>
      <linearGradient id="bodyMetal" x1="0" x2="1" y1="0" y2=".6"><stop stop-color="#eef1e9"/><stop offset=".45" stop-color="#c5cdc1"/><stop offset="1" stop-color="#9ca99d"/></linearGradient>
      <linearGradient id="armMetal" x1="0" x2="1"><stop stop-color="#99a99b"/><stop offset=".5" stop-color="#d4dbcf"/><stop offset="1" stop-color="#829487"/></linearGradient>
      <linearGradient id="bladeMetal" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#596a61"/><stop offset="1" stop-color="#243c32"/></linearGradient>
      <radialGradient id="motorMetal"><stop stop-color="#cbd1c9"/><stop offset=".7" stop-color="#7e9083"/><stop offset="1" stop-color="#3c5045"/></radialGradient>
      <filter id="droneShadow" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="15" stdDeviation="12" flood-color="#253d30" flood-opacity=".14"/></filter>
    </defs>
    <g class="diagram-guides" fill="none" stroke="#b8c6b7" stroke-width="1">
      <circle cx="380" cy="294" r="234" stroke-dasharray="3 9"/><path d="M380 35v470M78 294h604" stroke-dasharray="4 7" opacity=".45"/>
      <path d="m373 40 7-12 7 12" stroke="#748c78" stroke-width="2"/>
    </g>
    <text x="380" y="18" text-anchor="middle" fill="#7c8d7d" font-size="11" letter-spacing="3">FRONT</text>
    <g filter="url(#droneShadow)">
      <path d="m332 221-145-80-13 27 148 108m106-55 145-80 13 27-148 108M327 355l-146 64 9 28 154-53m89-39 146 64-9 28-154-53" fill="url(#armMetal)" stroke="#879a87" stroke-width="2"/>
      <path d="m316 199 16-37q48-18 96 0l16 37 12 158-22 63q-54 23-108 0l-22-63Z" fill="url(#bodyMetal)" stroke="#8b9c89" stroke-width="2"/>
      <path d="m340 187 7-14h66l7 14 8 139-17 38h-62l-17-38Z" fill="#d7ddcf" stroke="#afbaa7"/>
      <path d="M346 202h68m-70 6h72m-72 6h72M346 333h68m-66 7h64" stroke="#b3bfaa" stroke-width="2"/>
      <rect x="355" y="137" width="50" height="39" rx="12" fill="#7b8d7c" stroke="#5d735f" stroke-width="2"/>
      <rect x="362" y="136" width="36" height="28" rx="8" fill="#293e32"/><circle cx="380" cy="147" r="9" fill="#142c25" stroke="#9cac96" stroke-width="2"/>
      <circle cx="380" cy="147" r="5" fill="#45676b"/>
      <rect x="347" y="367" width="66" height="27" rx="6" fill="${state?.battery === false ? '#6e826d' : '#a8b69d'}" stroke="#879a80"/>
      ${state?.battery === false ? '<path d="M357 381h46" stroke="#3f5844" stroke-width="3" stroke-dasharray="6 4"/>' : '<path d="M359 377h42m-42 6h42" stroke="#cad2bd" stroke-width="2"/>'}
      <circle cx="380" cy="400" r="5" fill="${state?.power ? '#d4b16a' : '#859b7f'}"/>
      <rect x="349" y="310" width="62" height="7" rx="2" fill="#344333"/>
      <rect data-battery-led-fill x="349" y="310" width="${62 * chargeFraction(battery?.charge ?? 0)}" height="7" rx="2" fill="${batteryColor(battery?.charge ?? 0)}"/>
      <text x="380" y="264" text-anchor="middle" fill="#667b65" font-size="12" font-weight="600" letter-spacing="4">MINI 2 SE</text>
      <text x="380" y="286" text-anchor="middle" fill="#899b80" font-size="8" letter-spacing="2">TRAINING MODEL</text>
      ${PROFILE.motors.map(p => rotor(state?.motors[p.id], p, selected === p.id)).join('')}
    </g>
    ${!zoomed ? PROFILE.motors.map(p => `<g fill="#7b8d78" font-size="11"><path d="M${p.x} ${p.y + 40}v23" stroke="#9bad95"/><text x="${p.x}" y="${p.y + 80}" text-anchor="middle">${p.short} / ${p.name}</text></g>`).join('') : ''}
    <g data-flat-rotor-preview hidden aria-hidden="true">${rotorPreviewMarkup(true)}</g>
  </svg>`;
}

export function renderWorkbench(s, ui) {
  const flatPoints = ui.viewMode === '2d' ? `<div class="flat-points">${ui.controllerMode ? '' : PROFILE.motors.map(p => button(p.short, 'select-motor', 'three-motor-label', `data-motor="${p.id}" data-anchor="motor:${p.id}" data-inspection="${motorStatus(s, p.id)}" title="${p.short}번 ${p.name} · ${motorStatusLabel(motorStatus(s, p.id))}" aria-label="${p.name} 모터 선택${motorStatus(s, p.id) ? ' · ' + motorStatusLabel(motorStatus(s, p.id)) : ''}" aria-pressed="${ui.selected === p.id}"`)).join('')}${renderRepairPoints(s, ui)}</div>` : '';
  return `<section class="workbench" aria-label="드론 정비 작업대">
    <div class="drone-canvas ${ui.viewMode === '3d' ? 'three-stage' : 'flat-stage'}">${ui.viewMode === '3d' ? '<div id="drone-viewport" class="drone-viewport"><span class="three-loading">드론을 준비하고 있습니다…</span></div>' : droneSVG(s, ui.selected, ui.zoomed)}${flatPoints}
      <div class="canvas-tools">${button(icon('reset'), 'view-all', 'camera-home', 'aria-label="기체 전체 보기" title="기체 전체 보기 · Esc"')}</div>
      <span class="canvas-help">${ui.viewMode === '3d' ? '빈 곳을 끌어 회전 · 휠로 확대' : ui.controllerMode ? '조종기로 회전 반응 확인' : '번호를 눌러 모터 선택'}</span><span class="model-note">${ui.controllerMode ? '작동 확인용 교육 기체 · 비행 없음' : '교육용 모델'}</span></div>
    ${ui.rendererError ? `<p class="renderer-notice">${e(ui.rendererError)}</p>` : ''}${ui.controllerMode ? '' : renderPartsDock(s, ui)}</section>`;
}

export function renderInspector(s, ui) {
  if (!s) return `<aside class="inspector start-panel"><span class="eyebrow">BASIC MAINTENANCE</span><h2>정비 실습 준비</h2><p>모터 네 곳을 점검하고<br>필요한 부품을 교체합니다.</p>
    <form id="start-form"><div class="start-fields"><label>훈련 회차<input name="session" maxlength="40" required value="${e(ui.session)}" autocomplete="off"></label><label>교육생 번호<input name="trainee" maxlength="40" required value="${e(ui.trainee)}" autocomplete="off"></label></div>
    <details class="practice-settings"><summary>실습 설정</summary><fieldset class="mode-picker"><legend class="sr-only">실습 방식</legend><label class="mode-choice"><input type="radio" name="mode" value="guided" ${ui.mode === 'guided' ? 'checked' : ''}>안내 실습</label><label class="mode-choice"><input type="radio" name="mode" value="independent" ${ui.mode === 'independent' ? 'checked' : ''}>독립 실습</label></fieldset></details>
    <button class="button primary full" type="submit">실습 시작 ${icon('arrow')}</button></form><small>실명·군번 없이 번호만 입력하세요.</small></aside>`;
  if (!readyForMaintenance(s)) return `<aside class="inspector context-panel"><span class="eyebrow">01 / 준비</span><h2>배터리·전원을 확인하세요</h2><p>일자 LED가 짧을수록 잔량이 적습니다.<br>전원 차단 후 배터리를 수거함으로 옮기고, 교체 배터리를 빈 자리에 놓으세요.</p><small>프로펠러 정비 중에는 배터리를 분리해 둡니다.</small><div class="preparation-status"><span class="${s.safetyConfirmed ? 'done' : ''}">${icon(s.safetyConfirmed ? 'check' : 'power')} 전원 차단 ${s.safetyConfirmed ? '확인됨' : '확인'}</span><span class="${!s.battery ? 'done' : ''}">${icon(!s.battery ? 'check' : 'battery')} 배터리 ${s.battery ? '장착됨' : '분리됨'}</span></div></aside>`;
  const p = motorProfile(ui.selected), m = s.motors[ui.selected];
  const pending = PROFILE.motors.filter(p => !s.motors[p.id].verdict);
  const observed = PROFILE.motors.length - pending.length;
  const repair = PROFILE.motors.filter(p => motorIssues(s, p.id).length);
  const next = pending[0] || repair[0];
  const remaining = pending.length
    ? `상태 판단이 남은 모터: ${pending.map(p => `${p.short}번 · ${p.name}`).join(' / ')}`
    : next ? `남은 정비: ${next.short}번 · ${next.name} (${motorIssues(s, next.id).join(' · ')})` : '';
  const nextTask = next ? `<div class="remaining-task"><p data-remaining-motors>${e(remaining)}</p>${button(`${next.short}번 모터 ${pending.length ? '점검' : '정비'}`, 'next-motor', 'quiet-button next-motor', `data-motor="${next.id}" data-next-task` )}</div>` : '';
  if (!physicalIssues(s).length && observed === 4) return `<aside class="inspector context-panel final-panel"><span class="eyebrow">04 / 마무리</span><h2>마지막으로 확인하세요</h2><div class="final-checks">${[['marks', '기체와 부품의 표식 일치'], ['count', '날개·나사 누락 없음'], ['fastening', '모든 나사 체결 완료']].map(([key, label]) => `<label class="final-check-label"><input type="checkbox" data-input="final-check" data-check="${key}" ${s.checks[key] ? 'checked' : ''}>${label}</label>`).join('')}</div>${button('정비 완료', 'final', 'button primary full', Object.values(s.checks).every(Boolean) ? '' : 'disabled')}</aside>`;
  if (!m.inspected || !ui.zoomed) return `<aside class="inspector context-panel"><span class="eyebrow">02 / 점검 · ${observed}/4</span><h2>${pending.length === 1 ? '한 곳의 상태 판단이 남았습니다' : pending.length ? '남은 모터를 점검하세요' : '남은 정비를 마무리하세요'}</h2>${nextTask}<small>모터 번호 옆 ✓는 점검·정비 완료, !는 정비가 남은 상태입니다.</small></aside>`;
  let instruction = '이 모터의 점검을 마쳤습니다. 다른 모터의 번호를 눌러 점검하세요.';
  const needsRepair = m.verdict === 'replace' || motorIssues(s, ui.selected).length > 0;
  if (needsRepair) {
    if (m.blades.some((b, i) => b.source === 'original' && m.screws[i].present)) instruction = '드라이버를 나사에 놓아 분리하세요.';
    else if (m.blades.some(b => b.present && b.source === 'original')) instruction = '기존 날개를 수거함으로 옮기세요.';
    else if (m.blades.some(b => !b.present)) instruction = '같은 포장의 새 날개 두 개를 빈 자리에 놓으세요.';
    else if (m.screws.some(b => !b.present)) instruction = '새 나사를 같은 번호의 자리에 놓으세요.';
    else if (m.screws.some(b => !b.secured)) instruction = '드라이버를 새 나사에 놓아 체결하세요.';
    else instruction = observed < 4 ? '교체를 마쳤습니다. 남은 모터도 점검하세요.' : '교체를 마쳤습니다.';
  }
  return `<aside class="inspector context-panel"><span class="eyebrow">${m.verdict === 'replace' ? '03 / 교체' : '02 / 점검'} · ${observed}/4</span><h2>${p.name} 모터</h2><span class="motor-mark">${p.marked ? 'Ⅱ 표식 있음' : '표식 없음'}</span>${!m.verdict ? `<p>날개 끝과 고정부를 살펴보세요.<br>교체가 필요한 상태인가요?</p><div class="two-buttons">${button('정상', 'answer-healthy', 'button')}${button('교체 필요', 'answer-replace', 'button')}</div>` : `<p class="current-instruction">${e(ui.mode === 'independent' ? '선택한 모터의 점검과 정비를 수행하세요. 부품 표식과 장착 상태를 확인하세요.' : instruction)}</p>${m.verdict === 'replace' ? '<small>한 모터의 두 날개와 나사를<br>같은 포장의 새 부품으로 교체합니다.</small>' : ''}${!motorIssues(s, ui.selected).length ? nextTask : ''}`}</aside>`;
}
