// Teaching sequence and shortened dwell times belong to this simulator, not a DJI firmware procedure.
export const IMU_HOLD_MS = 3000;
export const IMU_POSES = Object.freeze([
  { id: 'level', label: '바르게 놓기', instruction: '다리가 아래로 향하도록 바르게 놓으세요.', rotation: [0, 0, 0] },
  { id: 'left', label: '왼쪽 면으로 놓기', instruction: '기체 왼쪽 면이 아래로 향하도록 옆으로 돌리세요.', rotation: [0, 0, Math.PI / 2] },
  { id: 'right', label: '오른쪽 면으로 놓기', instruction: '기체 오른쪽 면이 아래로 향하도록 반대쪽으로 돌리세요.', rotation: [0, 0, -Math.PI / 2] },
  { id: 'nose-up', label: '앞부분을 위로 세우기', instruction: '카메라가 있는 앞부분을 위로 향하게 세우세요.', rotation: [Math.PI / 2, 0, 0] },
  { id: 'nose-down', label: '앞부분을 아래로 놓기', instruction: '카메라가 있는 앞부분을 아래로 향하게 돌리세요.', rotation: [-Math.PI / 2, 0, 0] },
  { id: 'inverted', label: '뒤집어 놓기', instruction: '기체 윗면이 아래로 향하도록 뒤집으세요.', rotation: [Math.PI, 0, 0] },
].map(Object.freeze));

export function createIMUState({ batteryCharge = 100 } = {}) {
  return { attempt: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    surface: false, power: false, linked: false, batteryCharge, status: 'idle', pose: 'level',
    moving: false, stableMs: 0, samples: [], pauseReason: '' };
}
export const requiredIMUPose = s => IMU_POSES.find(p => !s.samples.includes(p.id)) || null;
export const imuCanStart = s => s.surface && s.power && s.linked && s.batteryCharge >= 50;

export function imuTransition(state, action) {
  const s = { ...state, samples: [...state.samples] };
  switch (action.type) {
    case 'SURFACE': s.surface = true; break;
    case 'POWER':
      s.power = !s.power; s.linked = false; s.stableMs = 0; s.moving = false;
      if (!s.power) { s.status = 'idle'; s.samples = []; s.pauseReason = ''; }
      break;
    case 'LINK':
      if (s.surface && s.power && s.batteryCharge >= 50) s.linked = true;
      break;
    case 'START':
      if (imuCanStart(s) && ['idle', 'paused'].includes(s.status)) {
        s.status = 'calibrating'; s.stableMs = 0; s.pauseReason = ''; s.moving = false;
      }
      break;
    case 'MOVE_BEGIN': s.moving = true; s.stableMs = 0; break;
    case 'POSE':
      if (!IMU_POSES.some(p => p.id === action.pose)) break;
      if (s.pose !== action.pose || s.moving) s.stableMs = 0;
      s.pose = action.pose; s.moving = false; break;
    case 'TICK': {
      // Never credit elapsed time from a hidden tab, a stalled renderer or a suspended timer.
      if (s.status !== 'calibrating' || !imuCanStart(s) || s.moving || s.pose !== requiredIMUPose(s)?.id) { s.stableMs = 0; break; }
      if (!Number.isFinite(action.elapsedMs) || action.elapsedMs <= 0 || action.elapsedMs > 250) { s.stableMs = 0; break; }
      s.stableMs = Math.min(IMU_HOLD_MS, s.stableMs + action.elapsedMs);
      if (s.stableMs >= IMU_HOLD_MS) {
        s.samples.push(s.pose); s.stableMs = 0;
        if (s.samples.length === IMU_POSES.length) s.status = 'measured';
      }
      break;
    }
    case 'PAUSE':
      if (s.status === 'calibrating') { s.status = 'paused'; s.pauseReason = action.reason || '측정을 일시 정지했습니다.'; }
      s.stableMs = 0; s.moving = false; break;
    case 'VERIFY':
      if (s.status === 'measured' && imuCanStart(s) && s.pose === 'level' && !s.moving) s.status = 'completed';
      break;
  }
  return s;
}

