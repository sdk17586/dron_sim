import { createIMUState, imuTransition, IMU_POSES } from '../src/domain/imu.js';
import { createControllerState, controllerTransition } from '../src/domain/controller.js';

export function completedIMU() {
  let imu = createIMUState();
  for (const type of ['SURFACE', 'POWER', 'LINK', 'START']) imu = imuTransition(imu, { type });
  for (const pose of IMU_POSES) {
    imu = imuTransition(imu, { type: 'POSE', pose: pose.id });
    for (let n = 0; n < 30; n++) imu = imuTransition(imu, { type: 'TICK', elapsedMs: 100 });
  }
  imu = imuTransition(imu, { type: 'POSE', pose: 'level' });
  return imuTransition(imu, { type: 'VERIFY' });
}
export function checkedController() {
  let s = createControllerState();
  for (const type of ['AIRCRAFT_POWER', 'REMOTE_POWER', 'LINK']) s = controllerTransition(s, { type });
  for (const side of ['left', 'right']) s = controllerTransition(s, { type: 'STICK', side, x: side === 'right' ? 1 : 0, y: side === 'left' ? 1 : 0 });
  return controllerTransition(s, { type: 'STOP' });
}
export const flightController = () => controllerTransition(checkedController(), { type: 'BEGIN_FLIGHT', calibration: completedIMU() });
