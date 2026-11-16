import * as THREE from '../vendor/three/three.module.min.js';
import { GLTFLoader } from '../vendor/three/GLTFLoader.js';
import { ROBOT_LEGS } from '../domain/quadruped.js';
import { createJointService, seatBodyControls, setModuleDamage } from './joint-service.js';

const templates = new Map();
const prefixes = { 'front-left': 'FL', 'front-right': 'FR', 'rear-left': 'RL', 'rear-right': 'RR' };
const rosRotation = new THREE.Matrix4().set(0,-1,0,0, 0,0,1,0, -1,0,0,0, 0,0,0,1);
const units = 5;

async function template(compatible) {
  const quality = compatible ? 'compatible' : 'detail';
  if (!templates.has(quality)) {
    const url = new URL(`../../assets/models/go2/go2-${quality}.glb`, import.meta.url);
    const promise = new GLTFLoader().loadAsync(url.href).catch(error => {
      if (templates.get(quality) === promise) templates.delete(quality);
      throw error;
    });
    templates.set(quality, promise);
  }
  return templates.get(quality);
}

export async function loadGo2(view) {
  const compatible = view.canvas.dataset.renderBackend === 'svg';
  const quality = compatible ? 'compatible' : 'detail';
  const pending = template(compatible), cached = templates.get(quality);
  let timer;
  const source = await Promise.race([pending, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('모델을 불러오는 시간이 초과되었습니다.')), 8000);
  })]).catch(error => {
    if (templates.get(quality) === cached) templates.delete(quality);
    throw error;
  }).finally(() => clearTimeout(timer));
  if (view.disposed) return;
  const root = source.scene.clone(true), geometries = new Map(), materials = new Map();
  const joints = new Map();
  for (const leg of ROBOT_LEGS) {
    const prefix = prefixes[leg.id];
    const nodes = { hip: root.getObjectByName(prefix+'_hip'), thigh: root.getObjectByName(prefix+'_thigh'),
      calf: root.getObjectByName(prefix+'_calf'), module: root.getObjectByName(prefix+'_module') };
    if (Object.values(nodes).some(node => !node)) throw new Error('Go2 관절 구성이 올바르지 않습니다.');
    joints.set(leg.id, nodes);
  }
  root.traverse(object => {
    if (!object.isMesh) return;
    if (!geometries.has(object.geometry)) geometries.set(object.geometry, object.geometry.clone());
    object.geometry = geometries.get(object.geometry);
    const original = object.material;
    if (!materials.has(original)) {
      const material = compatible ? new THREE.MeshLambertMaterial({ color: original.color, side: THREE.DoubleSide }) : original.clone();
      material.side = THREE.DoubleSide; materials.set(original, material);
    }
    object.material = materials.get(original);
  });
  geometries.forEach(g => view.geometries.add(g)); materials.forEach(m => view.materials.add(m));
  root.quaternion.setFromRotationMatrix(rosRotation); root.scale.setScalar(units); root.position.y = 1.85;
  for (const nodes of joints.values()) { nodes.thigh.rotation.y = .72; nodes.calf.rotation.y = -1.44; }
  root.updateMatrixWorld(true);
  root.position.y += .04 - new THREE.Box3().setFromObject(root).min.y;

  view.buildTeachingParts();
  view.body.add(root);
  for (const leg of ROBOT_LEGS) {
    const model = view.legs.get(leg.id);
    model.cartridge = joints.get(leg.id).module;
  }
  const top = root.position.y + .0888 * units;
  view.battery.position.set(0, top + .09, .27);
  view.battery.scale.set(.8,.65,1.25);
  view.stop.position.set(-.23, top + .075, -.36);
  view.powerButton.position.set(.23, top + .075, -.36);
  view.powerLight.position.set(.43, top + .07, -.36);
  view.go2Top = top;
  view.stands.scale.y = Math.max(.5, (root.position.y - .0968 * units) / 1.86);

  const rig = {
    root, joints,
    update() {
      for (const leg of ROBOT_LEGS) {
        const model = view.legs.get(leg.id), nodes = joints.get(leg.id);
        nodes.thigh.rotation.y = .72 - model.group.rotation.x;
        nodes.calf.rotation.y = -1.44 + (model.lower.rotation.x - .42) * .8;
      }
      root.updateWorldMatrix(true, true);
      for (const leg of ROBOT_LEGS) {
        const model = view.legs.get(leg.id), nodes = joints.get(leg.id);
        model.knee.position.copy(view.body.worldToLocal(nodes.calf.getWorldPosition(new THREE.Vector3())));
        // ROS pitch about Y becomes negative X in the teaching frame.
        model.knee.rotation.set(-nodes.thigh.rotation.y,0,0);
        model.service?.update();
      }
    },
    spareModule({damaged=false}={}) {
      const module = joints.get(view.state?.targetLeg || 'front-left').module.clone(true);
      setModuleDamage(module,damaged);
      module.visible = true; module.position.set(0,0,0); module.scale.setScalar(units);
      module.quaternion.setFromRotationMatrix(rosRotation); module.rotateY(.72);
      return module;
    },
  };
  view.portedRig = rig; rig.update();
  const basis=rosRotation.clone().scale(new THREE.Vector3(units,units,units));
  for(const leg of ROBOT_LEGS) createJointService(view,leg,joints.get(leg.id),basis);
  seatBodyControls(view,root.getObjectByName('base'));
  rig.update();
  view.canvas.dataset.modelSource = 'unitree-go2';
  view.canvas.dataset.modelQuality = compatible ? 'compatible' : 'detail';
  view.canvas.dataset.modelLinks = '17';
  view.cameraKey = '';
}
