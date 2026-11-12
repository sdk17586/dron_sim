import * as THREE from '../vendor/three/three.module.min.js';
import { Workshop3D } from './workshop3d.js';
import { PROFILE } from '../content/aircraft-profiles.js';
import { KITS, readyForMaintenance, physicalIssues } from '../domain/state.js';
import { installedBattery } from '../domain/battery.js';
import { placePart } from '../domain/placement.js';
import { maintenanceGuide } from '../domain/learning-guide.js';
import { ROBOT_LEGS, robotGuide, robotDiagnosed, robotAssembled, robotCanTest, placeRobotPart } from '../domain/quadruped.js';
import { escapeHTML as e, button, icon } from './shared.js';
import { renderTaskGuide } from './learning.js';

const point = (object,x=0,y=0,z=0) => () => object.localToWorld(new THREE.Vector3(x,y,z));

export function configureDroneWorkshop(v,s,ui) {
  const w = v.workshop ||= new Workshop3D(v);
  w.reset(Boolean(ui.immersiveMode && s?.status === 'active'), (piece,target) => placePart(s,piece,target).feedback.kind === 'success');
  if (!w.active) return;
  const guide = maintenanceGuide(s,ui), target = guide.current?.target || {}, pack = installedBattery(s);
  w.bind('drone-power',v.power,{label:s.power?'기체 전원 끄기':'기체 전원 차단 확인',action:{action:s.power?'power':'confirm-power'},press:new THREE.Vector3(0,-.04,0),anchor:point(v.drone,0,1.47,.72),radius:.22,current:target.kind==='power'});
  w.bind('drone-battery',v.battery,{label:pack?`기체 배터리 ${pack.charge}% · 집어서 수거함으로`:'빈 배터리 장착부',anchor:point(v.drone,0,1,1.8),radius:.38,
    piece:pack?{kind:'battery',batteryId:pack.id}:null,drop:{kind:'battery-slot'},current:target.kind==='battery'});
  for (const p of PROFILE.motors) {
    const model = v.motors.get(p.id), m = s.motors[p.id];
    w.bind(`motor-${p.id}`,model.group,{label:`${p.short}번 ${p.name} 모터 · 가까이 보기`,caption:p.short,action:{action:'select-motor',motor:p.id},anchor:point(model.group,0,.32,0),radius:.3,current:guide.current?.motorId===p.id && (!ui.zoomed || ui.selected!==p.id || !m.inspected)});
    if (!readyForMaintenance(s) || !ui.zoomed || ui.selected!==p.id || !m.inspected) continue;
    for (const i of [0,1]) {
      const blade=m.blades[i], screw=m.screws[i], b=model.blades[i].group, bolt=model.screws[i];
      w.bind(`blade-${p.id}-${i}`,b,{label:`${i+1}번 ${blade.present?'장착 날개 · 집어서 분리':'새 날개 장착 자리'}`,anchor:point(b,-.8,.08,0),radius:.28,priority:2,
        piece:blade.present?{kind:'mounted-blade',motorId:p.id,index:i,partId:blade.id}:null,drop:{kind:'blade',motorId:p.id,index:i},current:target.kind==='old-blade' && target.index===i});
      w.bind(`screw-${p.id}-${i}`,bolt,{label:`${i+1}번 ${screw.present?screw.secured?'나사 · 드라이버로 풀기':'나사 · 드라이버로 조이기':'새 나사 장착 자리'}`,anchor:point(bolt,-.15,.43,0),radius:.12,priority:5,
        drop:{kind:'screw',motorId:p.id,index:i},turn:bolt,turnOffset:new THREE.Vector3(0,screw.source==='new'?-.1:.14,0)});
    }
  }
  if (readyForMaintenance(s)) {
    w.stock('drone-driver','driver',-3.1,{label:'드라이버',piece:{kind:'driver'},current:target.kind==='driver'});
    for (const i of [0,1]) {
      if (!s.used.includes(`${ui.kitId}-blade-${i}`)) {
        const source=PROFILE.motors.find(p=>p.marked===ui.kitId.startsWith('A'));
        const original=v.motors.get(source.id).blades[i], model=original.group.clone(true);
        // A spare must stay visible even when its source blade has been removed.
        model.visible=true;
        model.children[original.group.children.indexOf(original.good)].visible=true;
        model.children[original.group.children.indexOf(original.damaged)].visible=false;
        model.children[original.group.children.indexOf(original.crack)].visible=false;
        model.rotation.set(0,0,0);model.scale.setScalar(.65);
        w.stock(`new-blade-${i}`,'blade',-1.9+i*1.05,{model,label:`${ui.kitId} 날개 ${i+1}`,piece:{kind:'blade',index:i,kitId:ui.kitId},current:target.kind==='new-blade'&&target.index===i});
      }
      if (!s.used.includes(`${ui.kitId}-screw-${i}`)) w.stock(`new-screw-${i}`,'screw',.25+i*.8,{label:`새 나사 ${i+1}`,piece:{kind:'screw',index:i,kitId:ui.kitId},current:target.kind==='new-screw'&&target.index===i});
    }
  }
  let slot=0;
  for (const pack of s.batteryPacks.filter(p=>p.location!=='aircraft' && p.location!=='installed')) {
    if (installedBattery(s)?.id===pack.id) continue;
    w.stock(`pack-${pack.id}`,'battery',readyForMaintenance(s)?1.7+slot++*.7:-1+slot++*1.15,{label:`${pack.name} ${pack.charge}%`,charge:pack.charge,piece:{kind:'battery-pack',batteryId:pack.id}});
  }
  const tray=w.stock('drone-discard','tray',3.6,{label:'분리 부품 수거함',drop:{kind:'discard'},radius:.6});
  for (const [i,part] of s.discarded.slice(-6).entries()) {
    const art=w.art(String(part).includes('screw')?'screw':'blade','#6e786d'); art.scale.setScalar(.32); art.position.set((i%3-1)*.3,.18,Math.floor(i/3)*.25-.12); tray.object.add(art);
  }
  w.update();
}

