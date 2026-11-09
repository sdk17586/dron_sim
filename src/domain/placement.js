import { transition } from './state.js';
import { installedBattery } from './battery.js';

// Translate a deliberate placement into the same validated maintenance actions.
export function placePart(state, piece, target) {
  const reject = message => ({ state, feedback: { kind: 'warning', message } });
  if (!state || state.status !== 'active') return reject('실습을 먼저 시작하세요.');
  if (!piece || !target) return reject('부품을 놓을 자리를 선택하세요.');
  const run = (type, payload = {}) => transition(state, {
    type, motorId: target.motorId, index: target.index, tool: 'hand', kitId: piece.kitId, ...payload,
  });
  if (piece.kind === 'battery') {
    if (target.kind !== 'discard' || !state.battery) return reject('배터리를 수거함에 놓아 분리하세요.');
    if (piece.batteryId && installedBattery(state)?.id !== piece.batteryId) return reject('현재 장착된 배터리를 다시 선택하세요.');
    return run('REMOVE_BATTERY', { batteryId: piece.batteryId });
  }
  if (piece.kind === 'battery-pack') {
    if (target.kind !== 'battery-slot') return reject('배터리를 기체의 빈 배터리 자리에 놓으세요.');
    return run('INSTALL_BATTERY', { batteryId: piece.batteryId });
  }
  if (piece.kind === 'mounted-blade') {
    const blade = state.motors[piece.motorId]?.blades[piece.index];
    if (!blade?.present || blade.id !== piece.partId) return reject('현재 장착된 날개를 다시 선택하세요.');
    if (target.kind !== 'discard') return reject('분리할 날개를 수거함에 놓으세요.');
    return run('REMOVE_BLADE', { motorId: piece.motorId, index: piece.index });
  }
  if (piece.kind === 'driver') {
    if (target.kind !== 'screw') return reject('드라이버를 나사 위에 놓으세요.');
    const screw = state.motors[target.motorId]?.screws[target.index];
    return run(screw?.present && screw.secured ? 'REMOVE_SCREW' : 'CONFIRM_FASTENING', { tool: 'driver' });
  }
  if (!['blade', 'screw'].includes(piece.kind) || target.kind !== piece.kind) {
    return reject('부품과 맞는 자리에 놓으세요.');
  }
  if (piece.index !== target.index) return reject(`${piece.index + 1}번 부품을 같은 번호의 자리에 놓으세요.`);
  const placed = run(piece.kind === 'blade' ? 'INSTALL_BLADE' : 'INSTALL_SCREW', { tool: piece.kind === 'screw' ? 'driver' : 'hand' });
  // Choosing and installing a replacement from a complete kit records the
  // replacement-unit lesson; the physical rules still require both blades and screws.
  if (piece.kind === 'blade' && placed.feedback.kind === 'success'
    && placed.state.motors[target.motorId].verdict === 'replace' && !placed.state.diagnosis) {
    placed.state = transition(placed.state, { type: 'ANSWER_REASON', answer: 'pair' }).state;
  }
  return placed;
}
