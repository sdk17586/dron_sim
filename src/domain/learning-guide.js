import { PROFILE } from '../content/aircraft-profiles.js';
import { readyForMaintenance, physicalIssues, kitById } from './state.js';

const task = (id, title, detail, targetLabel, target, done = false, motorId = '') => ({ id, title, detail, targetLabel, target, done, motorId });
const phase = (id, title, tasks, note = '') => ({ id, title, tasks, note, done: tasks.length > 0 && tasks.every(t => t.done) });

// Guidance reads the validated state; opening help never performs a task.
export function maintenanceGuide(s, ui = {}) {
  if (!s) return null;
  const prep = [
    task('power-off', '기체 전원을 끄세요', '전원 아이콘을 눌러 기체 전원을 끕니다.', '기체 전원', { kind: 'power' }, !s.power),
    task('confirm-power', '전원 차단을 확인하세요', '기체 위 전원 아이콘을 눌러 차단 상태를 확인합니다.', '기체의 전원 확인 아이콘', { kind: 'power' }, !s.power && s.safetyConfirmed),
    task('remove-battery', '배터리를 수거함으로 옮기세요', '배터리를 끌어 놓거나, 배터리를 클릭한 뒤 수거함을 클릭합니다.', '기체 배터리 → 수거함', { kind: 'battery' }, !s.battery),
  ];
  const inspections = PROFILE.motors.map(p => {
    const m = s.motors[p.id];
    return task(`inspect-${p.id}`, `${p.short}번 모터의 상태를 판단하세요`, '모터를 확대해 날개 끝과 고정부를 살펴보고, 정상 또는 교체 필요를 직접 선택합니다.', `${p.short}번 · ${p.name} 모터`, { kind: 'motor' }, m.inspected && Boolean(m.verdict), p.id);
  });
  const repairs = [];
  for (const p of PROFILE.motors) {
    const m = s.motors[p.id];
    const changed = [...m.blades, ...m.screws].some(part => !part.present || part.source === 'new') || m.screws.some(part => !part.secured);
    if (m.verdict !== 'replace' && !changed) continue;
    for (const operation of ['remove-screw', 'remove-blade', 'install-blade', 'install-screw', 'fasten']) {
      for (const index of [0, 1]) {
        const b = m.blades[index], screw = m.screws[index], number = index + 1;
        const definitions = {
          'remove-screw': [`${number}번 기존 나사를 분리하세요`, '드라이버를 해당 나사 위에 놓습니다.', `드라이버 → ${number}번 나사`, { kind: 'driver', index }, !screw.present || screw.source === 'new'],
          'remove-blade': [`${number}번 기존 날개를 분리하세요`, '고정 나사를 먼저 분리하고 기존 날개를 수거함으로 옮깁니다.', `${number}번 날개 → 수거함`, { kind: 'old-blade', index }, !b.present || b.source === 'new'],
          'install-blade': [`${number}번 새 날개를 놓으세요`, `기체와 표식이 맞는 같은 포장을 선택하고, ${number}번 새 날개를 같은 번호의 빈 자리에 놓습니다.`, `새 날개 ${number} → 빈 날개 자리 ${number}`, { kind: 'new-blade', index }, b.present && b.source === 'new'],
          'install-screw': [`${number}번 새 나사를 놓으세요`, `날개와 같은 포장의 ${number}번 새 나사를 빈 나사 자리에 놓습니다.`, `새 나사 ${number} → 빈 나사 자리 ${number}`, { kind: 'new-screw', index }, screw.present && screw.source === 'new'],
          fasten: [`${number}번 나사 체결을 확인하세요`, '새 나사를 놓은 뒤 드라이버를 한 번 더 나사 위에 놓아 체결합니다.', `드라이버 → ${number}번 새 나사`, { kind: 'driver', index }, screw.present && screw.source === 'new' && screw.secured],
        };
        const [title, detail, targetLabel, target, done] = definitions[operation];
        repairs.push(task(`${operation}-${p.id}-${index}`, `${p.short}번 모터 · ${title}`, detail, targetLabel, target, done, p.id));
      }
    }
  }
  const checks = [
    ['marks', '기체와 부품의 표식을 확인하세요'],
    ['count', '날개·나사 누락 여부를 확인하세요'],
    ['fastening', '모든 나사의 체결 상태를 확인하세요'],
  ].map(([check, title]) => task(`check-${check}`, title, '실제 장착 상태를 살펴본 다음 해당 최종 확인 항목에 체크합니다.', '오른쪽 최종 확인 항목', { kind: 'check', check }, s.checks[check]));
  checks.push(task('finish', '정비 완료를 눌러 교육을 마치세요', '최종 확인 세 항목을 모두 체크한 뒤 정비 완료를 누릅니다. 결과가 이 브라우저에 저장됩니다.', '정비 완료 버튼', { kind: 'finish' }, s.status === 'completed'));
  const phases = [phase('prepare', '정비 준비', prep), phase('inspect', '네 모터 상태 판단', inspections), phase('repair', '필요한 부품 교체·체결', repairs, repairs.length ? '' : '상태를 판단하면 필요한 교체 작업이 이곳에 표시됩니다.'), phase('check', '최종 확인·교육 완료', checks)];
  phases[2].done = s.diagnosis && physicalIssues(s).length === 0;
  let current = prep.find(t => !t.done);
  if (!current && ui.zoomed) {
    current = inspections.find(t => t.motorId === ui.selected && !t.done)
      || repairs.find(t => t.motorId === ui.selected && !t.done);
  }
  current ||= inspections.find(t => !t.done) || repairs.find(t => !t.done) || checks.find(t => !t.done);
  if (current?.motorId && current.target.kind !== 'motor' && readyForMaintenance(s)) {
    const m = s.motors[current.motorId], p = PROFILE.motors.find(p => p.id === current.motorId);
    if ([...m.blades, ...m.screws].some(part => part.source === 'new' && !part.present)) {
      current = task('parts-exhausted', `${p.short}번 모터의 새 부품을 다시 준비해야 합니다`, '한 번 사용하고 분리한 날개·나사는 재사용할 수 없습니다. 계속 재작업하려면 다른 새 포장으로 날개 쌍과 나사를 모두 교체하세요. 처음부터 연습하려면 상단 다시 시작을 누릅니다.', '상단 다시 시작 · 새 부품 포장', { kind: 'restart' });
    } else if (['new-blade', 'new-screw'].includes(current.target.kind) && ui.kitId) {
      const kind = current.target.kind === 'new-blade' ? 'blade' : 'screw';
      const matchedBlade = m.blades[kind === 'blade' ? 1 - current.target.index : current.target.index];
      const expectedKit = matchedBlade.present && matchedBlade.source === 'new' ? matchedBlade.setId : null;
      if (kitById(ui.kitId)?.marked !== p.marked || (expectedKit && expectedKit !== ui.kitId) || s.used.includes(`${ui.kitId}-${kind}-${current.target.index}`)) {
        current = { ...current, id: `kit-${current.id}`, title: `${p.short}번 모터에 맞는 새 포장을 선택하세요`, detail: expectedKit ? `장착한 새 날개와 같은 ${expectedKit} 포장을 선택하세요. 두 날개와 새 나사는 같은 포장을 사용합니다.` : `기체의 ${p.marked ? 'Ⅱ 표식 있음' : '표식 없음'}과 일치하는 미사용 부품 포장을 선택합니다. 같은 모터에는 같은 포장의 두 날개와 새 나사를 사용합니다.`, targetLabel: '새 부품 포장 선택', target: { kind: 'kit' } };
      }
    }
  }
  const observed = inspections.filter(t => t.done).length;
  const checked = checks.slice(0, 3).filter(t => t.done).length;
  return { phases, current, remaining: phases.flatMap(p => p.tasks).filter(t => !t.done).length,
    summary: `모터 판단 ${observed}/4 · 최종 확인 ${checked}/3`,
    readyForFinal: readyForMaintenance(s) && observed === 4 && !physicalIssues(s).length,
    complete: s.status === 'completed' };
}