export function configureRobotWorkshop(v,s,ui) {
  const w=v.workshop ||= new Workshop3D(v);
  w.reset(Boolean(ui.immersiveMode && s.status==='active'),(piece,target)=>placeRobotPart(s,piece,target).feedback.kind==='success');
  if (!w.active) return;
  const guide=robotGuide({...s,moduleChoice:ui.robotModule},ui.robotSelected), id=guide.current?.id || '';
  w.bind('robot-estop',v.stop,{label:s.estop?'본체 비상 정지 해제':'본체 비상 정지 누르기',action:{action:'robot-estop'},press:new THREE.Vector3(0,-.05,0),radius:.2,current:['robot-estop','robot-release-stop','robot-final-stop'].includes(id)});
  w.bind('robot-power',v.powerButton,{label:s.power?'본체 주 전원 끄기':'본체 주 전원 켜기',action:{action:'robot-power'},press:new THREE.Vector3(0,-.03,0),radius:.15,current:['robot-power-off','robot-test-power','robot-final-power'].includes(id)});
  w.bind('robot-battery',v.battery,{label:s.battery?'본체 배터리 · 집어서 분리':'빈 배터리 장착부',anchor:point(v.body,0,2.55,.96),radius:.4,
    piece:s.battery?{kind:'robot-battery'}:null,drop:{kind:'robot-battery-slot'},current:id==='robot-battery-out'});
  if (!s.supported) {
    w.stock('robot-stand','stand',-2,{label:'정비 받침대',piece:{kind:'robot-support'},current:id==='robot-support'});
    w.bind('robot-stand-slot',v.body,{label:'몸체 아래 받침대 설치 자리',anchor:point(v.body,0,1.2,0),radius:.65,drop:{kind:'robot-support-slot'}});
  }
  for (const p of ROBOT_LEGS) {
    const m=v.legs.get(p.id), l=s.legs[p.id];
    w.bind(`leg-${p.id}`,m.knee,{label:`${p.short}번 ${p.name} 관절 · 가까이 보기`,caption:p.short,action:{action:'robot-select-leg',leg:p.id},anchor:point(m.knee,p.x*.35,0,0),radius:.35,
      current:id.startsWith('robot-inspect-') && guide.current.legId===p.id && (!ui.robotZoomed || ui.robotSelected!==p.id || !l.inspected)});
    if (!robotDiagnosed(s) || ui.robotSelected!==p.id || l.verdict!=='replace') continue;
    w.bind(`module-${p.id}`,m.cartridge,{label:l.present?'관절 모듈 · 집어서 분리':'빈 관절 모듈 장착부',anchor:point(m.knee,p.x*.2,0,0),radius:.28,priority:2,
      piece:l.present&&l.source==='original'?{kind:'robot-mounted-module',legId:p.id}:null,drop:{kind:'robot-module-slot',legId:p.id},current:id.startsWith('robot-remove-')});
    w.bind(`connector-${p.id}`,m.connector,{label:l.connected?'관절 커넥터 분리':'관절 커넥터 연결',action:{action:'robot-connector'},press:new THREE.Vector3(p.x*(l.connected ? .2 : -.2),0,0),radius:.12,priority:5,current:id.startsWith('robot-disconnect-')||id.startsWith('robot-connect-')});
    for (const i of [0,1]) w.bind(`bolt-${p.id}-${i}`,m.bolts[i],{label:`관절 볼트 ${i+1} · 공구로 ${l.source==='new'?'체결':'분리'}`,anchor:point(m.knee,p.x*.43,.22,(i===0?-1:1)*.16),radius:.1,priority:6,
      drop:{kind:'robot-bolt',legId:p.id,index:i},turn:m.bolts[i],toolAxis:new THREE.Vector3(p.x,0,0),turnOffset:new THREE.Vector3(p.x*(l.source==='new'?-.1:.14),0,0)});
  }
  if (robotDiagnosed(s)&&!robotAssembled(s)) {
    w.stock('robot-driver','driver',-3,{label:'육각 공구',piece:{kind:'robot-driver'},current:id.startsWith('robot-unbolt-')||id.startsWith('robot-fasten-')});
    if (s.spareAvailable) w.stock('robot-spare','module',-.8,{label:`새 모듈 ${ui.robotModule}`,piece:{kind:'robot-module',moduleId:ui.robotModule},current:id.startsWith('robot-install-')&&ui.robotModule==='QJ-01'});
  }
  if (!s.battery) w.stock('robot-stored-battery','battery',1.2,{label:'분리한 배터리',piece:{kind:'robot-stored-battery'},current:id==='robot-battery-in'});
  const tray=w.stock('robot-discard','tray',3,{label:'분리 부품 수거함',drop:{kind:'robot-discard'}});
  const fault=s.legs[s.targetLeg];
  for(const i of [0,1]) if(fault.source==='new'||!fault.bolts[i]){const bolt=w.art('screw');bolt.scale.setScalar(.5);bolt.position.set(i===0?-.4:.4,.15,.2);tray.object.add(bolt);}
  if (!fault.present || fault.source==='new') { const module=w.art('module','#8e8e76');module.scale.setScalar(.6);module.position.set(0,.18,0);tray.object.add(module); }
  w.update();
}

