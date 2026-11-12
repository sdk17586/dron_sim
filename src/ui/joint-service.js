import * as THREE from '../vendor/three/three.module.min.js';
import { robotDiagnosed } from '../domain/quadruped.js';

// Teaching fittings are seated on the imported housing in its own joint frame.
export function createJointService(view, leg, nodes, basis) {
  const model = view.legs.get(leg.id), frame = model.knee;
  nodes.module.updateWorldMatrix(true, true);
  const inverse = nodes.module.matrixWorld.clone().invert(), bounds = new THREE.Box3();
  nodes.module.traverse(object => {
    if (!object.isMesh) return;
    object.geometry.computeBoundingBox();
    bounds.union(object.geometry.boundingBox.clone().applyMatrix4(inverse.clone().multiply(object.matrixWorld)));
  });
  bounds.applyMatrix4(basis);
  const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
  const surface = leg.x < 0 ? bounds.min.x : bounds.max.x;
  const radius = THREE.MathUtils.clamp(Math.min(size.y, size.z) * .42, .105, .155);
  const cy = center.y, cz = center.z, outward = leg.x;
  const metal = view.mat('#83918f'), dark = view.mat('#253431'), shell = view.mat('#b9c2c0');
  const panel = new THREE.Group(); frame.add(panel);
  panel.position.set(surface + outward * .009, cy, cz);
  const disk = (r, thickness, material, parent, x = 0, y = 0, z = 0, segments = 32) => {
    const mesh = view.mesh(new THREE.CylinderGeometry(r, r, thickness, segments), material, parent, [x,y,z]);
    mesh.rotation.z = Math.PI / 2; return mesh;
  };
  disk(radius, .018, shell, panel);
  const seam = view.mesh(new THREE.TorusGeometry(radius + .003, .006, 6, 40), dark, panel);
  seam.rotation.y = Math.PI / 2;
  disk(radius * .42, .024, metal, panel, outward * .005);
  const recess = new THREE.Group(); frame.add(recess); recess.position.set(surface - outward * .025, cy, cz);
  disk(radius * .95, .028, dark, recess); disk(radius * .36, .045, metal, recess, outward * .008);
  const boltPoints = [new THREE.Vector3(surface + outward * .026, cy + radius * .54, cz - radius * .48),
    new THREE.Vector3(surface + outward * .026, cy - radius * .54, cz + radius * .48)];
  // Holes and their surrounding washers move with the actual removable cover.
  for (const point of boltPoints) {
    disk(.029, .004, dark, panel, point.x-panel.position.x, point.y-cy, point.z-cz);
  }
  const bolts = boltPoints.map(point => {
    const bolt = new THREE.Group(); frame.add(bolt); bolt.position.copy(point);
    view.mesh(new THREE.CylinderGeometry(.022,.022,.014,12),metal,bolt);
    view.mesh(new THREE.CylinderGeometry(.009,.009,.002,6),dark,bolt,[0,.008,0]);
    view.mesh(new THREE.CylinderGeometry(.008,.008,.035,8),metal,bolt,[0,-.02,0]);
    bolt.rotation.z = -outward * Math.PI/2; return bolt;
  });
  model.bolts.forEach(bolt => { bolt.visible=false; }); model.bolts = bolts;
  model.connector.visible=false;
  const connector = new THREE.Group(); frame.add(connector);
  view.box(.052,.045,.078,dark,connector);
  view.box(.057,.008,.045,metal,connector,[0,.026,0]);
  const plugPoint = new THREE.Vector3(surface + outward*.025, cy+radius*.86, cz+radius*.72);
  const port = new THREE.Group(); frame.add(port); port.position.copy(plugPoint);
  view.box(.02,.057,.087,metal,port); view.box(.025,.034,.055,dark,port,[outward*.01,0,0]);
  const cableGeometry = new THREE.BufferGeometry().setFromPoints([plugPoint, plugPoint.clone().add(new THREE.Vector3(0,.08,.05))]);
  view.geometries.add(cableGeometry);
  const cableMaterial = new THREE.LineBasicMaterial({color:'#35483f'});view.materials.add(cableMaterial);
  const cable = new THREE.Line(cableGeometry,cableMaterial);frame.add(cable);
  model.connector = connector;
  const crackPoints = [[-.7,-.32],[-.25,-.12],[0,-.28],[.28,.06],[.7,.3]].map(([y,z]) =>
    new THREE.Vector3(surface+outward*.03,cy+y*radius,cz+z*radius));
  const old = model.crack;old.removeFromParent();view.geometries.delete(old.geometry);old.geometry.dispose();
  const fracture=new THREE.Group();fracture.name='qtrain-fracture';frame.add(fracture);
  const fractureMaterial=view.mat('#9c4c39');
  for(let i=1;i<crackPoints.length;i++){
    const a=crackPoints[i-1],b=crackPoints[i],direction=b.clone().sub(a);
    const segment=view.mesh(new THREE.CylinderGeometry(.0025,.0025,direction.length(),5),fractureMaterial,fracture);
    segment.position.copy(a).add(b).multiplyScalar(.5);
    segment.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
  }
  model.crack=fracture;
  frame.updateWorldMatrix(true,true);
  nodes.module.attach(panel);
  nodes.module.attach(fracture);
  model.service = {
    surface, center: new THREE.Vector3(surface,cy,cz), radius, panel, recess, boltPoints,
    axis() { frame.updateWorldMatrix(true,false);return new THREE.Vector3(outward,0,0).transformDirection(frame.matrixWorld); },
    anchor() { return frame.localToWorld(new THREE.Vector3(surface+outward*.025,cy,cz)); },
    seat() { nodes.module.updateWorldMatrix(true,false);return {
      position:nodes.module.getWorldPosition(new THREE.Vector3()), quaternion:nodes.module.getWorldQuaternion(new THREE.Quaternion()),
      scale:nodes.module.getWorldScale(new THREE.Vector3()) }; },
    update() {
      const state=view.state, ui=view.ui, l=state?.legs[leg.id];if(!l)return;
      const inspecting=Boolean(ui?.immersiveMode && ui.robotZoomed && ui.robotSelected===leg.id);
      const repairing=inspecting && robotDiagnosed(state) && l.verdict==='replace';
      model.ring.visible=false;
      shell.color.set(l.source==='new'?'#a2b8aa':'#b9c2c0');
      model.crack.visible=l.condition==='damaged' && l.present && nodes.module.visible;
      recess.visible=inspecting && !nodes.module.visible;
      bolts.forEach((bolt,i)=>{
        bolt.visible=(l.bolts[i] || l.source==='new') && nodes.module.visible && !ui?.robotControllerMode;
        if(view.workshop?.operation?.object!==bolt){
          bolt.position.copy(boltPoints[i]).addScaledVector(new THREE.Vector3(outward,0,0),l.bolts[i]?0:.033);
          bolt.rotation.set(0,0,-outward*Math.PI/2);
        }
      });
      connector.visible=port.visible=cable.visible=repairing && l.present;
      if(view.workshop?.operation?.object!==connector)connector.position.copy(plugPoint).addScaledVector(new THREE.Vector3(outward,0,0),l.connected?0:.075);
      const a=connector.position.clone(),b=plugPoint.clone().add(new THREE.Vector3(0,.08,.05));
      const attribute=cable.geometry.attributes.position;attribute.setXYZ(0,a.x,a.y,a.z);attribute.setXYZ(1,b.x,b.y,b.z);attribute.needsUpdate=true;
      cable.geometry.computeBoundingSphere();
    },
  };
  return model.service;
}

export function seatBodyControls(view, base) {
  view.body.updateWorldMatrix(true,true);
  const surfaceAt=(x,z)=>{
    const origin=view.body.localToWorld(new THREE.Vector3(x,view.go2Top+1,z));
    const down=new THREE.Vector3(0,-1,0).transformDirection(view.body.matrixWorld);
    const hit=new THREE.Raycaster(origin,down).intersectObject(base,true)[0];
    return hit?view.body.worldToLocal(hit.point.clone()).y:view.go2Top;
  };
  view.stop.scale.setScalar(.6);view.powerButton.scale.setScalar(.65);view.powerLight.scale.setScalar(.65);
  view.go2StopY=surfaceAt(-.23,-.36)+.024;
  view.stop.position.y=view.go2StopY;
  view.powerButton.position.y=surfaceAt(.23,-.36)+.018;
  view.powerLight.position.y=surfaceAt(.43,-.36)+.012;
  view.battery.position.y=surfaceAt(0,.27)+.108;
}
