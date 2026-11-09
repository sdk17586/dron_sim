import { PROFILE, motorProfile } from '../content/aircraft-profiles.js';
import { KITS, readyForMaintenance } from '../domain/state.js';
import { escapeHTML as e, icon } from './shared.js';
import { installedBattery, batteryColor, chargeFraction } from '../domain/battery.js';
import { renderBatteryGauge } from './battery-indicator.js';

export function partArt(kind, charge = 100) {
  const paths = {
    blade: '<path d="M31 20C21 11 5 11 3 16s14 12 27 9c10 9 26 9 28 4S44 17 31 20Z" fill="currentColor"/><circle cx="30" cy="23" r="3" fill="#f4f6ef"/>',
    driver: '<path d="m32 26-17 17-4 1 1-4 17-17" fill="#8d9c8d"/><path d="m29 23 11-13q4-4 8 0l2 2q4 4 0 8L37 31Z" fill="currentColor"/><path d="m39 16 5 5" stroke="#e3ebdb" stroke-width="2"/>',
    screw: '<path d="M28 20h7v20l-4 4-3-4Z" fill="#8d9c8d"/><path d="m28 26 7-3m-7 9 7-3m-7 9 7-3" stroke="#d4ddd0" stroke-width="1.5"/><ellipse cx="31.5" cy="18" rx="10" ry="5" fill="currentColor"/><path d="M27 18h9m-4-3v6" stroke="#eff3e9" stroke-width="1.5"/>',
    battery: `<rect x="10" y="12" width="40" height="28" rx="5" fill="currentColor"/><path d="M50 20h3v12h-3" fill="#9ead93"/><rect x="16" y="23" width="28" height="5" rx="1" fill="#263a2d"/><rect x="16" y="23" width="${28 * chargeFraction(charge)}" height="5" rx="1" fill="${batteryColor(charge)}"/>`,
  };
  return `<svg class="part-art" viewBox="0 0 62 52" aria-hidden="true">${paths[kind] || paths.blade}</svg>`;
}
const data = value => e(JSON.stringify(value));

export function renderRepairPoints(s, ui) {
  if (ui.controllerMode) return `<button class="model-power controller-aircraft-power" data-anchor="power" data-action="controller-aircraft-power" aria-label="기체 ${s.power ? '끄기' : '켜기'}" aria-pressed="${s.power}">${icon('power')}<span class="point-caption">기체 전원 ${s.power ? '켜짐' : '꺼짐'}</span></button>${renderBatteryGauge(installedBattery(s))}`;
  if (!s || s.status !== 'active') return '';
  const pack = installedBattery(s);
  const power = `<button class="model-power ${s.safetyConfirmed ? 'confirmed' : ''}" data-anchor="power" data-action="confirm-power" aria-label="전원 차단 확인" title="전원 차단 확인">${icon(s.safetyConfirmed ? 'check' : 'power')}</button>`;
  const battery = `<button class="repair-point battery-point ${pack ? '' : 'empty-part'}" data-anchor="battery" data-drop="${data({ kind: 'battery-slot' })}" ${pack ? `data-piece="${data({ kind: 'battery', batteryId: pack.id })}"` : ''} aria-label="${pack ? '장착된 배터리 집기' : '빈 배터리 자리'}" title="${pack ? `${pack.name} · ${pack.charge}% → 수거함` : '배터리를 이 자리에 놓으세요'}">${partArt('battery', pack?.charge ?? 0)}<span class="point-caption">${pack ? `배터리 ${pack.charge}%` : '배터리 장착 자리'}</span></button>`;
  const controls = power + battery + renderBatteryGauge(pack);
  if (!readyForMaintenance(s)) return controls;
  const motor = s.motors[ui.selected];
  if (!motor.inspected || !ui.zoomed) return controls;
  return controls + [0, 1].map(index => {
    const blade = motor.blades[index], screw = motor.screws[index];
    const label = `${index + 1}번`;
    return `<button class="repair-point blade-point ${!blade.present ? 'empty-part' : ''}" data-anchor="blade-${index}" data-drop="${data({ kind: 'blade', motorId: ui.selected, index })}" ${blade.present ? `data-piece="${data({ kind: 'mounted-blade', motorId: ui.selected, index, partId: blade.id })}"` : ''} aria-label="${label} ${blade.present ? '장착 날개 집기' : '새 날개 놓는 자리'}" title="${label} ${blade.present ? '날개 → 수거함' : '날개 놓는 자리'}">${partArt('blade')}<span class="part-number-badge">${index + 1}</span><span class="point-caption">${blade.present ? '날개' : '빈 날개 자리'} ${index + 1}</span></button>
    <button class="repair-point screw-point ${!screw.present ? 'empty-part' : ''} ${screw.present && !screw.secured ? 'unfastened' : ''}" data-anchor="screw-${index}" data-drop="${data({ kind: 'screw', motorId: ui.selected, index })}" aria-label="${label} ${screw.present ? (screw.secured ? '나사 · 드라이버로 분리' : '나사 · 드라이버로 체결') : '새 나사 놓는 자리'}" title="${label} ${screw.present ? (screw.secured ? '나사 분리' : '나사 체결 필요') : '나사 놓는 자리'}">${partArt('screw')}<span class="part-number-badge">${index + 1}</span><span class="point-caption">나사 ${index + 1}${screw.present && !screw.secured ? ' · 미체결' : ''}</span></button>`;
  }).join('');
}

