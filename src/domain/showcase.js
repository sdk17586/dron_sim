// The presentation performs the same domain actions as a learner, in isolation.
import { createRobotState, robotTransition, ROBOT_LEGS } from './quadruped.js';

export const SHOWCASE_STAGES = ['장비 살펴보기', '안전 준비', '고장 발견', '직접 정비', '복구 확인'];
export function createShowcaseRobot() {
  return createRobotState({ targetLeg: 'front-left', session: '자동 시연', trainee: 'DEMO', active: true });
}
export function showcasePlan() {
  const steps = [];
  const add = (stage, title, detail, operation, hold = 1500) => steps.push({ stage, title, detail, operation, hold });
  const action = (type, extra = {}) => ({ type: 'action', action: { type, ...extra } });
  const place = (from, to) => ({ type: 'place', from, to });
  add(0, '직접 고치고, 다시 움직이다.', '실제 실습과 같은 순서로 진행되는 Q-TRAIN 정비 시연입니다.', { type: 'overview' }, 4500);
  add(1, '움직임부터 멈춥니다.', '비상 정지를 걸어 정비를 준비합니다.', action('ESTOP'), 1200);
  add(1, '전원을 차단합니다.', '공구를 대기 전에 주 전원을 끕니다.', action('POWER'), 1200);
  add(1, '몸체를 안전하게 지지합니다.', '받침대를 몸체 아래에 놓습니다.', place('robot-stand', 'robot-stand-slot'), 1300);
  add(1, '배터리를 분리합니다.', '움직일 수 없는 상태에서 관절을 살펴봅니다.', place('robot-battery', 'robot-discard'), 1300);
  for (const leg of ROBOT_LEGS) {
    add(2, `${leg.short}번 관절을 살펴봅니다.`, '하우징의 균열을 가까이에서 확인합니다.', { type: 'inspect', legId: leg.id }, 1700);
    add(2, leg.id === 'front-left' ? '손상된 관절을 발견했습니다.' : '정상 관절입니다.', leg.id === 'front-left' ? '주황색 표시 위치의 모듈을 교체합니다.' : '정상 부품은 유지합니다.', action('DIAGNOSE', { legId: leg.id, answer: leg.id === 'front-left' ? 'replace' : 'healthy' }), 900);
  }
  add(3, '연결을 풀고 교체를 시작합니다.', '커넥터를 먼저 분리합니다.', { type: 'connector' }, 1400);
  for (const i of [0, 1]) add(3, `${i + 1}번 볼트를 풀어냅니다.`, '공구를 대면 볼트가 회전하며 분리됩니다.', place('robot-driver', `bolt-front-left-${i}`), 1300);
  add(3, '손상 모듈을 꺼냅니다.', '빈 장착부와 수거된 관절 모듈을 확인하세요.', place('module-front-left', 'robot-discard'), 2600);
  add(3, '새 관절을 제자리에 넣습니다.', '장착부와 같은 QJ-01 모듈을 사용합니다.', place('robot-spare', 'module-front-left'), 2200);
  for (const i of [0, 1]) add(3, `${i + 1}번 볼트를 체결합니다.`, '새 모듈을 넣은 뒤 고정까지 마무리합니다.', place('robot-driver', `bolt-front-left-${i}`), 1400);
  add(3, '커넥터를 다시 연결합니다.', '기계적 결합과 전기적 연결을 모두 확인합니다.', { type: 'connector' }, 1500);
  add(4, '배터리를 복구합니다.', '관절 교체가 끝나야 다시 전원을 넣을 수 있습니다.', place('robot-stored-battery', 'robot-battery'), 1200);
  add(4, '움직임 확인을 준비합니다.', '받침대 위에서 주 전원을 켭니다.', action('POWER'), 1000);
  add(4, '관절 시험을 시작합니다.', '비상 정지를 해제하고 네 다리를 확인합니다.', action('ESTOP'), 1000);
  add(4, '네 다리가 다시 반응합니다.', '받침대를 유지한 채 가상 관절 시험을 진행합니다.', action('START_TEST'), 3400);
  add(4, '관절 시험을 마쳤습니다.', '비상 정지와 전원 차단으로 실제 교육 과제를 마무리합니다.', action('FINISH_TEST'), 800);
  add(4, '다시 비상 정지를 겁니다.', '시험이 끝난 뒤 움직임을 차단합니다.', action('ESTOP'), 700);
  add(4, '주 전원을 끕니다.', '정비 과제를 안전하게 마무리합니다.', action('POWER'), 700);
  add(4, '정비 과정 완료.', '이어서 복구된 가상 로봇의 보행 연출을 보여드립니다.', action('COMPLETE'), 1000);
  add(4, '다시, 움직일 준비.', '별도의 정상 가상 모델로 보여주는 보행 연출입니다.', { type: 'reveal' }, 10500);
  return steps;
}

export function applyShowcaseAction(state, action) {
  const next = robotTransition(state, action);
  if (next.feedback.kind !== 'success') throw new Error(next.feedback.message);
  return next.state;
}
