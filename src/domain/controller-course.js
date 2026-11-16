import { controllerGuide } from './learning-guide.js';
import { imuGuide } from './imu.js';
import { sticksNeutral } from './controller.js';

export const controllerChecksDone = controller => Object.values(controller.practice).every(Boolean);
export const canEnterControllerIMU = controller => !controller.flightReady && controllerChecksDone(controller)
  && controller.aircraftPower && controller.remotePower && sticksNeutral(controller);

// Preparation, calibration and movement share one course and completion condition.
export function controllerCourseGuide(controller, imu, stage = 'controller') {
  const controls = controllerGuide(controller), calibration = imuGuide(imu), inIMU = stage === 'imu';
  const flight = controller.flightReady && calibration.complete;
  const next = { id: 'controller-imu-next', title: '이어서 IMU 보정을 진행하세요',
    detail: '조종기 작동 확인을 마쳤습니다. IMU 보정을 완료한 다음 기체 이동·회전 연습을 진행합니다.',
    targetLabel: '조종기 화면 · IMU 보정으로 이어하기', target: { kind: 'course-next', selector: '[data-action="controller-imu-next"]' }, done: inIMU || flight };
  const flightNext = { id: 'controller-flight-next', title: '이어서 기체 이동을 연습하세요', detail: 'IMU 보정을 완료했습니다. 기체 이동 연습으로 버튼을 눌러 앞뒤 이동과 제자리 회전을 연습하세요.',
    targetLabel: '센서 패널 · 기체 이동 연습으로', target: { kind: 'course-next', selector: '[data-action="imu-flight-next"]' }, done: flight };
  const movement = [
    { id: 'flight-move', title: '왼쪽 스틱으로 앞뒤 이동해 보세요', detail: '왼쪽 스틱을 위·아래로 끌거나 ↑·↓ 방향키로 전진·후진합니다. 놓으면 멈춥니다.', targetLabel: '왼쪽 이동 스틱', target: { kind: 'controller-stick', side: 'left' }, done: controller.flightPractice.move },
    { id: 'flight-turn', title: '오른쪽 스틱으로 제자리 회전해 보세요', detail: '오른쪽 스틱을 좌·우로 끌거나 ←·→ 방향키로 드론의 방향을 바꿉니다.', targetLabel: '오른쪽 회전 스틱', target: { kind: 'controller-stick', side: 'right' }, done: controller.flightPractice.turn },
    { id: 'flight-stop', title: '기체를 정지하고 교육을 마치세요', detail: '스틱을 놓은 뒤 동작 정지 또는 Esc로 정지·연결 해제를 확인하세요.', targetLabel: '동작 정지 · Esc', target: { kind: 'controller-stop' }, done: controller.flightPractice.stop },
  ];
  const flightPhase = { title: '기체 이동 연습', tasks: [flightNext, ...movement] };
  const phases = [...controls.phases, { title: 'IMU 보정으로 이동', tasks: [next] }, ...calibration.phases, flightPhase];
  let current = inIMU ? calibration.current : controls.complete ? next : controls.current;
  if (!inIMU && !flight && controls.complete) {
    const powerIndex = !controller.aircraftPower ? 0 : !controller.remotePower ? 1 : -1;
    if (powerIndex >= 0) {
      const original = controls.phases[0].tasks[powerIndex];
      const restore = { ...original, id: `${original.id}-restore`, title: original.title,
        detail: 'IMU 보정으로 이어가려면 기체와 조종기의 전원이 모두 켜져 있어야 합니다.', done: false };
      phases[1].tasks = [restore, next]; current = restore;
    } else if (!sticksNeutral(controller)) {
      current = { ...next, id: 'controller-imu-center', title: '스틱을 놓고 중앙으로 되돌리세요',
        detail: '드론이 멈추고 스틱이 중앙으로 돌아온 뒤 IMU 보정으로 이어갈 수 있습니다.', targetLabel: '조종기 좌우 스틱', target: { kind: 'controller-stop' } };
      phases[1].tasks = [current, next];
    }
  }
  if (inIMU && calibration.complete) current = flightNext;
  const complete = !inIMU && flight && movement.every(t => t.done);
  if (flight && !inIMU && !complete) {
    current = movement.find(t => !t.done);
    const restore = !controller.aircraftPower ? 0 : !controller.remotePower ? 1 : !controller.connected ? 2 : -1;
    if (restore >= 0) { current = { ...controls.phases[0].tasks[restore], done: false }; flightPhase.tasks = [current, ...flightPhase.tasks]; }
  }
  if (complete) current = { ...calibration.current, id: 'controller-course-completed', title: '조종기 교육을 모두 마쳤습니다',
    detail: '조종기 작동 확인·IMU 보정·기체 이동과 회전·정지까지 완료했습니다. 상단 다시 시작으로 전체 과정을 반복할 수 있습니다.' };
  return { ...calibration, current, phases, complete,
    remaining: phases.flatMap(p => p.tasks).filter(t => !t.done).length,
    summary: `조종기 확인 ${controls.phases[0].tasks.filter(t => t.done).length}/6 · IMU ${imu.samples.length}/6 · 이동 연습 ${movement.filter(t => t.done).length}/3`,
    inputHelp: inIMU ? calibration.inputHelp : flight ? '왼쪽 ↑↓ 이동 · 오른쪽 ←→ 회전 · 놓으면 정지 · Esc: 동작 정지' : '스틱 입력을 확인한 뒤 IMU 보정으로 이어갑니다. 기체 이동은 보정 후에 가능합니다.',
    workflow: [{ label: '조종기 작동 확인', state: inIMU || flight ? 'done' : 'current' },
      { label: 'IMU 보정', state: calibration.complete ? 'done' : inIMU ? 'current' : 'pending' },
      { label: '기체 이동 연습', state: complete ? 'done' : flight ? 'current' : 'pending' }] };
}
