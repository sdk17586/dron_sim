import { createState } from './state.js';

// A disconnected teaching console. These values never control real hardware
// and intentionally do not model a flight mode, arming gesture, or motor mixer.
export const createControllerState = () => ({
  aircraftPower: false, remotePower: false, connected: false,
  sticks: { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } },
});
export function createControllerAircraft() {
  const aircraft = createState({ session: '작동 확인', trainee: 'preview' });
  aircraft.status = 'preview'; aircraft.batteryPacks[0].charge = 100;
  for (const motor of Object.values(aircraft.motors)) for (const blade of motor.blades) blade.condition = 'healthy';
  return aircraft;
}
const centered = () => ({ left: { x: 0, y: 0 }, right: { x: 0, y: 0 } });
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
    case 'AIRCRAFT_POWER': return { ...s, aircraftPower: !s.aircraftPower, connected: false, sticks: centered() };
    case 'REMOTE_POWER': return { ...s, remotePower: !s.remotePower, connected: false, sticks: centered() };
    case 'LINK':
      if (s.connected) return { ...s, connected: false, sticks: centered() };
      if (!s.aircraftPower || !s.remotePower || !sticksNeutral(s)) return s;
      return { ...s, connected: true, sticks: centered() };
    case 'STICK': {
      if (!['left', 'right'].includes(action.side) || !Number.isFinite(action.x) || !Number.isFinite(action.y)) return s;
      const length = Math.max(1, Math.hypot(action.x, action.y));
      return { ...s, sticks: { ...s.sticks, [action.side]: { x: action.x / length, y: action.y / length } } };
    }
    case 'CENTER': return { ...s, sticks: centered() };
    case 'STOP': return { ...s, connected: false, sticks: centered() };
    case 'RESET': return createControllerState();
    default: return s;
  }
}
