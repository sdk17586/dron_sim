import * as THREE from '../vendor/three/three.module.min.js';
import { GLTFLoader } from '../vendor/three/GLTFLoader.js';
import { PROFILE } from '../content/aircraft-profiles.js';

const templates=new Map();
async function template(quality) {
  // HTML image loading uses the existing img-src blob policy for embedded GLB textures.
  const loader=new GLTFLoader().register(parser=>{
    parser.textureLoader=new THREE.TextureLoader(parser.options.manager);
    return {name:'AEROLAB_LOCAL_IMAGES'};
  });
  if(!templates.has(quality)){
    const promise=loader.loadAsync(new URL(`../../assets/models/x500/x500-${quality}.glb`,import.meta.url).href)
      .catch(error=>{if(templates.get(quality)===promise)templates.delete(quality);throw error;});
    templates.set(quality,promise);
  }
  return templates.get(quality);
}

export async function loadX500(view) {
  const compatible=view.canvas.dataset.renderBackend==='svg',quality=compatible?'compatible':'detail';
  const pending=template(quality),cached=templates.get(quality);
  let timer;
  const source=await Promise.race([pending,new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(new Error('드론 모델을 불러오는 시간이 초과되었습니다.')),8000);
  })]).catch(error=>{
    if(templates.get(quality)===cached)templates.delete(quality);
    throw error;
  }).finally(()=>clearTimeout(timer));
  if(view.disposed)return;
  const root=source.scene.clone(true),frame=root.getObjectByName('frame');
  const parts=PROFILE.motors.map(p=>({p,group:root.getObjectByName(p.id),
    good:[0,1].map(i=>root.getObjectByName(`blade_${p.id}_${i}_good`)),
    damaged:[0,1].map(i=>root.getObjectByName(`blade_${p.id}_${i}_damaged`))}));
  if(!frame || parts.some(p=>!p.group || [...p.good,...p.damaged].some(o=>!o)))throw new Error('드론 모델의 정비 부품 구성이 올바르지 않습니다.');
  const geometries=new Map(),materials=new Map(),textures=new Map();
  root.traverse(o=>{
    if(!o.isMesh)return;
    if(!geometries.has(o.geometry))geometries.set(o.geometry,o.geometry.clone());
    o.geometry=geometries.get(o.geometry);
    const original=o.material;
    if(!materials.has(original)){
      const m=compatible?new THREE.MeshLambertMaterial({color:original.color}):original.clone();
      m.side=THREE.DoubleSide;
      if(m.map){
        if(!textures.has(m.map))textures.set(m.map,m.map.clone());
        m.map=textures.get(m.map);m.map.needsUpdate=true;
      }
      materials.set(original,m);
    }
    o.material=materials.get(original);
    if(o.name.includes('CarbonFiber'))o.material.color.set(compatible?'#56616a':'#a4adb5');
    if(o.name.includes('LandingPlastic'))o.material.color.set('#43515b');
  });
  geometries.forEach(g=>view.geometries.add(g));
  materials.forEach((m,original)=>{view.materials[`x500-${materials.size}-${original.uuid}`]=m;});
  view.assetTextures=new Set(textures.values());
  view.buildTeachingParts();
  root.position.y=.04-new THREE.Box3().setFromObject(frame).min.y;
  root.updateMatrixWorld(true);
  const bodyTop=new THREE.Box3().setFromObject(frame).max.y;
  view.drone.add(root);
  root.updateWorldMatrix(true,true);
  for(const {p,group,good,damaged} of parts){
    const model=view.motors.get(p.id);
    model.group.position.copy(view.drone.worldToLocal(group.getWorldPosition(new THREE.Vector3())));
    group.updateWorldMatrix(true,true);
    for(const child of [...group.children])if(!good.includes(child) && !damaged.includes(child))model.group.attach(child);
    model.bladeAnchors=[];model.screwAnchors=[];
    for(const i of [0,1]){
      const b=model.blades[i];
      const marks=b.group.children.filter(o=>o.isMesh);
      b.good=good[i];b.damaged=damaged[i];
      // Meshes already use the blade's local frame, including its two-half teaching offset.
      b.group.add(b.good,b.damaged);b.group.rotation.y=i*Math.PI;
      b.good.geometry.computeBoundingBox();
      for(const mark of marks){
        const vertices=b.good.geometry.attributes.position;let height=-Infinity;
        for(let n=0;n<vertices.count;n++)if(Math.abs(vertices.getX(n)-mark.position.x)<.07)height=Math.max(height,vertices.getY(n));
        mark.position.y=Number.isFinite(height)?height+.014:-.25;
      }
      model.bladeAnchors.push(b.good.geometry.boundingBox.getCenter(new THREE.Vector3()));
      b.group.updateWorldMatrix(true,true);
      const ray=new THREE.Raycaster(b.group.localToWorld(new THREE.Vector3(-.15,1,0)),new THREE.Vector3(0,-1,0).transformDirection(b.group.matrixWorld));
      const hit=ray.intersectObject(b.good,true)[0];
      const headY=hit?model.group.worldToLocal(hit.point.clone()).y+.03:.12;
      model.screws[i].children.forEach(o=>{o.position.y-=.386-headY;});
      model.screwAnchors.push(new THREE.Vector3(-.15,headY+.04,0));
    }
  }
  view.battery.scale.set(1.5,1.7,2.7);
  const surfaceAt=(x,z)=>{
    view.drone.updateWorldMatrix(true,true);
    const origin=view.drone.localToWorld(new THREE.Vector3(x,bodyTop+1,z));
    const direction=new THREE.Vector3(0,-1,0).transformDirection(view.drone.matrixWorld);
    const hit=new THREE.Raycaster(origin,direction).intersectObject(frame,true)[0];
    return hit?view.drone.worldToLocal(hit.point.clone()).y:bodyTop;
  };
  view.battery.children[0].material=view.material('x500-pack','#2c3942',{roughness:.42,metalness:.28});
  view.x500BatteryPosition=new THREE.Vector3(0,surfaceAt(0,.3)+.035,.3);
  view.battery.position.copy(view.x500BatteryPosition);
  const controlY=surfaceAt(.8,-.75);
  view.power.position.set(.9,controlY+.045,-.75);view.power.scale.setScalar(1.3);
  const glyph=view.mesh(new THREE.TorusGeometry(.043,.006,4,20),view.material('x500-button-glyph','#d7e4df'),view.power,[0,.014,0]);glyph.rotation.x=-Math.PI/2;
  view.box(.009,.008,.04,view.materials['x500-button-glyph'],view.power,[0,.019,-.027]);
  view.powerLight.position.set(.65,controlY+.045,-.75);
  view.box(.5,.035,.4,view.material('x500-control-panel','#26343b',{metalness:.4}),root,[.8,controlY+.017-root.position.y,-.75]);
  view.x500LEDPosition=new THREE.Vector3(0,view.x500BatteryPosition.y+.62,.3);
  view.batteryLED.position.copy(view.x500LEDPosition);
  view.batteryLED.scale.z=1.25;
  // A strap secures the demo battery to the imported avionics deck.
  for(const z of [-.24,.24])view.box(1.43,.04,.12,view.material('x500-strap','#1e292d'),view.battery,[0,.36,z]).scale.set(1/1.5,1/1.7,1/2.7);
  view.portedDrone={root,bodyTop,frame};
  view.canvas.dataset.modelSource='px4-x500';view.canvas.dataset.modelQuality=quality;
  view.cameraKey='';
  if(view.imuInteraction){
    const position=view.drone.position.clone(),rotation=view.drone.quaternion.clone();
    view.drone.position.set(0,0,0);view.drone.quaternion.identity();view.drone.updateMatrixWorld(true);
    view.imuInteraction.bounds.setFromObject(view.drone);
    view.drone.position.copy(position);view.drone.quaternion.copy(rotation);
  }
}

// The small IMU pose guide uses the same current airframe, with lightweight geometry.
export async function loadX500Preview() {
  const source=await template('compatible'),root=source.scene.clone(true);
  const geometries=new Map(),materials=new Map();
  root.traverse(object=>{
    if(object.name.endsWith('_damaged'))object.visible=false;
    if(!object.isMesh)return;
    if(!geometries.has(object.geometry))geometries.set(object.geometry,object.geometry.clone());
    object.geometry=geometries.get(object.geometry);
    const original=object.material;
    if(!materials.has(original))materials.set(original,new THREE.MeshBasicMaterial({color:original.color,side:THREE.DoubleSide}));
    object.material=materials.get(original);
    if(object.name.includes('CarbonFiber'))object.material.color.set('#708c9b');
    if(object.name.includes('LandingPlastic'))object.material.color.set('#6a7d8b');
  });
  root.position.sub(new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3()));
  return {root,geometries:[...geometries.values()],materials:[...materials.values()]};
}
