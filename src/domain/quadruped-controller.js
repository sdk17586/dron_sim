// Fictional Q-TRAIN console: bounded visual movement, independent of maintenance.
// No radio, hardware interface, gait solver, or manufacturer control procedure.
export const ROBOT_DRIVE_LIMIT = 2.4;
const centered = () => ({ left: { x: 0, y: 0 }, right: { x: 0, y: 0 } });
export const createRobotControllerState = () => ({
  robotPower: false, remotePower: false, connected: false, estop: true,
  sticks: centered(), pose: { x: 0, z: 0, yaw: 0, phase: 0 }, boundary: false, moving: false,
  practice: { robot: false, remote: false, link: false, release: false, move: false, turn: false, stop: false, estop: false },
});
export const robotSticksNeutral = s => Object.values(s.sticks).every(p => Math.hypot(p.x, p.y) <= .08);
const axis = value => Math.abs(value) <= .08 ? 0 : Math.sign(value) * (Math.abs(value) - .08) / .92;
export function robotDriveDemand(s) {
  if (!s.robotPower || !s.remotePower || !s.connected || s.estop) return { x: 0, z: 0, turn: 0, active: false };
  const x = axis(s.sticks.left.x), z = -axis(s.sticks.left.y), turn = -axis(s.sticks.right.x);
  return { x, z, turn, active: Boolean(x || z || turn) };
}
export function robotConnectionLabel(s) {
  if (!s.remotePower) return '조종기 전원 꺼짐';
  if (!s.robotPower) return '로봇 전원 꺼짐';
  if (!s.connected) return '미연결';
  return s.estop ? '연결됨 · 비상 정지 중' : '연결됨 · 조작 가능';
}
export function robotControllerTransition(s, a) {
  switch (a.type) {
    case 'ROBOT_POWER': case 'REMOTE_POWER': {
      const field = a.type === 'ROBOT_POWER' ? 'robotPower' : 'remotePower';
      const step = a.type === 'ROBOT_POWER' ? 'robot' : 'remote';
      return { ...s, [field]: !s[field], connected: false, estop: true, sticks: centered(), boundary: false,
        practice: { ...s.practice, [step]: s.practice[step] || !s[field] } };
    }
    case 'LINK':
      if (s.connected) return { ...s, connected: false, estop: true, sticks: centered(), boundary: false };
      if (!s.robotPower || !s.remotePower || !robotSticksNeutral(s)) return s;
      return { ...s, connected: true, estop: true, sticks: centered(), practice: { ...s.practice, link: true } };
    case 'ESTOP':
      if (!s.estop) return robotControllerTransition(s, { type: 'EMERGENCY_STOP' });
      if (s.estop && (!s.connected || !s.robotPower || !s.remotePower || !robotSticksNeutral(s))) return s;
      return { ...s, estop: !s.estop, sticks: centered(), boundary: false,
        practice: { ...s.practice, release: true } };
    case 'EMERGENCY_STOP':
      return { ...s, estop: true, sticks: centered(), boundary: false,
        practice: { ...s.practice, estop: s.practice.estop || s.practice.stop } };
    case 'STICK': {
      if (!['left', 'right'].includes(a.side) || !Number.isFinite(a.x) || !Number.isFinite(a.y)) return s;
      const y = a.side === 'right' ? 0 : a.y, length = Math.max(1, Math.hypot(a.x, y));
      return { ...s, sticks: { ...s.sticks, [a.side]: { x: a.x / length, y: y / length } } };
    }
    case 'TICK': {
      if (!Number.isFinite(a.seconds) || a.seconds <= 0) return s;
      const d = robotDriveDemand(s); if (!d.active) return s;
      const dt = Math.min(.1, a.seconds), { x, z, yaw } = s.pose;
      const nextYaw = Math.atan2(Math.sin(yaw + d.turn * dt), Math.cos(yaw + d.turn * dt));
      const rawX = x + (d.x * Math.cos(yaw) + d.z * Math.sin(yaw)) * dt * .9;
      const rawZ = z + (-d.x * Math.sin(yaw) + d.z * Math.cos(yaw)) * dt * .9;
      const limit = v => Math.max(-ROBOT_DRIVE_LIMIT, Math.min(ROBOT_DRIVE_LIMIT, v));
      const nx = limit(rawX), nz = limit(rawZ), moved = Math.hypot(nx - x, nz - z) > 1e-6;
      const turned = Math.abs(nextYaw - yaw) > 1e-6;
      return { ...s, moving: moved || turned, pose: { x: nx, z: nz, yaw: nextYaw, phase: s.pose.phase + (moved || turned ? dt * 7 : 0) },
        boundary: rawX !== nx || rawZ !== nz,
        practice: { ...s.practice, move: s.practice.move || moved, turn: s.practice.turn || turned } };
    }
    case 'CENTER': return { ...s, sticks: centered(), boundary: false };
    case 'STOP':
      return { ...s, connected: false, sticks: centered(), boundary: false,
        practice: { ...s.practice, stop: s.practice.stop || (s.practice.move && s.practice.turn) } };
    case 'SUSPEND': return { ...s, connected: false, estop: true, sticks: centered(), boundary: false };
    case 'RESET': return createRobotControllerState();
    default: return s;
  }
}

