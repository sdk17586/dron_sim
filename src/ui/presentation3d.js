import * as THREE from '../vendor/three/three.module.min.js';

// One reusable camera move; pointer interaction always gives control back.
export class CameraTravel {
  constructor(view) {
    this.view = view;
    this.cancelOnInput = () => this.cancel();
    view.canvas.addEventListener('pointerdown', this.cancelOnInput, true);
    view.canvas.addEventListener('wheel', this.cancelOnInput, { passive: true });
  }
  move(target, position, duration = 800) {
    this.cancel();
    const v = this.view;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) duration = 0;
    const from = v.camera.position.clone(), look = v.controls.target.clone(), start = performance.now();
    const frame = now => {
      if (!v.host?.isConnected) return;
      const t = duration ? Math.min(1, (now - start) / duration) : 1;
      const smooth = t * t * (3 - 2 * t);
      v.camera.position.lerpVectors(from, position, smooth);
      v.controls.target.lerpVectors(look, target, smooth);
      v.controls.update();
      (v.draw || v.render).call(v);
      if (t < 1) this.frame = requestAnimationFrame(frame);
      else this.frame = null;
    };
    frame(start);
  }
  cancel() { cancelAnimationFrame(this.frame); this.frame = null; }
  dispose() {
    this.cancel();
    this.view.canvas.removeEventListener('pointerdown', this.cancelOnInput, true);
    this.view.canvas.removeEventListener('wheel', this.cancelOnInput);
  }
}

export function addStudioFinish(view, { shadow = true } = {}) {
  const svg = view.canvas.dataset.renderBackend === 'svg';
  const rim = new THREE.DirectionalLight('#d7e9ff', svg ? .12 : 1.5);
  rim.position.set(3, 5, 1); view.scene.add(rim);
  const resources = [], group = new THREE.Group(); view.scene.add(group);
  if (shadow) {
    if (svg) {
      // Geometry-only contact shade also works without a GPU or texture loading.
      for (let i = 0; i < 7; i++) {
        const g = new THREE.CircleGeometry(1, 40);
        const m = new THREE.MeshBasicMaterial({ color: new THREE.Color('#edf2ee').lerp(new THREE.Color('#7a8d85'), (i + 1) * .025), depthWrite: false });
        const disk = new THREE.Mesh(g, m); disk.rotation.x = -Math.PI / 2;
        disk.scale.set(1.65 - i * .09, 2.05 - i * .11, 1); disk.position.y = .002 + i * .001;
        group.add(disk); resources.push(g, m);
      }
    } else {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
      const ctx = canvas.getContext('2d'), gradient = ctx.createRadialGradient(64, 64, 6, 64, 64, 64);
      gradient.addColorStop(0, 'rgba(21,42,37,.38)'); gradient.addColorStop(1, 'rgba(21,42,37,0)');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
      const texture = new THREE.CanvasTexture(canvas), geometry = new THREE.PlaneGeometry(4.2, 5);
      const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
      const mesh = new THREE.Mesh(geometry, material); mesh.rotation.x = -Math.PI / 2; mesh.position.y = .015;
      group.add(mesh); resources.push(texture, geometry, material);
    }
  }
  return { dispose() { rim.removeFromParent(); group.removeFromParent(); resources.forEach(r => r.dispose()); } };
}
