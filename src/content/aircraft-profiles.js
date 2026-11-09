export const PROFILE = Object.freeze({
  id: 'mini-2-se-schematic',
  name: 'DJI Mini 2 SE',
  version: '2026-10-30.1',
  // The top view is a teaching diagram. These fixed marks are schematic;
  // physical aircraft left/right placement still needs instructor verification.
  motors: [
    { id: 'front-left', name: '전방 왼쪽', short: '01', x: 180, y: 156, marked: true },
    { id: 'front-right', name: '전방 오른쪽', short: '02', x: 580, y: 156, marked: false },
    { id: 'rear-left', name: '후방 왼쪽', short: '03', x: 182, y: 433, marked: false },
    { id: 'rear-right', name: '후방 오른쪽', short: '04', x: 578, y: 433, marked: true },
  ],
});
export const motorProfile = id => PROFILE.motors.find(m => m.id === id);
