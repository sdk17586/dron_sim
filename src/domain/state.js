import { PROFILE, motorProfile } from '../content/aircraft-profiles.js';
import { SCENARIO } from '../content/scenarios.js';
import { createBatteryPacks, installedBattery } from './battery.js';

function newAttemptId() {
  if (typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
  // LAN HTTP previews lack randomUUID, while getRandomValues is still available.
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createState(meta = {}) {
  const motors = Object.fromEntries(PROFILE.motors.map(m => [m.id, {
    inspected: false, verdict: null,
    blades: [0, 1].map(i => ({ id: `original-${m.id}-blade-${i}`, present: true,
      condition: m.id === SCENARIO.target && i === 0 ? 'damaged' : 'healthy',
      marked: m.marked, source: 'original', setId: `original-${m.id}` })),
    screws: [0, 1].map(i => ({ id: `original-${m.id}-screw-${i}`, present: true,
      source: 'original', setId: `original-${m.id}`, secured: true })),
  }]));
  return {
    meta: { attemptId: newAttemptId(), session: '훈련-01', trainee: '001', mode: 'guided',
      startedAt: new Date().toISOString(), ...meta },
    status: 'active', battery: true, batteryPacks: createBatteryPacks(), power: false, safetyConfirmed: false,
    motors, diagnosis: false, checks: { marks: false, count: false, fastening: false },
    discarded: [], used: [], errors: [], errorKeys: [], hints: 0, events: [], revision: 0,
  };
}

export const KITS = Object.freeze([true, false].flatMap(marked => [1, 2, 3, 4].map(n => ({
  id: `${marked ? 'A' : 'B'}${n}`, marked,
  name: `${marked ? '표식 있음' : '표식 없음'} · ${marked ? 'A' : 'B'}${n}`,
}))));
export const kitById = id => KITS.find(k => k.id === id);
export function readyForMaintenance(s) { return !s.power && !s.battery && s.safetyConfirmed; }
export function motorIssues(s, id) {
  const motor = s.motors[id], profile = motorProfile(id), issues = [];
  if (motor.blades.some(b => !b.present)) issues.push('날개 누락');
  if (motor.blades.some(b => b.present && b.condition !== 'healthy')) issues.push('손상 날개');
  if (motor.blades.some(b => b.present && b.marked !== profile.marked)) issues.push('표식 불일치');
  if (motor.screws.some(b => !b.present)) issues.push('나사 누락');
  if (motor.screws.some(b => b.present && !b.secured)) issues.push('체결 미확인');
  if (motor.blades.every(b => b.present) && motor.blades[0].setId !== motor.blades[1].setId) issues.push('다른 포장 혼용');
  if (id === SCENARIO.target && [...motor.blades, ...motor.screws].some(b => b.source !== 'new')) issues.push('교체 단위 미충족');
  return issues;
}
export function physicalIssues(s) {
  return PROFILE.motors.flatMap(m => motorIssues(s, m.id).map(issue => `${m.name}: ${issue}`));
}
export function completionIssues(s) {
  const issues = [];
  if (!readyForMaintenance(s)) issues.push('전원 차단 확인·배터리 분리');
  if (PROFILE.motors.some(m => !s.motors[m.id].inspected || s.motors[m.id].verdict !== (m.id === SCENARIO.target ? 'replace' : 'healthy'))) issues.push('네 모터의 관찰·상태 판단');
  if (!s.diagnosis) issues.push('교체 이유 확인');
  issues.push(...physicalIssues(s));
  if (!Object.values(s.checks).every(Boolean)) issues.push('최종 점검 3항목 확인');
  return issues;
}
export function stage(s) {
  if (!readyForMaintenance(s)) return 0;
  if (PROFILE.motors.some(m => !s.motors[m.id].verdict) || !s.diagnosis) return 1;
  if (physicalIssues(s).length) return 2;
  return 3;
}

export function transition(previous, action) {
  if (previous.status !== 'active') return { state: previous, feedback: { kind: 'info', message: '종료된 실습입니다. 새 실습을 시작하세요.' } };
  const s = structuredClone(previous);
  const log = (type, code) => {
    s.events.push({ type, code, motor: action.motorId || '', revision: s.revision });
    if (s.events.length > 200) s.events.shift();
  };
  const fail = (code, message) => {
    const key = `${s.revision}:${code}:${action.motorId || ''}:${action.index ?? ''}`;
    if (!s.errorKeys.includes(key)) {
      s.errorKeys.push(key); s.errors.push({ code, message }); log('error', code);
    }
    return { state: s, feedback: { kind: 'warning', code, message } };
  };
  const ok = message => {
    s.revision++; s.errorKeys = []; log('action', action.type);
    return { state: s, feedback: { kind: 'success', message } };
  };
  const invalidate = () => { s.checks = { marks: false, count: false, fastening: false }; };
  const motor = s.motors[action.motorId];
  const index = action.index;
  const mechanical = ['REMOVE_SCREW', 'REMOVE_BLADE', 'INSTALL_BLADE', 'INSTALL_SCREW', 'CONFIRM_FASTENING'];
  if (mechanical.includes(action.type)) {
    if (!readyForMaintenance(s)) return fail('unsafe', '먼저 전원 차단을 확인하고 배터리를 분리하세요.');
    if (!motor || ![0, 1].includes(index)) return fail('part', '선택한 부품을 확인하세요.');
    if (!motor.inspected) return fail('unobserved', '선택한 모터를 먼저 확대 점검하세요.');
    if (action.type.includes('SCREW') || action.type === 'CONFIRM_FASTENING') {
      if (action.tool !== 'driver') return fail('tool', '나사 작업에는 드라이버를 선택하세요.');
    }
  }
  switch (action.type) {
    case 'TOGGLE_POWER':
      if (!s.battery && !s.power) return fail('no-battery', '배터리가 분리되어 전원을 켤 수 없습니다.');
      if (!s.power && installedBattery(s)?.charge === 0) return fail('empty-battery', '배터리 잔량이 없습니다. 충전된 배터리로 교체하세요.');
      s.power = !s.power; s.safetyConfirmed = false; invalidate();
      return ok(s.power ? '전원이 켜졌습니다. 정비 전에는 전원을 꺼 주세요.' : '전원이 꺼졌습니다. 차단 상태를 확인하세요.');
    case 'CONFIRM_POWER':
      if (s.power) return fail('power-on', '기체 전원이 켜져 있습니다. 전원을 먼저 끄세요.');
      if (s.safetyConfirmed) return { state: previous, feedback: { kind: 'info', message: '이미 전원 차단을 확인했습니다.' } };
      s.safetyConfirmed = true; return ok('전원 차단을 확인했습니다.');
    case 'REMOVE_BATTERY':
    case 'INSTALL_BATTERY':
    case 'TOGGLE_BATTERY': {
      if (s.power) return fail('battery-live', '전원을 끈 다음 배터리를 분리하세요.');
      const install = action.type === 'INSTALL_BATTERY' || (action.type === 'TOGGLE_BATTERY' && !s.battery);
      if (install) {
        if (s.battery) return fail('battery-occupied', '장착된 배터리를 먼저 분리하세요.');
        if (action.type === 'INSTALL_BATTERY' && !action.batteryId) return fail('battery-part', '장착할 배터리를 다시 선택하세요.');
        const pack = action.batteryId ? s.batteryPacks.find(p => p.id === action.batteryId)
          : s.batteryPacks.find(p => p.location === 'tray') || s.batteryPacks.find(p => p.location === 'spare');
        if (!pack || !['tray', 'spare'].includes(pack.location)) return fail('battery-part', '장착할 배터리를 다시 선택하세요.');
        pack.location = 'installed'; s.battery = true; s.safetyConfirmed = false; invalidate();
        return ok(`${pack.name}를 장착했습니다. 잔량 ${pack.charge}%. 프로펠러 작업 전에는 다시 분리하세요.`);
      }
      const pack = installedBattery(s);
      if (!pack || (action.batteryId && pack.id !== action.batteryId)) return fail('battery-part', '현재 장착된 배터리를 다시 선택하세요.');
      pack.location = 'tray'; s.battery = false; invalidate();
      return ok('배터리를 분리했습니다. 보관한 배터리는 다시 장착할 수 있습니다.');
    }
    case 'SET_BATTERY_CHARGE': {
      const pack = installedBattery(s);
      if (!pack || (action.batteryId && action.batteryId !== pack.id)) return fail('battery-part', '기체에 배터리를 장착한 다음 잔량을 조절하세요.');
      if (!Number.isInteger(action.charge) || action.charge < 0 || action.charge > 100) return fail('battery-charge', '배터리 잔량은 0~100%로 설정하세요.');
      if (pack.charge === action.charge) return { state: previous, feedback: { kind: 'info', message: '같은 잔량입니다.' } };
      pack.charge = action.charge;
      if (pack.charge === 0 && s.power) { s.power = false; s.safetyConfirmed = false; invalidate(); }
      return ok(`연습용 배터리 잔량을 ${pack.charge}%로 설정했습니다.`);
    }
    case 'INSPECT_MOTOR':
      if (!readyForMaintenance(s)) return fail('unsafe', '전원 차단 확인과 배터리 분리 후 관찰을 시작하세요.');
      if (!motor) return fail('part', '모터를 선택하세요.');
      if (motor.inspected) return { state: previous, feedback: { kind: 'info', message: '확대 점검한 모터입니다. 상태를 판단해 주세요.' } };
      motor.inspected = true; return ok('날개 끝과 고정부를 살펴보고 상태를 판단하세요.');
    case 'ANSWER_DAMAGE': {
      if (!motor?.inspected) return fail('unobserved', '먼저 확대 점검을 선택해 부품을 관찰하세요.');
      const expected = action.motorId === SCENARIO.target ? 'replace' : 'healthy';
      if (action.answer !== expected) return fail('damage-answer', '확대 그림의 날개 끝과 균열을 다시 확인하세요.');
      if (motor.verdict === expected) return { state: previous, feedback: { kind: 'info', message: '상태 판단이 기록되어 있습니다.' } };
      motor.verdict = expected; return ok('상태 판단을 기록했습니다.');
    }
    case 'ANSWER_REASON':
      if (s.motors[SCENARIO.target].verdict !== 'replace') return fail('diagnosis-first', '손상된 모터의 상태를 먼저 판단하세요.');
      if (action.answer !== 'pair') return fail('reason', '한 모터의 두 날개와 나사를 같은 포장의 새 부품으로 교체합니다.');
      if (s.diagnosis) return { state: previous, feedback: { kind: 'info', message: '교체 이유를 확인했습니다.' } };
      s.diagnosis = true; return ok('교체 단위를 확인했습니다. 부품을 분리하고 새 세트를 선택하세요.');
    case 'REMOVE_SCREW':
      if (!motor.screws[index].present) return { state: previous, feedback: { kind: 'info', message: '이미 분리한 나사입니다.' } };
      s.discarded.push(motor.screws[index].id); motor.screws[index].present = false; motor.screws[index].secured = false; invalidate();
      return ok(`${index + 1}번 나사를 분리했습니다.`);
    case 'REMOVE_BLADE':
      if (!motor.blades[index].present) return { state: previous, feedback: { kind: 'info', message: '이미 분리한 날개입니다.' } };
      if (motor.screws[index].present) return fail('fixed-blade', '날개를 고정하는 나사를 먼저 분리하세요.');
      s.discarded.push(motor.blades[index].id); motor.blades[index].present = false; invalidate();
      return ok(`${index + 1}번 날개를 분리했습니다.`);
    case 'INSTALL_BLADE': {
      if (motor.blades[index].present) return fail('occupied', '기존 날개를 먼저 분리하세요.');
      const kit = kitById(action.kitId);
      if (!kit || kit.marked !== motorProfile(action.motorId).marked) return fail('wrong-mark', '기체와 새 날개의 표식이 다릅니다. 표식이 맞는 세트를 선택하세요.');
      const other = motor.blades[1 - index];
      if (other.present && other.source === 'new' && other.setId !== kit.id) return fail('mixed-kit', '같은 모터의 날개 두 개는 같은 포장 세트를 사용하세요.');
      const id = `${kit.id}-blade-${index}`;
      if (s.used.includes(id)) return fail('used-part', '이미 사용한 부품입니다. 새 포장 세트를 선택하세요.');
      motor.blades[index] = { id, present: true, condition: 'healthy', marked: kit.marked, source: 'new', setId: kit.id };
      s.used.push(id); invalidate(); return ok(`${index + 1}번 새 날개를 장착했습니다.`);
    }
    case 'INSTALL_SCREW': {
      if (motor.screws[index].present) return fail('occupied', '기존 나사를 먼저 분리하세요.');
      const blade = motor.blades[index], kit = kitById(action.kitId);
      if (!blade.present || blade.source !== 'new') return fail('blade-first', '새 날개를 먼저 장착하세요.');
      if (!kit || kit.id !== blade.setId) return fail('screw-kit', '날개와 같은 세트에 들어 있는 새 나사를 선택하세요.');
      const id = `${kit.id}-screw-${index}`;
      if (s.used.includes(id)) return fail('used-screw', '사용한 나사는 다시 사용할 수 없습니다. 새 세트로 교체하세요.');
      motor.screws[index] = { id, present: true, secured: false, source: 'new', setId: kit.id };
      s.used.push(id); invalidate(); return ok(`${index + 1}번 새 나사를 장착했습니다. 체결을 확인하세요.`);
    }
    case 'CONFIRM_FASTENING':
      if (!motor.blades[index].present || !motor.screws[index].present) return fail('missing-fastening', '날개와 나사를 먼저 장착하세요.');
      if (motor.screws[index].secured) return { state: previous, feedback: { kind: 'info', message: '이미 체결을 확인한 나사입니다.' } };
      motor.screws[index].secured = true; invalidate(); return ok(`${index + 1}번 나사의 체결을 확인했습니다.`);
    case 'CONFIRM_CHECK':
      if (!Object.hasOwn(s.checks, action.check)) return fail('check', '확인할 점검 항목을 선택하세요.');
      if (physicalIssues(s).length) return fail('physical-check', `장착 상태를 먼저 확인하세요. ${physicalIssues(s)[0]}`);
      if (!readyForMaintenance(s)) return fail('unsafe', '전원 차단 확인·배터리 분리 상태를 유지하세요.');
      if (s.checks[action.check]) return { state: previous, feedback: { kind: 'info', message: '이미 확인한 항목입니다.' } };
      s.checks[action.check] = true; return ok('최종 점검 항목을 확인했습니다.');
    case 'FINAL_INSPECTION': {
      const issues = completionIssues(s);
      if (issues.length) return fail('final-incomplete', `아직 완료되지 않았습니다. ${issues.join(' / ')}`);
      s.status = 'completed'; return ok('프로펠러 정비 과제를 완료했습니다.');
    }
    case 'HINT':
      s.hints++; log('hint', 'requested');
      return { state: s, feedback: { kind: 'info', message: SCENARIO.hints[Math.min(s.hints - 1, SCENARIO.hints.length - 1)] } };
    default: return { state: previous, feedback: { kind: 'info', message: '실행할 동작을 선택하세요.' } };
  }
}

export function buildResult(s, { endedAt = new Date().toISOString(), durationSeconds = 0, status } = {}) {
  return {
    schemaVersion: 1, attemptId: s.meta.attemptId, session: s.meta.session, trainee: s.meta.trainee,
    scenarioId: SCENARIO.id, contentVersion: SCENARIO.version, profileVersion: PROFILE.version,
    mode: s.meta.mode, startedAt: s.meta.startedAt, endedAt,
    durationSeconds: Math.max(0, Math.round(durationSeconds)), status: status || (s.status === 'completed' ? 'completed' : 'abandoned'),
    hints: s.hints, errors: s.errors, events: s.events,
  };
}
