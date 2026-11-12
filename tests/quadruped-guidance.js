import { createRobotState, robotTransition, robotGuide, ROBOT_LEGS } from '../src/domain/quadruped.js';
const assert = (value, message) => { if (!value) throw new Error(message); };
const act = (s, type, rest = {}) => robotTransition(s, { type, ...rest }).state;
const fresh = targetLeg => createRobotState({ active: true, targetLeg });
const prepare = s => ['ESTOP', 'POWER', 'SUPPORT', 'REMOVE_BATTERY'].reduce((next, type) => act(next, type), s);
let passed = 0;
const test = (name, run) => { run(); passed++; console.log('PASS', name); };

test('안전 준비의 현재 작업·다음 작업·진행 단계를 순서대로 안내', () => {
  let s = fresh('front-left');
  const ids = ['robot-estop', 'robot-power-off', 'robot-support', 'robot-battery-out'];
  for (const [index, action] of ['ESTOP', 'POWER', 'SUPPORT', 'REMOVE_BATTERY'].entries()) {
    const guide = robotGuide(s);
    assert(guide.current.id === ids[index] && guide.phaseIndex === 0, 'wrong preparation task');
    assert(guide.workflow[0].state === 'current' && guide.workflow.slice(1).every(step => step.state === 'pending'), 'wrong stage');
    if (index < 3) assert(guide.upNext.id === ids[index + 1], 'wrong next task');
    s = act(s, action);
  }
  assert(robotGuide(s).phaseIndex === 1 && robotGuide(s).workflow[0].state === 'done', 'no inspection transition');
});
test('손상 다리를 먼저 찾아도 네 다리 판단이 끝날 때까지 점검을 우선 안내', () => {
  for (const p of ROBOT_LEGS) {
    let s = prepare(fresh(p.id));
    s = act(s, 'INSPECT', { legId: p.id }); s = act(s, 'DIAGNOSE', { legId: p.id, answer: 'replace' });
    const guide = robotGuide(s, p.id);
    assert(guide.phaseIndex === 1 && guide.current.id.startsWith('robot-inspect-') && guide.current.legId !== p.id, 'premature repair');
    for (const other of ROBOT_LEGS.filter(leg => leg.id !== p.id)) {
      s = act(s, 'INSPECT', { legId: other.id }); s = act(s, 'DIAGNOSE', { legId: other.id, answer: 'healthy' });
    }
    const repair = robotGuide(s, p.id);
    assert(repair.phaseIndex === 2 && repair.current.id === `robot-disconnect-${p.id}`, 'missing repair transition');
  }
});
test('모든 고장 위치에서 안내한 작업만 따라 준비·점검·교체·시험·완료 가능', () => {
  for (const p of ROBOT_LEGS) {
    let s = fresh(p.id), visits = [];
    for (let count = 0; count < 60 && s.status !== 'completed'; count++) {
      const before = JSON.stringify(s), guide = robotGuide(s), t = guide.current;
      assert(t && JSON.stringify(s) === before, 'guidance mutated state or missing task');
      visits.push(guide.phaseIndex);
      const fixed = { 'robot-estop': 'ESTOP', 'robot-power-off': 'POWER', 'robot-support': 'SUPPORT', 'robot-battery-out': 'REMOVE_BATTERY', 'robot-battery-in': 'INSTALL_BATTERY', 'robot-test-power': 'POWER', 'robot-release-stop': 'ESTOP', 'robot-final-stop': 'ESTOP', 'robot-final-power': 'POWER', 'robot-finish': 'COMPLETE' };
      if (fixed[t.id]) s = act(s, fixed[t.id]);
      else if (t.id.startsWith('robot-inspect-')) {
        s = act(s, 'INSPECT', { legId: t.legId });
        s = act(s, 'DIAGNOSE', { legId: t.legId, answer: t.legId === p.id ? 'replace' : 'healthy' });
      } else if (t.id.startsWith('robot-disconnect-') || t.id.startsWith('robot-connect-')) s = act(s, 'CONNECTOR', { legId: t.legId });
      else if (t.id.startsWith('robot-unbolt-') || t.id.startsWith('robot-fasten-')) s = act(s, 'DRIVER', { legId: t.legId, index: Number(t.id.at(-1)) });
      else if (t.id.startsWith('robot-remove-')) s = act(s, 'REMOVE_MODULE', { legId: t.legId });
      else if (t.id.startsWith('robot-install-')) s = act(s, 'INSTALL_MODULE', { legId: t.legId, moduleId: 'QJ-01' });
      else if (t.id === 'robot-test') s = act(act(s, 'START_TEST'), 'FINISH_TEST');
      else throw new Error(`unsupported task ${t.id}`);
    }
    assert(s.status === 'completed' && s.errors.length === 0, 'guided path did not complete cleanly');
    assert(visits.every((phase, index) => index === 0 || phase >= visits[index - 1]), 'phase moved backward');
    const done = robotGuide(s); assert(done.remaining === 0 && done.workflow.every(step => step.state === 'done'), 'completion not reflected');
  }
});
console.log(`ALL PASS · ${passed} robot guidance checks`);
