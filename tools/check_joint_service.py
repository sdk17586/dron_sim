#!/usr/bin/env python3
"""Check fitted joint hardware and cancellable axial module animation in WebGL."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:8000')
    parser.add_argument('--output', default='verification/joint-service-2026-11-12/joints')
    args = parser.parse_args()
    output = Path(args.output); output.mkdir(parents=True, exist_ok=True)
    checks = []
    def passed(label):
        checks.append(label); print('PASS', label, flush=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-dev-shm-usage',
            '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        try:
            page = browser.new_page(viewport={'width':1440, 'height':1000})
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(args.url + '/')
            page.evaluate('''async () => {
                const {QuadrupedViewport}=await import('/src/ui/quadruped3d.js');
                const {createRobotState}=await import('/src/domain/quadruped.js');
                const THREE=await import('/src/vendor/three/three.module.min.js');
                const host=document.createElement('div');host.style.cssText='position:fixed;inset:0;z-index:9999';document.body.append(host);
                const v=new QuadrupedViewport();v.attach(host);
                const s=createRobotState({active:true,targetLeg:'front-left'});
                Object.assign(s,{supported:true,prepared:true,power:false,battery:false,estop:true});
                for(const [id,l] of Object.entries(s.legs))Object.assign(l,{inspected:true,verdict:id===s.targetLeg?'replace':'healthy'});
                const ui={immersiveMode:true,robotSelected:s.targetLeg,robotZoomed:true,robotModule:'QJ-01'};
                v.sync(s,ui);await v.modelReady;
                window.jointQA={v,s,ui,THREE,placed:[]};
                host.addEventListener('workshop-place',e=>jointQA.placed.push(e.detail));
            }''')
            fitted = page.evaluate('''() => {
                const {v,s,ui,THREE}=jointQA;
                const joints=[...v.legs].map(([id,m])=>{
                    const nodes=v.portedRig.joints.get(id),service=m.service;
                    const bolts=m.bolts.map(b=>b.getWorldPosition(new THREE.Vector3()));
                    return {id,coverAttached:service.panel.parent===nodes.module && m.crack.parent===nodes.module,ring:m.ring.visible,
                        span:bolts[0].distanceTo(bolts[1]),plug:m.connector.visible,
                        seamGap:Math.abs(service.panel.getWorldPosition(new THREE.Vector3()).distanceTo(service.anchor()))};
                });
                return {backend:v.canvas.dataset.renderBackend,source:v.canvas.dataset.modelSource,joints};
            }''')
            assert fitted['backend']=='webgl' and fitted['source']=='unitree-go2'
            assert all(j['coverAttached'] and not j['ring'] and .1<j['span']<.27 and j['seamGap']<.025 for j in fitted['joints'])
            assert [j['id'] for j in fitted['joints'] if j['plug']]==['front-left']
            page.screenshot(path=str(output/'joint-fitted-webgl.png'))
            passed('네 관절의 덮개·작은 볼트가 실제 모듈에 밀착, 큰 고리 제거·선택한 수리 관절만 커넥터 표시')
            moved = page.evaluate('''() => {
                const {v,s,ui,THREE}=jointQA;
                const relative=()=>[...v.legs].map(([id,m])=>v.portedRig.joints.get(id).module.worldToLocal(m.bolts[0].getWorldPosition(new THREE.Vector3())));
                const before=relative();
                v.setDrive({pose:{x:1.3,z:-.6,yaw:.8,phase:Math.PI/2},estop:false,boundary:false},true);
                const after=relative();
                const gaps=after.map((p,i)=>p.distanceTo(before[i]));
                v.sync(s,ui);ui.robotZoomed=false;v.sync(s,ui);
                const hidden=[...v.legs.values()].every(m=>!m.connector.visible);
                ui.robotZoomed=true;v.sync(s,ui);
                return {gaps,hidden};
            }''')
            assert max(moved['gaps'])<1e-5 and moved['hidden']
            passed('몸체 이동·회전·보행 중 덮개와 볼트의 관절 상대 위치 유지, 전체 보기에서는 커넥터 숨김')
            page.evaluate('''() => {
                const {v,s,ui}=jointQA,l=s.legs[s.targetLeg];l.connected=false;l.bolts=[false,false];v.sync(s,ui);
                const entry=v.workshop.entries.find(e=>e.id==='module-front-left');
                jointQA.start=entry.object.getWorldPosition(new jointQA.THREE.Vector3());jointQA.axis=entry.pullAxis();
                v.workshop.pick(entry);
            }''')
            page.wait_for_timeout(300)
            extraction = page.evaluate('''() => {
                const {v,start,axis,s}=jointQA,delta=v.workshop.held.ghost.position.clone().sub(start);
                const result={axial:delta.dot(axis),side:delta.clone().addScaledVector(axis,-delta.dot(axis)).length(),
                    recess:v.legs.get(s.targetLeg).service.recess.visible,present:s.legs[s.targetLeg].present,
                    damagedGhost:v.workshop.held.ghost.getObjectByName('qtrain-fracture').visible,
                    healthySpare:!v.portedRig.spareModule().getObjectByName('qtrain-fracture').visible};
                v.workshop.cancel();v.draw();result.restored=v.legs.get(s.targetLeg).cartridge.visible;return result;
            }''')
            assert .24<extraction['axial']<.26 and extraction['side']<1e-6
            assert extraction['recess'] and extraction['present'] and extraction['restored']
            assert extraction['damagedGhost'] and extraction['healthySpare']
            passed('분리 시 관절 축 방향으로 빠짐·안쪽 장착부 표시, 취소 시 원래 모듈·상태 복원')
            page.evaluate('''() => {
                const {v,s,ui}=jointQA;s.legs[s.targetLeg].present=false;v.sync(s,ui);
                const w=v.workshop;w.pick(w.entries.find(e=>e.id==='robot-spare'));
                const destination=w.entries.find(e=>e.id==='module-front-left');
                jointQA.seat=destination.seat();w.place(destination);
            }''')
            page.wait_for_timeout(220)
            page.evaluate('jointQA.v.workshop.cancel();jointQA.v.draw()')
            assert page.evaluate('!jointQA.s.legs[jointQA.s.targetLeg].present && jointQA.placed.length===0')
            passed('장착 도중 취소하면 빈 관절 유지·장착 완료 이벤트 없음')
            page.evaluate('''() => {
                const {v}=jointQA,w=v.workshop;w.pick(w.entries.find(e=>e.id==='robot-spare'));
                const draw=v.draw.bind(v);jointQA.samples=[];
                v.draw=()=>{if(w.busy && w.held)jointQA.samples.push({position:w.held.ghost.position.clone(),
                    quaternion:w.held.ghost.quaternion.clone(),scale:w.held.ghost.scale.clone()});draw();};
                w.place(w.entries.find(e=>e.id==='module-front-left'));
            }''')
            page.wait_for_function('() => jointQA.placed.length===1')
            insertion = page.evaluate('''() => {
                const {samples,seat,THREE}=jointQA,last=samples.at(-1),axis=jointQA.axis;
                const tail=samples.filter(sample=>sample.quaternion.angleTo(seat.quaternion)<1e-5);
                return {position:last.position.distanceTo(seat.position),rotation:last.quaternion.angleTo(seat.quaternion),
                    scale:last.scale.distanceTo(seat.scale),samples:tail.length,
                    lateral:Math.max(...tail.map(p=>{const d=p.position.clone().sub(seat.position);return d.addScaledVector(axis,-d.dot(axis)).length();}))};
            }''')
            assert insertion['position']<1e-5 and insertion['rotation']<1e-5 and insertion['scale']<1e-5
            assert insertion['samples']>=3 and insertion['lateral']<1e-5
            assert not errors, errors
            passed('새 모듈의 방향·크기 정렬 후 관절 축을 따라 장착, 마지막 프레임이 실제 장착 위치와 일치')
            page.evaluate('jointQA.v.dispose()')
            (output/'joint-results.json').write_text(json.dumps({'passed':len(checks),'checks':checks,
                'fitted':fitted,'movement':moved,'extraction':extraction,'insertion':insertion,'errors':errors},ensure_ascii=False,indent=2))
        finally:
            browser.close()


if __name__=='__main__':
    main()
