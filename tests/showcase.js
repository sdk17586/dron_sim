import { createShowcaseRobot, showcasePlan, applyShowcaseAction } from '../src/domain/showcase.js';
import { placeRobotPart, robotAssembled, robotDiagnosed } from '../src/domain/quadruped.js';

const assert = (ok, message) => { if (!ok) throw new Error(message); };
let state = createShowcaseRobot();
const original = structuredClone(state), steps = showcasePlan();
for (const step of steps) {
  const op = step.operation;
  if (op.type === 'action') state = applyShowcaseAction(state, op.action);
  else if (op.type === 'inspect') state = applyShowcaseAction(state, { type: 'INSPECT', legId: op.legId });
  else if (op.type === 'connector') state = applyShowcaseAction(state, { type: 'CONNECTOR', legId: state.targetLeg });
  else if (op.type === 'place') {
    let piece, target;
    if (op.from === 'robot-stand') [piece, target] = [{ kind: 'robot-support' }, { kind: 'robot-support-slot' }];
    else if (op.from === 'robot-battery') [piece, target] = [{ kind: 'robot-battery' }, { kind: 'robot-discard' }];
    else if (op.from === 'robot-stored-battery') [piece, target] = [{ kind: 'robot-stored-battery' }, { kind: 'robot-battery-slot' }];
    else if (op.from === 'robot-driver') [piece, target] = [{ kind: 'robot-driver' }, { kind: 'robot-bolt', legId: state.targetLeg, index: Number(op.to.at(-1)) }];
    else if (op.from === 'robot-spare') [piece, target] = [{ kind: 'robot-module', moduleId: 'QJ-01' }, { kind: 'robot-module-slot', legId: state.targetLeg }];
    else [piece, target] = [{ kind: 'robot-mounted-module', legId: state.targetLeg }, { kind: 'robot-discard' }];
    const next = placeRobotPart(state, piece, target);
    assert(next.feedback.kind === 'success', next.feedback.message); state = next.state;
  }
}
assert(state.status === 'completed' && state.tested && state.estop && !state.power, 'Full maintenance must finish safely before reveal');
assert(robotAssembled(state) && robotDiagnosed(state) && !state.errors.length, 'Actual repair, diagnosis and fastening must pass');
assert(original.legs[original.targetLeg].condition === 'damaged' && original.status === 'active', 'Original attempt must remain unchanged');
const another = createShowcaseRobot();
assert(another.meta.attemptId !== original.meta.attemptId && another.legs[another.targetLeg].source === 'original', 'Restart must create a fresh isolated attempt');
let rejected = false;
try { applyShowcaseAction(another, { type: 'COMPLETE' }); } catch { rejected = true; }
assert(rejected, 'Presentation must not bypass completion rules');
assert(steps.at(-1).operation.type === 'reveal' && steps.at(-2).operation.action.type === 'COMPLETE', 'The visual reveal must follow actual completion');
console.log('ALL PASS · 6 showcase checks: real maintenance sequence, repair invariants, safe completion, input preservation, fresh attempts, premature completion rejection');