export function renderSpatialScene(kind,s,ui) {
  const robot=kind==='robot', inspected=robot?s.legs[ui.robotSelected]:s.motors[ui.selected];
  const ready=robot?s.prepared:readyForMaintenance(s);
  const judging=ready && inspected.inspected && !inspected.verdict && (robot?ui.robotZoomed:ui.zoomed);
  const final=robot?robotAssembled(s)&&robotDiagnosed(s):ready&&!physicalIssues(s).length&&Object.values(s.motors).every(m=>m.verdict);
  let context='';
  if (judging) context=`<span class="eyebrow">가까이에서 관찰</span><h2>${robot?'관절 덮개':'프로펠러'}의 상태는 어떤가요?</h2><p>3D 모델의 균열·변형을 직접 살펴보세요.</p><div class="two-buttons">${button('정상',robot?'robot-healthy':'answer-healthy','button')}${button('교체 필요',robot?'robot-replace':'answer-replace','button')}</div>`;
  else if (final && robot) context=`<h2>교체 후 작동 확인</h2><p class="robot-test-status" role="status">${s.testing?'관절 시험 중…':s.tested?'네 다리 가상 시험 완료 ✓':'받침대를 유지하고 배터리·전원·비상 정지를 확인하세요.'}</p>${button(s.testing?'시험 중…':'관절 시험','robot-test','button full',robotCanTest(s)&&!s.testing&&!s.tested?'':'disabled')}${button('정비 완료','robot-complete','button primary full',s.tested&&s.estop&&!s.power?'':'disabled')}`;
  else if (final) context=`<h2>마지막으로 확인하세요</h2><div class="final-checks">${[['marks','기체·부품 표식 일치'],['count','날개·나사 누락 없음'],['fastening','모든 나사 체결 완료']].map(([key,label])=>`<label class="final-check-label"><input type="checkbox" data-input="final-check" data-check="${key}" ${s.checks[key]?'checked':''}>${label}</label>`).join('')}</div>${button('정비 완료','final','button primary full',Object.values(s.checks).every(Boolean)?'':'disabled')}`;
  const stock=robot?robotDiagnosed(s)&&!robotAssembled(s):ready;
  const selection=stock?robot?`<label>새 관절 모듈<select id="robot-module-type" data-input="robot-module-type" aria-label="새 관절 모듈 규격"><option value="QJ-01" ${ui.robotModule==='QJ-01'?'selected':''}>QJ-01 · 장착 규격</option><option value="QJ-02" ${ui.robotModule==='QJ-02'?'selected':''}>QJ-02 · 다른 규격</option></select></label>`:`<label>작업대의 새 부품 포장<select id="kit" data-input="kit" aria-label="새 부품 포장 선택">${KITS.map(k=>`<option value="${k.id}" ${ui.kitId===k.id?'selected':''}>${k.id} · ${k.marked?'Ⅱ 표식 있음':'표식 없음'}</option>`).join('')}</select></label>`:'';
  const guide=robot?robotGuide({...s,moduleChoice:ui.robotModule},ui.robotSelected):maintenanceGuide(s,ui);
  return `<section class="spatial-workbench" aria-label="${robot?'사족보행 로봇':'드론'} 3D 정비 작업대"><div class="immersive-stage"><div id="${robot?'robot':'drone'}-viewport" class="${robot?'robot':'drone'}-viewport"><span class="three-loading">3D 작업대를 준비하고 있습니다…</span></div><div id="task-guide-host" class="scene-guide">${renderTaskGuide(guide)}</div>${context?`<aside class="scene-context" aria-label="3D 관찰·확인" data-observation="${robot?inspected.condition:inspected.blades.some(b=>b.condition==='damaged')?'damaged':'healthy'}">${context}</aside>`:''}${selection?`<div class="scene-stock-choice">${selection}</div>`:''}<div class="scene-camera-tools">${button(`${icon('reset')} 전체 보기`,robot?'robot-view-all':'view-all','header-action')}</div><output class="scene-held-note" hidden></output><p class="scene-instructions">부품을 직접 클릭하거나 끌어 옮기세요 · 빈 곳을 끌어 시점 회전 · 휠 확대 · Esc 취소</p></div></section>`;
}