export function renderPartsDock(s, ui) {
  if (!s) return '';
  const packButton = pack => `<button class="inventory-piece battery-pack-piece" data-piece="${data({ kind: 'battery-pack', batteryId: pack.id })}" aria-label="${pack.name} ${pack.charge}% 집기">${partArt('battery', pack.charge)}<span>${e(pack.name)}</span><small>${pack.charge}%</small></button>`;
  const spares = s.batteryPacks.filter(pack => pack.location === 'spare');
  const stored = s.batteryPacks.filter(pack => pack.location === 'tray');
  const part = (kind, index) => {
    const used = s.used.includes(`${ui.kitId}-${kind}-${index}`);
    const name = kind === 'blade' ? '날개' : '나사';
    return `<button class="inventory-piece ${used ? 'used-piece' : ''}" ${used ? 'disabled' : `data-piece="${data({ kind, index, kitId: ui.kitId })}"`} aria-label="새 ${name} ${index + 1} 집기">${partArt(kind)}<span>${name} ${index + 1}</span><small>${used ? '사용함' : ui.kitId}</small></button>`;
  };
  const ready = readyForMaintenance(s);
  return `<div class="parts-dock ${!ready ? 'preparation-dock' : ''}" aria-label="도구와 새 부품">${spares.length ? `<div class="battery-stock">${spares.map(packButton).join('')}</div>` : ''}${ready ? `<div class="dock-tools"><button class="inventory-piece tool-piece" data-piece="${data({ kind: 'driver' })}" aria-label="드라이버 집기">${partArt('driver')}<span>드라이버</span></button></div>
    <div class="new-parts"><label class="kit-choice" for="kit">새 부품 · 같은 포장<select id="kit" data-input="kit" aria-label="새 부품 포장 선택">${KITS.map(k => `<option value="${k.id}" ${ui.kitId === k.id ? 'selected' : ''}>${k.id} · ${k.marked ? 'Ⅱ 표식 있음' : '표식 없음'}</option>`).join('')}</select></label><div class="inventory-pieces">${part('blade', 0)}${part('blade', 1)}${part('screw', 0)}${part('screw', 1)}</div></div>
    ` : '<p class="dock-brief">기존 배터리는 수거함으로,<br>교체 배터리는 빈 장착 자리로 옮기세요.</p>'}<div class="discard-tray" role="group" data-drop="${data({ kind: 'discard' })}" aria-label="분리 부품 수거함"><div class="tray-drop-zone" role="button" tabindex="0" aria-label="수거함에 부품 놓기">${icon('download')}<strong>수거함</strong><span>${s.discarded.length ? `분리 부품 ${s.discarded.length}개` : '기존 날개·배터리를 놓으세요'}</span></div>${stored.length ? `<div class="stored-batteries">${stored.map(packButton).join('')}</div>` : ''}</div></div>`;
}