export function controllerGuide(s) {
  const p = s.practice;
  const tasks = [
    task('aircraft', '기체 전원을 켜세요', '3D 드론 몸체 위의 전원 표시를 누르세요. 켜지면 조종기 화면에 ‘기체 전원 켜짐’이 표시됩니다.', '드론의 기체 전원', { kind: 'controller-aircraft' }, p.aircraft),
    task('remote', '조종기 전원을 켜세요', '가상 조종기 위쪽의 ‘조종기 켜기’를 누르세요. 기체와 조종기의 전원이 모두 켜지면 연결할 수 있습니다.', '조종기 전원 버튼', { kind: 'controller-remote' }, p.remote),
    task('link', '드론과 조종기를 연결하세요', '두 스틱에서 손을 떼고 ‘드론과 연결’을 누르세요. 화면에 ‘연결됨’이 뜨면 왼쪽 스틱부터 시험합니다.', '조종기 화면의 연결 버튼', { kind: 'controller-link' }, p.link),
    task('left', '왼쪽 스틱 입력을 확인하세요', '왼쪽 둥근 손잡이를 위로 한 번 끌었다 놓으세요. 키보드로는 스틱을 선택한 뒤 ↑를 눌렀다 떼세요.', '왼쪽 앞뒤 이동 스틱 · ↑ ↓', { kind: 'controller-stick', side: 'left' }, p.left),
    task('right', '오른쪽 스틱 입력을 확인하세요', '이번에는 오른쪽 손잡이를 오른쪽으로 끌었다 놓으세요. 키보드로는 스틱을 선택한 뒤 →를 눌렀다 떼세요.', '오른쪽 회전 스틱 · ← →', { kind: 'controller-stick', side: 'right' }, p.right),
    task('stop', '동작 정지와 연결 해제를 확인하세요', '두 스틱에서 손을 떼고 조종기 아래의 ‘동작 정지’를 누르세요. 입력 시험이 끝나고 IMU 보정 버튼이 나타납니다.', '동작 정지 버튼 · Esc', { kind: 'controller-stop' }, p.stop),
  ];
  const complete = tasks.every(t => t.done);
  let current = complete ? task('controller-complete', '조종기 교육을 마쳤습니다', '전원·연결·좌우 스틱·정지 확인을 모두 수행했습니다. 다시 시작으로 반복할 수 있습니다.', '교육 선택 또는 다시 시작', { kind: 'course' }, true) : tasks.find(t => !t.done);
  if (!complete && !s.aircraftPower) current = tasks[0];
  else if (!complete && !s.remotePower) current = tasks[1];
  else if (!complete && !s.connected) current = tasks[2];
  return { current, phases: [phase('controller', '조종기 작동 확인', tasks)], remaining: tasks.filter(t => !t.done).length,
    summary: `작동 확인 ${tasks.filter(t => t.done).length}/6`, complete };
}
