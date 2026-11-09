import { batteryColor, chargeFraction } from '../domain/battery.js';
import { escapeHTML as e } from './shared.js';

export function renderBatteryGauge(pack) {
  const level = pack?.charge ?? 0;
  return `<div class="battery-gauge" data-anchor="battery-led" data-battery-gauge data-battery-id="${e(pack?.id || '')}" role="progressbar" aria-label="기체 배터리 잔량" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${level}" aria-valuetext="${pack ? level + '%' : '배터리 없음'}">
    <svg viewBox="0 0 100 6" aria-hidden="true"><rect width="100" height="6" rx="2" fill="#cbd4c4"/><rect class="battery-gauge-fill" width="${chargeFraction(level) * 100}" height="6" rx="2" fill="${batteryColor(level)}"/></svg><span class="battery-gauge-label">${pack ? `배터리 ${level}%` : '배터리 없음'}</span></div>`;
}

// A range preview updates presentation without replacing the control mid-drag.
// The committed value goes through the domain transition on change.
export function previewBatteryGauge(root, pack) {
  for (const node of root.querySelectorAll('[data-battery-gauge]')) {
    node.setAttribute('aria-valuenow', String(pack.charge));
    node.setAttribute('aria-valuetext', `${pack.charge}%`);
    node.querySelector('.battery-gauge-fill').setAttribute('width', String(chargeFraction(pack.charge) * 100));
    node.querySelector('.battery-gauge-fill').setAttribute('fill', batteryColor(pack.charge));
    node.querySelector('.battery-gauge-label').textContent = `배터리 ${pack.charge}%`;
  }
  for (const node of root.querySelectorAll('[data-battery-led-fill]')) {
    node.setAttribute('width', String(chargeFraction(pack.charge) * 62));
    node.setAttribute('fill', batteryColor(pack.charge));
  }
}
