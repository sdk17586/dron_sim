import { PROFILE } from '../content/aircraft-profiles.js';

// Cheap projected rotor planes keep the SVG compatibility view responsive.
// Only the rotor silhouettes animate; the detailed 3D scene stays demand-driven.
export function rotorPreviewMarkup(flat = false) {
  return PROFILE.motors.map((p, i) => `<g data-preview-motor="${p.id}"${flat ? ` transform="translate(${p.x} ${p.y}) scale(68)"` : ''}><circle r="1.52" fill="#55785a" fill-opacity=".09" stroke="#537458" stroke-width=".018"/><g class="rotor-motion ${i % 2 ? 'reverse-motion' : ''}"><path d="M-.12-.08C-.5-.25-1.2-.22-1.5-.1Q-1.62 0-1.48.1C-1 .22-.5.17-.12.08ZM.12.08C.5.25 1.2.22 1.5.1Q1.62 0 1.48-.1C1-.22.5-.17.12-.08Z" fill="#344f40"/><path d="M-1.4-.24A1.44 1.44 0 0 1-.24-1.4M1.4.24A1.44 1.44 0 0 1 .24 1.4" fill="none" stroke="#719875" stroke-width=".055" stroke-linecap="round"/></g></g>`).join('');
}
const motions = new WeakMap();
export function applyRotorMotion(layer, level) {
  layer.toggleAttribute('hidden', level <= 0);
  layer.setAttribute('data-rotation', String(Math.round(level * 100)));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const running = motions.get(layer);
  if (running) {
    running.level = level;
    if (level > 0 && !reduced) return;
    clearInterval(running.timer); motions.delete(layer);
  }
  const nodes = [...layer.querySelectorAll('.rotor-motion')];
  if (level <= 0 || reduced) {
    for (const node of nodes) node.setAttribute('transform', 'rotate(0)');
    return;
  }
  const motion = { level, angle: 0, last: performance.now(), frames: 0 };
  // Update four lightweight SVG transforms at 20 Hz, never the whole mesh.
  // A timer also works on devices whose graphics animation clock is unavailable.
  motion.timer = setInterval(() => {
    const now = performance.now(), elapsed = Math.min(100, now - motion.last); motion.last = now;
    motion.angle = (motion.angle + elapsed * (120 + motion.level * 600) / 1000) % 360;
    for (const node of nodes) node.setAttribute('transform', `rotate(${node.classList.contains('reverse-motion') ? -motion.angle : motion.angle})`);
    layer.dataset.frames = String(++motion.frames);
  }, 50);
  motions.set(layer, motion);
}
export function stopRotorPreviews(root) {
  for (const layer of root.querySelectorAll('.rotor-preview-layer,[data-flat-rotor-preview]')) applyRotorMotion(layer, 0);
}
export function updateFlatRotorPreview(root, level) {
  const svg = root.querySelector('.drone-svg'), layer = svg?.querySelector('[data-flat-rotor-preview]');
  if (!layer) return;
  applyRotorMotion(layer, level); svg.dataset.rotorDemand = String(Math.round(level * 100));
  for (const node of svg.querySelectorAll('.static-propeller')) node.setAttribute('visibility', level > 0 ? 'hidden' : 'visible');
}
