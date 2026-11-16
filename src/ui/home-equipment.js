import * as THREE from '../vendor/three/three.module.min.js';
import { createControllerAircraft } from '../domain/controller.js';
import { createRobotState } from '../domain/quadruped.js';
import { createPandaState } from '../domain/panda.js';

// Separate preview instances share asset templates, never course state or controls.
export class HomeEquipment {
  constructor(root, { compatible, onUnavailable } = {}) {
    this.root = root; this.views = new Map();
    this.observer = new ResizeObserver(() => this.views.forEach((view, kind) => this.frame(view, kind)));
    for (const host of root.querySelectorAll('[data-equipment-preview]')) this.mount(host.dataset.equipmentPreview, { compatible, onUnavailable });
  }
  async mount(kind, options) {
    const host = this.root.querySelector(`[data-equipment-preview="${kind}"]`);
    try {
      const module = kind === 'panda' ? await import('./panda3d.js') : kind === 'drone' ? await import('./drone3d.js') : await import('./quadruped3d.js');
      if (this.disposed || !host.isConnected) return;
      const view = kind === 'panda' ? new module.PandaViewport(options) : kind === 'drone' ? new module.DroneViewport({ ...options, onSelect() {} }) : new module.QuadrupedViewport(options);
      this.views.set(kind, view);
      view.attach(host);
      const state = kind === 'panda' ? createPandaState() : kind === 'drone' ? createControllerAircraft() : createRobotState();
      if (kind === 'robot') {
        state.power = false; state.estop = true; state.supported = false;
        Object.values(state.legs).forEach(leg => { leg.condition = 'healthy'; });
      }
      view.sync(state, { previewMode: true, selected: 'front-left', robotSelected: 'front-left', zoomed: false, robotZoomed: false });
      view.controls.enableZoom = false;
      view.canvas.setAttribute('aria-label', `${kind === 'panda' ? 'Franka Panda 로봇팔' : kind === 'drone' ? 'X500 드론' : 'Go2 사족보행 로봇'} 3D 미리보기. 끌거나 방향키로 회전해 살펴보세요.`);
      view.canvas.style.touchAction = 'pan-y';
      view.controls.touches.ONE = view.controls.touches.TWO = null;
      for (const object of view.scene.children) {
        if (object.type === 'GridHelper' || object.geometry?.type === 'ConeGeometry') object.visible = false;
      }
      // The same framing applies after a model retry as well as its initial load.
      const sync = view.sync.bind(view);
      view.sync = (...args) => { sync(...args); this.frame(view, kind); };
      this.observer.observe(host);
      await view.modelReady;
      if (!this.disposed) this.frame(view, kind);
    } catch {
      if (this.disposed || !host.isConnected) return;
      host.textContent = '미리보기를 준비하지 못했습니다. 교육 선택은 계속할 수 있습니다.';
      host.dataset.previewError = 'true';
    }
  }
  frame(view, kind) {
    if (this.disposed || !view.host?.isConnected || view.canvas.dataset.modelStatus !== 'ready') return;
    const root = view.drone || view.body, bounds = new THREE.Box3();
    root.updateWorldMatrix(true, true);
    root.traverseVisible(object => {
      if (!object.isMesh) return;
      if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
      bounds.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
    });
    if (bounds.isEmpty()) return;
    const center = bounds.getCenter(new THREE.Vector3());
    const direction = new THREE.Vector3(...(kind === 'panda' ? [1.3,1,1.4] : kind === 'drone' ? [7, 5.5, -8] : [-6, 2.8, -6])).normalize();
    view.camera.aspect = Math.max(1, view.host.clientWidth) / Math.max(1, view.host.clientHeight);
    view.camera.updateProjectionMatrix();
    view.camera.position.copy(center).add(direction); view.camera.lookAt(center);
    const inverse = view.camera.quaternion.clone().invert();
    const tanY = Math.tan(THREE.MathUtils.degToRad(view.camera.fov / 2)), tanX = tanY * view.camera.aspect;
    let distance = 0;
    root.traverseVisible(object => {
      if (!object.isMesh) return;
      const box = object.geometry.boundingBox;
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        const p = new THREE.Vector3(x, y, z).applyMatrix4(object.matrixWorld).sub(center).applyQuaternion(inverse);
        distance = Math.max(distance, p.z + Math.abs(p.x) / tanX, p.z + Math.abs(p.y) / tanY);
      }
    });
    distance *= 1.15;
    view.controls.minDistance = view.controls.maxDistance = distance;
    view.controls.target.copy(center); view.camera.position.copy(center).addScaledVector(direction, distance);
    view.controls.update();
    (view.draw || view.render).call(view);
    view.canvas.dataset.homePreview = kind;
  }
  dispose() {
    this.disposed = true; this.observer.disconnect();
    this.views.forEach(view => view.dispose()); this.views.clear();
  }
}