export function robotControllerGuide(s) {
  const task = (id, title, detail, targetLabel, selector, done) => ({ id: `robot-control-${id}`, title, detail, targetLabel, target: { kind: 'robot', selector }, done });
  const tasks = [
    task('robot', '로봇 전원을 켜세요', '3D 화면 위의 로봇 전원을 누릅니다.', '로봇 전원 버튼', '[data-action="robot-controller-power"]', s.practice.robot),
    task('remote', '조종기 전원을 켜세요', '조종기 오른쪽 위 둥근 전원 버튼을 누릅니다.', '조종기 전원 버튼', '[data-action="robot-controller-remote"]', s.practice.remote),
    task('link', '로봇과 가상 연결하세요', '양쪽 전원을 켜고 두 스틱을 중앙에 둔 뒤 연결을 누릅니다.', '조종기 화면의 연결 버튼', '[data-action="robot-controller-link"]', s.practice.link),
    task('release', '비상 정지를 해제하세요', '연결 상태와 스틱 중립을 확인하고 비상 정지 해제를 누릅니다.', '조종기 아래 비상 정지 해제', '[data-action="robot-controller-estop"]', s.practice.release),
    task('move', '왼쪽 스틱으로 로봇을 움직여 보세요', '로봇의 앞을 기준으로 전후·좌우 이동합니다. 스틱을 끌거나 방향키를 누르고, 놓으면 멈춥니다.', '왼쪽 이동 스틱', '[data-stick="left"]', s.practice.move),
    task('turn', '오른쪽 스틱으로 방향을 바꿔 보세요', '오른쪽 스틱을 좌우로 움직여 제자리 회전을 확인합니다. 로봇 앞쪽의 화살표도 함께 회전합니다.', '오른쪽 회전 스틱 · ← →', '[data-stick="right"]', s.practice.turn),
    task('stop', '동작 정지와 연결 해제를 확인하세요', '스틱을 놓은 뒤 동작 정지를 누릅니다. 다시 움직이려면 연결·비상 정지 해제를 다시 수행합니다.', '동작 정지 버튼', '[data-action="robot-controller-stop"]', s.practice.stop),
    task('estop', '비상 정지를 걸어 교육을 마치세요', '비상 정지를 누르거나 Esc를 눌러 움직임 차단을 확인합니다.', '비상 정지 버튼 · Esc', '[data-action="robot-controller-estop"]', s.practice.estop),
  ];
  const complete = tasks.every(t => t.done);
  let current = tasks.find(t => !t.done);
  if (!complete && !s.practice.stop) {
    if (!s.robotPower) current = tasks[0];
    else if (!s.remotePower) current = tasks[1];
    else if (!s.connected) current = tasks[2];
    else if (s.estop) current = tasks[3];
  }
  if (complete) current = task('complete', '로봇 조종기 교육을 마쳤습니다', '전원·연결·이동·회전·정지·비상 정지를 확인했습니다. 다시 시작으로 반복할 수 있습니다.', '교육 선택 또는 다시 시작', 'header [data-action="robot-controller-restart"]', true);
  return { current, inputHelp: '스틱을 끌어 조작 · 놓으면 정지 · Esc: 비상 정지', phases: [{ id: 'robot-controller', title: '로봇 조종기 작동 확인', tasks }], complete,
    remaining: tasks.filter(t => !t.done).length, summary: `작동 확인 ${tasks.filter(t => t.done).length}/8` };
}
