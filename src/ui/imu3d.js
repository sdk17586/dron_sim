import * as THREE from '../vendor/three/three.module.min.js';
import { SVGRenderer } from '../vendor/three/SVGRenderer.js';
import { IMU_POSES, requiredIMUPose, imuGuide } from '../domain/imu.js';
import { icon } from './shared.js';

const UP = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);
const orientations = IMU_POSES.map(p => ({ ...p, q: new THREE.Quaternion().setFromEuler(new THREE.Euler(...p.rotation)) }));

export function nearestIMUPose(quaternion) {
  // Gravity in body coordinates distinguishes six resting faces without depending on yaw or camera angle.
  const gravity = UP.clone().applyQuaternion(quaternion.clone().invert());
  return orientations.reduce((best, p) => {
    const dot = gravity.dot(UP.clone().applyQuaternion(p.q.clone().invert()));
    return !best || dot > best.dot ? { id: p.id, dot, q: p.q } : best;
  }, null);
}

export class IMUInteraction {
  constructor(viewport) {
    this.v = viewport; this.active = false; this.q = new THREE.Quaternion(); this.drag = null;
    this.abort = new AbortController();
    const options = { capture: true, signal: this.abort.signal };
    const canvas = viewport.canvas;
    canvas.addEventListener('pointerdown', event => this.down(event), options);
    canvas.addEventListener('pointermove', event => this.move(event), options);
    canvas.addEventListener('pointerup', event => this.up(event), options);
    canvas.addEventListener('pointercancel', () => this.cancel(), options);
    canvas.addEventListener('lostpointercapture', () => this.cancel(), options);
    canvas.addEventListener('keydown', event => this.key(event), options);
    this.bounds = new THREE.Box3().setFromObject(viewport.drone);
    this.axis = new THREE.Group();
    for (const [direction, color] of [[X, 0xbf5656], [UP, 0x4b9b69], [Z, 0x548bd0]]) this.axis.add(new THREE.ArrowHelper(direction, new THREE.Vector3(), 1.05, color, .2, .1));
    viewport.scene.add(this.axis); this.axis.visible = false;
    this.buildTarget();
  }
  send(action) { this.v.host?.dispatchEvent(new CustomEvent('imu-interaction', { bubbles: true, detail: action })); }
  buildTarget() {
    this.targetScene = new THREE.Scene(); this.targetScene.background = new THREE.Color('#eef4eb');
    this.targetCamera = new THREE.PerspectiveCamera(38, 210 / 120, .1, 50); this.targetCamera.position.set(11, 10, -13); this.targetCamera.lookAt(0, 0, 0);
    this.targetRenderer = new SVGRenderer(); this.targetRenderer.setSize(210, 120); this.targetRenderer.domElement.setAttribute('aria-hidden', 'true');
    this.targetModel = new THREE.Group(); this.targetScene.add(this.targetModel);
    this.targetGeometry = []; this.targetMaterials = [];
    const box = (size, position, color) => {
      const g = new THREE.BoxGeometry(...size), m = new THREE.MeshBasicMaterial({ color });
      this.targetGeometry.push(g); this.targetMaterials.push(m);
      const mesh = new THREE.Mesh(g, m); mesh.position.set(...position); this.targetModel.add(mesh); return mesh;
    };
    box([1.7, .65, 3], [0, 0, 0], '#d9e1ce');
    box([.7, .45, .5], [0, -.18, -1.7], '#285064');
    box([.8, .04, .25], [0, .35, -.7], '#d49c4a');
    for (const x of [-1, 1]) for (const z of [-1, 1]) {
      const arm = box([3, .18, .22], [x * 1.4, -.15, z * 1.1], '#a2b69b'); arm.rotation.y = -x * z * .38;
      box([1.7, .12, .25], [x * 2.6, .08, z * 1.65], '#41604a');
      box([.2, .7, .2], [x * 2.6, -.45, z * 1.65], '#71896b');
    }
  }
  sync(s) {
    this.s = s; this.active = true;
    if (this.attempt !== s.attempt) { this.cancel(false); this.attempt = s.attempt; this.q.identity(); }
    if (this.layer?.parentNode !== this.v.host) {
      this.cancel(false); this.layer?.remove();
      this.layer = document.createElement('div'); this.layer.className = 'imu-control-layer';
      this.layer.innerHTML = `<button type="button" class="imu-body-handle" data-imu-body aria-label="기체 자세 변경. 방향키로 90도씩 돌리거나 잡아 끄세요.">${icon('reset')}</button><span class="imu-body-caption">기체를 잡고 돌리세요</span><button type="button" class="imu-power-point" data-action="imu-power" aria-label="IMU 교육 기체 전원">${icon('power')}</button>`;
      this.v.host.append(this.layer);
      const body = this.layer.querySelector('[data-imu-body]');
      body.addEventListener('pointerdown', event => this.down(event, true));
      body.addEventListener('pointermove', event => this.move(event));
      body.addEventListener('pointerup', event => this.up(event));
      body.addEventListener('pointercancel', () => this.cancel());
      body.addEventListener('lostpointercapture', () => this.cancel());
      body.addEventListener('keydown', event => this.key(event));
      this.v.canvas.setAttribute('aria-label', 'IMU 교육 3D 기체. 본체를 잡고 끌면 자세가 바뀝니다. 빈 곳을 끌면 시점만 바뀝니다. 기체를 선택한 뒤 방향키로도 돌릴 수 있습니다.');
    }
    const task = imuGuide(s).current;
    this.layer.querySelector('[data-imu-body]').dataset.imuActive = String(task.target.selector === '[data-imu-body]' && s.status !== 'completed');
    const power = this.layer.querySelector('[data-action="imu-power"]'); power.dataset.imuActive = String(task.id === 'imu-power'); power.setAttribute('aria-pressed', String(s.power));
    const target = requiredIMUPose(s) || IMU_POSES[0];
    const targetHost = this.v.host.closest('.imu-stage')?.querySelector('[data-imu-target-view]');
    if (targetHost && this.targetRenderer.domElement.parentNode !== targetHost) targetHost.replaceChildren(this.targetRenderer.domElement);
    this.targetModel.quaternion.copy(orientations.find(p => p.id === target.id).q);
    this.targetRenderer.render(this.targetScene, this.targetCamera);
    this.apply();
  }
  apply() {
    if (!this.active) return;
    this.v.drone.quaternion.copy(this.q);
    let minY = Infinity;
    for (const x of [this.bounds.min.x, this.bounds.max.x]) for (const y of [this.bounds.min.y, this.bounds.max.y]) for (const z of [this.bounds.min.z, this.bounds.max.z]) minY = Math.min(minY, new THREE.Vector3(x, y, z).applyQuaternion(this.q).y);
    this.v.drone.position.set(0, .12 - minY, 0); this.v.drone.updateMatrixWorld(true);
    this.axis.visible = true; this.axis.position.copy(this.v.drone.localToWorld(new THREE.Vector3(0, 1.5, 0))); this.axis.quaternion.copy(this.q);
    this.v.canvas.dataset.imuPose = this.s.pose; this.v.canvas.dataset.imuDragging = String(Boolean(this.drag));
  }
  update() {
    if (!this.active || !this.layer || !this.v.host) return;
    const position = (node, point) => {
      const p = this.v.drone.localToWorld(point).project(this.v.camera), width = this.v.host.clientWidth, height = this.v.host.clientHeight;
      node.style.left = `${(p.x + 1) * width / 2}px`; node.style.top = `${(1 - p.y) * height / 2}px`;
      node.dataset.x = String((p.x + 1) * width / 2); node.dataset.y = String((1 - p.y) * height / 2);
      node.hidden = p.z > 1 || Math.abs(p.x) > .97 || Math.abs(p.y) > .97;
    };
    position(this.layer.querySelector('[data-imu-body]'), new THREE.Vector3(0, .95, -.3));
    position(this.layer.querySelector('.imu-body-caption'), new THREE.Vector3(0, .95, -.3));
    const power = this.layer.querySelector('[data-action="imu-power"]'); position(power, new THREE.Vector3(0, 1.48, .72));
    power.hidden ||= this.s.pose !== 'level' || Boolean(this.drag);
  }
  down(event, force = false) {
    if (!this.active || event.button !== 0 || !event.isPrimary || this.drag || this.s.status === 'completed') return;
    if (!force) {
      const rect = this.v.canvas.getBoundingClientRect();
      this.v.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      this.v.raycaster.setFromCamera(this.v.pointer, this.v.camera);
      const hit = this.v.raycaster.intersectObjects(this.v.drone.children, true).find(h => { for (let n = h.object; n; n = n.parent) if (!n.visible) return false; return true; });
      if (!hit) { this.selected = false; return; }
    }
    event.preventDefault(); event.stopImmediatePropagation();
    this.selected = true;
    this.drag = { x: event.clientX, y: event.clientY, id: event.pointerId, q: this.q.clone(), node: event.currentTarget };
    this.v.controls.enabled = false;
    event.currentTarget.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId);
    this.send({ type: 'MOVE_BEGIN' });
  }
  move(event) {
    if (!this.drag || this.drag.id !== event.pointerId) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const roll = THREE.MathUtils.clamp(-(event.clientX - this.drag.x) / 110, -2, 2) * Math.PI / 2;
    const pitch = THREE.MathUtils.clamp(-(event.clientY - this.drag.y) / 110, -2, 2) * Math.PI / 2;
    this.q.copy(this.drag.q).premultiply(new THREE.Quaternion().setFromAxisAngle(Z, roll)).premultiply(new THREE.Quaternion().setFromAxisAngle(X, pitch));
    this.apply(); this.v.render();
  }
  up(event) {
    if (!this.drag || event.pointerId !== this.drag.id) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const drag = this.drag; this.drag = null; this.v.controls.enabled = true;
    if (drag.node.hasPointerCapture(drag.id)) drag.node.releasePointerCapture(drag.id);
    const pose = nearestIMUPose(this.q); this.q.copy(pose.q); this.apply();
    this.send({ type: 'POSE', pose: pose.id }); this.v.render();
  }
  key(event) {
    if (!this.active || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || this.s.status === 'completed') return;
    if (event.currentTarget === this.v.canvas && !this.selected) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.repeat) return;
    this.cancel(false); this.send({ type: 'MOVE_BEGIN' });
    const axis = event.key.includes('Left') || event.key.includes('Right') ? Z : X;
    const sign = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? 1 : -1;
    this.q.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, sign * Math.PI / 2));
    const pose = nearestIMUPose(this.q); this.q.copy(pose.q); this.apply();
    this.send({ type: 'POSE', pose: pose.id }); this.v.render();
  }
  cancel(notify = true) {
    if (!this.drag) return;
    const drag = this.drag; this.drag = null; this.q.copy(drag.q); this.v.controls.enabled = true;
    if (drag.node.hasPointerCapture(drag.id)) drag.node.releasePointerCapture(drag.id);
    this.apply(); if (notify) this.send({ type: 'POSE', pose: nearestIMUPose(this.q).id });
    this.v.render();
  }
  deactivate() {
    this.cancel(false); this.active = false; this.layer?.remove(); this.axis.visible = false;
    this.v.drone.quaternion.identity(); this.v.drone.position.set(0, 0, 0);
    this.v.canvas.removeAttribute('data-imu-pose'); this.v.canvas.removeAttribute('data-imu-dragging');
    this.v.canvas.setAttribute('aria-label', '3D 드론. 빈 곳을 드래그해 회전하고 휠로 확대합니다. 모터의 번호로 점검할 위치를 선택하세요.');
  }
  dispose() {
    this.deactivate(); this.abort.abort(); this.axis.removeFromParent();
    this.axis.traverse(n => { n.geometry?.dispose(); n.material?.dispose(); });
    this.targetGeometry.forEach(g => g.dispose()); this.targetMaterials.forEach(m => m.dispose());
  }
}

export function configureIMU(viewport, state) {
  if (!state) { if (viewport.imuInteraction?.active) viewport.imuInteraction.deactivate(); return; }
  viewport.imuInteraction ||= new IMUInteraction(viewport);
  viewport.imuInteraction.sync(state);
}