export function positionFlatPoints(host, ui) {
  const svg = host.querySelector('.drone-svg'), matrix = svg?.getScreenCTM();
  if (!matrix) return;
  const bounds = host.getBoundingClientRect(), p = motorProfile(ui.selected);
  for (const node of host.querySelectorAll('[data-anchor]')) {
    const anchor = node.dataset.anchor;
    let x, y;
    if (anchor === 'power') { x = 380; y = 400; }
    else if (anchor === 'battery') { x = 380; y = 380; }
    else if (anchor === 'battery-led') { x = 380; y = 310; }
    else if (anchor.startsWith('motor:')) { const m = motorProfile(anchor.slice(6)); x = m.x; y = m.y - 32; }
    else { const sign = anchor.endsWith('0') ? -1 : 1; x = p.x + sign * (anchor.startsWith('blade') ? 62 : 22); y = p.y + (anchor.startsWith('blade') ? sign * 20 : 35); }
    const point = new DOMPoint(x, y).matrixTransform(matrix);
    node.style.left = `${point.x - bounds.left}px`; node.style.top = `${point.y - bounds.top}px`;
  }
}

// Pointer gestures work with SVG and WebGL alike. Clicking to pick/place and
// keyboard activation use the same onPlace callback as an actual drag.
export function installPartInteraction(root, { onPlace, onMessage }) {
  let held = null, start = null, ghost = null, suppressedClick = null;
  const read = (node, key) => node?.dataset[key] ? JSON.parse(node.dataset[key]) : null;
  function clear() {
    held = null; start = null; ghost?.remove(); ghost = null;
    root.removeAttribute('data-holding');
    root.querySelectorAll('.picked-piece,.drop-hover').forEach(n => n.classList.remove('picked-piece', 'drop-hover'));
  }
  function pick(node) {
    held = read(node, 'piece'); root.dataset.holding = held.kind;
    node.classList.add('picked-piece');
    onMessage('놓을 자리를 클릭하세요. 취소: Esc');
  }
  function place(target) {
    const piece = held, destination = read(target, 'drop'); clear();
    if (destination) onPlace(piece, destination);
    else onMessage('이동을 취소했습니다. 부품은 그대로 있습니다.');
  }
  root.addEventListener('click', event => {
    if (suppressedClick && event.detail > 0 && performance.now() < suppressedClick.until
      && Math.hypot(event.clientX - suppressedClick.x, event.clientY - suppressedClick.y) < 6) {
      suppressedClick = null; event.preventDefault(); event.stopImmediatePropagation(); return;
    }
    const source = event.target.closest('[data-piece]'), target = event.target.closest('[data-drop]');
    if (held) {
      if (target) { event.preventDefault(); event.stopImmediatePropagation(); place(target); }
      else if (source) { event.preventDefault(); event.stopImmediatePropagation(); clear(); pick(source); }
      else clear();
    } else if (source && !source.disabled) {
      event.preventDefault(); event.stopImmediatePropagation(); pick(source);
    } else if (target && !source) {
      event.preventDefault(); event.stopImmediatePropagation(); onMessage('먼저 도구나 새 부품을 집어 이 자리에 놓으세요.');
    }
  }, true);
  root.addEventListener('pointerdown', event => {
    const source = event.target.closest('[data-piece]');
    if (!source || source.disabled || event.button !== 0 || held) return;
    event.stopPropagation(); event.preventDefault();
    source.focus({ preventScroll: true });
    start = { node: source, x: event.clientX, y: event.clientY, id: event.pointerId };
    source.setPointerCapture(event.pointerId);
  }, true);
  window.addEventListener('pointermove', event => {
    if (!start || start.id !== event.pointerId) return;
    if (!held && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 6) return;
    if (!held) {
      pick(start.node); ghost = document.createElement('div'); ghost.className = 'part-ghost';
      ghost.innerHTML = start.node.querySelector('.part-art')?.outerHTML || partArt('blade');
      ghost.setAttribute('aria-hidden', 'true'); document.body.append(ghost);
    }
    ghost.style.transform = `translate(${event.clientX + 12}px,${event.clientY + 12}px)`;
    root.querySelector('.drop-hover')?.classList.remove('drop-hover');
    document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-drop]')?.classList.add('drop-hover');
  });
  window.addEventListener('pointerup', event => {
    if (!start || start.id !== event.pointerId) return;
    if (held) {
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-drop]');
      suppressedClick = { x: event.clientX, y: event.clientY, until: performance.now() + 250 }; place(target);
    }
    start = null;
  });
  window.addEventListener('pointercancel', clear);
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && (held || start)) { event.preventDefault(); clear(); onMessage('선택을 취소했습니다.'); }
    const target = event.target.matches?.('.tray-drop-zone') ? event.target : null;
    if (target && ['Enter', ' '].includes(event.key)) { event.preventDefault(); target.click(); }
  });
  return { clear, get holding() { return Boolean(held || start); } };
}
