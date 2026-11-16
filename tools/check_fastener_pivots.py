#!/usr/bin/env python3
"""Measure visible fastener centres through turning, not just invisible group origins."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--url',default='http://127.0.0.1:8000')
    parser.add_argument('--output',default='verification/fastener-pivots-2026-11-13')
    args=parser.parse_args();output=Path(args.output);output.mkdir(parents=True,exist_ok=True)
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,args=['--no-sandbox','--disable-gpu','--disable-dev-shm-usage'])
        try:
            page=browser.new_page(viewport={'width':1000,'height':800});page.clock.install();errors=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.goto(args.url+'/?compatible3d=1')
            page.evaluate('''async()=>{
                const {DroneViewport}=await import('/src/ui/drone3d.js');
                const {QuadrupedViewport}=await import('/src/ui/quadruped3d.js');
                const {createState}=await import('/src/domain/state.js');
                const {createRobotState}=await import('/src/domain/quadruped.js');
                const THREE=await import('/src/vendor/three/three.module.min.js');
                const hosts=[0,1].map(()=>{const h=document.createElement('div');h.style.cssText='position:fixed;left:-10000px;width:640px;height:480px';document.body.append(h);return h;});
                const drone=new DroneViewport({compatible:true,onSelect(){}}),robot=new QuadrupedViewport({compatible:true});
                drone.attach(hosts[0]);robot.attach(hosts[1]);await Promise.all([drone.modelReady,robot.modelReady]);
                if(!drone.portedDrone || !robot.portedRig)throw new Error('Detailed source hierarchy required');
                const q=window.pivotQA={drone,robot,hosts,THREE,createState,createRobotState,events:[]};
                for(const h of hosts)h.addEventListener('workshop-place',e=>q.events.push(e.detail));
                q.start=({kind,id,index,fasten})=>{
                    q.events=[];q.v=kind==='drone'?drone:robot;
                    let ui,body;
                    if(kind==='drone'){
                        const s=createState();s.power=false;s.battery=false;s.safetyConfirmed=true;
                        for(const m of Object.values(s.motors))m.inspected=true;
                        s.motors[id].screws[index].secured=!fasten;s.motors[id].screws[index].source=fasten?'new':'original';
                        ui={immersiveMode:true,selected:id,zoomed:true,kitId:'A1'};drone.sync(s,ui);body=drone.drone;
                        q.object=drone.motors.get(id).screws[index];q.destination='screw-'+id+'-'+index;q.driver='drone-driver';
                    }else{
                        const s=createRobotState({active:true,targetLeg:id});Object.assign(s,{power:false,estop:true,battery:false,supported:true,prepared:true});
                        for(const [leg,l] of Object.entries(s.legs)){l.inspected=true;l.verdict=leg===id?'replace':'healthy';}
                        Object.assign(s.legs[id],{connected:false,source:fasten?'new':'original',condition:fasten?'healthy':'damaged',bolts:fasten?[false,false]:[true,true]});
                        ui={immersiveMode:true,robotSelected:id,robotZoomed:true,robotModule:'QJ-01'};robot.sync(s,ui);body=robot.body;
                        q.object=robot.legs.get(id).bolts[index];q.destination='bolt-'+id+'-'+index;q.driver='robot-driver';
                    }
                    // Parent translation, yaw and non-uniform scale must not introduce an orbit.
                    body.position.set(.3,.2,-.4);body.rotation.y=.57;body.scale.set(1.1,.9,1.2);
                    (q.v.draw||q.v.render).call(q.v);
                    q.position=q.object.position.clone();q.rotation=q.object.quaternion.clone();
                    q.head=q.object.children[0];q.center=q.head.getWorldPosition(new THREE.Vector3());
                    q.axis=new THREE.Vector3(0,1,0).transformDirection(q.object.matrixWorld);
                    const w=q.v.workshop;w.pick(w.entries.find(e=>e.id===q.driver));w.place(w.entries.find(e=>e.id===q.destination));
                };
                q.sample=()=>{
                    const delta=q.head.getWorldPosition(new THREE.Vector3()).sub(q.center),translation=delta.length(),axial=delta.dot(q.axis);
                    const axis=new THREE.Vector3(0,1,0).transformDirection(q.object.matrixWorld);
                    return {translation,radial:delta.addScaledVector(q.axis,-axial).length(),axial,axisDrift:axis.angleTo(q.axis),
                        rotation:q.object.quaternion.angleTo(q.rotation),busy:q.v.workshop.busy,commits:q.events.length};
                };
            }''')
            results=[]
            for kind in ['drone','robot']:
                for leg in ['front-left','front-right','rear-left','rear-right']:
                    for index in [0,1]:
                        for fasten in [False,True]:
                            case={'kind':kind,'id':leg,'index':index,'fasten':fasten}
                            page.evaluate('(c)=>pivotQA.start(c)',case);samples=[]
                            for delta in [520,360,320,400,400,320]:
                                page.clock.fast_forward(delta);samples.append(page.evaluate('pivotQA.sample()'))
                            assert all(s['busy'] and s['commits']==0 for s in samples),case
                            assert max(s['radial'] for s in samples)<1e-6,(case,samples)
                            assert max(s['translation'] for s in samples)<1e-6,(case,samples)
                            assert max(s['axisDrift'] for s in samples)<1e-6,(case,samples)
                            assert max(s['rotation'] for s in samples)>.2,(case,samples)
                            page.clock.fast_forward(200);finished=page.evaluate('pivotQA.sample()')
                            assert not finished['busy'] and finished['commits']==1,(case,finished)
                            results.append({**case,'translationMax':max(s['translation'] for s in samples),'radialMax':max(s['radial'] for s in samples),'axisDriftMax':max(s['axisDrift'] for s in samples)})
            page.evaluate('(c)=>pivotQA.start(c)',{'kind':'drone','id':'rear-right','index':1,'fasten':True})
            page.clock.fast_forward(1200)
            cancelled=page.evaluate('''()=>{const q=pivotQA;q.v.workshop.cancel();q.v.render();return {position:q.object.position.distanceTo(q.position),rotation:q.object.quaternion.angleTo(q.rotation),commits:q.events.length};}''')
            assert cancelled['position']<1e-6 and cancelled['rotation']<1e-6 and cancelled['commits']==0,cancelled
            assert not errors,errors
            page.evaluate('pivotQA.drone.dispose();pivotQA.robot.dispose();pivotQA.hosts.forEach(h=>h.remove())')
            result={'cases':results,'cancelled':cancelled,'errors':errors}
            (output/'pivot-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
            print(f'PASS {len(results)} fastener cases: all centres stay on the shaft axis through removal and fastening; cancel restores pose')
        finally:browser.close()


if __name__=='__main__':main()
