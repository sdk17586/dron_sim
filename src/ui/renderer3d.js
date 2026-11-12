import * as THREE from '../vendor/three/three.module.min.js';
import { SVGRenderer } from '../vendor/three/SVGRenderer.js';

export const CONTEXT_OPTIONS = Object.freeze({ alpha: false, antialias: true, depth: true, stencil: false, powerPreference: 'low-power' });

// Probe in a worker and bound unanswered capability checks before creating the visible renderer.
export function chooseRenderBackend({ compatible = false, timeout = 2500 } = {}) {
  if (compatible || typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return Promise.resolve('svg');
  return new Promise(resolve => {
    let worker, timer, finished = false;
    const finish = backend => {
      if (finished) return;
      finished = true; clearTimeout(timer); worker?.terminate(); resolve(backend);
    };
    try {
      worker = new Worker(new URL('./webgl-probe.js', import.meta.url), { type: 'module' });
      timer = setTimeout(() => finish('svg'), timeout);
      worker.onmessage = event => finish(event.data?.available ? 'webgl' : 'svg');
      worker.onerror = event => { event.preventDefault(); finish('svg'); };
      worker.postMessage(CONTEXT_OPTIONS);
    } catch { finish('svg'); }
  });
}

export function createRenderer3D({ compatible = false } = {}) {
  let renderer;
  if (!compatible) {
    try {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('webgl2', CONTEXT_OPTIONS);
      if (context) renderer = new THREE.WebGLRenderer({ canvas, context, ...CONTEXT_OPTIONS });
    } catch { /* Keep the 3D course available when acceleration is unavailable. */ }
  }
  renderer ||= new SVGRenderer();
  renderer.setPixelRatio?.(Math.min(globalThis.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
  renderer.domElement.dataset.renderBackend = renderer.isWebGLRenderer ? 'webgl' : 'svg';
  return renderer;
}

export function showRenderBackend(host, canvas) {
  host.querySelector('.render-mode-note')?.remove();
  if (canvas.dataset.renderBackend !== 'svg') return;
  const note = document.createElement('span'); note.className = 'render-mode-note'; note.textContent = '호환 3D';
  note.title = '현재 호환 표시를 사용 중입니다. 일부 각도에서 면 겹침이 보일 수 있습니다.';
  host.append(note);
}
