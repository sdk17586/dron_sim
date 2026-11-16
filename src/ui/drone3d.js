import * as THREE from '../vendor/three/three.module.min.js';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import { createRenderer3D, showRenderBackend, watchRendererContext, disposeRenderer3D } from './renderer3d.js';
import { renderRepairPoints } from './parts.js';
import { PROFILE } from '../content/aircraft-profiles.js';
import { SCENARIO } from '../content/scenarios.js';
import { createBatteryPacks, installedBattery, batteryColor, chargeFraction } from '../domain/battery.js';
import { rotorPreviewMarkup, applyRotorMotion } from './rotor-preview.js';
import { motorStatus, motorStatusLabel } from './motor-status.js';
import { configureDroneWorkshop } from './spatial-maintenance.js';
import { configureIMU } from './imu3d.js';
import { addStudioFinish } from './presentation3d.js';
import { loadX500 } from './x500-model.js';
import { loadModelAsset, renderModelStatus } from './model-asset.js';
import { SCENE_COLORS } from './scene-theme.js';
import { DRONE_MOVE_LIMIT } from '../domain/controller.js';

function roundedGeometry(width, depth, height, radius = .16) {
  const x = -width / 2, z = -depth / 2, s = new THREE.Shape();
  s.moveTo(x + radius, z);
  s.lineTo(x + width - radius, z); s.quadraticCurveTo(x + width, z, x + width, z + radius);
  s.lineTo(x + width, z + depth - radius); s.quadraticCurveTo(x + width, z + depth, x + width - radius, z + depth);
  s.lineTo(x + radius, z + depth); s.quadraticCurveTo(x, z + depth, x, z + depth - radius);
  s.lineTo(x, z + radius); s.quadraticCurveTo(x, z, x + radius, z);
  const geometry = new THREE.ExtrudeGeometry(s, { depth: height, bevelEnabled: true,
    bevelSegments: 2, bevelSize: .045, bevelThickness: .04, curveSegments: 5, steps: 1 });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

export class DroneViewport {
  constructor({ onSelect, onUnavailable, renderer = null, compatible = false }) {
    this.onSelect = onSelect;
    this.onUnavailable = onUnavailable;
    this.host = null;
    this.cameraKey = '';
    this.materials = {};
    this.geometries = new Set();
    this.labels = new Map();
    this.motors = new Map();
    this.previewLevel = 0;
    renderer ||= createRenderer3D({ compatible });
    this.renderer = renderer;
    this.canvas = renderer.domElement;
    this.canvas.classList.add('drone-3d-canvas');
    this.canvas.setAttribute('tabindex', '0');
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', '3D 드론. 빈 곳을 드래그해 회전하고 휠로 확대합니다. 모터의 번호로 점검할 위치를 선택하세요.');
    this.renderer.setPixelRatio?.(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SCENE_COLORS.background);
    this.camera = new THREE.PerspectiveCamera(39, 1, .1, 80);
    this.camera.position.set(8.5, 8, -10);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.target.set(0, .8, 0);
    this.controls.minDistance = 2;
    this.controls.maxDistance = 23;
    this.controls.minPolarAngle = .06;
    this.controls.maxPolarAngle = Math.PI * .49;
    this.controls.enablePan = false;
    this.controls.enableDamping = false;
    this.controls.zoomSpeed = .75;
    this.controls.addEventListener('change', () => this.render());
    const svg = this.canvas.tagName.toLowerCase() === 'svg';
    const lightScale = svg ? .17 : 1;
    this.scene.add(new THREE.HemisphereLight('#f0f6ff', SCENE_COLORS.groundLight, 2.8 * lightScale));
    if (svg) this.scene.add(new THREE.AmbientLight(0xffffff, .4));
    const key = new THREE.DirectionalLight(0xfffcf0, 3.4 * lightScale); key.position.set(-4, 9, -5); this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xcbded5, 1.5 * lightScale); fill.position.set(5, 4, 6); this.scene.add(fill);
    this.drone = new THREE.Group(); this.scene.add(this.drone);
    this.buildStage();
    loadModelAsset(this, loadX500);
    this.studio = addStudioFinish(this, { shadow: false });
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.canvas.addEventListener('pointerdown', event => {
      if (this.ui?.immersiveMode || this.ui?.imuMode) return;
      if (event.isPrimary) this.down = { x: event.clientX, y: event.clientY, id: event.pointerId, button: event.button };
    });
    this.canvas.addEventListener('pointerup', event => {
      if (this.ui?.immersiveMode || this.ui?.imuMode) return;
      if (!this.down || this.down.id !== event.pointerId || this.down.button !== 0) return;
      const distance = Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y);
      this.down = null;
      if (distance > 6) return;
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hit = this.raycaster.intersectObjects(this.drone.children, true).find(h => {
        let object = h.object;
        while (object && object !== this.drone) { if (!object.visible) return false; object = object.parent; }
        return h.object.material?.visible !== false;
      });
      let object = hit?.object;
      while (object && !object.userData.motorId) object = object.parent;
      if (object?.userData.motorId) this.onSelect(object.userData.motorId);
    });
    this.canvas.addEventListener('pointercancel', () => { this.down = null; });
    this.canvas.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-'].includes(event.key)) return;
      event.preventDefault();
      const offset = this.camera.position.clone().sub(this.controls.target);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      if (event.key === 'ArrowLeft') spherical.theta -= .15;
      if (event.key === 'ArrowRight') spherical.theta += .15;
      if (event.key === 'ArrowUp') spherical.phi -= .12;
      if (event.key === 'ArrowDown') spherical.phi += .12;
      if (event.key === '+' || event.key === '=') spherical.radius *= .9;
      if (event.key === '-') spherical.radius *= 1.1;
      spherical.phi = THREE.MathUtils.clamp(spherical.phi, this.controls.minPolarAngle, this.controls.maxPolarAngle);
      spherical.radius = THREE.MathUtils.clamp(spherical.radius, this.controls.minDistance, this.controls.maxDistance);
      this.camera.position.copy(this.controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
      this.controls.update(); this.render();
    });
    this.releaseContextWatch = watchRendererContext(this, () => this.onUnavailable?.());
    this.resizeObserver = new ResizeObserver(() => this.resize());
  }

  material(name, color, extra = {}) {
    if (!this.materials[name]) this.materials[name] = new THREE.MeshStandardMaterial({ color, roughness: .65, metalness: .12, ...extra });
    return this.materials[name];
  }
  mesh(geometry, material, parent = this.drone, position = [0, 0, 0]) {
    this.geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...position); parent.add(mesh); return mesh;
  }
  box(width, height, depth, material, parent, position) { return this.mesh(new THREE.BoxGeometry(width, height, depth), material, parent, position); }
  cylinder(radius, height, material, parent, position) { return this.mesh(new THREE.CylinderGeometry(radius, radius, height, 24), material, parent, position); }

  buildTeachingParts() {
    const edge = this.material('edge', '#9eac98'), dark = this.material('dark', '#293c33');
    const metal = this.material('metal', '#aab6a5', { metalness: .72, roughness: .33 });
    const bronze = this.material('bronze', '#c69e63', { metalness: .5 });
    this.battery = new THREE.Group(); this.drone.add(this.battery);
    this.mesh(roundedGeometry(.92, .65, .31, .08), edge, this.battery);
    for (let i = 0; i < 4; i++) this.box(.08, .015, .025, bronze, this.battery, [i * .14 - .21, .36, 0]);
    this.materials['battery-led'] = new THREE.MeshBasicMaterial({ color: batteryColor(20) });
    this.batteryLED = this.box(1, .028, .09, this.materials['battery-led'], this.drone);
    this.power = this.cylinder(.075, .018, dark, this.drone);
    this.powerLight = this.cylinder(.022, .02, this.material('power-on', '#b3c58c', { emissive: '#667745' }), this.drone);
    for (const profile of PROFILE.motors) {
      const group = new THREE.Group(); group.userData.motorId = profile.id; this.drone.add(group);
      const blades = [], screws = [];
      for (let i = 0; i < 2; i++) {
        const blade = new THREE.Group(); blade.rotation.y = i * Math.PI; blade.position.y = .29; group.add(blade);
        if (profile.marked) for (const x of [-.34, -.4]) this.box(.025, .02, .21, bronze, blade, [x, .057, 0]);
        blades.push({ group: blade });
        const screwGroup = new THREE.Group(); screwGroup.rotation.y = blade.rotation.y; group.add(screwGroup);
        this.cylinder(.085, .06, metal, screwGroup, [-.15, .386, 0]);
        this.box(.11, .009, .02, dark, screwGroup, [-.15, .419, 0]);
        this.box(.02, .009, .11, dark, screwGroup, [-.15, .419, 0]);
        screws.push(screwGroup);
      }
      this.motors.set(profile.id, { group, blades, screws });
    }
  }

  buildStage() {
    const grid = new THREE.GridHelper(18, 36, SCENE_COLORS.gridMajor, SCENE_COLORS.gridMinor); grid.position.y = -.09;
    if(this.canvas.dataset.renderBackend==='svg')grid.material.color.set(SCENE_COLORS.gridMinor);
    grid.material.transparent = true; grid.material.opacity = .65; grid.material.depthWrite = false; this.scene.add(grid);
    this.geometries.add(grid.geometry); this.gridMaterial = grid.material;
    const extent = DRONE_MOVE_LIMIT + 4.5;
    const boundaryGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-extent, -.06, -extent), new THREE.Vector3(extent, -.06, -extent),
      new THREE.Vector3(extent, -.06, extent), new THREE.Vector3(-extent, -.06, extent),
    ]);
    this.materials['flight-boundary'] = new THREE.LineBasicMaterial({ color: '#4b9d9b' });
    this.driveBoundary = new THREE.LineLoop(boundaryGeometry, this.materials['flight-boundary']);
    this.geometries.add(boundaryGeometry); this.driveBoundary.visible = false; this.scene.add(this.driveBoundary);
    this.shadowGroup = new THREE.Group(); this.scene.add(this.shadowGroup);
    // A static soft contact shadow avoids a continuously updated shadow map.
    if (this.canvas.tagName.toLowerCase() !== 'svg') {
    const shade = document.createElement('canvas'); shade.width = shade.height = 128;
    const paint = shade.getContext('2d'), gradient = paint.createRadialGradient(64, 64, 10, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(0,3,8,.65)'); gradient.addColorStop(1, 'rgba(0,3,8,0)');
    paint.fillStyle = gradient; paint.fillRect(0, 0, 128, 128);
    this.shadowTexture = new THREE.CanvasTexture(shade);
    this.shadowMaterial = new THREE.MeshBasicMaterial({ map: this.shadowTexture, transparent: true, depthWrite: false });
    const shadow = this.mesh(new THREE.PlaneGeometry(7.8, 6.8), this.shadowMaterial, this.shadowGroup, [0, -.07, .1]); shadow.rotation.x = -Math.PI / 2;
    }
    this.frontMarker = this.mesh(new THREE.ConeGeometry(.12, .34, 3), this.material('front', '#8a9f76'), this.scene, [0, -.05, -3.1]); this.frontMarker.rotation.x = -Math.PI / 2;
  }

  attach(host) {
    if (this.host !== host) {
      if (this.rotorLayer) applyRotorMotion(this.rotorLayer, 0);
      this.resizeObserver.disconnect(); this.host = host;
      host.replaceChildren(this.canvas);
      showRenderBackend(host, this.canvas);
      this.rotorLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      this.rotorLayer.classList.add('rotor-preview-layer'); this.rotorLayer.setAttribute('aria-hidden', 'true');
      this.rotorLayer.innerHTML = rotorPreviewMarkup(); host.append(this.rotorLayer);
      applyRotorMotion(this.rotorLayer, this.previewLevel);
      this.labelLayer = document.createElement('div'); this.labelLayer.className = 'three-labels'; host.append(this.labelLayer);
      this.repairLayer = document.createElement('div'); this.repairLayer.className = 'repair-points'; host.append(this.repairLayer);
      this.labels.clear();
      for (const p of PROFILE.motors) {
        const label = document.createElement('button'); label.type = 'button'; label.className = 'three-motor-label';
        label.dataset.action = 'select-motor'; label.dataset.motor = p.id;
        label.textContent = p.short; label.title = `${p.name} 모터 선택`;
        label.setAttribute('aria-label', `${p.name} 모터 선택`); this.labelLayer.append(label); this.labels.set(p.id, label);
      }
      this.resizeObserver.observe(host);
    }
    this.canvas.dataset.renderer = 'threejs';
    this.controls.enabled = true; this.resize(false);
  }
  detach() { cancelAnimationFrame(this.poseFrame); this.poseFrame = null; this.travel?.cancel(); this.imuInteraction?.deactivate(); this.workshop?.detach(); this.resizeObserver.disconnect(); this.host = null; this.controls.enabled = false; this.canvas.remove(); if (this.rotorLayer) applyRotorMotion(this.rotorLayer, 0); this.rotorLayer?.remove(); }
  resize(draw = true) {
    if (!this.host?.isConnected) return;
    const width = Math.max(1, this.host.clientWidth), height = Math.max(1, this.host.clientHeight);
    if (width === this.width && height === this.height) return;
    this.width = width; this.height = height;
    this.renderer.setSize(width, height, false); this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
    if (draw) this.render();
  }
  sync(state, ui) {
    this.syncing = true;
    this.state = state;
    this.ui = ui;
    if (this.canvas.dataset.modelStatus !== 'ready') { this.syncing = false; this.render(); return; }
    if (!ui.controllerMode) this.previewLevel = 0;
    applyRotorMotion(this.rotorLayer, this.previewLevel);
    this.repairLayer.innerHTML = ui.immersiveMode || ui.imuMode ? '' : renderRepairPoints(state, ui);
    for (const p of PROFILE.motors) {
      const model = this.motors.get(p.id), motor = state?.motors[p.id];
      this.labels.get(p.id).hidden = Boolean(ui.controllerMode || ui.previewMode);
      this.labels.get(p.id)?.setAttribute('aria-pressed', String(ui.selected === p.id));
      const label = this.labels.get(p.id), status = ui.controllerMode ? '' : motorStatus(state, p.id);
      label.dataset.inspection = status;
      label.title = `${p.short}번 ${p.name}${status ? ` · ${motorStatusLabel(status)}` : ''}`;
      label.setAttribute('aria-label', `${p.name} 모터 선택${status ? ` · ${motorStatusLabel(status)}` : ''}`);
      for (let i = 0; i < 2; i++) {
        const blade = motor?.blades[i], damaged = blade ? blade.condition === 'damaged' : p.id === SCENARIO.target && i === 0;
        model.blades[i].group.visible = !this.previewLevel && (blade?.present ?? true);
        model.blades[i].good.visible = !damaged; model.blades[i].damaged.visible = damaged;
        model.blades[i].group.position.y = ui.exploded ? 1 : .29;
        model.screws[i].visible = motor?.screws[i].present ?? true;
        model.screws[i].position.y = ui.exploded ? 1.2 : 0;
        model.screws[i].rotation.set(0,model.blades[i].group.rotation.y,0);
      }
    }
    this.battery.visible = state?.battery ?? true;
    this.battery.position.copy(this.x500BatteryPosition);
    this.setBatteryIndicator(state ? installedBattery(state) : createBatteryPacks()[0], false);
    this.powerLight.visible = state?.power ?? false;
    const key = `${Boolean(ui.imuMode)}:${Boolean(ui.controllerMode)}:${ui.zoomed}:${ui.zoomed ? ui.selected : ''}:${ui.topView}`;
    if (this.cameraKey !== key) {
      this.cameraKey = key;
      const target = ui.imuMode ? new THREE.Vector3(0, 4.1, 0) : ui.zoomed ? this.motors.get(ui.selected).group.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0, 2.7, 0);
      const ratio = this.camera.aspect < 1 ? 1.25 : 1;
      const offset = ui.topView ? new THREE.Vector3(0, ui.zoomed ? 4.8 : 11.5 * ratio, .001)
        : ui.zoomed ? new THREE.Vector3(2.6, 3.8, -3.4) : new THREE.Vector3(8.5 * ratio, 8 * ratio, -10 * ratio);
      if (ui.imuMode) offset.set(8 * ratio, 7 * ratio, -16 * ratio);
      if (ui.controllerMode) offset.set(12 * ratio, 11 * ratio, -16 * ratio);
      this.controls.maxDistance = ui.controllerMode ? 32 : 23;
      this.controls.target.copy(target); this.camera.position.copy(target).add(offset); this.controls.update();
    }
    this.canvas.dataset.selectedMotor = ui.selected;
    this.canvas.dataset.blades = String([...this.motors.values()].reduce((n, m) => n + m.blades.filter(b => b.group.visible).length, 0));
    this.canvas.dataset.screws = String([...this.motors.values()].reduce((n, m) => n + m.screws.filter(b => b.visible).length, 0));
    this.canvas.dataset.exploded = String(ui.exploded);
    this.canvas.dataset.rotorDemand = String(Math.round(this.previewLevel * 100));
    configureDroneWorkshop(this,state,ui);
    if (ui.imuMode && !this.imuInteraction?.active) {
      this.drone.position.set(0, 0, 0); this.drone.quaternion.identity(); this.drone.updateMatrixWorld(true);
    }
    configureIMU(this, ui.imuMode ? ui.imuState : null);
    this.setControllerPose(ui.controllerMode ? ui.controllerState : null, false);
    this.syncing = false; this.render();
  }
  setControllerPose(state, draw = true) {
    if (this.canvas.dataset.modelStatus !== 'ready') return;
    const active = Boolean(this.ui?.controllerMode), pose = active && state?.pose ? state.pose : { x: 0, z: 0, yaw: 0 };
    this.driveBoundary.visible = active && Boolean(state?.flightReady);
    if (!this.ui?.imuMode) {
      this.drone.position.set(pose.x, active && state?.flightReady && state.aircraftPower ? .7 : 0, pose.z);
      this.drone.rotation.set(0, pose.yaw, 0);
    }
    this.shadowGroup.position.set(pose.x, 0, pose.z); this.shadowGroup.rotation.y = pose.yaw;
    this.frontMarker.position.set(0, -.05, active ? -5 : -3.1).applyAxisAngle(new THREE.Vector3(0, 1, 0), pose.yaw);
    this.frontMarker.position.x += pose.x; this.frontMarker.position.z += pose.z;
    this.frontMarker.rotation.set(-Math.PI / 2, 0, pose.yaw);
    Object.assign(this.canvas.dataset, { moveX: pose.x.toFixed(4), moveZ: pose.z.toFixed(4), moveYaw: pose.yaw.toFixed(4),
      moving: String(active && Boolean(state?.moving)), moveBoundary: String(active && Boolean(state?.boundary)) });
    if (draw) {
      if (active && this.renderer.isWebGLRenderer) {
        // Coalesce input ticks into display frames instead of queuing GPU renders.
        this.poseFrame ||= requestAnimationFrame(() => { this.poseFrame = null; this.render(); });
      } else this.render();
    }
  }
  setRotorPreview(level) {
    const next = this.ui?.controllerMode ? Math.max(0, Math.min(1, level)) : 0;
    const changed = Boolean(this.previewLevel) !== Boolean(next);
    this.previewLevel = next; this.canvas.dataset.rotorDemand = String(Math.round(next * 100));
    if (this.rotorLayer) applyRotorMotion(this.rotorLayer, next);
    if (changed) {
      for (const [id, model] of this.motors) for (let i = 0; i < 2; i++) model.blades[i].group.visible = !next && (this.state?.motors[id].blades[i].present ?? true);
      this.render();
    }
  }
  setBatteryIndicator(pack, draw = true) {
    if (this.canvas.dataset.modelStatus !== 'ready') return;
    const ratio = chargeFraction(pack?.charge ?? 0);
    this.batteryLED.visible = Boolean(pack && ratio > 0);
    this.batteryLED.scale.x = Math.max(.00001, ratio);
    this.batteryLED.position.x = -.5 + ratio * .5;
    this.batteryLED.position.y=this.x500LEDPosition.y;this.batteryLED.position.z=this.x500LEDPosition.z;
    this.batteryLED.material.color.set(batteryColor(pack?.charge ?? 0));
    this.canvas.dataset.batteryId = pack?.id || '';
    this.canvas.dataset.batteryLevel = pack ? String(pack.charge) : '';
    this.canvas.dataset.batteryInstalled = String(Boolean(pack));
    this.canvas.dataset.ledFill = String(ratio);
    if (draw) this.render();
  }
  render() {
    if (!this.host?.isConnected || this.syncing) return;
    this.workshop?.update();
    this.renderer.render(this.scene, this.camera);
    this.imuInteraction?.update();
    const ready = renderModelStatus(this, 'X500', 'drone-asset-note', loadX500);
    this.labelLayer.hidden = this.repairLayer.hidden = !ready;
    this.rotorLayer.style.display = ready ? '' : 'none';
    if (!ready) return;
    const width = this.host.clientWidth, height = this.host.clientHeight;
    this.rotorLayer.setAttribute('viewBox', `0 0 ${width} ${height}`);
    for (const p of PROFILE.motors) {
      const center = this.motors.get(p.id).group.localToWorld(new THREE.Vector3(0, .03, 0));
      const project = v => { const q = v.project(this.camera); return [(q.x + 1) * .5 * width, (-q.y + 1) * .5 * height]; };
      const rotorScale=1.7;
      const c = project(center.clone()), x = project(center.clone().add(new THREE.Vector3(rotorScale, 0, 0))), z = project(center.clone().add(new THREE.Vector3(0, 0, rotorScale)));
      this.rotorLayer.querySelector(`[data-preview-motor="${p.id}"]`).setAttribute('transform', `matrix(${x[0]-c[0]} ${x[1]-c[1]} ${z[0]-c[0]} ${z[1]-c[1]} ${c[0]} ${c[1]})`);
    }
    for (const p of PROFILE.motors) {
      const position = this.motors.get(p.id).group.localToWorld(new THREE.Vector3(0, .83, .05)).project(this.camera);
      const label = this.labels.get(p.id); if (!label) continue;
      label.style.left = `${(position.x + 1) * .5 * width}px`;
      label.style.top = `${(-position.y + 1) * .5 * height}px`;
      label.hidden = this.ui?.immersiveMode || this.ui?.controllerMode || this.ui?.previewMode || position.z > 1 || Math.abs(position.x) > .98 || Math.abs(position.y) > .98;
    }
    for (const node of this.repairLayer.querySelectorAll('[data-anchor]')) {
      const anchor = node.dataset.anchor;
      let position;
      if (anchor === 'power') position = this.power.getWorldPosition(new THREE.Vector3());
      else if (anchor === 'battery') position = this.battery.localToWorld(new THREE.Vector3(0,.2,.3));
      else if (anchor === 'battery-led') position = this.batteryLED.getWorldPosition(new THREE.Vector3());
      else {
        const index = Number(anchor.at(-1)), model = this.motors.get(this.ui.selected);
        if (anchor.startsWith('blade')) {
          position = model.blades[index].group.localToWorld(model.bladeAnchors[index].clone());
        } else {
          position = model.screws[index].localToWorld(model.screwAnchors[index].clone());
        }
      }
      position.project(this.camera);
      const offset = anchor.startsWith('screw') ? (anchor.endsWith('0') ? -30 : 30) : 0;
      node.style.left = `${(position.x + 1) * .5 * width + offset}px`;
      node.style.top = `${(-position.y + 1) * .5 * height + (anchor.startsWith('screw') ? -20 : 0)}px`;
      node.hidden = position.z > 1 || Math.abs(position.x) > .98 || Math.abs(position.y) > .98;
    }
    this.canvas.dataset.drawCalls = String(this.renderer.info?.render?.calls ?? 0);
    this.canvas.dataset.triangles = String(this.renderer.info?.render?.triangles ?? this.renderer.info?.render?.faces ?? 0);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed=true;
    this.releaseContextWatch?.();
    this.travel?.dispose();
    this.studio?.dispose();
    this.imuInteraction?.dispose();
    this.workshop?.dispose();
    this.detach(); this.controls.dispose(); disposeRenderer3D(this.renderer);
    this.geometries.forEach(g => g.dispose()); Object.values(this.materials).forEach(m => m.dispose());
    this.assetTextures?.forEach(t=>t.dispose());
    this.shadowTexture?.dispose(); this.shadowMaterial?.dispose(); this.gridMaterial.dispose();
  }
}
