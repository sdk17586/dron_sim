import { controllerGuide } from './learning-guide.js';
import { imuGuide } from './imu.js';
import { sticksNeutral } from './controller.js';

export const controllerChecksDone = controller => Object.values(controller.practice).every(Boolean);
export const canEnterControllerIMU = controller => controllerChecksDone(controller)
  && controller.aircraftPower && controller.remotePower && sticksNeutral(controller);

// The two workspaces share one course, checklist and completion condition.
export function controllerCourseGuide(controller, imu, stage = 'controller') {
  const controls = controllerGuide(controller), calibration = imuGuide(imu), inIMU = stage === 'imu';
  const next = { id: 'controller-imu-next', title: '이어서 IMU 보정을 진행하세요',
    detail: '조종기 작동 확인을 마쳤습니다. 조종기 화면의 IMU 보정으로 이어하기를 누르세요. IMU 보정까지 마치면 전체 교육이 완료됩니다.',
    targetLabel: '조종기 화면 · IMU 보정으로 이어하기', target: { kind: 'course-next', selector: '[data-action="controller-imu-next"]' }, done: inIMU };
  const phases = [...controls.phases, { title: 'IMU 보정으로 이동', tasks: [next] }, ...calibration.phases];
  let current = inIMU ? calibration.current : controls.complete ? next : controls.current;
  if (!inIMU && controls.complete) {
    const powerIndex = !controller.aircraftPower ? 0 : !controller.remotePower ? 1 : -1;
    if (powerIndex >= 0) {
      const original = controls.phases[0].tasks[powerIndex];
      const restore = { ...original, id: `${original.id}-restore`, title: original.title,
        detail: 'IMU 보정으로 이어가려면 기체와 조종기의 전원이 모두 켜져 있어야 합니다.', done: false };
      phases[1].tasks = [restore, next]; current = restore;
    } else if (!sticksNeutral(controller)) {
      current = { ...next, id: 'controller-imu-center', title: '스틱을 놓고 중앙으로 되돌리세요',
        detail: '회전 표시가 멈추고 스틱이 중앙으로 돌아온 뒤 IMU 보정으로 이어갈 수 있습니다.', targetLabel: '조종기 좌우 스틱', target: { kind: 'controller-stop' } };
      phases[1].tasks = [current, next];
    }
  }
  const complete = inIMU && controls.complete && calibration.complete;
  if (complete) current = { ...calibration.current, id: 'controller-course-completed', title: '조종기 교육을 모두 마쳤습니다',
    detail: '조종기 전원·연결·좌우 스틱·정지 확인과 IMU 보정까지 완료했습니다. 상단 다시 시작으로 전체 과정을 반복할 수 있습니다.' };
  return { ...calibration, current, phases, complete,
    remaining: phases.flatMap(p => p.tasks).filter(t => !t.done).length,
    summary: `조종기 작동 확인 ${controls.phases[0].tasks.filter(t => t.done).length}/6 · IMU 자세 측정 ${imu.samples.length}/6`,
    inputHelp: inIMU ? calibration.inputHelp : '조종기 전원·연결·좌우 스틱·정지 확인 후 IMU 보정으로 이어갑니다.',
    workflow: [{ label: '조종기 작동 확인', state: inIMU ? 'done' : 'current' },
      { label: 'IMU 보정', state: complete ? 'done' : inIMU ? 'current' : 'pending' }] };
}