export function imuGuide(s) {
  const task = (id, title, detail, targetLabel, selector, done = false) => ({ id, title, detail, targetLabel, target: { kind: 'imu', selector }, done });
  const prep = [
    task('imu-surface', '작업대를 먼저 확인하세요', '3D 화면 아래의 작업대 확인 표시를 누르세요. 마르고 수평이며 흔들리지 않는 곳에서 진행합니다.', '작업대의 수평 확인 표시', '[data-action="imu-surface"]', s.surface),
    task('imu-power', '기체 전원을 켜세요', '기체 위쪽의 전원 표시를 누르세요. 이 교육 기체의 배터리는 100%입니다.', '기체 위의 전원 버튼', '[data-action="imu-power"]', s.power),
    task('imu-link', '센서 화면에 기체를 연결하세요', '작업대 안의 센서 패널에서 기체 연결을 누르세요. 실습용 가상 연결입니다.', '센서 패널 · 기체 연결', '[data-action="imu-link"]', s.linked),
    task('imu-start', 'IMU 보정을 시작하세요', '보정 필요 상태를 확인하고 보정 시작을 누르세요. 이 과정에서는 모터가 회전하지 않습니다.', '센서 패널 · 보정 시작', '[data-action="imu-begin"]', s.status !== 'idle'),
  ];
  const poses = IMU_POSES.map((p, i) => task(`imu-pose-${p.id}`, `${i + 1}/6 · ${p.label}`, `${p.instruction} 기체 본체를 잡아 끌어 돌린 뒤 놓고, 3초 동안 움직이지 마세요. 오른쪽 작은 모형이 목표 자세입니다.`, '3D 기체 본체 · 끌어서 돌리기', '[data-imu-body]', s.samples.includes(p.id)));
  const finish = [
    task('imu-return', '기체를 다시 바르게 놓으세요', '여섯 자세의 측정을 마쳤습니다. 다리가 아래로 향하게 돌려 결과를 확인할 준비를 하세요.', '3D 기체 본체', '[data-imu-body]', s.samples.length === 6 && s.pose === 'level'),
    task('imu-verify', '보정 결과를 확인하세요', '센서 패널의 결과 확인을 누르고, 기울어진 기준선이 수평으로 바뀌는 모습을 비교하세요.', '센서 패널 · 결과 확인', '[data-action="imu-verify"]', s.status === 'completed'),
  ];
  const phases = [{ title: '준비와 연결', tasks: prep }, { title: '자세별 정지 측정', tasks: poses }, { title: '결과 확인', tasks: finish }];
  const all = phases.flatMap(p => p.tasks), complete = s.status === 'completed';
  const pending = all.filter(t => !t.done);
  let current = pending[0];
  if (s.status === 'paused') current = task('imu-resume', '멈춘 보정을 다시 시작하세요', `${s.pauseReason} 보정 재개를 누른 뒤 현재 자세를 다시 3초간 유지하세요. 이전에 마친 자세는 유지됩니다.`, '센서 패널 · 보정 재개', '[data-action="imu-begin"]');
  if (complete) current = task('imu-completed', 'IMU 보정 교육을 마쳤습니다', '여섯 자세의 정지 측정과 결과 확인을 완료했습니다. 가상 센서의 기준선이 수평으로 복구되었습니다.', '가상 센서 결과', '[data-imu-panel]', true);
  const phaseIndex = complete || s.status === 'measured' ? 2 : ['calibrating', 'paused'].includes(s.status) ? 1 : 0;
  // Resume belongs to the visible checklist as well as the blue task box.
  if (s.status === 'paused') phases[1].tasks = [current, ...poses];
  return { current, phases, phaseIndex, complete, remaining: pending.length + (s.status === 'paused' ? 1 : 0),
    summary: `자세 측정 ${s.samples.length}/6 · ${complete ? '교육 완료' : '교육용 시뮬레이션'}`,
    inputHelp: '기체 잡고 끌기: 자세 변경 · 빈 곳 끌기: 시점 변경 · 기체 선택 후 방향키: 90° 돌리기',
    workflow: ['준비·연결', '자세별 측정', '결과 확인'].map((label, i) => ({ label, state: complete || i < phaseIndex ? 'done' : i === phaseIndex ? 'current' : 'pending' })) };
}
