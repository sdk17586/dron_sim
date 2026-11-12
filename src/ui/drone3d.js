import * as THREE from '../vendor/three/three.module.min.js';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import { createRenderer3D, showRenderBackend } from './renderer3d.js';
import { renderRepairPoints } from './parts.js';
import { PROFILE } from '../content/aircraft-profiles.js';
import { SCENARIO } from '../content/scenarios.js';
import { createBatteryPacks, installedBattery, batteryColor, chargeFraction } from '../domain/battery.js';
import { rotorPreviewMarkup, applyRotorMotion } from './rotor-preview.js';
import { motorStatus, motorStatusLabel } from './motor-status.js';
import { configureDroneWorkshop } from './spatial-maintenance.js';
import { configureIMU } from './imu3d.js';

const pointFor = p => new THREE.Vector3((p.x - 380) / 72, 1.04, (p.y - 294) / 76);

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

function propellerGeometry(damaged) {
  const s = new THREE.Shape();
  s.moveTo(.1, -.08);
  s.bezierCurveTo(-.25, -.17, -.9, -.24, -1.46, -.14);
  if (damaged) {
    s.lineTo(-1.43, -.07); s.lineTo(-1.22, -.08); s.lineTo(-1.34, .005);
    s.lineTo(-1.21, .045); s.lineTo(-1.46, .09);
  } else s.quadraticCurveTo(-1.57, -.04, -1.46, .09);
  s.bezierCurveTo(-.95, .23, -.35, .16, .1, .08);
  s.quadraticCurveTo(.19, 0, .1, -.08);
  const geometry = new THREE.ExtrudeGeometry(s, { depth: .035, bevelEnabled: true,
    bevelSegments: 1, bevelSize: .012, bevelThickness: .008, curveSegments: 8, steps: 1 });
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
    this.scene.background = new THREE.Color('#f1f4ec');
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
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x7b8a70, 2.8 * lightScale));
    if (svg) this.scene.add(new THREE.AmbientLight(0xffffff, .4));
    const key = new THREE.DirectionalLight(0xfffcf0, 3.4 * lightScale); key.position.set(-4, 9, -5); this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xcbded5, 1.5 * lightScale); fill.position.set(5, 4, 6); this.scene.add(fill);
    this.drone = new THREE.Group(); this.scene.add(this.drone);
    this.buildModel();
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
    this.canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); this.onUnavailable?.(); });
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

  buildModel() {
    const shell = this.material('shell', '#d6dbcf'), edge = this.material('edge', '#9eac98');
    const dark = this.material('dark', '#293c33'), rubber = this.material('rubber', '#21372b', { roughness: .94 });
    const metal = this.material('metal', '#aab6a5', { metalness: .72, roughness: .33 });
    const bronze = this.material('bronze', '#c69e63', { metalness: .5 });
    this.mesh(roundedGeometry(1.9, 3.25, .5, .4), shell, this.drone, [0, .68, 0]);
    this.mesh(roundedGeometry(1.48, 2.7, .18, .32), this.material('top', '#e4e7dc'), this.drone, [0, 1.2, .03]);
    this.mesh(roundedGeometry(1.72, 2.95, .2, .3), edge, this.drone, [0, .46, .07]);
    for (const z of [-1.08, -.93, .88, 1.03]) this.box(.85, .015, .025, edge, this.drone, [0, 1.41, z]);
    for (const x of [-.48, .48]) this.box(.13, .36, .25, rubber, this.drone, [x, .22, 1.02]);
    this.box(1.04, .43, .34, dark, this.drone, [0, .82, 1.63]);
    this.battery = new THREE.Group(); this.drone.add(this.battery);
    this.mesh(roundedGeometry(.92, .65, .31, .08), edge, this.battery);
    for (let i = 0; i < 4; i++) this.box(.08, .015, .025, bronze, this.battery, [i * .14 - .21, .36, 0]);
    this.box(1.08, .025, .15, dark, this.drone, [0, 1.44, -.25]);
    this.materials['battery-led'] = new THREE.MeshBasicMaterial({ color: batteryColor(20) });
    this.batteryLED = this.box(1, .028, .09, this.materials['battery-led'], this.drone, [0, 1.458, -.25]);
    this.power = this.cylinder(.075, .018, dark, this.drone, [0, 1.42, .72]);
    const powerGlyph=this.mesh(new THREE.TorusGeometry(.045,.007,4,18),metal,this.drone,[0,1.435,.72]);powerGlyph.rotation.x=-Math.PI/2;
    this.box(.01,.008,.045,metal,this.drone,[0,1.44,.69]);
    this.powerLight = this.cylinder(.022, .02, this.material('power-on', '#b3c58c', { emissive: '#667745' }), this.drone, [0, 1.44, .72]);
    this.box(.75, .08, .34, metal, this.drone, [0, .68, -1.73]);
    const gimbal = this.mesh(roundedGeometry(.77, .48, .4, .1), dark, this.drone, [0, .39, -1.87]);
    gimbal.rotation.z = -.03;
    const lensRing = this.cylinder(.235, .13, metal, this.drone, [0, .63, -2.08]); lensRing.rotation.x = Math.PI / 2;
    const lens = this.cylinder(.176, .145, this.material('lens', '#183940', { metalness: .75, roughness: .15 }), this.drone, [0, .63, -2.14]); lens.rotation.x = Math.PI / 2;
    const glass = this.cylinder(.102, .15, this.material('glass', '#294e55', { metalness: .4, roughness: .12 }), this.drone, [0, .63, -2.17]); glass.rotation.x = Math.PI / 2;
    if (this.canvas.tagName.toLowerCase() !== 'svg') {
    const decal = document.createElement('canvas'); decal.width = 512; decal.height = 128;
    const ink = decal.getContext('2d');
    ink.fillStyle = '#5e725b'; ink.font = '500 38px sans-serif'; ink.textAlign = 'center'; ink.fillText('MINI 2 SE', 256, 58);
    ink.font = '16px sans-serif'; ink.fillText('TRAINING MODEL', 256, 96);
    this.decalTexture = new THREE.CanvasTexture(decal); this.decalTexture.colorSpace = THREE.SRGBColorSpace;
    this.decalMaterial = new THREE.MeshBasicMaterial({ map: this.decalTexture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const decalMesh = this.mesh(new THREE.PlaneGeometry(1.08, .27), this.decalMaterial, this.drone, [0, 1.425, -.15]); decalMesh.rotation.x = -Math.PI / 2;
    }
    const bladeGeometry = propellerGeometry(false), damagedGeometry = propellerGeometry(true);
    const propMaterial = this.material('prop', '#34483a', { metalness: .22, roughness: .53 });
    for (const profile of PROFILE.motors) {
      const point = pointFor(profile);
      const armStart = new THREE.Vector3(Math.sign(point.x) * .67, .85, Math.sign(point.z) * .86);
      const end = point.clone().setY(.9), delta = end.clone().sub(armStart);
      const arm = this.box(.34, .25, delta.length(), shell, this.drone, armStart.clone().add(end).multiplyScalar(.5).toArray());
      arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), delta.normalize());
      const armSeam = this.box(.36, .27, .1, edge, this.drone, armStart.toArray()); armSeam.quaternion.copy(arm.quaternion);
      const group = new THREE.Group(); group.position.copy(point); group.userData.motorId = profile.id; this.drone.add(group);
      this.cylinder(.32, .35, dark, group, [0, -.01, 0]);
      this.cylinder(.285, .19, metal, group, [0, .14, 0]);
      this.cylinder(.23, .05, edge, group, [0, .26, 0]);
      for (let n = 0; n < 10; n++) {
        const angle = n / 10 * Math.PI * 2;
        const vent = this.box(.035, .1, .025, bronze, group, [Math.cos(angle) * .327, .045, Math.sin(angle) * .327]); vent.rotation.y = -angle;
      }
      this.box(.16, .65, .21, edge, group, [0, -.5, .02]);
      this.box(.25, .08, .31, rubber, group, [0, -.85, .02]);
      if (profile.marked) for (const z of [-.12, -.04]) this.box(.25, .025, .025, bronze, group, [0, .275, z]);
      const ring = this.mesh(new THREE.TorusGeometry(.5, .019, 6, 48), this.material('ring', '#7c9c5e', { emissive: '#314c22', emissiveIntensity: .2 }), group, [0, -.22, 0]); ring.rotation.x = -Math.PI / 2;
      const blades = [], screws = [];
      for (let i = 0; i < 2; i++) {
        const blade = new THREE.Group(); blade.rotation.y = i * Math.PI + (point.x < 0 ? -.43 : .43); blade.position.y = .29; group.add(blade);
        const good = this.mesh(bladeGeometry, propMaterial, blade), damaged = this.mesh(damagedGeometry, propMaterial, blade);
        if (profile.marked) for (const x of [-.34, -.4]) this.box(.025, .02, .21, bronze, blade, [x, .057, 0]);
        const crack = this.box(.032, .015, .19, this.material('crack', '#b78558'), blade, [-1.3, .06, -.005]); crack.rotation.y = .4;
        blades.push({ group: blade, good, damaged, crack });
        const screwGroup = new THREE.Group(); screwGroup.rotation.y = blade.rotation.y; group.add(screwGroup);
        this.cylinder(.085, .06, metal, screwGroup, [-.15, .386, 0]);
        this.box(.11, .009, .02, dark, screwGroup, [-.15, .419, 0]);
        this.box(.02, .009, .11, dark, screwGroup, [-.15, .419, 0]);
        screws.push(screwGroup);
      }
      this.motors.set(profile.id, { group, ring, blades, screws });
    }
    const grid = new THREE.GridHelper(18, 36, '#c8d1be', '#dde4d5'); grid.position.y = -.09;
    grid.material.transparent = true; grid.material.opacity = .5; grid.material.depthWrite = false; this.scene.add(grid);
    this.geometries.add(grid.geometry); this.gridMaterial = grid.material;
    // A static soft contact shadow avoids a continuously updated shadow map.
    if (this.canvas.tagName.toLowerCase() !== 'svg') {
    const shade = document.createElement('canvas'); shade.width = shade.height = 128;
    const paint = shade.getContext('2d'), gradient = paint.createRadialGradient(64, 64, 10, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(30,55,35,.22)'); gradient.addColorStop(1, 'rgba(30,55,35,0)');
    paint.fillStyle = gradient; paint.fillRect(0, 0, 128, 128);
    this.shadowTexture = new THREE.CanvasTexture(shade);
    this.shadowMaterial = new THREE.MeshBasicMaterial({ map: this.shadowTexture, transparent: true, depthWrite: false });
    const shadow = this.mesh(new THREE.PlaneGeometry(7.8, 6.8), this.shadowMaterial, this.scene, [0, -.07, .1]); shadow.rotation.x = -Math.PI / 2;
    }
    const front = this.mesh(new THREE.ConeGeometry(.12, .34, 3), this.material('front', '#8a9f76'), this.scene, [0, -.05, -3.1]); front.rotation.x = -Math.PI / 2;
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
  detach() { this.imuInteraction?.deactivate(); this.workshop?.detach(); this.resizeObserver.disconnect(); this.host = null; this.controls.enabled = false; this.canvas.remove(); if (this.rotorLayer) applyRotorMotion(this.rotorLayer, 0); this.rotorLayer?.remove(); }
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
    if (!ui.controllerMode) this.previewLevel = 0;
    applyRotorMotion(this.rotorLayer, this.previewLevel);
    this.repairLayer.innerHTML = ui.immersiveMode || ui.imuMode ? '' : renderRepairPoints(state, ui);
    for (const p of PROFILE.motors) {
      const model = this.motors.get(p.id), motor = state?.motors[p.id];
      model.ring.visible = !ui.controllerMode && !ui.previewMode && ui.selected === p.id;
      this.labels.get(p.id).hidden = Boolean(ui.controllerMode || ui.previewMode);
      this.labels.get(p.id)?.setAttribute('aria-pressed', String(ui.selected === p.id));
      const label = this.labels.get(p.id), status = ui.controllerMode ? '' : motorStatus(state, p.id);
      label.dataset.inspection = status;
      label.title = `${p.short}번 ${p.name}${status ? ` · ${motorStatusLabel(status)}` : ''}`;
      label.setAttribute('aria-label', `${p.name} 모터 선택${status ? ` · ${motorStatusLabel(status)}` : ''}`);
      for (let i = 0; i < 2; i++) {
        const blade = motor?.blades[i], damaged = blade ? blade.condition === 'damaged' : p.id === SCENARIO.target && i === 0;
        model.blades[i].group.visible = !this.previewLevel && (blade?.present ?? true);
        model.blades[i].good.visible = !damaged; model.blades[i].damaged.visible = damaged; model.blades[i].crack.visible = damaged;
        model.blades[i].group.position.y = ui.exploded ? 1 : .29;
        model.screws[i].visible = motor?.screws[i].present ?? true;
        model.screws[i].position.y = ui.exploded ? 1.2 : 0;
        model.screws[i].rotation.set(motor?.screws[i].secured === false ? .17 : 0,model.blades[i].group.rotation.y,0);
      }
    }
    this.battery.visible = state?.battery ?? true;
    this.battery.position.set(0, .68, 1.6);
    this.setBatteryIndicator(state ? installedBattery(state) : createBatteryPacks()[0], false);
    this.powerLight.visible = state?.power ?? false;
    const key = `${Boolean(ui.imuMode)}:${ui.zoomed}:${ui.zoomed ? ui.selected : ''}:${ui.topView}`;
    if (this.cameraKey !== key) {
      this.cameraKey = key;
      const target = ui.imuMode ? new THREE.Vector3(0, 4.1, 0) : ui.zoomed ? pointFor(PROFILE.motors.find(m => m.id === ui.selected)) : new THREE.Vector3(0, .7, 0);
      const ratio = this.camera.aspect < 1 ? 1.25 : 1;
      const offset = ui.topView ? new THREE.Vector3(0, ui.zoomed ? 4.8 : 11.5 * ratio, .001)
        : ui.zoomed ? new THREE.Vector3(2.6, 3.8, -3.4) : new THREE.Vector3(8.5 * ratio, 8 * ratio, -10 * ratio);
      if (ui.imuMode) offset.set(8 * ratio, 7 * ratio, -16 * ratio);
      this.controls.target.copy(target); this.camera.position.copy(target).add(offset); this.controls.update();
    }
    this.canvas.dataset.selectedMotor = ui.selected;
    this.canvas.dataset.blades = String([...this.motors.values()].reduce((n, m) => n + m.blades.filter(b => b.group.visible).length, 0));
    this.canvas.dataset.screws = String([...this.motors.values()].reduce((n, m) => n + m.screws.filter(b => b.visible).length, 0));
    this.canvas.dataset.exploded = String(ui.exploded);
    this.canvas.dataset.rotorDemand = String(Math.round(this.previewLevel * 100));
    configureDroneWorkshop(this,state,ui);
    configureIMU(this, ui.imuMode ? ui.imuState : null);
    this.syncing = false; this.render();
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
    const ratio = chargeFraction(pack?.charge ?? 0);
    this.batteryLED.visible = Boolean(pack && ratio > 0);
    this.batteryLED.scale.x = Math.max(.00001, ratio);
    this.batteryLED.position.x = -.5 + ratio * .5;
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
    this.imuInteraction?.update();
    this.renderer.render(this.scene, this.camera);
    const width = this.host.clientWidth, height = this.host.clientHeight;
    this.rotorLayer.setAttribute('viewBox', `0 0 ${width} ${height}`);
    for (const p of PROFILE.motors) {
      const center = pointFor(p).add(new THREE.Vector3(0, .38, 0));
      const project = v => { const q = v.project(this.camera); return [(q.x + 1) * .5 * width, (-q.y + 1) * .5 * height]; };
      const c = project(center.clone()), x = project(center.clone().add(new THREE.Vector3(1, 0, 0))), z = project(center.clone().add(new THREE.Vector3(0, 0, 1)));
      this.rotorLayer.querySelector(`[data-preview-motor="${p.id}"]`).setAttribute('transform', `matrix(${x[0]-c[0]} ${x[1]-c[1]} ${z[0]-c[0]} ${z[1]-c[1]} ${c[0]} ${c[1]})`);
    }
    for (const p of PROFILE.motors) {
      const position = pointFor(p).add(new THREE.Vector3(0, .83, .05)).project(this.camera);
      const label = this.labels.get(p.id); if (!label) continue;
      label.style.left = `${(position.x + 1) * .5 * width}px`;
      label.style.top = `${(-position.y + 1) * .5 * height}px`;
      label.hidden = this.ui?.immersiveMode || this.ui?.controllerMode || this.ui?.previewMode || position.z > 1 || Math.abs(position.x) > .98 || Math.abs(position.y) > .98;
    }
    for (const node of this.repairLayer.querySelectorAll('[data-anchor]')) {
      const anchor = node.dataset.anchor;
      let position;
      if (anchor === 'power') position = new THREE.Vector3(0, 1.48, .72);
      else if (anchor === 'battery') position = new THREE.Vector3(0, .9, 1.9);
      else if (anchor === 'battery-led') position = new THREE.Vector3(0, 1.56, -.25);
      else {
        const index = Number(anchor.at(-1)), model = this.motors.get(this.ui.selected);
        if (anchor.startsWith('blade')) {
          position = model.blades[index].group.localToWorld(new THREE.Vector3(-.82, .08, 0));
        } else {
          position = model.screws[index].localToWorld(new THREE.Vector3(-.045, .48, 0));
        }
      }
      position.project(this.camera);
      const offset = anchor.startsWith('screw') ? (anchor.endsWith('0') ? -30 : 30) : 0;
      node.style.left = `${(position.x + 1) * .5 * width + offset}px`;
      node.style.top = `${(-position.y + 1) * .5 * height + (anchor.startsWith('screw') ? -20 : 0)}px`;
      node.hidden = position.z > 1 || Math.abs(position.x) > .98 || Math.abs(position.y) > .98;
    }
    this.canvas.dataset.ready = 'true';
    this.canvas.dataset.drawCalls = String(this.renderer.info?.render?.calls ?? 0);
    this.canvas.dataset.triangles = String(this.renderer.info?.render?.triangles ?? this.renderer.info?.render?.faces ?? 0);
  }
  dispose() {
    this.imuInteraction?.dispose();
    this.workshop?.dispose();
    this.detach(); this.controls.dispose(); this.renderer.dispose?.();
    this.geometries.forEach(g => g.dispose()); Object.values(this.materials).forEach(m => m.dispose());
    this.decalMaterial?.dispose(); this.decalTexture?.dispose(); this.shadowTexture?.dispose(); this.shadowMaterial?.dispose(); this.gridMaterial.dispose();
  }
}
