#!/usr/bin/env python3
"""Require current assets; failed or cancelled loads must leave no robot geometry."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:8000')
    parser.add_argument('--output', default='verification/current-models-2026-11-13/lifecycle')
    args = parser.parse_args()
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    checks = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'])
        try:
            for kind, asset, source in [('drone', 'x500', 'px4-x500'), ('robot', 'go2', 'unitree-go2')]:
                page = browser.new_page()
                # Isolate viewport ownership from the independently tested home previews.
                page.route('**/src/ui/home-equipment.js', lambda route: route.abort())
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                pattern = '**/assets/models/' + asset + '/*.glb'
                page.route(pattern, lambda route: route.abort())
                page.goto(args.url + '/?compatible3d=1')
                initial = page.evaluate('''async kind => {
                    const robot=kind==='robot';
                    const {DroneViewport}=await import('/src/ui/drone3d.js');
                    const {QuadrupedViewport}=await import('/src/ui/quadruped3d.js');
                    const {createState}=await import('/src/domain/state.js');
                    const {createRobotState}=await import('/src/domain/quadruped.js');
                    const host=document.createElement('div');host.style.cssText='position:fixed;inset:0;width:900px;height:600px';document.body.append(host);
                    const Class=robot?QuadrupedViewport:DroneViewport;
                    const v=new Class({compatible:true,onSelect(){}}),root=v.body||v.drone;
                    const state=robot?createRobotState({active:true,targetLeg:'front-left'}):createState();
                    const ui={immersiveMode:true,selected:'front-left',robotSelected:'front-left',zoomed:false,robotZoomed:false,kitId:'A1',robotModule:'QJ-01'};
                    v.attach(host);v.sync(state,ui);
                    const materials=()=>v.materials instanceof Set?v.materials.size:Object.keys(v.materials).length;
                    const snapshot=()=>({children:root.children.length,frames:(v.legs||v.motors).size,geometries:v.geometries.size,materials:materials(),workshop:Boolean(v.workshop?.active),status:v.canvas.dataset.modelStatus});
                    window.modelQA={v,host,root,Class,state,ui,snapshot,parts:Class.prototype.buildTeachingParts,saved:JSON.stringify(state)};
                    return snapshot();
                }''', kind)
                assert initial['children'] == initial['frames'] == 0 and not initial['workshop'], initial
                page.wait_for_function("()=>modelQA.v.canvas.dataset.modelStatus==='error'")
                failed = page.evaluate('()=>modelQA.snapshot()')
                assert failed['children'] == failed['frames'] == 0 and not failed['workshop'], failed
                assert failed['geometries'] == initial['geometries'] and failed['materials'] == initial['materials']
                assert page.locator('[data-model-retry]').is_visible()
                checks.append(kind + ': 로딩·요청 실패 시 기체/다리 형상과 조작부 없음')
                page.unroute(pattern)
                page.evaluate('''()=>{
                    const q=modelQA;
                    q.Class.prototype.buildTeachingParts=function(){q.parts.call(this);throw new Error('QA assembly interruption');};
                }''')
                page.locator('[data-model-retry]').click()
                page.wait_for_function("()=>modelQA.v.canvas.dataset.modelError==='QA assembly interruption'")
                interrupted = page.evaluate('()=>modelQA.snapshot()')
                assert interrupted == failed, {'failed': failed, 'interrupted': interrupted}
                checks.append(kind + ': 부분 조립 실패도 형상·할당 자원 정리')
                page.evaluate('()=>{modelQA.Class.prototype.buildTeachingParts=modelQA.parts;}')
                page.locator('[data-model-retry]').click()
                page.wait_for_function("()=>modelQA.v.canvas.dataset.modelStatus==='ready'")
                restored = page.evaluate('''()=>{
                    const q=modelQA;
                    return {...q.snapshot(),source:q.v.canvas.dataset.modelSource,preserved:q.saved===JSON.stringify(q.state),sameState:q.v.state===q.state};
                }''')
                assert restored['source'] == source and restored['frames'] == 4 and restored['workshop']
                assert restored['preserved'] and restored['sameState']
                page.screenshot(path=str(output / (kind + '-current-only.png')))
                checks.append(kind + ': 재시도 후 현재 모델·정비 조작 복원, 과제 상태 보존')
                cancelled = page.evaluate('''async()=>{
                    const q=modelQA,v=new q.Class({compatible:true,onSelect(){}}),root=v.body||v.drone;
                    v.dispose();await v.modelReady;
                    const result={children:root.children.length,frames:(v.legs||v.motors).size};
                    q.v.dispose();q.host.remove();return result;
                }''')
                assert cancelled == {'children': 0, 'frames': 0} and not errors, {'cancelled': cancelled, 'errors': errors}
                checks.append(kind + ': 로딩 중 화면 해제 후 늦게 도착한 모델을 생성하지 않음')
                page.close()
                delayed = browser.new_page()
                delayed.route('**/src/ui/home-equipment.js', lambda route: route.abort())
                delayed.clock.install()
                delayed.goto(args.url + '/?compatible3d=1')
                delayed.evaluate('''async kind=>{
                    const {DroneViewport}=await import('/src/ui/drone3d.js');
                    const {QuadrupedViewport}=await import('/src/ui/quadruped3d.js');
                    const {GLTFLoader}=await import('/src/vendor/three/GLTFLoader.js');
                    const load=GLTFLoader.prototype.loadAsync;let first=true;
                    GLTFLoader.prototype.loadAsync=function(...args){
                        if(first){first=false;return new Promise((resolve,reject)=>{window.rejectDelayedModel=reject;});}
                        return load.apply(this,args);
                    };
                    const Class=kind==='drone'?DroneViewport:QuadrupedViewport;
                    const v=new Class({compatible:true,onSelect(){}}),host=document.createElement('div');
                    host.style.cssText='position:fixed;inset:0;width:900px;height:600px';document.body.append(host);v.attach(host);
                    window.timeoutQA={v,Class,host};
                }''', kind)
                delayed.clock.run_for(8100)
                delayed.locator('[data-model-retry]').wait_for()
                assert delayed.evaluate("()=>timeoutQA.v.canvas.dataset.modelStatus==='error' && (timeoutQA.v.drone||timeoutQA.v.body).children.length===0")
                delayed.locator('[data-model-retry]').click()
                delayed.wait_for_function("()=>timeoutQA.v.canvas.dataset.modelStatus==='ready'")
                delayed.evaluate("()=>{rejectDelayedModel(new Error('QA late failure'));}")
                requests = []
                delayed.on('request', lambda request: requests.append(request.url) if '.glb' in request.url else None)
                cached = delayed.evaluate('''async()=>{
                    const q=timeoutQA,v=new q.Class({compatible:true,onSelect(){}});await v.modelReady;
                    const source=v.canvas.dataset.modelSource;v.dispose();q.v.dispose();q.host.remove();return source;
                }''')
                assert cached == source and not requests
                checks.append(kind + ': 8초 시간 초과 후 새 요청으로 복구·늦은 실패가 새 모델 캐시를 제거하지 않음')
                delayed.close()
            for check in checks:
                print('PASS', check, flush=True)
            (output / 'lifecycle-results.json').write_text(json.dumps({'passed': len(checks), 'checks': checks}, ensure_ascii=False, indent=2))
        finally:
            browser.close()


if __name__ == '__main__':
    main()
