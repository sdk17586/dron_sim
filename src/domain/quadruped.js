// A fictional bench-training robot. These are learning rules, not a service manual.
export const ROBOT_SCENARIO = 'quadruped-joint-v1';
export const ROBOT_LEGS = Object.freeze([
  { id: 'front-left', short: '01', name: '전방 왼쪽', x: -1, z: -1 },
  { id: 'front-right', short: '02', name: '전방 오른쪽', x: 1, z: -1 },
  { id: 'rear-left', short: '03', name: '후방 왼쪽', x: -1, z: 1 },
  { id: 'rear-right', short: '04', name: '후방 오른쪽', x: 1, z: 1 },
]);
export const robotLeg = id => ROBOT_LEGS.find(p => p.id === id);
export function chooseRobotFault(previous = '', random = Math.random) {
  const choices = ROBOT_LEGS.filter(p => p.id !== previous);
  return choices[Math.min(choices.length - 1, Math.max(0, Math.floor(random() * choices.length)))].id;
}
export function createRobotState({ targetLeg = chooseRobotFault(), session = '훈련-01', trainee = '001', active = false } = {}) {
  if (!robotLeg(targetLeg)) throw new Error('지원하지 않는 다리입니다.');
  return { status: active ? 'active' : 'ready', targetLeg, power: true, estop: false, battery: true,
    supported: false, prepared: false, spareAvailable: true, testing: false, tested: false,
    legs: Object.fromEntries(ROBOT_LEGS.map(p => [p.id, { inspected: false, verdict: null,
      present: true, source: 'original', condition: p.id === targetLeg ? 'damaged' : 'healthy',
      bolts: [true, true], connected: true }])),
    meta: { attemptId: Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-'), session, trainee, startedAt: new Date().toISOString() },
    errors: [], events: [], revision: 0 };
}
export const robotIsolated = s => s.estop && !s.power && !s.battery && s.supported;
export const robotAssembled = s => ROBOT_LEGS.every(p => {
  const leg = s.legs[p.id];
  return leg.present && leg.condition === 'healthy' && leg.bolts.every(Boolean) && leg.connected;
});
export const robotDiagnosed = s => ROBOT_LEGS.every(p => s.legs[p.id].inspected && s.legs[p.id].verdict === (p.id === s.targetLeg ? 'replace' : 'healthy'));
export const robotCanTest = s => s.status === 'active' && s.supported && s.battery && s.power && !s.estop && robotAssembled(s) && robotDiagnosed(s);

export function robotTransition(original, action) {
  if (original.status !== 'active') return { state: original, feedback: { kind: 'info', message: '실습을 시작한 뒤 조작하세요.' } };
  const s = structuredClone(original), leg = robotLeg(action.legId) ? s.legs[action.legId] : null;
  const reject = message => {
    if (s.errors.length < 1000) s.errors.push({ code: action.type || 'UNKNOWN', message });
    return { state: s, feedback: { kind: 'warning', message } };
  };
  const mechanical = ['CONNECTOR', 'DRIVER', 'REMOVE_MODULE', 'INSTALL_MODULE'];
  if (mechanical.includes(action.type)) {
    if (!robotIsolated(s)) return reject('비상 정지·주 전원 차단·배터리 분리·정비 받침대를 먼저 확인하세요.');
    if (!leg || leg.verdict !== 'replace') return reject('확대 점검 후 교체가 필요한 다리를 직접 판단하세요.');
  }
  let message = '';
  switch (action.type) {
    case 'ESTOP':
      if (s.estop && (!s.power || !s.battery || !s.supported || !robotAssembled(s) || !robotDiagnosed(s))) return reject('교체·체결·연결과 네 다리 점검 후 배터리와 주 전원을 복구해야 비상 정지를 해제할 수 있습니다.');
      s.estop = !s.estop; s.testing = false;
      message = s.estop ? '비상 정지를 걸었습니다. 관절 움직임이 차단됩니다.' : '비상 정지를 해제했습니다. 받침대 위에서 관절 시험을 실행하세요.'; break;
    case 'POWER':
      if (!s.power && (!s.battery || !s.supported || !s.estop || !robotAssembled(s) || !robotDiagnosed(s))) return reject('받침대와 비상 정지를 유지하고, 교체·체결·연결·배터리를 확인한 뒤 전원을 켜세요.');
      s.power = !s.power; s.testing = false;
      message = s.power ? '주 전원을 켰습니다. 시험하려면 비상 정지를 해제하세요.' : '주 전원을 차단했습니다.'; break;
    case 'SUPPORT':
      if (s.power || !s.estop) return reject('비상 정지와 주 전원 차단 후 정비 받침대를 설치하세요.');
      s.supported = true; message = '정비 받침대를 설치했습니다. 모듈을 분리해도 몸체가 지지됩니다.'; break;
    case 'REMOVE_BATTERY':
      if (s.power || !s.estop) return reject('비상 정지를 걸고 주 전원을 끈 뒤 배터리를 분리하세요.');
      if (!s.battery) return reject('배터리는 이미 분리되어 있습니다.');
      s.battery = false; s.testing = false; s.tested = false; message = '배터리를 분리했습니다.'; break;
    case 'INSTALL_BATTERY':
      if (s.battery) return reject('배터리가 이미 장착되어 있습니다.');
      if (s.power || !s.estop || !s.supported || !robotAssembled(s) || !robotDiagnosed(s)) return reject('네 다리의 판단·교체·볼트 체결·커넥터 연결을 마친 뒤 배터리를 복구하세요.');
      s.battery = true; message = '배터리를 복구했습니다. 받침대 위에서 주 전원을 켜세요.'; break;
    case 'INSPECT':
      if (!robotIsolated(s)) return reject('정비 준비를 마친 뒤 다리 관절을 점검하세요.');
      if (!leg) return reject('점검할 다리를 선택하세요.');
      leg.inspected = true; message = `${robotLeg(action.legId).name} 관절을 확대했습니다. 하우징과 연결부를 살펴보세요.`; break;
    case 'DIAGNOSE':
      if (!robotIsolated(s) || !leg?.inspected) return reject('정비 준비 후 해당 다리를 먼저 확대 점검하세요.');
      if (action.answer !== (action.legId === s.targetLeg ? 'replace' : 'healthy')) return reject('하우징의 균열과 변형을 다시 관찰해 상태를 판단하세요.');
      leg.verdict = action.answer; message = '다리의 상태 판단을 기록했습니다.'; break;
    case 'CONNECTOR':
      if (!leg.present) return reject('새 관절 모듈을 먼저 장착하세요.');
      if (!leg.connected && (leg.source !== 'new' || !leg.bolts.every(Boolean))) return reject('새 모듈의 볼트 두 개를 모두 체결한 뒤 커넥터를 연결하세요.');
      leg.connected = !leg.connected; s.tested = false;
      message = leg.connected ? '커넥터를 연결했습니다.' : '모듈 커넥터를 분리했습니다.'; break;
    case 'DRIVER':
      if (![0, 1].includes(action.index)) return reject('볼트 번호를 확인하세요.');
      if (!leg.present || leg.connected) return reject('모듈이 장착된 상태에서 커넥터를 먼저 분리하세요.');
      if (leg.source === 'original') {
        if (!leg.bolts[action.index]) return reject('이미 분리한 볼트입니다.');
        leg.bolts[action.index] = false; message = `${action.index + 1}번 볼트를 분리했습니다.`;
      } else {
        if (leg.bolts[action.index]) return reject('이미 체결한 볼트입니다.');
        leg.bolts[action.index] = true; message = `${action.index + 1}번 새 볼트를 체결했습니다.`;
      }
      s.tested = false; break;
    case 'REMOVE_MODULE':
      if (!leg.present || leg.source !== 'original') return reject('기존 손상 모듈만 수거함으로 분리할 수 있습니다.');
      if (leg.connected || leg.bolts.some(Boolean)) return reject('커넥터와 볼트 두 개를 먼저 분리하세요.');
      leg.present = false; s.tested = false; message = '손상 관절 모듈을 분리했습니다. 3D 모델의 빈 장착부를 확인하세요.'; break;
    case 'INSTALL_MODULE':
      if (leg.present) return reject('기존 모듈을 먼저 분리하세요.');
      if (action.moduleId !== 'QJ-01') return reject('규격이 다릅니다. 장착부와 같은 QJ-01 모듈을 선택하세요.');
      if (!s.spareAvailable) return reject('새 모듈은 이미 사용했습니다.');
      Object.assign(leg, { present: true, source: 'new', condition: 'healthy', bolts: [false, false], connected: false });
      s.spareAvailable = false; s.tested = false; message = '새 관절 모듈을 장착했습니다. 포함된 새 볼트를 공구로 각각 체결하세요.'; break;
    case 'START_TEST':
      if (!robotCanTest(s)) return reject('받침대·네 다리 점검·모듈 교체·체결·연결·전원 복구를 확인하세요.');
      if (s.testing || s.tested) return reject('관절 시험이 진행 중이거나 이미 완료되었습니다.');
      s.testing = true; message = '받침대에서 관절 시험 중입니다. 실제 보행 물리가 아닌 가상 점검 동작입니다.'; break;
    case 'FINISH_TEST':
      if (!s.testing || !robotCanTest(s)) return reject('관절 시험이 중단되었습니다. 시험 조건을 복구한 뒤 다시 실행하세요.');
      s.testing = false; s.tested = true; message = '네 다리의 가상 관절 시험을 마쳤습니다. 비상 정지와 주 전원 차단으로 마무리하세요.'; break;
    case 'CANCEL_TEST':
      s.testing = false; message = '관절 시험을 중단했습니다. 다시 실행해야 완료로 기록됩니다.'; break;
    case 'COMPLETE':
      if (!s.tested || s.testing || s.power || !s.estop || !s.supported || !robotAssembled(s) || !robotDiagnosed(s)) return reject('관절 시험을 마치고 비상 정지·주 전원 차단을 확인하세요.');
      s.status = 'completed'; message = '사족보행 로봇 정비 교육을 마쳤습니다.'; break;
    default: return reject('지원하지 않는 로봇 조작입니다.');
  }
  if (robotIsolated(s)) s.prepared = true;
  s.revision++;
  if (s.events.length < 200) s.events.push({ type: 'action', code: action.type, motor: action.legId || '', revision: s.revision });
  return { state: s, feedback: { kind: 'success', message } };
}

export function placeRobotPart(s, piece, target) {
  if (!piece || !target) return { state: s, feedback: { kind: 'info', message: '이동을 취소했습니다.' } };
  const common = { legId: target.legId, index: target.index };
  if (piece.kind === 'robot-support' && target.kind === 'robot-support-slot') return robotTransition(s, { type: 'SUPPORT' });
  if (piece.kind === 'robot-battery' && target.kind === 'robot-discard') return robotTransition(s, { type: 'REMOVE_BATTERY' });
  if (piece.kind === 'robot-stored-battery' && target.kind === 'robot-battery-slot') return robotTransition(s, { type: 'INSTALL_BATTERY' });
  if (piece.kind === 'robot-driver' && target.kind === 'robot-bolt') return robotTransition(s, { type: 'DRIVER', ...common });
  if (piece.kind === 'robot-mounted-module' && target.kind === 'robot-discard') return robotTransition(s, { type: 'REMOVE_MODULE', legId: piece.legId });
  if (piece.kind === 'robot-module' && target.kind === 'robot-module-slot') return robotTransition(s, { type: 'INSTALL_MODULE', ...common, moduleId: piece.moduleId });
  return { state: s, feedback: { kind: 'warning', message: '이 부품은 해당 자리에 놓을 수 없습니다. 규격과 조작 대상을 확인하세요.' } };
}

export function buildRobotResult(s, { status = s.status, durationSeconds = 0 } = {}) {
  return { schemaVersion: 1, ...s.meta, mode: 'guided', scenarioId: ROBOT_SCENARIO, contentVersion: '0.1.0', profileVersion: 'virtual-quadruped-1',
    endedAt: new Date().toISOString(), durationSeconds: Math.min(604800, Math.max(0, Math.round(durationSeconds))),
    status, hints: 0, errors: structuredClone(s.errors), events: structuredClone(s.events) };
}

export function robotGuide(s, selected = '') {
  const t = (id, title, detail, targetLabel, selector, done, legId = '', destination = '') => ({ id, title, detail, targetLabel, done: Boolean(done), legId, target: { kind: 'robot', selector, destination } });
  const prep = [
    t('robot-estop', '먼저 비상 정지를 걸어주세요', '정비 중 다리가 움직이지 않도록 멈춥니다. 3D 로봇 몸체 위의 빨간 비상 정지 버튼을 직접 누르세요.', '몸체 위 · 빨간 비상 정지 버튼', '[data-action=robot-estop]', s.prepared || s.estop),
    t('robot-power-off', '이제 주 전원을 꺼주세요', '비상 정지를 걸었습니다. 빨간 버튼 옆 몸체의 작은 전원 버튼을 직접 눌러 전원을 차단하세요.', '몸체 위 · 작은 주 전원 버튼', '[data-action=robot-power]', s.prepared || !s.power),
    t('robot-support', '로봇을 받침대로 지지하세요', '관절을 분리해도 몸체가 내려앉지 않도록 합니다. 3D 작업대의 받침대를 집어 몸체 아래 파란색 고리로 옮기세요.', '로봇 화면 위 · 받침대 설치', '[data-action=robot-support]', s.supported),
    t('robot-battery-out', '마지막으로 배터리를 분리하세요', '몸체 뒤쪽의 배터리를 집어 3D 작업대의 수거함으로 옮기세요. 클릭해서 집고 수거함을 클릭해도 됩니다.', '몸체 뒤쪽 배터리 → 3D 수거함', '.robot-battery', s.prepared || !s.battery, '', '.robot-tray'),
  ];
  const inspections = ROBOT_LEGS.map(p => t(`robot-inspect-${p.id}`, `${p.short}번 다리의 상태를 판단하세요`, s.legs[p.id].inspected ? '확대한 관절 덮개의 균열·변형을 살펴보고 ‘정상’ 또는 ‘교체 필요’를 선택하세요. 네 다리를 모두 점검한 뒤 교체합니다.' : `${p.short}번 다리 관절을 직접 눌러 가까이 보세요. 균열·변형을 살펴보고 ‘정상’ 또는 ‘교체 필요’를 선택합니다.`, `${p.short}번 · ${p.name} 다리`, '.robot-verdicts', s.legs[p.id].verdict, p.id));
  const repair = [];
  for (const p of ROBOT_LEGS.filter(p => s.legs[p.id].verdict === 'replace')) {
    const l = s.legs[p.id], fresh = l.source === 'new';
    repair.push(t(`robot-disconnect-${p.id}`, '먼저 관절의 커넥터를 분리하세요', `${p.short}번 다리를 교체할 차례입니다. 확대한 관절 위쪽의 작은 커넥터를 직접 눌러 빼세요.`, '관절 위쪽 · 커넥터', '[data-action=robot-connector]', fresh || !l.connected, p.id));
    for (const i of [0, 1]) repair.push(t(`robot-unbolt-${p.id}-${i}`, `${p.short}번 관절의 ${i + 1}번 볼트를 분리하세요`, '3D 작업대의 육각 공구를 집어 관절의 해당 볼트에 대세요.', `육각 공구 → 볼트 ${i + 1}`, '.robot-driver', fresh || !l.bolts[i], p.id, `[data-robot-bolt="${i}"]`));
    repair.push(t(`robot-remove-${p.id}`, '손상 관절 모듈을 수거함으로 옮기세요', '커넥터와 두 볼트를 분리한 뒤 모듈을 집어 수거함에 놓습니다.', '관절 모듈 → 수거함', '.robot-module-slot', fresh || !l.present, p.id, '.robot-tray'));
    repair.push(t(`robot-install-${p.id}`, '규격이 맞는 새 모듈을 장착하세요', '장착부와 같은 QJ-01을 선택한 뒤 빈 장착부에 놓습니다.', '새 QJ-01 모듈 → 빈 장착부', s.moduleChoice === 'QJ-02' ? '#robot-module-type' : '.robot-spare-module', fresh && l.present, p.id, '.robot-module-slot'));
    for (const i of [0, 1]) repair.push(t(`robot-fasten-${p.id}-${i}`, `${i + 1}번 새 볼트를 체결하세요`, '모듈을 놓기만 하면 체결되지 않습니다. 공구를 각 볼트 위에 놓으세요.', `육각 공구 → 새 볼트 ${i + 1}`, '.robot-driver', fresh && l.bolts[i], p.id, `[data-robot-bolt="${i}"]`));
    repair.push(t(`robot-connect-${p.id}`, '모듈 커넥터를 연결하세요', '새 볼트 두 개를 체결한 뒤 커넥터를 연결합니다.', '모듈 커넥터', '[data-action=robot-connector]', fresh && l.connected, p.id));
  }
  const final = [
    t('robot-battery-in', '교체를 마쳤습니다. 배터리를 넣어주세요', '수거함에 보관한 배터리를 몸체 뒤쪽의 빈 배터리 자리로 옮기세요. 받침대는 그대로 둡니다.', '3D 작업대 배터리 → 몸체 뒤쪽 빈 자리', '.robot-stored-battery', s.tested || (s.prepared && s.battery), '', '.robot-battery'),
    t('robot-test-power', '주 전원을 켜서 시험을 준비하세요', '배터리를 다시 장착했습니다. 몸체 위의 작은 전원 버튼을 직접 누르세요. 받침대와 비상 정지는 유지합니다.', '몸체 위 · 작은 주 전원 버튼', '[data-action=robot-power]', s.tested || (s.prepared && s.power)),
    t('robot-release-stop', '비상 정지를 해제하세요', '받침대 위에서 움직임을 확인하기 위해 비상 정지를 해제합니다.', '비상 정지 버튼', '[data-action=robot-estop]', s.tested || (s.prepared && !s.estop)),
    t('robot-test', s.testing ? '네 다리 관절 시험 중입니다' : '관절 시험을 실행하세요', s.testing ? '가상 점검 동작이 끝날 때까지 기다리세요. 비상 정지로 중단할 수 있습니다.' : '관절 시험을 눌러 네 다리의 움직임을 확인합니다. 보행·균형 물리는 모사하지 않습니다.', '관절 시험', '[data-action=robot-test]', s.tested),
    t('robot-final-stop', '시험 후 비상 정지를 거세요', '움직임 확인 후 비상 정지를 다시 겁니다.', '비상 정지', '[data-action=robot-estop]', s.tested && s.estop),
    t('robot-final-power', '주 전원을 끄고 마무리하세요', '주 전원을 끈 뒤 정비 완료를 누릅니다.', '주 전원', '[data-action=robot-power]', s.tested && !s.power),
    t('robot-finish', '정비 완료를 눌러 교육을 마치세요', '완료 결과와 실수 기록은 훈련 기록에서 확인하고 CSV로 보관할 수 있습니다.', '정비 완료', '[data-action=robot-complete]', s.status === 'completed'),
  ];
  const phases = [{ id: 'robot-prep', title: '전원 차단·몸체 지지', tasks: prep }, { id: 'robot-inspection', title: '네 다리 관절 점검', tasks: inspections },
    { id: 'robot-repair', title: '관절 모듈 교체·체결', tasks: repair, note: repair.length ? '' : '교체가 필요한 다리를 판단하면 세부 작업이 표시됩니다.' }, { id: 'robot-final', title: '관절 시험·마무리', tasks: final }];
  let current = prep.find(v => !v.done)
    || inspections.find(v => v.legId === selected && !v.done) || inspections.find(v => !v.done)
    || repair.find(v => v.legId === selected && !v.done) || repair.find(v => !v.done) || final.find(v => !v.done);
  const complete = s.status === 'completed';
  if (complete) current = t('robot-completed', '사족보행 로봇 정비 교육 완료', '네 다리 점검·모듈 교체·체결·관절 시험을 수행했습니다.', '다시 시작 또는 훈련 기록', '', true);
  const phaseIndex = complete ? 3 : Math.max(0, phases.findIndex(p => p.tasks.some(v => v.id === current?.id)));
  const workflow = ['안전 준비', '네 다리 점검', '모듈 교체', '작동 확인'].map((label, index) => ({ label, state: complete || index < phaseIndex ? 'done' : index === phaseIndex ? 'current' : 'pending' }));
  const pending = phases.flatMap(p => p.tasks).filter(v => !v.done);
  const upNext = pending.find(v => v.id !== current?.id);
  return { current, phases, complete, workflow, phaseIndex, upNext, remaining: pending.length,
    inputHelp: current?.target.destination ? '끌어 놓거나, 부품을 클릭해 집고 놓을 자리를 클릭하세요 · 취소: Esc' : '3D 모델에서 파란색으로 점멸하는 곳이 다음 조작 대상입니다 · 부품·공구를 직접 집어보세요',
    summary: phaseIndex === 0 ? `안전 준비 ${prep.filter(v => v.done).length}/4` : `다리 판단 ${inspections.filter(v => v.done).length}/4 · 관절 시험 ${s.tested ? '완료' : '미완료'}` };
}
