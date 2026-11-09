export function createBatteryPacks() {
  return [
    { id: 'battery-01', name: '기존 배터리', charge: 20, location: 'installed' },
    { id: 'battery-02', name: '교체 배터리', charge: 100, location: 'spare' },
  ];
}

export function installedBattery(state) {
  return state?.battery ? state.batteryPacks.find(pack => pack.location === 'installed') || null : null;
}

export function batteryColor(charge) {
  return charge <= 20 ? '#cf674b' : charge <= 50 ? '#c99a3c' : '#71ad50';
}

export function chargeFraction(charge) {
  return Number.isFinite(charge) ? Math.max(0, Math.min(100, charge)) / 100 : 0;
}
