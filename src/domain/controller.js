import { createState } from './state.js';
import { IMU_POSES } from './imu.js';

// A disconnected teaching console. These values never control real hardware
// and intentionally do not model a flight mode, arming gesture, or motor mixer.
export const DRONE_MOVE_LIMIT = 2.6;
export const DRONE_MOVE_SPEED = 1.6;
export const DRONE_TURN_SPEED = 1;
export const createControllerState = () => ({
  aircraftPower: false, remotePower: false, connected: false,
  sticks: { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } },
  pose: { x: 0, z: 0, yaw: 0 }, moving: false, boundary: false,
  flightReady: false, flightPractice: { move: false, turn: false, stop: false },
  practice: { aircraft: false, remote: false, link: false, left: false, right: false, stop: false },
});
export function createControllerAircraft() {
  const aircraft = createState({ session: '작동 확인', trainee: 'preview' });
  aircraft.status = 'preview'; aircraft.batteryPacks[0].charge = 100;
  for (const motor of Object.values(aircraft.motors)) for (const blade of motor.blades) blade.condition = 'healthy';
  return aircraft;
}
const centered = () => ({ left: { x: 0, y: 0 }, right: { x: 0, y: 0 } });
const axis = value => Math.abs(value) <= .08 ? 0 : Math.sign(value) * (Math.abs(value) - .08) / .92;
export function droneMotionDemand(s) {
  if (!s.flightReady || !s.aircraftPower || !s.remotePower || !s.connected) return { forward: 0, turn: 0, active: false };
  const forward = axis(s.sticks.left.y), turn = -axis(s.sticks.right.x);
  return { forward, turn, active: Boolean(forward || turn) };
}
export function droneMotionLabel(s) {
  if (!s.flightReady) return 'IMU 보정 후 이동 가능';
  if (s.boundary) return '연습 영역 끝 · 반대 방향으로 이동';
  const d = droneMotionDemand(s), labels = [];
  if (d.forward) labels.push(d.forward > 0 ? '전진' : '후진');
  if (d.turn) labels.push(d.turn > 0 ? '좌회전' : '우회전');
  return labels.join(' · ') || '정지';
}
export function sticksNeutral(s) {
  return Object.values(s.sticks).every(p => Math.hypot(p.x, p.y) <= .08);
}
export function rotationDemand(s) {
  if (!s.aircraftPower || !s.remotePower || !s.connected) return 0;
  const magnitude = Math.max(...Object.values(s.sticks).map(p => Math.hypot(p.x, p.y)));
  return Math.max(0, Math.min(1, (magnitude - .08) / .92));
}
export function connectionLabel(s) {
  if (!s.remotePower) return '조종기 전원 꺼짐';
  if (!s.aircraftPower) return '기체 전원 꺼짐';
  return s.connected ? '연결됨 · 가상 연결' : '미연결';
}
export function controllerTransition(s, action) {
  switch (action.type) {
    case 'BEGIN_FLIGHT': {
      const imu = action.calibration;
      if (s.flightReady || !Object.values(s.practice).every(Boolean) || !s.aircraftPower || !s.remotePower || !sticksNeutral(s)
        || imu?.status !== 'completed' || !imu.surface || !imu.power || !imu.linked || imu.batteryCharge < 50
        || imu.pose !== 'level' || imu.moving || !IMU_POSES.every(p => imu.samples?.includes(p.id))) return s;
      return { ...s, flightReady: true, connected: true, pose: { x: 0, z: 0, yaw: 0 }, sticks: centered(), moving: false, boundary: false,
        flightPractice: { move: false, turn: false, stop: false } };
    }
    case 'AIRCRAFT_POWER': return { ...s, aircraftPower: !s.aircraftPower, connected: false, sticks: centered(), moving: false, boundary: false, practice: { ...s.practice, aircraft: s.practice.aircraft || !s.aircraftPower } };
    case 'REMOTE_POWER': return { ...s, remotePower: !s.remotePower, connected: false, sticks: centered(), moving: false, boundary: false, practice: { ...s.practice, remote: s.practice.remote || !s.remotePower } };
    case 'LINK':
      if (s.connected) return { ...s, connected: false, sticks: centered(), moving: false, boundary: false };
      if (!s.aircraftPower || !s.remotePower || !sticksNeutral(s)) return s;
      return { ...s, connected: true, sticks: centered(), practice: { ...s.practice, link: true } };
    case 'STICK': {
      if (!['left', 'right'].includes(action.side) || !Number.isFinite(action.x) || !Number.isFinite(action.y)) return s;
      const x = action.side === 'right' ? Math.max(-1, Math.min(1, action.x)) : 0;
      const y = action.side === 'left' ? Math.max(-1, Math.min(1, action.y)) : 0;
      const moved = s.connected && s.aircraftPower && s.remotePower && Math.hypot(x, y) > .08;
      const next = { ...s, sticks: { ...s.sticks, [action.side]: { x, y } }, practice: { ...s.practice, [action.side]: s.practice[action.side] || moved } };
      return droneMotionDemand(next).active ? next : { ...next, moving: false, boundary: false };
    }
    case 'TICK': {
      if (!Number.isFinite(action.seconds) || action.seconds <= 0) return s;
      const d = droneMotionDemand(s); if (!d.active) return s;
      const dt = Math.min(.1, action.seconds), { x, z, yaw } = s.pose;
      const turn = d.turn * DRONE_TURN_SPEED * dt, heading = yaw + turn / 2;
      const nextYaw = Math.atan2(Math.sin(yaw + turn), Math.cos(yaw + turn));
      const rawX = x - Math.sin(heading) * d.forward * DRONE_MOVE_SPEED * dt;
      const rawZ = z - Math.cos(heading) * d.forward * DRONE_MOVE_SPEED * dt;
      const clamp = value => Math.max(-DRONE_MOVE_LIMIT, Math.min(DRONE_MOVE_LIMIT, value));
      const nx = clamp(rawX), nz = clamp(rawZ);
      return { ...s, pose: { x: nx, z: nz, yaw: nextYaw },
        moving: Math.hypot(nx - x, nz - z) > 1e-8 || Math.abs(turn) > 1e-8,
        boundary: rawX !== nx || rawZ !== nz,
        flightPractice: { ...s.flightPractice, move: s.flightPractice.move || Math.hypot(nx - x, nz - z) > 1e-8, turn: s.flightPractice.turn || Math.abs(turn) > 1e-8 } };
    }
    case 'CENTER': return { ...s, sticks: centered(), moving: false, boundary: false };
    case 'RESET_POSE': return { ...s, pose: { x: 0, z: 0, yaw: 0 }, sticks: centered(), moving: false, boundary: false };
    case 'STOP': return { ...s, connected: false, sticks: centered(), moving: false, boundary: false, practice: { ...s.practice, stop: s.practice.stop || (s.connected && s.practice.left && s.practice.right) },
      flightPractice: { ...s.flightPractice, stop: s.flightPractice.stop || (s.flightReady && s.connected && s.flightPractice.move && s.flightPractice.turn) } };
    case 'RESET': return createControllerState();
    default: return s;
  }
}
