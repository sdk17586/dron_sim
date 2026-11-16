import * as THREE from '../vendor/three/three.module.min.js';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import { createRenderer3D, showRenderBackend, watchRendererContext, disposeRenderer3D } from './renderer3d.js';
import { ROBOT_LEGS } from '../domain/quadruped.js';
import { configureRobotWorkshop } from './spatial-maintenance.js';
import { CameraTravel, addStudioFinish } from './presentation3d.js';
import { loadGo2 } from './go2-model.js';
import { loadModelAsset, renderModelStatus } from './model-asset.js';
import { SCENE_COLORS } from './scene-theme.js';

// Shared depth-buffered rendering, with SVG available as a compatibility fallback.
export class QuadrupedViewport {
  constructor({ compatible = false, onUnavailable } = {}) {
    this.renderer = createRenderer3D({ compatible });
    this.canvas = this.renderer.domElement;
    this.canvas.classList.add('robot-3d-canvas');
    this.canvas.setAttribute('tabindex', '0'); this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', '사족보행 로봇 3D 모델. 끌어 회전, 휠로 확대, 방향키로 회전합니다. 다리 번호를 눌러 점검하세요.');
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(SCENE_COLORS.background);
    this.camera = new THREE.PerspectiveCamera(38, 1, .1, 60);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enablePan = false; this.controls.enableDamping = false;
    this.controls.minDistance = 2.5; this.controls.maxDistance = 18;
    this.controls.minPolarAngle = .15; this.controls.maxPolarAngle = Math.PI * .48;
    this.controls.addEventListener('change', () => this.draw());
    const svg = this.canvas.dataset.renderBackend === 'svg';
    this.scene.add(svg ? new THREE.AmbientLight('#ffffff', .62) : new THREE.HemisphereLight('#f0f6ff', SCENE_COLORS.groundLight, 2));
    const key = new THREE.DirectionalLight('#fff6df', svg ? .6 : 2.4); key.position.set(-4, 7, -6); this.scene.add(key);
    const fill = new THREE.DirectionalLight('#c7e1dc', svg ? .3 : 1.2); fill.position.set(6, 3, 4); this.scene.add(fill);
    this.materials = new Set(); this.geometries = new Set(); this.legs = new Map();
    this.body = new THREE.Group(); this.scene.add(this.body);
    this.buildStage();
    loadModelAsset(this, loadGo2);
    this.studio = addStudioFinish(this);
    this.travel = new CameraTravel(this);
    this.releaseContextWatch = watchRendererContext(this, onUnavailable);
    this.observer = new ResizeObserver(() => this.resize());
    this.canvas.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-'].includes(event.key)) return;
      event.preventDefault();
      const spherical = new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(this.controls.target));
      if (event.key === 'ArrowLeft') spherical.theta -= .14;
      if (event.key === 'ArrowRight') spherical.theta += .14;
      if (event.key === 'ArrowUp') spherical.phi -= .1;
      if (event.key === 'ArrowDown') spherical.phi += .1;
      if (event.key === '+' || event.key === '=') spherical.radius *= .9;
      if (event.key === '-') spherical.radius *= 1.1;
      spherical.phi = THREE.MathUtils.clamp(spherical.phi, this.controls.minPolarAngle, this.controls.maxPolarAngle);
      spherical.radius = THREE.MathUtils.clamp(spherical.radius, 2.5, 18);
      this.camera.position.copy(this.controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
      this.controls.update(); this.draw();
    });
  }
  mat(color) {
    const m = this.renderer.isWebGLRenderer
      ? new THREE.MeshStandardMaterial({ color, metalness: .24, roughness: .46 })
      : new THREE.MeshLambertMaterial({ color });
    this.materials.add(m); return m;
  }
  mesh(geometry, material, parent, position = [0, 0, 0]) {
    this.geometries.add(geometry); const m = new THREE.Mesh(geometry, material);
    m.position.set(...position); parent.add(m); return m;
  }
  box(x, y, z, material, parent = this.body, position) { return this.mesh(new THREE.BoxGeometry(x, y, z), material, parent, position); }
  cylinder(radius, length, material, parent, position) {
    const m = this.mesh(new THREE.CylinderGeometry(radius, radius, length, 12), material, parent, position); m.rotation.z = Math.PI / 2; return m;
  }
  buildTeachingParts() {
    const metal = this.mat('#b7c5bc'), dark = this.mat('#293f3b'), copper = this.mat('#c49b62');
    this.battery = this.box(.94, .32, .7, dark, this.body, [0, 2.42, .96]);
    this.box(.5, .03, .05, this.mat('#8cbe7c'), this.battery, [0, .18, 0]);
    this.stop = this.cylinder(.13, .08, this.mat('#b85e4b'), this.body, [0, 2.59, -.75]); this.stop.rotation.set(0, 0, 0);
    this.powerLight = this.box(.18, .025, .06, this.mat('#91bd73'), this.body, [.4, 2.54, -.75]);
    this.powerButton = this.mesh(new THREE.CylinderGeometry(.12,.12,.055,12),dark,this.body,[.44,2.57,-.75]);
    const powerGlyph=this.mesh(new THREE.TorusGeometry(.068,.009,4,18),metal,this.powerButton,[0,.033,0]);powerGlyph.rotation.x=-Math.PI/2;
    this.box(.012,.009,.06,metal,this.powerButton,[0,.038,-.045]);
    this.stands = new THREE.Group(); this.body.add(this.stands);
    for (const z of [-.8, .8]) {
      this.box(.4, 1.77, .3, metal, this.stands, [0, .92, z]);
      this.box(1.55, .16, .6, dark, this.stands, [0, .12, z]);
      this.box(1.32, .12, .45, copper, this.stands, [0, 1.8, z]);
    }
    for (const p of ROBOT_LEGS) {
      // Empty frames retain the gait state and service coordinates of the Go2 rig.
      const group = new THREE.Group(); group.position.x = p.x;
      const knee = new THREE.Group(); this.body.add(knee);
      const lower = new THREE.Group(); lower.rotation.x = .42;
      this.legs.set(p.id, { group, knee, lower });
    }
    this.frontArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, .15, -1.65), .9, '#c49b62', .3, .25);
    this.frontArrow.visible = false; this.body.add(this.frontArrow);
    this.frontArrow.traverse(o => { if (o.geometry) this.geometries.add(o.geometry); if (o.material) this.materials.add(o.material); });
  }
  buildStage() {
    const grid = new THREE.GridHelper(12, 20, SCENE_COLORS.gridMajor, SCENE_COLORS.gridMinor); this.scene.add(grid);
    if(this.canvas.dataset.renderBackend==='svg')grid.material.color.set(SCENE_COLORS.gridMinor);
    this.geometries.add(grid.geometry); this.materials.add(grid.material);
    const edgeGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-5.4, .025, -5.4), new THREE.Vector3(5.4, .025, -5.4),
      new THREE.Vector3(5.4, .025, 5.4), new THREE.Vector3(-5.4, .025, 5.4),
    ]);
    const edgeMaterial = new THREE.LineBasicMaterial({ color: '#6e9987' });
    this.driveBoundary = new THREE.LineLoop(edgeGeometry, edgeMaterial); this.driveBoundary.visible = false; this.scene.add(this.driveBoundary);
    this.geometries.add(edgeGeometry); this.materials.add(edgeMaterial);
  }
  attach(host) {
    if (this.host !== host) {
      this.observer.disconnect(); this.host = host; host.replaceChildren(this.canvas);
      showRenderBackend(host, this.canvas);
      this.labels = document.createElement('div'); this.labels.className = 'robot-model-labels'; host.append(this.labels);
      for (const p of ROBOT_LEGS) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'robot-model-label';
        b.dataset.action = 'robot-select-leg'; b.dataset.leg = p.id; b.textContent = p.short;
        b.setAttribute('aria-label', `${p.short}번 ${p.name} 다리 점검`); this.labels.append(b);
      }
      this.observer.observe(host);
    }
    this.controls.enabled = true; this.resize();
  }
  resize() {
    if (!this.host?.isConnected) return;
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    if (w !== this.width || h !== this.height) {
      this.width = w; this.height = h; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    }
    this.draw();
  }
  sync(state, ui) {
    this.state = state; this.ui = ui;
    if (this.canvas.dataset.modelStatus !== 'ready') { this.draw(); return; }
    this.body.position.set(0, 0, 0); this.body.rotation.y = 0;
    this.driveBoundary.visible = Boolean(ui.robotControllerMode); this.frontArrow.visible = Boolean(ui.robotControllerMode);
    this.controls.maxDistance = ui.robotControllerMode ? 28 : 18;
    this.controls.minDistance = ui.robotZoomed && !ui.robotControllerMode ? .85 : 2.5;
    this.canvas.setAttribute('aria-label', ui.robotControllerMode ? '사족보행 로봇 조종 연습장 3D 모델. 스틱으로 이동·회전합니다. 빈 곳을 끌어 시점을 회전하고 휠로 확대합니다.' : '사족보행 로봇 3D 모델. 끌어 회전, 휠로 확대, 방향키로 회전합니다. 다리 번호를 눌러 점검하세요.');
    this.battery.visible = state.battery; this.stands.visible = state.supported; this.powerLight.visible = state.power;
    this.stop.position.y = this.go2StopY - (state.estop ? .012 : 0);
    for (const p of ROBOT_LEGS) {
      const model = this.legs.get(p.id), l = state.legs[p.id];
      model.cartridge.visible = l.present;
      this.labels.querySelector(`[data-leg="${p.id}"]`).setAttribute('aria-pressed', String(ui.robotSelected === p.id));
    }
    const key = `${Boolean(ui.robotControllerMode)}:${ui.robotZoomed}:${ui.robotSelected}:${ui.robotControllerMode?state.power:''}`;
    if (this.cameraKey !== key) {
      const from = this.camera.position.clone(), look = this.controls.target.clone(), animate = this.cameraKey && ui.presentationMode;
      this.cameraKey = key;
      const model = this.legs.get(ui.robotSelected);
      const target = ui.robotZoomed ? model.service.anchor() : new THREE.Vector3(0, 1.2, 0);
      if(ui.robotControllerMode&&!state.power){target.x=ui.robotControllerState?.pose.x||0;target.z=ui.robotControllerState?.pose.z||0;}
      const offset = ui.robotControllerMode ? state.power?new THREE.Vector3(-10,7,-11):new THREE.Vector3(-3.8,3.5,-4.2) : ui.robotZoomed ? model.service.axis().multiplyScalar(1.65).add(new THREE.Vector3(0,.34,-.48)) : new THREE.Vector3(-4.8,3.2,-5.2);
      this.controls.target.copy(target); this.camera.position.copy(target).add(offset.multiplyScalar(this.camera.aspect < 1 ? 1.15 : 1)); this.controls.update();
      if (animate) {
        const destination = this.camera.position.clone();
        this.camera.position.copy(from); this.controls.target.copy(look);
        this.travel.move(target, destination, 850);
      }
    }
    this.canvas.dataset.modules = String(ROBOT_LEGS.filter(p => state.legs[p.id].present).length);
    this.canvas.dataset.damaged = String(ROBOT_LEGS.filter(p => state.legs[p.id].condition === 'damaged').length);
    this.canvas.dataset.supported = String(state.supported); this.canvas.dataset.testing = String(state.testing);
    this.canvas.dataset.battery = String(state.battery);this.canvas.dataset.power=String(state.power);
    if (state.testing && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) this.startMotion();
    else this.stopMotion();
    configureRobotWorkshop(this,state,ui);
    this.draw();
  }
  focusPowerButton(){
    if(this.canvas.dataset.modelStatus!=='ready')return;
    this.travel?.cancel();this.body.updateWorldMatrix(true,true);
    const target=this.powerButton.getWorldPosition(new THREE.Vector3());
    const offset=new THREE.Vector3(-2.6,3,-2.8).multiplyScalar(this.camera.aspect<1?1.3:1);
    this.controls.target.copy(target);this.camera.position.copy(target).add(offset);this.controls.update();this.draw();
    this.workshop?.entries.find(e=>e.id==='robot-body-power'||e.id==='robot-power')?.button.focus({preventScroll:true});
  }
  startMotion() {
    if (this.motion) return;
    const start = performance.now();
    this.motion = setInterval(() => {
      if (!this.host?.isConnected || document.hidden) return;
      const phase = (performance.now() - start) / 330;
      let i = 0;
      for (const model of this.legs.values()) model.lower.rotation.x = .42 + Math.sin(phase + i++ * Math.PI / 2) * .22;
      this.canvas.dataset.motionFrame = String((Number(this.canvas.dataset.motionFrame) || 0) + 1); this.draw();
    }, 90);
  }
  stopMotion() {
    clearInterval(this.motion); this.motion = null;
    for (const model of this.legs.values()) { model.lower.rotation.x = .42; model.group.rotation.x = 0; }
  }
  setDrive(s, active = false) {
    this.stopMotion();
    if (this.canvas.dataset.modelStatus !== 'ready') return;
    this.body.position.set(s.pose.x, 0, s.pose.z); this.body.rotation.y = s.pose.yaw;
    const animate = active && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (animate) {
      this.body.position.y = Math.sin(s.pose.phase * 2) * .025;
      for (const p of ROBOT_LEGS) {
        const model = this.legs.get(p.id), wave = Math.sin(s.pose.phase + (p.x === p.z ? 0 : Math.PI));
        model.group.rotation.x = wave * .16; model.lower.rotation.x = .42 - wave * .22;
      }
      this.canvas.dataset.motionFrame = String((Number(this.canvas.dataset.motionFrame) || 0) + 1);
    }
    Object.assign(this.canvas.dataset, { driveX: s.pose.x.toFixed(4), driveZ: s.pose.z.toFixed(4), driveYaw: s.pose.yaw.toFixed(4),
      driving: String(active), estop: String(s.estop), boundary: String(s.boundary) });
    this.draw();
  }
  draw() {
    if (!this.host?.isConnected) return;
    this.portedRig?.update();
    this.workshop?.update();
    this.renderer.render(this.scene, this.camera);
    const ready = renderModelStatus(this, 'Go2', 'robot-asset-note', loadGo2);
    if (this.labels) this.labels.hidden = !ready;
    if (!ready) return;
    if (this.labels) for (const p of ROBOT_LEGS) {
      const v = this.legs.get(p.id).knee.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, .57, 0)).project(this.camera);
      const b = this.labels.querySelector(`[data-leg="${p.id}"]`);
      b.style.left = `${(v.x + 1) * .5 * this.width}px`; b.style.top = `${(1 - v.y) * .5 * this.height}px`;
      b.hidden = this.ui?.immersiveMode || this.ui?.previewMode || this.ui?.robotControllerMode || Math.abs(v.x) > .97 || Math.abs(v.y) > .97 || v.z > 1;
    }
    this.canvas.dataset.modelTriangles = String(this.renderer.info?.render?.triangles ?? this.renderer.info?.render?.faces ?? 0);
  }
  detach() { this.travel?.cancel(); this.workshop?.detach(); this.stopMotion(); this.observer.disconnect(); this.controls.enabled = false; this.host = null; this.canvas.remove(); this.labels?.remove(); }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.releaseContextWatch?.();
    this.travel?.dispose(); this.studio?.dispose(); this.workshop?.dispose(); this.detach(); this.controls.dispose();
    disposeRenderer3D(this.renderer); this.geometries.forEach(g => g.dispose()); this.materials.forEach(m => m.dispose());
  }
}
